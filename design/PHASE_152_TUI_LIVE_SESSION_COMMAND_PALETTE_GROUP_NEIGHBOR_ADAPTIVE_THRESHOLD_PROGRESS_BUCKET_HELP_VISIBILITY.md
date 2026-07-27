# Phase 152: TUI live session command palette group neighbor adaptive threshold progress bucket help visibility

Phase152 lets users hide or restore the Phase151 `L=low/M=mid/H=high` legend without changing the compact renderer bucket markers.

## Implementation status

Implemented in this phase:

- Added persistent `liveSessionCommandNeighborProgressBucketHelpVisible` state.
- Defaulted bucket help visibility to enabled.
- Added `toggle_live_session_command_neighbor_progress_bucket_help`.
- Added palette-local `|` shortcut.
- Kept the `| bucket legend` control visible while hiding the legend text; Phase153 adds its current status.
- Added `bucket_help=on/off` debug diagnostics.
- Preserved the setting across command-palette close/reopen.
- Added closed no-op, toggle, help, debug, input, and persistence coverage.

## Goals

- Let experienced users shorten command-palette help text.
- Keep the renderer `L/M/H` markers unchanged.
- Make the legend easy to restore after it is hidden.
- Keep the preference local and deterministic.

## Non-goals

- No change to renderer bucket visibility.
- No configuration-file persistence.
- No reuse of `?`, which is currently printable command-palette search input.
- No hiding of other command-palette help sections.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Visibility behavior

- Default help includes `progress L=low/M=mid/H=high`.
- Pressing `|` hides the mapping but retains `| bucket legend` in the help line.
- Pressing `|` again restores the mapping.
- Cycling is ignored while the command palette is closed.
- The selected visibility survives palette close/reopen.
- Debug reports `bucket_help=on` or `bucket_help=off` regardless of palette visibility.

## Acceptance criteria

- Initial state enables the bucket legend.
- Closed-palette toggle actions are no-ops.
- `|` maps to the toggle action while the palette is open.
- Hidden help omits all three semantic mappings.
- Hidden help still documents how to restore the legend.
- Debug reports the current visibility state.
- Visibility persists across palette close/reopen.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
