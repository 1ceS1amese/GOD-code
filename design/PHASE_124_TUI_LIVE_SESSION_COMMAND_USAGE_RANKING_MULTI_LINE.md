# Phase 124: TUI live session command usage ranking multi-line layout

Phase124 adds an explicit multi-line layout mode to the `god-code tui` live session command usage ranking summary. Users can press `=` while the command palette is open to switch between the existing single-line adaptive layout and a width-aware layout using up to two lines.

This phase extends Phase122 adaptive fitting and Phase123 overflow indication. It does not change usage counts, ranking order, configured ranking size, visibility, command sorting, history, or command execution. It also does not add JSON-RPC methods or change Python Engine, transcript, provider, MCP, plugin, permission, or host tool boundaries.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionCommandUsageRankingLayout` with `single` and `multi` modes.
- Added `liveSessionCommandUsageRankingLayout` to `TuiState`, defaulting to `single`.
- Added `toggle_live_session_command_usage_ranking_layout` to the reducer.
- Added `=` as the palette-local ranking layout shortcut.
- The layout action is ignored while the palette is closed.
- The selected layout persists across palette close and reopen.
- Palette headers and debug diagnostics expose layout through values such as `ranking:on/5/multi`.
- Multi mode packs ranking entries and the overflow token across at most two complete lines.
- Continuation lines omit the repeated `Usage ranking:` prefix.
- Focused input, narrow multi-line, medium full-ranking, overflow, and persistence tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Let users trade one additional palette row for more visible ranking entries.
- Preserve complete non-clipped tokens on each line.
- Keep overflow counts accurate when two lines are still insufficient.
- Preserve single-line mode as the default behavior.

## Non-goals

- No line-count control in Phase124; Phase125 adds bounded two-line / three-line controls.
- No automatic layout mode mutation based on terminal dimensions.
- No selectable continuation or overflow rows.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Layout behavior

Current behavior:

- `single` uses the Phase123 one-line fitting and overflow behavior.
- `multi` uses the same ranking tokens but allows at most two lines.
- The first line begins with `Usage ranking:`.
- The continuation line starts directly with the next ranking token.
- The `+N more` token is packed using the same width rules as ranking entries.
- If all configured entries fit across two lines, no overflow token is shown.

## Acceptance criteria

- `=` maps to the ranking layout action while the palette is open.
- The action is ignored while the palette is closed.
- Layout cycles deterministically between `single` and `multi`.
- Multi mode uses at most two ranking rows.
- Narrow multi mode shows more ranking entries than narrow single mode when width permits.
- Medium multi mode can show a complete configured ranking without overflow when it fits across two lines.
- Layout persists across palette close and reopen.
- Header, help, and debug diagnostics expose the current layout.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
