# Phase 61: Token budget manager

Phase61 implements a local token budget manager on the existing Python `PromptBuilder -> ModelRequest` boundary. Phase56 added deterministic character-budget compaction, Phase58 added provider-reported usage budget guard, and Phase60 added `ModelRequest.system_prompt`. This phase fills the remaining gap with a unified local budget view that estimates how much prompt/context budget is consumed before a real provider request is encoded.

The implementation keeps Phase60 behavior unchanged and does not alter JSON-RPC methods, tool execution, transcript storage semantics, MCP, plugin, provider retry/fallback, provider usage accounting, provider budget guard, or provider error mapping.

## Goals

- Add a prompt-layer token budget manager that estimates request size before provider calls.
- Account separately for system prompt, compacted history messages, tool schema, provider context, and model options.
- Keep budget estimation deterministic and dependency-free for tests and local smoke.
- Give compaction and provider request construction a single local budget view without moving logic into `TurnEngine`.
- Keep provider-reported usage budget guard from Phase58 separate from local estimated prompt budget.
- Add offline tests / contract checks that prove budget metadata is computed, sanitized, and stable.
- Avoid JSON-RPC method changes and transcript rewrites.

## Non-goals

- No exact provider tokenizer in Phase61.
- No tiktoken / sentencepiece / Anthropic tokenizer dependency.
- No price table, billing, invoice, currency conversion, or account spend ledger.
- No provider dashboard or quota API calls.
- No automatic model context-window discovery.
- No semantic compression, retrieval, or summarization.
- No prompt injection classifier.
- No TS Host decision-making about model budget.

## Current state

Current prompt flow:

```text
SessionState.messages
  -> CompactionStrategy.compact(...)
  -> SystemPromptBuilder.build(...)
  -> TokenBudgetManager.build_budget(...)
  -> ModelRequest(messages=..., tools=..., system_prompt=..., budget=...)
  -> provider client request formatter
```

Existing related mechanisms:

- Phase56 character-budget compaction can reduce `messages`.
- Phase58 provider usage budget guard can reject provider responses using provider-reported token counts.
- Phase60 system prompt builder creates `ModelRequest.system_prompt` outside transcript history.
- Phase61 token budget manager creates `ModelRequest.budget` outside transcript history.

Remaining limitations:

- The estimate is character-based and approximate.
- It does not claim provider tokenizer parity.
- Budget metadata stays local to Python Engine / provider request construction by default.
- Phase58 budget guard only works after provider usage metadata is returned.

## Implemented model boundary

Extend `ModelRequest` with optional local budget metadata:

```py
@dataclass(slots=True)
class ModelRequestBudget:
    estimated_input_tokens: int
    system_prompt_tokens: int
    message_tokens: int
    tool_schema_tokens: int
    provider_context_tokens: int
    model_option_tokens: int
    estimator: str
    max_input_tokens: int | None = None


@dataclass(slots=True)
class ModelRequest:
    ...
    system_prompt: str | None = None
    budget: ModelRequestBudget | None = None
```

Rules:

- Budget metadata is local and approximate.
- Budget metadata is not written into transcript history.
- Budget metadata is not exposed through JSON-RPC events by default.
- Provider clients do not recompute the budget; they may inspect it for tests or future diagnostics.
- Phase58 provider-reported usage remains authoritative for post-response usage guard.

## Implemented components

Add:

```text
py-engine/src/god_code_engine/prompting/token_budget.py
```

Implemented types:

```py
@dataclass(slots=True)
class TokenBudgetConfig:
    enabled: bool = True
    max_input_tokens: int | None = None
    chars_per_token: int = 4
    include_tool_schemas: bool = True
    include_provider_context: bool = True


class TokenEstimator:
    def estimate_text(self, text: str) -> int: ...
    def estimate_json(self, value: object) -> int: ...


class TokenBudgetManager:
    def build_budget(
        self,
        *,
        system_prompt: str | None,
        messages: Messages,
        tools: list[ToolCatalogEntry],
        provider_context: JsonObject | None,
        options: ModelOptions | None = None,
    ) -> ModelRequestBudget | None:
        ...
```

The first implementation uses deterministic character-based estimation:

```text
estimated_tokens = ceil(char_count / chars_per_token)
```

This is intentionally an approximation, not a claim of provider tokenizer parity.

## Implemented config surface

Environment variables:

```text
GOD_CODE_TOKEN_BUDGET_ENABLED
GOD_CODE_TOKEN_BUDGET_MAX_INPUT_TOKENS
GOD_CODE_TOKEN_BUDGET_CHARS_PER_TOKEN
GOD_CODE_TOKEN_BUDGET_INCLUDE_TOOL_SCHEMAS
GOD_CODE_TOKEN_BUDGET_INCLUDE_PROVIDER_CONTEXT
```

Defaults:

- `GOD_CODE_TOKEN_BUDGET_ENABLED=true`
- `GOD_CODE_TOKEN_BUDGET_MAX_INPUT_TOKENS` unset
- `GOD_CODE_TOKEN_BUDGET_CHARS_PER_TOKEN=4`
- `GOD_CODE_TOKEN_BUDGET_INCLUDE_TOOL_SCHEMAS=true`
- `GOD_CODE_TOKEN_BUDGET_INCLUDE_PROVIDER_CONTEXT=true`

Rules:

- Disabled budget manager returns `budget=None`.
- Numeric values must be positive integers.
- If `max_input_tokens` is set and estimate exceeds it, Phase61 fails locally after existing compaction with a sanitized `TokenBudgetExceededError`.
- This manager does not enforce provider output token limits; `ModelOptions.max_tokens` and Phase58 provider usage guard remain separate.

## Budget accounting

### System prompt

Estimate `ModelRequest.system_prompt` separately as `system_prompt_tokens`.

### Messages

Estimate compacted `ModelRequest.messages`, not raw `SessionState.messages`.

### Tool schemas

Estimate serialized tool metadata and schemas because providers receive tool declarations separately from messages.

### Provider context

Estimate provider context when present, especially Responses opaque items that are carried across turns.

### Model options

Estimate non-default model options as request metadata under `model_option_tokens`. This is still local request-size metadata, not provider billing.

### Total

Compute:

```text
estimated_input_tokens =
  system_prompt_tokens
  + message_tokens
  + tool_schema_tokens
  + provider_context_tokens
  + model_option_tokens
```

All serialized estimation should be stable:

- deterministic JSON separators
- sorted object keys where practical
- no provider secrets
- no raw HTTP headers

## Runtime behavior

Implemented `PromptBuilder.build(...)` flow:

```text
parse ModelOptions
compact messages
build system_prompt
build budget metadata
if over configured max_input_tokens:
  raise prompt-layer error
return ModelRequest(..., system_prompt=..., budget=...)
```

Prompt-layer budget failures should be local validation errors, not provider client errors. Error messages must include only estimated counts and configured limits, not full prompt text.

## Interaction with Phase56 compaction

Phase61 does not replace Phase56:

- Phase56 still decides how to compact messages.
- Phase61 estimates the final request after compaction and system prompt insertion.
- Future work can let budget manager drive compaction targets more directly.

## Interaction with Phase58 provider usage guard

Phase61 and Phase58 solve different problems:

- Phase61 estimates local request size before a provider call.
- Phase58 enforces provider-reported usage after a provider response.

Both can be enabled together:

```text
local estimated prompt budget -> provider request -> provider usage budget guard
```

## Diagnostics and tests

Implemented Python tests:

- default budget manager estimates deterministic token counts.
- disabled budget manager returns `None`.
- invalid env values produce clear local config errors.
- `PromptBuilder.build(...)` attaches budget metadata without mutating session messages.
- system prompt, messages, tools, provider context, and model options are accounted separately.
- configured max input estimate failure is sanitized.
- Phase56 compaction still runs before budget estimate.

Implemented contract-test additions:

- `token_budget_manager_default`
- `prompt_builder_token_budget_metadata`
- `prompt_builder_token_budget_limit`

## CLI / JSON behavior

Phase61 avoids new JSON-RPC methods. Budget metadata is Python Engine local and travels only inside `ModelRequest` by default. Existing CLI run / REPL / diagnostics output remains unchanged.

If a future diagnostic exposes budget metadata, it must not print prompt text or provider context payloads by default. It may show sanitized counts and estimator names.

## Documentation updates

Implementation updated:

- README phase table and prompt/context limitations.
- `PROJECT_PLAN.md` Phase61 status and roadmap.
- `INTERNAL_DESIGN.md` prompt boundary and phase table.
- `ARCHITECTURE.md` `PromptBuilder -> ModelRequest` section.
- `EXTENSION_POINTS.md` prompt/context extension guidance.
- `protocol/README.md` with an explicit note that Phase61 adds no JSON-RPC methods.
- `examples/config/provider.env.example` or a dedicated prompt env example with token budget env vars.

## Boundaries

- Token budget management stays in Python prompting layer.
- Provider clients do not own budget estimation.
- TS Host does not decide model token budget.
- Transcript history remains user/tool/assistant execution history.
- MCP context injection remains explicit and separate.
- Provider billing / spend management remains out of scope.
- Exact tokenizer parity remains out of scope.

## Validation target for implementation

- `./tools/run-python-tests.sh py-engine/tests/test_prompt_builder.py py-engine/tests/test_provider_contracts.py`
- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/check.sh`
