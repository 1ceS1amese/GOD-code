# Phase 63: Prompt injection guard

Phase63 implements a local prompt injection guard on the existing Python `PromptBuilder -> ModelRequest` boundary. Phase49 can explicitly inject MCP resource / prompt content as context, Phase56 / Phase62 can compact history into generated context, Phase60 builds `system_prompt`, and Phase61 computes local request budget metadata. This phase fills the prompt/context safety gap with a deterministic guard that inspects untrusted model input sections and produces sanitized risk metadata before a provider request is encoded.

The implementation keeps JSON-RPC methods, transcript storage, tool execution, MCP/plugin payloads, provider retry/fallback, provider usage accounting, provider error mapping, system prompt construction, compaction strategy output, and token budget metadata boundaries unchanged.

## Goals

- Add a prompt-layer guard that scans model input for likely prompt injection patterns.
- Keep the first implementation deterministic, local, dependency-free, and offline-testable.
- Distinguish risk metadata from policy enforcement; default behavior should be report-only.
- Inspect compacted messages, tool results, generated summary messages, system prompt additions, and provider context.
- Produce sanitized counts / categories / message indexes, not full prompt text.
- Keep provider clients from owning prompt injection detection.
- Keep TS Host from deciding model-context safety policy in the first implementation.
- Add tests proving deterministic detection, sanitized reports, disabled behavior, and no transcript mutation.
- Avoid JSON-RPC method changes.

## Non-goals

- No LLM-backed classifier in Phase63.
- No provider moderation API calls.
- No vector database, embeddings, retrieval ranking, or semantic search.
- No automatic project scanning.
- No secret scanning or DLP engine.
- No hard tool-permission enforcement changes.
- No blocking by default.
- No transcript rewrite or destructive message pruning.
- No MCP/plugin runtime behavior changes.

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

- Phase49 explicit MCP context injection can add resource / prompt content to `initial_messages`.
- Phase56 and Phase62 can transform message history before provider request construction.
- Phase60 system prompt is kept separate from transcript history.
- Phase61 token budget metadata is local and approximate.

Current limitations:

- The system does not mark untrusted context that attempts to override instructions.
- Tool output and external resource content are sent to providers as ordinary context after formatting.
- There is no local report showing which message sections matched injection-like patterns.
- There is no stable extension point for future prompt safety diagnostics.

## Implemented model boundary

Extend `ModelRequest` with optional local prompt safety metadata:

```py
@dataclass(slots=True)
class PromptInjectionFinding:
    category: str
    message_index: int | None
    source: str
    severity: str
    pattern_id: str


@dataclass(slots=True)
class PromptInjectionReport:
    enabled: bool
    action: str
    finding_count: int
    findings: list[PromptInjectionFinding]


@dataclass(slots=True)
class ModelRequest:
    ...
    prompt_injection_report: PromptInjectionReport | None = None
```

Rules:

- Prompt injection metadata is local and sanitized.
- Prompt injection metadata is not written into transcript history.
- Prompt injection metadata is not exposed through JSON-RPC events by default.
- Provider clients do not recompute prompt injection findings.
- The first implementation does not change provider request text by default.

## Implemented components

Add:

```text
py-engine/src/god_code_engine/prompting/injection_guard.py
```

Implemented types:

```py
@dataclass(frozen=True, slots=True)
class PromptInjectionGuardConfig:
    enabled: bool = True
    action: str = "report"
    include_system_prompt: bool = False
    include_provider_context: bool = True
    include_tool_results: bool = True


class PromptInjectionGuard:
    def inspect(
        self,
        *,
        system_prompt: str | None,
        messages: Messages,
        provider_context: JsonObject | None,
    ) -> PromptInjectionReport | None:
        ...
```

The first implementation uses deterministic phrase / regex matching, with stable pattern IDs and categories.

Example categories:

- `instruction_override`
- `secret_exfiltration`
- `tool_misuse`
- `system_prompt_extraction`
- `role_confusion`

Example patterns:

- "ignore previous instructions"
- "reveal your system prompt"
- "send the contents of"
- "disable safety"
- "you are now"

The matching layer must not include raw matched text in reports by default.

## Implemented config surface

Environment variables:

```text
GOD_CODE_PROMPT_INJECTION_GUARD_ENABLED
GOD_CODE_PROMPT_INJECTION_GUARD_ACTION
GOD_CODE_PROMPT_INJECTION_GUARD_INCLUDE_SYSTEM_PROMPT
GOD_CODE_PROMPT_INJECTION_GUARD_INCLUDE_PROVIDER_CONTEXT
GOD_CODE_PROMPT_INJECTION_GUARD_INCLUDE_TOOL_RESULTS
```

Defaults:

- `GOD_CODE_PROMPT_INJECTION_GUARD_ENABLED=true`
- `GOD_CODE_PROMPT_INJECTION_GUARD_ACTION=report`
- `GOD_CODE_PROMPT_INJECTION_GUARD_INCLUDE_SYSTEM_PROMPT=false`
- `GOD_CODE_PROMPT_INJECTION_GUARD_INCLUDE_PROVIDER_CONTEXT=true`
- `GOD_CODE_PROMPT_INJECTION_GUARD_INCLUDE_TOOL_RESULTS=true`

Rules:

- Disabled guard returns `prompt_injection_report=None`.
- `action` must initially be one of `report`, `fail`.
- `report` attaches sanitized metadata and does not block provider calls.
- `fail` raises a local sanitized prompt-layer error if findings exist.
- Boolean values use the existing truthy/falsy convention.
- Invalid config fails locally during `PromptBuilder` construction.

## Runtime behavior

Implemented `PromptBuilder.build(...)` flow:

```text
parse ModelOptions
compact messages
build system_prompt
inspect prompt injection risk
build token budget metadata
if guard action is fail and findings exist:
  raise prompt-layer error
return ModelRequest(..., system_prompt=..., budget=..., prompt_injection_report=...)
```

Prompt-layer guard failures must be local validation errors, not provider client errors. Error messages must include only category counts and action metadata, not full prompt text or provider context.

## Source classification

The first implementation can infer source labels from message shape:

- `system_prompt`
- `user_message`
- `assistant_message`
- `tool_call`
- `tool_result`
- `summary_message`
- `provider_context`

Generated summary messages from Phase62 can be identified by the stable summary compaction prefix.

## Interaction with Phase60 system prompt

By default Phase63 does not scan the built-in system prompt because it is trusted local policy. `GOD_CODE_PROMPT_INJECTION_GUARD_INCLUDE_SYSTEM_PROMPT=true` exists mainly for custom prompt debugging.

## Interaction with Phase61 token budget

Phase63 runs before token budget estimation so future versions can include guard metadata in diagnostics without changing provider request encoding. The first implementation does not add prompt text to messages, so token budget remains based on the same compacted messages and system prompt.

## Interaction with Phase62 summary compaction

Phase63 scans the post-compaction `ModelRequest.messages`. That means it sees generated summary messages, recent preserved messages, and tool result summaries after compaction. It does not scan raw compacted-away messages unless future work adds explicit audit-only mode.

## Diagnostics and tests

Implemented Python tests:

- default guard reports deterministic findings.
- disabled guard returns `None`.
- invalid env values produce clear local config errors.
- `PromptBuilder.build(...)` attaches sanitized prompt injection metadata.
- `report` mode does not mutate messages or transcript history.
- `fail` mode raises a sanitized local error.
- tool result and provider context scanning can be toggled independently.
- Phase62 summary messages can be identified as `summary_message` source.

Implemented contract-test additions:

- `prompt_injection_guard_default`
- `prompt_builder_prompt_injection_report`
- `prompt_builder_prompt_injection_fail`

## CLI / JSON behavior

Phase63 avoids new JSON-RPC methods. Prompt injection reports are Python Engine local and travel only inside `ModelRequest` by default. Existing CLI run / REPL / diagnostics output remains unchanged.

If a future diagnostic exposes prompt injection metadata, it must not print raw prompt, tool output, provider context, matched text, API keys, headers, or secrets by default. It may show sanitized categories, counts, sources, message indexes, and pattern IDs.

## Documentation updates

Implementation updated:

- README phase table and prompt/context limitations.
- `PROJECT_PLAN.md` Phase63 status and roadmap.
- `INTERNAL_DESIGN.md` prompt boundary and phase table.
- `ARCHITECTURE.md` `PromptBuilder -> ModelRequest` section.
- `EXTENSION_POINTS.md` prompt/context extension guidance.
- `protocol/README.md` with an explicit note that Phase63 adds no JSON-RPC methods.
- `examples/config/provider.env.example` or a dedicated prompt env example with injection guard env vars.

## Boundaries

- Prompt injection guard stays in Python prompting layer.
- Provider clients do not own prompt safety detection.
- TS Host does not decide prompt injection policy in Phase63.
- Transcript history remains original execution history.
- System prompt remains separate from generated report metadata.
- Token budget metadata remains approximate and post-compaction.
- Tool permissions remain enforced by TS Host policy, not by the guard.
- Provider-backed classification, semantic retrieval, and automatic remediation remain future work.

## Validation target for implementation

- `./tools/run-python-tests.sh py-engine/tests/test_prompt_builder.py py-engine/tests/test_provider_contracts.py`
- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/check.sh`
