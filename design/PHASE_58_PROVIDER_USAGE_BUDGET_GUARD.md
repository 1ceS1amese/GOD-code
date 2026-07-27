# Phase 58: Provider usage accounting and budget guard

Phase58 adds a first provider usage accounting and budget guard layer on the existing Python provider boundary. The intent is to make real-provider usage visible and enforceable enough for local development without pretending to provide exact billing, exact tokenizer parity, or production-grade spend management.

The implementation keeps Phase57 behavior unchanged and does not alter JSON-RPC, tool execution, transcript storage, MCP, plugin, or compaction boundaries.

## Goals

- Add a provider-layer usage model that can represent input/output/total token counts when a provider returns them.
- Parse usage metadata from OpenAI-compatible Chat Completions, OpenAI Responses, and Anthropic Messages responses.
- Keep usage parsing inside provider clients / provider normalizers, not in `TurnEngine` or TS Host.
- Add an explicit budget guard that can fail a turn before or after a provider call when configured limits are exceeded.
- Keep fake provider deterministic and unaffected unless explicitly configured for tests.
- Keep diagnostics sanitized and deterministic.
- Avoid JSON-RPC method changes, transcript rewrites, tool execution changes, MCP changes, plugin changes, and compaction changes.

## Non-goals

- No exact tokenizer implementation in Phase58.
- No price table, currency conversion, account billing, invoice reconciliation, or provider dashboard integration.
- No adaptive rate-limit scheduler.
- No automatic provider selection based on cost.
- No model-specific context-window negotiation.
- No persistent cross-process spend ledger.
- No server-side billing API calls.
- No changes to the default `fake` provider path.

## Config surface

The implementation adds optional env vars:

```text
GOD_CODE_PROVIDER_MAX_INPUT_TOKENS
GOD_CODE_PROVIDER_MAX_OUTPUT_TOKENS
GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS
GOD_CODE_PROVIDER_REQUIRE_USAGE
```

Proposed defaults:

- all max-token limits unset
- `GOD_CODE_PROVIDER_REQUIRE_USAGE=false`

Rules:

- If all limits are unset and `GOD_CODE_PROVIDER_REQUIRE_USAGE=false`, behavior remains unchanged.
- Numeric limits must be positive integers.
- `GOD_CODE_PROVIDER_REQUIRE_USAGE=true` makes missing provider usage metadata a budget error for real providers.
- If usage metadata is present:
  - `input_tokens > GOD_CODE_PROVIDER_MAX_INPUT_TOKENS` fails the turn.
  - `output_tokens > GOD_CODE_PROVIDER_MAX_OUTPUT_TOKENS` fails the turn.
  - `total_tokens > GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS` fails the turn.
- If usage metadata is missing and `require_usage=false`, the budget guard does not fail the turn.
- `ModelOptions.max_tokens` remains an output-size request hint, not a spend/budget guard.

## Usage model

Add a provider-layer type:

```py
@dataclass(slots=True)
class ProviderUsage:
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    source: str | None = None
```

Internal provider payloads may carry optional usage:

```json
{
  "kind": "assistant",
  "content": "hello",
  "provider_usage": {
    "input_tokens": 10,
    "output_tokens": 4,
    "total_tokens": 14,
    "source": "openai-compatible.usage"
  }
}
```

Rules:

- Usage metadata is provider-reported, not locally tokenized.
- Usage metadata is omitted from normal assistant content.
- Usage metadata must not include prompt text, response text, request bodies, raw provider responses, API keys, or headers.
- Streaming clients may emit usage only in the final normalized payload, not in every delta.

## Provider-specific usage parsing

### OpenAI-compatible Chat Completions

Parse:

```json
{
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 4,
    "total_tokens": 14
  }
}
```

Map to:

- `input_tokens = prompt_tokens`
- `output_tokens = completion_tokens`
- `total_tokens = total_tokens`
- `source = "openai-compatible.usage"`

Streaming may only have usage if the provider emits a final usage-bearing chunk. If not present, usage remains absent.

### OpenAI Responses

Parse:

```json
{
  "usage": {
    "input_tokens": 10,
    "output_tokens": 4,
    "total_tokens": 14
  }
}
```

Map the same field names directly with `source = "openai-responses.usage"`.

### Anthropic Messages

Parse:

```json
{
  "usage": {
    "input_tokens": 10,
    "output_tokens": 4
  }
}
```

Map to:

- `input_tokens = input_tokens`
- `output_tokens = output_tokens`
- `total_tokens = input_tokens + output_tokens` when both are present
- `source = "anthropic-messages.usage"`

## Budget guard runtime

The budget guard sits near `RealProviderModelAdapter`:

```text
Provider client
  -> normalized provider payload with optional provider_usage
  -> ProviderUsageBudgetGuard
  -> ProviderResponseNormalizer
  -> ModelAction / AssistantDelta
```

Behavior:

1. Parse budget config at provider setup time.
2. After each final provider payload, inspect `provider_usage`.
3. If limits are exceeded, raise a provider-layer error before converting to a visible final action.
4. For streaming:
   - Do not stop after visible deltas only because final usage is missing unless `require_usage=true`.
   - If final usage exceeds limits after deltas were already emitted, fail the turn through the existing error path; do not attempt fallback after visible output.
5. For fallback:
   - Budget errors are non-retryable and do not trigger provider fallback.
   - Retry/fallback still applies to retryable provider transport failures as before.

Budget failures reuse `ProviderResponseError` with a clear `provider_budget` prefix. Error messages do not include provider raw payloads.

## Diagnostics

`provider inspect-config` shows sanitized budget config:

```json
{
  "budget": {
    "max_input_tokens": 100000,
    "max_output_tokens": 8192,
    "max_total_tokens": 120000,
    "require_usage": false
  }
}
```

Text diagnostics show compact budget fields. They must not print prompts, completions, raw provider responses, API key values, or headers.

`provider contract-test` adds offline checks for:

- OpenAI-compatible usage parsing.
- OpenAI Responses usage parsing.
- Anthropic usage parsing.
- Budget pass.
- Budget failure.
- Missing usage with `require_usage=true`.

## CLI / JSON behavior

Phase58 avoids new JSON-RPC methods. The implementation uses usage metadata only for provider-layer budget enforcement and provider contract diagnostics; it does not add usage metadata to `god_code_event` payloads.

## Documentation updates

Implementation updates:

- README provider limitations and env var list.
- `PROJECT_PLAN.md` Phase58 status.
- `INTERNAL_DESIGN.md` phase table and provider limitations.
- `ARCHITECTURE.md` provider boundary section.
- `EXTENSION_POINTS.md` provider extension guidance.
- `protocol/README.md` with an explicit note that Phase58 adds no JSON-RPC methods.
- `examples/config/provider.env.example` with budget guard examples.

## Boundaries

- Usage accounting is provider-reported metadata, not exact local tokenization.
- Budget guard is provider-layer behavior, not transcript mutation.
- Compaction remains Phase56 behavior and is not replaced by Phase58.
- Tool execution remains under `HostToolRegistry.executeRequest(...)`.
- MCP / plugin runtimes are unaffected.
- Fake provider remains default.
- Local OpenAI-compatible provider from Phase57 participates in the same usage parsing when its endpoint returns OpenAI-compatible `usage`.

## Validation target

- `./tools/run-python-tests.sh py-engine/tests/test_provider_config.py py-engine/tests/test_openai_compatible_provider.py py-engine/tests/test_openai_responses_provider.py py-engine/tests/test_anthropic_messages_provider.py py-engine/tests/test_provider_contracts.py py-engine/tests/test_real_provider_adapter.py`
- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/check.sh`
