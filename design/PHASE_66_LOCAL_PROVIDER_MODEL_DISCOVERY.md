# Phase 66: Local provider model discovery

Phase66 implements an explicit model-discovery diagnostic surface for `local-openai-compatible` endpoints. Phase57 added the local OpenAI-compatible provider family, Phase65 added local daemon lifecycle commands, and this phase defines how GOD-code can list models exposed by an already running local OpenAI-compatible server without changing provider selection, installing models, or adding JSON-RPC methods.

The first implementation is explicit, local-only, bounded, and diagnostic-first.

## Goals

- Add an explicit CLI diagnostic for local provider model discovery.
- Keep discovery in the TS Host CLI diagnostics layer.
- Query only OpenAI-compatible `GET /models` style endpoints.
- Reuse local provider config shape from Phase57.
- Reuse local daemon readiness context from Phase65 without auto-starting daemons.
- Support local endpoints that do not require an API key.
- Support optional bearer-token auth when `GOD_CODE_API_KEY_ENV` is configured.
- Keep default `god-code run`, `god-code repl`, `doctor`, and fake provider behavior unchanged.
- Keep diagnostics sanitized, bounded, and deterministic.
- Avoid JSON-RPC method changes.

## Non-goals

- No model installation, pull, download, warmup, or deletion.
- No automatic model selection or mutation of `GOD_CODE_MODEL`.
- No Ollama-native, llama.cpp-native, vLLM-native, or LM Studio-specific API shape.
- No daemon auto-start from model discovery.
- No remote provider discovery for OpenAI, Anthropic, Responses, or arbitrary HTTP endpoints.
- No provider quota API, billing, token pricing, or context-window discovery.
- No Python Engine, `TurnEngine`, `ModelRequest`, transcript, MCP, or plugin changes.
- No JSON-RPC method changes.

## Current state

Current local-provider request path:

```text
GOD_CODE_PROVIDER=local-openai-compatible
  -> ProviderConfig
  -> RealProviderModelAdapter
  -> OpenAICompatibleProviderClient
  -> POST <base_url>/chat/completions
```

Current local daemon diagnostics:

```text
god-code provider local-daemon status
god-code provider local-daemon start --dry-run
god-code provider local-daemon start --yes
god-code provider local-daemon stop --dry-run
god-code provider local-daemon stop --yes
```

Previous limitation:

- Users can configure a local OpenAI-compatible endpoint, but the CLI cannot list model IDs exposed by that endpoint.
- `provider inspect-config` can validate local config shape offline, but it does not contact `/models`.
- `doctor provider-health` can test a model call, but it requires `GOD_CODE_MODEL` to already be correct.

## Implemented CLI surface

Add a local model-discovery subcommand under the provider diagnostics namespace:

```bash
god-code provider local-models list
god-code provider local-models list --json
god-code provider local-models list --require-configured-model
god-code provider local-models list --require-configured-model --json
```

Rules:

- The command is only valid for `GOD_CODE_PROVIDER=local-openai-compatible`.
- The command never starts or stops a local provider daemon.
- The command never changes environment files or project config.
- The command derives the models endpoint from `GOD_CODE_BASE_URL` unless explicitly overridden.
- The command may run without an API key when the local provider has no `GOD_CODE_API_KEY_ENV`.
- `--require-configured-model` validates whether `GOD_CODE_MODEL` appears in the discovered model IDs, but it still does not mutate config.

Example text output:

```text
GOD-code local provider models:
OK local_provider_models: discovered 2 local provider models
  provider: local-openai-compatible
  base_url: http://127.0.0.1:11434/v1
  models_url: http://127.0.0.1:11434/v1/models
  configured_model: llama3.1
  configured_model_present: true
  model_count: 2
  truncated: false
  timeout_s: 30
  max_results: 200
  api_key_present: false
  models:
  - llama3.1 owned_by=local
  - qwen2.5-coder owned_by=local
```

Example JSON output:

```json
{
  "ok": true,
  "checks": [
    {
      "name": "local_provider_models",
      "status": "ok",
      "message": "discovered 1 local provider model",
      "details": {
        "provider": "local-openai-compatible",
        "base_url": "http://127.0.0.1:11434/v1",
        "models_url": "http://127.0.0.1:11434/v1/models",
        "configured_model": "llama3.1",
        "configured_model_present": true,
        "model_count": 1,
        "truncated": false,
        "timeout_s": 30,
        "max_results": 200,
        "api_key_present": false,
        "models": [
          {
            "id": "llama3.1",
            "object": "model",
            "owned_by": "local"
          }
        ]
      }
    }
  ]
}
```

## Implemented config surface

Environment variables:

```text
GOD_CODE_LOCAL_PROVIDER_MODELS_URL
GOD_CODE_LOCAL_PROVIDER_MODELS_TIMEOUT_S
GOD_CODE_LOCAL_PROVIDER_MODELS_MAX_RESULTS
```

Defaults:

- `GOD_CODE_LOCAL_PROVIDER_MODELS_URL` unset; derive from effective `GOD_CODE_BASE_URL`.
- `GOD_CODE_LOCAL_PROVIDER_MODELS_TIMEOUT_S` unset; reuse `GOD_CODE_PROVIDER_TIMEOUT_S`.
- `GOD_CODE_LOCAL_PROVIDER_MODELS_MAX_RESULTS=200`.

Endpoint derivation:

- If `GOD_CODE_LOCAL_PROVIDER_MODELS_URL` is set, use it after local-only URL validation.
- Otherwise, normalize effective `GOD_CODE_BASE_URL` and append `/models`.
- `http://127.0.0.1:11434/v1` becomes `http://127.0.0.1:11434/v1/models`.
- `http://127.0.0.1:11434/v1/` becomes `http://127.0.0.1:11434/v1/models`.

Validation rules:

- Discovery config is ignored unless `GOD_CODE_PROVIDER=local-openai-compatible`.
- Models URL must be HTTP(S) and local / loopback by default.
- Timeout must be positive and bounded.
- Max results must be positive and bounded.
- API key values and bearer tokens must never be printed.

## Runtime boundary

Discovery stays in TS Host:

```text
ts-host CLI provider local-models list
  -> parse provider env
  -> validate local provider family
  -> derive or read models URL
  -> perform bounded GET request
  -> parse and sanitize model metadata
  -> render text or JSON diagnostics
```

Python Engine remains unchanged:

```text
Python Engine
  -> PromptBuilder
  -> RealProviderModelAdapter
  -> OpenAI-compatible HTTP client
  -> POST /chat/completions
```

No discovery state enters:

- `initialize`
- `create_session`
- `submit_turn`
- `ModelRequest`
- transcript JSONL
- tool execution payloads
- MCP/plugin payloads

## HTTP behavior

Request:

```text
GET <models_url>
Accept: application/json
Authorization: Bearer <value>  # only when GOD_CODE_API_KEY_ENV is configured
```

Rules:

- Use a short bounded timeout.
- Do not send prompts, tool schemas, transcript history, or project metadata.
- Do not retry by default in Phase66; model discovery is an explicit diagnostic and should fail fast.
- Do not follow redirects to non-local hosts.

Accepted response shape:

```json
{
  "object": "list",
  "data": [
    {
      "id": "llama3.1",
      "object": "model",
      "created": 1710000000,
      "owned_by": "local"
    }
  ]
}
```

Parsing rules:

- `data` must be an array for the command to report discovered models.
- Each model must have a non-empty string `id`.
- Optional fields such as `object`, `created`, and `owned_by` may be included after sanitization.
- Unknown fields are ignored by text output.
- JSON output may include a bounded `raw_field_count` style diagnostic, but not raw unbounded metadata.
- Duplicate model IDs are de-duplicated with stable ordering.
- Results beyond `GOD_CODE_LOCAL_PROVIDER_MODELS_MAX_RESULTS` are omitted and `truncated=true`.

## Interaction with Phase65 local daemon lifecycle

Phase66 discovery can be useful after:

```bash
god-code provider local-daemon start --yes
god-code provider local-models list
```

However, discovery does not own daemon lifecycle:

- It does not call `local-daemon start`.
- It does not stop daemons.
- It does not read or write daemon marker files except possibly to display sanitized context in a future phase.
- It treats connection refusal as a clear local diagnostic error and points users to `provider local-daemon status`.

## Error handling and sanitization

Errors should be structured and safe:

- Non-local provider: `local model discovery requires GOD_CODE_PROVIDER=local-openai-compatible`.
- Invalid models URL: report sanitized URL shape and validation reason.
- Connection refused / timeout: report endpoint and timeout, not request internals.
- HTTP 401 / 403: report auth failure and whether `GOD_CODE_API_KEY_ENV` was configured, not token values.
- HTTP 404: report that the server did not expose an OpenAI-compatible `/models` endpoint.
- Invalid JSON: report parse failure with bounded byte count, not raw body.
- Invalid model list shape: report expected `data[]` with `id`.

Text output should not print:

- API key values.
- Authorization headers.
- Raw response bodies.
- Full server stack traces.
- Local daemon command arguments from Phase65.

## Implementation touch points

Expected implementation files:

- `ts-host/src/cli/provider.ts`
- `ts-host/src/cli/main.ts`
- `ts-host/test/cliProviderContract.test.ts`
- `tools/run-cli-smoke.sh`
- `examples/config/provider.env.example`
- `README.md`
- `PROJECT_PLAN.md`
- `INTERNAL_DESIGN.md`
- `ARCHITECTURE.md`
- `EXTENSION_POINTS.md`
- `protocol/README.md`

Python files should not need changes for the first implementation.

## Test plan

Unit / contract tests:

- Reject non-local provider families.
- Derive `/models` from default local base URL.
- Derive `/models` from an overridden local base URL.
- Accept explicit `GOD_CODE_LOCAL_PROVIDER_MODELS_URL`.
- Reject non-local explicit models URL.
- Omit `Authorization` when `GOD_CODE_API_KEY_ENV` is unset.
- Send `Authorization` only when `GOD_CODE_API_KEY_ENV` is configured and present.
- Parse standard OpenAI-compatible `data[]` model list.
- De-duplicate model IDs with stable ordering.
- Truncate results at the configured max.
- Report configured model present / missing with `--require-configured-model`.
- Redact API key and raw response data from errors.

Smoke tests:

- `provider local-models list --json` against a deterministic local fixture server.
- `provider local-models list --require-configured-model --json` positive case.
- Non-local provider error path.

## Documentation updates

Implementation updated:

- README provider status and Phase table.
- `PROJECT_PLAN.md` provider route.
- `INTERNAL_DESIGN.md` phase table and provider limitations.
- `ARCHITECTURE.md` provider diagnostics boundary.
- `EXTENSION_POINTS.md` provider extension guidance.
- `protocol/README.md` with an explicit note that Phase66 adds no JSON-RPC methods.
- `examples/config/provider.env.example` with optional model discovery env vars.

## Boundaries

- Model discovery is a TS Host diagnostic, not a model runtime feature.
- Model discovery does not affect `ModelRequest.model`.
- Provider selection remains env-driven and explicit.
- Fake provider remains the default.
- `doctor` remains offline by default.
- `doctor provider-health` remains the explicit model-call health check.
- Local daemon lifecycle remains separate from model discovery.
- JSON-RPC wire contract remains unchanged.

## Validation target

- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/run-cli-smoke.sh`
- `./tools/check.sh`
