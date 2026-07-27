from __future__ import annotations

import math
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import urlparse

from god_code_engine.providers.config import ProviderConfig, ProviderRateLimitPolicy
from god_code_engine.providers.errors import ProviderErrorInfo
from god_code_engine.providers.http_client import ProviderClientError


@dataclass(frozen=True, slots=True)
class ProviderRateLimitDecision:
    allowed: bool
    wait_ms: int = 0
    reason: str = "allowed"


class ProviderRateLimiter:
    def __init__(
        self,
        policy: ProviderRateLimitPolicy,
        *,
        clock: Callable[[], float] | None = None,
        sleeper: Callable[[float], None] | None = None,
    ) -> None:
        self._policy = policy
        self._clock = clock or time.monotonic
        self._sleeper = sleeper or time.sleep
        self._events_by_key: dict[str, deque[float]] = {}

    def acquire(self, key: str) -> ProviderRateLimitDecision:
        if not self._policy.enabled:
            return ProviderRateLimitDecision(allowed=True)

        now = self._clock()
        events = self._events_for(key, now)
        wait_ms = self._required_wait_ms(events, now)
        if wait_ms <= 0:
            events.append(now)
            return ProviderRateLimitDecision(allowed=True)

        if self._policy.strategy == "fail-fast":
            return ProviderRateLimitDecision(
                allowed=False,
                wait_ms=wait_ms,
                reason="rate_limit_exceeded",
            )

        if wait_ms > self._policy.max_wait_ms:
            return ProviderRateLimitDecision(
                allowed=False,
                wait_ms=wait_ms,
                reason="max_wait_exceeded",
            )

        self._sleeper(wait_ms / 1000)
        events.append(now + (wait_ms / 1000))
        return ProviderRateLimitDecision(
            allowed=True,
            wait_ms=wait_ms,
            reason="waited",
        )

    def _events_for(self, key: str, now: float) -> deque[float]:
        events = self._events_by_key.setdefault(key, deque())
        window_start = now - 60
        while events and events[0] <= window_start:
            events.popleft()
        return events

    def _required_wait_ms(self, events: deque[float], now: float) -> int:
        waits: list[int] = []
        if self._policy.min_interval_ms > 0 and events:
            next_allowed = events[-1] + (self._policy.min_interval_ms / 1000)
            waits.append(_ceil_wait_ms(next_allowed - now))
        if self._policy.requests_per_minute is not None:
            if len(events) >= self._policy.requests_per_minute:
                next_allowed = events[0] + 60
                waits.append(_ceil_wait_ms(next_allowed - now))
        return max((wait for wait in waits if wait > 0), default=0)


def provider_rate_limit_key(config: ProviderConfig) -> str:
    host = _host_category(config.base_url)
    return f"{_safe_key_part(config.name)}:{_safe_key_part(config.model)}:{host}"


def provider_rate_limit_error(
    config: ProviderConfig,
    decision: ProviderRateLimitDecision,
) -> ProviderClientError:
    provider = _safe_message_token(config.name)
    return ProviderClientError(
        f"provider_rate_limit: exceeded local process limit for {provider}",
        retryable=False,
        error_info=ProviderErrorInfo(
            category="rate_limit",
            provider=provider,
            retryable=False,
            provider_error_code=decision.reason,
        ),
    )


def _ceil_wait_ms(seconds: float) -> int:
    if seconds <= 0:
        return 0
    return int(math.ceil(seconds * 1000))


def _host_category(base_url: str | None) -> str:
    if base_url is None:
        return "default"
    parsed = urlparse(base_url)
    host = parsed.hostname
    if host is None:
        return "custom"
    return _safe_key_part(host.lower())


def _safe_key_part(value: str) -> str:
    safe = []
    for char in value[:120]:
        if char.isalnum() or char in {".", "-", "_"}:
            safe.append(char)
        else:
            safe.append("_")
    return "".join(safe) or "unknown"


def _safe_message_token(value: str) -> str:
    safe = _safe_key_part(value)
    return safe[:80] or "provider"
