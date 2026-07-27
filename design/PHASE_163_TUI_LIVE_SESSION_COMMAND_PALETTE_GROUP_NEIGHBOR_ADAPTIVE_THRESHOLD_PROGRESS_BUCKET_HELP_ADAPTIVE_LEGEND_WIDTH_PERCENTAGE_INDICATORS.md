# Phase 163: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage indicators

Phase163 adds a normalized completion percentage to the Phase162 current/threshold width indicator. The percentage is deterministic, integer-based, and capped at 100%.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentage(...)`.
- Calculated `floor(currentWidth / 120 * 100)`.
- Clamped the percentage to the inclusive `0..100` range.
- Changed width-119 output to `legend:adaptive>compact+1[119/120=99%]@\``.
- Changed width-120 output to `legend:adaptive>full[120/120=100%]@\``.
- Preserved distance, effective profile, width, threshold, and shortcut information.
- Updated help and debug exact assertions.

## Goals

- Provide a normalized view of progress toward the full legend threshold.
- Keep raw width values available alongside the percentage.
- Prevent percentages above 100% on wide terminals.
- Keep calculation stateless and derived from renderer width.

## Non-goals

- No decimal percentage.
- No percentage bucket or semantic label in this phase.
- No progress bar or color styling.
- No new state, shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Percentage behavior

- Negative input clamps to 0%.
- Width 119 reports 99%.
- Width 120 reports 100%.
- Width 180 remains capped at 100%.
- Explicit compact/full profiles omit adaptive percentage details.

## Acceptance criteria

- Percentage helper handles lower clamp, boundary, and upper cap.
- Width indicator includes raw current/threshold values and percentage.
- Help and debug render identical percentage text.
- Existing distance and effective-profile semantics remain unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
