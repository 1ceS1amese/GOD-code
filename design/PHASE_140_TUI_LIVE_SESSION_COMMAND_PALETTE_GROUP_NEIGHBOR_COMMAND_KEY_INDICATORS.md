# Phase 140: TUI live session command palette group neighbor command-key indicators

Phase140 extends the Phase139 neighbor indicator with the first command shortcut key in each neighboring visible group. The palette header and debug diagnostics now use `neighbors:name(size)@key/name(size)@key`, for example `neighbors:session(2)@2/bulk(3)@x`.

The shortcut key is stored on the shared group descriptor when the group is created from the current visible command ordering. Usage sorting can therefore change a neighbor group's displayed first key without introducing a separate lookup or stale catalog assumption.

## Implementation status

Implemented in this phase:

- Added `firstCommandKey` to `TuiLiveSessionCommandGroup`.
- Captured the group-start command key during one-pass group derivation.
- Added `@key` to renderer neighbor diagnostics.
- Added identical `@key` output to debug diagnostics.
- Kept unavailable neighbors represented by `-`.
- Preserved Phase138 wrap-aware neighbor targets.
- Reflected usage-sorted group starts in the displayed key.
- Updated help text to document `name(size)@key`.
- Added focused catalog, usage-sorted, first/middle/last, wrapped boundary, single-group, empty-scope, renderer, debug, and help coverage.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Show the command key selected by a previous/next group jump.
- Keep the key aligned with current visible group ordering.
- Reflect usage sorting and scoped command lists automatically.
- Reuse shared descriptors in renderer and debug diagnostics.

## Non-goals

- Neighbor group first-command visible-position indicators are added separately in Phase141.
- No direct execution of the displayed neighboring command.
- No custom shortcut assignment.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Indicator behavior

- First group, wrap off: `neighbors:-/session(2)@2`.
- Middle group: `neighbors:session(2)@2/bulk(3)@x`.
- Last group, wrap off: `neighbors:view(3)@4/-`.
- Last group, wrap on: `neighbors:view(3)@4/favorite(1)@1`.
- Usage-sorted view neighbor: `view(3)@5` when `filter` is ranked first.
- Single group or empty scope: `neighbors:-/-`.

## Acceptance criteria

- Shared group descriptors contain the first visible command key.
- The key is captured from the actual group-start entry.
- Renderer and debug diagnostics expose identical keys.
- Catalog and usage-sorted ordering produce the correct first key.
- Wrapping changes neighbor targets while preserving target key semantics.
- Single-group, missing, and empty-scope output remains stable.
- Help text documents the `@key` suffix.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
