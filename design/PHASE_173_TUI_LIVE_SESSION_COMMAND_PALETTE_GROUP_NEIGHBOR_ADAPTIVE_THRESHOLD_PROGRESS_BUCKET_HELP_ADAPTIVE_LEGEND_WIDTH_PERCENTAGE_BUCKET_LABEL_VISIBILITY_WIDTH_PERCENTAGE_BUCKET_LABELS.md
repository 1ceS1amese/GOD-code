# Phase 173: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket labels

Phase173 adds human-readable `low/mid/high` labels to the label visibility width percentage buckets.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabel(...)`.
- Delegated label mapping to the existing legend width percentage bucket label helper.
- Changed width-119 output to `labels:adaptive>hidden+1[119/120=99%H(high)]@_`.
- Changed width-120 output to `labels:adaptive>shown[120/120=100%H(high)]@_`.
- Preserved exact width, clamped percentage, bucket, threshold distance, and effective visibility.
- Preserved explicit shown/hidden indicators without adaptive details.
- Narrowed legacy legend-label absence assertions so the independent label visibility indicator can expose its own bucket label.

## Goals

- Explain `L/M/H` without requiring the global legend text.
- Keep label visibility and legend bucket-label semantics identical.
- Reuse existing mappings instead of duplicating terminology.
- Preserve deterministic help and debug output.

## Non-goals

- No bucket-label visibility control in this phase.
- No bucket-specific color or styling.
- No separate label bucket terminology.
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
- Legend-label visibility tests remain scoped to the legend indicator.
- Width, percentage, bucket, distance, effective visibility, cycle, input, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
