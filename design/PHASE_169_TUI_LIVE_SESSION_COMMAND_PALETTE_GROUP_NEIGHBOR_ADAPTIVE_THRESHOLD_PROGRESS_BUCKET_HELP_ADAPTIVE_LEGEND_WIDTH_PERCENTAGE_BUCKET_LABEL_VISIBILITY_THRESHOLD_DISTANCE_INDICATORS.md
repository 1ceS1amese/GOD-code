# Phase 169: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility threshold distance indicators

Phase169 shows how many additional columns adaptive bucket labels need before becoming visible. The indicator follows the established `+N` distance convention.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityThresholdDistance(...)`.
- Reused the shared 120-column threshold.
- Added `+N` only while adaptive label visibility resolves to hidden.
- Changed width-119 output to `labels:adaptive>hidden+1[120]@_`.
- Kept width-120 output as `labels:adaptive>shown[120]@_`.
- Preserved explicit shown/hidden indicators without distance suffixes.
- Updated help and debug boundary assertions.

## Goals

- Explain how close adaptive labels are to becoming visible.
- Reuse the same positive-distance semantics as Phase147 and Phase161.
- Avoid distance text after the threshold is satisfied.
- Keep distance derived from width rather than stored in state.

## Non-goals

- No surplus distance above the threshold.
- No current width value in the label indicator.
- No separate label threshold.
- No new state, shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Distance behavior

- Adaptive width 80 reports `hidden+40[120]`.
- Adaptive width 119 reports `hidden+1[120]`.
- Adaptive width 120 reports `shown[120]` without distance.
- Explicit shown/hidden profiles never report adaptive distance.

## Acceptance criteria

- Distance equals `120 - maxWidth` below the threshold.
- Distance is null at and above the threshold.
- Distance is null for explicit profiles.
- Help and debug render matching distance suffixes.
- Existing effective visibility, cycle, input, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
