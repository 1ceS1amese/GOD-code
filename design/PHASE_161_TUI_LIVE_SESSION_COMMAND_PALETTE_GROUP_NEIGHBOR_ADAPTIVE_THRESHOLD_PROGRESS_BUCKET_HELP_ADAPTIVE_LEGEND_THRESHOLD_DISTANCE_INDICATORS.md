# Phase 161: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend threshold distance indicators

Phase161 shows how many additional columns an adaptive legend needs before switching from compact to full. The distance follows the `+N` convention established by Phase147.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpLegendThresholdDistance(...)`.
- Reused the shared 120-column threshold.
- Added `+N` only while adaptive mode resolves to compact.
- Changed width-119 output to `legend:adaptive>compact+1[120]@\``.
- Kept width-120 output as `legend:adaptive>full[120]@\``.
- Preserved explicit compact/full indicators without distance suffixes.
- Updated help and debug boundary assertions.

## Goals

- Explain how close a compact adaptive legend is to the full-legend boundary.
- Reuse the existing positive-distance convention.
- Avoid indicator width when the threshold is already satisfied.
- Keep distance derived rather than stored in TUI state.

## Non-goals

- No surplus distance above the threshold.
- No current width value in the indicator.
- No configurable threshold or hysteresis.
- No new shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Distance behavior

- Adaptive width 80 reports `compact+40[120]`.
- Adaptive width 119 reports `compact+1[120]`.
- Adaptive width 120 reports `full[120]` without a distance.
- Explicit compact/full profiles never report adaptive distance.

## Acceptance criteria

- Distance equals `120 - maxWidth` below the threshold.
- Distance is null at and above the threshold.
- Distance is null for explicit profiles.
- Help and debug render the same distance suffix.
- Existing effective profile, threshold, cycle, visibility, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
