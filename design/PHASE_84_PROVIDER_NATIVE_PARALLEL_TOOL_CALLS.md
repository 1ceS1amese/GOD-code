# Phase 84: Provider-native parallel tool calls

Phase84 implements provider-native parallel tool-call normalization on top of the Phase82 internal batch runtime. Phase82 already added Python `ToolCallBatchAction` and `ToolScheduler.execute_many(...)`; Phase84 lets real provider payloads opt into multiple tool calls from one model response without changing JSON-RPC, TS Host tool APIs, transcript schema, or scheduler safety policy.

Phase84 is implemented as an explicit opt-in path. Default provider behavior remains single-call / fail-closed.

## Goals

- Allow real provider adapters to map multiple provider-native tool calls into Python `ToolCallBatchAction`.
- Keep provider-native parallel tool calls disabled by default.
- Add an explicit provider config / env gate before sending provider requests that allow parallel calls.
- Preserve Phase82 scheduler policy: read-only safe tools may run in bounded parallel waves; mutating, shell, MCP, plugin, skill, and unknown tools remain serial-only.
- Keep provider contract tests proving default single-call behavior remains unchanged.
- Add opt-in tests proving provider payloads with multiple calls normalize to `ToolCallBatchAction`.
- Support deterministic model-order result handling in `TurnEngine`.
- Keep all host execution through existing `execute_tool` requests.

## Non-goals

- No JSON-RPC method changes.
- No `execute_tools` TS Host batch API.
- No transcript schema change.
- No provider API abstraction rewrite.
- No dependency graph planner.
- No speculative execution.
- No cross-turn or cross-session parallel scheduling.
- No relaxation of TS Host permission, approval, audit, path, or command policies.
- No automatic enablement based on provider name or model name.
- No treating provider-native parallel calls as safe parallel execution; scheduler policy still decides execution waves.

## Implementation summary

Phase84 changed the intentionally single-call provider boundary as follows:

- `ProviderConfig` now has `tool_use: ProviderToolUsePolicy`.
- `GOD_CODE_PROVIDER_PARALLEL_TOOL_CALLS` controls the opt-in.
- `provider inspect-config --json` exposes sanitized `tool_use.parallel_tool_calls`.
- `SimpleProviderResponseNormalizer` maps `kind: "tool_call_batch"` to `ToolCallBatchAction`.
- OpenAI-compatible request bodies still send `parallel_tool_calls: false` by default and send `true` only when configured.
- OpenAI-compatible non-streaming and streaming mappers return `tool_call_batch` when multiple provider tool calls are present and opt-in is enabled.
- Responses request bodies still send `parallel_tool_calls: false` by default and send `true` only when configured.
- Responses non-streaming and streaming mappers return `tool_call_batch` for multiple `function_call` items when opt-in is enabled.
- Anthropic Messages gates multiple `tool_use` blocks through the same `ProviderToolUsePolicy`.
- Existing provider contract tests continue asserting default `parallel_tool_calls: false`.

Phase82 changed the engine boundary so providers no longer need to stay single-call forever. Phase84 adds provider normalization and an explicit opt-in surface.

## Config surface

Provider-level config:

```py
@dataclass(slots=True)
class ProviderToolUsePolicy:
    parallel_tool_calls: bool = False
```

`ProviderConfig` includes:

```py
tool_use: ProviderToolUsePolicy = field(default_factory=ProviderToolUsePolicy)
```

Environment variable:

```text
GOD_CODE_PROVIDER_PARALLEL_TOOL_CALLS=false
```

Rules:

- Default remains `false`.
- Accepted truthy/falsy values should follow existing provider config conventions.
- Invalid values fail during provider config parsing.
- Provider fallbacks currently inherit the primary tool-use policy.
- `provider inspect-config --json` exposes sanitized metadata:

```json
{
  "tool_use": {
    "parallel_tool_calls": false
  }
}
```

## Provider raw payload shape

Provider-normalizer input supports a new internal payload:

```json
{
  "kind": "tool_call_batch",
  "tool_calls": [
    {
      "tool_call_id": "call_1",
      "tool_name": "Read",
      "input": { "path": "README.md" }
    },
    {
      "tool_call_id": "call_2",
      "tool_name": "Search",
      "input": { "path": ".", "pattern": "TODO" }
    }
  ]
}
```

`SimpleProviderResponseNormalizer` maps this to:

```py
ToolCallBatchAction(tool_calls=[...])
```

Validation rules:

- `tool_calls` must be a non-empty list.
- Each call must have non-empty `tool_call_id`, `tool_name`, and object `input`.
- Duplicate `tool_call_id` values are invalid.
- Catalog validation checks every call.
- Single-call batches may be normalized to `ToolCallAction` or kept as `ToolCallBatchAction`; choose one behavior and test it. Prefer keeping explicit batch actions for provider-native payload traceability.

## OpenAI-compatible behavior

Request body:

```json
{
  "parallel_tool_calls": true
}
```

only when `config.tool_use.parallel_tool_calls` is true.

Non-streaming mapper:

- `tool_calls.length == 1` keeps existing `tool_call` payload.
- `tool_calls.length > 1`:
  - if config is disabled, keep current rejection.
  - if enabled, return `tool_call_batch` in provider order.

Streaming mapper:

- The streaming accumulator tracks `dict[index, ToolCallStreamState]`.
- Accumulate id/name/arguments by index.
- Final output:
  - one completed call -> `tool_call`.
  - multiple completed calls -> `tool_call_batch`.
- Reject missing ids, duplicate ids, malformed arguments, unsupported tool call types, or incomplete indexes.

## OpenAI Responses behavior

Request body:

```json
{
  "parallel_tool_calls": true
}
```

only when `config.tool_use.parallel_tool_calls` is true.

Non-streaming mapper:

- `function_call` output item count:
  - `0`: assistant message path.
  - `1`: existing `tool_call` payload.
  - `>1`: return `tool_call_batch` when enabled; otherwise reject.
- Preserve existing `provider_context` on the batch payload so `RealProviderModelAdapter` can continue capturing it.

Streaming mapper:

- Keep existing provider context accumulation.
- Track multiple completed function-call items.
- Final output:
  - one call -> `tool_call`.
  - multiple calls -> `tool_call_batch`.
- Preserve `provider_context` in the final payload.

## Anthropic Messages behavior

Anthropic Messages does not use the OpenAI `parallel_tool_calls` request field. Phase84 still gates acceptance of multiple `tool_use` blocks through the same `ProviderToolUsePolicy`.

Non-streaming mapper:

- `tool_use` block count:
  - `0`: assistant text path.
  - `1`: existing `tool_call`.
  - `>1`: return `tool_call_batch` when enabled; otherwise reject.

Streaming mapper:

- Generalize the accumulator to track content block indexes.
- Accept multiple `tool_use` blocks only when enabled.
- Preserve text deltas behavior; if final action is a tool batch, text content should not become a separate assistant message in the same model step.
- Reject incomplete tool inputs, duplicate ids, malformed JSON input deltas, or unsupported block transitions.

## RealProviderModelAdapter behavior

`RealProviderModelAdapter._normalize_action(...)` should continue this flow:

```text
raw provider payload
  -> usage budget enforcement
  -> provider_context capture
  -> normalizer.normalize(...)
  -> validate_tool_call_against_catalog(...)
```

No changes were needed in `TurnEngine` for Phase84 because Phase82 already handles `ToolCallBatchAction`.

## Tests

Python provider tests:

- Default OpenAI-compatible request body still has `parallel_tool_calls=false`.
- Opt-in OpenAI-compatible request body uses `parallel_tool_calls=true`.
- OpenAI-compatible non-streaming multiple `tool_calls` normalize to `tool_call_batch` when enabled.
- OpenAI-compatible still rejects multiple `tool_calls` when disabled.
- OpenAI-compatible streaming supports multiple indexes when enabled.
- Default Responses request body still has `parallel_tool_calls=false`.
- Opt-in Responses request body uses `parallel_tool_calls=true`.
- Responses multiple `function_call` items normalize to `tool_call_batch` when enabled.
- Responses still rejects multiple calls when disabled.
- Anthropic multiple `tool_use` blocks normalize to `tool_call_batch` when enabled.
- Anthropic still rejects multiple `tool_use` blocks when disabled.
- Normalizer rejects empty, malformed, duplicate-id, and unknown-tool batches.
- `RealProviderModelAdapter` returns `ToolCallBatchAction` for opt-in provider batch payloads.
- Existing provider contract tests keep default disabled assertions.

TS / integration tests:

- `provider inspect-config --json` includes sanitized tool-use metadata.
- No TS Host JSON-RPC shape changes are required.
- Existing CLI smoke remains in full regression scope.

## Documentation updates

Implementation updated:

- `README.md`
- `PROJECT_PLAN.md`
- `INTERNAL_DESIGN.md`
- `ARCHITECTURE.md`
- `EXTENSION_POINTS.md`
- `protocol/README.md`
- provider config examples

## Verification

Phase84 was verified with focused provider/config checks:

```bash
TMPDIR=/dev/shm PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=py-engine/src \
  ./.venv-test/bin/python -m pytest -s -p no:cacheprovider \
  py-engine/tests/test_provider_config.py \
  py-engine/tests/test_provider_normalizer.py \
  py-engine/tests/test_openai_compatible_provider.py \
  py-engine/tests/test_openai_responses_provider.py \
  py-engine/tests/test_anthropic_messages_provider.py \
  py-engine/tests/test_real_provider_adapter.py

TMPDIR=/dev/shm PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=py-engine/src \
  ./.venv-test/bin/python -m pytest -s -p no:cacheprovider \
  py-engine/tests/test_provider_contracts.py

cd ts-host
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/cliProviderContract.test.ts \
  --run --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism -t "provider inspect-config"
./node_modules/.bin/tsc -p tsconfig.json --noEmit
```

## Acceptance criteria

- Provider-native multiple tool calls can normalize to `ToolCallBatchAction` when explicitly enabled.
- Default provider behavior remains single-call / fail-closed.
- Provider request bodies expose parallel support only when explicitly enabled and supported.
- Phase82 scheduler policy remains the only execution safety decision point.
- No JSON-RPC method, request shape, response shape, transcript schema, provider context schema, or TS Host batch API change is required.
