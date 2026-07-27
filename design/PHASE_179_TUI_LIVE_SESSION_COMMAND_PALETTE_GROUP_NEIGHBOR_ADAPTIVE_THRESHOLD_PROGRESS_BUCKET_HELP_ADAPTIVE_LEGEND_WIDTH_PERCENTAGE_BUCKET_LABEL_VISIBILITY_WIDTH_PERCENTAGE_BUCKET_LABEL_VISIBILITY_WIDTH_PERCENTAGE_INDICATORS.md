# Phase 179: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage indicators

Phase179 adds a normalized width percentage to adaptive nested bucket-label visibility indicators.

## Implementation status

Implemented in this phase:

- Reused `liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentage(...)` in the nested visibility width helper.
- Changed width-119 output to `bucket_labels:adaptive>hidden+1[119/120=99%]@*`.
- Changed width-120 output to `bucket_labels:adaptive>shown[120/120=100%]@*`.
- Clamped widths above the threshold to 100 percent while preserving exact current width.
- Preserved distance, current/threshold values, and explicit profiles.
- Updated helper, help, and debug exact assertions.

## Goals

- Make adaptive nested-label width easy to compare across terminal sizes.
- Reuse the existing percentage algorithm instead of duplicating normalization logic.
- Keep exact width, threshold, percentage, and distance in one compact indicator.
- Preserve deterministic help and debug output.

## Non-goals

- No percentage bucket in this phase.
- No percentage bucket label.
- No width history or resize trend.
- No new state, shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Percentage behavior

- Width 119 reports `[119/120=99%]`, hidden, and distance `+1`.
- Width 120 reports `[120/120=100%]`, shown, and no distance.
- Width 180 reports `[180/120=100%]`; percentage remains clamped.
- Explicit shown/hidden profiles omit adaptive width details.

## Acceptance criteria

- The nested visibility width helper reuses the shared percentage helper.
- Percentages are floored and clamped to the 0-100 range.
- Help and debug render matching percentage indicators.
- Both sides of the adaptive boundary remain correct.
- Distance, effective visibility, cycle, input, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
