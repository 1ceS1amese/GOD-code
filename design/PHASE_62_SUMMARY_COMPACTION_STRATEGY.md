# Phase 62: Summary compaction strategy

Phase62 implements a summary compaction strategy on the existing Python `PromptBuilder -> CompactionStrategy -> ModelRequest` boundary. Phase56 added deterministic character-budget compaction, Phase60 added `ModelRequest.system_prompt`, and Phase61 added local estimated `ModelRequest.budget`. This phase fills the prompt/context gap with a cleaner summary-oriented compaction path that preserves recent tool flow while reducing older history into a stable summary message.

The implementation keeps JSON-RPC methods, transcript storage, tool execution, MCP/plugin payloads, provider retry/fallback, provider usage accounting, provider error mapping, system prompt construction, and token budget metadata boundaries unchanged.

## Goals

- Add a summary-oriented compaction strategy under the existing Python compaction layer.
- Preserve recent user / assistant / tool_call / tool_result flow with tool-call/result pair integrity.
- Compact older history into a deterministic summary message before `ModelRequest` construction.
- Keep transcript JSONL append-only and avoid rewriting historical entries.
- Keep summary construction separate from system prompt construction and provider clients.
- Keep Phase61 token budget metadata computed after compaction.
- Add offline tests proving deterministic summary output, pair preservation, budget reduction, and transcript immutability.
- Avoid JSON-RPC method changes.

## Non-goals

- No provider-backed LLM summarization in the first implementation.
- No vector database, embeddings, retrieval ranking, or semantic search index.
- No automatic project scanning.
- No prompt injection classifier.
- No transcript JSONL rewrite or destructive history pruning.
- No TS Host decision-making about compaction.
- No exact tokenizer dependency.
- No provider billing or spend management.

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

- Phase56 `SimpleCompactionStrategy` can reduce old messages by character budget.
- Phase61 `TokenBudgetManager` estimates the already-compacted request.
- Transcript JSONL remains the authoritative execution history.

Current limitations:

- The current simple compaction is mostly size-driven and does not expose a clear summary policy boundary.
- Summary text is not a first-class strategy with explicit knobs.
- There is no clean path to add provider-backed summarization later without mixing it into `TurnEngine`.
- Compaction target is character-based and only indirectly related to Phase61 token budget metadata.

## Implemented model boundary

Keep `ModelRequest` unchanged for Phase62:

```py
@dataclass(slots=True)
class ModelRequest:
    messages: Messages
    tools: list[ToolCatalogEntry]
    options: ModelOptions
    provider_context: JsonObject | None = None
    system_prompt: str | None = None
    budget: ModelRequestBudget | None = None
```

Rules:

- Summary compaction only changes `ModelRequest.messages`.
- Summary messages are generated input context, not transcript history.
- Summary messages are not written back into `SessionState.messages`.
- Provider clients receive normal messages and do not know which strategy produced them.
- `ModelRequest.budget` is still computed after compaction.

## Implemented components

Add:

```text
py-engine/src/god_code_engine/compaction/summary.py
```

Implemented types:

```py
@dataclass(frozen=True, slots=True)
class SummaryCompactionConfig:
    max_chars: int
    keep_recent_messages: int = 12
    summary_max_chars: int = 4000
    include_tool_results: bool = True
    preserve_tool_pairs: bool = True


class SummaryCompactionStrategy(CompactionStrategy):
    def compact(self, messages: Messages, options: ModelOptions) -> Messages:
        ...
```

The first implementation is deterministic and dependency-free:

- count old message kinds.
- include short snippets from user / assistant turns.
- include sanitized tool call names, IDs, and result status.
- preserve the most recent message window.
- expand the preserved window when it would otherwise start with a matching `tool_result`.

## Implemented config surface

Environment variables:

```text
GOD_CODE_CONTEXT_COMPACTION=summary
GOD_CODE_CONTEXT_SUMMARY_MAX_CHARS
GOD_CODE_CONTEXT_SUMMARY_KEEP_RECENT_MESSAGES
GOD_CODE_CONTEXT_SUMMARY_OUTPUT_MAX_CHARS
GOD_CODE_CONTEXT_SUMMARY_INCLUDE_TOOL_RESULTS
```

Defaults:

- Existing `GOD_CODE_CONTEXT_COMPACTION=none` remains unchanged.
- `summary` is opt-in.
- `GOD_CODE_CONTEXT_SUMMARY_KEEP_RECENT_MESSAGES=12`
- `GOD_CODE_CONTEXT_SUMMARY_OUTPUT_MAX_CHARS=4000`
- `GOD_CODE_CONTEXT_SUMMARY_INCLUDE_TOOL_RESULTS=true`

Rules:

- Numeric values must be positive integers.
- Boolean values use the same truthy/falsy convention as other env config.
- Invalid config fails locally during `PromptBuilder` construction.
- Phase56 `simple` remains available and unchanged.

## Summary message shape

Generated summary message should use a stable prefix so tests and future diagnostics can identify it:

```text
[GOD-code summary compaction]
Compacted N messages: user=X, assistant=Y, tool_call=Z, tool_result=W
Highlights:
- user: ...
- assistant: ...
- tool_call: name=Read id=...
- tool_result: name=Read id=... status=ok
```

The summary message is represented as:

```py
{"kind": "user", "content": "...summary..."}
```

This keeps provider formatters unchanged because existing providers already support user messages.

## Interaction with Phase56 compaction

Phase62 does not remove Phase56:

- `none` keeps current noop behavior.
- `simple` keeps current deterministic character-budget behavior.
- `summary` adds a clearer summary-focused strategy.

The implementation can share helper logic with Phase56, but the strategy name and config should be explicit so behavior is testable.

## Interaction with Phase61 token budget

Phase62 compaction runs before Phase61 budget estimation:

```text
raw session messages -> summary compaction -> system prompt -> token budget estimate
```

The budget manager sees only the final compacted messages. Future work may let `TokenBudgetManager` drive a token target for compaction, but Phase62 keeps the first implementation simple and character-budget based.

## Runtime behavior

Implemented `PromptBuilder.build(...)` flow:

```text
parse ModelOptions
compact messages with SummaryCompactionStrategy when configured
build system_prompt
build token budget metadata
return ModelRequest(..., messages=compacted_messages, system_prompt=..., budget=...)
```

The strategy must not:

- mutate `SessionState.messages`.
- append transcript entries.
- call provider clients.
- emit JSON-RPC events.
- leak provider API keys, headers, or env values.

## Diagnostics and tests

Implemented Python tests:

- `summary` config loads from env and keeps `none` / `simple` unchanged.
- summary compaction is deterministic.
- recent messages are preserved.
- tool_call / tool_result pairs are preserved when the recent window starts at a result.
- summary output is bounded by `summary_max_chars`.
- compacted request message budget is lower than un-compacted request budget.
- `SessionState.messages` and transcript store are not mutated.
- invalid summary config produces clear local config errors.

Implemented contract-test additions:

- `summary_compaction_strategy_default`
- `prompt_builder_summary_compaction_budget`

## CLI / JSON behavior

Phase62 avoids new JSON-RPC methods. Existing CLI run / REPL / diagnostics output remains unchanged unless future diagnostics explicitly expose summary compaction metadata.

If a future diagnostic exposes summary metadata, it should show counts and strategy names rather than dumping full summarized prompt content by default.

## Documentation updates

Implementation updated:

- README phase table and prompt/context limitations.
- `PROJECT_PLAN.md` Phase62 status and roadmap.
- `INTERNAL_DESIGN.md` prompt boundary and phase table.
- `ARCHITECTURE.md` `PromptBuilder -> CompactionStrategy` section.
- `EXTENSION_POINTS.md` prompt/context extension guidance.
- `protocol/README.md` with an explicit note that Phase62 adds no JSON-RPC methods.
- `examples/config/provider.env.example` or a dedicated context env example with summary compaction env vars.

## Boundaries

- Summary compaction stays in Python compaction layer.
- Provider clients do not own summary generation.
- TS Host does not decide compaction policy.
- Transcript history remains original execution history.
- System prompt remains separate from generated context summary.
- Token budget metadata remains approximate and post-compaction.
- Retrieval, semantic search, provider-backed summarization, and prompt injection detection remain future work.

## Validation target for implementation

- `./tools/run-python-tests.sh py-engine/tests/test_compaction.py py-engine/tests/test_prompt_builder.py py-engine/tests/test_provider_contracts.py`
- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/check.sh`
