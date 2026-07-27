import pytest

from god_code_engine.api.god_code_api_models import (
    AssistantMessage,
    CancelToolExecutionNotification,
    GodCodeEventEnvelope,
    ToolCall,
    TurnResult,
    ToolExecutionResult,
    ToolExecutionError,
    build_tool_error,
    ValidationError,
    parse_tool_execution_result,
)


def test_turn_result_constructor_enforces_discriminated_state() -> None:
    assistant = AssistantMessage(role="assistant", content="done")
    error = build_tool_error("failed", "failed")

    assert TurnResult(status="success", assistant_message=assistant).to_dict()["status"] == "success"
    assert TurnResult(status="error", error=error).to_dict()["status"] == "error"
    assert TurnResult(status="cancelled").to_dict() == {"status": "cancelled"}

    for factory in (
        lambda: TurnResult(status="unknown"),
        lambda: TurnResult(status="success"),
        lambda: TurnResult(status="success", assistant_message=assistant, error=error),
        lambda: TurnResult(status="error"),
        lambda: TurnResult(status="error", assistant_message=assistant, error=error),
        lambda: TurnResult(status="cancelled", error=error),
    ):
        with pytest.raises(ValidationError, match="[Tt]urn result"):
            factory()


@pytest.mark.parametrize(
    "factory",
    [
        lambda: ToolCall(" ", "Read", {}),
        lambda: ToolCall("call", " ", {}),
        lambda: ToolCall("call", "Read", {"value": object()}),
    ],
)
def test_tool_call_constructor_rejects_invalid_outbound_payload(factory) -> None:
    with pytest.raises(ValidationError, match="Tool call"):
        factory()


@pytest.mark.parametrize(
    "session_id, turn_id",
    [(" ", "turn"), ("session", " ")],
)
def test_cancel_tool_notification_constructor_rejects_invalid_identity(
    session_id: str,
    turn_id: str,
) -> None:
    with pytest.raises(ValidationError, match="Cancellation"):
        CancelToolExecutionNotification(session_id, turn_id)


def test_event_envelope_constructor_accepts_all_protocol_event_shapes() -> None:
    events = [
        GodCodeEventEnvelope(
            event_type="session_started",
            session_id="session",
            turn_id=None,
            payload={"cwd": "/workspace", "model_adapter": "fake"},
            sequence=0,
        ),
        GodCodeEventEnvelope("turn_started", "session", "turn", {}, 1),
        GodCodeEventEnvelope(
            "assistant_delta", "session", "turn", {"delta": {"text": "partial"}}, 1
        ),
        GodCodeEventEnvelope(
            "assistant_message",
            "session",
            "turn",
            {"message": {"role": "assistant", "content": "done"}},
            1,
        ),
        GodCodeEventEnvelope(
            "tool_call_requested",
            "session",
            "turn",
            {
                "tool_call": {
                    "tool_call_id": "call",
                    "tool_name": "Read",
                    "input": {"path": "a"},
                },
                "execution_mode": "serial",
            },
            2,
        ),
        GodCodeEventEnvelope(
            "tool_result_received",
            "session",
            "turn",
            {
                "tool_call_id": "call",
                "tool_name": "Read",
                "result": {"ok": True, "output": {"content": "value"}},
            },
            3,
        ),
        GodCodeEventEnvelope(
            "turn_finished",
            "session",
            "turn",
            {
                "status": "success",
                "assistant_message": {"role": "assistant", "content": "done"},
            },
            4,
        ),
        GodCodeEventEnvelope(
            "god_code_error",
            "session",
            "turn",
            {"error": {"code": "failed", "message": "failed"}},
            5,
        ),
    ]

    assert [event.event_type for event in events] == [
        "session_started",
        "turn_started",
        "assistant_delta",
        "assistant_message",
        "tool_call_requested",
        "tool_result_received",
        "turn_finished",
        "god_code_error",
    ]


@pytest.mark.parametrize(
    "event_type, session_id, turn_id, payload",
    [
        ("unknown", "session", "turn", {}),
        ("session_started", " ", None, {"cwd": "/workspace", "model_adapter": "fake"}),
        ("session_started", "session", "turn", {"cwd": "/workspace", "model_adapter": "fake"}),
        ("turn_started", "session", None, {}),
        ("session_started", "session", None, {"cwd": "/workspace"}),
        ("assistant_delta", "session", "turn", {"delta": {}}),
        (
            "assistant_message",
            "session",
            "turn",
            {"message": {"role": "user", "content": "wrong"}},
        ),
        (
            "tool_call_requested",
            "session",
            "turn",
            {"tool_call": {"tool_call_id": "call", "tool_name": "Read", "input": []}},
        ),
        (
            "tool_result_received",
            "session",
            "turn",
            {"tool_call_id": "call", "tool_name": "Read", "result": {"ok": False}},
        ),
        ("turn_finished", "session", "turn", {"status": "success"}),
        (
            "god_code_error",
            "session",
            "turn",
            {"error": {"code": "", "message": "failed"}},
        ),
    ],
)
def test_event_envelope_constructor_rejects_invalid_protocol_shapes(
    event_type: str, session_id: str, turn_id: str | None, payload: dict[str, object]
) -> None:
    with pytest.raises(ValidationError, match="event"):
        sequence = 0 if event_type == "session_started" else 1
        GodCodeEventEnvelope(event_type, session_id, turn_id, payload, sequence)


@pytest.mark.parametrize(
    "event_type, turn_id, sequence",
    [
        ("session_started", None, 1),
        ("turn_started", "turn", 0),
        ("turn_started", "turn", -1),
        ("turn_started", "turn", True),
        ("turn_started", "turn", 9_007_199_254_740_992),
    ],
)
def test_event_envelope_constructor_rejects_invalid_sequence(
    event_type: str, turn_id: str | None, sequence: object
) -> None:
    payload = {"cwd": "/workspace", "model_adapter": "fake"} if turn_id is None else {}
    with pytest.raises(ValidationError, match="sequence"):
        GodCodeEventEnvelope(event_type, "session", turn_id, payload, sequence)


def test_parse_tool_execution_result_accepts_missing_and_object_optional_fields() -> None:
    assert parse_tool_execution_result({"ok": True}).to_dict() == {"ok": True}
    assert parse_tool_execution_result({
        "ok": False,
        "output": {"partial": True},
        "error": {
            "code": "read_failed",
            "message": "failed",
            "details": {"path": "a"},
        },
    }).to_dict() == {
        "ok": False,
        "output": {"partial": True},
        "error": {
            "code": "read_failed",
            "message": "failed",
            "details": {"path": "a"},
        },
    }


@pytest.mark.parametrize(
    "payload, message",
    [
        ({"ok": True, "output": None}, "Expected object field: output."),
        (
            {"ok": True, "error": {"code": "unexpected", "message": "unexpected"}},
            "Successful tool execution result must not contain error.",
        ),
        ({"ok": False}, "Failed tool execution result must contain error."),
        ({"ok": False, "error": None}, "Expected object for error."),
        (
            {"ok": False, "error": {"code": "failed", "message": "failed", "details": None}},
            "Expected object field: error.details.",
        ),
        (
            {"ok": False, "error": {"code": "failed", "message": "failed", "details": "bad"}},
            "Expected object field: error.details.",
        ),
    ],
)
def test_parse_tool_execution_result_rejects_explicit_null_or_invalid_optional_fields(
    payload,
    message: str,
) -> None:
    with pytest.raises(ValidationError, match=message.replace(".", r"\.")):
        parse_tool_execution_result(payload)


@pytest.mark.parametrize(
    "payload",
    [
        {"ok": True, "extension": object()},
        {"ok": True, "output": {"value": object()}},
        {
            "ok": False,
            "error": {"code": " ", "message": "failed"},
        },
        {
            "ok": False,
            "error": {"code": "failed", "message": "failed", "details": {"value": object()}},
        },
    ],
)
def test_parse_tool_execution_result_rejects_non_json_or_blank_runtime_payloads(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        parse_tool_execution_result(payload)


@pytest.mark.parametrize(
    "factory, message",
    [
        (
            lambda: ToolExecutionResult(ok=True, error=build_tool_error("unexpected", "unexpected")),
            "Successful tool execution result must not contain error.",
        ),
        (
            lambda: ToolExecutionResult(ok=False),
            "Failed tool execution result must contain error.",
        ),
        (
            lambda: ToolExecutionResult(ok=1),
            "Tool execution result ok must be boolean.",
        ),
    ],
)
def test_tool_execution_result_constructor_enforces_state_invariant(factory, message: str) -> None:
    with pytest.raises(ValidationError, match=message.replace(".", r"\.")):
        factory()


@pytest.mark.parametrize(
    "factory, message",
    [
        (
            lambda: ToolExecutionError(code="", message="failed"),
            "Tool execution error code must be a non-empty string.",
        ),
        (
            lambda: ToolExecutionError(code="   ", message="failed"),
            "Tool execution error code must be a non-empty string.",
        ),
        (
            lambda: ToolExecutionError(code="failed", message=""),
            "Tool execution error message must be a non-empty string.",
        ),
        (
            lambda: ToolExecutionError(code="failed", message="\n\t"),
            "Tool execution error message must be a non-empty string.",
        ),
        (
            lambda: ToolExecutionError(code="failed", message="failed", details=[]),
            "Tool execution error details must be an object.",
        ),
    ],
)
def test_tool_execution_error_constructor_enforces_shape(factory, message: str) -> None:
    with pytest.raises(ValidationError, match=message.replace(".", r"\.")):
        factory()


def test_tool_result_constructors_reject_non_json_and_cyclic_nested_values() -> None:
    cyclic: dict[str, object] = {}
    cyclic["self"] = cyclic

    for output in ({"value": object()}, {"value": float("nan")}, cyclic):
        with pytest.raises(ValidationError, match="output must contain only JSON values"):
            ToolExecutionResult(ok=True, output=output)

    with pytest.raises(ValidationError, match="details must contain only JSON values"):
        ToolExecutionError(code="failed", message="failed", details={"value": object()})
