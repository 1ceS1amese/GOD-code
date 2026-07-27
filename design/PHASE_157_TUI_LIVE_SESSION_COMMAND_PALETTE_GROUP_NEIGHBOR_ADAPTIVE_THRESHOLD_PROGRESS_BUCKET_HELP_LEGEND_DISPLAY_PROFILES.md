# Phase 157: TUI live session command palette group neighbor adaptive threshold progress bucket help legend display profiles

Phase157 adds explicit `compact` and `full` display profiles for the progress-bucket help legend. The command palette uses the backtick key to cycle profiles while retaining the existing visibility toggle.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionCommandNeighborProgressBucketHelpLegendProfile` with `compact` and `full` values.
- Added default `compact` profile state.
- Added `cycle_live_session_command_neighbor_progress_bucket_help_legend_profile`.
- Added palette-local backtick shortcut through a shared constant.
- Added `liveSessionCommandNeighborProgressBucketHelpLegend(...)`.
- Added `liveSessionCommandNeighborProgressBucketHelpLegendProfileIndicator(...)`.
- Added help indicators `legend:compact@\`` and `legend:full@\``.
- Extended debug diagnostics with the active profile indicator.
- Preserved profile state across palette close/reopen.

## Goals

- Let users choose between the Phase156 compact legend and the earlier explicit full legend.
- Keep profile switching independent from legend visibility.
- Make the active profile and shortcut discoverable in help and debug output.
- Preserve the existing default help width by defaulting to compact.

## Non-goals

- No automatic width-based profile selection.
- No third custom profile.
- No persisted configuration outside the current TUI state lifetime.
- No renderer header marker.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Profile behavior

- `compact` renders `bucket:L/M/H=low/mid/high`.
- `full` renders `with progress L=low/M=mid/H=high`.
- Backtick cycles `compact -> full -> compact` while the palette is open.
- A closed-palette cycle action is a no-op.
- The selected profile remains unchanged when visibility is toggled or the palette is reopened.

## Acceptance criteria

- Initial profile is `compact`.
- Both profile renderers return their exact expected legends.
- Help and debug expose the active profile and backtick shortcut.
- Backtick maps to the cycle action only through the palette-local input branch.
- Hidden legends omit both compact and full legend content.
- Profile choice persists across close/reopen.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
