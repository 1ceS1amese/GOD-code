# Phase 141: TUI live session command palette group neighbor command-position indicators

Phase141 extends the Phase140 neighbor indicator with the first command's 1-based position in the current visible command list. The palette header and debug diagnostics now use `neighbors:name(size)@key#position/name(size)@key#position`, for example `neighbors:session(2)@2#2/bulk(3)@x#7`.

The position is derived directly from the shared group descriptor's zero-based `startPosition`. Search, category, favorite-first ordering, and usage sorting therefore remain authoritative without adding another position field.

## Implementation status

Implemented in this phase:

- Reused shared group `startPosition` as the neighbor jump destination.
- Converted positions to 1-based display values with `startPosition + 1`.
- Added `#position` to renderer neighbor diagnostics.
- Added identical `#position` output to debug diagnostics.
- Kept unavailable neighbors represented by `-`.
- Preserved Phase138 wrap-aware target semantics.
- Preserved Phase140 usage-sorted first-command key behavior.
- Updated help text to document `@key#position`.
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

- Show where previous/next group navigation lands in the visible command list.
- Reuse shared group boundaries as the position source.
- Keep positions aligned with scoped and sorted command ordering.
- Avoid redundant persistent or derived descriptor fields.

## Non-goals

- Neighbor group first-command ID indicators are added separately in Phase142.
- No total-command suffix on each neighbor position.
- No direct numeric jump command.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Indicator behavior

- First group, wrap off: `neighbors:-/session(2)@2#2`.
- Middle group: `neighbors:session(2)@2#2/bulk(3)@x#7`.
- Last group, wrap off: `neighbors:view(3)@4#4/-`.
- Last group, wrap on: `neighbors:view(3)@4#4/favorite(1)@1#1`.
- Usage-sorted view neighbor: `view(3)@5#4`.
- Single group or empty scope: `neighbors:-/-`.

## Acceptance criteria

- Neighbor position uses the shared group start position.
- Display positions are 1-based.
- Renderer and debug diagnostics expose identical positions.
- Catalog, usage-sorted, category, search, and favorite scopes remain authoritative.
- Wrapping changes the target descriptor and therefore its displayed position.
- Single-group, missing, and empty-scope output remains stable.
- Help text documents the `#position` suffix.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
