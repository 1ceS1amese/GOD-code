# Phase 204: TUI deepest bucket label visibility width percentage buckets

Phase204 adds the shared `L/M/H` progress bucket to the deepest adaptive bucket-label visibility width percentage.

## Implementation status

- Added and connected the current-level deepest percentage-bucket helper.
- Delegated bucket calculation to the shared legend width percentage bucket helper.
- Changed width-119 output to `visibility_bucket_labels_labels_labels:adaptive>hidden+1[119/120=99%H]@)`.
- Changed width-120 output to `visibility_bucket_labels_labels_labels:adaptive>shown[120/120=100%H]@)`.
- Preserved exact width, clamped percentage, distance, and effective visibility.
- Updated helper, Help, Debug, and exact tests.

## Bucket behavior

- Low percentages use `L`.
- Middle percentages use `M`.
- High percentages use `H`.
- Explicit profiles omit adaptive bucket details.

## Non-goals

- No human-readable bucket label in this phase.
- No new state, shortcut, action, or persisted preference.
- No protocol, provider, MCP, plugin, or tool boundary change.

## Acceptance criteria

- Bucket calculation delegates to the shared helper.
- Representative widths return `L`, `M`, and `H`.
- Help and Debug render identical bucket details.
- TypeScript typecheck and the complete test suite pass.
