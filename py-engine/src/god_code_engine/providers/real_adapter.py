from __future__ import annotations

import time
from collections.abc import Callable, Iterator

from god_code_engine.api.god_code_api_models import ValidationError, require_str
from god_code_engine.models.base import (
    AssistantDelta,
    ModelAction,
    ModelRequest,
    ModelStreamEvent,
    StreamingModelAdapter,
)
from god_code_engine.providers.base import (
    ProviderModelAdapter,
    ProviderResponseError,
    ProviderResponseNormalizer,
)
from god_code_engine.providers.config import ProviderConfig, ProviderUsageBudget
from god_code_engine.providers.http_client import HttpProviderClient, ProviderClientError
from god_code_engine.providers.normalizer import (
    SimpleProviderResponseNormalizer,
    validate_tool_call_against_catalog,
)
from god_code_engine.providers.rate_limit import (
    ProviderRateLimiter,
    provider_rate_limit_error,
    provider_rate_limit_key,
)
from god_code_engine.providers.usage import provider_usage_from_payload
from god_code_engine.types import JsonMapping, JsonObject


class RealProviderModelAdapter(ProviderModelAdapter, StreamingModelAdapter):
    def __init__(
        self,
        config: ProviderConfig,
        client: HttpProviderClient,
        normalizer: ProviderResponseNormalizer | None = None,
        sleeper: Callable[[float], None] | None = None,
        rate_limiter: ProviderRateLimiter | None = None,
    ) -> None:
        self.name = config.name
        self.provider_name = config.name
        self._config = config
        self._client = client
        self._normalizer = normalizer or SimpleProviderResponseNormalizer()
        self._sleeper = sleeper or time.sleep
        self._rate_limiter = rate_limiter or ProviderRateLimiter(
            config.rate_limit,
            sleeper=self._sleeper,
        )
        self._rate_limit_key = provider_rate_limit_key(config)
        self._last_provider_context: JsonObject | None = None

    def next_action(self, request: ModelRequest) -> ModelAction:
        try:
            raw = self._complete_with_retries(request)
        except ProviderClientError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise ProviderClientError(str(exc)) from exc

        return self._normalize_action(raw, request)

    def pop_provider_context(self) -> JsonObject | None:
        context = self._last_provider_context
        self._last_provider_context = None
        return context

    def stream_actions(self, request: ModelRequest) -> Iterator[ModelStreamEvent]:
        if not self._client.supports_stream:
            yield self.next_action(request)
            return

        final_action: ModelAction | None = None
        try:
            for raw in self._stream_with_retries(request):
                if raw.get("kind") == "delta":
                    yield AssistantDelta(text=_require_delta_text(raw))
                    continue
                final_action = self._normalize_action(raw, request)
                yield final_action
                return
        except ProviderClientError:
            raise
        except ProviderResponseError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise ProviderClientError(str(exc)) from exc

        if final_action is None:
            raise ProviderResponseError("Provider stream ended without a final response.")

    def _normalize_action(self, raw: JsonMapping, request: ModelRequest) -> ModelAction:
        _enforce_usage_budget(raw, self._config.usage_budget)
        provider_context = raw.get("provider_context")
        if isinstance(provider_context, dict):
            self._last_provider_context = dict(provider_context)
        action = self._normalizer.normalize(raw)
        return validate_tool_call_against_catalog(action, request.tools)

    def _complete_with_retries(self, request: ModelRequest) -> JsonMapping:
        max_retries = self._config.retry.max_retries
        for attempt_index in range(max_retries + 1):
            try:
                self._acquire_rate_limit()
                return self._client.complete(request, self._config)
            except ProviderClientError as exc:
                if not _should_retry(exc, attempt_index, max_retries):
                    raise _with_attempts(exc, attempt_index + 1) from exc
                self._sleep_before_retry(attempt_index)

        raise ProviderClientError("Provider retry loop exhausted unexpectedly.")

    def _stream_with_retries(self, request: ModelRequest) -> Iterator[JsonMapping]:
        max_retries = self._config.retry.max_retries
        for attempt_index in range(max_retries + 1):
            emitted_provider_event = False
            try:
                self._acquire_rate_limit()
                for raw in self._client.stream(request, self._config):
                    emitted_provider_event = True
                    yield raw
                return
            except ProviderClientError as exc:
                if emitted_provider_event or not _should_retry(exc, attempt_index, max_retries):
                    raise _with_attempts(exc, attempt_index + 1) from exc
                self._sleep_before_retry(attempt_index)

    def _sleep_before_retry(self, retry_index: int) -> None:
        delay_ms = min(
            self._config.retry.max_delay_ms,
            self._config.retry.base_delay_ms * (2 ** retry_index),
        )
        if delay_ms > 0:
            self._sleeper(delay_ms / 1000)

    def _acquire_rate_limit(self) -> None:
        decision = self._rate_limiter.acquire(self._rate_limit_key)
        if not decision.allowed:
            raise provider_rate_limit_error(self._config, decision)


class FallbackProviderModelAdapter(ProviderModelAdapter, StreamingModelAdapter):
    def __init__(self, adapters: list[RealProviderModelAdapter]) -> None:
        if not adapters:
            raise ValueError("FallbackProviderModelAdapter requires at least one adapter.")
        self.name = adapters[0].name
        self.provider_name = adapters[0].provider_name
        self._adapters = adapters
        self._selected_adapter: RealProviderModelAdapter | None = None

    def next_action(self, request: ModelRequest) -> ModelAction:
        self._selected_adapter = None
        for index, adapter in enumerate(self._adapters):
            try:
                action = adapter.next_action(request)
            except ProviderClientError as exc:
                if not _should_fallback(exc, index, len(self._adapters)):
                    raise
                continue
            self._selected_adapter = adapter
            return action
        raise ProviderClientError("Provider fallback chain exhausted unexpectedly.")

    def stream_actions(self, request: ModelRequest) -> Iterator[ModelStreamEvent]:
        self._selected_adapter = None
        for index, adapter in enumerate(self._adapters):
            emitted_event = False
            try:
                for event in adapter.stream_actions(request):
                    emitted_event = True
                    yield event
                self._selected_adapter = adapter
                return
            except ProviderClientError as exc:
                if emitted_event or not _should_fallback(exc, index, len(self._adapters)):
                    raise
                continue

    def pop_provider_context(self) -> JsonObject | None:
        if self._selected_adapter is None:
            return None
        context = self._selected_adapter.pop_provider_context()
        self._selected_adapter = None
        return context


def _require_delta_text(raw: JsonMapping) -> str:
    try:
        return require_str(raw, "text")
    except ValidationError as exc:
        raise ProviderResponseError(str(exc)) from exc


def _should_retry(error: ProviderClientError, attempt_index: int, max_retries: int) -> bool:
    return error.retryable and attempt_index < max_retries


def _should_fallback(error: ProviderClientError, adapter_index: int, adapter_count: int) -> bool:
    return error.retryable and adapter_index < adapter_count - 1


def _with_attempts(error: ProviderClientError, attempts: int) -> ProviderClientError:
    if attempts <= 1:
        error.attempts = attempts
        return error
    return ProviderClientError(
        f"{error} (after {attempts} attempts)",
        retryable=error.retryable,
        status_code=error.status_code,
        attempts=attempts,
        error_info=error.error_info,
    )


def _enforce_usage_budget(raw: JsonMapping, budget: ProviderUsageBudget) -> None:
    if not _budget_is_enabled(budget):
        return
    usage = provider_usage_from_payload(raw)
    if usage is None:
        if budget.require_usage:
            raise ProviderResponseError("provider_budget: provider usage metadata is required.")
        return
    _check_usage_limit("input_tokens", usage.input_tokens, budget.max_input_tokens)
    _check_usage_limit("output_tokens", usage.output_tokens, budget.max_output_tokens)
    _check_usage_limit("total_tokens", usage.total_tokens, budget.max_total_tokens)


def _budget_is_enabled(budget: ProviderUsageBudget) -> bool:
    return (
        budget.require_usage
        or budget.max_input_tokens is not None
        or budget.max_output_tokens is not None
        or budget.max_total_tokens is not None
    )


def _check_usage_limit(field: str, actual: int | None, limit: int | None) -> None:
    if limit is None or actual is None:
        return
    if actual > limit:
        raise ProviderResponseError(
            f"provider_budget: {field} {actual} exceeds configured limit {limit}."
        )
