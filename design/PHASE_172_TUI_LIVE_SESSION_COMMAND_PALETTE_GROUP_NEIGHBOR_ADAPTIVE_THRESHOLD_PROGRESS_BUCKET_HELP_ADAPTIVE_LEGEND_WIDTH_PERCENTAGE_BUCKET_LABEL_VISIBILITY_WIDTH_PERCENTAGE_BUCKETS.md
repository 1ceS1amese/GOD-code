# Phase 172: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage buckets

Phase172 adds the shared `L/M/H` progress bucket to adaptive bucket-label visibility width percentages.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucket(...)`.
- Delegated bucket calculation to the existing legend width percentage bucket helper.
- Changed width-119 output to `labels:adaptive>hidden+1[119/120=99%H]@_`.
- Changed width-120 output to `labels:adaptive>shown[120/120=100%H]@_`.
- Preserved exact width, clamped percentage, threshold distance, and effective visibility.
- Preserved explicit shown/hidden indicators without adaptive details.
- Updated state helper, help, and debug exact assertions.

## Goals

- Add a compact qualitative width signal beside the numeric percentage.
- Keep label visibility and legend width bucket semantics identical.
- Reuse the existing progress bucket thresholds instead of duplicating them.
- Preserve deterministic help and debug output.

## Non-goals

- No human-readable bucket label in this phase.
- No bucket-specific color or styling.
- No separate label bucket thresholds.
- No new state, shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Bucket behavior

- Low percentages use `L`.
- Middle percentages use `M`.
- High percentages use `H`.
- Width 119 reports `[119/120=99%H]`.
- Width 120 reports `[120/120=100%H]`.
- Explicit shown/hidden profiles omit adaptive bucket details.

## Acceptance criteria

- The label bucket helper delegates to the shared legend percentage bucket helper.
- Low, middle, and high representative widths return `L`, `M`, and `H`.
- Help and debug render matching bucket indicators.
- Width, percentage, distance, effective visibility, cycle, input, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
