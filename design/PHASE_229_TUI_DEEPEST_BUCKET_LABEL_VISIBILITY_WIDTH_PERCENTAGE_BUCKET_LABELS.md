# Phase 229: TUI deepest bucket label visibility width percentage bucket labels

Phase229 adds human-readable `low/mid/high` labels to the current-level deepest nested adaptive width percentage buckets.

## Implementation status

- Connected the existing current-level percentage-bucket label helper to the deepest nested width formatter.
- Delegated label mapping to the shared legend width percentage bucket-label helper.
- Changed width-119 output to `visibility_bucket_labels_labels_labels_labels_labels_labels:adaptive>hidden+1[119/120=99%H(high)]@?`.
- Changed width-120 output to `visibility_bucket_labels_labels_labels_labels_labels_labels:adaptive>shown[120/120=100%H(high)]@?`.
- Preserved exact width, clamped percentage, bucket, threshold distance, explicit profiles, and effective visibility.
- Updated helper, Help, Debug, and exact boundary coverage.

## Label behavior

- `L` renders as `L(low)`.
- `M` renders as `M(mid)`.
- `H` renders as `H(high)`.
- Explicit profiles omit adaptive bucket details.

## Non-goals

- No independent current-level label visibility control in this phase.
- No new state, shortcut, action, or persisted preference.
- No protocol, provider, MCP, plugin, or tool boundary change.

## Acceptance criteria

- Label mapping delegates to the shared helper.
- Representative widths return `low`, `mid`, and `high`.
- Help and Debug render identical labels.
- TypeScript typecheck and the complete test suite pass.
