# Phase 158: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend profiles

Phase158 extends the Phase157 legend profiles with a real width-aware `adaptive` mode. The renderer now passes its content width into the help builder so adaptive legend selection follows the current terminal layout.

## Implementation status

Implemented in this phase:

- Added `adaptive` to the legend profile type and cycle order.
- Added `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH` with threshold `120`.
- Added `resolveLiveSessionCommandNeighborProgressBucketHelpLegendProfile(...)`.
- Extended the shared legend renderer with an optional maximum width.
- Updated all renderer help paths to pass their actual content width.
- Kept direct help calls backward compatible with an 80-column default.
- Added `legend:adaptive@\`` help/debug status through the existing profile indicator.
- Preserved visibility, shortcut, and close/reopen behavior.

## Goals

- Make adaptive behavior depend on real layout width rather than a nominal state label.
- Use compact legend output below 120 columns.
- Use full legend output at 120 columns and above.
- Keep explicit compact/full profiles deterministic and width-independent.

## Non-goals

- No user-configurable threshold.
- No hysteresis or terminal resize event state.
- No separate effective-profile indicator in this phase.
- No persistence outside the current TUI state lifetime.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Adaptive behavior

- Width `119` resolves adaptive to `compact`.
- Width `120` resolves adaptive to `full`.
- Explicit compact always renders the compact legend.
- Explicit full always renders the full legend.
- Profile cycle order is `compact -> full -> adaptive -> compact`.
- The renderer supplies `columns - 2` as the help content width.

## Acceptance criteria

- The resolver handles both sides of the 120-column boundary.
- Adaptive help renders compact and full legends at the expected widths.
- Every renderer help call passes its known width.
- Direct help calls remain compact by default.
- Closed-palette no-op and profile persistence behavior remain intact.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
