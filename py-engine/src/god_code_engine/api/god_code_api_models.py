from __future__ import annotations

import math
from dataclasses import dataclass

from god_code_engine.types import JsonList, JsonMapping, JsonObject, Messages

SessionId = str
TurnId = str
ToolCallId = str
ToolName = str

TOOL_NAMES = ("Read", "Edit", "Bash", "ListFiles", "Search", "Write")
GOD_CODE_EVENT_TYPES = frozenset(
    {
        "session_started",
        "turn_started",
        "assistant_delta",
        "assistant_message",
        "tool_call_requested",
        "tool_result_received",
        "turn_finished",
        "god_code_error",
    }
)
JSON_SAFE_INTEGER_MAX = 9_007_199_254_740_991


class ValidationError(ValueError):
    """Raised when a wire payload is malformed."""


@dataclass(slots=True)
class ToolCatalogEntry:
    name: ToolName
    description: str
    input_schema: JsonObject | None = None

    def to_dict(self) -> JsonObject:
        payload: JsonObject = {"name": self.name, "description": self.description}
        if self.input_schema is not None:
            payload["input_schema"] = self.input_schema
        return payload


@dataclass(slots=True)
class PromptMessage:
    role: str
    content: str

    def to_dict(self) -> JsonObject:
        return {"role": self.role, "content": self.content}


@dataclass(slots=True)
class AssistantMessage:
    role: str
    content: str

    def to_dict(self) -> JsonObject:
        return {"role": self.role, "content": self.content}


@dataclass(slots=True)
class ToolCall:
    tool_call_id: ToolCallId
    tool_name: ToolName
    input: JsonObject

    def __post_init__(self) -> None:
        if not isinstance(self.tool_call_id, str) or not self.tool_call_id.strip():
            raise ValidationError("Tool call id must be a non-empty string.")
        if not isinstance(self.tool_name, str) or not self.tool_name.strip():
            raise ValidationError("Tool call name must be a non-empty string.")
        if not is_json_object(self.input):
            raise ValidationError("Tool call input must be a JSON object.")

    def to_dict(self) -> JsonObject:
        return {
            "tool_call_id": self.tool_call_id,
            "tool_name": self.tool_name,
            "input": self.input,
        }


@dataclass(slots=True)
class CancelToolExecutionNotification:
    session_id: SessionId
    turn_id: TurnId

    def __post_init__(self) -> None:
        if not isinstance(self.session_id, str) or not self.session_id.strip():
            raise ValidationError("Cancellation session id must be a non-empty string.")
        if not isinstance(self.turn_id, str) or not self.turn_id.strip():
            raise ValidationError("Cancellation turn id must be a non-empty string.")

    def to_dict(self) -> JsonObject:
        return {"session_id": self.session_id, "turn_id": self.turn_id}


@dataclass(slots=True)
class ToolExecutionError:
    code: str
    message: str
    details: JsonObject | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.code, str) or not self.code.strip():
            raise ValidationError("Tool execution error code must be a non-empty string.")
        if not isinstance(self.message, str) or not self.message.strip():
            raise ValidationError("Tool execution error message must be a non-empty string.")
        if self.details is not None and not isinstance(self.details, dict):
            raise ValidationError("Tool execution error details must be an object.")
        if self.details is not None and not is_json_value(self.details, set()):
            raise ValidationError("Tool execution error details must contain only JSON values.")

    def to_dict(self) -> JsonObject:
        payload: JsonObject = {"code": self.code, "message": self.message}
        if self.details is not None:
            payload["details"] = self.details
        return payload


@dataclass(slots=True)
class ToolExecutionResult:
    ok: bool
    output: JsonObject | None = None
    error: ToolExecutionError | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.ok, bool):
            raise ValidationError("Tool execution result ok must be boolean.")
        if self.output is not None and not isinstance(self.output, dict):
            raise ValidationError("Tool execution result output must be an object.")
        if self.output is not None and not is_json_value(self.output, set()):
            raise ValidationError("Tool execution result output must contain only JSON values.")
        if self.ok and self.error is not None:
            raise ValidationError("Successful tool execution result must not contain error.")
        if not self.ok and self.error is None:
            raise ValidationError("Failed tool execution result must contain error.")

    def to_dict(self) -> JsonObject:
        payload: JsonObject = {"ok": self.ok}
        if self.output is not None:
            payload["output"] = self.output
        if self.error is not None:
            payload["error"] = self.error.to_dict()
        return payload


def is_json_value(value: object, ancestors: set[int] | None = None) -> bool:
    ancestors = ancestors if ancestors is not None else set()
    if value is None or isinstance(value, (str, bool)):
        return True
    if isinstance(value, int) and not isinstance(value, bool):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, (list, dict)):
        identity = id(value)
        if identity in ancestors:
            return False
        ancestors.add(identity)
        try:
            if isinstance(value, list):
                return all(is_json_value(entry, ancestors) for entry in value)
            return all(
                isinstance(key, str) and is_json_value(entry, ancestors)
                for key, entry in value.items()
            )
        finally:
            ancestors.remove(identity)
    return False


def is_json_object(value: object) -> bool:
    return isinstance(value, dict) and is_json_value(value)


@dataclass(slots=True)
class TurnResult:
    status: str
    assistant_message: AssistantMessage | None = None
    error: ToolExecutionError | None = None

    def __post_init__(self) -> None:
        if self.status == "success":
            if self.assistant_message is None or self.error is not None:
                raise ValidationError(
                    "Successful turn result must contain assistant_message and no error."
                )
            return
        if self.status == "error":
            if self.assistant_message is not None or self.error is None:
                raise ValidationError(
                    "Failed turn result must contain error and no assistant_message."
                )
            return
        if self.status == "cancelled":
            if self.assistant_message is not None or self.error is not None:
                raise ValidationError(
                    "Cancelled turn result must not contain assistant_message or error."
                )
            return
        raise ValidationError("Turn result status must be success, error, or cancelled.")

    def to_dict(self) -> JsonObject:
        payload: JsonObject = {"status": self.status}
        if self.assistant_message is not None:
            payload["assistant_message"] = self.assistant_message.to_dict()
        if self.error is not None:
            payload["error"] = self.error.to_dict()
        return payload


@dataclass(slots=True)
class GodCodeEventEnvelope:
    event_type: str
    session_id: SessionId
    turn_id: TurnId | None
    payload: JsonObject
    sequence: int

    def __post_init__(self) -> None:
        if self.event_type not in GOD_CODE_EVENT_TYPES:
            raise ValidationError("God-code event type is invalid.")
        if not _is_non_blank_string(self.session_id):
            raise ValidationError("God-code event session_id must be a non-empty string.")
        if (
            isinstance(self.sequence, bool)
            or not isinstance(self.sequence, int)
            or abs(self.sequence) > JSON_SAFE_INTEGER_MAX
        ):
            raise ValidationError("God-code event sequence must be a safe integer.")
        if self.event_type == "session_started":
            if self.turn_id is not None:
                raise ValidationError("session_started event must not contain turn_id.")
            if self.sequence != 0:
                raise ValidationError("session_started event sequence must be zero.")
        elif not _is_non_blank_string(self.turn_id):
            raise ValidationError("Turn-scoped God-code event must contain turn_id.")
        elif self.sequence <= 0:
            raise ValidationError("Turn-scoped God-code event sequence must be positive.")
        if not is_json_object(self.payload):
            raise ValidationError("God-code event payload must be a JSON-safe object.")
        if not _is_god_code_event_payload(self.event_type, self.payload):
            raise ValidationError("God-code event payload does not match event type.")

    def to_dict(self) -> JsonObject:
        data: JsonObject = {
            "event_type": self.event_type,
            "session_id": self.session_id,
            "sequence": self.sequence,
            "payload": self.payload,
        }
        if self.turn_id is not None:
            data["turn_id"] = self.turn_id
        return data


def _is_non_blank_string(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_assistant_message_payload(value: object) -> bool:
    return (
        isinstance(value, dict)
        and value.get("role") == "assistant"
        and isinstance(value.get("content"), str)
    )


def _is_tool_error_payload(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    details = value.get("details")
    return (
        _is_non_blank_string(value.get("code"))
        and _is_non_blank_string(value.get("message"))
        and ("details" not in value or isinstance(details, dict))
        and ("details" not in value or is_json_object(details))
    )


def _is_tool_result_payload(value: object) -> bool:
    try:
        parse_tool_execution_result(value)
    except ValidationError:
        return False
    return True


def _is_turn_result_payload(value: JsonMapping) -> bool:
    status = value.get("status")
    assistant_message = value.get("assistant_message")
    error = value.get("error")
    if status == "success":
        return _is_assistant_message_payload(assistant_message) and "error" not in value
    if status == "error":
        return "assistant_message" not in value and _is_tool_error_payload(error)
    return status == "cancelled" and "assistant_message" not in value and "error" not in value


def _is_god_code_event_payload(event_type: str, payload: JsonMapping) -> bool:
    if event_type == "session_started":
        return _is_non_blank_string(payload.get("cwd")) and _is_non_blank_string(
            payload.get("model_adapter")
        )
    if event_type == "turn_started":
        return True
    if event_type == "assistant_delta":
        delta = payload.get("delta")
        return isinstance(delta, dict) and isinstance(delta.get("text"), str)
    if event_type == "assistant_message":
        return _is_assistant_message_payload(payload.get("message"))
    if event_type == "tool_call_requested":
        tool_call = payload.get("tool_call")
        execution_mode = payload.get("execution_mode")
        return (
            isinstance(tool_call, dict)
            and _is_non_blank_string(tool_call.get("tool_call_id"))
            and _is_non_blank_string(tool_call.get("tool_name"))
            and isinstance(tool_call.get("input"), dict)
            and ("execution_mode" not in payload or _is_non_blank_string(execution_mode))
        )
    if event_type == "tool_result_received":
        return (
            _is_non_blank_string(payload.get("tool_call_id"))
            and _is_non_blank_string(payload.get("tool_name"))
            and _is_tool_result_payload(payload.get("result"))
        )
    if event_type == "turn_finished":
        return _is_turn_result_payload(payload)
    if event_type == "god_code_error":
        return _is_tool_error_payload(payload.get("error"))
    return False


def build_tool_error(
    code: str, message: str, details: JsonObject | None = None
) -> ToolExecutionError:
    return ToolExecutionError(code=code, message=message, details=details)


def require_mapping(value: object, field_name: str) -> JsonMapping:
    if not isinstance(value, dict):
        raise ValidationError(f"Expected object for {field_name}.")
    return value


def require_dict(value: object, field_name: str) -> JsonObject:
    mapping = require_mapping(value, field_name)
    return dict(mapping)


def require_str(mapping: JsonMapping, key: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or value == "":
        raise ValidationError(f"Expected non-empty string field: {key}.")
    return value


def require_optional_str(mapping: JsonMapping, key: str) -> str | None:
    value = mapping.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValidationError(f"Expected string field: {key}.")
    return value


def require_list(mapping: JsonMapping, key: str) -> JsonList:
    value = mapping.get(key)
    if not isinstance(value, list):
        raise ValidationError(f"Expected list field: {key}.")
    return value


def parse_prompt_message(value: object) -> PromptMessage:
    mapping = require_mapping(value, "prompt")
    if not is_json_object(dict(mapping)):
        raise ValidationError("Prompt must contain only JSON values.")
    role = require_str(mapping, "role")
    content = require_str(mapping, "content")
    if role != "user":
        raise ValidationError("Prompt messages must use role=user.")
    return PromptMessage(role=role, content=content)


def parse_turn_options(value: object) -> JsonObject:
    options = require_dict(value, "turn_options")
    if not is_json_object(options):
        raise ValidationError("Turn options must contain only JSON values.")

    stream = options.get("stream")
    if stream is not None and not isinstance(stream, bool):
        raise ValidationError("Expected boolean turn option: stream.")

    max_tokens = options.get("max_tokens")
    if max_tokens is not None and (
        not isinstance(max_tokens, int)
        or isinstance(max_tokens, bool)
        or abs(max_tokens) > JSON_SAFE_INTEGER_MAX
    ):
        raise ValidationError("Expected safe integer turn option: max_tokens.")

    temperature = options.get("temperature")
    if temperature is not None and (
        isinstance(temperature, bool) or not isinstance(temperature, int | float)
    ):
        raise ValidationError("Expected numeric turn option: temperature.")

    provider = options.get("provider")
    if provider is not None and not isinstance(provider, str):
        raise ValidationError("Expected string turn option: provider.")
    return options


def parse_tool_catalog(entries: object) -> list[ToolCatalogEntry]:
    if not isinstance(entries, list):
        raise ValidationError("Expected list for tool_catalog.")
    parsed: list[ToolCatalogEntry] = []
    names: set[str] = set()
    for entry in entries:
        mapping = require_mapping(entry, "tool_catalog entry")
        if not is_json_object(dict(mapping)):
            raise ValidationError("Tool catalog entries must contain only JSON values.")
        name = require_str(mapping, "name")
        description = require_str(mapping, "description")
        if not name.strip() or not description.strip():
            raise ValidationError("Tool name and description must be non-empty strings.")
        if name in names:
            raise ValidationError(f"Duplicate tool catalog name: {name}.")
        names.add(name)
        input_schema = mapping.get("input_schema")
        if input_schema is not None and not is_json_object(input_schema):
            raise ValidationError("Expected object field: input_schema.")
        parsed.append(
            ToolCatalogEntry(
                name=name,
                description=description,
                input_schema=dict(input_schema) if isinstance(input_schema, dict) else None,
            )
        )
    return parsed


def parse_initial_messages(value: object) -> Messages:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValidationError("Expected list field: initial_messages.")

    parsed: Messages = []
    for index, entry in enumerate(value):
        mapping = require_mapping(entry, f"initial_messages[{index}]")
        if not is_json_object(dict(mapping)):
            raise ValidationError("Initial messages must contain only JSON values.")
        kind = require_str(mapping, "kind")

        if kind == "user":
            role = require_str(mapping, "role")
            if role != "user":
                raise ValidationError("User history messages must use role=user.")
            parsed.append(
                {
                    "kind": "user",
                    "role": role,
                    "content": require_str(mapping, "content"),
                }
            )
            continue

        if kind == "assistant":
            role = require_str(mapping, "role")
            if role != "assistant":
                raise ValidationError("Assistant history messages must use role=assistant.")
            parsed.append(
                {
                    "kind": "assistant",
                    "role": role,
                    "content": require_str(mapping, "content"),
                }
            )
            continue

        if kind == "tool_call":
            tool_call = require_dict(mapping.get("tool_call"), "initial_messages tool_call")
            if not is_json_object(tool_call):
                raise ValidationError("Initial tool calls must contain only JSON values.")
            parsed.append(
                {
                    "kind": "tool_call",
                    "tool_call": tool_call,
                }
            )
            continue

        if kind == "tool_result":
            tool_name = require_str(mapping, "tool_name")
            result = require_dict(mapping.get("result"), "initial_messages result")
            if not tool_name.strip() or not is_json_object(result):
                raise ValidationError("Initial tool results must use valid JSON identities and values.")
            message: JsonObject = {
                "kind": "tool_result",
                "tool_name": tool_name,
                "result": result,
            }
            tool_call_id = require_optional_str(mapping, "tool_call_id")
            if tool_call_id is not None and not tool_call_id.strip():
                raise ValidationError("Tool call id must be a non-empty string.")
            if tool_call_id is not None:
                message["tool_call_id"] = tool_call_id
            parsed.append(message)
            continue

        raise ValidationError(f"Unsupported initial_messages kind: {kind}.")

    return parsed


def parse_tool_execution_result(value: object) -> ToolExecutionResult:
    mapping = require_mapping(value, "tool execution result")
    if not is_json_object(dict(mapping)):
        raise ValidationError("Tool execution result must contain only JSON values.")
    ok = mapping.get("ok")
    if not isinstance(ok, bool):
        raise ValidationError("Expected boolean field: ok.")

    output = mapping.get("output")
    if "output" in mapping and not isinstance(output, dict):
        raise ValidationError("Expected object field: output.")

    error_payload = mapping.get("error")
    error: ToolExecutionError | None = None
    if "error" in mapping:
        error_mapping = require_mapping(error_payload, "error")
        details = error_mapping.get("details")
        if "details" in error_mapping and not isinstance(details, dict):
            raise ValidationError("Expected object field: error.details.")
        error = ToolExecutionError(
            code=require_str(error_mapping, "code"),
            message=require_str(error_mapping, "message"),
            details=dict(details) if isinstance(details, dict) else None,
        )

    if ok and error is not None:
        raise ValidationError("Successful tool execution result must not contain error.")
    if not ok and error is None:
        raise ValidationError("Failed tool execution result must contain error.")

    return ToolExecutionResult(ok=ok, output=dict(output) if isinstance(output, dict) else None, error=error)
