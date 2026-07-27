import json
from collections.abc import Iterator

import pytest

from god_code_engine.api.god_code_api_models import ToolCatalogEntry
from god_code_engine.models.base import ModelOptions, ModelRequest
from god_code_engine.providers.base import ProviderResponseError
from god_code_engine.providers.config import ProviderConfig, ProviderToolUsePolicy
from god_code_engine.providers.http_client import ProviderClientError
from god_code_engine.providers.openai_compatible import (
    OpenAICompatibleProviderClient,
    format_openai_messages,
    format_openai_tools,
    map_openai_chat_completion_to_provider_payload,
    stream_openai_chat_completion_payloads,
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
            raise AssertionError("post_json should not be called without a JSON response.")
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
        name="openai",
        model="gpt-test",
        api_key_env="OPENAI_API_KEY",
        base_url="https://provider.test/v1",
        timeout_s=12.0,
    )


def make_parallel_config() -> ProviderConfig:
    config = make_config()
    config.tool_use = ProviderToolUsePolicy(parallel_tool_calls=True)
    return config


def make_local_config(api_key_env: str | None = None) -> ProviderConfig:
    return ProviderConfig(
        name="local-openai-compatible",
        model="local-model",
        api_key_env=api_key_env,
        base_url="http://127.0.0.1:11434/v1",
        timeout_s=12.0,
    )


def sse_event_lines(payload: object) -> list[str]:
    text = payload if isinstance(payload, str) else json.dumps(payload, separators=(",", ":"))
    return [f"data: {text}", ""]


def test_format_openai_messages_maps_user_assistant_tool_messages() -> None:
    messages: Messages = [
        {"kind": "user", "content": "read README.md"},
        {"kind": "assistant", "content": "I will read it."},
        {
            "kind": "tool_call",
            "tool_call": {
                "tool_call_id": "tc1",
                "tool_name": "Read",
                "input": {"path": "README.md"},
            },
        },
        {
            "kind": "tool_result",
            "tool_call_id": "tc1",
            "tool_name": "Read",
            "result": {"ok": True, "output": {"content": "hello"}},
        },
    ]

    formatted = format_openai_messages(messages)

    assert formatted[0] == {"role": "user", "content": "read README.md"}
    assert formatted[1] == {"role": "assistant", "content": "I will read it."}
    assert formatted[2]["role"] == "assistant"
    tool_calls = formatted[2]["tool_calls"]
    assert isinstance(tool_calls, list)
    tool_call = tool_calls[0]
    assert isinstance(tool_call, dict)
    function = tool_call["function"]
    assert isinstance(function, dict)
    assert function["name"] == "Read"
    assert json.loads(str(function["arguments"])) == {"path": "README.md"}
    assert formatted[3] == {
        "role": "tool",
        "tool_call_id": "tc1",
        "content": '{"ok":true,"output":{"content":"hello"}}',
    }


def test_format_openai_messages_requires_tool_call_id_for_tool_result() -> None:
    with pytest.raises(ProviderResponseError, match="tool_call_id"):
        format_openai_messages(
            [
                {
                    "kind": "tool_result",
                    "tool_name": "Read",
                    "result": {"ok": True},
                }
            ]
        )


def test_format_openai_tools_generates_builtin_and_external_schemas() -> None:
    tools = format_openai_tools(
        [
            ToolCatalogEntry(name="Read", description="read a file"),
            ToolCatalogEntry(name="ExternalTool", description="external"),
        ]
    )

    read_function = tools[0]["function"]
    assert isinstance(read_function, dict)
    read_parameters = read_function["parameters"]
    assert isinstance(read_parameters, dict)
    assert read_parameters["required"] == ["path"]
    external_function = tools[1]["function"]
    assert isinstance(external_function, dict)
    external_parameters = external_function["parameters"]
    assert isinstance(external_parameters, dict)
    assert external_parameters == {"type": "object", "additionalProperties": True}


def test_format_openai_tools_prefers_catalog_input_schema() -> None:
    custom_schema = {
        "type": "object",
        "properties": {"value": {"type": "string"}},
        "required": ["value"],
        "additionalProperties": False,
    }
    tools = format_openai_tools(
        [
            ToolCatalogEntry(
                name="Read",
                description="custom read",
                input_schema=custom_schema,
            )
        ]
    )

    function = tools[0]["function"]
    assert isinstance(function, dict)
    assert function["parameters"] == custom_schema


def test_map_openai_assistant_response_to_provider_payload() -> None:
    payload = map_openai_chat_completion_to_provider_payload(
        {"choices": [{"message": {"role": "assistant", "content": "hello"}}]}
    )

    assert payload == {"kind": "assistant", "content": "hello"}


def test_map_openai_assistant_response_includes_provider_usage() -> None:
    payload = map_openai_chat_completion_to_provider_payload(
        {
            "choices": [{"message": {"role": "assistant", "content": "hello"}}],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 4,
                "total_tokens": 14,
            },
        }
    )

    assert payload["provider_usage"] == {
        "input_tokens": 10,
        "output_tokens": 4,
        "total_tokens": 14,
        "source": "openai-compatible.usage",
    }


def test_map_openai_tool_call_response_to_provider_payload() -> None:
    payload = map_openai_chat_completion_to_provider_payload(
        {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "tc1",
                                "type": "function",
                                "function": {
                                    "name": "Read",
                                    "arguments": '{"path":"README.md"}',
                                },
                            }
                        ],
                    }
                }
            ]
        }
    )

    assert payload == {
        "kind": "tool_call",
        "tool_call_id": "tc1",
        "tool_name": "Read",
        "input": {"path": "README.md"},
    }


def test_map_openai_rejects_multiple_tool_calls() -> None:
    with pytest.raises(ProviderResponseError, match="multiple tool calls"):
        map_openai_chat_completion_to_provider_payload(
            {
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {
                                    "id": "tc1",
                                    "type": "function",
                                    "function": {"name": "Read", "arguments": "{}"},
                                },
                                {
                                    "id": "tc2",
                                    "type": "function",
                                    "function": {"name": "Read", "arguments": "{}"},
                                },
                            ]
                        }
                    }
                ]
            }
        )


def test_map_openai_maps_multiple_tool_calls_when_enabled() -> None:
    payload = map_openai_chat_completion_to_provider_payload(
        {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "tc1",
                                "type": "function",
                                "function": {
                                    "name": "Read",
                                    "arguments": '{"path":"README.md"}',
                                },
                            },
                            {
                                "id": "tc2",
                                "type": "function",
                                "function": {
                                    "name": "Search",
                                    "arguments": '{"path":".","pattern":"TODO"}',
                                },
                            },
                        ]
                    }
                }
            ]
        },
        allow_parallel_tool_calls=True,
    )

    assert payload == {
        "kind": "tool_call_batch",
        "tool_calls": [
            {
                "tool_call_id": "tc1",
                "tool_name": "Read",
                "input": {"path": "README.md"},
            },
            {
                "tool_call_id": "tc2",
                "tool_name": "Search",
                "input": {"path": ".", "pattern": "TODO"},
            },
        ],
    }


def test_map_openai_rejects_malformed_payloads() -> None:
    with pytest.raises(ProviderResponseError, match="at least one choice"):
        map_openai_chat_completion_to_provider_payload({"choices": []})

    with pytest.raises(ProviderResponseError, match="valid JSON"):
        map_openai_chat_completion_to_provider_payload(
            {
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {
                                    "id": "tc1",
                                    "type": "function",
                                    "function": {"name": "Read", "arguments": "not-json"},
                                }
                            ]
                        }
                    }
                ]
            }
        )

    with pytest.raises(ProviderResponseError, match="JSON object"):
        map_openai_chat_completion_to_provider_payload(
            {
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {
                                    "id": "tc1",
                                    "type": "function",
                                    "function": {"name": "Read", "arguments": "[]"},
                                }
                            ]
                        }
                    }
                ]
            }
        )


def test_openai_compatible_client_posts_expected_request() -> None:
    transport = RecordingTransport(
        {"choices": [{"message": {"role": "assistant", "content": "hello"}}]}
    )
    client = OpenAICompatibleProviderClient(
        transport=transport,
        environ={"OPENAI_API_KEY": "secret"},
    )

    payload = client.complete(make_request(), make_config())

    assert payload == {"kind": "assistant", "content": "hello"}
    assert len(transport.requests) == 1
    recorded = transport.requests[0]
    assert recorded["url"] == "https://provider.test/v1/chat/completions"
    assert recorded["timeout_s"] == 12.0
    headers = recorded["headers"]
    assert isinstance(headers, dict)
    assert headers["Authorization"] == "Bearer secret"
    body = recorded["body"]
    assert isinstance(body, dict)
    assert body["model"] == "gpt-test"
    assert body["tool_choice"] == "auto"
    assert body["parallel_tool_calls"] is False
    assert body["max_tokens"] == 128
    assert body["temperature"] == 0.2
    assert "tools" in body


def test_openai_compatible_client_enables_parallel_tool_calls_when_configured() -> None:
    transport = RecordingTransport(
        {"choices": [{"message": {"role": "assistant", "content": "hello"}}]}
    )
    client = OpenAICompatibleProviderClient(
        transport=transport,
        environ={"OPENAI_API_KEY": "secret"},
    )

    client.complete(make_request(), make_parallel_config())

    body = transport.requests[0]["body"]
    assert isinstance(body, dict)
    assert body["parallel_tool_calls"] is True


def test_openai_compatible_client_can_omit_authorization_for_local_provider() -> None:
    transport = RecordingTransport(
        {"choices": [{"message": {"role": "assistant", "content": "local ok"}}]}
    )
    client = OpenAICompatibleProviderClient(
        transport=transport,
        environ={},
        require_api_key=False,
    )

    payload = client.complete(make_request(), make_local_config())

    assert payload == {"kind": "assistant", "content": "local ok"}
    recorded = transport.requests[0]
    headers = recorded["headers"]
    assert isinstance(headers, dict)
    assert headers == {"Content-Type": "application/json"}


def test_openai_compatible_client_uses_optional_authorization_for_local_provider() -> None:
    transport = RecordingTransport(
        {"choices": [{"message": {"role": "assistant", "content": "local ok"}}]}
    )
    client = OpenAICompatibleProviderClient(
        transport=transport,
        environ={"LOCAL_API_KEY": "local-secret"},
        require_api_key=False,
    )

    payload = client.complete(make_request(), make_local_config(api_key_env="LOCAL_API_KEY"))

    assert payload == {"kind": "assistant", "content": "local ok"}
    recorded = transport.requests[0]
    headers = recorded["headers"]
    assert isinstance(headers, dict)
    assert headers["Authorization"] == "Bearer local-secret"


def test_openai_compatible_client_requires_configured_optional_local_api_key_value() -> None:
    client = OpenAICompatibleProviderClient(
        transport=RecordingTransport({}),
        environ={},
        require_api_key=False,
    )

    with pytest.raises(ProviderClientError, match="LOCAL_API_KEY"):
        client.complete(make_request(), make_local_config(api_key_env="LOCAL_API_KEY"))


def test_stream_openai_chat_completion_payloads_maps_assistant_stream() -> None:
    payloads = list(
        stream_openai_chat_completion_payloads(
            iter(
                [
                    *sse_event_lines({"choices": [{"delta": {"content": "hel"}, "finish_reason": None}]}),
                    *sse_event_lines({"choices": [{"delta": {"content": "lo"}, "finish_reason": "stop"}]}),
                    *sse_event_lines("[DONE]"),
                ]
            )
        )
    )

    assert payloads == [
        {"kind": "delta", "text": "hel"},
        {"kind": "delta", "text": "lo"},
        {"kind": "assistant", "content": "hello"},
    ]


def test_stream_openai_chat_completion_payloads_maps_final_usage_chunk() -> None:
    payloads = list(
        stream_openai_chat_completion_payloads(
            iter(
                [
                    *sse_event_lines({"choices": [{"delta": {"content": "ok"}, "finish_reason": "stop"}]}),
                    *sse_event_lines(
                        {
                            "choices": [],
                            "usage": {
                                "prompt_tokens": 5,
                                "completion_tokens": 1,
                                "total_tokens": 6,
                            },
                        }
                    ),
                    *sse_event_lines("[DONE]"),
                ]
            )
        )
    )

    assert payloads == [
        {"kind": "delta", "text": "ok"},
        {
            "kind": "assistant",
            "content": "ok",
            "provider_usage": {
                "input_tokens": 5,
                "output_tokens": 1,
                "total_tokens": 6,
                "source": "openai-compatible.usage",
            },
        },
    ]


def test_stream_openai_chat_completion_payloads_maps_tool_call_stream() -> None:
    payloads = list(
        stream_openai_chat_completion_payloads(
            iter(
                [
                    *sse_event_lines(
                        {
                            "choices": [
                                {
                                    "delta": {
                                        "tool_calls": [
                                            {
                                                "index": 0,
                                                "id": "call_1",
                                                "type": "function",
                                                "function": {
                                                    "name": "Re",
                                                    "arguments": '{"path":"READ',
                                                },
                                            }
                                        ]
                                    },
                                    "finish_reason": None,
                                }
                            ]
                        }
                    ),
                    *sse_event_lines(
                        {
                            "choices": [
                                {
                                    "delta": {
                                        "tool_calls": [
                                            {
                                                "index": 0,
                                                "function": {
                                                    "name": "ad",
                                                    "arguments": 'ME.md"}',
                                                },
                                            }
                                        ]
                                    },
                                    "finish_reason": "tool_calls",
                                }
                            ]
                        }
                    ),
                    *sse_event_lines("[DONE]"),
                ]
            )
        )
    )

    assert payloads == [
        {
            "kind": "tool_call",
            "tool_call_id": "call_1",
            "tool_name": "Read",
            "input": {"path": "README.md"},
        }
    ]


def test_stream_openai_chat_completion_payloads_maps_tool_call_batch_when_enabled() -> None:
    payloads = list(
        stream_openai_chat_completion_payloads(
            iter(
                [
                    *sse_event_lines(
                        {
                            "choices": [
                                {
                                    "delta": {
                                        "tool_calls": [
                                            {
                                                "index": 0,
                                                "id": "call_1",
                                                "type": "function",
                                                "function": {
                                                    "name": "Read",
                                                    "arguments": '{"path":"README.md"}',
                                                },
                                            },
                                            {
                                                "index": 1,
                                                "id": "call_2",
                                                "type": "function",
                                                "function": {
                                                    "name": "Search",
                                                    "arguments": '{"path":".","pattern":"TODO"}',
                                                },
                                            },
                                        ]
                                    },
                                    "finish_reason": "tool_calls",
                                }
                            ]
                        }
                    ),
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
        }
    ]


def test_stream_openai_chat_completion_payloads_rejects_multiple_tool_calls() -> None:
    with pytest.raises(ProviderResponseError, match="single tool call"):
        list(
            stream_openai_chat_completion_payloads(
                iter(
                    [
                        *sse_event_lines(
                            {
                                "choices": [
                                    {
                                        "delta": {
                                            "tool_calls": [
                                                {"index": 0, "id": "call_1", "type": "function"},
                                                {"index": 1, "id": "call_2", "type": "function"},
                                            ]
                                        },
                                        "finish_reason": None,
                                    }
                                ]
                            }
                        ),
                        *sse_event_lines("[DONE]"),
                    ]
                )
            )
        )


def test_stream_openai_chat_completion_payloads_rejects_premature_end() -> None:
    with pytest.raises(ProviderResponseError, match="terminal response"):
        list(
            stream_openai_chat_completion_payloads(
                iter(
                    sse_event_lines(
                        {"choices": [{"delta": {"content": "partial"}, "finish_reason": None}]}
                    )
                )
            )
        )


def test_openai_compatible_client_streams_assistant_payloads() -> None:
    transport = RecordingTransport(
        sse_lines=[
            *sse_event_lines({"choices": [{"delta": {"content": "hel"}, "finish_reason": None}]}),
            *sse_event_lines({"choices": [{"delta": {"content": "lo"}, "finish_reason": "stop"}]}),
            *sse_event_lines("[DONE]"),
        ]
    )
    client = OpenAICompatibleProviderClient(
        transport=transport,
        environ={"OPENAI_API_KEY": "secret"},
    )

    payloads = list(client.stream(make_request(), make_config()))

    assert payloads == [
        {"kind": "delta", "text": "hel"},
        {"kind": "delta", "text": "lo"},
        {"kind": "assistant", "content": "hello"},
    ]
    assert len(transport.requests) == 1
    recorded = transport.requests[0]
    assert recorded["kind"] == "sse"
    body = recorded["body"]
    assert isinstance(body, dict)
    assert body["stream"] is True


def test_openai_compatible_client_prepends_system_prompt() -> None:
    transport = RecordingTransport({"choices": [{"message": {"role": "assistant", "content": "ok"}}]})
    client = OpenAICompatibleProviderClient(
        transport=transport,
        environ={"OPENAI_API_KEY": "secret"},
    )

    client.complete(make_request(system_prompt="Follow host tool policy."), make_config())

    recorded = transport.requests[0]
    body = recorded["body"]
    assert isinstance(body, dict)
    messages = body["messages"]
    assert isinstance(messages, list)
    assert messages[0] == {"role": "system", "content": "Follow host tool policy."}
    assert messages[1] == {"role": "user", "content": "hello"}


def test_openai_compatible_client_maps_stream_error_event() -> None:
    transport = RecordingTransport(
        sse_lines=[
            *sse_event_lines(
                {
                    "error": {
                        "message": "raw stream prompt must not leak",
                        "type": "rate_limit_error",
                        "code": "rate_limit_exceeded",
                    }
                }
            )
        ]
    )
    client = OpenAICompatibleProviderClient(
        transport=transport,
        environ={"OPENAI_API_KEY": "secret"},
    )

    with pytest.raises(ProviderClientError) as captured:
        list(client.stream(make_request(), make_config()))

    error = captured.value
    assert error.retryable is True
    assert error.error_info is not None
    assert error.error_info.category == "rate_limit"
    assert error.error_info.provider == "openai"
    assert "raw stream prompt" not in str(error)


def test_openai_compatible_client_stream_wraps_transport_error() -> None:
    client = OpenAICompatibleProviderClient(
        transport=BrokenTransport(),
        environ={"OPENAI_API_KEY": "secret"},
    )

    with pytest.raises(ProviderClientError, match="transport exploded"):
        list(client.stream(make_request(), make_config()))


def test_openai_compatible_client_wraps_transport_error() -> None:
    client = OpenAICompatibleProviderClient(
        transport=BrokenTransport(),
        environ={"OPENAI_API_KEY": "secret"},
    )

    with pytest.raises(ProviderClientError, match="transport exploded"):
        client.complete(make_request(), make_config())


def test_openai_compatible_client_requires_api_key_env_value() -> None:
    client = OpenAICompatibleProviderClient(transport=RecordingTransport({}), environ={})

    with pytest.raises(ProviderClientError, match="OPENAI_API_KEY"):
        client.complete(make_request(), make_config())

    with pytest.raises(ProviderClientError, match="OPENAI_API_KEY"):
        list(client.stream(make_request(), make_config()))
