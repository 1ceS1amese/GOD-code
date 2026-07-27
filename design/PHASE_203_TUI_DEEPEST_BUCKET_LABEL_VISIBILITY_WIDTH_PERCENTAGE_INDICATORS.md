# Phase 203: TUI deepest bucket label visibility width percentage indicators

Phase203 adds a normalized width percentage to the deepest adaptive bucket-label visibility indicator.

## Implementation status

- Reused the shared clamped width-percentage helper in the deepest width formatter.
- Changed width-119 output to `visibility_bucket_labels_labels_labels:adaptive>hidden+1[119/120=99%]@)`.
- Changed width-120 output to `visibility_bucket_labels_labels_labels:adaptive>shown[120/120=100%]@)`.
- Clamped widths above the threshold to 100 percent while preserving exact current width.
- Preserved distance, current/threshold values, and explicit profiles.
- Updated helper, Help, Debug, and exact boundary tests.

## Percentage behavior

- Width 119 reports `[119/120=99%]`.
- Width 120 reports `[120/120=100%]`.
- Width 180 reports `[180/120=100%]`.

## Non-goals

- No percentage bucket in this phase.
- No new state, shortcut, action, or persisted preference.
- No protocol, provider, MCP, plugin, or tool boundary change.

## Acceptance criteria

- Percentage calculation reuses the shared clamped helper.
- Help and Debug render identical percentage details.
- Existing distance and profile behavior remains unchanged.
- TypeScript typecheck and the complete test suite pass.
