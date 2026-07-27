# Phase 54: Provider fallback chain

Phase54 adds a bounded fallback chain for real provider adapters. Phase53 retries transient failures for a single provider; Phase54 lets the provider layer try a secondary provider only after the current provider has exhausted retryable failures, without changing JSON-RPC, tool execution, or fake-provider defaults.

## Goals

- Add explicit provider fallback config for real provider mode.
- Keep the primary provider env shape backward-compatible.
- Fallback only on retryable provider/network failures after the current provider's retry policy is exhausted.
- Keep diagnostics sanitized and deterministic.
- Keep fallback orchestration in the Python provider layer, outside `TurnEngine`.

## Config surface

Keep existing primary provider env vars:

```text
GOD_CODE_PROVIDER
GOD_CODE_MODEL
GOD_CODE_API_KEY_ENV
GOD_CODE_BASE_URL
GOD_CODE_PROVIDER_TIMEOUT_S
GOD_CODE_PROVIDER_MAX_RETRIES
GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS
GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS
```

The implementation adds an optional JSON fallback chain:

```text
GOD_CODE_PROVIDER_FALLBACKS
```

Example:

```json
[
  {
    "provider": "openai-compatible",
    "model": "fallback-model",
    "api_key_env": "FALLBACK_API_KEY",
    "base_url": "https://provider.example.test/v1",
    "timeout_s": 20,
    "max_retries": 1,
    "retry_base_delay_ms": 250,
    "retry_max_delay_ms": 1000
  }
]
```

Rules:

- `GOD_CODE_PROVIDER_FALLBACKS` is ignored when the primary provider is unset or `fake`.
- The value must be a JSON array.
- Each entry uses the same logical fields as the primary provider config.
- Secret values remain outside JSON; entries reference API key env var names.
- Fallback entries inherit no primary provider values except omitted retry values, which use Phase53 defaults.
- Duplicate provider/model/base_url entries are rejected to avoid accidental loops.

## Runtime behavior

The implementation adds a provider-level wrapper:

```text
FallbackProviderModelAdapter
  -> RealProviderModelAdapter(primary)
  -> RealProviderModelAdapter(fallback 1)
  -> RealProviderModelAdapter(fallback 2)
```

Behavior:

- The registry still exposes the primary provider name as the selected adapter.
- `TurnEngine` continues to call one `ModelAdapter`.
- For non-streaming turns, fallback is attempted only if the current adapter raises `ProviderClientError(retryable=True)` after its own retries are exhausted.
- For streaming turns, fallback is attempted only if no provider event has been emitted by the current adapter.
- Once any `assistant_delta`, final assistant message, or tool call has been emitted, fallback is disabled for that turn.
- `ProviderResponseError`, tool validation errors, config errors, cancellation, and non-retryable provider errors are terminal.
- `pop_provider_context()` returns context from the provider that actually produced the final action.

## Diagnostics

`provider inspect-config --json` includes sanitized fallback metadata:

```json
{
  "fallbacks": [
    {
      "provider": "openai-compatible",
      "model": "fallback-model",
      "api_key_env": "FALLBACK_API_KEY",
      "api_key_present": true,
      "configured_base_url": "https://provider.example.test/v1",
      "effective_base_url": "https://provider.example.test/v1",
      "timeout_s": 20,
      "retry": {
        "max_retries": 1,
        "base_delay_ms": 250,
        "max_delay_ms": 1000
      },
      "known_family": true
    }
  ]
}
```

Text diagnostics show only compact fallback metadata: provider, model, base URL, API-key env name, API-key presence, timeout, and retry fields. It does not print API key values or Authorization headers.

## Implementation

1. Python config parsing:
   - `ProviderChainConfig` groups the primary provider config and fallback configs.
   - `load_provider_chain_config_from_env(...)` parses primary + fallback entries.
   - Fallback JSON shape, API-key env references, timeout, retry values, and duplicate provider/model/base_url entries are validated.
2. Python adapter wrapper:
   - `FallbackProviderModelAdapter` wraps ordered `RealProviderModelAdapter` instances.
   - The wrapper tracks the selected provider for `pop_provider_context()`.
   - Phase53 retry semantics remain inside each wrapped adapter.
3. Provider registry:
   - `create_default_provider_registry(...)` registers a fallback wrapper under the primary provider name when fallbacks exist.
   - `fake` behavior remains unchanged.
4. TS diagnostics:
   - `provider inspect-config` parses `GOD_CODE_PROVIDER_FALLBACKS` offline.
   - Text and JSON diagnostics render sanitized fallback metadata and validation errors.
5. Examples and docs:
   - `examples/config/provider.env.example` includes a commented fallback chain example.
   - README, project plan, internal design, architecture, extension points, and protocol docs document the landed behavior.
6. Tests:
   - Python config tests cover valid and invalid fallback JSON.
   - Python adapter tests cover fallback success, non-fallback cases, streaming boundaries, and context propagation.
   - TS provider diagnostics tests cover fallback metadata and redaction.
   - Integration and CLI smoke cover `provider inspect-config --json` fallback metadata.

## Boundaries

- No automatic provider discovery.
- No model capability negotiation.
- No fallback after visible streaming output.
- No fallback for non-retryable provider errors.
- No billing or token-budget accounting.
- No rate-limit scheduler.
- No JSON-RPC method changes.
- No fake-provider fallback behavior.

## Validation target

- `./tools/run-python-tests.sh py-engine/tests/test_provider_config.py py-engine/tests/test_real_provider_adapter.py py-engine/tests/test_provider_registry.py`
- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/check.sh`
