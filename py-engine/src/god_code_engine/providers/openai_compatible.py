from __future__ import annotations

import json
import os
from collections.abc import Iterator
from collections.abc import Mapping
from dataclasses import dataclass, field

from god_code_engine.api.god_code_api_models import ToolCatalogEntry, TOOL_NAMES
from god_code_engine.models.base import ModelRequest
from god_code_engine.providers.base import ProviderResponseError
from god_code_engine.providers.config import ProviderConfig
from god_code_engine.providers.errors import map_openai_stream_error_to_info
from god_code_engine.providers.http_client import HttpProviderClient, ProviderClientError
from god_code_engine.providers.transport import HttpTransport, UrllibHttpTransport
from god_code_engine.providers.usage import (
    attach_provider_usage,
    openai_chat_usage_from_raw,
    usage_to_dict,
)
from god_code_engine.types import JsonMapping, JsonObject, Messages

OPENAI_COMPAT_DEFAULT_BASE_URL = "https://api.openai.com/v1"
LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1"


class OpenAICompatibleProviderClient(HttpProviderClient):
    supports_stream = True

    def __init__(
        self,
        transport: HttpTransport | None = None,
        environ: Mapping[str, str] | None = None,
        *,
        require_api_key: bool = True,
    ) -> None:
        self._transport = transport or UrllibHttpTransport()
        self._environ = environ if environ is not None else os.environ
        self._require_api_key = require_api_key

    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        headers = self._headers(config)
        body = self._request_body(request, config, stream=False)

        try:
            raw = self._transport.post_json(
                url=f"{_base_url_for(config)}/chat/completions",
                headers=headers,
                body=body,
                timeout_s=config.timeout_s,
            )
        except ProviderClientError as exc:
            _raise_with_provider(exc, config.name)
        except Exception as exc:  # noqa: BLE001
            raise ProviderClientError(str(exc)) from exc

        return map_openai_chat_completion_to_provider_payload(
            raw,
            allow_parallel_tool_calls=config.tool_use.parallel_tool_calls,
        )

    def stream(
        self,
        request: ModelRequest,
        config: ProviderConfig,
    ) -> Iterator[JsonMapping]:
        headers = self._headers(config)
        body = self._request_body(request, config, stream=True)

        try:
            lines = self._transport.post_sse(
                url=f"{_base_url_for(config)}/chat/completions",
                headers=headers,
                body=body,
                timeout_s=config.timeout_s,
            )
            yield from stream_openai_chat_completion_payloads(
                lines,
                allow_parallel_tool_calls=config.tool_use.parallel_tool_calls,
            )
        except ProviderClientError as exc:
            _raise_with_provider(exc, config.name)
        except ProviderResponseError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise ProviderClientError(str(exc)) from exc

    def _request_body(
        self,
        request: ModelRequest,
        config: ProviderConfig,
        *,
        stream: bool,
    ) -> JsonObject:
        messages = format_openai_messages(request.messages)
        if request.system_prompt is not None:
            messages.insert(0, {"role": "system", "content": request.system_prompt})

        body: JsonObject = {
            "model": config.model,
            "messages": messages,
            "tool_choice": "auto",
            "parallel_tool_calls": config.tool_use.parallel_tool_calls,
        }
        if stream:
            body["stream"] = True
        if request.options.max_tokens is not None:
            body["max_tokens"] = request.options.max_tokens
        if request.options.temperature is not None:
            body["temperature"] = request.options.temperature

        tools = format_openai_tools(request.tools)
        if tools:
            body["tools"] = tools
        return body

    def _api_key(self, config: ProviderConfig) -> str:
        if config.api_key_env is None:
            raise ProviderClientError("Provider config does not define api_key_env.")
        value = self._environ.get(config.api_key_env)
        if value is None or value.strip() == "":
            raise ProviderClientError(
                f"Provider API key environment variable is not set: {config.api_key_env}"
            )
        return value

    def _headers(self, config: ProviderConfig) -> JsonObject:
        headers: JsonObject = {"Content-Type": "application/json"}
        if config.api_key_env is None:
            if self._require_api_key:
                raise ProviderClientError("Provider config does not define api_key_env.")
            return headers
        headers["Authorization"] = f"Bearer {self._api_key(config)}"
        return headers


def format_openai_messages(messages: Messages) -> list[JsonObject]:
    formatted: list[JsonObject] = []
    for message in messages:
        kind = message.get("kind")

        if kind == "user":
            formatted.append({"role": "user", "content": _string_value(message, "content")})
            continue

        if kind == "assistant":
            formatted.append({"role": "assistant", "content": _string_value(message, "content")})
            continue

        if kind == "tool_call":
            tool_call = _mapping_value(message, "tool_call")
            formatted.append(
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": _string_value(tool_call, "tool_call_id"),
                            "type": "function",
                            "function": {
                                "name": _string_value(tool_call, "tool_name"),
                                "arguments": _json_string(_mapping_value(tool_call, "input")),
                            },
                        }
                    ],
                }
            )
            continue

        if kind == "tool_result":
            formatted.append(
                {
                    "role": "tool",
                    "tool_call_id": _string_value(message, "tool_call_id"),
                    "content": _json_string(_mapping_value(message, "result")),
                }
            )
            continue

        raise ProviderResponseError(f"Unsupported message kind for OpenAI formatter: {kind!r}")

    return formatted


def format_openai_tools(tools: list[ToolCatalogEntry]) -> list[JsonObject]:
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": dict(tool.input_schema)
                if tool.input_schema is not None
                else _schema_for_tool(tool.name),
            },
        }
        for tool in tools
    ]


def map_openai_chat_completion_to_provider_payload(
    raw: JsonMapping,
    *,
    allow_parallel_tool_calls: bool = False,
) -> JsonObject:
    choices = raw.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ProviderResponseError("OpenAI response must contain at least one choice.")

    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        raise ProviderResponseError("OpenAI response choice must be an object.")

    message = first_choice.get("message")
    if not isinstance(message, dict):
        raise ProviderResponseError("OpenAI response choice is missing message.")

    tool_calls = message.get("tool_calls")
    if isinstance(tool_calls, list) and tool_calls:
        if len(tool_calls) != 1 and not allow_parallel_tool_calls:
            raise ProviderResponseError("OpenAI response returned multiple tool calls.")
        return attach_provider_usage(
            _map_openai_tool_calls(tool_calls),
            openai_chat_usage_from_raw(raw),
        )
    if tool_calls is not None and not isinstance(tool_calls, list):
        raise ProviderResponseError("OpenAI response tool_calls must be a list.")

    content = message.get("content")
    if not isinstance(content, str):
        raise ProviderResponseError("OpenAI assistant content must be a string.")
    return attach_provider_usage(
        {"kind": "assistant", "content": content},
        openai_chat_usage_from_raw(raw),
    )


def stream_openai_chat_completion_payloads(
    lines: Iterator[str],
    *,
    allow_parallel_tool_calls: bool = False,
) -> Iterator[JsonObject]:
    accumulator = _OpenAIStreamingAccumulator(
        allow_parallel_tool_calls=allow_parallel_tool_calls,
    )
    saw_terminal_event = False

    for data in _iter_sse_data(lines):
        if data == "[DONE]":
            saw_terminal_event = True
            break

        try:
            decoded = json.loads(data)
        except json.JSONDecodeError as exc:
            raise ProviderResponseError("OpenAI streaming event must be valid JSON.") from exc
        if not isinstance(decoded, dict):
            raise ProviderResponseError("OpenAI streaming event must be a JSON object.")
        if isinstance(decoded.get("error"), dict):
            raise ProviderClientError.from_error_info(
                map_openai_stream_error_to_info(dict(decoded))
            )

        yield from accumulator.consume(dict(decoded))
        if accumulator.is_terminal:
            saw_terminal_event = True

    if not saw_terminal_event and not accumulator.is_terminal:
        raise ProviderResponseError("OpenAI stream ended before a terminal response was received.")

    yield accumulator.final_payload()


def _map_openai_tool_calls(raw_tool_calls: list[object]) -> JsonObject:
    payloads = [_map_openai_tool_call(raw_tool_call) for raw_tool_call in raw_tool_calls]
    if len(payloads) == 1:
        return payloads[0]

    seen_ids: set[str] = set()
    tool_calls: list[JsonObject] = []
    for payload in payloads:
        tool_call_id = _string_value(payload, "tool_call_id")
        if tool_call_id in seen_ids:
            raise ProviderResponseError(f"OpenAI response returned duplicate tool call id: {tool_call_id}")
        seen_ids.add(tool_call_id)
        tool_calls.append(
            {
                "tool_call_id": tool_call_id,
                "tool_name": _string_value(payload, "tool_name"),
                "input": _mapping_value(payload, "input"),
            }
        )
    return {"kind": "tool_call_batch", "tool_calls": tool_calls}


def _map_openai_tool_call(raw_tool_call: object) -> JsonObject:
    if not isinstance(raw_tool_call, dict):
        raise ProviderResponseError("OpenAI tool call must be an object.")
    if raw_tool_call.get("type") != "function":
        raise ProviderResponseError("OpenAI tool call must have type='function'.")

    function = raw_tool_call.get("function")
    if not isinstance(function, dict):
        raise ProviderResponseError("OpenAI function tool call is missing function payload.")

    arguments = _string_value(function, "arguments")
    try:
        input_payload = json.loads(arguments)
    except json.JSONDecodeError as exc:
        raise ProviderResponseError("OpenAI function arguments must be valid JSON.") from exc
    if not isinstance(input_payload, dict):
        raise ProviderResponseError("OpenAI function arguments must be a JSON object.")

    return {
        "kind": "tool_call",
        "tool_call_id": _string_value(raw_tool_call, "id"),
        "tool_name": _string_value(function, "name"),
        "input": dict(input_payload),
    }


def _schema_for_tool(tool_name: str) -> JsonObject:
    schemas = {
        "Read": _object_schema({"path": "string"}, ["path"]),
        "Edit": _object_schema(
            {"path": "string", "find": "string", "replace": "string"},
            ["path", "find", "replace"],
        ),
        "Bash": _object_schema(
            {"command": "string", "cwd": "string", "timeout_ms": "integer"},
            ["command"],
        ),
        "ListFiles": _object_schema(
            {"path": "string", "recursive": "boolean", "max_entries": "integer"},
            ["path"],
        ),
        "Search": _object_schema(
            {"path": "string", "pattern": "string", "recursive": "boolean", "max_matches": "integer"},
            ["path", "pattern"],
        ),
        "Write": _object_schema(
            {"path": "string", "content": "string", "overwrite": "boolean"},
            ["path", "content"],
        ),
    }
    schema = schemas.get(tool_name)
    if schema is not None and tool_name in TOOL_NAMES:
        return schema
    return {"type": "object", "additionalProperties": True}


def _object_schema(properties: Mapping[str, str], required: list[str]) -> JsonObject:
    return {
        "type": "object",
        "properties": {
            name: {"type": property_type}
            for name, property_type in properties.items()
        },
        "required": required,
        "additionalProperties": False,
    }


def _base_url_for(config: ProviderConfig) -> str:
    base_url = config.base_url or OPENAI_COMPAT_DEFAULT_BASE_URL
    return base_url.rstrip("/")


def _raise_with_provider(error: ProviderClientError, provider: str) -> None:
    mapped = error.with_provider(provider)
    if mapped is error:
        raise error
    raise mapped from error


def _mapping_value(mapping: JsonMapping, key: str) -> JsonObject:
    value = mapping.get(key)
    if not isinstance(value, dict):
        raise ProviderResponseError(f"Expected object field for OpenAI formatter: {key}")
    return dict(value)


def _string_value(mapping: JsonMapping, key: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str):
        raise ProviderResponseError(f"Expected string field for OpenAI formatter: {key}")
    return value


def _json_string(value: JsonMapping) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _iter_sse_data(lines: Iterator[str]) -> Iterator[str]:
    buffer: list[str] = []
    for line in lines:
        if line == "":
            if buffer:
                yield "\n".join(buffer)
                buffer.clear()
            continue

        if line.startswith(":"):
            continue
        if line.startswith("data:"):
            buffer.append(line[5:].lstrip())
            continue

    if buffer:
        yield "\n".join(buffer)


@dataclass(slots=True)
class _OpenAIToolCallStreamState:
    tool_call_id: str | None = None
    tool_name_parts: list[str] = field(default_factory=list)
    tool_argument_parts: list[str] = field(default_factory=list)


@dataclass(slots=True)
class _OpenAIStreamingAccumulator:
    allow_parallel_tool_calls: bool = False
    text_parts: list[str] = field(default_factory=list)
    tool_calls: dict[int, _OpenAIToolCallStreamState] = field(default_factory=dict)
    finish_reason: str | None = None
    usage: JsonObject | None = None

    @property
    def is_terminal(self) -> bool:
        return self.finish_reason is not None

    def consume(self, chunk: JsonMapping) -> list[JsonObject]:
        usage = openai_chat_usage_from_raw(chunk)
        if usage is not None:
            self.usage = usage_to_dict(usage)

        choices = chunk.get("choices")
        if choices == [] and usage is not None:
            return []
        if not isinstance(choices, list) or not choices:
            raise ProviderResponseError("OpenAI streaming chunk must contain at least one choice.")
        if len(choices) != 1:
            raise ProviderResponseError("OpenAI streaming chunk returned multiple choices.")

        choice = choices[0]
        if not isinstance(choice, dict):
            raise ProviderResponseError("OpenAI streaming choice must be an object.")

        finish_reason = choice.get("finish_reason")
        if finish_reason is not None:
            if not isinstance(finish_reason, str):
                raise ProviderResponseError("OpenAI streaming finish_reason must be a string.")
            self.finish_reason = finish_reason

        delta = choice.get("delta")
        if delta is None:
            return []
        if not isinstance(delta, dict):
            raise ProviderResponseError("OpenAI streaming delta must be an object.")

        events: list[JsonObject] = []
        content = delta.get("content")
        if content is not None:
            if not isinstance(content, str):
                raise ProviderResponseError("OpenAI streaming content delta must be a string.")
            if content != "":
                self.text_parts.append(content)
                events.append({"kind": "delta", "text": content})

        tool_calls = delta.get("tool_calls")
        if tool_calls is not None:
            self._consume_tool_calls(tool_calls)

        return events

    def final_payload(self) -> JsonObject:
        if self.tool_calls:
            payloads = [
                self._tool_call_payload(index, state)
                for index, state in sorted(self.tool_calls.items())
            ]
            if len(payloads) == 1:
                return self._with_usage(payloads[0])
            return self._with_usage(
                {
                    "kind": "tool_call_batch",
                    "tool_calls": [
                        {
                            "tool_call_id": _string_value(payload, "tool_call_id"),
                            "tool_name": _string_value(payload, "tool_name"),
                            "input": _mapping_value(payload, "input"),
                        }
                        for payload in payloads
                    ],
                }
            )

        if self.finish_reason == "tool_calls":
            raise ProviderResponseError("OpenAI stream ended with tool_calls but no tool call payload.")
        if not self.text_parts and self.finish_reason is None:
            raise ProviderResponseError("OpenAI stream ended without a final response.")
        return self._with_usage({"kind": "assistant", "content": "".join(self.text_parts)})

    def _with_usage(self, payload: JsonObject) -> JsonObject:
        if self.usage is not None:
            payload["provider_usage"] = dict(self.usage)
        return payload

    def _consume_tool_calls(self, tool_calls: object) -> None:
        if not isinstance(tool_calls, list) or not tool_calls:
            raise ProviderResponseError("OpenAI streaming tool_calls must be a non-empty list.")
        if len(tool_calls) != 1 and not self.allow_parallel_tool_calls:
            raise ProviderResponseError("OpenAI streaming only supports a single tool call.")

        for tool_call in tool_calls:
            self._consume_tool_call(tool_call)

    def _consume_tool_call(self, tool_call: object) -> None:
        if not isinstance(tool_call, dict):
            raise ProviderResponseError("OpenAI streaming tool call delta must be an object.")

        index = tool_call.get("index")
        if index is None:
            index = 0
        if not isinstance(index, int) or isinstance(index, bool) or index < 0:
            raise ProviderResponseError("OpenAI streaming tool call index must be a non-negative integer.")
        if index != 0 and not self.allow_parallel_tool_calls:
            raise ProviderResponseError("OpenAI streaming only supports tool call index 0.")
        state = self.tool_calls.setdefault(index, _OpenAIToolCallStreamState())

        tool_call_id = tool_call.get("id")
        if tool_call_id is not None:
            if not isinstance(tool_call_id, str) or tool_call_id == "":
                raise ProviderResponseError("OpenAI streaming tool call id must be a string.")
            if state.tool_call_id is None:
                state.tool_call_id = tool_call_id
            elif state.tool_call_id != tool_call_id:
                raise ProviderResponseError("OpenAI streaming returned multiple tool call ids.")

        tool_type = tool_call.get("type")
        if tool_type not in (None, "function"):
            raise ProviderResponseError("OpenAI streaming tool call must have type='function'.")

        function = tool_call.get("function")
        if function is None:
            return
        if not isinstance(function, dict):
            raise ProviderResponseError("OpenAI streaming function payload must be an object.")

        name = function.get("name")
        if name is not None:
            if not isinstance(name, str):
                raise ProviderResponseError("OpenAI streaming function name must be a string.")
            state.tool_name_parts.append(name)

        arguments = function.get("arguments")
        if arguments is not None:
            if not isinstance(arguments, str):
                raise ProviderResponseError("OpenAI streaming function arguments must be a string.")
            state.tool_argument_parts.append(arguments)

    def _tool_call_payload(
        self,
        index: int,
        state: _OpenAIToolCallStreamState,
    ) -> JsonObject:
        if state.tool_call_id is None:
            raise ProviderResponseError("OpenAI streaming tool call is missing id.")
        tool_name = "".join(state.tool_name_parts)
        if tool_name == "":
            raise ProviderResponseError("OpenAI streaming tool call is missing function name.")
        arguments = "".join(state.tool_argument_parts)
        try:
            input_payload = json.loads(arguments)
        except json.JSONDecodeError as exc:
            raise ProviderResponseError(
                "OpenAI streaming tool arguments must be valid JSON."
            ) from exc
        if not isinstance(input_payload, dict):
            raise ProviderResponseError(
                "OpenAI streaming tool arguments must decode to a JSON object."
            )
        return {
            "kind": "tool_call",
            "tool_call_id": state.tool_call_id,
            "tool_name": tool_name,
            "input": dict(input_payload),
        }
