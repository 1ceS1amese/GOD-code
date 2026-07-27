# Phase 59: Provider-specific error mapping

Phase59 adds a provider-specific error mapping layer on the existing Python provider boundary. Phase53 added retry metadata, Phase54 added fallback, and Phase58 added provider usage budget guard. Phase59 makes HTTP and provider API failures preserve sanitized provider error codes and a stable local classification instead of collapsing into broad status-only errors.

The implementation keeps Phase58 behavior unchanged and does not alter JSON-RPC, tool execution, transcript storage, MCP, plugin, or compaction boundaries.

## Goals

- Add a provider-layer error metadata model for sanitized, provider-specific failures.
- Map OpenAI-compatible / Responses / Anthropic HTTP error bodies into stable local categories.
- Preserve existing retry / fallback behavior by deriving retryability from the mapped category and HTTP status.
- Keep provider raw error payloads, headers, request bodies, prompts, completions, and API keys out of user-visible errors and diagnostics.
- Make offline provider contract tests cover error body parsing, redaction, retryability, and fallback interaction.
- Keep fake provider deterministic and unaffected.
- Avoid JSON-RPC method changes, transcript rewrites, tool execution changes, MCP changes, plugin changes, and compaction changes.

## Non-goals

- No provider SDK dependency in Phase59.
- No live calls to provider billing, quota, organization, model, or dashboard APIs.
- No account-level rate-limit scheduler.
- No automatic credential refresh, OAuth, or device-code flow.
- No provider-specific UI beyond existing provider diagnostics.
- No raw provider error dump in CLI, transcript, contract-test output, or JSON-RPC payloads.
- No changes to the default `fake` provider path.

## Current problem

Current transport errors are useful enough for retry / fallback, but too coarse for real provider debugging:

```text
Provider HTTP error: 429
Provider HTTP error: 400
Provider returned invalid JSON.
```

The existing `ProviderClientError` already carries:

```py
retryable: bool
status_code: int | None
attempts: int
```

Phase59 extends this without pushing provider details into `TurnEngine` or TS Host. Provider clients and the HTTP transport keep enough sanitized metadata to distinguish:

- authentication failures
- permission / organization failures
- rate limits
- context length / token limit failures
- model-not-found failures
- invalid request / schema failures
- content policy / safety refusals expressed as API errors
- transient server / network failures
- unknown provider-specific failures

## Planned error model

Add a provider-layer metadata type near `providers/http_client.py` or a new `providers/errors.py`:

```py
ProviderErrorCategory = Literal[
    "auth",
    "permission",
    "rate_limit",
    "quota",
    "context_length",
    "model_not_found",
    "invalid_request",
    "content_policy",
    "server_error",
    "network",
    "invalid_response",
    "unknown",
]

@dataclass(slots=True)
class ProviderErrorInfo:
    category: ProviderErrorCategory
    provider: str | None = None
    status_code: int | None = None
    provider_error_type: str | None = None
    provider_error_code: str | None = None
    retryable: bool = False
```

Extend `ProviderClientError` with an optional `error_info` field while keeping the existing constructor compatible:

```py
class ProviderClientError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        retryable: bool = False,
        status_code: int | None = None,
        attempts: int = 1,
        error_info: ProviderErrorInfo | None = None,
    ) -> None: ...
```

Rules:

- `message` remains short and sanitized.
- `retryable` remains the field consumed by Phase53 / Phase54.
- `status_code` remains available for existing tests and diagnostics.
- `error_info` adds structured metadata but must not include raw request or response bodies.
- `_with_attempts` must preserve `error_info`.

## Planned transport changes

`UrllibHttpTransport` now reads a bounded response body on `urllib.error.HTTPError`:

```text
HTTPError
  -> read up to a small byte cap
  -> decode as UTF-8 with replacement
  -> try JSON parse
  -> pass status + decoded body to provider error mapper
  -> raise ProviderClientError with sanitized metadata
```

Planned constraints:

- Cap error body reads to avoid large memory use.
- Treat undecodable / non-JSON bodies as unknown provider errors.
- Do not include raw body text in exception messages.
- Preserve current retryable HTTP status defaults for unmapped failures:
  - `429`, `500`, `502`, `503`, `504` are retryable.
  - most `4xx` failures are non-retryable.

Streaming `post_sse` uses the same mapper for HTTP handshake failures. SSE event-level provider errors remain provider-client specific:

- OpenAI-compatible stream error chunks map in `openai_compatible.py`.
- Responses `error` events map in `openai_responses.py`.
- Anthropic `error` events map in `anthropic_messages.py`.

## Provider-specific mapping rules

### OpenAI-compatible / OpenAI Responses

Typical error shape:

```json
{
  "error": {
    "message": "...",
    "type": "invalid_request_error",
    "param": "messages",
    "code": "context_length_exceeded"
  }
}
```

Planned mapping:

| Signal | Category | Retryable |
| --- | --- | --- |
| HTTP 401, `invalid_api_key` | `auth` | no |
| HTTP 403, organization / project denial | `permission` | no |
| HTTP 404, `model_not_found` | `model_not_found` | no |
| HTTP 400, `context_length_exceeded` | `context_length` | no |
| HTTP 400, `invalid_request_error` | `invalid_request` | no |
| HTTP 429, rate-limit style code/type | `rate_limit` | yes |
| HTTP 429, quota / insufficient quota | `quota` | no by default |
| HTTP 500/502/503/504 | `server_error` | yes |

Provider `message` text is not copied into `ProviderErrorInfo` or diagnostics because it may contain prompt snippets.

### Anthropic Messages

Typical error shape:

```json
{
  "type": "error",
  "error": {
    "type": "rate_limit_error",
    "message": "..."
  }
}
```

Planned mapping:

| Signal | Category | Retryable |
| --- | --- | --- |
| `authentication_error` | `auth` | no |
| `permission_error` | `permission` | no |
| `not_found_error` | `model_not_found` | no |
| `invalid_request_error` with context/window hints | `context_length` | no |
| `invalid_request_error` otherwise | `invalid_request` | no |
| `rate_limit_error` | `rate_limit` | yes |
| `overloaded_error` | `server_error` | yes |
| HTTP 500/502/503/504 | `server_error` | yes |

Provider `message` text stays out of structured metadata and default error strings.

### Local OpenAI-compatible

Local endpoints often return partial OpenAI-like errors or plain text. Phase59:

- Reuse OpenAI-compatible mapping when the body matches the OpenAI error shape.
- Fall back to HTTP-status mapping when the body is missing or malformed.
- Avoid assuming local daemon-specific codes for Ollama, llama.cpp, vLLM, or LM Studio.

## Error message format

User-visible exception strings are stable and concise:

```text
provider_error: rate_limit from openai-compatible (HTTP 429)
provider_error: context_length from openai-responses (HTTP 400, code=context_length_exceeded)
provider_error: auth from anthropic (HTTP 401, type=authentication_error)
```

Rules:

- Include category, provider family, HTTP status, and sanitized provider code/type when available.
- Never include raw provider message, request body, response body, headers, prompt text, completion text, API key values, or bearer tokens.
- Keep budget guard errors from Phase58 as `provider_budget: ...`, not `provider_error: ...`.
- Keep malformed successful responses as `ProviderResponseError` where the provider returned HTTP 2xx but the payload cannot be normalized.

## Retry / fallback interaction

Phase59 does not invent a new retry system. It feeds better metadata into the existing Phase53 / Phase54 behavior:

```text
Provider HTTP/API error
  -> ProviderErrorMapper
  -> ProviderClientError(retryable=...)
  -> Phase53 retry
  -> Phase54 fallback if retryable failures are exhausted
```

Planned rules:

- `rate_limit` is retryable except quota-specific 429 errors.
- `server_error` and `network` are retryable.
- `auth`, `permission`, `quota`, `model_not_found`, `context_length`, `invalid_request`, and `content_policy` are non-retryable.
- Once a streaming provider has emitted visible deltas, later stream errors remain non-fallback in the current `RealProviderModelAdapter` path.
- `_with_attempts` preserves `error_info` so final retry-exhausted errors still carry the mapped category.

## Diagnostics

`provider inspect-config` remains config-only and does not perform HTTP requests.

`provider contract-test` adds offline checks for:

- OpenAI-compatible auth error mapping.
- OpenAI-compatible context length mapping.
- OpenAI-compatible quota vs rate-limit mapping.
- OpenAI Responses API error event mapping.
- Anthropic authentication / rate limit / overloaded mapping.
- HTTP error body redaction.
- Retry/fallback behavior with mapped retryable and non-retryable errors.
- `_with_attempts` metadata preservation.

If diagnostics expose structured error metadata later, they must only show sanitized fields:

```json
{
  "category": "rate_limit",
  "provider": "openai-compatible",
  "status_code": 429,
  "provider_error_type": "rate_limit_error",
  "provider_error_code": "rate_limit_exceeded",
  "retryable": true
}
```

## CLI / JSON behavior

Phase59 avoids new JSON-RPC methods. Error mapping affects provider-layer exceptions and existing diagnostics only. Normal `god_code_event` payloads, transcript JSONL, tool execution requests, MCP payloads, and plugin payloads stay unchanged.

## Documentation updates

Implementation updates:

- README provider limitations and phase table.
- `PROJECT_PLAN.md` Phase59 status and roadmap.
- `INTERNAL_DESIGN.md` phase table and provider limitations.
- `ARCHITECTURE.md` provider boundary section.
- `EXTENSION_POINTS.md` provider extension guidance.
- `protocol/README.md` with an explicit note that Phase59 adds no JSON-RPC methods.

## Boundaries

- Error mapping is provider-layer behavior.
- Retry / fallback continue to consume `ProviderClientError.retryable`.
- Provider-specific raw payloads are not exposed outside the provider layer.
- Successful 2xx payload normalization errors remain `ProviderResponseError`.
- Phase58 budget guard remains separate.
- Tool execution remains under `HostToolRegistry.executeRequest(...)`.
- MCP / plugin runtimes are unaffected.
- Fake provider remains default.

## Validation target for implementation

- `./tools/run-python-tests.sh py-engine/tests/test_provider_contracts.py py-engine/tests/test_real_provider_adapter.py py-engine/tests/test_openai_compatible_provider.py py-engine/tests/test_openai_responses_provider.py py-engine/tests/test_anthropic_messages_provider.py`
- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/check.sh`
