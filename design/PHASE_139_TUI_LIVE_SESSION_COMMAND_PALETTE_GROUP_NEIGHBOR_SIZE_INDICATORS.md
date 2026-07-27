# Phase 139: TUI live session command palette group neighbor size indicators

Phase139 extends the Phase138 neighbor indicator with each neighboring visible group's command count. The palette header and debug diagnostics now use `neighbors:name(size)/name(size)`, for example `neighbors:session(2)/bulk(3)`.

The shared neighbor helper now returns the complete `TuiLiveSessionCommandGroup` descriptors instead of group-name strings. Renderer and debug diagnostics therefore reuse the same group key and Phase136 size data without recounting commands.

## Implementation status

Implemented in this phase:

- Updated `liveSessionCommandGroupNeighbors(...)` to return group descriptors.
- Reused descriptor `key` and `size` in renderer diagnostics.
- Reused identical descriptor data in debug diagnostics.
- Added header `neighbors:name(size)/name(size)` formatting.
- Kept unavailable neighbors represented by `-`.
- Kept single-group and empty scopes at `neighbors:-/-`.
- Preserved Phase138 wrap-aware boundary selection.
- Updated help text to document neighbor size syntax.
- Added focused first/middle/last, wrapped boundary, single-group, empty-scope, renderer, debug, and help coverage.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Show the number of commands available in previous/next visible groups.
- Reuse shared neighbor descriptors rather than performing presentation-layer counts.
- Preserve wrapping and scoped ordering semantics from Phase138.
- Keep absent-neighbor output compact.

## Non-goals

- Neighbor group first-command key indicators are added separately in Phase140.
- No neighbor preview rows or direct execution.
- No custom grouping or group graph.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Indicator behavior

- First group, wrap off: `neighbors:-/session(2)`.
- Middle group: `neighbors:session(2)/bulk(3)`.
- Last group, wrap off: `neighbors:view(3)/-`.
- Last group, wrap on: `neighbors:view(3)/favorite(1)`.
- First group, wrap on: `neighbors:bulk(3)/session(2)`.
- Single group or empty scope: `neighbors:-/-`.

## Acceptance criteria

- Neighbor helper returns full shared group descriptors.
- Renderer and debug derive names and sizes from those descriptors.
- Sizes reflect current visible ordering and scope.
- Wrapping changes neighbor targets without changing their size semantics.
- Missing, single-group, and empty-scope neighbors remain stable.
- Help text documents the size suffix.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
