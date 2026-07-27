from __future__ import annotations

import threading
from typing import Callable, Protocol, runtime_checkable

from god_code_engine.api.god_code_api_models import (
    AssistantMessage,
    GodCodeEventEnvelope,
    PromptMessage,
    ToolCall,
    ToolExecutionError,
    TurnResult,
    build_tool_error,
    is_json_object,
)
from god_code_engine.models.base import (
    AssistantDelta,
    AssistantMessageAction,
    ModelAction,
    StreamingModelAdapter,
    ToolCallBatchAction,
    ToolCallAction,
)
from god_code_engine.prompting.builder import PromptBuilder
from god_code_engine.session.manager import SessionState
from god_code_engine.tools.scheduler import ToolScheduler
from god_code_engine.types import JsonMapping, JsonObject

EventSink = Callable[[GodCodeEventEnvelope], None]


@runtime_checkable
class ProviderContextSource(Protocol):
    def pop_provider_context(self) -> JsonObject | None:
        raise NotImplementedError


class TurnCancelled(Exception):
    """Internal control-flow signal for cooperative turn cancellation."""


class TurnEngine:
    def __init__(
        self,
        scheduler: ToolScheduler,
        emit_event: EventSink,
        prompt_builder: PromptBuilder | None = None,
        max_steps: int = 8,
    ) -> None:
        self._scheduler = scheduler
        self._emit_event = emit_event
        self._prompt_builder = prompt_builder or PromptBuilder()
        self._max_steps = max_steps
        self._event_sequence = 0

    def run_turn(
        self,
        session: SessionState,
        turn_id: str,
        prompt: PromptMessage,
        cancel_event: threading.Event,
        turn_options: JsonMapping | None = None,
    ) -> TurnResult:
        self._event_sequence = 0
        session.messages.append(
            {
                "kind": "user",
                "role": prompt.role,
                "content": prompt.content,
            }
        )
        session.transcript_store.append(
            session.session_id,
            {"type": "user", "turn_id": turn_id, "message": prompt.to_dict()},
        )
        self._emit("turn_started", session.session_id, turn_id, {})

        steps = 0
        try:
            while steps < self._max_steps:
                if cancel_event.is_set():
                    return self._finish_cancelled(session.session_id, turn_id)

                action = self._next_model_action(
                    session,
                    turn_id,
                    turn_options or {},
                    cancel_event,
                )
                self._capture_provider_context(session, turn_id)

                if isinstance(action, AssistantMessageAction):
                    return self._finish_success(
                        session=session,
                        turn_id=turn_id,
                        assistant_message=action.message,
                    )

                if isinstance(action, ToolCallAction):
                    tool_call = action.tool_call
                    validation_error = self._validate_tool_calls(session, [tool_call])
                    if validation_error is not None:
                        self._emit_error(session.session_id, turn_id, validation_error)
                        return self._finish_error(session.session_id, turn_id, validation_error)
                    self._record_tool_call(session, turn_id, tool_call)
                    self._emit(
                        "tool_call_requested",
                        session.session_id,
                        turn_id,
                        {
                            "tool_call": tool_call.to_dict(),
                            "execution_mode": self._scheduler.execution_mode,
                        },
                    )
                    result = self._scheduler.execute(session.session_id, turn_id, tool_call)
                    self._record_tool_result(session, turn_id, tool_call, result.to_dict())
                    self._emit_tool_result(session.session_id, turn_id, tool_call, result.to_dict())

                    if cancel_event.is_set():
                        return self._finish_cancelled(session.session_id, turn_id)

                    if not result.ok:
                        error = result.error or build_tool_error(
                            "tool_failed", f"{tool_call.tool_name} failed without an error payload."
                        )
                        if error.code == "tool_cancelled":
                            return self._finish_cancelled(session.session_id, turn_id)
                        self._emit_error(session.session_id, turn_id, error)
                        return self._finish_error(session.session_id, turn_id, error)

                    steps += 1
                    continue

                if isinstance(action, ToolCallBatchAction):
                    batch_result = self._run_tool_call_batch(
                        session=session,
                        turn_id=turn_id,
                        action=action,
                        cancel_event=cancel_event,
                        step_index=steps,
                    )
                    if batch_result is not None:
                        return batch_result
                    steps += 1
                    continue

                error = build_tool_error("invalid_action", "Model returned an unknown action type.")
                self._emit_error(session.session_id, turn_id, error)
                return self._finish_error(session.session_id, turn_id, error)

            error = build_tool_error(
                "step_limit_exceeded",
                f"Turn exceeded max step count ({self._max_steps}).",
            )
            self._emit_error(session.session_id, turn_id, error)
            return self._finish_error(session.session_id, turn_id, error)
        except TurnCancelled:
            return self._finish_cancelled(session.session_id, turn_id)
        except Exception as exc:  # noqa: BLE001
            error = build_tool_error("engine_exception", str(exc))
            self._emit_error(session.session_id, turn_id, error)
            return self._finish_error(session.session_id, turn_id, error)

    def _next_model_action(
        self,
        session: SessionState,
        turn_id: str,
        turn_options: JsonMapping,
        cancel_event: threading.Event,
    ) -> ModelAction:
        request = self._prompt_builder.build(session=session, turn_options=turn_options)
        adapter = session.model_adapter
        if cancel_event.is_set():
            raise TurnCancelled

        if request.options.stream and isinstance(adapter, StreamingModelAdapter):
            for event in adapter.stream_actions(request):
                if cancel_event.is_set():
                    raise TurnCancelled

                if isinstance(event, AssistantDelta):
                    self._emit(
                        "assistant_delta",
                        session.session_id,
                        turn_id,
                        {"delta": event.to_dict()},
                    )
                    if cancel_event.is_set():
                        raise TurnCancelled
                    continue

                if cancel_event.is_set():
                    raise TurnCancelled
                return event
            raise RuntimeError("Streaming model did not return a final action.")

        return adapter.next_action(request)

    def _run_tool_call_batch(
        self,
        session: SessionState,
        turn_id: str,
        action: ToolCallBatchAction,
        cancel_event: threading.Event,
        step_index: int,
    ) -> TurnResult | None:
        tool_calls = action.tool_calls
        if not tool_calls:
            error = build_tool_error("invalid_action", "Model returned an empty tool call batch.")
            self._emit_error(session.session_id, turn_id, error)
            return self._finish_error(session.session_id, turn_id, error)

        validation_error = self._validate_tool_calls(session, tool_calls)
        if validation_error is not None:
            self._emit_error(session.session_id, turn_id, validation_error)
            return self._finish_error(session.session_id, turn_id, validation_error)

        batch_id = f"{turn_id}:tool_batch:{step_index}"
        batch_size = len(tool_calls)
        plan = self._scheduler.plan_execution(tool_calls)
        planned_modes = plan.execution_modes(self._scheduler.max_parallel)

        for index, tool_call in enumerate(tool_calls):
            metadata = self._batch_metadata(
                batch_id,
                index,
                batch_size,
                planned_modes[index],
                scheduler_plan=plan.plan_name,
                scheduler_wave=plan.wave_index_for(index),
                scheduler_wave_size=self._wave_size_for(plan.waves, index),
                dependency_count=plan.dependency_count_for(index),
            )
            self._record_tool_call(session, turn_id, tool_call)
            self._emit(
                "tool_call_requested",
                session.session_id,
                turn_id,
                {
                    "tool_call": tool_call.to_dict(),
                    **metadata,
                },
            )

        scheduled_results = self._scheduler.execute_many(
            session.session_id,
            turn_id,
            tool_calls,
            cancel_event=cancel_event,
        )
        if len(scheduled_results) != len(tool_calls):
            raise RuntimeError("ToolScheduler.execute_many returned an incomplete result set.")

        for index, scheduled in enumerate(scheduled_results):
            metadata = self._batch_metadata(
                batch_id,
                index,
                batch_size,
                scheduled.execution_mode,
                scheduler_plan=scheduled.scheduler_plan,
                scheduler_wave=scheduled.scheduler_wave,
                scheduler_wave_size=scheduled.scheduler_wave_size,
                dependency_count=scheduled.dependency_count,
            )
            result_payload = scheduled.result.to_dict()
            self._record_tool_result(session, turn_id, scheduled.tool_call, result_payload)
            self._emit_tool_result(
                session.session_id,
                turn_id,
                scheduled.tool_call,
                result_payload,
                metadata,
            )

        if cancel_event.is_set():
            return self._finish_cancelled(session.session_id, turn_id)

        for scheduled in scheduled_results:
            if scheduled.result.ok:
                continue
            error = scheduled.result.error or build_tool_error(
                "tool_failed",
                f"{scheduled.tool_call.tool_name} failed without an error payload.",
            )
            if error.code == "tool_cancelled":
                return self._finish_cancelled(session.session_id, turn_id)
            self._emit_error(session.session_id, turn_id, error)
            return self._finish_error(session.session_id, turn_id, error)

        return None

    def _validate_tool_calls(
        self,
        session: SessionState,
        tool_calls: list[ToolCall],
    ) -> ToolExecutionError | None:
        allowed_tool_names = {tool.name for tool in session.tool_catalog}
        seen_ids: set[str] = set()
        for tool_call in tool_calls:
            if not isinstance(tool_call.tool_call_id, str) or not tool_call.tool_call_id.strip():
                return build_tool_error(
                    "invalid_action",
                    "Model returned an empty tool_call_id.",
                )
            if tool_call.tool_call_id in seen_ids:
                return build_tool_error(
                    "invalid_action",
                    "Model returned duplicate tool_call_id values in one batch.",
                )
            seen_ids.add(tool_call.tool_call_id)
            if not isinstance(tool_call.tool_name, str) or not tool_call.tool_name.strip():
                return build_tool_error(
                    "invalid_action",
                    "Model returned an empty tool name.",
                )
            if tool_call.tool_name not in allowed_tool_names:
                return build_tool_error(
                    "invalid_action",
                    f"Model returned unknown tool: {tool_call.tool_name}",
                )
            if not is_json_object(tool_call.input):
                return build_tool_error(
                    "invalid_action",
                    "Model returned a tool input that is not a JSON-safe object.",
                )
        return None

    def _record_tool_call(
        self,
        session: SessionState,
        turn_id: str,
        tool_call: ToolCall,
    ) -> None:
        session.messages.append(
            {
                "kind": "tool_call",
                "tool_call": tool_call.to_dict(),
            }
        )
        session.transcript_store.append(
            session.session_id,
            {"type": "tool_call", "turn_id": turn_id, "tool_call": tool_call.to_dict()},
        )

    def _record_tool_result(
        self,
        session: SessionState,
        turn_id: str,
        tool_call: ToolCall,
        result_payload: JsonObject,
    ) -> None:
        session.messages.append(
            {
                "kind": "tool_result",
                "tool_call_id": tool_call.tool_call_id,
                "tool_name": tool_call.tool_name,
                "result": result_payload,
            }
        )
        session.transcript_store.append(
            session.session_id,
            {
                "type": "tool_result",
                "turn_id": turn_id,
                "tool_call_id": tool_call.tool_call_id,
                "tool_name": tool_call.tool_name,
                "result": result_payload,
            },
        )

    def _emit_tool_result(
        self,
        session_id: str,
        turn_id: str,
        tool_call: ToolCall,
        result_payload: JsonObject,
        metadata: JsonObject | None = None,
    ) -> None:
        self._emit(
            "tool_result_received",
            session_id,
            turn_id,
            {
                "tool_call_id": tool_call.tool_call_id,
                "tool_name": tool_call.tool_name,
                "result": result_payload,
                **(metadata or {}),
            },
        )

    def _batch_metadata(
        self,
        batch_id: str,
        batch_index: int,
        batch_size: int,
        execution_mode: str,
        *,
        scheduler_plan: str | None = None,
        scheduler_wave: int | None = None,
        scheduler_wave_size: int | None = None,
        dependency_count: int | None = None,
    ) -> JsonObject:
        metadata: JsonObject = {
            "batch_id": batch_id,
            "batch_index": batch_index,
            "batch_size": batch_size,
            "execution_mode": execution_mode,
        }
        if scheduler_plan is not None:
            metadata["scheduler_plan"] = scheduler_plan
        if scheduler_wave is not None:
            metadata["scheduler_wave"] = scheduler_wave
        if scheduler_wave_size is not None:
            metadata["scheduler_wave_size"] = scheduler_wave_size
        if dependency_count is not None:
            metadata["dependency_count"] = dependency_count
        return metadata

    def _wave_size_for(self, waves: list[list[int]], index: int) -> int | None:
        for wave in waves:
            if index in wave:
                return len(wave)
        return None

    def _finish_success(
        self,
        session: SessionState,
        turn_id: str,
        assistant_message: AssistantMessage,
    ) -> TurnResult:
        session.messages.append(
            {
                "kind": "assistant",
                "role": assistant_message.role,
                "content": assistant_message.content,
            }
        )
        session.transcript_store.append(
            session.session_id,
            {"type": "assistant", "turn_id": turn_id, "message": assistant_message.to_dict()},
        )
        self._emit(
            "assistant_message",
            session.session_id,
            turn_id,
            {"message": assistant_message.to_dict()},
        )
        result = TurnResult(status="success", assistant_message=assistant_message)
        self._emit("turn_finished", session.session_id, turn_id, result.to_dict())
        return result

    def _capture_provider_context(self, session: SessionState, turn_id: str) -> None:
        adapter = session.model_adapter
        if not isinstance(adapter, ProviderContextSource):
            return
        provider_context = adapter.pop_provider_context()
        if provider_context is None:
            return
        session.provider_context = provider_context
        session.transcript_store.append(
            session.session_id,
            {
                "type": "provider_context",
                "turn_id": turn_id,
                "provider_context": provider_context,
            },
        )

    def _finish_error(
        self, session_id: str, turn_id: str, error: ToolExecutionError
    ) -> TurnResult:
        result = TurnResult(status="error", error=error)
        self._emit("turn_finished", session_id, turn_id, result.to_dict())
        return result

    def _finish_cancelled(self, session_id: str, turn_id: str) -> TurnResult:
        result = TurnResult(status="cancelled")
        self._emit("turn_finished", session_id, turn_id, result.to_dict())
        return result

    def _emit_error(self, session_id: str, turn_id: str, error: ToolExecutionError) -> None:
        self._emit("god_code_error", session_id, turn_id, {"error": error.to_dict()})

    def _emit(
        self, event_type: str, session_id: str, turn_id: str | None, payload: JsonObject
    ) -> None:
        self._event_sequence += 1
        self._emit_event(
            GodCodeEventEnvelope(
                event_type=event_type,
                session_id=session_id,
                turn_id=turn_id,
                payload=dict(payload),
                sequence=self._event_sequence,
            )
        )
