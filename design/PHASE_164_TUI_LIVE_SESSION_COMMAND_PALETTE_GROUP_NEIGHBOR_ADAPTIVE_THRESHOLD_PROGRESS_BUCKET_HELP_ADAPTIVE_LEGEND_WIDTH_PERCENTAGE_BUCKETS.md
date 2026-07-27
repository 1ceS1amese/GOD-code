# Phase 164: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage buckets

Phase164 adds a single-character `L`, `M`, or `H` bucket to the Phase163 adaptive width percentage. The bucket reuses the established Phase150 percentage boundaries.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucket(...)`.
- Reused `liveSessionCommandNeighborAdaptiveThresholdProgressBucket(...)`.
- Mapped percentage `0..32` to `L`, `33..65` to `M`, and `66..100` to `H`.
- Changed width-119 output to `legend:adaptive>compact+1[119/120=99%H]@\``.
- Changed width-120 output to `legend:adaptive>full[120/120=100%H]@\``.
- Preserved raw width, percentage, distance, effective profile, and shortcut data.
- Updated help and debug exact assertions.

## Goals

- Add a compact semantic band beside the numeric percentage.
- Reuse existing bucket boundaries rather than introducing competing definitions.
- Keep the indicator width increase to one character.
- Preserve exact numeric diagnostics for detailed inspection.

## Non-goals

- No low/mid/high text label in this phase.
- No color styling or progress bar.
- No configurable bucket boundaries.
- No new state, shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Bucket behavior

- Width 0 maps to percentage 0 and bucket `L`.
- Width 40 maps to percentage 33 and bucket `M`.
- Width 80 maps to percentage 66 and bucket `H`.
- Widths at or above 120 remain percentage 100 and bucket `H`.
- Explicit compact/full profiles omit adaptive bucket details.

## Acceptance criteria

- Bucket helper uses the shared Phase150 mapper.
- L/M/H boundary representative widths are tested.
- Help and debug render matching bucket characters.
- Existing numeric and profile semantics remain unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
