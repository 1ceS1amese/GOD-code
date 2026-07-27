# Phase 82: Multi tool concurrent scheduling

Phase82 implements the first bounded multi-tool scheduling path inside one turn. It introduces an internal model action for multiple client-side tool calls and extends the Python `ToolScheduler` so safe tool calls can run concurrently without changing the JSON-RPC method set.

This is a Python Engine internal implementation. It does not enable provider-native parallel tool calls and does not add a TS Host batch API.

## Goals

- Add a Python-internal action shape for a batch of tool calls.
- Let `TurnEngine` handle a batch as one model step.
- Let `ToolScheduler` execute eligible calls concurrently with bounded concurrency.
- Preserve one active turn per session from Phase81.
- Preserve existing `execute_tool` JSON-RPC requests; concurrent scheduling means multiple normal requests can be in flight.
- Keep result ordering deterministic for messages, transcripts, and final error selection.
- Keep hard host boundaries unchanged: all tool execution still goes through TS Host and `HostToolRegistry.executeRequest(...)`.
- Keep cancellation and Phase80 approval behavior compatible with concurrent in-flight tool requests.
- Add tests proving parallel-safe calls run concurrently and mutating/external calls do not accidentally run as one unsafe parallel wave.

## Non-goals

- No new JSON-RPC method such as `execute_tools`.
- No JSON-RPC batch envelope requirement.
- No provider API redesign.
- No default provider-native parallel tool use for OpenAI / Responses / Anthropic in this phase.
- No parallel tool calls inside a provider request unless a model adapter explicitly returns the new internal batch action.
- No dependency graph planner.
- No automatic retry/backoff policy.
- No speculative execution.
- No cross-turn or cross-session scheduler.
- No worker daemon or persistent tool pool.
- No relaxing TS Host permission, approval, audit, path, or command policies.

## Pre-Phase82 state

Before Phase82, `py-engine/src/god_code_engine/tools/scheduler.py` exposed one serial method:

```py
class ToolScheduler:
    execution_mode = "serial"

    def execute(self, session_id: str, turn_id: str, tool_call: ToolCall) -> ToolExecutionResult:
        ...
```

`TurnEngine` handled exactly one `ToolCallAction` at a time:

```text
model action -> tool_call -> scheduler.execute(...) -> tool_result -> next model step
```

Provider implementations intentionally constrain tool calls:

- OpenAI-compatible parser rejects multiple tool calls.
- OpenAI streaming parser supports only tool call index `0`.
- Provider contract tests assert `parallel_tool_calls` is disabled.

Phase82 adds engine/scheduler support first while leaving provider-native parallel tool call enablement to a later provider-specific phase.

## Implemented model action shape

Adds a new Python-internal action:

```py
@dataclass(slots=True)
class ToolCallBatchAction:
    tool_calls: list[ToolCall]
```

Extends:

```py
ModelAction = AssistantMessageAction | ToolCallAction | ToolCallBatchAction
ModelStreamEvent = AssistantDelta | AssistantMessageAction | ToolCallAction | ToolCallBatchAction
```

Rules:

- Empty `tool_calls` is invalid and becomes `invalid_action`.
- A single-call batch is allowed but may be normalized into serial execution.
- Batches are internal to Python Engine. They do not require TS protocol shape changes.
- Existing `ToolCallAction` remains supported and keeps current behavior.

## Implemented scheduler API

Keeps the existing single-call method for compatibility:

```py
def execute(self, session_id: str, turn_id: str, tool_call: ToolCall) -> ToolExecutionResult:
    ...
```

Adds a batch method:

```py
@dataclass(slots=True)
class ScheduledToolResult:
    tool_call: ToolCall
    result: ToolExecutionResult
    started_at: float
    finished_at: float
    execution_mode: str

def execute_many(
    self,
    session_id: str,
    turn_id: str,
    tool_calls: list[ToolCall],
    cancel_event: threading.Event | None = None,
) -> list[ScheduledToolResult]:
    ...
```

The returned list preserves model order, even if individual calls finish out of order.

## Implemented concurrency policy

Uses a conservative first policy:

```text
parallel-safe:
  Read
  ListFiles
  Search

serial-only:
  Edit
  Write
  Bash
  all MCP tools
  all plugin / skill tools
  all unknown tools
```

Reasoning:

- Read-only local inspection can safely run in parallel in the first phase.
- Mutating tools and shell commands can race on files, cwd state, logs, network ports, or user approvals.
- MCP/plugin tools may have remote side effects or unknown process state.

The scheduler executes a batch as waves:

```text
[Read, Search, ListFiles] -> one parallel wave
[Write]                  -> serial singleton wave
[Read, Search]           -> another parallel wave
[Bash]                   -> serial singleton wave
```

This gives real concurrency where safe while preserving deterministic behavior around unsafe calls.

## Implemented TurnEngine behavior

For `ToolCallAction`, keeps the current code path.

For `ToolCallBatchAction`:

1. Validate batch is non-empty.
2. Append and transcript all `tool_call` messages in model order.
3. Emit `tool_call_requested` once per call.
4. Call `scheduler.execute_many(...)`.
5. Append and transcript all `tool_result` messages in model order.
6. Emit `tool_result_received` once per call in model order.
7. If cancellation is observed:
   - Return cancelled.
8. If any result is not ok:
   - If any failed result has `tool_cancelled`, return cancelled.
   - Otherwise choose the first failing result in model order, emit `god_code_error`, and finish error.
9. If all results are ok:
   - Count the batch as one model step.
   - Continue to the next model action.

This preserves deterministic prompt reconstruction for the next model call.

## Implemented event payload compatibility

Does not add new event types in Phase82.

Reuse:

- `tool_call_requested`
- `tool_result_received`
- `god_code_error`
- `turn_finished`

Add optional payload metadata only:

```json
{
  "batch_id": "turn-local-id",
  "batch_index": 0,
  "batch_size": 3,
  "execution_mode": "parallel"
}
```

Existing renderers and smoke tests continue to work because they already ignore unknown payload fields.

## Implemented cancellation behavior

Cancellation has two layers:

- Python `cancel_event` tells `TurnEngine` / `ToolScheduler` to stop scheduling new work and finish cancelled.
- Existing `cancel_tool_execution` notification tells TS Host to abort in-flight tool handlers for the turn.

Phase82:

- Check `cancel_event` before starting each wave.
- Pass the same turn id through every `execute_tool` request.
- Let TS Host's existing turn abort controller fan out to in-flight tool calls.
- Return cancelled if any completed result is `tool_cancelled`.

No new cancel protocol is needed.

## Implemented TS Host interaction

The TS Host already supports multiple pending JSON-RPC requests by id. Phase82 does not add a host batch API.

Each tool call still reaches:

```text
GodCodeEngineProcess.handleExecuteTool(...)
  -> HostToolRegistry.executeRequest(...)
  -> permission / approval / audit
  -> tool handler
```

Phase80 approval prompt behavior remains per tool call. For the first implementation, serial-only tools include mutating/shell/external tools, so interactive approvals for those tools do not compete in one parallel wave.

## Provider behavior

Keep provider-native parallel tool calls disabled in Phase82:

- OpenAI-compatible can keep `parallel_tool_calls=false`.
- Responses can keep single client-side tool-call normalization.
- Anthropic Messages can keep single client-side tool-call normalization.

Provider-specific phases can later map provider multi-tool payloads into `ToolCallBatchAction` after scheduler semantics are proven.

Tests use a small test adapter that returns `ToolCallBatchAction` directly.

## Implemented code touch points

- `py-engine/src/god_code_engine/models/base.py`
  - Adds `ToolCallBatchAction`.
  - Extends `ModelAction` and `ModelStreamEvent`.
- `py-engine/src/god_code_engine/tools/scheduler.py`
  - Adds `ScheduledToolResult`.
  - Adds a conservative `ToolConcurrencyPolicy`.
  - Adds `execute_many(...)` using bounded thread execution for safe parallel waves.
  - Keeps `execute(...)` unchanged for existing callers.
- `py-engine/src/god_code_engine/engine/turn_engine.py`
  - Adds a batch handling path.
  - Preserves existing single-call path.
  - Emits existing events with optional batch metadata.
  - Keeps message/transcript result order deterministic.
- `py-engine/src/god_code_engine/providers/normalizer.py`
  - Validates batch tool calls against the tool catalog if an adapter returns an internal batch action.
- `py-engine/tests/test_turn_engine.py`
  - Adds a test adapter returning `ToolCallBatchAction`.
  - Adds success, failure, cancellation, deterministic ordering, and serial-only policy tests.
- `ts-host/test/godCodeEngineProcess.test.ts`
  - No required change because Phase82 does not add a TS protocol shape or provider-native batch path.
- Docs:
  - `README.md`
  - `PROJECT_PLAN.md`
  - `INTERNAL_DESIGN.md`
  - `ARCHITECTURE.md`
  - `EXTENSION_POINTS.md`
  - `protocol/README.md`

## Tests

- A batch of `Read`, `Search`, and `ListFiles` uses a parallel wave.
- Batch results are appended to session messages in model order.
- Transcript `tool_call` and `tool_result` entries stay in model order.
- `tool_call_requested` and `tool_result_received` events contain optional batch metadata.
- A mutating `Write` call is not placed into the same parallel wave as read-only calls.
- A failed tool result chooses the first failure in model order.
- A `tool_cancelled` result finishes the turn as cancelled.
- Existing single `ToolCallAction` behavior remains unchanged.
- Provider contract tests continue to assert provider-native parallel calls stay disabled.

## Verification

Relevant commands:

```bash
cd py-engine
python3 -m pytest tests/test_turn_engine.py tests/test_provider_contracts.py
cd ../ts-host
npm run build
npm test -- godCodeEngineProcess.test.ts --run
cd ..
./tools/run-cli-smoke.sh
./tools/check.sh
```

## Acceptance criteria

- `TurnEngine` can process a `ToolCallBatchAction`.
- `ToolScheduler.execute_many(...)` can run parallel-safe calls concurrently with bounded concurrency.
- Results remain deterministic in message, transcript, and event order.
- Serial-only tools are not executed in unsafe parallel waves.
- Cancellation and Phase80 approval behavior remain compatible.
- Existing single-tool behavior remains compatible.
- No JSON-RPC method, request shape, response shape, transcript schema, provider API, or TS Host batch API change is required.
