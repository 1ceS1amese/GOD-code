# Phase 135: TUI live session command palette group position indicators

Phase135 adds compact current-group position indicators to the `god-code tui` live session command palette. The palette header now shows `group:N/total:name`, and debug diagnostics expose the equivalent `group=N/total:name` value.

The indicator is derived from the same current visible command ordering and shared group identity used by Phase134 navigation. Search, category, favorite-first ordering, and usage sorting therefore affect the displayed group count without creating a second grouping model.

## Implementation status

Implemented in this phase:

- Added exported `liveSessionCommandGroups(...)` to derive contiguous visible groups and their first positions.
- Updated Phase134 previous/next group navigation to consume the shared group list.
- Added palette-header `group:N/total:name` diagnostics.
- Added debug-line `group=N/total:name` diagnostics.
- Added empty-scope fallback `group:0/0:-`.
- Kept the selected group derived from the selected visible command position.
- Kept favorite groups named `favorite`; normal groups retain their command category name.
- Help text documents `group N/total:name`.
- Focused full-scope, category-scoped, group-navigation, compact-renderer, debug, and help tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Show the selected command's current rendered group and total visible group count.
- Keep navigation, rendering, and diagnostics on one shared visible-group derivation.
- Preserve compact visibility by placing group position immediately after command position.
- Reflect search/category/sort/favorite scope changes automatically.

## Non-goals

- Per-group command-count indicators are added separately in Phase136.
- No custom group names or command reordering.
- No independent group-selection state.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Indicator behavior

- Full visible scope example: `group:3/4:view`.
- Debug equivalent: `group=3/4:view`.
- Category-only example: `group:1/1:view`.
- Empty visible scope: `group:0/0:-`.
- Group totals count contiguous groups in current visible ordering, not all catalog categories.
- The indicator consumes the same group list used by previous/next group navigation.

## Acceptance criteria

- State exports one shared visible-group derivation.
- Phase134 navigation uses that derivation rather than rebuilding group starts locally.
- Header and debug diagnostics show selected group index, total group count, and group name.
- Search/category/sort/favorite ordering changes are reflected in the indicator.
- Empty visible scopes render a stable zero-state indicator.
- Compact layouts prioritize command and group position before lower-priority diagnostics.
- Help text documents the indicator shape.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
