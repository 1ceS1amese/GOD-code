# Phase 178: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width indicators

Phase178 adds the current help content width beside the adaptive nested bucket-label visibility threshold.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthIndicator(...)`.
- Reused the shared 120-column threshold as the denominator.
- Changed width-119 output to `bucket_labels:adaptive>hidden+1[119/120]@*`.
- Changed width-120 output to `bucket_labels:adaptive>shown[120/120]@*`.
- Preserved the Phase177 `+N` distance below the threshold.
- Preserved explicit shown/hidden indicators without width details.
- Updated helper, help, and debug exact assertions.

## Goals

- Show the exact width that drove adaptive nested-label visibility.
- Keep current width and threshold adjacent for direct comparison.
- Preserve the distance indicator as an action-oriented value.
- Derive values from renderer input and shared constants.

## Non-goals

- No nested-label width percentage in this phase.
- No width history or resize trend.
- No configurable threshold.
- No new state, shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Width behavior

- Width 119 reports `[119/120]`, hidden, and distance `+1`.
- Width 120 reports `[120/120]`, shown, and no distance.
- Width values above 120 remain visible as `current/120`.
- Explicit shown/hidden profiles omit adaptive width details.

## Acceptance criteria

- Width helper returns exact current/threshold text.
- Help and debug render matching width indicators.
- Both sides of the adaptive boundary remain correct.
- Distance, effective visibility, cycle, input, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
