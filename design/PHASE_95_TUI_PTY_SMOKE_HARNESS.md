# Phase 95: TUI PTY smoke harness

Phase95 implements a small TUI PTY smoke harness for `god-code tui` rendering. It exercises the same `TuiScreen` alternate-screen lifecycle and renderer frame generation with deterministic smoke state, so terminal behavior can be checked without starting Python Engine or changing the JSON-RPC protocol.

This phase is a focused TS Host TUI testability improvement. It does not change Python Engine, JSON-RPC, transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- `runTuiPtySmoke(...)` in `ts-host/src/cli/tuiPtySmoke.ts`.
- TTY guard with explicit skipped result when output is not a TTY.
- Deterministic smoke frame using `tui-smoke-session`, `smoke prompt`, and a synthetic system event.
- Screen lifecycle coverage through `TuiScreen.start()`, `render(...)`, and `stop()`.
- Focused tests in `ts-host/test/tuiPtySmoke.test.ts`.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Provide a narrow smoke harness for TUI terminal lifecycle checks.
- Keep smoke state deterministic and independent from Python Engine startup.
- Return structured `passed` / `skipped` results for automated and manual callers.
- Preserve existing renderer and screen boundaries.

## Non-goals

- No new public CLI command.
- No new PTY dependency.
- No live model/provider call.
- No keyboard interaction replay.
- No JSON-RPC, protocol, transcript, provider, MCP, plugin, or tool boundary changes.

## Smoke behavior

Current smoke behavior:

- Skips by default unless output reports `isTTY === true`.
- Starts alternate screen, hides cursor, renders one deterministic TUI frame, then restores cursor and leaves alternate screen in `finally`.
- Uses caller-provided dimensions or output dimensions, falling back to `80x24`.
- Reports rendered line count and effective dimensions.

## Acceptance criteria

- Smoke harness returns `passed` for TTY-like output and writes expected screen control sequences.
- Smoke harness returns `skipped` without writing output when TTY output is required but unavailable.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.

## Phase598 completed integration

Phase598 separates the smoke render outcome from `TuiScreen.stop()` settlement. A render failure remains the primary thrown object even when stop also throws; a successful render with cleanup uncertainty now throws the fixed local error `TUI PTY smoke cleanup failed` without exposing the output failure. Passed/skipped results, dimensions, rendered line counts, screen sequences, and public Phase95 interfaces remain unchanged.
