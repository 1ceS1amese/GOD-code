from __future__ import annotations

from god_code_engine.api.god_code_api_models import (
    AssistantMessage,
    ToolCall,
    ToolCatalogEntry,
    ValidationError,
    require_dict,
    require_list,
    require_str,
)
from god_code_engine.models.base import (
    AssistantMessageAction,
    ModelAction,
    ToolCallBatchAction,
    ToolCallAction,
)
from god_code_engine.providers.base import ProviderResponseError, ProviderResponseNormalizer
from god_code_engine.types import JsonMapping


class SimpleProviderResponseNormalizer(ProviderResponseNormalizer):
    def normalize(self, raw: JsonMapping) -> ModelAction:
        try:
            kind = raw.get("kind")
            if kind == "assistant":
                return AssistantMessageAction(
                    message=AssistantMessage(
                        role="assistant",
                        content=require_str(raw, "content"),
                    )
                )

            if kind == "tool_call":
                return ToolCallAction(
                    tool_call=ToolCall(
                        tool_call_id=require_str(raw, "tool_call_id"),
                        tool_name=require_str(raw, "tool_name"),
                        input=require_dict(raw.get("input"), "input"),
                    )
                )

            if kind == "tool_call_batch":
                return ToolCallBatchAction(
                    tool_calls=_parse_tool_call_batch(raw),
                )

            raise ProviderResponseError(f"Unsupported provider response kind: {kind!r}")
        except ValidationError as exc:
            raise ProviderResponseError(str(exc)) from exc


def _parse_tool_call_batch(raw: JsonMapping) -> list[ToolCall]:
    entries = require_list(raw, "tool_calls")
    if not entries:
        raise ProviderResponseError("tool_calls must be a non-empty list.")

    tool_calls: list[ToolCall] = []
    seen_ids: set[str] = set()
    for index, entry in enumerate(entries):
        mapping = require_dict(entry, f"tool_calls[{index}]")
        tool_call_id = require_str(mapping, "tool_call_id")
        if tool_call_id in seen_ids:
            raise ProviderResponseError(f"Duplicate provider tool_call_id: {tool_call_id}")
        seen_ids.add(tool_call_id)
        tool_calls.append(
            ToolCall(
                tool_call_id=tool_call_id,
                tool_name=require_str(mapping, "tool_name"),
                input=require_dict(mapping.get("input"), "input"),
            )
        )
    return tool_calls


def validate_tool_call_against_catalog(
    action: ModelAction,
    tools: list[ToolCatalogEntry],
) -> ModelAction:
    if isinstance(action, AssistantMessageAction):
        return action

    tool_names = {tool.name for tool in tools}
    if isinstance(action, ToolCallBatchAction):
        for tool_call in action.tool_calls:
            if tool_call.tool_name not in tool_names:
                raise ProviderResponseError(f"Provider returned unknown tool: {tool_call.tool_name}")
        return action

    tool_name = action.tool_call.tool_name
    if tool_name not in tool_names:
        raise ProviderResponseError(f"Provider returned unknown tool: {tool_name}")

    return action
