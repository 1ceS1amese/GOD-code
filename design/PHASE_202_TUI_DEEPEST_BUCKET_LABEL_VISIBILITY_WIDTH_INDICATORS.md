# Phase 202: TUI deepest bucket label visibility width indicators

Phase202 adds the current content width beside the deepest adaptive bucket-label visibility threshold.

## Implementation status

- Added a deepest width helper using the shared 120-column threshold.
- Changed width-119 output to `visibility_bucket_labels_labels_labels:adaptive>hidden+1[119/120]@)`.
- Changed width-120 output to `visibility_bucket_labels_labels_labels:adaptive>shown[120/120]@)`.
- Preserved the Phase201 `+N` distance below the threshold.
- Preserved explicit profile indicators without adaptive width details.
- Updated helper, Help, Debug, and exact tests.

## Width behavior

- Width 119 reports `[119/120]`, hidden, and distance `+1`.
- Width 120 reports `[120/120]`, shown, and no distance.
- Widths above 120 remain visible as `current/120`.

## Non-goals

- No width percentage in this phase.
- No new state, shortcut, action, or persisted preference.
- No protocol, provider, MCP, plugin, or tool boundary change.

## Acceptance criteria

- Width helper returns exact current/threshold text.
- Help and Debug render matching width indicators.
- Existing distance and profile behavior remains unchanged.
- TypeScript typecheck and the complete test suite pass.
