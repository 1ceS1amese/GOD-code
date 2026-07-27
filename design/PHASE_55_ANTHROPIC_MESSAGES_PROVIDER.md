# Phase 55: Anthropic Messages provider

Phase55 adds a first-class Anthropic Messages provider client on the existing Python provider boundary. Phase54 added fallback orchestration across real providers; Phase55 makes `anthropic` usable as another configured provider family without changing JSON-RPC, tool execution, fake-provider defaults, retry policy, or fallback semantics.

Before extending this provider further, re-check Anthropic's official API reference for any changed request fields, headers, streaming event names, or tool-use block semantics.

## Goals

- Add an Anthropic Messages API provider family.
- Keep provider-specific HTTP, request formatting, response mapping, and streaming aggregation inside `py-engine/src/god_code_engine/providers/`.
- Reuse existing `ProviderConfig`, `ProviderRetryPolicy`, `FallbackProviderModelAdapter`, `RealProviderModelAdapter`, `ProviderResponseNormalizer`, and `ToolCatalogEntry`.
- Support non-streaming and streaming assistant text.
- Support one client-side tool call per model action, matching the current engine/tool scheduler boundary.
- Keep diagnostics sanitized and deterministic.
- Keep fake provider, OpenAI-compatible providers, Responses provider, contract tests, integration tests, and smoke tests deterministic.

## Non-goals

- No JSON-RPC method changes.
- No Anthropic SDK dependency in Phase55; use the existing `HttpTransport` abstraction.
- No multiple parallel tool calls.
- No server-side Anthropic tools, computer-use tools, web-search tools, or extended thinking UI.
- No prompt caching, token counting, billing, or provider budget accounting.
- No model capability negotiation or automatic provider discovery.
- No changes to MCP / plugin tool execution boundaries.

## Config surface

The implementation adds provider family names:

```text
anthropic
anthropic-compatible
```

Reuse existing provider env vars:

```text
GOD_CODE_PROVIDER
GOD_CODE_MODEL
GOD_CODE_API_KEY_ENV
GOD_CODE_BASE_URL
GOD_CODE_PROVIDER_TIMEOUT_S
GOD_CODE_PROVIDER_MAX_RETRIES
GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS
GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS
GOD_CODE_PROVIDER_FALLBACKS
```

Provider-specific optional env:

```text
GOD_CODE_ANTHROPIC_VERSION
```

Rules:

- `GOD_CODE_PROVIDER=anthropic` uses the Anthropic Messages endpoint.
- `GOD_CODE_PROVIDER=anthropic-compatible` uses the same request/response shape with `GOD_CODE_BASE_URL`.
- `GOD_CODE_BASE_URL` remains optional for `anthropic`; if absent, the registry supplies the Anthropic API base URL.
- `GOD_CODE_ANTHROPIC_VERSION` defaults to a pinned implementation constant to keep tests deterministic.
- API key values remain outside provider config; `GOD_CODE_API_KEY_ENV` names the environment variable that contains the secret.
- Existing retry policy and fallback chain apply unchanged. Fallback entries may use `provider: "anthropic"` or `provider: "anthropic-compatible"`.

## Runtime design

The implementation adds a provider client:

```text
TurnEngine
  -> PromptBuilder
  -> ModelRequest
  -> RealProviderModelAdapter
  -> AnthropicMessagesProviderClient
  -> /v1/messages
  -> internal provider payload
  -> ProviderResponseNormalizer
  -> ModelAction
```

Implementation files:

- `py-engine/src/god_code_engine/providers/anthropic_messages.py`
- `py-engine/src/god_code_engine/providers/registry.py`
- `py-engine/src/god_code_engine/providers/contracts.py`
- `py-engine/tests/test_anthropic_messages_provider.py`
- `py-engine/tests/test_provider_registry.py`
- `py-engine/tests/test_provider_contracts.py`
- `ts-host/src/cli/provider.ts`
- `ts-host/test/cliProviderContract.test.ts`
- `examples/config/provider.env.example`
- integration and CLI smoke scripts where provider diagnostics are asserted

The new client should implement:

```py
class AnthropicMessagesProviderClient(HttpProviderClient):
    supports_stream = True

    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping: ...
    def stream(self, request: ModelRequest, config: ProviderConfig) -> Iterator[JsonMapping]: ...
```

The client maps provider-native responses into the existing internal provider payloads:

```json
{"kind": "assistant", "content": "..."}
```

```json
{
  "kind": "tool_call",
  "tool_call_id": "toolu_...",
  "tool_name": "Read",
  "input": {"path": "README.md"}
}
```

## Request formatting

The formatter should convert the current GOD-code message history to Anthropic Messages-style content blocks:

- `user` message -> user role text content.
- `assistant` message -> assistant role text content.
- `tool_call` transcript message -> assistant role `tool_use` block.
- `tool_result` transcript message -> user role `tool_result` block associated with the tool call id.

Tool catalog formatting:

- GOD-code tool `name` maps to Anthropic tool `name`.
- `description` maps directly.
- `input_schema` maps to provider input schema.
- Missing schema uses the same deterministic fallback schema strategy as the OpenAI-compatible formatter.

Request options:

- `ModelOptions.max_tokens` maps to provider max output token setting.
- `ModelOptions.temperature` maps to provider temperature when set.
- Tools are omitted when the catalog is empty.
- Streaming requests set the provider's streaming flag.

## Response mapping

Non-streaming response mapping:

- Concatenate text content blocks into one assistant message.
- If exactly one `tool_use` block is present, map it to one `tool_call` payload.
- If multiple tool-use blocks are present, raise `ProviderResponseError` until the engine supports parallel tool calls.
- If there is neither assistant text nor a supported tool-use block, raise `ProviderResponseError`.
- Reject malformed tool input unless it is a JSON object.

Streaming response mapping:

- Aggregate provider SSE events inside `anthropic_messages.py`.
- Yield `{"kind": "delta", "text": "..."}` for text deltas.
- Yield one final assistant or tool-call payload when the provider stream completes.
- Reject multiple tool-use blocks.
- Raise `ProviderResponseError` if the stream ends without a final usable response.

Retry and fallback interaction:

- `AnthropicMessagesProviderClient` only raises `ProviderClientError` / `ProviderResponseError`.
- Phase53 retry remains in `RealProviderModelAdapter`.
- Phase54 fallback remains in `FallbackProviderModelAdapter`.
- Streaming retry/fallback only happens before the first provider event reaches `RealProviderModelAdapter`.

## Diagnostics

`provider inspect-config` treats `anthropic` and `anthropic-compatible` as known families.

Sanitized metadata should include existing fields only:

```json
{
  "provider": "anthropic",
  "model": "claude-example",
  "api_key_env": "ANTHROPIC_API_KEY",
  "api_key_present": true,
  "configured_base_url": null,
  "effective_base_url": "https://api.anthropic.com",
  "timeout_s": 30,
  "known_family": true,
  "retry": {
    "max_retries": 0,
    "base_delay_ms": 250,
    "max_delay_ms": 2000
  }
}
```

If `GOD_CODE_ANTHROPIC_VERSION` is exposed in diagnostics, show only the version string and never request headers or API key values. Text and JSON reports must not print `x-api-key`, Authorization headers, raw request bodies, raw provider responses, or secret values.

## Contract tests

Extend offline provider contracts with Anthropic fixtures:

- Request body maps messages, tool catalog, max tokens, and temperature.
- Request headers include API-key env resolution and Anthropic version metadata without leaking secrets in reports.
- Assistant response maps to `AssistantMessageAction`.
- Single tool-use response maps to `ToolCallAction`.
- Multiple tool-use blocks raise `ProviderResponseError`.
- Malformed tool input raises `ProviderResponseError`.
- Streaming text emits deltas and a final assistant action.
- Streaming tool-use aggregation emits one final tool call.
- Invalid JSON / HTTP errors / timeout classification still uses existing transport behavior.

## Documentation updates

Implementation updates:

- README provider family list and provider status table.
- `PROJECT_PLAN.md` Phase55 status.
- `INTERNAL_DESIGN.md` provider status table and limitations.
- `ARCHITECTURE.md` provider boundary section.
- `EXTENSION_POINTS.md` provider extension guidance.
- `protocol/README.md` with an explicit note that Anthropic provider support does not change JSON-RPC.
- `examples/config/provider.env.example` with Anthropic and Anthropic-compatible examples.

## Boundaries

- Anthropic-specific content block semantics stay in the provider client.
- `TurnEngine` only sees normalized `ModelAction` / `AssistantDelta`.
- TS Host only sees existing JSON-RPC events and provider diagnostics metadata.
- Fake provider remains the default and remains independent of Anthropic config.
- Existing OpenAI-compatible and Responses provider paths remain unchanged.

## Validation target

- `./tools/run-python-tests.sh py-engine/tests/test_anthropic_messages_provider.py py-engine/tests/test_provider_registry.py py-engine/tests/test_provider_contracts.py`
- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/check.sh`

## Official references to verify before implementation

- Anthropic Messages API reference: <https://platform.claude.com/docs/en/api/messages>
- Anthropic tool use overview: <https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview>
- Anthropic streaming messages guide: <https://platform.claude.com/docs/en/build-with-claude/streaming>
