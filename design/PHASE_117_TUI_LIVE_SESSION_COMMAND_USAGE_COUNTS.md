# Phase 117: TUI live session command usage counts

Phase117 adds local usage counters to the `god-code tui` live session command palette. Each command executed through the palette increments a per-command counter, and command rows display `uses:<count>` once a command has been used.

This phase is a focused TS Host TUI discoverability improvement. It builds on Phase109 live session command palette through Phase116 command history clear. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandUsageCounts` to `TuiState`.
- Palette-sourced command execution increments the matching command id counter.
- Direct live pane shortcuts do not change palette usage counters.
- Command palette rows render `uses:<count>` for used commands.
- Debug output exposes non-zero counts through `live_command_usage`.
- The Phase116 history clear action also resets usage counters.
- Focused reducer, renderer, clear, and debug tests cover usage counting behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Make frequently used palette commands visible without changing command order.
- Keep usage accounting local and deterministic.
- Preserve search, category filtering, grouping, favorites, history, pins, selection, and execution behavior.
- Keep the change local to TUI state, rendering, debug output, tests, and docs.

## Non-goals

- No persisted usage counters.
- No usage-based sorting in Phase117; Phase118 adds an explicit user-selected sorting mode.
- No cross-session or transcript usage analytics.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Usage behavior

Current behavior:

- Only commands executed through the live command palette increment counters.
- Counts are stored by `TuiLiveSessionCommandId`.
- Used command rows append `uses:<count>`.
- Unused command rows remain unchanged.
- Clearing local command history resets recent history, pinned history, and usage counters together.

## Acceptance criteria

- Palette command execution increments the matching counter.
- Repeated execution increments rather than replacing the counter.
- Renderer shows non-zero usage counts.
- History clear resets usage counters.
- Debug output exposes usage counters.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
