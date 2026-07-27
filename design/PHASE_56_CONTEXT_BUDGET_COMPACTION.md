# Phase 56: Context budget and deterministic compaction

Phase56 adds a bounded context budget and deterministic compaction path on the existing `PromptBuilder -> CompactionStrategy -> ModelRequest` boundary. The engine already had `CompactionStrategy` and `NoopCompactionStrategy`; Phase56 adds opt-in budget enforcement without changing JSON-RPC methods, provider clients, tool execution, fake-provider defaults, or transcript storage semantics.

## Goals

- Add explicit context budget configuration for model request construction.
- Add a deterministic compaction strategy that can reduce old history before provider calls.
- Preserve recent conversational state, pending tool-call/tool-result integrity, and the current user turn.
- Keep provider-specific context (`provider_context`) independent from generic message compaction.
- Report compaction metadata in tests and diagnostics where useful, without leaking extra transcript content.
- Keep default behavior backward-compatible unless budget config is explicitly enabled.

## Non-goals

- No exact tokenizer dependency in Phase56.
- No semantic LLM summarization.
- No vector retrieval or long-term memory.
- No transcript file rewrite.
- No provider billing or price accounting.
- No JSON-RPC method changes.
- No changes to MCP / plugin / host tool execution boundaries.
- No automatic deletion of session history.

## Existing boundary

Current prompt construction already calls a compaction hook:

```text
TurnEngine
  -> PromptBuilder
  -> CompactionStrategy.compact(messages, options)
  -> ModelRequest
  -> ModelAdapter / Provider
```

Current implementation:

- `py-engine/src/god_code_engine/compaction/base.py`
- `py-engine/src/god_code_engine/compaction/noop.py`
- `py-engine/src/god_code_engine/prompting/builder.py`

Phase56 extends this boundary instead of moving compaction logic into `TurnEngine`, TS Host, provider clients, or transcript stores.

## Config surface

The implementation adds optional environment variables:

```text
GOD_CODE_CONTEXT_COMPACTION
GOD_CODE_CONTEXT_MAX_CHARS
GOD_CODE_CONTEXT_KEEP_RECENT_MESSAGES
GOD_CODE_CONTEXT_SUMMARY_MAX_CHARS
```

Proposed defaults:

- `GOD_CODE_CONTEXT_COMPACTION=none`
- `GOD_CODE_CONTEXT_MAX_CHARS` unset
- `GOD_CODE_CONTEXT_KEEP_RECENT_MESSAGES=12`
- `GOD_CODE_CONTEXT_SUMMARY_MAX_CHARS=4000`

Rules:

- `none` keeps the existing `NoopCompactionStrategy`.
- `simple` enables deterministic character-budget compaction.
- Character budget is a conservative implementation detail, not a token guarantee.
- All numeric values must be positive integers.
- If budget is unset, compaction remains disabled even if the strategy value is absent.
- Turn-level options may later override env defaults through the existing `turn_options` object, but Phase56 should avoid adding new JSON-RPC methods.

## Compaction strategy

The implementation adds:

```text
py-engine/src/god_code_engine/compaction/simple.py
```

Core types:

```py
@dataclass(slots=True)
class ContextBudget:
    max_chars: int | None
    keep_recent_messages: int
    summary_max_chars: int

class SimpleCompactionStrategy(CompactionStrategy):
    def compact(self, messages: Messages, options: ModelOptions) -> Messages: ...
```

Behavior:

1. Estimate message size deterministically from JSON-serialized message content.
2. If total estimated size is within budget, return a shallow copy of messages.
3. If over budget:
   - Preserve the newest `keep_recent_messages` messages.
   - Preserve the current user turn.
   - Avoid splitting a `tool_call` from its matching `tool_result` when both are in the preserved window.
   - Create one synthetic summary message for compacted older history.
4. Summary message should be deterministic and bounded:
   - Use a fixed prefix, for example `[GOD-code compacted history]`.
   - Include counts by message kind.
   - Include short, bounded snippets from compacted user/assistant messages.
   - Include tool names and result status summaries, not full large tool output.
5. If the summary plus preserved recent messages still exceeds budget, trim summary first; as a last resort, keep only the most recent messages that fit.

Suggested synthetic message shape:

```json
{
  "kind": "user",
  "content": "[GOD-code compacted history]\\n..."
}
```

Using a normal `user` message keeps existing provider formatters compatible. The content must clearly mark itself as generated context, not as verbatim user input.

## Provider context interaction

Generic compaction must not mutate `session.provider_context`.

Rules:

- OpenAI Responses opaque `provider_context.items` remains separate.
- Anthropic / OpenAI-compatible providers ignore provider context as they do today.
- If a provider-specific context becomes inconsistent with compacted generic history, that is a future provider-specific policy problem; Phase56 should not invent cross-provider context rewriting.

## Diagnostics and tests

Phase56 keeps runtime output stable by default. Diagnostics remain test-focused:

- Unit tests assert compaction output.
- Optional internal metadata can be returned from helper functions later, but is not added to JSON-RPC events in Phase56.
- `doctor` and `provider inspect-config` should not start printing transcript snippets.

Test coverage:

- Noop remains default.
- Valid / invalid env config.
- Under-budget messages unchanged except copy identity.
- Over-budget messages get one synthetic summary plus recent messages.
- Tool call/result pairs are not split when preserved.
- Large tool outputs are summarized without full content.
- Current user turn is preserved.
- PromptBuilder wires strategy selection correctly.
- Existing provider contract tests continue to pass.

## Documentation updates

Implementation updates:

- README current limitations and context/compaction notes.
- `PROJECT_PLAN.md` Phase56 status and roadmap.
- `INTERNAL_DESIGN.md` compaction section and phase table.
- `ARCHITECTURE.md` prompt/context boundary.
- `EXTENSION_POINTS.md` compaction extension guidance.
- `protocol/README.md` with an explicit note that Phase56 does not add JSON-RPC methods.

## Boundaries

- Compaction is prompt construction behavior, not transcript mutation.
- Transcript replay should continue to read original events.
- Providers receive only the compacted `ModelRequest.messages`.
- Host tools, MCP tools, and plugin tools are unaffected.
- Fake provider remains deterministic.
- Exact token accounting and provider price/budget accounting remain future work.

## Validation target

- `./tools/run-python-tests.sh py-engine/tests/test_compaction.py py-engine/tests/test_prompt_builder.py py-engine/tests/test_turn_engine.py`
- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/check.sh`
