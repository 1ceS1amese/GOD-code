# Phase 131: TUI live session command palette page-size controls

Phase131 adds configurable PageUp/PageDown movement sizes to the `god-code tui` live session command palette. Users can press `;` while the palette is open to cycle the paging step through three, five, and seven visible commands.

The page size is owned by `TuiState` and consumed by the reducer when a scroll action does not provide an explicit amount. The input layer therefore emits only direction for PageUp/PageDown and does not duplicate page-size state. Phase129 grouped-window fitting and Phase130 scroll indicators continue to describe the resulting renderer viewport.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionCommandPageSize` with supported values `3 | 5 | 7`.
- Added `liveSessionCommandPageSize` to `TuiState`, defaulting to `5`.
- Added `cycle_live_session_command_page_size` to the reducer.
- Added `;` as the palette-local page-size shortcut.
- The action is ignored while the command palette is closed.
- Page size cycles deterministically as `3 -> 5 -> 7 -> 3`; from the default this is `5 -> 7 -> 3 -> 5`.
- Page size persists across palette close and reopen.
- Palette PageUp/PageDown input now emits direction without a fixed amount.
- `scroll_live_session_command_palette` uses the current page size when no explicit amount is supplied.
- Explicit action amounts remain supported for focused/internal calls.
- Header diagnostics expose `page:3`, `page:5`, or `page:7`.
- Debug diagnostics expose `page=3`, `page=5`, or `page=7`.
- Help text documents the `; page size` shortcut.
- Focused closed no-op, default-five, seven-step, three-step, wraparound, paging, header, input, debug, help, and persistence tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Let users choose compact, default, or larger keyboard paging steps.
- Keep the reducer as the single owner of paging configuration.
- Preserve existing explicit-amount actions for deterministic internal use.
- Keep renderer window fitting independent from paging step size.

## Non-goals

- No arbitrary numeric page size.
- No terminal-height-derived page-size mutation.
- No separate PageUp and PageDown sizes.
- No Home/End command navigation in Phase131; Phase132 adds scoped boundary jumps.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Page-size behavior

- `3`: PageUp/PageDown moves three visible commands.
- `5`: PageUp/PageDown moves five visible commands and remains the default.
- `7`: PageUp/PageDown moves seven visible commands.
- Movement clamps to the first and last visible command.
- Changing page size does not change selection or scroll anchor until the next paging action.
- Search/category/sort scope changes retain the configured page size while resetting the command anchor as defined by Phase129.

## Acceptance criteria

- `;` maps to page-size cycling while the palette is open.
- The action is ignored while the palette is closed.
- Only `3`, `5`, and `7` are representable.
- Cycle order and wraparound are deterministic.
- Page size persists across palette close and reopen.
- PageUp/PageDown actions use current state when amount is omitted.
- Explicit amounts override the configured page size.
- Header, help, reducer, input, and debug diagnostics expose or consume page size.
- Phase129 selected-command following and Phase130 indicators remain correct.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
