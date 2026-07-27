# Phase 160: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend threshold indicators

Phase160 adds the Phase158 adaptive width threshold directly to the Phase159 effective-profile indicator. Adaptive help and debug output now explain both the selected result and the boundary that produced it.

## Implementation status

Implemented in this phase:

- Reused `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH` in the profile indicator.
- Changed narrow adaptive output to `legend:adaptive>compact[120]@\``.
- Changed wide adaptive output to `legend:adaptive>full[120]@\``.
- Preserved explicit `legend:compact@\`` and `legend:full@\`` outputs.
- Updated help and debug boundary assertions.
- Preserved resolver, renderer width wiring, profile cycle, visibility, and persistence behavior.

## Goals

- Make the adaptive decision boundary observable without consulting source or design docs.
- Keep threshold display coupled to the same constant used by the resolver.
- Preserve compact explicit-profile indicators.
- Avoid duplicating threshold state in the TUI model.

## Non-goals

- No current width value in the indicator.
- No distance-to-threshold value.
- No configurable threshold.
- No new shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Indicator behavior

- Width 119: `legend:adaptive>compact[120]@\``.
- Width 120: `legend:adaptive>full[120]@\``.
- Explicit compact/full omit the adaptive threshold.
- Help and debug continue to use identical formatting.

## Acceptance criteria

- Threshold text comes from the shared resolver constant.
- Both sides of the boundary render exact expected indicators.
- Explicit profile indicators remain unchanged.
- Existing adaptive legend content matches the indicated effective profile.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
