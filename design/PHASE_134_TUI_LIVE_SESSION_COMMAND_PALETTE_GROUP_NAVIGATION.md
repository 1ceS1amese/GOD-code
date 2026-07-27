# Phase 134: TUI live session command palette group navigation

Phase134 adds previous/next group navigation to the `god-code tui` live session command palette. Users can press `{` or `}` to jump directly to the first command of the previous or next rendered command group.

Group boundaries use the same favorite-first/category grouping as the renderer. A shared `liveSessionCommandGroupKey(...)` helper now defines that boundary for state navigation and rendering, preventing drift between reducer behavior and visible headings. Phase133 wrapping preference also applies at the first and last groups.

## Implementation status

Implemented in this phase:

- Added exported `liveSessionCommandGroupKey(...)` as the shared favorite/category group identity.
- Updated renderer command blocks to use the shared group key.
- Added `jump_live_session_command_group` with `-1 | 1` direction.
- Added `{` for previous group and `}` for next group.
- The action is ignored while the command palette is closed.
- Empty visible scopes remain unchanged.
- Group starts are derived from the current visible command ordering.
- A jump selects the target group's first command and synchronizes the visible-command scroll anchor.
- With wrapping disabled, previous at the first group and next at the last group are no-op boundaries.
- With wrapping enabled, previous at the first group jumps to the last group start and next at the last group jumps to the first.
- A single-group visible scope remains unchanged in either direction.
- Search/category/sort scope and favorite grouping remain authoritative.
- Help text documents `{ / } groups`.
- Focused closed no-op, forward/backward, current-group normalization, first/last clamp, wrapped group boundaries, single-group category, anchor, renderer, input, and help tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Provide fast navigation across favorite/session/view/bulk group boundaries.
- Keep reducer and renderer group identity identical.
- Reuse the existing wrapping preference for group boundaries.
- Select stable group starts without changing command execution identity.

## Non-goals

- Group position indicators are added separately in Phase135.
- No command reordering or custom groups.
- No independent group-wrapping preference.
- No direct shortcut for a named category.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Group navigation behavior

- Groups are contiguous runs of the shared group key in the current visible ordering.
- Favorite commands form the `favorite` group before normal categories when present.
- `{` selects the previous group start.
- `}` selects the next group start.
- When selected inside a group, navigation is based on that current group's index.
- Boundary navigation clamps when `wrap:off` and cycles when `wrap:on`.
- The destination anchor equals the destination group's first visible command position.

## Acceptance criteria

- `{` and `}` map to previous/next group actions while the palette is open.
- Both actions are no-op while the palette is closed or visible scope is empty.
- Reducer and renderer consume the same shared group-key helper.
- Forward and backward jumps select target group starts.
- Disabled wrapping clamps at first/last groups without moving selection.
- Enabled wrapping cycles first/last groups.
- A single-group category is stable in both directions.
- Destination group heading and selected command remain visible.
- Help text documents group navigation.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
