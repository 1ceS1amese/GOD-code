# Phase 133: TUI live session command palette selection wrapping controls

Phase133 adds optional Up/Down selection wrapping to the `god-code tui` live session command palette. The default remains bounded selection, while users can press `~` with the palette open to enable wrapping from the first visible command to the last and from the last back to the first.

Wrapping uses the current `visibleLiveSessionCommands(...)` scope, so search, category, and sort order determine both boundaries. A real boundary crossing synchronizes the Phase129 scroll anchor with the wrapped destination; ordinary adjacent movement continues to use the existing minimal anchor adjustment.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandSelectionWrap` to `TuiState`, defaulting to `false`.
- Added `toggle_live_session_command_selection_wrap` to the reducer.
- Added `~` as the palette-local wrapping shortcut.
- The toggle is ignored while the command palette is closed.
- Wrapping preference persists across palette close and reopen.
- Disabled mode preserves the existing clamped first/last behavior.
- Enabled mode uses modulo selection within the current visible command count.
- Up from the first visible command selects the last and sets the anchor to the last visible position.
- Down from the last visible command selects the first and sets the anchor to zero.
- Boundary detection is explicit and works for one-, two-, and multi-command scopes.
- Header diagnostics expose `wrap:on` / `wrap:off`.
- Debug diagnostics expose `wrap=on` / `wrap=off`.
- Help text documents `~ wrap`.
- Focused closed no-op, default clamp, full-scope bidirectional wrap, category-scope wrap, anchor, renderer, persistence, input, help, and debug tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Offer fast cyclic Up/Down navigation without changing the default bounded behavior.
- Keep wrapping scoped to the same visible command ordering used elsewhere.
- Synchronize the scroll anchor only on real boundary crossings.
- Preserve Home/End, paging, indicators, and command execution identity.

## Non-goals

- No PageUp/PageDown wrapping.
- No Home/End inversion or wrapping.
- No separate Up-wrap and Down-wrap switches.
- No group-level navigation in Phase133; Phase134 adds previous/next shared-group jumps.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Wrapping behavior

- `wrap:off`: Up at first and Down at last remain clamped.
- `wrap:on`: Up at first moves to last; Down at last moves to first.
- Movement inside the visible range is unchanged.
- Search/category/sort changes retain the configured wrap preference while resetting selection/anchor according to their existing behavior.
- Home/End remains explicit boundary navigation regardless of wrap mode.
- A one-command scope selects the same command in either direction.

## Acceptance criteria

- `~` maps to the wrapping toggle while the palette is open.
- The toggle is ignored while the palette is closed.
- Default mode remains bounded.
- Enabled mode wraps in both directions.
- Full and category-scoped visible sets use their own boundaries.
- Wrapped destination updates both selected command and scroll anchor.
- Preference persists across palette close and reopen.
- Header, help, reducer, renderer, and debug diagnostics expose or consume wrapping state.
- Phase130 scroll indicators reflect wrapped destinations.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
