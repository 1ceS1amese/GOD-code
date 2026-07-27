from __future__ import annotations

import json
import os
from collections.abc import Iterator, Mapping
from dataclasses import dataclass, field

from god_code_engine.api.god_code_api_models import ToolCatalogEntry, require_str
from god_code_engine.models.base import ModelRequest
from god_code_engine.providers.base import ProviderResponseError
from god_code_engine.providers.config import ProviderConfig
from god_code_engine.providers.errors import map_openai_error_to_info
from god_code_engine.providers.http_client import HttpProviderClient, ProviderClientError
from god_code_engine.providers.openai_compatible import format_openai_tools
from god_code_engine.providers.transport import HttpTransport, UrllibHttpTransport
from god_code_engine.providers.usage import attach_provider_usage, openai_responses_usage_from_raw
from god_code_engine.types import JsonMapping, JsonObject, JsonValue, Messages

OPENAI_RESPONSES_DEFAULT_BASE_URL = "https://api.openai.com/v1"


class OpenAIResponsesProviderClient(HttpProviderClient):
    supports_stream = True

    def __init__(
        self,
        transport: HttpTransport | None = None,
        environ: Mapping[str, str] | None = None,
    ) -> None:
        self._transport = transport or UrllibHttpTransport()
        self._environ = environ if environ is not None else os.environ

    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        headers = {
            "Authorization": f"Bearer {self._api_key(config)}",
            "Content-Type": "application/json",
        }
        body = self._request_body(request, config, stream=False)

        try:
            raw = self._transport.post_json(
                url=f"{_base_url_for(config)}/responses",
                headers=headers,
                body=body,
                timeout_s=config.timeout_s,
            )
        except ProviderClientError as exc:
            _raise_with_provider(exc, config.name)
        except Exception as exc:  # noqa: BLE001
            raise ProviderClientError(str(exc)) from exc

        return map_responses_payload(
            raw,
            provider_name=config.name,
            allow_parallel_tool_calls=config.tool_use.parallel_tool_calls,
        )

    def stream(
        self,
        request: ModelRequest,
        config: ProviderConfig,
    ) -> Iterator[JsonMapping]:
        headers = {
            "Authorization": f"Bearer {self._api_key(config)}",
            "Content-Type": "application/json",
        }
        body = self._request_body(request, config, stream=True)

        try:
            lines = self._transport.post_sse(
                url=f"{_base_url_for(config)}/responses",
                headers=headers,
                body=body,
                timeout_s=config.timeout_s,
            )
            yield from stream_responses_payloads(
                lines,
                provider_name=config.name,
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
        body: JsonObject = {
            "model": config.model,
            "input": format_responses_input(request.messages, request.provider_context),
            "tool_choice": "auto",
            "parallel_tool_calls": config.tool_use.parallel_tool_calls,
        }
        if request.system_prompt is not None:
            body["instructions"] = request.system_prompt
        if stream:
            body["stream"] = True
        if request.options.max_tokens is not None:
            body["max_output_tokens"] = request.options.max_tokens
        if request.options.temperature is not None:
            body["temperature"] = request.options.temperature

        tools = format_responses_tools(request.tools)
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


def format_responses_input(
    messages: Messages,
    provider_context: JsonObject | None,
) -> list[JsonObject]:
    formatted: list[JsonObject] = []
    seen_keys: set[str] = set()

    for item in _provider_context_items(provider_context):
        formatted.append(item)
        key = _item_key(item)
        if key is not None:
            seen_keys.add(key)

    for message in messages:
        item = _message_to_response_input_item(message)
        key = _item_key(item)
        if key is not None and key in seen_keys:
            continue
        formatted.append(item)
        if key is not None:
            seen_keys.add(key)

    return formatted


def format_responses_tools(tools: list[ToolCatalogEntry]) -> list[JsonObject]:
    converted: list[JsonObject] = []
    for tool in format_openai_tools(tools):
        function = tool.get("function")
        if not isinstance(function, dict):
            raise ProviderResponseError("OpenAI tool formatter returned malformed function.")
        converted.append(
            {
                "type": "function",
                "name": _string_value(function, "name"),
                "description": _string_value(function, "description"),
                "parameters": _mapping_value(function, "parameters"),
            }
        )
    return converted


def map_responses_payload(
    raw: JsonMapping,
    provider_name: str = "openai-responses",
    *,
    allow_parallel_tool_calls: bool = False,
) -> JsonObject:
    output = raw.get("output")
    if not isinstance(output, list):
        raise ProviderResponseError("Responses payload must contain output list.")

    output_items = _object_items(output)
    context = _provider_context_from_items(provider_name, raw, output_items)
    function_calls = [item for item in output_items if item.get("type") == "function_call"]
    if len(function_calls) > 1 and not allow_parallel_tool_calls:
        raise ProviderResponseError("Responses payload returned multiple function calls.")
    if len(function_calls) == 1:
        payload = _map_function_call_item(function_calls[0])
        payload["provider_context"] = context
        return attach_provider_usage(payload, openai_responses_usage_from_raw(raw))
    if len(function_calls) > 1:
        payload = _map_function_call_batch(function_calls)
        payload["provider_context"] = context
        return attach_provider_usage(payload, openai_responses_usage_from_raw(raw))

    content = _assistant_text_from_items(output_items)
    if content != "" or _has_message_item(output_items):
        return attach_provider_usage(
            {"kind": "assistant", "content": content, "provider_context": context},
            openai_responses_usage_from_raw(raw),
        )

    raise ProviderResponseError("Responses payload did not contain a final assistant message or tool call.")


def stream_responses_payloads(
    lines: Iterator[str],
    provider_name: str = "openai-responses",
    *,
    allow_parallel_tool_calls: bool = False,
) -> Iterator[JsonObject]:
    accumulator = _ResponsesStreamingAccumulator(
        provider_name=provider_name,
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
            raise ProviderResponseError("Responses streaming event must be valid JSON.") from exc
        if not isinstance(decoded, dict):
            raise ProviderResponseError("Responses streaming event must be a JSON object.")

        yield from accumulator.consume(dict(decoded))
        if accumulator.is_terminal:
            saw_terminal_event = True

    if not saw_terminal_event and not accumulator.is_terminal:
        raise ProviderResponseError("Responses stream ended before a terminal response was received.")

    yield accumulator.final_payload()


def _message_to_response_input_item(message: JsonMapping) -> JsonObject:
    kind = message.get("kind")
    if kind == "user":
        return {"role": "user", "content": _string_value(message, "content")}
    if kind == "assistant":
        return {"role": "assistant", "content": _string_value(message, "content")}
    if kind == "tool_call":
        tool_call = _mapping_value(message, "tool_call")
        return {
            "type": "function_call",
            "call_id": _string_value(tool_call, "tool_call_id"),
            "name": _string_value(tool_call, "tool_name"),
            "arguments": _json_string(_mapping_value(tool_call, "input")),
        }
    if kind == "tool_result":
        return {
            "type": "function_call_output",
            "call_id": _string_value(message, "tool_call_id"),
            "output": _json_string(_mapping_value(message, "result")),
        }
    raise ProviderResponseError(f"Unsupported message kind for Responses formatter: {kind!r}")


def _provider_context_items(provider_context: JsonObject | None) -> list[JsonObject]:
    if provider_context is None:
        return []
    raw_items = provider_context.get("items")
    if raw_items is None:
        return []
    if not isinstance(raw_items, list):
        raise ProviderResponseError("Responses provider_context.items must be a list.")
    return _object_items(raw_items)


def _provider_context_from_items(
    provider_name: str,
    raw: JsonMapping,
    output_items: list[JsonObject],
) -> JsonObject:
    context: JsonObject = {
        "provider_name": provider_name,
        "items": [dict(item) for item in output_items],
    }
    response_id = raw.get("id")
    if isinstance(response_id, str) and response_id != "":
        context["response_id"] = response_id
    return context


def _assistant_text_from_items(items: list[JsonObject]) -> str:
    parts: list[str] = []
    for item in items:
        if item.get("type") != "message":
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            part_type = part.get("type")
            if part_type not in {"output_text", "text"}:
                continue
            text = part.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "".join(parts)


def _has_message_item(items: list[JsonObject]) -> bool:
    return any(item.get("type") == "message" for item in items)


def _map_function_call_item(item: JsonMapping) -> JsonObject:
    arguments = _string_value(item, "arguments")
    try:
        input_payload = json.loads(arguments)
    except json.JSONDecodeError as exc:
        raise ProviderResponseError("Responses function_call arguments must be valid JSON.") from exc
    if not isinstance(input_payload, dict):
        raise ProviderResponseError("Responses function_call arguments must be a JSON object.")

    tool_call_id = item.get("call_id")
    if not isinstance(tool_call_id, str) or tool_call_id == "":
        tool_call_id = _string_value(item, "id")

    return {
        "kind": "tool_call",
        "tool_call_id": tool_call_id,
        "tool_name": _string_value(item, "name"),
        "input": dict(input_payload),
    }


def _map_function_call_batch(items: list[JsonObject]) -> JsonObject:
    payloads = [_map_function_call_item(item) for item in items]
    seen_ids: set[str] = set()
    tool_calls: list[JsonObject] = []
    for payload in payloads:
        tool_call_id = _string_value(payload, "tool_call_id")
        if tool_call_id in seen_ids:
            raise ProviderResponseError(
                f"Responses payload returned duplicate function call id: {tool_call_id}"
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


def _object_items(items: list[JsonValue]) -> list[JsonObject]:
    parsed: list[JsonObject] = []
    for item in items:
        if not isinstance(item, dict):
            raise ProviderResponseError("Responses item must be an object.")
        parsed.append(dict(item))
    return parsed


def _item_key(item: JsonMapping) -> str | None:
    item_type = item.get("type")
    call_id = item.get("call_id")
    if item_type == "function_call" and isinstance(call_id, str) and call_id != "":
        return f"call_id:{call_id}"
    item_id = item.get("id")
    if isinstance(item_id, str) and item_id != "":
        return f"id:{item_id}"
    return None


def _base_url_for(config: ProviderConfig) -> str:
    base_url = config.base_url or OPENAI_RESPONSES_DEFAULT_BASE_URL
    return base_url.rstrip("/")


def _raise_with_provider(error: ProviderClientError, provider: str) -> None:
    mapped = error.with_provider(provider)
    if mapped is error:
        raise error
    raise mapped from error


def _mapping_value(mapping: JsonMapping, key: str) -> JsonObject:
    value = mapping.get(key)
    if not isinstance(value, dict):
        raise ProviderResponseError(f"Expected object field for Responses formatter: {key}")
    return dict(value)


def _string_value(mapping: JsonMapping, key: str) -> str:
    try:
        return require_str(mapping, key)
    except ValueError as exc:
        raise ProviderResponseError(str(exc)) from exc


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
class _ResponsesFunctionCallStreamState:
    item_id: str
    call_id: str | None = None
    name: str | None = None
    arguments_parts: list[str] = field(default_factory=list)
    arguments_done: str | None = None

    def merge_item(self, item: JsonMapping) -> None:
        call_id = item.get("call_id")
        if isinstance(call_id, str) and call_id != "":
            self.call_id = call_id
        name = item.get("name")
        if isinstance(name, str) and name != "":
            self.name = name
        arguments = item.get("arguments")
        if isinstance(arguments, str):
            self.arguments_done = arguments

    def to_item(self) -> JsonObject:
        if self.name is None:
            raise ProviderResponseError("Responses streaming function_call is missing name.")
        arguments = self.arguments_done
        if arguments is None:
            arguments = "".join(self.arguments_parts)
        if arguments == "":
            raise ProviderResponseError("Responses streaming function_call is missing arguments.")
        return {
            "type": "function_call",
            "id": self.item_id,
            "call_id": self.call_id or self.item_id,
            "name": self.name,
            "arguments": arguments,
        }


@dataclass(slots=True)
class _ResponsesStreamingAccumulator:
    provider_name: str
    allow_parallel_tool_calls: bool = False
    text_parts: list[str] = field(default_factory=list)
    final_text: str | None = None
    output_items: list[JsonObject] = field(default_factory=list)
    response_id: str | None = None
    completed_response: JsonObject | None = None
    function_states: dict[str, _ResponsesFunctionCallStreamState] = field(default_factory=dict)
    terminal: bool = False

    @property
    def is_terminal(self) -> bool:
        return self.terminal

    def consume(self, event: JsonMapping) -> list[JsonObject]:
        event_type = event.get("type")
        if not isinstance(event_type, str):
            raise ProviderResponseError("Responses streaming event is missing type.")

        if event_type == "error":
            raise ProviderClientError.from_error_info(
                map_openai_error_to_info(None, event, provider=self.provider_name)
            )

        if event_type in {"response.failed", "response.incomplete"}:
            raise ProviderResponseError(f"Responses streaming ended with {event_type}.")

        if event_type == "response.output_text.delta":
            delta = _string_value(event, "delta")
            if delta == "":
                return []
            self.text_parts.append(delta)
            return [{"kind": "delta", "text": delta}]

        if event_type == "response.output_text.done":
            self.final_text = _string_value(event, "text")
            return []

        if event_type == "response.function_call_arguments.delta":
            self._consume_function_arguments_delta(event)
            return []

        if event_type == "response.function_call_arguments.done":
            self._consume_function_arguments_done(event)
            return []

        if event_type == "response.output_item.done":
            self._consume_output_item_done(event)
            return []

        if event_type == "response.completed":
            self._consume_completed(event)
            self.terminal = True
            return []

        return []

    def final_payload(self) -> JsonObject:
        if self.completed_response is not None:
            return map_responses_payload(
                self.completed_response,
                provider_name=self.provider_name,
                allow_parallel_tool_calls=self.allow_parallel_tool_calls,
            )

        output_items = [dict(item) for item in self.output_items]
        if self.function_states:
            existing_ids = {
                item.get("id")
                for item in output_items
                if item.get("type") == "function_call" and isinstance(item.get("id"), str)
            }
            for item_id, state in sorted(self.function_states.items()):
                if item_id not in existing_ids:
                    output_items.append(state.to_item())
            raw: JsonObject = {"output": output_items}
            if self.response_id is not None:
                raw["id"] = self.response_id
            return map_responses_payload(
                raw,
                provider_name=self.provider_name,
                allow_parallel_tool_calls=self.allow_parallel_tool_calls,
            )

        if output_items:
            raw: JsonObject = {"output": output_items}
            if self.response_id is not None:
                raw["id"] = self.response_id
            return map_responses_payload(
                raw,
                provider_name=self.provider_name,
                allow_parallel_tool_calls=self.allow_parallel_tool_calls,
            )

        text = self.final_text if self.final_text is not None else "".join(self.text_parts)
        if text == "":
            raise ProviderResponseError("Responses stream ended without a final response.")

        context: JsonObject = {
            "provider_name": self.provider_name,
            "items": output_items,
        }
        if self.response_id is not None:
            context["response_id"] = self.response_id
        return {"kind": "assistant", "content": text, "provider_context": context}

    def _consume_completed(self, event: JsonMapping) -> None:
        response = event.get("response")
        if isinstance(response, dict):
            self.completed_response = dict(response)
            response_id = response.get("id")
            if isinstance(response_id, str):
                self.response_id = response_id

    def _consume_output_item_done(self, event: JsonMapping) -> None:
        item = event.get("item")
        if not isinstance(item, dict):
            raise ProviderResponseError("Responses output_item.done must contain item object.")
        parsed_item = dict(item)
        self.output_items.append(parsed_item)
        if parsed_item.get("type") == "function_call":
            self._merge_function_call_item(parsed_item)

    def _consume_function_arguments_delta(self, event: JsonMapping) -> None:
        state = self._state_for_item_id(_string_value(event, "item_id"))
        state.arguments_parts.append(_string_value(event, "delta"))

    def _consume_function_arguments_done(self, event: JsonMapping) -> None:
        state = self._state_for_item_id(_string_value(event, "item_id"))
        arguments = event.get("arguments")
        if isinstance(arguments, str):
            state.arguments_done = arguments
        name = event.get("name")
        if isinstance(name, str) and name != "":
            state.name = name

    def _merge_function_call_item(self, item: JsonMapping) -> None:
        item_id = item.get("id")
        if not isinstance(item_id, str) or item_id == "":
            call_id = item.get("call_id")
            item_id = call_id if isinstance(call_id, str) and call_id != "" else "function_call"
        state = self._state_for_item_id(item_id)
        state.merge_item(item)

    def _state_for_item_id(self, item_id: str) -> _ResponsesFunctionCallStreamState:
        if item_id == "":
            raise ProviderResponseError("Responses streaming function_call item_id must be non-empty.")
        if (
            item_id not in self.function_states
            and self.function_states
            and not self.allow_parallel_tool_calls
        ):
            raise ProviderResponseError("Responses streaming only supports a single function call.")
        state = self.function_states.get(item_id)
        if state is None:
            state = _ResponsesFunctionCallStreamState(item_id=item_id)
            self.function_states[item_id] = state
        return state
