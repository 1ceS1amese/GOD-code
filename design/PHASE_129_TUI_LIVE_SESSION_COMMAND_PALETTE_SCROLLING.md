# Phase 129: TUI live session command palette scrolling

Phase129 adds command-aware scrolling to the `god-code tui` live session command palette. Up/Down selection now drives a renderer window that keeps the selected command visible, while PageUp/PageDown moves the selection and explicit scroll anchor by five visible commands.

This phase renders commands as grouped blocks rather than slicing one flat row list. Summary rows continue to use the Phase126-Phase128 budget pipeline, and the remaining rows form the command viewport. A group heading is regenerated for the first command in every viewport so scrolling never removes the selected command's category context.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandScrollOffset` to `TuiState`, defaulting to `0`.
- Added `scroll_live_session_command_palette` with direction and optional amount.
- Added palette-specific PageUp/PageDown input mapping with an amount of five commands.
- The scroll action is ignored while the command palette is closed.
- Opening the palette resets the explicit scroll anchor.
- Search, search backspace, search clear, category changes, and command sort changes reset the anchor.
- Up/Down selection keeps an earlier selected command from remaining above the explicit anchor.
- Renderer command blocks retain group identity, heading text, command row, usage count, and selected state.
- Renderer derives an effective start from the explicit anchor and advances it until the selected command fits in the available rows.
- The first visible command always receives its group heading, including when scrolling begins in the middle of a category.
- Header diagnostics expose the selected visible-command position as `command:N/total`.
- Debug diagnostics expose the explicit `scroll=N` anchor.
- Focused selection-following, PageUp/PageDown, group-heading, closed no-op, reset, input, header, help, and debug tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Keep the selected command visible when the palette contains more rows than the viewport.
- Support fast keyboard paging without losing command selection.
- Preserve category context at every scroll position.
- Keep summary allocation and command scrolling as separate renderer stages.

## Non-goals

- No mouse wheel handling.
- No horizontal scrolling.
- No configurable page size in Phase129.
- No explicit above/below scroll-window indicators in Phase129; Phase130 adds compact header-derived markers.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Scrolling behavior

- Up/Down changes selection by one visible command.
- PageUp/PageDown changes selection by five visible commands and sets the explicit anchor to the destination.
- Selection and paging clamp at the first and last visible command.
- Renderer starts from the explicit anchor unless the selected command is above it.
- If the selected command does not fit, renderer advances the effective start until it becomes visible.
- Group headings consume viewport rows and are included in fit calculations.
- Search/category/sort changes select the first resulting command and reset the anchor to zero.

The explicit state anchor is intentionally independent from the renderer's effective start. This keeps state deterministic without storing terminal dimensions in the reducer.

## Acceptance criteria

- PageUp/PageDown map to palette scrolling only while the live command palette is open.
- Other panes retain their existing PageUp/PageDown scrolling actions.
- The scroll action is ignored while the palette is closed.
- Selection and page movement clamp to visible command bounds.
- A selected command beyond the initial viewport becomes visible.
- The selected command's group heading is visible after automatic following and explicit paging.
- Opening and scope-changing actions reset the explicit anchor.
- Header, help, renderer, and debug diagnostics expose or consume scrolling state.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
