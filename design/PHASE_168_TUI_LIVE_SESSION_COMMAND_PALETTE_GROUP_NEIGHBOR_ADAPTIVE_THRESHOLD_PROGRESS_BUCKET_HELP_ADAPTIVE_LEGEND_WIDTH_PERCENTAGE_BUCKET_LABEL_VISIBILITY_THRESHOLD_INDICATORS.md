# Phase 168: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility threshold indicators

Phase168 adds the shared 120-column boundary to adaptive bucket-label visibility indicators. The configured/effective label state now explains which threshold controls it.

## Implementation status

Implemented in this phase:

- Reused `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH` in the label indicator.
- Changed narrow adaptive output to `labels:adaptive>hidden[120]@_`.
- Changed wide adaptive output to `labels:adaptive>shown[120]@_`.
- Preserved explicit `labels:shown@_` and `labels:hidden@_` outputs.
- Updated help and debug boundary assertions.
- Preserved profile cycle, effective visibility, and close/reopen persistence.

## Goals

- Make the adaptive label boundary visible without consulting source.
- Couple indicator text to the same constant used by the resolver.
- Preserve compact explicit-profile indicators.
- Avoid duplicate threshold state.

## Non-goals

- No distance-to-threshold value in this phase.
- No current width value in the label indicator.
- No separate label threshold.
- No new state, shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Indicator behavior

- Width 119: `labels:adaptive>hidden[120]@_`.
- Width 120: `labels:adaptive>shown[120]@_`.
- Explicit shown/hidden omit adaptive threshold information.
- Help and debug use identical indicator formatting.

## Acceptance criteria

- Threshold text comes from the shared adaptive width constant.
- Both sides of the boundary render exact expected indicators.
- Explicit profile indicators remain unchanged.
- Effective label output matches the indicator.
- Existing cycle, no-op, input, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
