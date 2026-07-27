# Phase 228: TUI deepest bucket label visibility width percentage buckets

Phase228 adds the shared `L/M/H` percentage bucket to the current-level deepest nested adaptive bucket-label visibility profile indicator.

## Implementation status

- Connected the existing current-level percentage-bucket helper to the deepest nested width formatter.
- Delegated bucket calculation to the shared legend width percentage bucket helper.
- Changed width-119 output to `visibility_bucket_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H]@?`.
- Changed width-120 output to `visibility_bucket_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H]@?`.
- Preserved exact width, clamped percentage, threshold distance, explicit profiles, and effective visibility.
- Added representative low, middle, high, threshold, and clamped-width tests.
- Updated Help, Debug, and exact boundary coverage.

## Bucket behavior

- Low percentages use `L`.
- Middle percentages use `M`.
- High percentages use `H`.
- Explicit profiles omit adaptive width details.

## Non-goals

- No human-readable bucket label in this phase.
- No new state, shortcut, action, or persisted preference.
- No protocol, provider, MCP, plugin, or tool boundary change.

## Acceptance criteria

- Bucket calculation delegates to the shared helper.
- Representative widths return `L`, `M`, and `H`.
- Help and Debug render identical bucket details.
- TypeScript typecheck and the complete test suite pass.
