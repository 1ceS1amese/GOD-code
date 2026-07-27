# Phase 125: TUI live session command usage ranking line-count controls

Phase125 adds explicit line-count controls for the `god-code tui` live session command usage ranking multi-line layout. Users can press `]` while the command palette is open to switch the multi layout between a two-line and three-line maximum.

This phase extends Phase124 multi-line packing. Single layout remains fixed at one line, while the selected multi-line limit is retained for the next time multi layout is used. The phase does not change usage counts, ranking order, configured Top-N, visibility, history, sorting, or command execution, and it does not modify any protocol boundary.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionCommandUsageRankingLineLimit` with supported values `2 | 3`.
- Added `liveSessionCommandUsageRankingLineLimit` to `TuiState`, defaulting to `2`.
- Added `cycle_live_session_command_usage_ranking_line_limit` to the reducer.
- Added `]` as the palette-local ranking line-count shortcut.
- The action is ignored while the palette is closed.
- Multi line count cycles deterministically through `2 -> 3 -> 2`.
- The selected line count persists across palette close and reopen.
- Single layout continues to pass a one-line limit regardless of the stored multi line count.
- Header and debug state expose values such as `ranking:on/5/multi/3`.
- Focused input, two-line, three-line, overflow-count, and persistence tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Let users expose more ranking entries on narrow terminals when vertical space is available.
- Keep supported line counts bounded.
- Preserve single-line behavior independently of the stored multi limit.
- Keep overflow counts accurate for each line count.

## Non-goals

- No arbitrary numeric line count.
- No automatic stored line-count mutation based on available rows; Phase126 adds render-time row budgeting without changing this state.
- No more than three ranking rows in Phase125.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Line-count behavior

Current behavior:

- The stored multi-line limit starts at two lines.
- `]` cycles two lines to three lines and three lines back to two lines.
- The action only works while the command palette is open.
- The line count persists across palette close and reopen.
- In single layout, ranking rendering remains one line.
- In multi layout, the configured two- or three-line value becomes the packing limit.

## Acceptance criteria

- `]` maps to the line-count action while the palette is open.
- The action is ignored while the palette is closed.
- Only `2` and `3` are representable as multi-line limits.
- Cycle order is deterministic.
- Three-line mode shows more ranking entries than two-line mode on the same narrow terminal when possible.
- Overflow counts remain accurate.
- Line count persists across palette close and reopen.
- Header, help, renderer, and debug diagnostics expose or consume the current line count.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
