# Phase 185: TUI innermost bucket label visibility threshold distance indicators

Phase185 shows how many additional columns the Phase183 innermost adaptive bucket label needs before becoming visible.

## Implementation status

- Added a pure threshold-distance helper for the innermost visibility profile.
- Changed width-119 output to `visibility_bucket_labels:adaptive>hidden+1[120]@&`.
- Preserved width-120 output as `visibility_bucket_labels:adaptive>shown[120]@&`.
- Kept distance absent for explicit profiles and at or above the threshold.
- Updated helper, Help, Debug, and exact boundary tests.
- Preserved profile cycle, effective visibility, and persistence behavior.

## Distance behavior

- Adaptive width 80 returns 40.
- Adaptive width 119 returns 1.
- Adaptive width 120 and above returns no distance.
- Explicit `shown` and `hidden` return no distance.

## Non-goals

- No current-width value in this phase.
- No new state, shortcut, action, or persisted preference.
- No protocol, provider, MCP, plugin, or tool boundary change.

## Acceptance criteria

- Distance equals `120 - maxWidth` below the threshold.
- Help and Debug render the same distance suffix.
- Existing profile behavior remains unchanged.
- TypeScript typecheck and the complete test suite pass.
