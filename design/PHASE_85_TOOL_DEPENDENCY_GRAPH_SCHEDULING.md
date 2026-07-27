# Phase 85: Tool dependency graph scheduling

Phase85 implements a dependency-aware scheduling layer on top of the Phase82 `ToolCallBatchAction` / `ToolScheduler.execute_many(...)` runtime and the Phase84 provider-native batch normalization path.

Phase85 is a Python Engine internal implementation. It does not change JSON-RPC, TS Host tool APIs, transcript schema, provider APIs, or the externally visible tool execution method set.

## Goals

- Let Python `ToolScheduler` plan a batch as a dependency graph rather than only contiguous linear waves.
- Keep existing model/provider/JSON-RPC shapes unchanged.
- Preserve deterministic model-order transcript reconstruction.
- Preserve Phase82 execution safety: read-only safe tools may run in bounded parallel waves; mutating, shell, MCP, plugin, skill, and unknown tools remain serial-only unless a later phase explicitly proves safety.
- Add explicit, local dependency inference for built-in tools based on tool names and input paths.
- Provide structured scheduler plan metadata for tests and diagnostics without changing required event fields.
- Keep cancellation, approval, audit, and TS Host permission behavior unchanged.

## Non-goals

- No JSON-RPC method changes.
- No `execute_tools` TS Host batch API.
- No transcript schema change.
- No model prompt format change.
- No provider API rewrite.
- No cross-turn or cross-session scheduler.
- No speculative execution.
- No automatic retry/backoff policy.
- No LLM-generated dependency graph.
- No attempt to prove MCP/plugin/skill tool purity in this phase.
- No persistent worker pool.

## Current state

Phase82 currently builds waves by scanning model-order tool calls:

```text
parallel-safe contiguous run -> one parallel wave
serial-only tool             -> one singleton wave
next parallel-safe run       -> next parallel wave
```

The current policy is conservative:

```text
parallel-safe:
  Read
  ListFiles
  Search

serial-only:
  Edit
  Write
  Bash
  MCP tools
  plugin / skill tools
  unknown tools
```

Phase84 lets providers produce `ToolCallBatchAction` from real provider-native multiple tool calls, but the actual execution safety decision still stays in Phase82 `ToolScheduler`.

The remaining gap: a batch with independent reads separated by a serial-only operation is forced into strict contiguous waves, even when a graph planner could safely expose more parallelism or provide clearer diagnostics. Conversely, future tool additions need a single place to encode dependency and conflict rules rather than ad-hoc wave splitting.

## Implemented scheduler model

Adds a Python-internal execution graph model:

```py
@dataclass(slots=True)
class ToolDependencyEdge:
    before_index: int
    after_index: int
    reason: str

@dataclass(slots=True)
class ToolSchedulingNode:
    index: int
    tool_call: ToolCall
    parallel_safe: bool
    resource_keys: frozenset[str]

@dataclass(slots=True)
class ToolExecutionPlan:
    nodes: list[ToolSchedulingNode]
    edges: list[ToolDependencyEdge]
    waves: list[list[int]]
```

Rules:

- `nodes` are always in model order.
- `edges` point from prerequisite to dependent node.
- `waves` are topologically sorted.
- Within a wave, indexes are sorted in model order.
- `execute_many(...)` returns results in model order as today.

## Implemented dependency inference

Uses explicit deterministic rules for built-in tools.

### Resource key extraction

Extract normalized local resource keys from tool input:

```text
Read(path)      -> read:file:<normalized path>
ListFiles(path) -> read:tree:<normalized path>
Search(path)    -> read:tree:<normalized path>
Edit(path)      -> write:file:<normalized path>
Write(path)     -> write:file:<normalized path>
Bash            -> global:process
unknown/external -> global:external
```

Path normalization should be conservative:

- Require `path` to be a string to derive path-specific keys.
- Do not resolve symlinks in Python Engine.
- Normalize lexical `.` / `..` only if an existing utility already does so safely; otherwise keep a stable string form.
- If input is malformed or path cannot be derived, fall back to `global:unknown`.

### Conflict rules

Adds an edge from earlier node `A` to later node `B` when:

- Either node is serial-only.
- Either node has `global:*` resource key.
- A write touches the same file as a later read/write.
- A write touches a path under a later tree read/search, or vice versa.
- Two writes touch the same file/tree.
- The dependency relation is ambiguous.

Do not add an edge when:

- Both nodes are read-only safe.
- Their resource keys are disjoint.
- Both are read-only on the same file/tree.

This preserves safety and allows more explicit diagnostics without relaxing current host-side permissions.

## Implemented wave construction

Builds waves from the graph:

1. Create all nodes in model order.
2. Infer edges using pairwise deterministic rules.
3. Validate the graph is acyclic.
4. Repeatedly select ready nodes whose prerequisites are complete.
5. Limit each wave to `ToolConcurrencyPolicy.max_parallel`.
6. Keep serial-only nodes as singleton waves.
7. Preserve model order inside every wave.

Because edges are only added from lower model-order indexes to later indexes, the implemented graph is acyclic by construction. If no ready node is found, the scheduler falls back to the Phase82 linear wave planner.

## Implemented event metadata

Keeps existing event types:

- `tool_call_requested`
- `tool_result_received`

Adds optional metadata:

```json
{
  "batch_id": "...",
  "batch_index": 0,
  "batch_size": 3,
  "execution_mode": "parallel",
  "scheduler_plan": "dependency_graph",
  "scheduler_wave": 0,
  "scheduler_wave_size": 2,
  "dependency_count": 1
}
```

Existing renderers ignore unknown payload fields.

## Cancellation behavior

Keeps Phase82 behavior:

- Check `cancel_event` before scheduling each wave.
- Do not start new waves after cancellation.
- In-flight tools are still cancelled through existing TS Host turn abort propagation.
- Fill not-yet-scheduled results with `tool_cancelled`.
- Return final results in model order.

## TS Host interaction

No TS Host batch API is required.

Every scheduled node still calls:

```text
execute_tool
  -> HostToolRegistry.executeRequest(...)
  -> permission / approval / audit
  -> tool handler
```

Approvals remain per tool call. Since serial-only tools stay singleton waves, interactive prompts for mutating/shell/external tools do not compete in a parallel wave.

## Implemented code touch points

- `py-engine/src/god_code_engine/tools/scheduler.py`
  - Adds graph dataclasses.
  - Adds resource key extraction.
  - Adds dependency inference.
  - Adds dependency-aware plan construction.
  - Keeps `execute(...)`, `execute_many(...)`, and `plan_execution_modes(...)` compatible.
- `py-engine/src/god_code_engine/engine/turn_engine.py`
  - Includes scheduler plan metadata in existing batch event metadata.
  - Keeps message/transcript result order unchanged.
- `py-engine/tests/test_turn_engine.py`
  - Adds direct plan-building tests.
  - Adds event metadata and deterministic ordering coverage.

## Tests

Scheduler unit tests:

- Independent read-only tools can share a wave up to `max_parallel`.
- Read-only tools separated by unrelated read-only tools remain parallelizable.
- `Edit` / `Write` stay singleton serial waves.
- `Bash`, MCP, plugin, skill, and unknown tools stay singleton serial waves.
- Write-before-read on same file creates dependency.
- Read-before-write on same file creates dependency.
- Write-before-search/list on same tree creates dependency.
- Disjoint read-only paths can run in the same wave.
- Malformed inputs fall back to conservative global dependency.
- Returned results preserve model order even if graph waves finish out of order.
- Cancellation before a later wave fills unscheduled results with `tool_cancelled`.

TurnEngine tests:

- `ToolCallBatchAction` with dependency graph still records tool calls/results in model order.
- Optional scheduler plan metadata does not change event type contract.
- First failing result in model order remains the decisive error.

Regression tests:

- Existing Phase82 scheduler behavior remains safe.
- Phase84 provider-native batch actions still route through scheduler policy.
- Existing CLI smoke remains green.

## Documentation updates

Implementation updated:

- `README.md`
- `PROJECT_PLAN.md`
- `INTERNAL_DESIGN.md`
- `ARCHITECTURE.md`
- `EXTENSION_POINTS.md`
- `protocol/README.md`

## Verification

Phase85 was verified with:

```bash
TMPDIR=/dev/shm PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=py-engine/src \
  ./.venv-test/bin/python -m pytest -s -p no:cacheprovider \
  py-engine/tests/test_turn_engine.py \
  py-engine/tests/test_provider_normalizer.py \
  py-engine/tests/test_openai_compatible_provider.py \
  py-engine/tests/test_openai_responses_provider.py \
  py-engine/tests/test_anthropic_messages_provider.py

cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
```

Observed result:

- Target Python tests: 100 passed.
- TS typecheck: passed.

If sandbox permissions allow full regression:

```bash
./tools/run-python-tests.sh
./tools/run-ts-tests.sh
./tools/run-integration-tests.sh
./tools/run-cli-smoke.sh
```

## Acceptance criteria

- Scheduler can produce a deterministic dependency-aware execution plan for a batch.
- Safe independent read-only calls may share waves.
- Mutating, shell, external, malformed, or unknown calls remain conservative.
- Result order, transcript order, and final error selection remain model-order deterministic.
- No JSON-RPC method, request shape, response shape, transcript schema, provider context schema, or TS Host batch API change is required.
