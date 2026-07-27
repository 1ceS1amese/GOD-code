# Phase 181: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket labels

Phase181 adds human-readable `low/mid/high` labels to the nested visibility width percentage buckets.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(...)`.
- Delegated label mapping to the existing legend width percentage bucket label helper.
- Changed width-119 output to `bucket_labels:adaptive>hidden+1[119/120=99%H(high)]@*`.
- Changed width-120 output to `bucket_labels:adaptive>shown[120/120=100%H(high)]@*`.
- Preserved exact width, clamped percentage, bucket, threshold distance, and effective visibility.
- Preserved explicit shown/hidden indicators without adaptive details.
- Updated helper, help, and debug exact assertions.

## Goals

- Explain `L/M/H` directly inside the nested visibility indicator.
- Keep nested visibility and legend bucket-label semantics identical.
- Reuse existing mappings instead of duplicating terminology.
- Preserve deterministic help and debug output.

## Non-goals

- No nested bucket-label visibility control in this phase.
- No bucket-specific color or styling.
- No separate bucket terminology.
- No new state, shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Label behavior

- `L` renders as `L(low)`.
- `M` renders as `M(mid)`.
- `H` renders as `H(high)`.
- Width 119 reports `[119/120=99%H(high)]`.
- Width 120 reports `[120/120=100%H(high)]`.
- Explicit shown/hidden profiles omit adaptive bucket labels.

## Acceptance criteria

- The label helper delegates to the shared legend bucket-label helper.
- Low, middle, and high representative widths return `low`, `mid`, and `high`.
- Help and debug render matching bucket labels.
- Width, percentage, bucket, distance, effective visibility, cycle, input, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
