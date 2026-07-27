# Phase 170: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width indicators

Phase170 adds the current help content width beside the adaptive bucket-label visibility threshold. The label indicator now exposes the exact `current/threshold` values used by the visibility resolver.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthIndicator(...)`.
- Reused the shared 120-column threshold as the denominator.
- Changed width-119 output to `labels:adaptive>hidden+1[119/120]@_`.
- Changed width-120 output to `labels:adaptive>shown[120/120]@_`.
- Preserved the Phase169 `+N` distance below the threshold.
- Preserved explicit shown/hidden indicators without width details.
- Updated state helper, help, and debug exact assertions.

## Goals

- Show the exact width that drove adaptive label visibility resolution.
- Keep current width and threshold adjacent for direct comparison.
- Preserve the distance indicator as an immediate action-oriented value.
- Derive both width values from renderer input and the shared threshold constant.

## Non-goals

- No label visibility width percentage in this phase.
- No width history or resize trend.
- No separate or configurable label threshold.
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
- Both sides of the adaptive visibility boundary remain correct.
- Distance, effective visibility, cycle, input, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
