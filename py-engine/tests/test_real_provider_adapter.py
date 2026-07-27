from collections.abc import Iterator

import pytest

from god_code_engine.api.god_code_api_models import ToolCatalogEntry
from god_code_engine.models.base import (
    AssistantDelta,
    AssistantMessageAction,
    ModelOptions,
    ModelRequest,
    ToolCallBatchAction,
    ToolCallAction,
)
from god_code_engine.providers.base import ProviderResponseError
from god_code_engine.providers.config import (
    ProviderConfig,
    ProviderRateLimitPolicy,
    ProviderRetryPolicy,
    ProviderUsageBudget,
)
from god_code_engine.providers.errors import ProviderErrorInfo
from god_code_engine.providers.http_client import HttpProviderClient, ProviderClientError
from god_code_engine.providers.real_adapter import (
    FallbackProviderModelAdapter,
    RealProviderModelAdapter,
)
from god_code_engine.types import JsonMapping, Messages


class StaticHttpClient(HttpProviderClient):
    def __init__(self, payload: JsonMapping) -> None:
        self._payload = payload
        self.complete_calls = 0

    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        assert config.name == "demo"
        assert request.options.provider is None
        self.complete_calls += 1
        return self._payload


class BrokenHttpClient(HttpProviderClient):
    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        del request, config
        raise RuntimeError("client exploded")


class FlakyHttpClient(HttpProviderClient):
    def __init__(
        self,
        failures: list[ProviderClientError],
        payload: JsonMapping | None = None,
    ) -> None:
        self._failures = list(failures)
        self._payload = payload or {"kind": "assistant", "content": "ok"}
        self.complete_calls = 0

    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        del request, config
        self.complete_calls += 1
        if self._failures:
            raise self._failures.pop(0)
        return self._payload


class StreamingHttpClient(HttpProviderClient):
    supports_stream = True

    def __init__(self, payloads: list[JsonMapping]) -> None:
        self._payloads = payloads
        self.stream_calls = 0

    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        del request, config
        raise AssertionError("complete should not be called for streaming clients.")

    def stream(
        self,
        request: ModelRequest,
        config: ProviderConfig,
    ) -> Iterator[JsonMapping]:
        del request, config
        self.stream_calls += 1
        yield from self._payloads


class FlakyStreamingHttpClient(HttpProviderClient):
    supports_stream = True

    def __init__(self, fail_before_event: int = 0, fail_after_delta: bool = False) -> None:
        self.fail_before_event = fail_before_event
        self.fail_after_delta = fail_after_delta
        self.stream_calls = 0

    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        del request, config
        raise AssertionError("complete should not be called for streaming clients.")

    def stream(
        self,
        request: ModelRequest,
        config: ProviderConfig,
    ) -> Iterator[JsonMapping]:
        del request, config
        self.stream_calls += 1
        if self.stream_calls <= self.fail_before_event:
            raise ProviderClientError("temporary setup failure", retryable=True)
        yield {"kind": "delta", "text": "partial"}
        if self.fail_after_delta:
            raise ProviderClientError("mid-stream failure", retryable=True)
        yield {"kind": "assistant", "content": "done"}


def make_request(tool_names: list[str] | None = None) -> ModelRequest:
    messages: Messages = [{"kind": "user", "content": "hello"}]
    tools = [
        ToolCatalogEntry(name=tool_name, description=tool_name.lower())
        for tool_name in (tool_names or [])
    ]
    return ModelRequest(messages=messages, tools=tools, options=ModelOptions())


def make_adapter(
    client: HttpProviderClient,
    *,
    retry: ProviderRetryPolicy | None = None,
    usage_budget: ProviderUsageBudget | None = None,
    rate_limit: ProviderRateLimitPolicy | None = None,
    sleeps: list[float] | None = None,
) -> RealProviderModelAdapter:
    return RealProviderModelAdapter(
        config=ProviderConfig(
            name="demo",
            model="demo-model",
            api_key_env="DEMO_API_KEY",
            timeout_s=10.0,
            retry=retry or ProviderRetryPolicy(),
            usage_budget=usage_budget or ProviderUsageBudget(),
            rate_limit=rate_limit or ProviderRateLimitPolicy(),
        ),
        client=client,
        sleeper=(sleeps.append if sleeps is not None else None),
    )


def test_real_provider_adapter_maps_assistant_payload() -> None:
    adapter = make_adapter(StaticHttpClient({"kind": "assistant", "content": "hello"}))

    action = adapter.next_action(make_request())

    assert isinstance(action, AssistantMessageAction)
    assert action.message.content == "hello"


def test_real_provider_adapter_allows_usage_within_budget() -> None:
    adapter = make_adapter(
        StaticHttpClient(
            {
                "kind": "assistant",
                "content": "hello",
                "provider_usage": {
                    "input_tokens": 10,
                    "output_tokens": 2,
                    "total_tokens": 12,
                },
            }
        ),
        usage_budget=ProviderUsageBudget(max_total_tokens=12, require_usage=True),
    )

    action = adapter.next_action(make_request())

    assert isinstance(action, AssistantMessageAction)
    assert action.message.content == "hello"


def test_real_provider_adapter_rejects_usage_over_budget() -> None:
    adapter = make_adapter(
        StaticHttpClient(
            {
                "kind": "assistant",
                "content": "hello",
                "provider_usage": {
                    "input_tokens": 10,
                    "output_tokens": 3,
                    "total_tokens": 13,
                },
            }
        ),
        usage_budget=ProviderUsageBudget(max_total_tokens=12),
    )

    with pytest.raises(ProviderResponseError, match="provider_budget: total_tokens 13"):
        adapter.next_action(make_request())


def test_real_provider_adapter_rejects_missing_required_usage() -> None:
    adapter = make_adapter(
        StaticHttpClient({"kind": "assistant", "content": "hello"}),
        usage_budget=ProviderUsageBudget(require_usage=True),
    )

    with pytest.raises(ProviderResponseError, match="usage metadata is required"):
        adapter.next_action(make_request())


def test_real_provider_adapter_stream_rejects_final_usage_over_budget_after_delta() -> None:
    adapter = make_adapter(
        StreamingHttpClient(
            [
                {"kind": "delta", "text": "hel"},
                {
                    "kind": "assistant",
                    "content": "hello",
                    "provider_usage": {"output_tokens": 5},
                },
            ]
        ),
        usage_budget=ProviderUsageBudget(max_output_tokens=4),
    )

    stream = adapter.stream_actions(make_request())
    first = next(stream)
    assert isinstance(first, AssistantDelta)
    with pytest.raises(ProviderResponseError, match="output_tokens 5"):
        next(stream)


def test_real_provider_adapter_captures_provider_context() -> None:
    adapter = make_adapter(
        StaticHttpClient(
            {
                "kind": "assistant",
                "content": "hello",
                "provider_context": {
                    "provider_name": "openai-responses",
                    "items": [{"type": "message"}],
                },
            }
        )
    )

    action = adapter.next_action(make_request())

    assert isinstance(action, AssistantMessageAction)
    assert adapter.pop_provider_context() == {
        "provider_name": "openai-responses",
        "items": [{"type": "message"}],
    }
    assert adapter.pop_provider_context() is None


def test_real_provider_adapter_maps_tool_call_payload() -> None:
    adapter = make_adapter(
        StaticHttpClient(
            {
                "kind": "tool_call",
                "tool_call_id": "tc1",
                "tool_name": "Read",
                "input": {"path": "README.md"},
            }
        )
    )

    action = adapter.next_action(make_request(["Read"]))

    assert isinstance(action, ToolCallAction)
    assert action.tool_call.tool_name == "Read"


def test_real_provider_adapter_maps_tool_call_batch_payload() -> None:
    adapter = make_adapter(
        StaticHttpClient(
            {
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
        )
    )

    action = adapter.next_action(make_request(["Read", "Search"]))

    assert isinstance(action, ToolCallBatchAction)
    assert [tool_call.tool_name for tool_call in action.tool_calls] == ["Read", "Search"]


def test_real_provider_adapter_rejects_unknown_tool_call_batch_member() -> None:
    adapter = make_adapter(
        StaticHttpClient(
            {
                "kind": "tool_call_batch",
                "tool_calls": [
                    {"tool_call_id": "tc1", "tool_name": "Read", "input": {"path": "README.md"}},
                    {"tool_call_id": "tc2", "tool_name": "Bash", "input": {"command": "printf ok"}},
                ],
            }
        )
    )

    with pytest.raises(ProviderResponseError, match="Provider returned unknown tool: Bash"):
        adapter.next_action(make_request(["Read"]))


def test_real_provider_adapter_rejects_unknown_tool_call() -> None:
    adapter = make_adapter(
        StaticHttpClient(
            {
                "kind": "tool_call",
                "tool_call_id": "tc1",
                "tool_name": "Bash",
                "input": {"command": "printf ok"},
            }
        )
    )

    with pytest.raises(ProviderResponseError, match="Provider returned unknown tool: Bash"):
        adapter.next_action(make_request(["Read"]))


def test_real_provider_adapter_rejects_malformed_payload() -> None:
    adapter = make_adapter(StaticHttpClient({"kind": "assistant"}))

    with pytest.raises(ProviderResponseError, match="content"):
        adapter.next_action(make_request())


def test_real_provider_adapter_wraps_client_errors() -> None:
    adapter = make_adapter(BrokenHttpClient())

    with pytest.raises(ProviderClientError, match="client exploded"):
        adapter.next_action(make_request())


def test_real_provider_adapter_streams_delta_and_final_action() -> None:
    adapter = make_adapter(
        StreamingHttpClient(
            [
                {"kind": "delta", "text": "hel"},
                {"kind": "assistant", "content": "hello"},
            ]
        )
    )

    events = list(adapter.stream_actions(make_request()))

    assert isinstance(events[0], AssistantDelta)
    assert events[0].text == "hel"
    assert isinstance(events[1], AssistantMessageAction)
    assert events[1].message.content == "hello"


def test_real_provider_adapter_streams_final_tool_call() -> None:
    adapter = make_adapter(
        StreamingHttpClient(
            [
                {"kind": "delta", "text": "planning"},
                {
                    "kind": "tool_call",
                    "tool_call_id": "tc1",
                    "tool_name": "Read",
                    "input": {"path": "README.md"},
                },
            ]
        )
    )

    events = list(adapter.stream_actions(make_request(["Read"])))

    assert isinstance(events[0], AssistantDelta)
    assert isinstance(events[1], ToolCallAction)
    assert events[1].tool_call.tool_name == "Read"


def test_real_provider_adapter_streaming_falls_back_to_next_action() -> None:
    adapter = make_adapter(StaticHttpClient({"kind": "assistant", "content": "fallback"}))

    events = list(adapter.stream_actions(make_request()))

    assert len(events) == 1
    assert isinstance(events[0], AssistantMessageAction)
    assert events[0].message.content == "fallback"


def test_real_provider_adapter_rejects_stream_without_final_action() -> None:
    adapter = make_adapter(StreamingHttpClient([{"kind": "delta", "text": "partial"}]))

    with pytest.raises(ProviderResponseError, match="ended without a final response"):
        list(adapter.stream_actions(make_request()))


def test_real_provider_adapter_retries_retryable_complete_errors() -> None:
    sleeps: list[float] = []
    client = FlakyHttpClient([ProviderClientError("temporary", retryable=True)])
    adapter = make_adapter(
        client,
        retry=ProviderRetryPolicy(max_retries=2, base_delay_ms=10, max_delay_ms=100),
        sleeps=sleeps,
    )

    action = adapter.next_action(make_request())

    assert isinstance(action, AssistantMessageAction)
    assert action.message.content == "ok"
    assert client.complete_calls == 2
    assert sleeps == [0.01]


def test_real_provider_adapter_does_not_retry_non_retryable_complete_errors() -> None:
    sleeps: list[float] = []
    client = FlakyHttpClient([ProviderClientError("bad request", retryable=False, status_code=400)])
    adapter = make_adapter(
        client,
        retry=ProviderRetryPolicy(max_retries=2, base_delay_ms=10, max_delay_ms=100),
        sleeps=sleeps,
    )

    with pytest.raises(ProviderClientError, match="bad request") as raised:
        adapter.next_action(make_request())

    assert raised.value.status_code == 400
    assert raised.value.attempts == 1
    assert client.complete_calls == 1
    assert sleeps == []


def test_real_provider_adapter_reports_attempts_after_retry_exhaustion() -> None:
    client = FlakyHttpClient(
        [
            ProviderClientError("temporary one", retryable=True, status_code=503),
            ProviderClientError("temporary two", retryable=True, status_code=503),
        ]
    )
    adapter = make_adapter(
        client,
        retry=ProviderRetryPolicy(max_retries=1, base_delay_ms=0, max_delay_ms=0),
        sleeps=[],
    )

    with pytest.raises(ProviderClientError, match="after 2 attempts") as raised:
        adapter.next_action(make_request())

    assert raised.value.retryable is True
    assert raised.value.status_code == 503
    assert raised.value.attempts == 2
    assert client.complete_calls == 2


def test_real_provider_adapter_preserves_error_info_after_retry_exhaustion() -> None:
    error_info = ProviderErrorInfo(
        category="rate_limit",
        provider="demo",
        status_code=429,
        provider_error_type="rate_limit_error",
        provider_error_code="rate_limit_exceeded",
        retryable=True,
    )
    client = FlakyHttpClient(
        [
            ProviderClientError.from_error_info(error_info),
            ProviderClientError.from_error_info(error_info),
        ]
    )
    adapter = make_adapter(
        client,
        retry=ProviderRetryPolicy(max_retries=1, base_delay_ms=0, max_delay_ms=0),
        sleeps=[],
    )

    with pytest.raises(ProviderClientError, match="after 2 attempts") as raised:
        adapter.next_action(make_request())

    assert raised.value.retryable is True
    assert raised.value.status_code == 429
    assert raised.value.attempts == 2
    assert raised.value.error_info == error_info
    assert "rate_limit" in str(raised.value)


def test_real_provider_adapter_rate_limit_fail_fast_rejects_before_client_call() -> None:
    client = StaticHttpClient({"kind": "assistant", "content": "ok"})
    adapter = make_adapter(
        client,
        rate_limit=ProviderRateLimitPolicy(
            enabled=True,
            strategy="fail-fast",
            min_interval_ms=1000,
        ),
    )

    action = adapter.next_action(make_request())
    assert isinstance(action, AssistantMessageAction)

    with pytest.raises(ProviderClientError, match="provider_rate_limit") as raised:
        adapter.next_action(make_request())

    assert raised.value.retryable is False
    assert raised.value.status_code is None
    assert raised.value.error_info is not None
    assert raised.value.error_info.category == "rate_limit"
    assert raised.value.error_info.retryable is False
    assert client.complete_calls == 1


def test_real_provider_adapter_rate_limit_waits_with_fake_sleeper() -> None:
    sleeps: list[float] = []
    client = StaticHttpClient({"kind": "assistant", "content": "ok"})
    adapter = make_adapter(
        client,
        rate_limit=ProviderRateLimitPolicy(
            enabled=True,
            strategy="wait",
            min_interval_ms=100,
            max_wait_ms=100,
        ),
        sleeps=sleeps,
    )

    adapter.next_action(make_request())
    adapter.next_action(make_request())

    assert client.complete_calls == 2
    assert sleeps == [0.1]


def test_real_provider_adapter_rate_limit_rejects_wait_above_max() -> None:
    sleeps: list[float] = []
    client = StaticHttpClient({"kind": "assistant", "content": "ok"})
    adapter = make_adapter(
        client,
        rate_limit=ProviderRateLimitPolicy(
            enabled=True,
            strategy="wait",
            min_interval_ms=1000,
            max_wait_ms=100,
        ),
        sleeps=sleeps,
    )

    adapter.next_action(make_request())
    with pytest.raises(ProviderClientError, match="provider_rate_limit") as raised:
        adapter.next_action(make_request())

    assert raised.value.retryable is False
    assert client.complete_calls == 1
    assert sleeps == []


def test_real_provider_adapter_rate_limit_applies_to_retry_attempts() -> None:
    sleeps: list[float] = []
    client = FlakyHttpClient([ProviderClientError("temporary", retryable=True)])
    adapter = make_adapter(
        client,
        retry=ProviderRetryPolicy(max_retries=1, base_delay_ms=0, max_delay_ms=0),
        rate_limit=ProviderRateLimitPolicy(
            enabled=True,
            strategy="wait",
            min_interval_ms=10,
            max_wait_ms=10,
        ),
        sleeps=sleeps,
    )

    action = adapter.next_action(make_request())

    assert isinstance(action, AssistantMessageAction)
    assert client.complete_calls == 2
    assert sleeps == [0.01]


def test_real_provider_adapter_retries_stream_setup_before_first_event() -> None:
    sleeps: list[float] = []
    client = FlakyStreamingHttpClient(fail_before_event=1)
    adapter = make_adapter(
        client,
        retry=ProviderRetryPolicy(max_retries=2, base_delay_ms=5, max_delay_ms=20),
        sleeps=sleeps,
    )

    events = list(adapter.stream_actions(make_request()))

    assert client.stream_calls == 2
    assert sleeps == [0.005]
    assert isinstance(events[0], AssistantDelta)
    assert isinstance(events[1], AssistantMessageAction)
    assert events[1].message.content == "done"


def test_real_provider_adapter_does_not_retry_after_stream_event() -> None:
    sleeps: list[float] = []
    client = FlakyStreamingHttpClient(fail_after_delta=True)
    adapter = make_adapter(
        client,
        retry=ProviderRetryPolicy(max_retries=2, base_delay_ms=5, max_delay_ms=20),
        sleeps=sleeps,
    )

    with pytest.raises(ProviderClientError, match="mid-stream failure") as raised:
        list(adapter.stream_actions(make_request()))

    assert raised.value.attempts == 1
    assert client.stream_calls == 1
    assert sleeps == []


def test_real_provider_adapter_rate_limit_checks_before_stream_start() -> None:
    client = StreamingHttpClient(
        [
            {"kind": "delta", "text": "hel"},
            {"kind": "assistant", "content": "hello"},
        ]
    )
    adapter = make_adapter(
        client,
        rate_limit=ProviderRateLimitPolicy(
            enabled=True,
            strategy="fail-fast",
            min_interval_ms=1000,
        ),
    )

    assert len(list(adapter.stream_actions(make_request()))) == 2
    with pytest.raises(ProviderClientError, match="provider_rate_limit"):
        list(adapter.stream_actions(make_request()))

    assert client.stream_calls == 1


def test_fallback_provider_adapter_uses_next_provider_after_retryable_failure() -> None:
    primary_client = FlakyHttpClient(
        [ProviderClientError("primary unavailable", retryable=True, status_code=503)]
    )
    fallback_client = StaticHttpClient({"kind": "assistant", "content": "fallback"})
    adapter = FallbackProviderModelAdapter(
        [
            make_adapter(primary_client),
            make_adapter(fallback_client),
        ]
    )

    action = adapter.next_action(make_request())

    assert isinstance(action, AssistantMessageAction)
    assert action.message.content == "fallback"
    assert primary_client.complete_calls == 1
    assert fallback_client.complete_calls == 1


def test_fallback_provider_adapter_does_not_fallback_for_non_retryable_failure() -> None:
    primary_client = FlakyHttpClient(
        [ProviderClientError("bad request", retryable=False, status_code=400)]
    )
    fallback_client = StaticHttpClient({"kind": "assistant", "content": "fallback"})
    adapter = FallbackProviderModelAdapter(
        [
            make_adapter(primary_client),
            make_adapter(fallback_client),
        ]
    )

    with pytest.raises(ProviderClientError, match="bad request") as raised:
        adapter.next_action(make_request())

    assert raised.value.status_code == 400
    assert primary_client.complete_calls == 1
    assert fallback_client.complete_calls == 0
    assert adapter.pop_provider_context() is None


def test_fallback_provider_adapter_streams_from_fallback_before_first_event() -> None:
    primary_client = FlakyStreamingHttpClient(fail_before_event=1)
    fallback_client = StreamingHttpClient(
        [
            {"kind": "delta", "text": "fb"},
            {"kind": "assistant", "content": "fallback"},
        ]
    )
    adapter = FallbackProviderModelAdapter(
        [
            make_adapter(primary_client),
            make_adapter(fallback_client),
        ]
    )

    events = list(adapter.stream_actions(make_request()))

    assert primary_client.stream_calls == 1
    assert fallback_client.stream_calls == 1
    assert isinstance(events[0], AssistantDelta)
    assert events[0].text == "fb"
    assert isinstance(events[1], AssistantMessageAction)
    assert events[1].message.content == "fallback"


def test_fallback_provider_adapter_does_not_fallback_after_stream_event() -> None:
    primary_client = FlakyStreamingHttpClient(fail_after_delta=True)
    fallback_client = StreamingHttpClient(
        [
            {"kind": "delta", "text": "fb"},
            {"kind": "assistant", "content": "fallback"},
        ]
    )
    adapter = FallbackProviderModelAdapter(
        [
            make_adapter(primary_client),
            make_adapter(fallback_client),
        ]
    )

    with pytest.raises(ProviderClientError, match="mid-stream failure") as raised:
        list(adapter.stream_actions(make_request()))

    assert raised.value.attempts == 1
    assert primary_client.stream_calls == 1
    assert fallback_client.stream_calls == 0


def test_fallback_provider_adapter_does_not_bypass_local_rate_limit() -> None:
    primary_client = StaticHttpClient({"kind": "assistant", "content": "primary"})
    fallback_client = StaticHttpClient({"kind": "assistant", "content": "fallback"})
    adapter = FallbackProviderModelAdapter(
        [
            make_adapter(
                primary_client,
                rate_limit=ProviderRateLimitPolicy(
                    enabled=True,
                    strategy="fail-fast",
                    min_interval_ms=1000,
                ),
            ),
            make_adapter(fallback_client),
        ]
    )

    first = adapter.next_action(make_request())
    assert isinstance(first, AssistantMessageAction)
    assert first.message.content == "primary"

    with pytest.raises(ProviderClientError, match="provider_rate_limit") as raised:
        adapter.next_action(make_request())

    assert raised.value.retryable is False
    assert primary_client.complete_calls == 1
    assert fallback_client.complete_calls == 0


def test_fallback_provider_adapter_pops_context_from_selected_fallback() -> None:
    primary_client = FlakyHttpClient(
        [ProviderClientError("primary unavailable", retryable=True, status_code=503)]
    )
    fallback_client = StaticHttpClient(
        {
            "kind": "assistant",
            "content": "fallback",
            "provider_context": {
                "provider_name": "fallback-provider",
                "items": [{"type": "message"}],
            },
        }
    )
    adapter = FallbackProviderModelAdapter(
        [
            make_adapter(primary_client),
            make_adapter(fallback_client),
        ]
    )

    action = adapter.next_action(make_request())

    assert isinstance(action, AssistantMessageAction)
    assert adapter.pop_provider_context() == {
        "provider_name": "fallback-provider",
        "items": [{"type": "message"}],
    }
    assert adapter.pop_provider_context() is None
