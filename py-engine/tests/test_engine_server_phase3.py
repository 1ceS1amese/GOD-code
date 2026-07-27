import io
import json
import os
import queue
import subprocess
import sys
import threading
from pathlib import Path

import pytest

import god_code_engine.api.god_code_engine_server as engine_server_module
from god_code_engine.api.god_code_api_models import (
    ValidationError,
    parse_initial_messages,
    parse_prompt_message,
    parse_tool_catalog,
    parse_turn_options,
)
from god_code_engine.api.god_code_engine_server import (
    GodCodeEngineServer,
    JSON_RPC_MAX_LINE_BYTES,
    JSON_RPC_MAX_PENDING_REQUESTS,
    JSON_RPC_MAX_REQUEST_ID,
    JSON_RPC_SETTLED_HISTORY_LIMIT,
    JSON_RPC_MAX_TIMEOUT_S,
    JSON_RPC_MIN_TIMEOUT_S,
    JsonRpcConnection,
    JsonRpcRequestError,
    PendingResponse,
    parse_json_rpc_error,
    parse_json_rpc_result,
    is_json_rpc_id,
    is_json_rpc_method,
    is_json_rpc_outbound_message,
    require_json_rpc_params,
    require_json_rpc_timeout,
)
from god_code_engine.session.manager import SessionError
from god_code_engine.transcripts.jsonl import JsonlTranscriptStore


class FakeConnection:
    def __init__(self) -> None:
        self.handlers = {}
        self.notifications = []
        self.stopped = False

    def register_request_handler(self, method, handler):
        self.handlers[method] = handler

    def notify(self, method, params):
        self.notifications.append((method, params))

    def stop(self):
        self.stopped = True


def create_session_params(model_adapter: str = "fake", session_id: str = "s1"):
    return {
        "session_id": session_id,
        "cwd": ".",
        "tool_catalog": [{"name": "Read", "description": "read"}],
        "model_adapter": model_adapter,
    }


def initialize_params(
    protocol_version: str = "2.0", capabilities: dict[str, object] | None = None
) -> dict[str, object]:
    return {
        "protocol_version": protocol_version,
        "host_info": {"name": "test-host", "version": "0.1.0"},
        "capabilities": capabilities or {},
    }


def initialized_server(connection: FakeConnection) -> GodCodeEngineServer:
    server = GodCodeEngineServer(connection)
    server.handle_initialize(initialize_params())
    return server


def test_parse_json_rpc_error_validates_wire_contract() -> None:
    error = parse_json_rpc_error(
        {"code": -32001, "message": "remote failed", "data": {"retryable": False}}
    )
    assert error.code == -32001
    assert str(error) == "remote failed"
    assert error.data == {"retryable": False}

    for payload in [
        None,
        {"code": True, "message": "failed"},
        {"code": "-32001", "message": "failed"},
        {"code": -32001, "message": " "},
        {"code": -32001, "message": "failed", "data": object()},
        {"code": -32001, "message": "failed", "extension": object()},
    ]:
        malformed = parse_json_rpc_error(payload)
        assert malformed.code == -32603
        assert str(malformed) == "Invalid JSON-RPC error response payload."


def test_parse_json_rpc_result_requires_json_object() -> None:
    assert parse_json_rpc_result({"result": {"value": 1}}) == {"value": 1}

    for response in [
        {},
        {"result": None},
        {"result": []},
        {"result": "value"},
        {"result": {"value": object()}},
        {"result": {}, "error": {"code": -32000, "message": "failed"}},
    ]:
        with pytest.raises(
            JsonRpcRequestError,
            match="Invalid JSON-RPC success response payload",
        ) as error:
            parse_json_rpc_result(response)
        assert error.value.code == -32603


def test_json_rpc_response_payload_parsers_return_owned_plain_snapshots() -> None:
    class SnapshotPayload(dict):
        def __init__(self, **values) -> None:
            super().__init__(**values)
            self.reads = 0

        def items(self):
            self.reads += 1
            if self.reads > 1:
                raise RuntimeError("dynamic response payload changed")
            return super().items()

    result_source = SnapshotPayload(nested={"count": 1})
    result = parse_json_rpc_result({"result": result_source})
    result_source["nested"]["count"] = 2

    error_source = SnapshotPayload(
        code=-32042,
        message="remote failed",
        data={"nested": {"count": 1}},
    )
    error = parse_json_rpc_error(error_source)
    error_source["data"]["nested"]["count"] = 2

    assert result == {"nested": {"count": 1}}
    assert result["nested"] is not result_source["nested"]
    assert result_source.reads == 1
    assert error.code == -32042
    assert error.data == {"nested": {"count": 1}}
    assert error.data is not error_source["data"]
    assert error_source.reads == 1


def test_json_rpc_method_and_id_identity_contract() -> None:
    assert is_json_rpc_method("echo") is True
    assert is_json_rpc_method(" ") is False
    assert is_json_rpc_id(1) is True
    for value in [True, 0, -1, 1.5, 9_007_199_254_740_992]:
        assert is_json_rpc_id(value) is False

    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)
    calls = 0

    def handler(_params):
        nonlocal calls
        calls += 1
        return {}

    connection.register_request_handler("echo", handler)
    for message in [
        {"jsonrpc": "2.0", "id": True, "method": "echo", "params": {}},
        {"jsonrpc": "2.0", "id": 0, "method": "echo", "params": {}},
        {"jsonrpc": "2.0", "id": 1.5, "method": "echo", "params": {}},
        {"jsonrpc": "2.0", "id": 1, "method": " ", "params": {}},
    ]:
        connection._dispatch_line(json.dumps(message))
    assert calls == 0
    assert output.getvalue() == ""


def test_json_rpc_request_handler_unregister_preserves_replacement_owner() -> None:
    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)
    unregister_first = connection.register_request_handler(
        "owned", lambda _params: {"owner": "first"}
    )
    unregister_second = connection.register_request_handler(
        "owned", lambda _params: {"owner": "second"}
    )

    unregister_first()
    unregister_first()
    connection._dispatch_line(
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": "owned", "params": {}})
    )

    unregister_second()
    unregister_second()
    connection._dispatch_line(
        json.dumps({"jsonrpc": "2.0", "id": 2, "method": "owned", "params": {}})
    )

    responses = [json.loads(line) for line in output.getvalue().splitlines()]
    assert responses == [
        {"jsonrpc": "2.0", "id": 1, "result": {"owner": "second"}},
        {
            "jsonrpc": "2.0",
            "id": 2,
            "error": {"code": -32601, "message": "Method not found: owned"},
        },
    ]
    assert "owned" not in connection._request_handlers


def test_json_rpc_stop_disposes_registries_and_rejects_registration() -> None:
    connection = JsonRpcConnection(
        io.StringIO(), io.StringIO(), protocol_diagnostic=lambda _message: None
    )
    unregister_request = connection.register_request_handler(
        "request", lambda _params: {}
    )
    unsubscribe_notification = connection.register_notification_handler(
        "notification", lambda _params: None
    )
    assert len(connection._request_handlers) == 1
    assert len(connection._notification_handlers) == 1
    connection._record_settled_request(1, "completed")

    connection.stop()

    assert connection._request_handlers == {}
    assert connection._notification_handlers == {}
    assert connection._settled_requests == {}
    assert connection._next_id is None
    assert connection._protocol_diagnostic is None
    unregister_request()
    unregister_request()
    unsubscribe_notification()
    unsubscribe_notification()
    with pytest.raises(JsonRpcRequestError, match="JSON-RPC connection stopped"):
        connection.register_request_handler("late", lambda _params: {})
    with pytest.raises(JsonRpcRequestError, match="JSON-RPC connection stopped"):
        connection.register_notification_handler("late", lambda _params: None)


def test_json_rpc_stop_rejects_pending_and_future_requests() -> None:
    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    sent = threading.Event()
    connection._send_message = (  # type: ignore[method-assign]
        lambda _message, **_kwargs: sent.set()
    )
    failures = []

    def request() -> None:
        try:
            connection.request("pending", {}, 60.0)
        except Exception as exc:  # noqa: BLE001
            failures.append(exc)

    thread = threading.Thread(target=request)
    thread.start()
    assert sent.wait(timeout=1.0)
    assert len(connection._pending) == 1

    connection.stop()
    thread.join(timeout=1.0)

    assert not thread.is_alive()
    assert connection._pending == {}
    assert len(failures) == 1
    assert isinstance(failures[0], JsonRpcRequestError)
    assert failures[0].code == -32000
    assert str(failures[0]) == "JSON-RPC connection stopped."
    next_id = connection._next_id
    with pytest.raises(
        JsonRpcRequestError, match="JSON-RPC connection stopped"
    ) as error:
        connection.request("after_stop", {}, 60.0)
    assert error.value.code == -32000
    assert connection._next_id == next_id


def test_json_rpc_reader_eof_terminalizes_connection_and_pending_requests() -> None:
    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    connection.register_request_handler("request", lambda _params: {})
    connection.register_notification_handler("notification", lambda _params: None)
    sent = threading.Event()
    connection._send_message = (  # type: ignore[method-assign]
        lambda _message, **_kwargs: sent.set()
    )
    failures = []

    def request() -> None:
        try:
            connection.request("pending", {}, 60.0)
        except Exception as exc:  # noqa: BLE001
            failures.append(exc)

    thread = threading.Thread(target=request)
    thread.start()
    assert sent.wait(timeout=1.0)

    connection.serve_forever()
    thread.join(timeout=1.0)

    assert connection._stop_event.is_set()
    assert connection._pending == {}
    assert connection._request_handlers == {}
    assert connection._notification_handlers == {}
    assert not thread.is_alive()
    assert len(failures) == 1
    assert isinstance(failures[0], JsonRpcRequestError)
    assert str(failures[0]) == "JSON-RPC connection stopped."


def test_json_rpc_reader_dispatch_failure_still_terminalizes_connection() -> None:
    connection = JsonRpcConnection(io.StringIO("{}\n"), io.StringIO())
    connection.register_request_handler("request", lambda _params: {})

    def fail_dispatch(_line):
        raise RuntimeError("dispatch failed")

    connection._dispatch_line = fail_dispatch  # type: ignore[method-assign]
    with pytest.raises(RuntimeError, match="dispatch failed"):
        connection.serve_forever()

    assert connection._stop_event.is_set()
    assert connection._request_handlers == {}


def test_json_rpc_stop_blocks_public_outbound_frames_but_allows_responses() -> None:
    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)

    connection.stop()

    with pytest.raises(
        JsonRpcRequestError, match="JSON-RPC connection stopped"
    ) as notification_error:
        connection.notify("late", {})
    assert notification_error.value.code == -32000
    with pytest.raises(
        JsonRpcRequestError, match="JSON-RPC connection stopped"
    ) as request_error:
        connection.request("late", {}, 1.0)
    assert request_error.value.code == -32000
    assert output.getvalue() == ""

    connection._send_message({"jsonrpc": "2.0", "id": 1, "result": {"ok": True}})
    assert json.loads(output.getvalue()) == {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {"ok": True},
    }


@pytest.mark.parametrize("failure_stage", ["write", "flush"])
def test_json_rpc_writer_failure_terminalizes_connection(failure_stage: str) -> None:
    class FailingOutput(io.StringIO):
        def write(self, value: str) -> int:
            if failure_stage == "write":
                raise OSError("writer failed")
            return super().write(value)

        def flush(self) -> None:
            if failure_stage == "flush":
                raise OSError("writer failed")
            super().flush()

    waiter: queue.Queue = queue.Queue(maxsize=1)
    connection = JsonRpcConnection(io.StringIO(), FailingOutput())
    connection.register_request_handler("request", lambda _params: {})
    connection.register_notification_handler("notification", lambda _params: None)
    connection._pending[7] = PendingResponse(waiter=waiter)

    with pytest.raises(OSError, match="writer failed"):
        connection.notify("event", {})

    assert connection._stop_event.is_set()
    assert connection._pending == {}
    assert connection._request_handlers == {}
    assert connection._notification_handlers == {}
    response = waiter.get_nowait()
    assert response == {
        "jsonrpc": "2.0",
        "id": 7,
        "error": {"code": -32000, "message": "writer failed"},
    }
    with pytest.raises(JsonRpcRequestError, match="writer failed"):
        connection.notify("after_failure", {})


def test_json_rpc_reader_failure_propagates_terminal_cause_to_pending() -> None:
    class FailingInput(io.StringIO):
        def readline(self, _size: int = -1) -> str:
            raise OSError("reader failed")

    connection = JsonRpcConnection(FailingInput(), io.StringIO())
    sent = threading.Event()
    connection._send_message = (  # type: ignore[method-assign]
        lambda _message, **_kwargs: sent.set()
    )
    failures = []

    def request() -> None:
        try:
            connection.request("pending", {}, 60.0)
        except Exception as exc:  # noqa: BLE001
            failures.append(exc)

    thread = threading.Thread(target=request)
    thread.start()
    assert sent.wait(timeout=1.0)

    with pytest.raises(OSError, match="reader failed"):
        connection.serve_forever()
    thread.join(timeout=1.0)

    assert not thread.is_alive()
    assert len(failures) == 1
    assert isinstance(failures[0], JsonRpcRequestError)
    assert failures[0].code == -32000
    assert str(failures[0]) == "reader failed"
    assert str(connection._terminal_error) == "reader failed"
    with pytest.raises(JsonRpcRequestError, match="reader failed") as request_handler_error:
        connection.register_request_handler("late", lambda _params: {})
    assert request_handler_error.value.code == -32000
    with pytest.raises(
        JsonRpcRequestError, match="reader failed"
    ) as notification_handler_error:
        connection.register_notification_handler("late", lambda _params: None)
    assert notification_handler_error.value.code == -32000
    connection.stop(RuntimeError("later failure"))
    assert str(connection._terminal_error) == "reader failed"


def test_json_rpc_structured_terminal_error_preserves_code_and_data() -> None:
    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    waiter: queue.Queue = queue.Queue(maxsize=1)
    connection._pending[9] = PendingResponse(waiter=waiter)
    terminal = JsonRpcRequestError(
        -32042, "structured terminal failure", {"source": "transport"}
    )

    connection.stop(terminal)

    response = waiter.get_nowait()
    assert response == {
        "jsonrpc": "2.0",
        "id": 9,
        "error": {
            "code": -32042,
            "message": "structured terminal failure",
            "data": {"source": "transport"},
        },
    }
    for operation in [
        lambda: connection.request("late", {}, 1.0),
        lambda: connection.notify("late", {}),
        lambda: connection.register_request_handler("late", lambda _params: {}),
        lambda: connection.register_notification_handler(
            "late", lambda _params: None
        ),
    ]:
        with pytest.raises(JsonRpcRequestError) as error:
            operation()
        assert error.value.code == -32042
        assert str(error.value) == "structured terminal failure"
        assert error.value.data == {"source": "transport"}


def test_json_rpc_terminal_error_data_is_snapshot_isolated() -> None:
    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    waiter: queue.Queue = queue.Queue(maxsize=1)
    second_waiter: queue.Queue = queue.Queue(maxsize=1)
    connection._pending[10] = PendingResponse(waiter=waiter)
    connection._pending[12] = PendingResponse(waiter=second_waiter)
    source_data = {"details": ["first"]}

    connection.stop(JsonRpcRequestError(-32042, "terminal snapshot", source_data))
    source_data["details"].append("source mutation")

    response = waiter.get_nowait()
    assert response["error"]["data"] == {"details": ["first"]}
    response["error"]["data"]["details"].append("waiter mutation")
    assert second_waiter.get_nowait()["error"]["data"] == {"details": ["first"]}

    with pytest.raises(JsonRpcRequestError) as first_error:
        connection.request("late", {}, 1.0)
    assert first_error.value.data == {"details": ["first"]}
    first_error.value.data["details"].append("caller mutation")

    with pytest.raises(JsonRpcRequestError) as second_error:
        connection.notify("late", {})
    assert second_error.value.data == {"details": ["first"]}


def test_json_rpc_terminal_error_normalizes_non_wire_safe_fields() -> None:
    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    waiter: queue.Queue = queue.Queue(maxsize=1)
    connection._pending[11] = PendingResponse(waiter=waiter)
    cyclic_data: list[object] = []
    cyclic_data.append(cyclic_data)

    connection.stop(
        JsonRpcRequestError(2**53, "invalid structured terminal", cyclic_data)
    )

    assert waiter.get_nowait() == {
        "jsonrpc": "2.0",
        "id": 11,
        "error": {"code": -32000, "message": "invalid structured terminal"},
    }
    with pytest.raises(JsonRpcRequestError) as error:
        connection.notify("late", {})
    assert error.value.code == -32000
    assert str(error.value) == "invalid structured terminal"
    assert error.value.data is None


def test_json_rpc_terminal_cause_precedes_post_stop_argument_validation() -> None:
    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    connection.stop(
        JsonRpcRequestError(-32042, "terminal precedence", {"phase": 477})
    )

    operations = [
        lambda: connection.request(" ", [], 0),  # type: ignore[arg-type]
        lambda: connection.notify(" ", []),  # type: ignore[arg-type]
        lambda: connection.register_request_handler(" ", lambda _params: {}),
        lambda: connection.register_notification_handler(
            " ", lambda _params: None
        ),
    ]
    for operation in operations:
        with pytest.raises(JsonRpcRequestError) as error:
            operation()
        assert error.value.code == -32042
        assert str(error.value) == "terminal precedence"
        assert error.value.data == {"phase": 477}


def test_json_rpc_terminal_cause_precedes_outbound_preparation_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    terminal = JsonRpcRequestError(-32042, "outbound preparation stopped", {"phase": 478})
    stopped_connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    stopped_connection.stop(terminal)

    with pytest.raises(JsonRpcRequestError) as invalid_error:
        stopped_connection._send_message(  # type: ignore[arg-type]
            {"jsonrpc": "2.0", "invalid": object()}, require_running=True
        )
    assert invalid_error.value.code == -32042
    assert str(invalid_error.value) == "outbound preparation stopped"
    assert invalid_error.value.data == {"phase": 478}

    racing_connection = JsonRpcConnection(io.StringIO(), io.StringIO())

    def stop_during_encoding(*_args, **_kwargs) -> str:
        racing_connection.stop(terminal)
        return "x" * (JSON_RPC_MAX_LINE_BYTES + 1)

    monkeypatch.setattr(json, "dumps", stop_during_encoding)
    with pytest.raises(JsonRpcRequestError) as oversized_error:
        racing_connection._send_message(
            {"jsonrpc": "2.0", "method": "notify", "params": {}},
            require_running=True,
        )
    assert oversized_error.value.code == -32042
    assert str(oversized_error.value) == "outbound preparation stopped"
    assert oversized_error.value.data == {"phase": 478}
    assert racing_connection._outfile.getvalue() == ""


def test_json_rpc_outbound_encoding_failure_is_protocol_contained() -> None:
    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)

    with pytest.raises(
        JsonRpcRequestError, match="JSON-RPC output encoding failed"
    ) as error:
        connection.notify("probe", {"value": "\ud800"})
    assert error.value.code == -32603
    assert isinstance(error.value.__cause__, UnicodeEncodeError)
    assert output.getvalue() == ""
    assert not connection._stop_event.is_set()

    connection.notify("probe", {"value": "valid"})
    assert json.loads(output.getvalue()) == {
        "jsonrpc": "2.0",
        "method": "probe",
        "params": {"value": "valid"},
    }


def test_json_rpc_terminal_cause_precedes_concurrent_encoding_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    terminal = JsonRpcRequestError(-32042, "encoding stopped", {"phase": 479})

    def fail_during_encoding(*_args, **_kwargs) -> str:
        connection.stop(terminal)
        raise ValueError("encoder failed")

    monkeypatch.setattr(json, "dumps", fail_during_encoding)
    with pytest.raises(JsonRpcRequestError) as error:
        connection.notify("probe", {"value": "valid"})
    assert error.value.code == -32042
    assert str(error.value) == "encoding stopped"
    assert error.value.data == {"phase": 479}
    assert connection._outfile.getvalue() == ""


def test_json_rpc_outbound_params_use_safe_plain_snapshots(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class SnapshotParams(dict):
        def __init__(self) -> None:
            super().__init__(value="ok")
            self.reads = 0

        def items(self):
            self.reads += 1
            if self.reads > 1:
                raise RuntimeError("dynamic params changed")
            return super().items()

    class InvalidParams(dict):
        def items(self):
            raise RuntimeError("params inspection failed")

    request_connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    captured: list[dict] = []

    def capture_request(payload, *, require_running=False):
        assert require_running is True
        captured.append(payload)
        request_id = payload["id"]
        request_connection._pending[request_id].waiter.put(
            {"jsonrpc": "2.0", "id": request_id, "result": {"ok": True}}
        )

    monkeypatch.setattr(request_connection, "_send_message", capture_request)
    request_params = SnapshotParams()
    assert request_connection.request("probe", request_params, 1.0) == {"ok": True}
    assert request_params.reads == 1
    assert captured[0]["params"] == {"value": "ok"}
    assert type(captured[0]["params"]) is dict

    output = io.StringIO()
    notification_connection = JsonRpcConnection(io.StringIO(), output)
    notification_params = SnapshotParams()
    notification_connection.notify("probe", notification_params)
    assert notification_params.reads == 1
    assert json.loads(output.getvalue())["params"] == {"value": "ok"}

    for operation in [
        lambda: request_connection.request("probe", InvalidParams(value=1), 1.0),
        lambda: notification_connection.notify("probe", InvalidParams(value=1)),
    ]:
        with pytest.raises(
            JsonRpcRequestError, match="JSON-RPC params must be a JSON-safe object"
        ) as error:
            operation()
        assert error.value.code == -32602
    assert not request_connection._stop_event.is_set()
    assert not notification_connection._stop_event.is_set()


def test_json_rpc_terminal_snapshot_ignores_custom_deepcopy_hooks() -> None:
    class HostileDict(dict):
        def __deepcopy__(self, _memo):
            raise RuntimeError("custom deepcopy must not run")

    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    waiter: queue.Queue = queue.Queue(maxsize=1)
    connection._pending[13] = PendingResponse(waiter=waiter)
    source_data = HostileDict(details=["first"])

    connection.stop(JsonRpcRequestError(-32042, "safe snapshot", source_data))

    assert connection._stop_event.is_set()
    assert type(connection._terminal_error.data) is dict
    assert waiter.get_nowait()["error"]["data"] == {"details": ["first"]}
    with pytest.raises(JsonRpcRequestError) as error:
        connection.notify("late", {})
    assert error.value.code == -32042
    assert error.value.data == {"details": ["first"]}
    assert type(error.value.data) is dict


def test_json_rpc_terminal_snapshot_drops_data_when_inspection_fails() -> None:
    class HostileItemsDict(dict):
        def items(self):
            raise RuntimeError("custom items failed")

    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    waiter: queue.Queue = queue.Queue(maxsize=1)
    connection._pending[14] = PendingResponse(waiter=waiter)

    connection.stop(
        JsonRpcRequestError(-32042, "inspection failed", HostileItemsDict(value=1))
    )

    assert waiter.get_nowait() == {
        "jsonrpc": "2.0",
        "id": 14,
        "error": {"code": -32042, "message": "inspection failed"},
    }
    assert connection._terminal_error.data is None


def test_json_rpc_terminal_metadata_access_failure_does_not_break_stop() -> None:
    class HostileError(JsonRpcRequestError):
        def __getattribute__(self, name):
            if name in {"code", "data"}:
                raise RuntimeError(f"{name} access failed")
            return super().__getattribute__(name)

    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    waiter: queue.Queue = queue.Queue(maxsize=1)
    connection._pending[15] = PendingResponse(waiter=waiter)

    connection.stop(HostileError(-32042, "hostile metadata", {"value": 1}))

    assert connection._stop_event.is_set()
    assert waiter.get_nowait() == {
        "jsonrpc": "2.0",
        "id": 15,
        "error": {"code": -32000, "message": "hostile metadata"},
    }
    assert connection._terminal_error.code == -32000
    assert connection._terminal_error.data is None


def test_json_rpc_terminal_code_normalization_ignores_integer_subclass_hooks() -> None:
    class HostileInt(int):
        def __abs__(self):
            raise RuntimeError("custom abs must not run")

    connection = JsonRpcConnection(io.StringIO(), io.StringIO())

    connection.stop(JsonRpcRequestError(HostileInt(-32042), "safe code"))

    assert connection._terminal_error.code == -32042
    assert type(connection._terminal_error.code) is int


def test_json_rpc_requires_explicit_json_safe_object_params() -> None:
    assert require_json_rpc_params({"value": [1, True]}) == {"value": [1, True]}
    for params in [None, [], "value", {"value": object()}]:
        with pytest.raises(
            JsonRpcRequestError,
            match="JSON-RPC params must be a JSON-safe object",
        ) as error:
            require_json_rpc_params(params)
        assert error.value.code == -32602

    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    with pytest.raises(JsonRpcRequestError) as request_error:
        connection.request("echo", [], 0.01)  # type: ignore[arg-type]
    assert request_error.value.code == -32602
    with pytest.raises(JsonRpcRequestError) as notification_error:
        connection.notify("echo", {"value": object()})  # type: ignore[arg-type]
    assert notification_error.value.code == -32602
    assert connection._pending == {}

    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)
    calls = 0

    def handler(_params):
        nonlocal calls
        calls += 1
        return {}

    connection.register_request_handler("echo", handler)
    for request_id, params in [(1, None), (2, []), (3, "value")]:
        message = {"jsonrpc": "2.0", "id": request_id, "method": "echo"}
        if params is not None:
            message["params"] = params
        connection._dispatch_line(json.dumps(message))

    assert calls == 0
    responses = [json.loads(line) for line in output.getvalue().splitlines()]
    assert [response["id"] for response in responses] == [1, 2, 3]
    assert all(response["error"]["code"] == -32602 for response in responses)


def test_json_rpc_rejects_mixed_role_fields_before_state_mutation() -> None:
    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)
    calls = 0

    def handler(_params):
        nonlocal calls
        calls += 1
        return {}

    connection.register_request_handler("echo", handler)
    connection._dispatch_line(
        json.dumps(
            {
                "jsonrpc": "2.0",
                "id": 10,
                "method": "echo",
                "params": {},
                "result": {},
            }
        )
    )
    connection._dispatch_line(
        json.dumps(
            {
                "jsonrpc": "2.0",
                "method": "echo",
                "params": {},
                "error": {"code": -32000, "message": "mixed"},
            }
        )
    )
    assert calls == 0
    assert json.loads(output.getvalue()) == {
        "jsonrpc": "2.0",
        "id": 10,
        "error": {
            "code": -32600,
            "message": "Invalid JSON-RPC request message shape.",
        },
    }

    pending = PendingResponse(waiter=queue.Queue(maxsize=1))
    connection._pending[1] = pending
    connection._dispatch_line(
        json.dumps({"jsonrpc": "2.0", "id": 1, "params": {}, "result": {}})
    )
    assert connection._pending == {1: pending}
    assert pending.waiter.empty()


def test_json_rpc_converts_invalid_handler_outputs_to_internal_error() -> None:
    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)
    connection.register_request_handler("invalid_result", lambda _params: [])

    def invalid_error(_params):
        raise JsonRpcRequestError(True, " ", {"value": object()})

    connection.register_request_handler("invalid_error", invalid_error)
    for request_id, method in [(1, "invalid_result"), (2, "invalid_error")]:
        connection._dispatch_line(
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "method": method,
                    "params": {},
                }
            )
        )

    responses = [json.loads(line) for line in output.getvalue().splitlines()]
    assert responses == [
        {
            "jsonrpc": "2.0",
            "id": 1,
            "error": {
                "code": -32603,
                "message": "Invalid JSON-RPC request handler response.",
            },
        },
        {
            "jsonrpc": "2.0",
            "id": 2,
            "error": {
                "code": -32603,
                "message": "Invalid JSON-RPC request handler response.",
            },
        },
    ]


def test_json_rpc_handler_errors_use_safe_metadata_snapshots() -> None:
    class SnapshotData(dict):
        def __init__(self) -> None:
            super().__init__(value="ok")
            self.reads = 0

        def items(self):
            self.reads += 1
            if self.reads > 1:
                raise RuntimeError("dynamic data changed")
            return super().items()

    class InvalidData(dict):
        def items(self):
            raise RuntimeError("data inspection failed")

    class HostileError(JsonRpcRequestError):
        def __getattribute__(self, name):
            if name in {"code", "data"}:
                raise RuntimeError(f"{name} access failed")
            return super().__getattribute__(name)

    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)
    snapshot_data = SnapshotData()

    def snapshot_error(_params):
        raise JsonRpcRequestError(-32042, "snapshot error", snapshot_data)

    def invalid_data_error(_params):
        raise JsonRpcRequestError(-32042, "invalid data", InvalidData(value=1))

    def hostile_metadata_error(_params):
        raise HostileError(-32042, "hostile metadata", {"value": 1})

    connection.register_request_handler("snapshot", snapshot_error)
    connection.register_request_handler("invalid_data", invalid_data_error)
    connection.register_request_handler("hostile_metadata", hostile_metadata_error)
    connection.register_request_handler("recovered", lambda _params: {"ok": True})
    for request_id, method in enumerate(
        ["snapshot", "invalid_data", "hostile_metadata", "recovered"], start=1
    ):
        connection._dispatch_line(
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "method": method,
                    "params": {},
                }
            )
        )

    assert [json.loads(line) for line in output.getvalue().splitlines()] == [
        {
            "jsonrpc": "2.0",
            "id": 1,
            "error": {
                "code": -32042,
                "message": "snapshot error",
                "data": {"value": "ok"},
            },
        },
        {
            "jsonrpc": "2.0",
            "id": 2,
            "error": {
                "code": -32603,
                "message": "Invalid JSON-RPC request handler response.",
            },
        },
        {
            "jsonrpc": "2.0",
            "id": 3,
            "error": {"code": -32000, "message": "hostile metadata"},
        },
        {"jsonrpc": "2.0", "id": 4, "result": {"ok": True}},
    ]
    assert snapshot_data.reads == 1
    assert not connection._stop_event.is_set()


def test_json_rpc_handler_results_use_safe_plain_snapshots() -> None:
    class SnapshotResult(dict):
        def __init__(self) -> None:
            super().__init__(value="ok")
            self.reads = 0

        def items(self):
            self.reads += 1
            if self.reads > 1:
                raise RuntimeError("dynamic result changed")
            return super().items()

    class InvalidResult(dict):
        def items(self):
            raise RuntimeError("result inspection failed")

    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)
    snapshot_result = SnapshotResult()
    connection.register_request_handler("snapshot", lambda _params: snapshot_result)
    connection.register_request_handler(
        "invalid", lambda _params: InvalidResult(value="bad")
    )
    connection.register_request_handler("recovered", lambda _params: {"ok": True})
    for request_id, method in enumerate(
        ["snapshot", "invalid", "recovered"], start=1
    ):
        connection._dispatch_line(
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "method": method,
                    "params": {},
                }
            )
        )

    assert [json.loads(line) for line in output.getvalue().splitlines()] == [
        {"jsonrpc": "2.0", "id": 1, "result": {"value": "ok"}},
        {
            "jsonrpc": "2.0",
            "id": 2,
            "error": {
                "code": -32603,
                "message": "Invalid JSON-RPC request handler response.",
            },
        },
        {"jsonrpc": "2.0", "id": 3, "result": {"ok": True}},
    ]
    assert snapshot_result.reads == 1
    assert not connection._stop_event.is_set()


def test_json_rpc_writer_validates_complete_outbound_envelope() -> None:
    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)
    cyclic = {}
    cyclic["self"] = cyclic
    invalid_payloads = [
        {"jsonrpc": "1.0", "id": 1, "method": "echo", "params": {}},
        {"jsonrpc": "2.0", "id": 0, "method": "echo", "params": {}},
        {"jsonrpc": "2.0", "method": "echo", "params": []},
        {"jsonrpc": "2.0", "id": 1, "result": cyclic},
        {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {},
            "error": {"code": -32000, "message": "mixed"},
        },
    ]
    for payload in invalid_payloads:
        assert is_json_rpc_outbound_message(payload) is False
        with pytest.raises(JsonRpcRequestError) as error:
            connection._send_message(payload)
        assert error.value.code == -32603
    assert output.getvalue() == ""

    valid = {
        "jsonrpc": "2.0",
        "method": "echo",
        "params": {},
        "trace": {"sampled": True},
    }
    assert is_json_rpc_outbound_message(valid) is True
    connection._send_message(valid)
    assert json.loads(output.getvalue()) == valid


def test_json_rpc_reader_discards_oversized_line_and_resumes() -> None:
    valid_request = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "echo", "params": {}}
    )

    class TrackingInput(io.StringIO):
        def __init__(self, value: str) -> None:
            super().__init__(value)
            self.readline_sizes = []

        def readline(self, size: int = -1) -> str:
            self.readline_sizes.append(size)
            return super().readline(size)

    source = TrackingInput(
        "x" * (JSON_RPC_MAX_LINE_BYTES + 10) + "\n" + valid_request + "\n"
    )
    output = io.StringIO()
    connection = JsonRpcConnection(source, output)
    connection.register_request_handler("echo", lambda _params: {"ok": True})

    connection.serve_forever()

    assert json.loads(output.getvalue()) == {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {"ok": True},
    }
    assert source.readline_sizes
    assert set(source.readline_sizes) == {JSON_RPC_MAX_LINE_BYTES + 2}


def test_json_rpc_writer_enforces_reader_limit_and_rolls_back_pending() -> None:
    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)
    oversized = {"value": "x" * JSON_RPC_MAX_LINE_BYTES}

    with pytest.raises(JsonRpcRequestError, match="output line exceeds"):
        connection.notify("oversized", oversized)
    with pytest.raises(JsonRpcRequestError, match="output line exceeds"):
        connection.request("oversized", oversized, 0.01)
    assert output.getvalue() == ""
    assert connection._pending == {}

    connection.register_request_handler("large_result", lambda _params: oversized)

    def large_error(_params):
        raise JsonRpcRequestError(
            -32000, "x" * JSON_RPC_MAX_LINE_BYTES, oversized
        )

    connection.register_request_handler("large_error", large_error)
    for request_id, method in [(1, "large_result"), (2, "large_error")]:
        connection._dispatch_line(
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "method": method,
                    "params": {},
                }
            )
        )

    responses = [json.loads(line) for line in output.getvalue().splitlines()]
    assert [response["id"] for response in responses] == [1, 2]
    assert all(response["error"] == {
        "code": -32603,
        "message": "JSON-RPC output line exceeds maximum size.",
    } for response in responses)


def test_json_rpc_caps_pending_requests_before_id_allocation() -> None:
    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)
    for request_id in range(1, JSON_RPC_MAX_PENDING_REQUESTS + 1):
        connection._pending[request_id] = PendingResponse(
            waiter=queue.Queue(maxsize=1)
        )

    with pytest.raises(
        JsonRpcRequestError,
        match="JSON-RPC pending request limit exceeded",
    ) as error:
        connection.request("overflow", {}, 0.01)
    assert error.value.code == -32000
    assert connection._next_id == 1
    assert len(connection._pending) == JSON_RPC_MAX_PENDING_REQUESTS
    assert output.getvalue() == ""

    connection._pending.clear()


def test_json_rpc_validates_timeout_before_pending_admission() -> None:
    assert require_json_rpc_timeout(JSON_RPC_MIN_TIMEOUT_S) == JSON_RPC_MIN_TIMEOUT_S
    assert require_json_rpc_timeout(JSON_RPC_MAX_TIMEOUT_S) == JSON_RPC_MAX_TIMEOUT_S

    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)
    for timeout_s in [
        True,
        "1",
        float("nan"),
        float("inf"),
        0,
        -1,
        JSON_RPC_MIN_TIMEOUT_S / 2,
        JSON_RPC_MAX_TIMEOUT_S + 0.001,
    ]:
        with pytest.raises(
            JsonRpcRequestError,
            match="JSON-RPC request timeout is out of range",
        ) as error:
            connection.request("invalid_timeout", {}, timeout_s)  # type: ignore[arg-type]
        assert error.value.code == -32602

    assert connection._next_id == 1
    assert connection._pending == {}
    assert output.getvalue() == ""


def test_json_rpc_request_id_exhaustion_is_a_stable_terminal_state() -> None:
    output = io.StringIO()
    connection = JsonRpcConnection(io.StringIO(), output)
    connection._next_id = JSON_RPC_MAX_REQUEST_ID

    with pytest.raises(JsonRpcRequestError, match="Timed out waiting for response"):
        connection.request("final", {}, JSON_RPC_MIN_TIMEOUT_S)
    assert connection._next_id is None
    assert connection._pending == {}
    encoded = json.loads(output.getvalue())
    assert encoded["id"] == JSON_RPC_MAX_REQUEST_ID

    with pytest.raises(
        JsonRpcRequestError,
        match="JSON-RPC request id space exhausted",
    ) as error:
        connection.request("exhausted", {}, 1.0)
    assert error.value.code == -32600
    assert connection._next_id is None
    assert connection._pending == {}
    assert len(output.getvalue().splitlines()) == 1


def test_json_rpc_classifies_response_ids_with_bounded_history() -> None:
    diagnostics = []
    connection = JsonRpcConnection(
        io.StringIO(), io.StringIO(), protocol_diagnostic=diagnostics.append
    )

    completed = PendingResponse(waiter=queue.Queue(maxsize=1))
    connection._pending[1] = completed
    response = {"jsonrpc": "2.0", "id": 1, "result": {}}
    connection._handle_response(response)
    assert completed.waiter.get_nowait() == response
    connection._handle_response(response)

    connection._record_settled_request(2, "timed_out")
    connection._handle_response({"jsonrpc": "2.0", "id": 2, "result": {}})
    connection._handle_response({"jsonrpc": "2.0", "id": 999, "result": {}})
    assert diagnostics == [
        "Duplicate JSON-RPC response id: 1",
        "Late JSON-RPC response id: 2",
        "Unexpected JSON-RPC response id: 999",
    ]

    for request_id in range(10, 10 + JSON_RPC_SETTLED_HISTORY_LIMIT + 1):
        connection._record_settled_request(request_id, "completed")
    assert len(connection._settled_requests) == JSON_RPC_SETTLED_HISTORY_LIMIT
    assert 10 not in connection._settled_requests


def test_json_rpc_response_settlement_owns_payload_before_waking_waiter() -> None:
    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    waiter: queue.Queue = queue.Queue(maxsize=1)
    connection._pending[7] = PendingResponse(waiter=waiter)
    source = {
        "jsonrpc": "2.0",
        "id": 7,
        "result": {"nested": {"count": 1}},
    }

    connection._handle_response(source)
    source["result"]["nested"]["count"] = 2
    settled = waiter.get_nowait()

    assert settled == {
        "jsonrpc": "2.0",
        "id": 7,
        "result": {"nested": {"count": 1}},
    }
    assert settled["result"] is not source["result"]
    assert settled["result"]["nested"] is not source["result"]["nested"]
    assert connection._pending == {}


def test_json_rpc_response_snapshot_failure_still_settles_pending_request() -> None:
    class InvalidResponse(dict):
        def items(self):
            raise RuntimeError("response inspection failed")

    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    waiter: queue.Queue = queue.Queue(maxsize=1)
    connection._pending[8] = PendingResponse(waiter=waiter)

    connection._handle_response(
        InvalidResponse(jsonrpc="2.0", id=8, result={"value": "unstable"})
    )
    settled = waiter.get_nowait()

    assert settled == {"jsonrpc": "2.0", "id": 8}
    with pytest.raises(
        JsonRpcRequestError,
        match="Invalid JSON-RPC success response payload",
    ) as error:
        parse_json_rpc_result(settled)
    assert error.value.code == -32603
    assert connection._pending == {}


def test_json_rpc_notification_handlers_are_failure_isolated() -> None:
    diagnostics = []
    calls = []
    connection = JsonRpcConnection(
        io.StringIO(), io.StringIO(), protocol_diagnostic=diagnostics.append
    )

    def failing(_params):
        calls.append("handler-1")
        raise RuntimeError("failed")

    def succeeding(params):
        calls.append(("handler-2", params))

    connection.register_notification_handler("event", failing)
    connection.register_notification_handler("event", succeeding)
    connection._dispatch_line(
        json.dumps(
            {"jsonrpc": "2.0", "method": "event", "params": {"ok": True}}
        )
    )

    assert calls == ["handler-1", ("handler-2", {"ok": True})]
    assert diagnostics == ["JSON-RPC notification handler failed: event"]

    connection._protocol_diagnostic = lambda _message: (_ for _ in ()).throw(
        RuntimeError("diagnostic failed")
    )
    connection._dispatch_line(
        json.dumps({"jsonrpc": "2.0", "method": "event", "params": {}})
    )
    assert calls[-2:] == ["handler-1", ("handler-2", {})]


def test_json_rpc_notification_handlers_receive_isolated_params_snapshots() -> None:
    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    observations = []
    params_refs = []
    nested_refs = []

    def first(params):
        observations.append((params["value"], params["nested"]["count"]))
        params_refs.append(params)
        nested_refs.append(params["nested"])
        params["value"] = "first"
        params["nested"]["count"] = 2

    def second(params):
        observations.append((params["value"], params["nested"]["count"]))
        params_refs.append(params)
        nested_refs.append(params["nested"])
        params["value"] = "second"
        params["nested"]["count"] = 3

    connection.register_notification_handler("event", first)
    connection.register_notification_handler("event", second)
    connection._dispatch_line(
        json.dumps(
            {
                "jsonrpc": "2.0",
                "method": "event",
                "params": {"value": "original", "nested": {"count": 1}},
            }
        )
    )

    assert observations == [("original", 1), ("original", 1)]
    assert params_refs[0] is not params_refs[1]
    assert nested_refs[0] is not nested_refs[1]


def test_json_rpc_notification_snapshot_failure_precedes_all_handlers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    diagnostics = []
    calls = []
    connection = JsonRpcConnection(
        io.StringIO(), io.StringIO(), protocol_diagnostic=diagnostics.append
    )
    connection.register_notification_handler("event", lambda _params: calls.append(1))
    connection.register_notification_handler("event", lambda _params: calls.append(2))
    original_snapshot = engine_server_module.snapshot_json_rpc_object
    snapshot_count = 0

    def fail_second_consumer(value):
        nonlocal snapshot_count
        snapshot_count += 1
        if snapshot_count == 3:
            return None
        return original_snapshot(value)

    monkeypatch.setattr(
        engine_server_module, "snapshot_json_rpc_object", fail_second_consumer
    )
    connection._dispatch_line(
        json.dumps({"jsonrpc": "2.0", "method": "event", "params": {}})
    )

    assert snapshot_count == 3
    assert calls == []
    assert diagnostics == ["Invalid JSON-RPC notification params."]


def test_json_rpc_notification_subscriptions_are_exact_and_idempotent() -> None:
    connection = JsonRpcConnection(io.StringIO(), io.StringIO())
    calls = []
    unsubscribe_second = None

    def first(_params):
        calls.append("shared")
        assert unsubscribe_second is not None
        unsubscribe_second()

    def shared(_params):
        calls.append("shared")

    unsubscribe_first = connection.register_notification_handler("owned", first)
    unsubscribe_second = connection.register_notification_handler("owned", shared)
    unsubscribe_third = connection.register_notification_handler("owned", shared)
    notification = json.dumps(
        {"jsonrpc": "2.0", "method": "owned", "params": {}}
    )

    unsubscribe_third()
    unsubscribe_third()
    connection._dispatch_line(notification)
    assert calls == ["shared", "shared"]

    connection._dispatch_line(notification)
    assert calls == ["shared", "shared", "shared"]

    unsubscribe_first()
    unsubscribe_first()
    connection._dispatch_line(notification)
    assert calls == ["shared", "shared", "shared"]
    assert "owned" not in connection._notification_handlers


def test_create_session_uses_default_fake_provider() -> None:
    connection = FakeConnection()
    server = initialized_server(connection)

    result = server.handle_create_session(create_session_params())

    assert result == {"session_id": "s1", "status": "created"}
    assert connection.notifications[0][0] == "god_code_event"


def test_shutdown_returns_canonical_acknowledgement_and_stops_connection() -> None:
    connection = FakeConnection()
    server = GodCodeEngineServer(connection)

    result = server.handle_shutdown({})

    assert result == {"status": "shutting_down"}
    assert connection.stopped is True


@pytest.mark.parametrize(
    "params",
    [{"reason": "cleanup"}, {"extension": object()}],
)
def test_shutdown_rejects_non_empty_request_before_stopping(
    params: dict[str, object],
) -> None:
    connection = FakeConnection()
    server = GodCodeEngineServer(connection)

    with pytest.raises(ValidationError, match="empty JSON object"):
        server.handle_shutdown(params)

    assert connection.stopped is False


def test_create_session_accepts_multiple_session_ids() -> None:
    connection = FakeConnection()
    server = initialized_server(connection)

    first = server.handle_create_session(create_session_params(session_id="s1"))
    second = server.handle_create_session(create_session_params(session_id="s2"))

    assert first == {"session_id": "s1", "status": "created"}
    assert second == {"session_id": "s2", "status": "created"}
    assert server._session_manager.get_session("s1").session_id == "s1"
    assert server._session_manager.get_session("s2").session_id == "s2"
    assert [notification[1]["session_id"] for notification in connection.notifications] == ["s1", "s2"]


def test_create_session_rejects_duplicate_session_id() -> None:
    connection = FakeConnection()
    server = initialized_server(connection)

    server.handle_create_session(create_session_params(session_id="s1"))

    with pytest.raises(SessionError, match="Session already exists"):
        server.handle_create_session(create_session_params(session_id="s1"))


def test_parse_tool_catalog_accepts_optional_input_schema() -> None:
    tools = parse_tool_catalog(
        [
            {
                "name": "Read",
                "description": "read",
                "input_schema": {
                    "type": "object",
                    "required": ["path"],
                },
            }
        ]
    )

    assert tools[0].to_dict()["input_schema"] == {
        "type": "object",
        "required": ["path"],
    }


def test_parse_tool_catalog_rejects_non_object_input_schema() -> None:
    with pytest.raises(ValidationError, match="input_schema"):
        parse_tool_catalog(
            [
                {
                    "name": "Read",
                    "description": "read",
                    "input_schema": "bad",
                }
            ]
        )


@pytest.mark.parametrize(
    "catalog",
    [
        [{"name": " ", "description": "read"}],
        [{"name": "Read", "description": " "}],
        [
            {"name": "Read", "description": "read"},
            {"name": "Read", "description": "duplicate"},
        ],
        [{"name": "Read", "description": "read", "input_schema": {"value": object()}}],
    ],
)
def test_parse_tool_catalog_rejects_invalid_identity_or_json_shape(
    catalog: list[dict[str, object]],
) -> None:
    with pytest.raises(ValidationError):
        parse_tool_catalog(catalog)


def test_parse_initial_messages_accepts_resume_history() -> None:
    messages = parse_initial_messages(
        [
            {"kind": "user", "role": "user", "content": "read README.md"},
            {"kind": "assistant", "role": "assistant", "content": "done"},
            {"kind": "tool_call", "tool_call": {"tool_call_id": "tc1", "tool_name": "Read"}},
            {
                "kind": "tool_result",
                "tool_call_id": "tc1",
                "tool_name": "Read",
                "result": {"ok": True},
            },
        ]
    )

    assert messages == [
        {"kind": "user", "role": "user", "content": "read README.md"},
        {"kind": "assistant", "role": "assistant", "content": "done"},
        {"kind": "tool_call", "tool_call": {"tool_call_id": "tc1", "tool_name": "Read"}},
        {
            "kind": "tool_result",
            "tool_call_id": "tc1",
            "tool_name": "Read",
            "result": {"ok": True},
        },
    ]


def test_parse_initial_messages_rejects_unknown_kind() -> None:
    with pytest.raises(ValidationError, match="Unsupported initial_messages kind"):
        parse_initial_messages([{"kind": "provider_context"}])


@pytest.mark.parametrize(
    "message",
    [
        {"kind": "user", "role": "assistant", "content": "bad"},
        {"kind": "assistant", "role": "user", "content": "bad"},
        {"kind": "tool_call", "tool_call": {"value": object()}},
        {"kind": "tool_result", "tool_name": " ", "result": {}},
        {"kind": "tool_result", "tool_call_id": " ", "tool_name": "Read", "result": {}},
    ],
)
def test_parse_initial_messages_rejects_invalid_contract(
    message: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        parse_initial_messages([message])


@pytest.mark.parametrize(
    "params",
    [
        {**create_session_params(), "session_id": " "},
        {**create_session_params(), "cwd": " "},
        {**create_session_params(), "model_adapter": " "},
        {**create_session_params(), "extension": object()},
        {
            **create_session_params(),
            "tool_catalog": [
                {"name": "Read", "description": "read"},
                {"name": "Read", "description": "duplicate"},
            ],
        },
    ],
)
def test_create_session_rejects_malformed_request_before_session_or_event_mutation(
    params: dict[str, object],
) -> None:
    connection = FakeConnection()
    server = initialized_server(connection)
    connection.notifications.clear()

    with pytest.raises(ValidationError):
        server.handle_create_session(params)

    with pytest.raises(SessionError, match="Session not found"):
        server._session_manager.get_session(str(params.get("session_id", "s1")))
    assert connection.notifications == []


def test_create_session_seeds_initial_messages() -> None:
    connection = FakeConnection()
    server = initialized_server(connection)

    result = server.handle_create_session(
        {
            **create_session_params(),
            "initial_messages": [
                {"kind": "user", "role": "user", "content": "previous"},
                {"kind": "assistant", "role": "assistant", "content": "done"},
            ],
        }
    )

    session = server._session_manager.get_session("s1")
    assert result == {"session_id": "s1", "status": "created"}
    assert session.messages == [
        {"kind": "user", "role": "user", "content": "previous"},
        {"kind": "assistant", "role": "assistant", "content": "done"},
    ]


@pytest.mark.parametrize(
    "prompt",
    [
        {"role": "assistant", "content": "bad"},
        {"role": "user", "content": ""},
        {"role": "user", "content": "hello", "extension": object()},
    ],
)
def test_parse_prompt_message_rejects_invalid_contract(
    prompt: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        parse_prompt_message(prompt)


@pytest.mark.parametrize(
    "options",
    [
        [],
        {"stream": "yes"},
        {"max_tokens": 1.5},
        {"max_tokens": 9_007_199_254_740_992},
        {"temperature": False},
        {"provider": 1},
        {"extension": object()},
    ],
)
def test_parse_turn_options_rejects_invalid_contract(options: object) -> None:
    with pytest.raises(ValidationError):
        parse_turn_options(options)


@pytest.mark.parametrize(
    "params",
    [
        {
            "session_id": " ",
            "prompt": {"role": "user", "content": "hello"},
            "turn_options": {},
        },
        {
            "session_id": "s1",
            "prompt": {"role": "assistant", "content": "hello"},
            "turn_options": {},
        },
        {
            "session_id": "s1",
            "prompt": {"role": "user", "content": "hello"},
            "turn_options": {"stream": "yes"},
        },
        {
            "session_id": "s1",
            "prompt": {"role": "user", "content": "hello"},
            "turn_options": {},
            "extension": object(),
        },
    ],
)
def test_submit_turn_rejects_malformed_request_before_active_turn_or_event_mutation(
    params: dict[str, object],
) -> None:
    connection = FakeConnection()
    server = initialized_server(connection)
    server.handle_create_session(create_session_params())
    connection.notifications.clear()

    with pytest.raises(ValidationError):
        server.handle_submit_turn(params)

    assert server._session_manager._active_turns == {}
    assert connection.notifications == []


@pytest.mark.parametrize(
    "params",
    [
        {"session_id": " ", "turn_id": "turn"},
        {"session_id": "s1", "turn_id": " "},
        {"session_id": "s1", "turn_id": "turn", "extension": object()},
    ],
)
def test_cancel_turn_rejects_malformed_request_before_cancel_or_notification(
    params: dict[str, object],
) -> None:
    connection = FakeConnection()
    server = initialized_server(connection)
    server.handle_create_session(create_session_params())
    active_turn = server._session_manager.begin_turn("s1", "turn")
    connection.notifications.clear()

    with pytest.raises(ValidationError):
        server.handle_cancel_turn(params)

    assert active_turn.cancel_event.is_set() is False
    assert server._session_manager.get_active_turn("s1") is active_turn
    assert connection.notifications == []


def test_cancel_turn_emits_canonical_typed_tool_cancellation_notification() -> None:
    connection = FakeConnection()
    server = initialized_server(connection)
    server.handle_create_session(create_session_params())
    active_turn = server._session_manager.begin_turn("s1", "turn")
    connection.notifications.clear()

    result = server.handle_cancel_turn({"session_id": "s1", "turn_id": "turn"})

    assert result == {
        "session_id": "s1",
        "turn_id": "turn",
        "status": "cancel_requested",
    }
    assert active_turn.cancel_event.is_set() is True
    assert connection.notifications == [
        ("cancel_tool_execution", {"session_id": "s1", "turn_id": "turn"})
    ]


def test_create_transcript_store_uses_jsonl_when_env_is_set(
    tmp_path: Path,
    monkeypatch,
) -> None:
    connection = FakeConnection()
    monkeypatch.setenv("GOD_CODE_TRANSCRIPT_DIR", str(tmp_path))
    server = GodCodeEngineServer(connection)

    store = server._create_transcript_store()

    assert isinstance(store, JsonlTranscriptStore)


def test_initialize_lists_real_provider_when_env_is_set(monkeypatch) -> None:
    monkeypatch.setenv("GOD_CODE_PROVIDER", "demo")
    monkeypatch.setenv("GOD_CODE_MODEL", "demo-model")
    monkeypatch.setenv("GOD_CODE_API_KEY_ENV", "DEMO_API_KEY")
    monkeypatch.setenv("DEMO_API_KEY", "secret")
    connection = FakeConnection()
    server = GodCodeEngineServer(connection)

    result = server.handle_initialize(initialize_params())

    assert result["supported_model_adapters"] == ["demo", "fake"]


def test_initialize_negotiates_execute_tools_host_capability() -> None:
    server = GodCodeEngineServer(FakeConnection())

    server.handle_initialize(initialize_params(
        capabilities={"execute_tools": True, "execute_tools_max_batch_size": 2}
    ))
    assert server._host_execute_tools_supported is True
    assert server._host_execute_tools_max_batch_size == 2

    with pytest.raises(JsonRpcRequestError, match="already initialized") as error:
        server.handle_initialize(initialize_params())
    assert error.value.code == -32002
    assert server._host_execute_tools_supported is True
    assert server._host_execute_tools_max_batch_size == 2


def test_initialize_rejects_protocol_version_mismatch_before_capability_mutation() -> None:
    server = GodCodeEngineServer(FakeConnection())

    with pytest.raises(JsonRpcRequestError, match="expected 2.0") as error:
        server.handle_initialize(initialize_params(
            "1.0", {"execute_tools": True, "execute_tools_max_batch_size": 2}
        ))

    assert error.value.code == -32602
    assert server._host_execute_tools_supported is False
    assert server._host_execute_tools_max_batch_size == 4


@pytest.mark.parametrize(
    "params",
    [
        {"protocol_version": "2.0", "capabilities": {}},
        {
            "protocol_version": "2.0",
            "host_info": {"name": " ", "version": "0.1.0"},
            "capabilities": {},
        },
        {
            "protocol_version": "2.0",
            "host_info": {"name": "host", "version": " "},
            "capabilities": {},
        },
        {
            "protocol_version": "2.0",
            "host_info": {"name": "host", "version": "0.1.0"},
            "capabilities": [],
        },
        {
            "protocol_version": "2.0",
            "host_info": {"name": "host", "version": "0.1.0", "value": object()},
            "capabilities": {},
        },
        {
            "protocol_version": "2.0",
            "host_info": {"name": "host", "version": "0.1.0"},
            "capabilities": {},
            "extension": object(),
        },
    ],
)
def test_initialize_rejects_malformed_metadata_before_state_mutation(
    params: dict[str, object]
) -> None:
    server = GodCodeEngineServer(FakeConnection())

    with pytest.raises(ValidationError):
        server.handle_initialize(params)

    assert server._initialized is False
    assert server._host_execute_tools_supported is False
    assert server._host_execute_tools_max_batch_size == 4


@pytest.mark.parametrize("method", ["create", "submit", "cancel"])
def test_business_methods_require_initialize(method: str) -> None:
    server = GodCodeEngineServer(FakeConnection())

    with pytest.raises(JsonRpcRequestError, match="not initialized") as error:
        if method == "create":
            server.handle_create_session(create_session_params())
        elif method == "submit":
            server.handle_submit_turn({})
        else:
            server.handle_cancel_turn({})

    assert error.value.code == -32002


def test_create_session_can_use_real_provider_registered_from_env(monkeypatch) -> None:
    monkeypatch.setenv("GOD_CODE_PROVIDER", "demo")
    monkeypatch.setenv("GOD_CODE_MODEL", "demo-model")
    monkeypatch.setenv("GOD_CODE_API_KEY_ENV", "DEMO_API_KEY")
    monkeypatch.setenv("DEMO_API_KEY", "secret")
    connection = FakeConnection()
    server = initialized_server(connection)

    result = server.handle_create_session(create_session_params("demo"))

    assert result == {"session_id": "s1", "status": "created"}
    method, payload = connection.notifications[0]
    assert method == "god_code_event"
    assert payload["event_type"] == "session_started"
    assert payload["sequence"] == 0
    assert payload["payload"]["model_adapter"] == "demo"


def test_engine_main_reports_provider_config_errors_without_traceback() -> None:
    env = os.environ.copy()
    env["GOD_CODE_PROVIDER"] = "demo"
    env.pop("GOD_CODE_MODEL", None)
    env.pop("GOD_CODE_API_KEY_ENV", None)

    result = subprocess.run(
        [sys.executable, "-m", "god_code_engine.api.god_code_engine_server"],
        env=env,
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )

    assert result.returncode == 2
    assert "Provider config error:" in result.stderr
    assert "GOD_CODE_MODEL" in result.stderr
    assert "Traceback" not in result.stderr
