import json
from collections.abc import Iterator

import pytest

from god_code_engine.api.god_code_api_models import ToolCatalogEntry
from god_code_engine.models.base import ModelOptions, ModelRequest
from god_code_engine.providers.base import ProviderResponseError
from god_code_engine.providers.config import ProviderConfig, ProviderToolUsePolicy
from god_code_engine.providers.http_client import ProviderClientError
from god_code_engine.providers.openai_responses import (
    OpenAIResponsesProviderClient,
    format_responses_input,
    format_responses_tools,
    map_responses_payload,
    stream_responses_payloads,
)
from god_code_engine.providers.transport import HttpTransport
from god_code_engine.types import JsonMapping, JsonObject, Messages


class RecordingTransport(HttpTransport):
    def __init__(
        self,
        response: JsonMapping | None = None,
        sse_lines: list[str] | None = None,
    ) -> None:
        self.response = response
        self.sse_lines = sse_lines or []
        self.requests: list[JsonObject] = []

    def post_json(
        self,
        url: str,
        headers: JsonMapping,
        body: JsonMapping,
        timeout_s: float,
    ) -> JsonMapping:
        self.requests.append(
            {
                "kind": "json",
                "url": url,
                "headers": dict(headers),
                "body": dict(body),
                "timeout_s": timeout_s,
            }
        )
        if self.response is None:
            raise AssertionError("post_json should not be called without a response.")
        return self.response

    def post_sse(
        self,
        url: str,
        headers: JsonMapping,
        body: JsonMapping,
        timeout_s: float,
    ) -> Iterator[str]:
        self.requests.append(
            {
                "kind": "sse",
                "url": url,
                "headers": dict(headers),
                "body": dict(body),
                "timeout_s": timeout_s,
            }
        )
        yield from self.sse_lines


class BrokenTransport(HttpTransport):
    def post_json(
        self,
        url: str,
        headers: JsonMapping,
        body: JsonMapping,
        timeout_s: float,
    ) -> JsonMapping:
        del url, headers, body, timeout_s
        raise RuntimeError("transport exploded")

    def post_sse(
        self,
        url: str,
        headers: JsonMapping,
        body: JsonMapping,
        timeout_s: float,
    ) -> Iterator[str]:
        del url, headers, body, timeout_s
        raise RuntimeError("transport exploded")


def make_request(messages: Messages | None = None, system_prompt: str | None = None) -> ModelRequest:
    return ModelRequest(
        messages=messages or [{"kind": "user", "content": "hello"}],
        tools=[ToolCatalogEntry(name="Read", description="read a file")],
        options=ModelOptions(max_tokens=128, temperature=0.2),
        system_prompt=system_prompt,
    )


def make_config() -> ProviderConfig:
    return ProviderConfig(
        name="openai-responses",
        model="gpt-test",
        api_key_env="OPENAI_API_KEY",
        base_url="https://provider.test/v1",
        timeout_s=12.0,
    )


def make_parallel_config() -> ProviderConfig:
    config = make_config()
    config.tool_use = ProviderToolUsePolicy(parallel_tool_calls=True)
    return config


def sse_event_lines(payload: object) -> list[str]:
    text = payload if isinstance(payload, str) else json.dumps(payload, separators=(",", ":"))
    return [f"data: {text}", ""]


def assistant_response(content: str = "hello") -> JsonObject:
    return {
        "id": "resp_1",
        "output": [
            {
                "id": "msg_1",
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": content}],
            }
        ],
    }


def test_format_responses_input_maps_messages_and_context_items() -> None:
    context: JsonObject = {
        "provider_name": "openai-responses",
        "response_id": "resp_1",
        "items": [
            {
                "id": "fc_1",
                "type": "function_call",
                "call_id": "call_1",
                "name": "Read",
                "arguments": '{"path":"README.md"}',
            }
        ],
    }
    messages: Messages = [
        {"kind": "user", "content": "read README.md"},
        {
            "kind": "tool_call",
            "tool_call": {
                "tool_call_id": "call_1",
                "tool_name": "Read",
                "input": {"path": "README.md"},
            },
        },
        {
            "kind": "tool_result",
            "tool_call_id": "call_1",
            "tool_name": "Read",
            "result": {"ok": True, "output": {"content": "hello"}},
        },
        {"kind": "assistant", "content": "done"},
    ]

    formatted = format_responses_input(messages, context)

    assert formatted[0]["id"] == "fc_1"
    assert [item.get("type") for item in formatted].count("function_call") == 1
    assert formatted[1] == {"role": "user", "content": "read README.md"}
    assert formatted[2] == {
        "type": "function_call_output",
        "call_id": "call_1",
        "output": '{"ok":true,"output":{"content":"hello"}}',
    }
    assert formatted[3] == {"role": "assistant", "content": "done"}


def test_format_responses_tools_generates_function_tools() -> None:
    tools = format_responses_tools(
        [
            ToolCatalogEntry(name="Read", description="read a file"),
            ToolCatalogEntry(name="ExternalTool", description="external"),
        ]
    )

    assert tools[0]["type"] == "function"
    assert tools[0]["name"] == "Read"
    parameters = tools[0]["parameters"]
    assert isinstance(parameters, dict)
    assert parameters["required"] == ["path"]
    assert tools[1]["parameters"] == {"type": "object", "additionalProperties": True}


def test_format_responses_tools_prefers_catalog_input_schema() -> None:
    custom_schema = {
        "type": "object",
        "properties": {"value": {"type": "string"}},
        "required": ["value"],
        "additionalProperties": False,
    }
    tools = format_responses_tools(
        [
            ToolCatalogEntry(
                name="Read",
                description="custom read",
                input_schema=custom_schema,
            )
        ]
    )

    assert tools[0]["parameters"] == custom_schema


def test_map_responses_assistant_payload_includes_provider_context() -> None:
    payload = map_responses_payload(assistant_response("hello"), provider_name="openai-responses")

    assert payload["kind"] == "assistant"
    assert payload["content"] == "hello"
    context = payload["provider_context"]
    assert isinstance(context, dict)
    assert context["provider_name"] == "openai-responses"
    assert context["response_id"] == "resp_1"
    assert context["items"] == assistant_response("hello")["output"]


def test_map_responses_assistant_payload_includes_provider_usage() -> None:
    raw = assistant_response("hello")
    raw["usage"] = {
        "input_tokens": 11,
        "output_tokens": 3,
        "total_tokens": 14,
    }

    payload = map_responses_payload(raw, provider_name="openai-responses")

    assert payload["provider_usage"] == {
        "input_tokens": 11,
        "output_tokens": 3,
        "total_tokens": 14,
        "source": "openai-responses.usage",
    }


def test_map_responses_tool_call_payload() -> None:
    payload = map_responses_payload(
        {
            "id": "resp_1",
            "output": [
                {
                    "id": "fc_1",
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "Read",
                    "arguments": '{"path":"README.md"}',
                }
            ],
        }
    )

    assert payload["kind"] == "tool_call"
    assert payload["tool_call_id"] == "call_1"
    assert payload["tool_name"] == "Read"
    assert payload["input"] == {"path": "README.md"}


def test_map_responses_tool_call_batch_when_enabled() -> None:
    payload = map_responses_payload(
        {
            "id": "resp_1",
            "output": [
                {
                    "id": "fc_1",
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "Read",
                    "arguments": '{"path":"README.md"}',
                },
                {
                    "id": "fc_2",
                    "type": "function_call",
                    "call_id": "call_2",
                    "name": "Search",
                    "arguments": '{"path":".","pattern":"TODO"}',
                },
            ],
        },
        allow_parallel_tool_calls=True,
    )

    assert payload["kind"] == "tool_call_batch"
    assert payload["tool_calls"] == [
        {
            "tool_call_id": "call_1",
            "tool_name": "Read",
            "input": {"path": "README.md"},
        },
        {
            "tool_call_id": "call_2",
            "tool_name": "Search",
            "input": {"path": ".", "pattern": "TODO"},
        },
    ]
    assert payload["provider_context"]["response_id"] == "resp_1"


def test_map_responses_rejects_malformed_payloads() -> None:
    with pytest.raises(ProviderResponseError, match="output list"):
        map_responses_payload({"output": {}})

    with pytest.raises(ProviderResponseError, match="multiple function calls"):
        map_responses_payload(
            {
                "output": [
                    {"type": "function_call", "id": "fc1", "name": "Read", "arguments": "{}"},
                    {"type": "function_call", "id": "fc2", "name": "Read", "arguments": "{}"},
                ]
            }
        )

    with pytest.raises(ProviderResponseError, match="valid JSON"):
        map_responses_payload(
            {
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc1",
                        "name": "Read",
                        "arguments": "not-json",
                    }
                ]
            }
        )


def test_stream_responses_payloads_maps_assistant_stream() -> None:
    payloads = list(
        stream_responses_payloads(
            iter(
                [
                    *sse_event_lines(
                        {
                            "type": "response.output_text.delta",
                            "item_id": "msg_1",
                            "delta": "hel",
                        }
                    ),
                    *sse_event_lines(
                        {
                            "type": "response.output_text.delta",
                            "item_id": "msg_1",
                            "delta": "lo",
                        }
                    ),
                    *sse_event_lines({"type": "response.completed", "response": assistant_response("hello")}),
                    *sse_event_lines("[DONE]"),
                ]
            )
        )
    )

    assert payloads[0] == {"kind": "delta", "text": "hel"}
    assert payloads[1] == {"kind": "delta", "text": "lo"}
    assert payloads[2]["kind"] == "assistant"
    assert payloads[2]["content"] == "hello"


def test_stream_responses_payloads_maps_completed_response_usage() -> None:
    completed = assistant_response("hello")
    completed["usage"] = {
        "input_tokens": 7,
        "output_tokens": 2,
        "total_tokens": 9,
    }

    payloads = list(
        stream_responses_payloads(
            iter(
                [
                    *sse_event_lines(
                        {
                            "type": "response.output_text.delta",
                            "item_id": "msg_1",
                            "delta": "hello",
                        }
                    ),
                    *sse_event_lines({"type": "response.completed", "response": completed}),
                    *sse_event_lines("[DONE]"),
                ]
            )
        )
    )

    assert payloads[1]["provider_usage"] == {
        "input_tokens": 7,
        "output_tokens": 2,
        "total_tokens": 9,
        "source": "openai-responses.usage",
    }


def test_stream_responses_payloads_maps_function_call_stream() -> None:
    payloads = list(
        stream_responses_payloads(
            iter(
                [
                    *sse_event_lines(
                        {
                            "type": "response.function_call_arguments.delta",
                            "item_id": "fc_1",
                            "delta": '{"path":"READ',
                        }
                    ),
                    *sse_event_lines(
                        {
                            "type": "response.function_call_arguments.done",
                            "item_id": "fc_1",
                            "name": "Read",
                            "arguments": '{"path":"README.md"}',
                        }
                    ),
                    *sse_event_lines({"type": "response.completed"}),
                    *sse_event_lines("[DONE]"),
                ]
            )
        )
    )

    assert payloads == [
        {
            "kind": "tool_call",
            "tool_call_id": "fc_1",
            "tool_name": "Read",
            "input": {"path": "README.md"},
            "provider_context": {
                "provider_name": "openai-responses",
                "items": [
                    {
                        "type": "function_call",
                        "id": "fc_1",
                        "call_id": "fc_1",
                        "name": "Read",
                        "arguments": '{"path":"README.md"}',
                    }
                ],
            },
        }
    ]


def test_stream_responses_payloads_maps_function_call_batch_when_enabled() -> None:
    payloads = list(
        stream_responses_payloads(
            iter(
                [
                    *sse_event_lines(
                        {
                            "type": "response.output_item.done",
                            "item": {
                                "type": "function_call",
                                "id": "fc_1",
                                "call_id": "call_1",
                                "name": "Read",
                                "arguments": '{"path":"README.md"}',
                            },
                        }
                    ),
                    *sse_event_lines(
                        {
                            "type": "response.output_item.done",
                            "item": {
                                "type": "function_call",
                                "id": "fc_2",
                                "call_id": "call_2",
                                "name": "Search",
                                "arguments": '{"path":".","pattern":"TODO"}',
                            },
                        }
                    ),
                    *sse_event_lines({"type": "response.completed"}),
                    *sse_event_lines("[DONE]"),
                ]
            ),
            allow_parallel_tool_calls=True,
        )
    )

    assert payloads == [
        {
            "kind": "tool_call_batch",
            "tool_calls": [
                {
                    "tool_call_id": "call_1",
                    "tool_name": "Read",
                    "input": {"path": "README.md"},
                },
                {
                    "tool_call_id": "call_2",
                    "tool_name": "Search",
                    "input": {"path": ".", "pattern": "TODO"},
                },
            ],
            "provider_context": {
                "provider_name": "openai-responses",
                "items": [
                    {
                        "type": "function_call",
                        "id": "fc_1",
                        "call_id": "call_1",
                        "name": "Read",
                        "arguments": '{"path":"README.md"}',
                    },
                    {
                        "type": "function_call",
                        "id": "fc_2",
                        "call_id": "call_2",
                        "name": "Search",
                        "arguments": '{"path":".","pattern":"TODO"}',
                    },
                ],
            },
        }
    ]


def test_stream_responses_payloads_rejects_multiple_function_calls() -> None:
    with pytest.raises(ProviderResponseError, match="single function call"):
        list(
            stream_responses_payloads(
                iter(
                    [
                        *sse_event_lines(
                            {
                                "type": "response.function_call_arguments.delta",
                                "item_id": "fc_1",
                                "delta": "{}",
                            }
                        ),
                        *sse_event_lines(
                            {
                                "type": "response.function_call_arguments.delta",
                                "item_id": "fc_2",
                                "delta": "{}",
                            }
                        ),
                        *sse_event_lines("[DONE]"),
                    ]
                )
            )
        )


def test_stream_responses_payloads_rejects_premature_end() -> None:
    with pytest.raises(ProviderResponseError, match="terminal response"):
        list(
            stream_responses_payloads(
                iter(
                    sse_event_lines(
                        {
                            "type": "response.output_text.delta",
                            "item_id": "msg_1",
                            "delta": "partial",
                        }
                    )
                )
            )
        )


def test_openai_responses_client_posts_expected_request() -> None:
    transport = RecordingTransport(assistant_response("hello"))
    client = OpenAIResponsesProviderClient(
        transport=transport,
        environ={"OPENAI_API_KEY": "secret"},
    )

    payload = client.complete(make_request(), make_config())

    assert payload["kind"] == "assistant"
    assert len(transport.requests) == 1
    recorded = transport.requests[0]
    assert recorded["url"] == "https://provider.test/v1/responses"
    assert recorded["timeout_s"] == 12.0
    headers = recorded["headers"]
    assert isinstance(headers, dict)
    assert headers["Authorization"] == "Bearer secret"
    body = recorded["body"]
    assert isinstance(body, dict)
    assert body["model"] == "gpt-test"
    assert body["tool_choice"] == "auto"
    assert body["parallel_tool_calls"] is False
    assert body["max_output_tokens"] == 128
    assert body["temperature"] == 0.2
    assert "tools" in body


def test_openai_responses_client_enables_parallel_tool_calls_when_configured() -> None:
    transport = RecordingTransport(assistant_response("hello"))
    client = OpenAIResponsesProviderClient(
        transport=transport,
        environ={"OPENAI_API_KEY": "secret"},
    )

    client.complete(make_request(), make_parallel_config())

    body = transport.requests[0]["body"]
    assert isinstance(body, dict)
    assert body["parallel_tool_calls"] is True


def test_openai_responses_client_streams_payloads() -> None:
    transport = RecordingTransport(
        sse_lines=[
            *sse_event_lines(
                {
                    "type": "response.output_text.delta",
                    "item_id": "msg_1",
                    "delta": "hello",
                }
            ),
            *sse_event_lines({"type": "response.completed", "response": assistant_response("hello")}),
            *sse_event_lines("[DONE]"),
        ]
    )
    client = OpenAIResponsesProviderClient(
        transport=transport,
        environ={"OPENAI_API_KEY": "secret"},
    )

    payloads = list(client.stream(make_request(), make_config()))

    assert payloads[0] == {"kind": "delta", "text": "hello"}
    assert payloads[1]["kind"] == "assistant"
    recorded = transport.requests[0]
    assert recorded["kind"] == "sse"
    body = recorded["body"]
    assert isinstance(body, dict)
    assert body["stream"] is True


def test_openai_responses_client_sets_system_prompt_instructions() -> None:
    transport = RecordingTransport(assistant_response("ok"))
    client = OpenAIResponsesProviderClient(
        transport=transport,
        environ={"OPENAI_API_KEY": "secret"},
    )

    client.complete(make_request(system_prompt="Follow host tool policy."), make_config())

    recorded = transport.requests[0]
    body = recorded["body"]
    assert isinstance(body, dict)
    assert body["instructions"] == "Follow host tool policy."
    assert "input" in body


def test_openai_responses_client_maps_stream_error_event() -> None:
    transport = RecordingTransport(
        sse_lines=[
            *sse_event_lines(
                {
                    "type": "error",
                    "error": {
                        "message": "raw response prompt must not leak",
                        "type": "invalid_request_error",
                        "code": "context_length_exceeded",
                    },
                }
            )
        ]
    )
    client = OpenAIResponsesProviderClient(
        transport=transport,
        environ={"OPENAI_API_KEY": "secret"},
    )

    with pytest.raises(ProviderClientError) as captured:
        list(client.stream(make_request(), make_config()))

    error = captured.value
    assert error.retryable is False
    assert error.error_info is not None
    assert error.error_info.category == "context_length"
    assert error.error_info.provider == "openai-responses"
    assert "raw response prompt" not in str(error)


def test_openai_responses_client_wraps_transport_error() -> None:
    client = OpenAIResponsesProviderClient(
        transport=BrokenTransport(),
        environ={"OPENAI_API_KEY": "secret"},
    )

    with pytest.raises(ProviderClientError, match="transport exploded"):
        client.complete(make_request(), make_config())

    with pytest.raises(ProviderClientError, match="transport exploded"):
        list(client.stream(make_request(), make_config()))


def test_openai_responses_client_requires_api_key_env_value() -> None:
    client = OpenAIResponsesProviderClient(transport=RecordingTransport({}), environ={})

    with pytest.raises(ProviderClientError, match="OPENAI_API_KEY"):
        client.complete(make_request(), make_config())

    with pytest.raises(ProviderClientError, match="OPENAI_API_KEY"):
        list(client.stream(make_request(), make_config()))
