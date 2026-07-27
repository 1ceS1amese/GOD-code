# Phase 205: TUI deepest bucket label visibility width percentage bucket labels

Phase205 adds human-readable `low/mid/high` labels to the deepest adaptive width percentage buckets.

## Implementation status

- Added and connected the current-level deepest percentage-bucket label helper.
- Delegated label mapping to the shared legend width percentage bucket-label helper.
- Changed width-119 output to `visibility_bucket_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@)`.
- Changed width-120 output to `visibility_bucket_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@)`.
- Preserved exact width, percentage, bucket, distance, and effective visibility.
- Updated helper, Help, Debug, and exact tests.

## Label behavior

- `L` renders as `L(low)`.
- `M` renders as `M(mid)`.
- `H` renders as `H(high)`.
- Explicit profiles omit adaptive bucket details.

## Non-goals

- No independent label visibility control in this phase.
- No new state, shortcut, action, or persisted preference.
- No protocol, provider, MCP, plugin, or tool boundary change.

## Acceptance criteria

- Label mapping delegates to the shared helper.
- Representative widths return `low`, `mid`, and `high`.
- Help and Debug render identical labels.
- TypeScript typecheck and the complete test suite pass.
