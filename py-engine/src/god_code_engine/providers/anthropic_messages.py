from __future__ import annotations

import json
import os
from collections.abc import Iterator, Mapping
from dataclasses import dataclass, field

from god_code_engine.api.god_code_api_models import ToolCatalogEntry, TOOL_NAMES
from god_code_engine.models.base import ModelRequest
from god_code_engine.providers.base import ProviderResponseError
from god_code_engine.providers.config import ProviderConfig
from god_code_engine.providers.errors import map_anthropic_stream_error_to_info
from god_code_engine.providers.http_client import HttpProviderClient, ProviderClientError
from god_code_engine.providers.transport import HttpTransport, UrllibHttpTransport
from god_code_engine.providers.usage import (
    ProviderUsage,
    anthropic_usage_from_raw,
    attach_provider_usage,
    usage_to_dict,
)
from god_code_engine.types import JsonMapping, JsonObject, Messages

ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com"
DEFAULT_ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_ANTHROPIC_MAX_TOKENS = 1024


class AnthropicMessagesProviderClient(HttpProviderClient):
    supports_stream = True

    def __init__(
        self,
        transport: HttpTransport | None = None,
        environ: Mapping[str, str] | None = None,
    ) -> None:
        self._transport = transport or UrllibHttpTransport()
        self._environ = environ if environ is not None else os.environ

    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        headers = self._headers(config)
        body = self._request_body(request, config, stream=False)

        try:
            raw = self._transport.post_json(
                url=_messages_url_for(config),
                headers=headers,
                body=body,
                timeout_s=config.timeout_s,
            )
        except ProviderClientError as exc:
            _raise_with_provider(exc, config.name)
        except Exception as exc:  # noqa: BLE001
            raise ProviderClientError(str(exc)) from exc

        return map_anthropic_message_to_provider_payload(
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
                url=_messages_url_for(config),
                headers=headers,
                body=body,
                timeout_s=config.timeout_s,
            )
            yield from stream_anthropic_message_payloads(
                lines,
                allow_parallel_tool_calls=config.tool_use.parallel_tool_calls,
            )
        except ProviderClientError as exc:
            _raise_with_provider(exc, config.name)
        except ProviderResponseError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise ProviderClientError(str(exc)) from exc

    def _headers(self, config: ProviderConfig) -> JsonObject:
        return {
            "x-api-key": self._api_key(config),
            "anthropic-version": _anthropic_version(self._environ),
            "Content-Type": "application/json",
        }

    def _request_body(
        self,
        request: ModelRequest,
        config: ProviderConfig,
        *,
        stream: bool,
    ) -> JsonObject:
        body: JsonObject = {
            "model": config.model,
            "messages": format_anthropic_messages(request.messages),
            "max_tokens": request.options.max_tokens or DEFAULT_ANTHROPIC_MAX_TOKENS,
        }
        if request.system_prompt is not None:
            body["system"] = request.system_prompt
        if stream:
            body["stream"] = True
        if request.options.temperature is not None:
            body["temperature"] = request.options.temperature

        tools = format_anthropic_tools(request.tools)
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


def format_anthropic_messages(messages: Messages) -> list[JsonObject]:
    formatted: list[JsonObject] = []
    for message in messages:
        kind = message.get("kind")

        if kind == "user":
            formatted.append(
                {
                    "role": "user",
                    "content": [{"type": "text", "text": _string_value(message, "content")}],
                }
            )
            continue

        if kind == "assistant":
            formatted.append(
                {
                    "role": "assistant",
                    "content": [{"type": "text", "text": _string_value(message, "content")}],
                }
            )
            continue

        if kind == "tool_call":
            tool_call = _mapping_value(message, "tool_call")
            formatted.append(
                {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": _string_value(tool_call, "tool_call_id"),
                            "name": _string_value(tool_call, "tool_name"),
                            "input": _mapping_value(tool_call, "input"),
                        }
                    ],
                }
            )
            continue

        if kind == "tool_result":
            formatted.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": _string_value(message, "tool_call_id"),
                            "content": _json_string(_mapping_value(message, "result")),
                        }
                    ],
                }
            )
            continue

        raise ProviderResponseError(f"Unsupported message kind for Anthropic formatter: {kind!r}")

    return formatted


def format_anthropic_tools(tools: list[ToolCatalogEntry]) -> list[JsonObject]:
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "input_schema": dict(tool.input_schema)
            if tool.input_schema is not None
            else _schema_for_tool(tool.name),
        }
        for tool in tools
    ]


def map_anthropic_message_to_provider_payload(
    raw: JsonMapping,
    *,
    allow_parallel_tool_calls: bool = False,
) -> JsonObject:
    content = raw.get("content")
    if not isinstance(content, list):
        raise ProviderResponseError("Anthropic response content must be a list.")

    text_parts: list[str] = []
    tool_blocks: list[JsonObject] = []
    for block in content:
        if not isinstance(block, dict):
            raise ProviderResponseError("Anthropic response content block must be an object.")
        block_type = block.get("type")
        if block_type == "text":
            text = block.get("text")
            if not isinstance(text, str):
                raise ProviderResponseError("Anthropic text block must include string text.")
            text_parts.append(text)
            continue
        if block_type == "tool_use":
            tool_blocks.append(dict(block))
            continue

    if tool_blocks:
        if len(tool_blocks) != 1 and not allow_parallel_tool_calls:
            raise ProviderResponseError("Anthropic response returned multiple tool_use blocks.")
        if len(tool_blocks) > 1:
            return attach_provider_usage(
                _map_tool_use_batch(tool_blocks),
                anthropic_usage_from_raw(raw),
            )
        return attach_provider_usage(
            _map_tool_use_block(tool_blocks[0]),
            anthropic_usage_from_raw(raw),
        )

    if text_parts:
        return attach_provider_usage(
            {"kind": "assistant", "content": "".join(text_parts)},
            anthropic_usage_from_raw(raw),
        )

    raise ProviderResponseError("Anthropic response did not contain assistant text or tool_use.")


def stream_anthropic_message_payloads(
    lines: Iterator[str],
    *,
    allow_parallel_tool_calls: bool = False,
) -> Iterator[JsonObject]:
    accumulator = _AnthropicStreamingAccumulator(
        allow_parallel_tool_calls=allow_parallel_tool_calls,
    )
    saw_terminal_event = False

    for data in _iter_sse_data(lines):
        try:
            decoded = json.loads(data)
        except json.JSONDecodeError as exc:
            raise ProviderResponseError("Anthropic streaming event must be valid JSON.") from exc
        if not isinstance(decoded, dict):
            raise ProviderResponseError("Anthropic streaming event must be a JSON object.")

        event_type = decoded.get("type")
        if event_type == "ping":
            continue
        if event_type == "error":
            raise ProviderClientError.from_error_info(
                map_anthropic_stream_error_to_info(dict(decoded))
            )

        yield from accumulator.consume(dict(decoded))
        if event_type == "message_stop":
            saw_terminal_event = True
            break

    if not saw_terminal_event:
        raise ProviderResponseError("Anthropic stream ended before message_stop.")

    yield accumulator.final_payload()


def _map_tool_use_block(block: JsonMapping) -> JsonObject:
    tool_input = block.get("input")
    if not isinstance(tool_input, dict):
        raise ProviderResponseError("Anthropic tool_use input must be a JSON object.")
    return {
        "kind": "tool_call",
        "tool_call_id": _string_value(block, "id"),
        "tool_name": _string_value(block, "name"),
        "input": dict(tool_input),
    }


def _map_tool_use_batch(blocks: list[JsonObject]) -> JsonObject:
    payloads = [_map_tool_use_block(block) for block in blocks]
    seen_ids: set[str] = set()
    tool_calls: list[JsonObject] = []
    for payload in payloads:
        tool_call_id = _string_value(payload, "tool_call_id")
        if tool_call_id in seen_ids:
            raise ProviderResponseError(
                f"Anthropic response returned duplicate tool_use id: {tool_call_id}"
            )
        seen_ids.add(tool_call_id)
        tool_calls.append(
            {
                "tool_call_id": tool_call_id,
                "tool_name": _string_value(payload, "tool_name"),
                "input": _mapping_value(payload, "input"),
            }
        )
    return {"kind": "tool_call_batch", "tool_calls": tool_calls}


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


def _messages_url_for(config: ProviderConfig) -> str:
    base_url = (config.base_url or ANTHROPIC_DEFAULT_BASE_URL).rstrip("/")
    if base_url.endswith("/v1"):
        return f"{base_url}/messages"
    return f"{base_url}/v1/messages"


def _raise_with_provider(error: ProviderClientError, provider: str) -> None:
    mapped = error.with_provider(provider)
    if mapped is error:
        raise error
    raise mapped from error


def _anthropic_version(environ: Mapping[str, str]) -> str:
    value = environ.get("GOD_CODE_ANTHROPIC_VERSION")
    if value is None or value.strip() == "":
        return DEFAULT_ANTHROPIC_VERSION
    return value.strip()


def _mapping_value(mapping: JsonMapping, key: str) -> JsonObject:
    value = mapping.get(key)
    if not isinstance(value, dict):
        raise ProviderResponseError(f"Expected object field for Anthropic formatter: {key}")
    return dict(value)


def _string_value(mapping: JsonMapping, key: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or value == "":
        raise ProviderResponseError(f"Expected non-empty string field for Anthropic formatter: {key}")
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

        if line.startswith(":") or line.startswith("event:"):
            continue
        if line.startswith("data:"):
            buffer.append(line[5:].lstrip())
            continue

    if buffer:
        yield "\n".join(buffer)


@dataclass(slots=True)
class _AnthropicToolUseStreamState:
    tool_call_id: str | None = None
    tool_name: str | None = None
    tool_input_parts: list[str] = field(default_factory=list)


@dataclass(slots=True)
class _AnthropicStreamingAccumulator:
    allow_parallel_tool_calls: bool = False
    text_parts: list[str] = field(default_factory=list)
    tool_blocks: dict[int, _AnthropicToolUseStreamState] = field(default_factory=dict)
    usage_input_tokens: int | None = None
    usage_output_tokens: int | None = None

    def consume(self, event: JsonMapping) -> list[JsonObject]:
        event_type = event.get("type")
        if event_type == "message_start":
            message = event.get("message")
            if isinstance(message, dict):
                self._consume_usage(message)
            return []
        if event_type == "message_delta":
            self._consume_usage(event)
            return []
        if event_type == "content_block_start":
            self._consume_block_start(event)
            return []
        if event_type == "content_block_delta":
            return self._consume_block_delta(event)
        if event_type in {"content_block_stop", "message_stop"}:
            return []
        raise ProviderResponseError(f"Unsupported Anthropic streaming event type: {event_type!r}")

    def final_payload(self) -> JsonObject:
        if self.tool_blocks:
            payloads = [
                self._tool_use_payload(index, state)
                for index, state in sorted(self.tool_blocks.items())
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

        if self.text_parts:
            return self._with_usage({"kind": "assistant", "content": "".join(self.text_parts)})
        raise ProviderResponseError("Anthropic stream ended without a final response.")

    def _with_usage(self, payload: JsonObject) -> JsonObject:
        if self.usage_input_tokens is None and self.usage_output_tokens is None:
            return payload
        total_tokens = (
            self.usage_input_tokens + self.usage_output_tokens
            if self.usage_input_tokens is not None and self.usage_output_tokens is not None
            else None
        )
        payload["provider_usage"] = usage_to_dict(
            ProviderUsage(
                input_tokens=self.usage_input_tokens,
                output_tokens=self.usage_output_tokens,
                total_tokens=total_tokens,
                source="anthropic-messages.usage",
            )
        )
        return payload

    def _consume_usage(self, raw: JsonMapping) -> None:
        usage = anthropic_usage_from_raw(raw)
        if usage is None:
            return
        if usage.input_tokens is not None:
            self.usage_input_tokens = usage.input_tokens
        if usage.output_tokens is not None:
            self.usage_output_tokens = usage.output_tokens

    def _consume_block_start(self, event: JsonMapping) -> None:
        index = event.get("index")
        if not isinstance(index, int) or isinstance(index, bool):
            raise ProviderResponseError("Anthropic content_block_start index must be an integer.")
        block = event.get("content_block")
        if not isinstance(block, dict):
            raise ProviderResponseError("Anthropic content_block_start must include content_block.")
        block_type = block.get("type")
        if block_type == "text":
            return
        if block_type != "tool_use":
            raise ProviderResponseError(
                f"Unsupported Anthropic streaming content block type: {block_type!r}"
            )
        if self.tool_blocks and not self.allow_parallel_tool_calls:
            raise ProviderResponseError("Anthropic streaming returned multiple tool_use blocks.")
        if index in self.tool_blocks:
            raise ProviderResponseError("Anthropic streaming returned duplicate tool_use index.")
        state = _AnthropicToolUseStreamState(
            tool_call_id=_string_value(block, "id"),
            tool_name=_string_value(block, "name"),
        )
        self.tool_blocks[index] = state
        initial_input = block.get("input")
        if initial_input not in (None, {}):
            if not isinstance(initial_input, dict):
                raise ProviderResponseError("Anthropic streaming tool_use input must be an object.")
            state.tool_input_parts.append(_json_string(initial_input))

    def _consume_block_delta(self, event: JsonMapping) -> list[JsonObject]:
        delta = event.get("delta")
        if not isinstance(delta, dict):
            raise ProviderResponseError("Anthropic content_block_delta must include delta object.")
        delta_type = delta.get("type")
        if delta_type == "text_delta":
            text = delta.get("text")
            if not isinstance(text, str):
                raise ProviderResponseError("Anthropic text_delta must include string text.")
            if text == "":
                return []
            self.text_parts.append(text)
            return [{"kind": "delta", "text": text}]
        if delta_type == "input_json_delta":
            index = event.get("index")
            if not isinstance(index, int) or isinstance(index, bool):
                raise ProviderResponseError("Anthropic input_json_delta index must be an integer.")
            state = self.tool_blocks.get(index)
            if state is None:
                raise ProviderResponseError("Anthropic streaming input_json_delta has no active tool_use.")
            if len(self.tool_blocks) > 1 and not self.allow_parallel_tool_calls:
                raise ProviderResponseError("Anthropic streaming returned multiple tool_use indexes.")
            partial_json = delta.get("partial_json")
            if not isinstance(partial_json, str):
                raise ProviderResponseError(
                    "Anthropic input_json_delta must include string partial_json."
                )
            state.tool_input_parts.append(partial_json)
            return []
        raise ProviderResponseError(f"Unsupported Anthropic streaming delta type: {delta_type!r}")

    def _tool_use_payload(
        self,
        index: int,
        state: _AnthropicToolUseStreamState,
    ) -> JsonObject:
        if state.tool_call_id is None:
            raise ProviderResponseError("Anthropic streaming tool_use is missing id.")
        if state.tool_name is None:
            raise ProviderResponseError("Anthropic streaming tool_use is missing name.")
        raw_input = "".join(state.tool_input_parts) or "{}"
        try:
            tool_input = json.loads(raw_input)
        except json.JSONDecodeError as exc:
            raise ProviderResponseError(
                "Anthropic streaming tool_use input must be valid JSON."
            ) from exc
        if not isinstance(tool_input, dict):
            raise ProviderResponseError(
                "Anthropic streaming tool_use input must decode to a JSON object."
            )
        return {
            "kind": "tool_call",
            "tool_call_id": state.tool_call_id,
            "tool_name": state.tool_name,
            "input": dict(tool_input),
        }
