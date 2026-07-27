# Phase 60: System prompt builder

Phase60 adds a first-class system prompt builder on the existing Python `PromptBuilder -> ModelRequest -> ModelAdapter` boundary. Previous prompt construction mostly forwarded `SessionState.messages` through compaction and into provider clients. That was enough for deterministic fake-provider tests, but real providers need a stable, explicit system instruction layer that is not mixed into transcript history, user messages, tool results, MCP context, or provider-specific request code.

The implementation keeps Phase59 behavior unchanged and does not alter JSON-RPC methods, tool execution, transcript storage semantics, MCP, plugin, retry/fallback, provider usage budget guard, or provider error mapping.

## Goals

- Add a dedicated system prompt builder under `py-engine/src/god_code_engine/prompting/`.
- Keep system prompt generation deterministic, local, and testable.
- Keep `SessionState.messages` as conversation / execution history, not as the storage place for system instructions.
- Keep system prompt content out of transcript JSONL unless a future explicit diagnostic chooses to expose sanitized metadata.
- Let provider clients encode system instructions in provider-specific ways while keeping policy and composition in the prompt layer.
- Add offline tests / contract checks that prove OpenAI-compatible, Responses, and Anthropic providers receive system instructions through their expected request shapes.
- Keep fake provider behavior stable unless tests explicitly inspect the new field.

## Non-goals

- No prompt marketplace, remote prompt registry, or automatic prompt updates.
- No project scanning, repo indexing, or automatic policy generation from files.
- No prompt injection classifier.
- No semantic memory, retrieval, summarization, or vector context.
- No new JSON-RPC methods.
- No automatic MCP resource / prompt discovery injection.
- No changes to host tool permission enforcement.
- No provider-specific prompt policy in `TurnEngine` or TS Host.

## Current state

Current `PromptBuilder.build(...)` does this:

```text
SessionState.messages
  -> CompactionStrategy.compact(...)
  -> ModelRequest(messages=..., tools=..., options=..., provider_context=...)
```

Current limitations:

- No explicit system prompt field.
- Provider formatters only see generic `ModelRequest.messages`.
- If a system instruction were inserted as a normal message, it would be compacted with history and risk being replayed / stored as conversation state.
- Provider-specific system instruction shapes are different:
  - OpenAI Chat Completions uses a `role: "system"` message.
  - OpenAI Responses can use `instructions` or equivalent top-level request fields.
  - Anthropic Messages uses a top-level `system` field.

## Model boundary

Extend `ModelRequest` with an internal optional field:

```py
@dataclass(slots=True)
class ModelRequest:
    messages: Messages
    tools: list[ToolCatalogEntry]
    options: ModelOptions
    provider_context: JsonObject | None = None
    system_prompt: str | None = None
```

Rules:

- `system_prompt` is not part of `SessionState.messages`.
- `system_prompt` is not compacted.
- `system_prompt` is not written as transcript message history.
- `system_prompt` is passed to provider clients through the existing in-process `ModelRequest`.
- JSON-RPC `create_session` / `submit_turn` payloads do not change.

## Prompt builder components

Add:

```text
py-engine/src/god_code_engine/prompting/system_prompt.py
```

Implemented types:

```py
@dataclass(slots=True)
class SystemPromptConfig:
    enabled: bool = True
    template: str | None = None
    extra: str | None = None


class SystemPromptBuilder:
    def build(self, *, tools: list[ToolCatalogEntry]) -> str | None:
        ...
```

`PromptBuilder` then becomes:

```text
SessionState.messages
  -> CompactionStrategy.compact(...)
  -> SystemPromptBuilder.build(tools=session.tool_catalog)
  -> ModelRequest(..., system_prompt=...)
```

The system prompt builder owns composition. Provider clients only encode an already-built string.

## Config surface

Environment variables:

```text
GOD_CODE_SYSTEM_PROMPT_ENABLED
GOD_CODE_SYSTEM_PROMPT
GOD_CODE_SYSTEM_PROMPT_FILE
GOD_CODE_SYSTEM_PROMPT_EXTRA
```

Defaults:

- `GOD_CODE_SYSTEM_PROMPT_ENABLED=true`
- `GOD_CODE_SYSTEM_PROMPT` unset
- `GOD_CODE_SYSTEM_PROMPT_FILE` unset
- `GOD_CODE_SYSTEM_PROMPT_EXTRA` unset

Rules:

- If disabled, `system_prompt=None`.
- If `GOD_CODE_SYSTEM_PROMPT` is set, it replaces the built-in default template.
- If `GOD_CODE_SYSTEM_PROMPT_FILE` is set, read the template from that file.
- `GOD_CODE_SYSTEM_PROMPT` and `GOD_CODE_SYSTEM_PROMPT_FILE` are mutually exclusive.
- `GOD_CODE_SYSTEM_PROMPT_EXTRA` appends local extra instructions after the base template.
- Empty or whitespace-only prompt values are invalid when explicitly provided.
- File reads must be explicit, bounded, UTF-8, and error clearly when missing or too large.

The first implementation can keep config Python-local. TS `provider inspect-config` does not need to show system prompt values because prompt contents may include local policy text.

## Default system prompt scope

The built-in default should be short and architecture-specific:

- State that the model is driving a coding-agent turn through explicit tool calls.
- State that tool execution is mediated by the host tool registry and permissions.
- State that file/shell side effects happen only through tools.
- State that available tools are described separately by the provider request's tool schema.
- State that final answers should be concise and grounded in observed tool results.

The default should not:

- Duplicate full README / architecture docs.
- Include provider credentials, env values, file contents, raw MCP resources, or plugin manifests.
- Encode provider-specific formatting instructions.
- Override host permission boundaries.

## Provider encoding plan

### OpenAI-compatible Chat Completions

If `ModelRequest.system_prompt` is present, prepend:

```json
{"role": "system", "content": "..."}
```

before regular messages in the Chat Completions `messages` array.

### OpenAI Responses

If `ModelRequest.system_prompt` is present, set a top-level instruction field such as:

```json
{"instructions": "..."}
```

and keep normal `input` items unchanged.

### Anthropic Messages

If `ModelRequest.system_prompt` is present, set:

```json
{"system": "..."}
```

on the Messages request body. Do not inject it as a normal `messages[]` entry.

### Fake provider

Fake provider ignores `system_prompt` for runtime behavior to preserve deterministic existing tests. Tests assert that `PromptBuilder` produces the field.

## Compaction interaction

Phase60 does not replace Phase56 compaction:

```text
history messages -> compaction
system prompt -> not compacted
ModelRequest -> provider
```

Rationale:

- System prompt is policy / instruction, not history.
- It should not consume or mutate transcript history.
- It should not be dropped by history compaction.

Future token-budget work can account for system prompt size separately, but Phase60 should not implement an exact tokenizer or provider context-window negotiation.

## Diagnostics and tests

Python tests cover:

- `SystemPromptBuilder` default prompt generation.
- env disabled -> `system_prompt=None`.
- env inline prompt and extra prompt validation.
- file prompt loading with bounded size.
- `PromptBuilder.build(...)` attaches `system_prompt` without mutating `SessionState.messages`.
- Compaction does not remove or modify `system_prompt`.
- OpenAI-compatible request body prepends system message.
- OpenAI Responses request body uses top-level instructions.
- Anthropic request body uses top-level system.

Contract-test additions:

- `system_prompt_builder_default`
- `openai_compatible_system_prompt_request`
- `openai_responses_system_prompt_request`
- `anthropic_messages_system_prompt_request`

## CLI / JSON behavior

Phase60 avoids new JSON-RPC methods. System prompt construction is Python Engine local and travels only inside `ModelRequest`. Existing CLI run / REPL / diagnostics output remains unchanged by default.

If a future diagnostic exposes system prompt metadata, it must not print full prompt content by default. It may report sanitized facts such as enabled/disabled, source kind, and character count.

## Documentation updates

Implementation updates:

- README phase table and prompt/provider limitations.
- `PROJECT_PLAN.md` Phase60 status and roadmap.
- `INTERNAL_DESIGN.md` prompt boundary and phase table.
- `ARCHITECTURE.md` `PromptBuilder -> ModelRequest` section.
- `EXTENSION_POINTS.md` prompt/context extension guidance.
- `protocol/README.md` with an explicit note that Phase60 adds no JSON-RPC methods.

## Boundaries

- System prompt building stays in Python prompting layer.
- Provider clients only encode an already-built `ModelRequest.system_prompt`.
- `TurnEngine` does not compose provider-specific system instructions.
- TS Host does not decide system prompt content.
- Transcript history remains user/tool/assistant execution history.
- MCP context injection remains explicit and separate.
- Plugin / Skill runtimes are unaffected.
- Provider retry/fallback/usage/error mapping are unaffected.

## Validation target for implementation

- `./tools/run-python-tests.sh py-engine/tests/test_prompt_builder.py py-engine/tests/test_openai_compatible_provider.py py-engine/tests/test_openai_responses_provider.py py-engine/tests/test_anthropic_messages_provider.py py-engine/tests/test_provider_contracts.py`
- `npm test -- cliProviderContract.test.ts --run`
- `npm run build`
- `./tools/check.sh`
