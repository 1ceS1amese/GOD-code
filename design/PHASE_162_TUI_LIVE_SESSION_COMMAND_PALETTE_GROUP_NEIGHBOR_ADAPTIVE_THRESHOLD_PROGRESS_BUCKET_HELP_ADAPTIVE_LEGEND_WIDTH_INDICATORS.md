# Phase 162: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width indicators

Phase162 adds the current help content width beside the adaptive threshold. Adaptive indicators now expose the exact `current/threshold` values used by the resolver.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpLegendWidthIndicator(...)`.
- Reused the shared 120-column threshold as the denominator.
- Changed width-119 output to `legend:adaptive>compact+1[119/120]@\``.
- Changed width-120 output to `legend:adaptive>full[120/120]@\``.
- Preserved the Phase161 `+N` distance below the threshold.
- Preserved explicit compact/full indicators without width details.
- Updated help and debug exact assertions.

## Goals

- Show the exact width that drove adaptive profile resolution.
- Keep current width and threshold adjacent for direct comparison.
- Preserve the distance indicator as an immediate action-oriented value.
- Derive all values from renderer input and shared constants.

## Non-goals

- No width percentage in this phase.
- No width history or resize trend.
- No configurable threshold.
- No new state, shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Width behavior

- Width 119 reports `[119/120]` and compact distance `+1`.
- Width 120 reports `[120/120]` and full with no distance.
- Width values above 120 remain visible as `current/120`.
- Explicit compact/full profiles omit adaptive width details.

## Acceptance criteria

- Width helper returns exact current/threshold text.
- Help and debug render matching width indicators.
- Both sides of the adaptive boundary remain correct.
- Distance, effective profile, cycle, visibility, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
