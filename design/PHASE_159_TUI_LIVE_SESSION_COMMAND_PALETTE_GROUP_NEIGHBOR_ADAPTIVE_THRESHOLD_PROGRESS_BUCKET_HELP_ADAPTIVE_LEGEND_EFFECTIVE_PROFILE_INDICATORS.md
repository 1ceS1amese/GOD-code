# Phase 159: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend effective-profile indicators

Phase159 makes the Phase158 adaptive legend profile self-describing. Help and debug diagnostics now show both the configured `adaptive` profile and its width-resolved effective profile.

## Implementation status

Implemented in this phase:

- Extended `liveSessionCommandNeighborProgressBucketHelpLegendProfileIndicator(...)` with width input.
- Added `legend:adaptive>compact@\`` below the adaptive threshold.
- Added `legend:adaptive>full@\`` at and above the adaptive threshold.
- Preserved `legend:compact@\`` and `legend:full@\`` for explicit profiles.
- Extended `buildTuiDebugLines(...)` with optional width input.
- Updated all renderer debug paths to pass actual content width.
- Kept direct help/debug calls backward compatible with an 80-column default.

## Goals

- Expose the actual legend variant selected by adaptive mode.
- Keep configured and effective profiles visible in one compact indicator.
- Ensure help and debug resolve profiles with the same width and resolver.
- Avoid adding state solely for derived layout information.

## Non-goals

- No adaptive threshold value in the indicator.
- No width value in the indicator.
- No renderer header marker.
- No new shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Indicator behavior

- Explicit compact: `legend:compact@\``.
- Explicit full: `legend:full@\``.
- Adaptive at width 119: `legend:adaptive>compact@\``.
- Adaptive at width 120: `legend:adaptive>full@\``.
- Help and debug use identical indicator semantics.

## Acceptance criteria

- Both adaptive boundary outputs are exact and tested.
- Explicit profile indicators remain unchanged.
- Renderer passes width into both help and debug builders.
- Default direct calls resolve adaptive as compact.
- Existing cycle, visibility, input, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
