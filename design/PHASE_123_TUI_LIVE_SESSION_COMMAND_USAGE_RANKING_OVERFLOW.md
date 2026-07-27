# Phase 123: TUI live session command usage ranking overflow indicator

Phase123 adds an overflow indicator to the width-adaptive `god-code tui` live session command usage ranking summary. When Phase122 hides configured ranking entries to fit the available width, the summary appends `+N more` so users can see how many ranked commands are not currently displayed.

This phase changes only renderer formatting and fitting. It does not mutate ranking size, ranking visibility, usage counts, history, command sorting, or command execution. It also does not add JSON-RPC methods or change Python Engine, transcript, provider, MCP, plugin, permission, or host tool boundaries.

## Implementation status

Implemented in this phase:

- Extended width fitting to return both the visible ranking prefix and hidden entry count.
- Added the overflow format ` | +N more` when hidden entries remain.
- The overflow indicator participates in width fitting rather than being appended after fitting.
- The renderer may choose a shorter ranking prefix so the prefix and indicator both fit completely.
- Extremely narrow layouts prioritize an intact Top-1 when Top-1 plus the indicator cannot fit.
- Wide layouts with no hidden configured entries omit the indicator.
- Focused narrow, medium, and wide terminal tests cover `+4 more`, `+3 more`, and no-overflow behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Make adaptive ranking truncation explicit.
- Keep the summary within one rendered line.
- Preserve stable ranking order and the configured Top-N value.
- Avoid showing an overflow indicator when nothing is hidden.

## Non-goals

- No selectable or expandable overflow indicator.
- No multi-line ranking layout in Phase123; Phase124 adds an explicit two-line mode.
- No overflow state stored in `TuiState`.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Overflow behavior

For a configured Top-5 ranking:

- a narrow terminal may render Top-1 followed by `+4 more`;
- a medium terminal may render Top-2 followed by `+3 more`;
- a wide terminal renders all five entries with no overflow suffix.

The hidden count only covers entries inside the configured ranking limit. Commands outside the configured Top-N are not included in the overflow count.

## Acceptance criteria

- Width fitting returns the visible prefix and hidden configured-entry count.
- Hidden entries produce an accurate `+N more` suffix.
- The suffix itself is included in width calculations.
- Narrow and medium layouts render complete summaries with accurate counts.
- Wide layouts omit the suffix when all configured entries fit.
- Rendering does not mutate ranking configuration or usage state.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
