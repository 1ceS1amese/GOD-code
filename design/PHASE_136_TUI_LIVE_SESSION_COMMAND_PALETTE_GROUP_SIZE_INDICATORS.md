# Phase 136: TUI live session command palette group size indicators

Phase136 extends the Phase135 current-group indicator with the number of commands in that visible group. The palette header and debug diagnostics now use `group:N/total:name(size)`, for example `group:3/4:view(3)`.

The size is stored on the shared group descriptor returned by `liveSessionCommandGroups(...)`. Group navigation, rendering, and debug diagnostics therefore consume the same group boundary, start position, and size rather than recounting commands independently.

## Implementation status

Implemented in this phase:

- Extended each shared visible-group descriptor with `size`.
- Incremented group size while deriving contiguous groups in one pass.
- Added current-group size to the palette header.
- Added current-group size to debug diagnostics.
- Added empty-scope fallback `group:0/0:-(0)`.
- Kept search/category/sort/favorite scope authoritative for group size.
- Kept group navigation based on the same descriptors and start positions.
- Updated help text to document `group N/total:name(size)`.
- Added focused full-scope, category-scoped, search-scoped, empty-scope, compact-renderer, debug, and help coverage.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Show how many commands belong to the selected visible group.
- Keep group identity, start position, and size in one shared descriptor.
- Reflect scoped command lists without adding persistent state.
- Preserve compact header priority for command and group diagnostics.

## Non-goals

- Selected-command position within the current group is added separately in Phase137.
- No aggregate catalog category counts outside the visible scope.
- No custom grouping or reordering.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Indicator behavior

- Full scope example: `group:3/4:view(3)`.
- Favorite group example: `group:1/4:favorite(1)`.
- Search-scoped example: `group:1/1:bulk(1)`.
- Category-scoped example: `group:1/1:view(3)`.
- Empty visible scope: `group:0/0:-(0)`.
- Size counts commands in the contiguous current visible group only.

## Acceptance criteria

- Shared group descriptors contain key, start position, and size.
- Group size is derived in the same pass as group boundaries.
- Header and debug diagnostics expose identical current-group size semantics.
- Full, category, search, favorite, and empty scopes show correct sizes.
- Existing previous/next group navigation continues to use shared descriptors.
- Help text documents the size suffix.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
