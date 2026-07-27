# Phase 177: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility threshold distance indicators

Phase177 shows how many additional columns adaptive nested bucket labels need before becoming visible. The indicator follows the established `+N` distance convention.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityThresholdDistance(...)`.
- Changed width-119 output to `bucket_labels:adaptive>hidden+1[120]@*`.
- Preserved width-120 output as `bucket_labels:adaptive>shown[120]@*`.
- Kept distance absent for explicit profiles and at or above the threshold.
- Updated helper, help, and debug exact assertions.
- Preserved profile cycle, effective visibility, and close/reopen persistence.

## Goals

- Show the remaining width required for nested bucket labels to appear.
- Keep distance semantics aligned with the outer label and legend indicators.
- Derive distance from the shared 120-column threshold.
- Avoid duplicate state or threshold configuration.

## Non-goals

- No current width value in this phase.
- No width percentage or bucket in the nested visibility indicator.
- No separate nested-label threshold.
- No new state, shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Distance behavior

- Adaptive width 80 returns distance 40.
- Adaptive width 119 returns distance 1.
- Adaptive width 120 and above returns no distance.
- Explicit shown/hidden profiles return no distance.
- Only the hidden effective adaptive state renders `+N`.

## Acceptance criteria

- Distance equals `120 - maxWidth` below the threshold.
- Distance is null at and above the threshold.
- Distance is null for explicit profiles.
- Help and debug render matching distance suffixes.
- Existing effective visibility, cycle, input, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
