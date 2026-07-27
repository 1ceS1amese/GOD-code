# Phase 127: TUI live session command summary priority controls

Phase127 adds explicit summary-priority controls to the `god-code tui` live session command palette. Users can press `[` while the palette is open to choose whether constrained vertical space is assigned to pinned/recent command history summaries first or to the usage ranking summary first.

This phase extends the Phase126 row-budget safeguard. The fixed reservation for a command group heading and at least one executable command remains unchanged. Priority only determines how the remaining optional summary rows are allocated, and it does not change command history, usage counts, ranking order, Top-N, layout, line limit, or protocol state.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionCommandSummaryPriority` with `history | ranking` values.
- Added `liveSessionCommandSummaryPriority` to `TuiState`, defaulting to `history`.
- Added `toggle_live_session_command_summary_priority` to the reducer.
- Added `[` as the palette-local summary-priority shortcut.
- The action is ignored while the command palette is closed.
- Priority persists across palette close and reopen.
- History-first mode preserves Phase126 behavior: pinned/recent summaries consume optional rows before ranking.
- Ranking-first mode renders ranking rows first and gives any remaining optional rows to pinned/recent summaries.
- Both modes preserve the two rows reserved for the first command group and executable command.
- Header and debug diagnostics expose `summary:history` / `summary:ranking` and `summary=history` / `summary=ranking`.
- Focused input, help, debug, row-pressure, command-visibility, and persistence tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Let users choose which summary family degrades last under row pressure.
- Preserve Phase126 executable-command safeguards in both priority modes.
- Keep allocation deterministic and local to the renderer.
- Preserve all command history and ranking source data while changing presentation priority.

## Non-goals

- No independent visibility switches for pinned or recent summaries.
- No multi-level or numeric summary weights.
- No mutation of ranking visibility, Top-N, layout, or line limit.
- No command palette summary visibility profiles in Phase127; Phase128 adds four fixed local profiles.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Priority behavior

The Phase126 optional summary row budget remains:

```text
summary rows = max(0, palette rows - header - 2 reserved command rows)
```

Allocation then follows the selected priority:

- `history`: render pinned and recent summaries first, then fit ranking into remaining rows;
- `ranking`: fit ranking first, then render pinned and recent summaries in remaining rows.

If ranking visibility is off or no usage data exists, ranking-first mode naturally gives the unused budget back to history summaries. Neither priority mode changes the configured state of the summaries it cannot display.

## Acceptance criteria

- `[` maps to the summary-priority action while the palette is open.
- The action is ignored while the palette is closed.
- Priority cycles deterministically between `history` and `ranking`.
- Priority persists across palette close and reopen.
- History-first mode preserves the Phase126 constrained-layout output.
- Ranking-first mode can replace a lower-priority recent summary with usage ranking output.
- Both modes retain a group heading and executable command under the five-row full-layout budget.
- Header, help, renderer, and debug diagnostics expose or consume the current priority.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
