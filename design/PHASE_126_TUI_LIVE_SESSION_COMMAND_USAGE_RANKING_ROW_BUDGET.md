# Phase 126: TUI live session command usage ranking row-budget safeguards

Phase126 adds render-time vertical row-budget safeguards to the `god-code tui` live session command palette. Ranking summaries now use only the rows left after the palette header, pinned/recent summaries, and a fixed two-row reservation for the first command group heading and at least one executable command.

This phase extends the Phase124/Phase125 multi-line renderer without changing the stored ranking layout or line limit. A configured three-line ranking may therefore render as two lines, one line, or zero lines when the palette has less vertical space. The configured state remains unchanged and becomes fully visible again when more rows are available.

## Implementation status

Implemented in this phase:

- Added a palette-local ranking row-budget calculation.
- Reserved two command rows whenever matching commands exist: one group heading and one executable command row.
- Counted the palette header and visible pinned/recent summaries before assigning ranking rows.
- Limited the effective ranking line count to the smaller of the configured layout limit and the available row budget.
- Suppressed the ranking summary when pinned/recent summaries consume all optional rows.
- Preserved ranking visibility, Top-N, layout, line-limit, usage counts, sorting, and history state.
- Added compact-layout coverage with sufficient multi-line budget.
- Added constrained full-layout coverage proving that group and command rows remain visible under pinned/recent pressure.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Prevent ranking summaries from hiding every executable palette command.
- Keep row allocation deterministic in full and compact layouts.
- Degrade ranking detail before removing command interaction rows.
- Preserve user configuration while adapting render output.

## Non-goals

- No mutation of the configured ranking visibility, Top-N, layout, or line limit.
- No scrolling or pagination for palette summaries.
- No user-configurable row reservation.
- No ranking-summary priority controls in Phase126; Phase127 adds a local history/ranking allocation preference.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Row-budget behavior

For a palette with matching commands, ranking rows are calculated as:

```text
ranking rows = max(0, palette rows - header - pinned/recent summaries - 2 reserved command rows)
```

The renderer then caps that value by the configured layout limit:

- single layout: at most one ranking row;
- multi layout: at most the configured two or three rows;
- constrained layout: fewer or zero ranking rows when required to preserve commands.

The two reserved command rows contain the first visible group heading and the first visible executable command. Existing final slicing remains the outer safety boundary for terminals too small to display even those minimum rows.

## Acceptance criteria

- Ranking output never consumes the two reserved command rows when the palette has enough rows for them.
- Pinned and recent summaries are counted before ranking rows are assigned.
- Multi-line ranking still expands to its configured limit when vertical space is available.
- Constrained layouts reduce or suppress ranking rows without mutating state.
- At least one group heading and one executable command remain visible in the five-row full-layout live pane under pinned/recent pressure.
- Width fitting and `+N more` counts remain correct within the effective row budget.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
