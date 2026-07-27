# Phase 64: Provider rate limit policy

Phase64 implements a local provider rate limit policy on the existing Python provider boundary. Phase53 added retry, Phase54 added fallback, Phase58 added provider-reported usage guard, and Phase59 added provider-specific error mapping. This phase fills the remaining provider request-throttling gap without changing JSON-RPC, transcript storage, tool execution, MCP/plugin payloads, or prompt/context construction.

The first implementation is deterministic, process-local, offline-testable, and disabled by default.

## Goals

- Add an explicit local throttle before real provider HTTP requests.
- Keep provider rate limiting in Python `providers/`, near `RealProviderModelAdapter` / provider wrapper logic.
- Support fail-fast and bounded-wait behavior through env config.
- Apply limits per concrete provider attempt, including fallback providers.
- Keep streaming behavior safe by checking before the first provider event only.
- Surface sanitized rate-limit metadata in provider config inspection / diagnostics.
- Keep fake provider, offline contract tests, integration tests, and smoke deterministic.
- Avoid JSON-RPC method changes.

## Non-goals

- No provider quota / billing API calls.
- No account-level quota discovery.
- No distributed lock, shared Redis counter, or cross-process coordination.
- No persistent spend ledger or durable request history.
- No adaptive scheduler based on provider response headers in the first implementation.
- No pricing table or exact token-budget integration.
- No changes to tool execution, transcript storage, MCP, plugin, prompt builder, or compaction.
- No hidden default throttling for local smoke tests.

## Current problem

The provider layer already handles retryable failures and fallback chains, but it does not have a local pre-flight throttle:

```text
RealProviderModelAdapter
  -> retry / fallback
  -> provider client
  -> HTTP transport
```

This means a misconfigured loop or repeated CLI invocation can send requests as fast as the process can schedule them. Provider-side `429` errors are mapped by Phase59 and can be retried by Phase53, but the client does not proactively pace outbound requests.

Phase64 adds a narrow local policy before each real provider request:

```text
RealProviderModelAdapter
  -> rate limit policy
  -> retry / fallback attempt
  -> provider client
  -> HTTP transport
```

## Implemented config surface

Extend `ProviderConfig` with a process-local rate limit policy:

```py
@dataclass(slots=True)
class ProviderRateLimitPolicy:
    enabled: bool = False
    strategy: str = "fail-fast"
    requests_per_minute: int | None = None
    min_interval_ms: int = 0
    max_wait_ms: int = 0
    scope: str = "process"
```

Environment variables:

```text
GOD_CODE_PROVIDER_RATE_LIMIT_ENABLED
GOD_CODE_PROVIDER_RATE_LIMIT_STRATEGY
GOD_CODE_PROVIDER_RATE_LIMIT_REQUESTS_PER_MINUTE
GOD_CODE_PROVIDER_RATE_LIMIT_MIN_INTERVAL_MS
GOD_CODE_PROVIDER_RATE_LIMIT_MAX_WAIT_MS
GOD_CODE_PROVIDER_RATE_LIMIT_SCOPE
```

Defaults:

- `GOD_CODE_PROVIDER_RATE_LIMIT_ENABLED=false`
- `GOD_CODE_PROVIDER_RATE_LIMIT_STRATEGY=fail-fast`
- `GOD_CODE_PROVIDER_RATE_LIMIT_REQUESTS_PER_MINUTE` unset
- `GOD_CODE_PROVIDER_RATE_LIMIT_MIN_INTERVAL_MS=0`
- `GOD_CODE_PROVIDER_RATE_LIMIT_MAX_WAIT_MS=0`
- `GOD_CODE_PROVIDER_RATE_LIMIT_SCOPE=process`

Validation rules:

- Disabled policy is a no-op.
- `strategy` must be one of `fail-fast`, `wait`.
- `requests_per_minute`, when set, must be a positive integer.
- `min_interval_ms` and `max_wait_ms` must be non-negative integers.
- `wait` strategy requires either a positive `max_wait_ms` or a decision that can proceed immediately.
- `scope` is reserved for future expansion; Phase64 only accepts `process`.
- Invalid config fails locally during provider config parsing / inspection.

## Implemented runtime model

Add a provider-layer module:

```text
py-engine/src/god_code_engine/providers/rate_limit.py
```

Implemented types:

```py
@dataclass(slots=True)
class ProviderRateLimitDecision:
    allowed: bool
    wait_ms: int = 0
    reason: str = "allowed"


class ProviderRateLimiter:
    def acquire(self, key: str) -> ProviderRateLimitDecision:
        ...
```

`key` should be derived from sanitized provider identity:

```text
provider family + model + base URL host category
```

The key must not include API key values, Authorization headers, request bodies, prompts, completions, or raw provider responses.

The initial limiter can maintain in-memory timestamps per key:

- minimum interval between requests;
- rolling request count over a 60-second window;
- deterministic fake clock / sleeper injection for tests.

## Fail-fast behavior

With `strategy=fail-fast`, the limiter should reject immediately when the next request would exceed configured limits:

```text
provider_rate_limit: exceeded local process limit for openai-compatible
```

Rules:

- The provider client must not be called.
- Retry / fallback must see a local provider-layer error with sanitized category metadata.
- The error should not be retryable by Phase53 by default; otherwise retry could amplify local throttling.
- The error message must not include prompt text, request body, headers, API keys, or raw provider payloads.

## Wait behavior

With `strategy=wait`, the limiter may sleep before allowing the request:

```text
decision.wait_ms <= max_wait_ms
```

Rules:

- Use injectable sleeper / clock for unit tests.
- Do not sleep when the computed wait exceeds `max_wait_ms`; raise a sanitized local rate-limit error instead.
- Do not hold any global lock while calling the provider client.
- For streaming requests, perform the wait only before the stream is opened.
- Do not delay tool execution or TS Host operations.

## Interaction with retry and fallback

Rate limiting should apply per concrete provider attempt:

```text
primary provider attempt 1 -> rate limiter
primary provider retry 1   -> rate limiter
fallback provider attempt 1 -> fallback provider's limiter key
```

Rules:

- Retry policy remains responsible for transient provider/network failures.
- Rate limit errors are local policy failures and should be non-retryable by default.
- Fallback should not automatically bypass a primary provider's local limit unless the design explicitly classifies the error as fallback-eligible. Phase64 should keep local rate-limit failures non-fallback by default to avoid surprising cross-provider traffic.
- Provider-specific `429` responses remain handled by Phase59/Phase53; Phase64 handles local pre-flight limits.

## Interaction with streaming

Streaming checks happen before the stream handshake:

```text
stream_actions(...)
  -> rate_limiter.acquire(...)
  -> provider_client.stream(...)
  -> yield provider events
```

Once any provider event or assistant delta has been emitted, Phase64 must not sleep, retry, fallback, or throttle mid-stream.

## Diagnostics

`provider inspect-config --json` should include sanitized local policy metadata:

```json
{
  "rate_limit": {
    "enabled": true,
    "strategy": "fail-fast",
    "requests_per_minute": 30,
    "min_interval_ms": 1000,
    "max_wait_ms": 0,
    "scope": "process"
  }
}
```

Text diagnostics should use compact fields and must not print secrets. `doctor provider-health` should not add any new JSON-RPC method; it may exercise the limiter only because it performs a normal explicit provider health request.

## Implementation summary

1. Extended provider config parsing with `ProviderRateLimitPolicy`.
2. Added `providers/rate_limit.py` with deterministic in-memory limiter, injectable clock, and sanitized decisions.
3. Wired the limiter into `RealProviderModelAdapter` before concrete provider client calls.
4. Preserved retry / fallback behavior by treating local rate-limit failures as provider-layer local policy errors.
5. Added offline contract coverage for fail-fast, wait strategy, retry boundary, fallback boundary, and streaming preflight.
6. Added TS provider config inspection rendering for sanitized rate-limit metadata.
7. Updated docs and examples after the implementation behavior was verified.

## Implemented tests

Python tests:

- parse default disabled config.
- parse valid enabled fail-fast config.
- reject invalid strategy / negative integers / unsupported scope.
- fail-fast rejects before provider client is called.
- wait strategy sleeps through fake sleeper and then calls provider client.
- wait strategy rejects when computed wait exceeds `max_wait_ms`.
- streaming checks before first event and never mid-stream.
- retry attempts each pass through the limiter.
- fallback providers use separate limiter keys.
- sanitized local error does not expose prompt, completion, headers, raw response, or API key values.

Contract / CLI tests:

- `provider_rate_limit_fail_fast`
- `provider_rate_limit_wait_strategy`
- `provider_rate_limit_retry_boundary`
- `provider inspect-config --json` includes sanitized rate-limit metadata.
- text diagnostics do not print secret values.

## Validation target

```bash
./tools/run-python-tests.sh py-engine/tests/test_provider_config.py py-engine/tests/test_provider_contracts.py py-engine/tests/test_real_provider_adapter.py
npm test -- cliProviderContract.test.ts --run
npm run build
./tools/check.sh
```

## Boundaries

- No JSON-RPC method changes.
- No transcript schema changes.
- No TS Host tool execution changes.
- No prompt builder / compaction changes.
- No provider SDK dependency.
- No provider quota API calls.
- No cross-process rate limiter.
- No default behavior change for fake provider or local smoke.
