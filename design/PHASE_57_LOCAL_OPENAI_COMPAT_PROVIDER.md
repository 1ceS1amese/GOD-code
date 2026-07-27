# Phase 57: Local OpenAI-compatible provider

Phase57 adds a first local-provider path for users who run an OpenAI-compatible model server on their own machine or sandbox. The goal is not to add a new provider wire format; it reuses the existing OpenAI-compatible Chat Completions formatter, mapper, retry policy, fallback chain, streaming path, diagnostics, and contract-test infrastructure while removing the unnecessary API-key requirement for explicitly local endpoints.

The implementation keeps Phase56 behavior unchanged and does not alter JSON-RPC, tool execution, transcript storage, MCP, plugin, or compaction boundaries.

## Goals

- Add an explicit local provider family for OpenAI-compatible Chat Completions endpoints.
- Support local endpoints that do not require an API key.
- Keep optional bearer-token support for local servers that do require one.
- Reuse existing OpenAI-compatible request formatting, response mapping, tool schema formatting, streaming aggregation, retry, and fallback behavior.
- Keep fake provider as the default and keep `doctor` offline by default.
- Keep diagnostics sanitized and deterministic.
- Avoid JSON-RPC, tool execution, transcript, compaction, MCP, and plugin boundary changes.

## Non-goals

- No Ollama-native, llama.cpp-native, vLLM-native, or LM Studio-specific API shape in Phase57.
- No model discovery, model pull/install, GPU/runtime management, or local daemon lifecycle management.
- No automatic probing from `doctor`; real HTTP remains behind explicit `doctor provider-health` or user-run commands.
- No embeddings, reranking, multimodal input, audio, or image generation support.
- No provider billing or exact token accounting.
- No prompt rewrite, transcript rewrite, or context compaction changes.
- No JSON-RPC method changes.

## Config surface

The implementation adds one provider family:

```text
local-openai-compatible
```

It reuses the existing provider env shape:

```text
GOD_CODE_PROVIDER
GOD_CODE_MODEL
GOD_CODE_BASE_URL
GOD_CODE_API_KEY_ENV
GOD_CODE_PROVIDER_TIMEOUT_S
GOD_CODE_PROVIDER_MAX_RETRIES
GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS
GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS
GOD_CODE_PROVIDER_FALLBACKS
```

Rules:

- `GOD_CODE_PROVIDER=local-openai-compatible` selects the local provider path.
- `GOD_CODE_MODEL` remains required.
- `GOD_CODE_BASE_URL` is optional; default to `http://127.0.0.1:11434/v1` unless explicitly overridden.
- `GOD_CODE_API_KEY_ENV` is optional for this provider family.
- If `GOD_CODE_API_KEY_ENV` is unset, do not send an `Authorization` header.
- If `GOD_CODE_API_KEY_ENV` is set, the named environment variable must exist and be non-empty, and the HTTP client sends `Authorization: Bearer <value>`.
- Retry env vars keep the Phase53 defaults and validation.
- Fallback entries may use `provider: "local-openai-compatible"` and may omit `api_key_env`.

Example:

```bash
GOD_CODE_PROVIDER=local-openai-compatible
GOD_CODE_MODEL=llama3.1
GOD_CODE_BASE_URL=http://127.0.0.1:11434/v1
```

Optional bearer-token example:

```bash
GOD_CODE_PROVIDER=local-openai-compatible
GOD_CODE_MODEL=local-model
GOD_CODE_BASE_URL=http://127.0.0.1:8000/v1
GOD_CODE_API_KEY_ENV=LOCAL_OPENAI_API_KEY
LOCAL_OPENAI_API_KEY=replace-me
```

## Runtime design

Reuse the existing OpenAI-compatible provider boundary:

```text
TurnEngine
  -> PromptBuilder
  -> ModelRequest
  -> RealProviderModelAdapter
  -> LocalOpenAICompatibleProviderClient
  -> /chat/completions
  -> internal provider payload
  -> ProviderResponseNormalizer
  -> ModelAction
```

Implementation minimizes duplication:

- Keep `format_openai_messages(...)`, `format_openai_tools(...)`, response mapping, and SSE aggregation shared.
- Add a small local provider client wrapper only where auth header behavior differs.
- Keep provider-specific base URL defaults in `providers/registry.py` or a provider constants module.
- Keep `RealProviderModelAdapter` and `FallbackProviderModelAdapter` unchanged except where optional API-key config is passed through existing types.

Likely code touch points:

- `py-engine/src/god_code_engine/providers/config.py`
- `py-engine/src/god_code_engine/providers/registry.py`
- `py-engine/src/god_code_engine/providers/openai_compatible.py`
- Optional: `py-engine/src/god_code_engine/providers/local_openai_compatible.py`
- `py-engine/tests/test_provider_config.py`
- `py-engine/tests/test_provider_registry.py`
- `py-engine/tests/test_openai_compatible_provider.py`
- `py-engine/tests/test_provider_contracts.py`
- `ts-host/src/cli/provider.ts`
- `ts-host/test/cliProviderContract.test.ts`
- `examples/config/provider.env.example`
- `integration/cli_integration.py`
- `tools/run-cli-smoke.sh`

## Provider config changes

Current provider config requires `GOD_CODE_API_KEY_ENV` for every non-fake provider. Phase57 makes API-key requirement provider-family aware:

```text
openai / openai-compatible / responses / anthropic
  -> API key env required

local-openai-compatible
  -> API key env optional
```

Suggested config metadata:

```py
@dataclass(slots=True)
class ProviderConfig:
    name: str
    model: str
    api_key_env: str | None = None
    base_url: str | None = None
    timeout_s: float = 30.0
    retry: ProviderRetryPolicy = field(default_factory=ProviderRetryPolicy)
```

This type already allows `api_key_env=None`; Phase57 adjusts parsing and clients so that `None` is valid only for local provider families.

Fallback config validation mirrors primary config:

- `api_key_env` required for remote provider families.
- `api_key_env` optional for `local-openai-compatible`.
- If present, the named env var must exist.
- Duplicate provider/model/base_url detection remains unchanged.

## HTTP behavior

The local provider client calls the same endpoint shape as OpenAI-compatible Chat Completions:

```text
POST <base_url>/chat/completions
```

Headers:

- Always send `Content-Type: application/json`.
- Send `Authorization: Bearer <value>` only when `config.api_key_env` is set and resolved.
- Never print resolved token values in errors or diagnostics.

Request body:

- Same as Phase5 OpenAI-compatible.
- Keep `tool_choice: "auto"` and `parallel_tool_calls: False`.
- Include tools only when the tool catalog is non-empty.
- Keep streaming body semantics unchanged.

Response behavior:

- Same non-streaming and streaming mapper as OpenAI-compatible.
- Multiple provider tool calls remain unsupported until the engine supports parallel tool scheduling.

## Diagnostics

`provider inspect-config` treats `local-openai-compatible` as a known family.

JSON diagnostics include sanitized metadata:

```json
{
  "provider": "local-openai-compatible",
  "model": "llama3.1",
  "api_key_env": null,
  "api_key_present": false,
  "api_key_required": false,
  "configured_base_url": null,
  "effective_base_url": "http://127.0.0.1:11434/v1",
  "timeout_s": 30,
  "known_family": true,
  "retry": {
    "max_retries": 0,
    "base_delay_ms": 250,
    "max_delay_ms": 2000
  }
}
```

Text diagnostics explicitly show that the API key is optional for this provider family. They must not print API-key values, Authorization headers, raw request bodies, raw responses, or local server output.

`doctor` remains offline by default. `doctor provider-health` may call the configured local endpoint because it is already an explicit provider health command.

## Contract tests

Add offline tests that do not require a real local server:

- Config accepts `local-openai-compatible` without `GOD_CODE_API_KEY_ENV`.
- Config rejects missing `GOD_CODE_MODEL`.
- Config accepts optional `GOD_CODE_API_KEY_ENV` only when the named env var exists.
- Registry maps `local-openai-compatible` to the local/openai-compatible client.
- Request body matches OpenAI-compatible Chat Completions.
- Request headers omit `Authorization` when no API key is configured.
- Request headers include `Authorization` only when API key env is configured and present.
- Streaming path reuses OpenAI-compatible SSE aggregation.
- Fallback chain accepts a local fallback without `api_key_env`.
- Fallback diagnostics redact any optional local API key value.
- CLI smoke covers `provider inspect-config --json` for local no-key config.

## Documentation updates

Implementation updates:

- README provider family list, limitations, and example env block.
- `PROJECT_PLAN.md` Phase57 status.
- `INTERNAL_DESIGN.md` phase table and provider limitations.
- `ARCHITECTURE.md` provider boundary section.
- `EXTENSION_POINTS.md` provider extension guidance.
- `protocol/README.md` with an explicit note that Phase57 adds no JSON-RPC methods.
- `examples/config/provider.env.example` with local no-key and optional-key examples.

## Boundaries

- Local provider support remains provider-layer behavior.
- TS Host still only sees the selected adapter name through existing initialize metadata and provider diagnostics.
- Python Engine still only sees normalized `ModelAction` / `AssistantDelta`.
- Tool execution still goes through `HostToolRegistry.executeRequest(...)`.
- Fake provider remains the default and remains independent from local provider config.
- Context compaction remains controlled by Phase56 env vars and does not depend on local provider mode.

## Validation target

- `./tools/run-python-tests.sh py-engine/tests/test_provider_config.py py-engine/tests/test_provider_registry.py py-engine/tests/test_openai_compatible_provider.py py-engine/tests/test_provider_contracts.py`
- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/check.sh`
