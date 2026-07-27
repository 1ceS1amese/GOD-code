# Phase 193: TUI deepest bucket label visibility threshold distance indicators

Phase193 shows how many additional columns the deepest adaptive bucket label needs before becoming visible.

## Implementation status

- Added a pure threshold-distance helper for the deepest visibility profile.
- Changed width-119 output to `visibility_bucket_labels_labels:adaptive>hidden+1[120]@(`.
- Preserved width-120 output as `visibility_bucket_labels_labels:adaptive>shown[120]@(`.
- Kept distance absent for explicit profiles and at or above the threshold.
- Updated helper, Help, Debug, and exact boundary tests.
- Preserved profile cycle, effective visibility, and persistence.

## Distance behavior

- Adaptive width 80 returns 40.
- Adaptive width 119 returns 1.
- Adaptive width 120 and above returns no distance.
- Explicit profiles return no distance.

## Non-goals

- No current-width value in this phase.
- No new state, shortcut, action, or persisted preference.
- No protocol, provider, MCP, plugin, or tool boundary change.

## Acceptance criteria

- Distance equals `120 - maxWidth` below the threshold.
- Help and Debug render the same suffix.
- TypeScript typecheck and the complete test suite pass.
