import json
from collections.abc import Iterator

import pytest

from god_code_engine.api.god_code_api_models import ToolCatalogEntry
from god_code_engine.models.base import ModelOptions, ModelRequest
from god_code_engine.providers.anthropic_messages import (
    AnthropicMessagesProviderClient,
    format_anthropic_messages,
    format_anthropic_tools,
    map_anthropic_message_to_provider_payload,
    stream_anthropic_message_payloads,
)
from god_code_engine.providers.base import ProviderResponseError
from god_code_engine.providers.config import ProviderConfig, ProviderToolUsePolicy
from god_code_engine.providers.http_client import ProviderClientError
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


def make_config(base_url: str | None = "https://provider.test") -> ProviderConfig:
    return ProviderConfig(
        name="anthropic",
        model="claude-test",
        api_key_env="ANTHROPIC_API_KEY",
        base_url=base_url,
        timeout_s=12.0,
    )


def make_parallel_config(base_url: str | None = "https://provider.test") -> ProviderConfig:
    config = make_config(base_url=base_url)
    config.tool_use = ProviderToolUsePolicy(parallel_tool_calls=True)
    return config


def sse_event_lines(payload: object) -> list[str]:
    text = json.dumps(payload, separators=(",", ":"))
    return [f"event: {payload.get('type', 'message')}", f"data: {text}", ""]


def test_format_anthropic_messages_maps_user_assistant_tool_messages() -> None:
    messages: Messages = [
        {"kind": "user", "content": "read README.md"},
        {"kind": "assistant", "content": "I will read it."},
        {
            "kind": "tool_call",
            "tool_call": {
                "tool_call_id": "toolu_1",
                "tool_name": "Read",
                "input": {"path": "README.md"},
            },
        },
        {
            "kind": "tool_result",
            "tool_call_id": "toolu_1",
            "tool_name": "Read",
            "result": {"ok": True, "output": {"content": "hello"}},
        },
    ]

    formatted = format_anthropic_messages(messages)

    assert formatted[0] == {
        "role": "user",
        "content": [{"type": "text", "text": "read README.md"}],
    }
    assert formatted[1] == {
        "role": "assistant",
        "content": [{"type": "text", "text": "I will read it."}],
    }
    assert formatted[2] == {
        "role": "assistant",
        "content": [
            {
                "type": "tool_use",
                "id": "toolu_1",
                "name": "Read",
                "input": {"path": "README.md"},
            }
        ],
    }
    assert formatted[3] == {
        "role": "user",
        "content": [
            {
                "type": "tool_result",
                "tool_use_id": "toolu_1",
                "content": '{"ok":true,"output":{"content":"hello"}}',
            }
        ],
    }


def test_format_anthropic_messages_requires_tool_result_id() -> None:
    with pytest.raises(ProviderResponseError, match="tool_call_id"):
        format_anthropic_messages(
            [
                {
                    "kind": "tool_result",
                    "tool_name": "Read",
                    "result": {"ok": True},
                }
            ]
        )


def test_format_anthropic_tools_generates_builtin_and_external_schemas() -> None:
    tools = format_anthropic_tools(
        [
            ToolCatalogEntry(name="Read", description="read a file"),
            ToolCatalogEntry(name="ExternalTool", description="external"),
        ]
    )

    assert tools[0]["name"] == "Read"
    read_schema = tools[0]["input_schema"]
    assert isinstance(read_schema, dict)
    assert read_schema["required"] == ["path"]
    assert tools[1]["input_schema"] == {"type": "object", "additionalProperties": True}


def test_map_anthropic_assistant_response_to_provider_payload() -> None:
    payload = map_anthropic_message_to_provider_payload(
        {"content": [{"type": "text", "text": "hel"}, {"type": "text", "text": "lo"}]}
    )

    assert payload == {"kind": "assistant", "content": "hello"}


def test_map_anthropic_assistant_response_includes_provider_usage() -> None:
    payload = map_anthropic_message_to_provider_payload(
        {
            "content": [{"type": "text", "text": "hello"}],
            "usage": {"input_tokens": 9, "output_tokens": 2},
        }
    )

    assert payload["provider_usage"] == {
        "input_tokens": 9,
        "output_tokens": 2,
        "total_tokens": 11,
        "source": "anthropic-messages.usage",
    }


def test_map_anthropic_tool_use_response_to_provider_payload() -> None:
    payload = map_anthropic_message_to_provider_payload(
        {
            "content": [
                {
                    "type": "tool_use",
                    "id": "toolu_1",
                    "name": "Read",
                    "input": {"path": "README.md"},
                }
            ]
        }
    )

    assert payload == {
        "kind": "tool_call",
        "tool_call_id": "toolu_1",
        "tool_name": "Read",
        "input": {"path": "README.md"},
    }


def test_map_anthropic_rejects_multiple_tool_uses() -> None:
    with pytest.raises(ProviderResponseError, match="multiple tool_use"):
        map_anthropic_message_to_provider_payload(
            {
                "content": [
                    {"type": "tool_use", "id": "toolu_1", "name": "Read", "input": {}},
                    {"type": "tool_use", "id": "toolu_2", "name": "Read", "input": {}},
                ]
            }
        )


def test_map_anthropic_maps_multiple_tool_uses_when_enabled() -> None:
    payload = map_anthropic_message_to_provider_payload(
        {
            "content": [
                {
                    "type": "tool_use",
                    "id": "toolu_1",
                    "name": "Read",
                    "input": {"path": "README.md"},
                },
                {
                    "type": "tool_use",
                    "id": "toolu_2",
                    "name": "Search",
                    "input": {"path": ".", "pattern": "TODO"},
                },
            ]
        },
        allow_parallel_tool_calls=True,
    )

    assert payload == {
        "kind": "tool_call_batch",
        "tool_calls": [
            {
                "tool_call_id": "toolu_1",
                "tool_name": "Read",
                "input": {"path": "README.md"},
            },
            {
                "tool_call_id": "toolu_2",
                "tool_name": "Search",
                "input": {"path": ".", "pattern": "TODO"},
            },
        ],
    }


def test_map_anthropic_rejects_malformed_tool_input() -> None:
    with pytest.raises(ProviderResponseError, match="input"):
        map_anthropic_message_to_provider_payload(
            {
                "content": [
                    {
                        "type": "tool_use",
                        "id": "toolu_1",
                        "name": "Read",
                        "input": "not-an-object",
                    }
                ]
            }
        )


def test_anthropic_client_posts_messages_request() -> None:
    transport = RecordingTransport(
        {"content": [{"type": "text", "text": "hello"}]}
    )
    client = AnthropicMessagesProviderClient(
        transport=transport,
        environ={
            "ANTHROPIC_API_KEY": "secret",
            "GOD_CODE_ANTHROPIC_VERSION": "2023-06-01",
        },
    )

    payload = client.complete(make_request(), make_config())

    assert payload == {"kind": "assistant", "content": "hello"}
    assert len(transport.requests) == 1
    recorded = transport.requests[0]
    assert recorded["url"] == "https://provider.test/v1/messages"
    headers = recorded["headers"]
    assert isinstance(headers, dict)
    assert headers["x-api-key"] == "secret"
    assert headers["anthropic-version"] == "2023-06-01"
    body = recorded["body"]
    assert isinstance(body, dict)
    assert body["model"] == "claude-test"
    assert body["max_tokens"] == 128
    assert body["temperature"] == 0.2
    assert "stream" not in body
    assert "tools" in body


def test_anthropic_client_accepts_multiple_tool_uses_when_configured() -> None:
    transport = RecordingTransport(
        {
            "content": [
                {"type": "tool_use", "id": "toolu_1", "name": "Read", "input": {}},
                {"type": "tool_use", "id": "toolu_2", "name": "Search", "input": {}},
            ]
        }
    )
    client = AnthropicMessagesProviderClient(
        transport=transport,
        environ={"ANTHROPIC_API_KEY": "secret"},
    )

    payload = client.complete(make_request(), make_parallel_config())

    assert payload["kind"] == "tool_call_batch"
    assert [tool_call["tool_call_id"] for tool_call in payload["tool_calls"]] == [
        "toolu_1",
        "toolu_2",
    ]


def test_anthropic_client_defaults_base_url_and_max_tokens() -> None:
    transport = RecordingTransport({"content": [{"type": "text", "text": "hello"}]})
    client = AnthropicMessagesProviderClient(
        transport=transport,
        environ={"ANTHROPIC_API_KEY": "secret"},
    )
    request = ModelRequest(
        messages=[{"kind": "user", "content": "hello"}],
        tools=[],
        options=ModelOptions(),
    )

    client.complete(request, make_config(base_url=None))

    recorded = transport.requests[0]
    assert recorded["url"] == "https://api.anthropic.com/v1/messages"
    body = recorded["body"]
    assert isinstance(body, dict)
    assert body["max_tokens"] == 1024


def test_anthropic_client_requires_api_key() -> None:
    client = AnthropicMessagesProviderClient(
        transport=RecordingTransport({"content": [{"type": "text", "text": "hello"}]}),
        environ={},
    )

    with pytest.raises(ProviderClientError, match="ANTHROPIC_API_KEY"):
        client.complete(make_request(), make_config())


def test_anthropic_client_wraps_transport_errors() -> None:
    client = AnthropicMessagesProviderClient(
        transport=BrokenTransport(),
        environ={"ANTHROPIC_API_KEY": "secret"},
    )

    with pytest.raises(ProviderClientError, match="transport exploded"):
        client.complete(make_request(), make_config())


def test_stream_anthropic_message_payloads_maps_text_deltas_and_final() -> None:
    events = list(
        stream_anthropic_message_payloads(
            iter(
                [
                    *sse_event_lines({"type": "message_start", "message": {"id": "msg_1"}}),
                    *sse_event_lines(
                        {
                            "type": "content_block_start",
                            "index": 0,
                            "content_block": {"type": "text", "text": ""},
                        }
                    ),
                    *sse_event_lines(
                        {
                            "type": "content_block_delta",
                            "index": 0,
                            "delta": {"type": "text_delta", "text": "hel"},
                        }
                    ),
                    *sse_event_lines(
                        {
                            "type": "content_block_delta",
                            "index": 0,
                            "delta": {"type": "text_delta", "text": "lo"},
                        }
                    ),
                    *sse_event_lines({"type": "content_block_stop", "index": 0}),
                    *sse_event_lines({"type": "message_stop"}),
                ]
            )
        )
    )

    assert events == [
        {"kind": "delta", "text": "hel"},
        {"kind": "delta", "text": "lo"},
        {"kind": "assistant", "content": "hello"},
    ]


def test_stream_anthropic_message_payloads_maps_usage() -> None:
    events = list(
        stream_anthropic_message_payloads(
            iter(
                [
                    *sse_event_lines(
                        {
                            "type": "message_start",
                            "message": {
                                "id": "msg_1",
                                "usage": {"input_tokens": 8},
                            },
                        }
                    ),
                    *sse_event_lines(
                        {
                            "type": "content_block_delta",
                            "index": 0,
                            "delta": {"type": "text_delta", "text": "ok"},
                        }
                    ),
                    *sse_event_lines(
                        {
                            "type": "message_delta",
                            "usage": {"output_tokens": 1},
                        }
                    ),
                    *sse_event_lines({"type": "message_stop"}),
                ]
            )
        )
    )

    assert events == [
        {"kind": "delta", "text": "ok"},
        {
            "kind": "assistant",
            "content": "ok",
            "provider_usage": {
                "input_tokens": 8,
                "output_tokens": 1,
                "total_tokens": 9,
                "source": "anthropic-messages.usage",
            },
        },
    ]


def test_stream_anthropic_message_payloads_maps_tool_use() -> None:
    events = list(
        stream_anthropic_message_payloads(
            iter(
                [
                    *sse_event_lines(
                        {
                            "type": "content_block_start",
                            "index": 0,
                            "content_block": {
                                "type": "tool_use",
                                "id": "toolu_1",
                                "name": "Read",
                                "input": {},
                            },
                        }
                    ),
                    *sse_event_lines(
                        {
                            "type": "content_block_delta",
                            "index": 0,
                            "delta": {
                                "type": "input_json_delta",
                                "partial_json": '{"path":"README.md"}',
                            },
                        }
                    ),
                    *sse_event_lines({"type": "content_block_stop", "index": 0}),
                    *sse_event_lines({"type": "message_stop"}),
                ]
            )
        )
    )

    assert events == [
        {
            "kind": "tool_call",
            "tool_call_id": "toolu_1",
            "tool_name": "Read",
            "input": {"path": "README.md"},
        }
    ]


def test_stream_anthropic_message_payloads_maps_tool_use_batch_when_enabled() -> None:
    events = list(
        stream_anthropic_message_payloads(
            iter(
                [
                    *sse_event_lines(
                        {
                            "type": "content_block_start",
                            "index": 0,
                            "content_block": {
                                "type": "tool_use",
                                "id": "toolu_1",
                                "name": "Read",
                                "input": {},
                            },
                        }
                    ),
                    *sse_event_lines(
                        {
                            "type": "content_block_delta",
                            "index": 0,
                            "delta": {
                                "type": "input_json_delta",
                                "partial_json": '{"path":"README.md"}',
                            },
                        }
                    ),
                    *sse_event_lines(
                        {
                            "type": "content_block_start",
                            "index": 1,
                            "content_block": {
                                "type": "tool_use",
                                "id": "toolu_2",
                                "name": "Search",
                                "input": {},
                            },
                        }
                    ),
                    *sse_event_lines(
                        {
                            "type": "content_block_delta",
                            "index": 1,
                            "delta": {
                                "type": "input_json_delta",
                                "partial_json": '{"path":".","pattern":"TODO"}',
                            },
                        }
                    ),
                    *sse_event_lines({"type": "message_stop"}),
                ]
            ),
            allow_parallel_tool_calls=True,
        )
    )

    assert events == [
        {
            "kind": "tool_call_batch",
            "tool_calls": [
                {
                    "tool_call_id": "toolu_1",
                    "tool_name": "Read",
                    "input": {"path": "README.md"},
                },
                {
                    "tool_call_id": "toolu_2",
                    "tool_name": "Search",
                    "input": {"path": ".", "pattern": "TODO"},
                },
            ],
        }
    ]


def test_stream_anthropic_message_payloads_rejects_missing_terminal_event() -> None:
    with pytest.raises(ProviderResponseError, match="message_stop"):
        list(
            stream_anthropic_message_payloads(
                iter(
                    [
                        *sse_event_lines(
                            {
                                "type": "content_block_delta",
                                "index": 0,
                                "delta": {"type": "text_delta", "text": "hello"},
                            }
                        )
                    ]
                )
            )
        )


def test_anthropic_client_streams_request() -> None:
    transport = RecordingTransport(
        sse_lines=[
            *sse_event_lines(
                {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": "hello"},
                }
            ),
            *sse_event_lines({"type": "message_stop"}),
        ]
    )
    client = AnthropicMessagesProviderClient(
        transport=transport,
        environ={"ANTHROPIC_API_KEY": "secret"},
    )

    payloads = list(client.stream(make_request(), make_config(base_url="https://provider.test/v1")))

    assert payloads == [
        {"kind": "delta", "text": "hello"},
        {"kind": "assistant", "content": "hello"},
    ]
    recorded = transport.requests[0]
    assert recorded["url"] == "https://provider.test/v1/messages"
    body = recorded["body"]
    assert isinstance(body, dict)
    assert body["stream"] is True


def test_anthropic_client_sets_top_level_system_prompt() -> None:
    transport = RecordingTransport({"content": [{"type": "text", "text": "ok"}]})
    client = AnthropicMessagesProviderClient(
        transport=transport,
        environ={"ANTHROPIC_API_KEY": "secret"},
    )

    client.complete(make_request(system_prompt="Follow host tool policy."), make_config())

    recorded = transport.requests[0]
    body = recorded["body"]
    assert isinstance(body, dict)
    assert body["system"] == "Follow host tool policy."
    messages = body["messages"]
    assert isinstance(messages, list)
    assert messages[0]["role"] == "user"


def test_anthropic_client_maps_stream_error_event() -> None:
    transport = RecordingTransport(
        sse_lines=[
            *sse_event_lines(
                {
                    "type": "error",
                    "error": {
                        "type": "overloaded_error",
                        "message": "raw anthropic prompt must not leak",
                    },
                }
            )
        ]
    )
    client = AnthropicMessagesProviderClient(
        transport=transport,
        environ={"ANTHROPIC_API_KEY": "secret"},
    )

    with pytest.raises(ProviderClientError) as captured:
        list(client.stream(make_request(), make_config()))

    error = captured.value
    assert error.retryable is True
    assert error.error_info is not None
    assert error.error_info.category == "server_error"
    assert error.error_info.provider == "anthropic"
    assert "raw anthropic prompt" not in str(error)
