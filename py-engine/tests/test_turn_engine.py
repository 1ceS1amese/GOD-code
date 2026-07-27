import threading

from collections.abc import Iterator

import pytest

from god_code_engine.api.god_code_api_models import (
    AssistantMessage,
    PromptMessage,
    ToolCall,
    ToolCatalogEntry,
    ValidationError,
)
from god_code_engine.engine.turn_engine import TurnEngine
from god_code_engine.models.base import (
    AssistantDelta,
    AssistantMessageAction,
    ModelAction,
    ModelAdapter,
    ModelRequest,
    ModelStreamEvent,
    StreamingModelAdapter,
    ToolCallBatchAction,
    ToolCallAction,
)
from god_code_engine.models.fake import FakeModelAdapter
from god_code_engine.providers.config import ProviderConfig
from god_code_engine.providers.http_client import HttpProviderClient
from god_code_engine.providers.real_adapter import RealProviderModelAdapter
from god_code_engine.session.manager import SessionState
from god_code_engine.tools.scheduler import ToolConcurrencyPolicy, ToolScheduler
from god_code_engine.transcripts.in_memory import InMemoryTranscriptStore
from god_code_engine.types import JsonMapping


class CancelAfterDeltaAdapter(StreamingModelAdapter):
    name = "cancel-after-delta"

    def __init__(self, cancel_event: threading.Event) -> None:
        self._cancel_event = cancel_event

    def next_action(self, request: ModelRequest) -> AssistantMessageAction:
        del request
        return AssistantMessageAction(
            message=AssistantMessage(role="assistant", content="final")
        )

    def stream_actions(self, request: ModelRequest) -> Iterator[ModelStreamEvent]:
        del request
        yield AssistantDelta(text="partial")
        self._cancel_event.set()
        yield AssistantMessageAction(
            message=AssistantMessage(role="assistant", content="final")
        )


class ProviderContextHttpClient(HttpProviderClient):
    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        del request, config
        return {
            "kind": "assistant",
            "content": "hello",
            "provider_context": {
                "provider_name": "openai-responses",
                "items": [{"type": "message"}],
            },
        }


class BatchModelAdapter(ModelAdapter):
    name = "batch"

    def __init__(self, tool_calls: list[ToolCall]) -> None:
        self._tool_calls = tool_calls

    def next_action(self, request: ModelRequest) -> ModelAction:
        last_message = request.messages[-1] if request.messages else {}
        if last_message.get("kind") == "user":
            return ToolCallBatchAction(tool_calls=self._tool_calls)
        return AssistantMessageAction(
            message=AssistantMessage(role="assistant", content="batch complete")
        )


class SingleToolModelAdapter(ModelAdapter):
    name = "single-tool"

    def __init__(self, call: ToolCall) -> None:
        self._call = call

    def next_action(self, request: ModelRequest) -> ModelAction:
        del request
        return ToolCallAction(tool_call=self._call)


def make_session(tool_name: str, model_adapter=None) -> SessionState:
    return make_session_with_tools([tool_name], model_adapter=model_adapter)


def make_session_with_tools(tool_names: list[str], model_adapter=None) -> SessionState:
    return SessionState(
        session_id="s1",
        cwd=".",
        tool_catalog=[
            ToolCatalogEntry(name=tool_name, description=tool_name.lower())
            for tool_name in tool_names
        ],
        model_adapter_name="fake",
        model_adapter=model_adapter or FakeModelAdapter(),
        transcript_store=InMemoryTranscriptStore(),
    )


def run_turn(tool_name: str, prompt: str, requester, turn_options=None):
    events = []
    engine = TurnEngine(scheduler=ToolScheduler(requester), emit_event=events.append)
    result = engine.run_turn(
        session=make_session(tool_name),
        turn_id="t1",
        prompt=PromptMessage(role="user", content=prompt),
        cancel_event=threading.Event(),
        turn_options=turn_options,
    )
    return result, events


def ok_requester(expected_tool_name: str, output):
    def requester(method, params, timeout_s):
        assert method == "execute_tool"
        assert params["tool_name"] == expected_tool_name
        assert timeout_s == 15.0
        return {"ok": True, "output": output}

    return requester


def error_requester(code: str, message: str):
    def requester(method, params, timeout_s):
        del method, params, timeout_s
        return {"ok": False, "error": {"code": code, "message": message}}

    return requester


def unused_requester(method, params, timeout_s):
    del method, params, timeout_s
    raise AssertionError("Tool requester should not be called.")


def event_types(events) -> list[str]:
    return [event.event_type for event in events]


def tool_call(
    tool_call_id: str,
    tool_name: str,
    input_payload: JsonMapping | None = None,
) -> ToolCall:
    return ToolCall(
        tool_call_id=tool_call_id,
        tool_name=tool_name,
        input=dict(input_payload or {"path": f"{tool_call_id}.txt"}),
    )


def successful_output(tool_name: str, tool_call_id: str):
    if tool_name == "Read":
        return {"path": f"{tool_call_id}.txt", "content": f"content:{tool_call_id}"}
    if tool_name == "ListFiles":
        return {"path": ".", "entries": [{"path": f"{tool_call_id}.txt", "type": "file"}]}
    if tool_name == "Search":
        return {
            "path": ".",
            "matches": [{"path": f"{tool_call_id}.txt", "line_number": 1, "line": "match"}],
        }
    if tool_name == "Write":
        return {"path": f"{tool_call_id}.txt", "bytes": 1, "overwritten": False}
    return {}


def test_turn_engine_runs_read_flow() -> None:
    result, events = run_turn(
        "Read",
        "read fixture.txt",
        ok_requester("Read", {"path": "fixture.txt", "content": "hello"}),
    )

    assert result.status == "success"
    assert result.assistant_message is not None
    assert "hello" in result.assistant_message.content
    assert event_types(events) == [
        "turn_started",
        "tool_call_requested",
        "tool_result_received",
        "assistant_message",
        "turn_finished",
    ]
    assert [event.sequence for event in events] == [1, 2, 3, 4, 5]


def test_turn_engine_resets_event_sequence_for_each_run() -> None:
    events = []
    engine = TurnEngine(
        scheduler=ToolScheduler(ok_requester("Read", {"path": "fixture.txt", "content": "hello"})),
        emit_event=events.append,
    )

    for turn_id in ("t1", "t2"):
        result = engine.run_turn(
            session=make_session("Read"),
            turn_id=turn_id,
            prompt=PromptMessage(role="user", content="read fixture.txt"),
            cancel_event=threading.Event(),
        )
        assert result.status == "success"

    assert [event.sequence for event in events] == [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]


def test_turn_engine_emits_assistant_delta_when_streaming() -> None:
    result, events = run_turn(
        "Read",
        "read fixture.txt",
        ok_requester("Read", {"path": "fixture.txt", "content": "hello"}),
        turn_options={"stream": True},
    )

    assert result.status == "success"
    assert result.assistant_message is not None
    assert event_types(events) == [
        "turn_started",
        "tool_call_requested",
        "tool_result_received",
        "assistant_delta",
        "assistant_message",
        "turn_finished",
    ]
    assert events[3].payload["delta"] == {"text": result.assistant_message.content}


def test_turn_engine_cancels_streaming_before_first_event() -> None:
    events = []
    cancel_event = threading.Event()
    cancel_event.set()
    engine = TurnEngine(scheduler=ToolScheduler(unused_requester), emit_event=events.append)

    result = engine.run_turn(
        session=make_session("Read"),
        turn_id="t1",
        prompt=PromptMessage(role="user", content="read fixture.txt"),
        cancel_event=cancel_event,
        turn_options={"stream": True},
    )

    assert result.status == "cancelled"
    assert event_types(events) == ["turn_started", "turn_finished"]


def test_turn_engine_cancels_streaming_after_delta() -> None:
    events = []
    cancel_event = threading.Event()
    adapter = CancelAfterDeltaAdapter(cancel_event)
    engine = TurnEngine(scheduler=ToolScheduler(unused_requester), emit_event=events.append)

    result = engine.run_turn(
        session=make_session("Read", model_adapter=adapter),
        turn_id="t1",
        prompt=PromptMessage(role="user", content="read fixture.txt"),
        cancel_event=cancel_event,
        turn_options={"stream": True},
    )

    assert result.status == "cancelled"
    assert event_types(events) == ["turn_started", "assistant_delta", "turn_finished"]
    assert events[1].payload["delta"] == {"text": "partial"}


def test_turn_engine_emits_error_on_tool_failure() -> None:
    result, events = run_turn(
        "Read",
        "read missing.txt",
        error_requester("file_not_found", "missing"),
    )

    assert result.status == "error"
    assert result.error is not None
    assert result.error.code == "file_not_found"
    assert event_types(events) == [
        "turn_started",
        "tool_call_requested",
        "tool_result_received",
        "god_code_error",
        "turn_finished",
    ]


def test_turn_engine_runs_list_files_flow() -> None:
    result, _events = run_turn(
        "ListFiles",
        "list .",
        ok_requester("ListFiles", {"path": ".", "entries": [{"path": "README.md", "type": "file"}]}),
    )

    assert result.status == "success"
    assert result.assistant_message is not None
    assert "1" in result.assistant_message.content


def test_turn_engine_runs_search_flow() -> None:
    result, _events = run_turn(
        "Search",
        "search README.md ::: GOD-code",
        ok_requester(
            "Search",
            {
                "path": "README.md",
                "matches": [{"path": "README.md", "line_number": 1, "line": "GOD-code"}],
            },
        ),
    )

    assert result.status == "success"
    assert result.assistant_message is not None
    assert "1" in result.assistant_message.content


def test_turn_engine_runs_write_flow() -> None:
    result, _events = run_turn(
        "Write",
        "write fixture.txt ::: hello",
        ok_requester("Write", {"path": "fixture.txt", "bytes": 5, "overwritten": False}),
    )

    assert result.status == "success"
    assert result.assistant_message is not None
    assert "5" in result.assistant_message.content


def test_turn_engine_finishes_cancelled_on_tool_cancelled_result() -> None:
    result, events = run_turn(
        "Bash",
        "bash sleep 10",
        error_requester("tool_cancelled", "cancelled"),
    )

    assert result.status == "cancelled"
    assert event_types(events) == [
        "turn_started",
        "tool_call_requested",
        "tool_result_received",
        "turn_finished",
    ]


def test_turn_engine_keeps_permission_denied_as_error() -> None:
    result, events = run_turn(
        "Read",
        "read secret.txt",
        error_requester("permission_denied", "denied"),
    )

    assert result.status == "error"
    assert result.error is not None
    assert result.error.code == "permission_denied"
    assert event_types(events) == [
        "turn_started",
        "tool_call_requested",
        "tool_result_received",
        "god_code_error",
        "turn_finished",
    ]


def test_turn_engine_records_tool_call_id_on_tool_result_messages() -> None:
    session = make_session("Read")
    events = []
    engine = TurnEngine(
        scheduler=ToolScheduler(ok_requester("Read", {"path": "fixture.txt", "content": "hello"})),
        emit_event=events.append,
    )

    result = engine.run_turn(
        session=session,
        turn_id="t1",
        prompt=PromptMessage(role="user", content="read fixture.txt"),
        cancel_event=threading.Event(),
    )

    assert result.status == "success"
    tool_call_message = session.messages[1]
    tool_result_message = session.messages[2]
    tool_call = tool_call_message["tool_call"]
    assert isinstance(tool_call, dict)
    assert tool_result_message["tool_call_id"] == tool_call["tool_call_id"]
    transcript_result = session.transcript_store.list_entries("s1")[2]
    assert transcript_result["tool_call_id"] == tool_call["tool_call_id"]


def test_turn_engine_runs_parallel_safe_tool_batch_concurrently() -> None:
    tool_calls = [
        tool_call("call-read", "Read"),
        tool_call("call-search", "Search", {"path": ".", "pattern": "match"}),
        tool_call("call-list", "ListFiles", {"path": "."}),
    ]
    adapter = BatchModelAdapter(tool_calls)
    session = make_session_with_tools(["Read", "Search", "ListFiles"], model_adapter=adapter)
    events = []
    started: list[str] = []

    def requester(method, params, timeout_s):
        assert method == "execute_tools"
        assert timeout_s == 15.0
        started.extend(str(call["tool_call_id"]) for call in params["tool_calls"])
        return {"results": [
            {
                "ok": True,
                "output": successful_output(str(call["tool_name"]), str(call["tool_call_id"])),
            }
            for call in params["tool_calls"]
        ]}

    engine = TurnEngine(
        scheduler=ToolScheduler(requester, batch_request_supported=True),
        emit_event=events.append,
    )

    result = engine.run_turn(
        session=session,
        turn_id="t1",
        prompt=PromptMessage(role="user", content="run batch"),
        cancel_event=threading.Event(),
    )

    assert result.status == "success"
    assert result.assistant_message is not None
    assert result.assistant_message.content == "batch complete"
    assert set(started) == {"call-read", "call-search", "call-list"}
    assert event_types(events) == [
        "turn_started",
        "tool_call_requested",
        "tool_call_requested",
        "tool_call_requested",
        "tool_result_received",
        "tool_result_received",
        "tool_result_received",
        "assistant_message",
        "turn_finished",
    ]
    result_events = [event for event in events if event.event_type == "tool_result_received"]
    assert [event.payload["tool_call_id"] for event in result_events] == [
        "call-read",
        "call-search",
        "call-list",
    ]
    assert [event.payload["batch_index"] for event in result_events] == [0, 1, 2]
    assert [event.payload["batch_size"] for event in result_events] == [3, 3, 3]
    assert [event.payload["execution_mode"] for event in result_events] == [
        "parallel",
        "parallel",
        "parallel",
    ]
    assert [event.payload["scheduler_plan"] for event in result_events] == [
        "dependency_graph",
        "dependency_graph",
        "dependency_graph",
    ]
    assert [event.payload["scheduler_wave"] for event in result_events] == [0, 0, 0]
    assert [event.payload["scheduler_wave_size"] for event in result_events] == [3, 3, 3]
    assert [event.payload["dependency_count"] for event in result_events] == [0, 0, 0]
    assert [message["kind"] for message in session.messages] == [
        "user",
        "tool_call",
        "tool_call",
        "tool_call",
        "tool_result",
        "tool_result",
        "tool_result",
        "assistant",
    ]
    assert [message["tool_call_id"] for message in session.messages[4:7]] == [
        "call-read",
        "call-search",
        "call-list",
    ]


@pytest.mark.parametrize(
    "response",
    [
        {"results": [{"ok": True}, {"ok": True}], "extension": object()},
        {"results": [{"ok": True}, {"ok": True, "extension": object()}]},
    ],
)
def test_tool_scheduler_rejects_malformed_batch_response_atomically(
    response: dict[str, object],
) -> None:
    calls = [tool_call("read", "Read"), tool_call("search", "Search")]
    scheduler = ToolScheduler(
        lambda _method, _params, _timeout: response,
        batch_request_supported=True,
    )

    with pytest.raises(ValidationError):
        scheduler.execute_many("session", "turn", calls)


@pytest.mark.parametrize(
    "session_id, turn_id, calls",
    [
        (" ", "turn", [tool_call("read", "Read")]),
        ("session", " ", [tool_call("read", "Read")]),
        ("session", "turn", []),
        (
            "session",
            "turn",
            [tool_call("duplicate", "Read"), tool_call("duplicate", "Search")],
        ),
    ],
)
def test_tool_scheduler_rejects_invalid_outbound_batch_before_request(
    session_id: str,
    turn_id: str,
    calls: list[ToolCall],
) -> None:
    requests = 0

    def requester(_method, _params, _timeout):
        nonlocal requests
        requests += 1
        return {"results": []}

    scheduler = ToolScheduler(requester, batch_request_supported=True)

    with pytest.raises(ValidationError):
        scheduler.execute_many(session_id, turn_id, calls)
    assert requests == 0


def test_turn_engine_falls_back_to_concurrent_execute_tool_requests_for_legacy_host() -> None:
    calls = [
        tool_call("read", "Read"),
        tool_call("search", "Search", {"path": ".", "pattern": "match"}),
    ]
    adapter = BatchModelAdapter(calls)
    session = make_session_with_tools(["Read", "Search"], model_adapter=adapter)
    started: list[str] = []
    lock = threading.Lock()
    all_started = threading.Event()

    def requester(method, params, timeout_s):
        assert method == "execute_tool"
        assert timeout_s == 15.0
        with lock:
            started.append(str(params["tool_call_id"]))
            if len(started) == len(calls):
                all_started.set()
        assert all_started.wait(1.0), "legacy fallback requests did not run concurrently"
        return {
            "ok": True,
            "output": successful_output(str(params["tool_name"]), str(params["tool_call_id"])),
        }

    result = TurnEngine(
        scheduler=ToolScheduler(requester, batch_request_supported=False),
        emit_event=lambda event: None,
    ).run_turn(
        session=session,
        turn_id="t1",
        prompt=PromptMessage(role="user", content="run batch"),
        cancel_event=threading.Event(),
    )

    assert result.status == "success"
    assert set(started) == {"read", "search"}


def test_turn_engine_batch_keeps_serial_only_tools_out_of_parallel_waves() -> None:
    tool_calls = [
        tool_call("read-1", "Read"),
        tool_call("search-1", "Search", {"path": ".", "pattern": "match"}),
        tool_call("write-1", "Write", {"path": "fixture.txt", "content": "x"}),
        tool_call("read-2", "Read"),
        tool_call("list-1", "ListFiles", {"path": "."}),
    ]
    adapter = BatchModelAdapter(tool_calls)
    session = make_session_with_tools(["Read", "Search", "Write", "ListFiles"], model_adapter=adapter)
    events = []

    def requester(method, params, timeout_s):
        del timeout_s
        if method == "execute_tools":
            return {"results": [
                {
                    "ok": True,
                    "output": successful_output(str(call["tool_name"]), str(call["tool_call_id"])),
                }
                for call in params["tool_calls"]
            ]}
        return {
            "ok": True,
            "output": successful_output(str(params["tool_name"]), str(params["tool_call_id"])),
        }

    engine = TurnEngine(
        scheduler=ToolScheduler(requester, batch_request_supported=True),
        emit_event=events.append,
    )

    result = engine.run_turn(
        session=session,
        turn_id="t1",
        prompt=PromptMessage(role="user", content="run batch"),
        cancel_event=threading.Event(),
    )

    assert result.status == "success"
    requested_events = [event for event in events if event.event_type == "tool_call_requested"]
    assert [event.payload["tool_call"]["tool_call_id"] for event in requested_events] == [
        "read-1",
        "search-1",
        "write-1",
        "read-2",
        "list-1",
    ]
    assert [event.payload["execution_mode"] for event in requested_events] == [
        "parallel",
        "parallel",
        "serial",
        "parallel",
        "parallel",
    ]
    assert [event.payload["scheduler_wave"] for event in requested_events] == [
        0,
        0,
        1,
        2,
        2,
    ]


def test_tool_scheduler_dependency_graph_limits_parallel_wave_size() -> None:
    scheduler = ToolScheduler(
        unused_requester,
        concurrency_policy=ToolConcurrencyPolicy(max_parallel=2),
    )
    calls = [
        tool_call("read-1", "Read", {"path": "a.txt"}),
        tool_call("read-2", "Read", {"path": "b.txt"}),
        tool_call("search-1", "Search", {"path": "src", "pattern": "TODO"}),
    ]

    plan = scheduler.plan_execution(calls)

    assert plan.waves == [[0, 1], [2]]
    assert plan.execution_modes(scheduler.max_parallel) == ["parallel", "parallel", "serial"]
    assert plan.edges == []


def test_tool_scheduler_splits_batches_at_negotiated_host_limit() -> None:
    batch_sizes: list[int] = []
    serial_ids: list[str] = []

    def requester(method, params, timeout_s):
        assert timeout_s == 15.0
        if method == "execute_tools":
            batch_sizes.append(len(params["tool_calls"]))
            return {"results": [
                {"ok": True, "output": {"id": call["tool_call_id"]}}
                for call in params["tool_calls"]
            ]}
        assert method == "execute_tool"
        serial_ids.append(str(params["tool_call_id"]))
        return {"ok": True, "output": {"id": params["tool_call_id"]}}

    scheduler = ToolScheduler(
        requester,
        concurrency_policy=ToolConcurrencyPolicy(max_parallel=2),
        batch_request_supported=True,
    )
    calls = [tool_call(f"read-{index}", "Read", {"path": f"{index}.txt"}) for index in range(5)]

    results = scheduler.execute_many("session", "turn", calls)

    assert batch_sizes == [2, 2]
    assert serial_ids == ["read-4"]
    assert [result.tool_call.tool_call_id for result in results] == [f"read-{index}" for index in range(5)]


def test_tool_scheduler_dependency_graph_keeps_serial_only_tools_as_barriers() -> None:
    scheduler = ToolScheduler(unused_requester)
    calls = [
        tool_call("read-1", "Read", {"path": "a.txt"}),
        tool_call("write-1", "Write", {"path": "b.txt", "content": "x"}),
        tool_call("read-2", "Read", {"path": "c.txt"}),
    ]

    plan = scheduler.plan_execution(calls)

    assert plan.waves == [[0], [1], [2]]
    assert plan.execution_modes(scheduler.max_parallel) == ["serial", "serial", "serial"]
    assert [(edge.before_index, edge.after_index, edge.reason) for edge in plan.edges] == [
        (0, 1, "serial_only"),
        (1, 2, "serial_only"),
    ]


def test_tool_scheduler_dependency_graph_conservatively_handles_malformed_inputs() -> None:
    scheduler = ToolScheduler(unused_requester)
    calls = [
        tool_call("bad-read", "Read", {"path": 123}),
        tool_call("good-read", "Read", {"path": "README.md"}),
    ]

    plan = scheduler.plan_execution(calls)

    assert plan.waves == [[0], [1]]
    assert plan.execution_modes(scheduler.max_parallel) == ["serial", "serial"]
    assert [(edge.before_index, edge.after_index, edge.reason) for edge in plan.edges] == [
        (0, 1, "serial_only")
    ]


def test_tool_scheduler_dependency_graph_adds_resource_conflict_edges() -> None:
    scheduler = ToolScheduler(
        unused_requester,
        concurrency_policy=ToolConcurrencyPolicy(
            parallel_safe_tool_names=frozenset({"Read", "Write"}),
        ),
    )
    calls = [
        tool_call("write-1", "Write", {"path": "src/a.txt", "content": "x"}),
        tool_call("read-1", "Read", {"path": "src/a.txt"}),
        tool_call("read-2", "Read", {"path": "src/b.txt"}),
    ]

    plan = scheduler.plan_execution(calls)

    assert plan.waves == [[0, 2], [1]]
    assert [(edge.before_index, edge.after_index, edge.reason) for edge in plan.edges] == [
        (0, 1, "resource_conflict")
    ]


def test_turn_engine_batch_chooses_first_failure_in_model_order() -> None:
    tool_calls = [
        tool_call("first", "Read"),
        tool_call("second", "Search", {"path": ".", "pattern": "match"}),
    ]
    adapter = BatchModelAdapter(tool_calls)
    session = make_session_with_tools(["Read", "Search"], model_adapter=adapter)
    events = []

    def requester(method, params, timeout_s):
        assert method == "execute_tools"
        del timeout_s
        return {"results": [
            {
                "ok": False,
                "error": {
                    "code": "first_failed" if call["tool_call_id"] == "first" else "second_failed",
                    "message": "failed",
                },
            }
            for call in params["tool_calls"]
        ]}

    engine = TurnEngine(
        scheduler=ToolScheduler(requester, batch_request_supported=True),
        emit_event=events.append,
    )

    result = engine.run_turn(
        session=session,
        turn_id="t1",
        prompt=PromptMessage(role="user", content="run batch"),
        cancel_event=threading.Event(),
    )

    assert result.status == "error"
    assert result.error is not None
    assert result.error.code == "first_failed"
    result_events = [event for event in events if event.event_type == "tool_result_received"]
    assert [event.payload["tool_call_id"] for event in result_events] == ["first", "second"]


def test_turn_engine_batch_finishes_cancelled_on_tool_cancelled_result() -> None:
    tool_calls = [
        tool_call("read", "Read"),
        tool_call("search", "Search", {"path": ".", "pattern": "match"}),
    ]
    adapter = BatchModelAdapter(tool_calls)
    session = make_session_with_tools(["Read", "Search"], model_adapter=adapter)
    events = []

    def requester(method, params, timeout_s):
        assert method == "execute_tools"
        del timeout_s
        return {"results": [
            {"ok": False, "error": {"code": "tool_cancelled", "message": "cancelled"}}
            for _ in params["tool_calls"]
        ]}

    engine = TurnEngine(
        scheduler=ToolScheduler(requester, batch_request_supported=True),
        emit_event=events.append,
    )

    result = engine.run_turn(
        session=session,
        turn_id="t1",
        prompt=PromptMessage(role="user", content="run batch"),
        cancel_event=threading.Event(),
    )

    assert result.status == "cancelled"
    assert event_types(events) == [
        "turn_started",
        "tool_call_requested",
        "tool_call_requested",
        "tool_result_received",
        "tool_result_received",
        "turn_finished",
    ]


def test_turn_engine_rejects_empty_tool_batch() -> None:
    adapter = BatchModelAdapter([])
    session = make_session_with_tools(["Read"], model_adapter=adapter)
    events = []
    engine = TurnEngine(scheduler=ToolScheduler(unused_requester), emit_event=events.append)

    result = engine.run_turn(
        session=session,
        turn_id="t1",
        prompt=PromptMessage(role="user", content="run empty batch"),
        cancel_event=threading.Event(),
    )

    assert result.status == "error"
    assert result.error is not None
    assert result.error.code == "invalid_action"
    assert event_types(events) == ["turn_started", "god_code_error", "turn_finished"]


def test_turn_engine_rejects_duplicate_tool_call_ids_before_scheduling() -> None:
    adapter = BatchModelAdapter([
        tool_call("duplicate", "Read"),
        tool_call("duplicate", "Read", {"path": "other.txt"}),
    ])
    session = make_session_with_tools(["Read"], model_adapter=adapter)
    events = []
    requested = False

    def requester(method, params, timeout_s):
        nonlocal requested
        del method, params, timeout_s
        requested = True
        raise AssertionError("duplicate batch must not reach the Host")

    engine = TurnEngine(scheduler=ToolScheduler(requester), emit_event=events.append)

    result = engine.run_turn(
        session=session,
        turn_id="t1",
        prompt=PromptMessage(role="user", content="run duplicate batch"),
        cancel_event=threading.Event(),
    )

    assert result.status == "error"
    assert result.error is not None
    assert result.error.code == "invalid_action"
    assert "duplicate tool_call_id" in result.error.message
    assert requested is False
    assert event_types(events) == ["turn_started", "god_code_error", "turn_finished"]


def test_turn_engine_rejects_invalid_custom_adapter_tool_identity_before_scheduling() -> None:
    invalid_call = tool_call("call", "UnknownTool", {})
    session = make_session_with_tools(
        ["Read"],
        model_adapter=SingleToolModelAdapter(invalid_call),
    )
    events = []
    engine = TurnEngine(scheduler=ToolScheduler(unused_requester), emit_event=events.append)

    result = engine.run_turn(
        session=session,
        turn_id="t1",
        prompt=PromptMessage(role="user", content="run invalid tool"),
        cancel_event=threading.Event(),
    )

    assert result.status == "error"
    assert result.error is not None
    assert result.error.code == "invalid_action"
    assert event_types(events) == ["turn_started", "god_code_error", "turn_finished"]


def test_turn_engine_rejects_non_json_custom_adapter_tool_input_before_scheduling() -> None:
    cyclic_input: dict[str, object] = {}
    cyclic_input["self"] = cyclic_input
    invalid_inputs = [
        {"value": object()},
        {"value": float("nan")},
        cyclic_input,
    ]

    for invalid_input in invalid_inputs:
        with pytest.raises(ValidationError, match="JSON object"):
            ToolCall(
                tool_call_id="call",
                tool_name="Read",
                input=invalid_input,
            )


def test_turn_engine_records_provider_context_from_provider_adapter() -> None:
    adapter = RealProviderModelAdapter(
        config=ProviderConfig(name="demo", model="demo-model", api_key_env="DEMO_API_KEY"),
        client=ProviderContextHttpClient(),
    )
    session = make_session("Read", model_adapter=adapter)
    events = []
    engine = TurnEngine(scheduler=ToolScheduler(unused_requester), emit_event=events.append)

    result = engine.run_turn(
        session=session,
        turn_id="t1",
        prompt=PromptMessage(role="user", content="hello"),
        cancel_event=threading.Event(),
    )

    assert result.status == "success"
    assert session.provider_context == {
        "provider_name": "openai-responses",
        "items": [{"type": "message"}],
    }
    assert session.transcript_store.list_entries("s1")[1] == {
        "type": "provider_context",
        "turn_id": "t1",
        "provider_context": {
            "provider_name": "openai-responses",
            "items": [{"type": "message"}],
        },
    }
