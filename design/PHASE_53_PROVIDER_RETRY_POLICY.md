# Phase 53: Provider retry policy

Phase53 adds an explicit retry policy for real provider HTTP requests. The goal is to make transient provider/network failures recoverable without changing the JSON-RPC wire contract, tool execution boundary, or deterministic fake-provider default.

## Goals

- Add bounded retries for transient real-provider HTTP failures.
- Keep retries disabled or tightly bounded by explicit provider config.
- Surface sanitized retry metadata in provider diagnostics.
- Keep fake provider, offline contract tests, and CLI smoke deterministic.
- Avoid retrying after visible streaming output has already been emitted.

## Config surface

Add provider retry fields to `ProviderConfig`:

```py
@dataclass(slots=True)
class ProviderRetryPolicy:
    max_retries: int = 0
    base_delay_ms: int = 250
    max_delay_ms: int = 2000

@dataclass(slots=True)
class ProviderConfig:
    ...
    retry: ProviderRetryPolicy = field(default_factory=ProviderRetryPolicy)
```

Environment variables:

```text
GOD_CODE_PROVIDER_MAX_RETRIES
GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS
GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS
```

Rules:

- `GOD_CODE_PROVIDER_MAX_RETRIES` defaults to `0`, preserving current behavior.
- Retry counts are additional attempts after the first request.
- Delay values must be non-negative integers.
- `max_delay_ms` must be greater than or equal to `base_delay_ms`.
- No jitter in Phase53, to keep tests and CLI smoke deterministic.

## Retry classification

Introduce retry-aware provider errors:

```py
class ProviderClientError(RuntimeError):
    retryable: bool
    status_code: int | None
```

Retryable by default:

- HTTP `429`
- HTTP `500`, `502`, `503`, `504`
- socket timeout / `TimeoutError`
- transport-level temporary network failures surfaced by `urllib.error.URLError`

Not retryable:

- HTTP `400`, `401`, `403`, `404`
- provider config errors
- invalid JSON
- provider response schema / normalizer errors
- tool validation errors
- cancellation

## Runtime design

Add a small retry wrapper around provider client calls:

```text
RealProviderModelAdapter
  -> retry policy
  -> HttpProviderClient.complete / stream
  -> provider-specific client
  -> HttpTransport
```

Non-streaming:

- Retry `client.complete(...)` while the error is retryable and attempts remain.
- Preserve the final provider error message if attempts are exhausted.
- Add attempt count to the raised error metadata/message without exposing headers or API keys.

Streaming:

- Retry only if stream setup fails before the first provider event is yielded.
- Once any `assistant_delta` or final model action has been emitted, do not retry.
- Mid-stream parse/response errors remain terminal because replay could duplicate deltas or tool calls.

Delay:

- Use exponential backoff: `min(max_delay_ms, base_delay_ms * 2 ** retry_index)`.
- Use injectable sleeper for unit tests so tests do not wait in real time.

## Diagnostics

`provider inspect-config --json` should include sanitized retry metadata:

```json
{
  "retry": {
    "max_retries": 2,
    "base_delay_ms": 250,
    "max_delay_ms": 2000
  }
}
```

Text diagnostics should include compact retry fields. Diagnostics must not print API key values, Authorization headers, request bodies, or raw provider responses.

`doctor provider-health --json` should keep the existing check shape. If a retry happens, the health result may include sanitized attempt metadata under provider-health details, but it must not introduce new JSON-RPC methods.

## Implementation

- `py-engine/src/god_code_engine/providers/config.py` defines `ProviderRetryPolicy`, parses retry env vars, and validates integer ranges.
- `py-engine/src/god_code_engine/providers/http_client.py` carries retry metadata on `ProviderClientError`.
- `py-engine/src/god_code_engine/providers/transport.py` marks retryable HTTP/network failures.
- `py-engine/src/god_code_engine/providers/real_adapter.py` owns retry orchestration:
  - Non-streaming retry loop.
  - Streaming retry only before first event.
  - Injectable sleeper for tests.
- `ts-host/src/cli/provider.ts` parses the same env shape for offline inspection and renders sanitized retry metadata.
- Tests cover:
  - Python config valid/invalid retry env.
  - Python adapter retryable and non-retryable errors.
  - Streaming no retry after first yielded event.
  - TS diagnostics sanitized retry metadata.
  - Integration and smoke `provider inspect-config --json`.

## Boundaries

- No provider fallback chain in Phase53.
- No adaptive rate-limit scheduler.
- No billing or token-budget accounting.
- No retry for tool execution.
- No retry after a streaming response has emitted visible output.
- No JSON-RPC method changes.
- No change to fake provider default behavior.

## Validation target

- `./tools/run-python-tests.sh py-engine/tests/test_provider_config.py py-engine/tests/test_real_provider_adapter.py`
- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/check.sh`
