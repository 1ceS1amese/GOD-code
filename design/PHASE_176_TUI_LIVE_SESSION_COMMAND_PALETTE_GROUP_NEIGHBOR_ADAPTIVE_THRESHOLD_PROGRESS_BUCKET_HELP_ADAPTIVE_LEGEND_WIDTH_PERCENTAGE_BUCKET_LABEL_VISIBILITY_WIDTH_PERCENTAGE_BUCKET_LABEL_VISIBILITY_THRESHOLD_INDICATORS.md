# Phase 176: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility threshold indicators

Phase176 adds the shared 120-column boundary to adaptive nested bucket-label visibility indicators.

## Implementation status

Implemented in this phase:

- Reused `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH` in the nested label profile indicator.
- Changed narrow adaptive output to `bucket_labels:adaptive>hidden[120]@*`.
- Changed wide adaptive output to `bucket_labels:adaptive>shown[120]@*`.
- Preserved explicit `bucket_labels:shown@*` and `bucket_labels:hidden@*` outputs.
- Updated helper, help, and debug boundary assertions.
- Preserved profile cycle, effective visibility, and close/reopen persistence.

## Goals

- Make the adaptive nested-label boundary visible without consulting source.
- Couple indicator text to the same constant used by the resolver.
- Preserve compact explicit-profile indicators.
- Avoid duplicate threshold state.

## Non-goals

- No distance-to-threshold value in this phase.
- No current width value in the nested label indicator.
- No separate nested-label threshold.
- No new state, shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Indicator behavior

- Width 119: `bucket_labels:adaptive>hidden[120]@*`.
- Width 120: `bucket_labels:adaptive>shown[120]@*`.
- Explicit shown/hidden omit adaptive threshold information.
- Help and debug use identical indicator formatting.

## Acceptance criteria

- Threshold text comes from the shared adaptive width constant.
- Both sides of the boundary render exact expected indicators.
- Explicit profile indicators remain unchanged.
- Effective nested-label output matches the indicator.
- Existing cycle, no-op, input, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
