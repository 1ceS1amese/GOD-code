# Phase 130: TUI live session command palette scroll position indicators

Phase130 adds compact scroll position indicators to the `god-code tui` live session command palette. The header now exposes the actual Phase129 renderer window as a one-based command range and uses `<` / `>` markers to show whether commands remain hidden above or below the viewport.

The indicators are derived from renderer output rather than stored in `TuiState`. This keeps terminal dimensions and group-heading row costs out of the reducer while accurately describing the effective command window after summary allocation and selected-command following.

## Implementation status

Implemented in this phase:

- Changed the command-window renderer to return visible rows plus first and last visible command positions.
- Added `formatLiveSessionCommandScrollIndicator(...)`.
- Added `scroll:start-end/total` for a complete visible range.
- Added a leading `<` when commands remain above the window.
- Added a trailing `>` when commands remain below the window.
- Added both markers for a middle window.
- Added `scroll:0-0/0` for an empty command result.
- Moved `command:N/total` and the scroll indicator to the beginning of the palette header so they survive narrow-width truncation.
- Kept indicators on the existing header row, consuming no command or summary rows.
- Updated help text to document `<above` and `>below` semantics.
- Focused initial-window, middle-window, final-window, complete-window, narrow-width, help, and existing scrolling tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Make hidden commands above and below the current viewport discoverable.
- Report the renderer's actual grouped-command window rather than only the explicit state anchor.
- Preserve narrow-terminal visibility for the most important palette diagnostics.
- Avoid consuming content rows for scroll metadata.

## Non-goals

- No new scrolling state.
- No scrollbar glyph or mouse interaction.
- No percentage-based position display.
- No configurable PageUp/PageDown amount in Phase130; Phase131 adds bounded 3/5/7 controls.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Indicator format

Examples for nine visible commands:

```text
scroll:1-3/9>    commands remain below
scroll:<3-4/9>   commands remain above and below
scroll:<9-9/9    commands remain above
scroll:1-9/9     complete command set is visible
scroll:0-0/0     no commands match
```

The range counts commands, not rendered rows. Group headings are not included in the numerator or total, but their row cost influences which commands fit and therefore changes the derived range.

## Acceptance criteria

- Header reports the first and last actually rendered command positions.
- Range values are one-based and total uses the current visible command count.
- `<` appears only when commands exist above the range.
- `>` appears only when commands exist below the range.
- A middle range shows both markers.
- A complete range shows neither marker.
- Empty search results show `scroll:0-0/0`.
- Indicators remain visible on the focused narrow-layout regression dimensions.
- Help text documents marker meaning.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
