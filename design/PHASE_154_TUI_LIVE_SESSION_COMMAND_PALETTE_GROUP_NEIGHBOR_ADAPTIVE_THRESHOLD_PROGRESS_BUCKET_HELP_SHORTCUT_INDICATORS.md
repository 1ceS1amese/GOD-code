# Phase 154: TUI live session command palette group neighbor adaptive threshold progress bucket help shortcut indicators

Phase154 extends the Phase153 bucket-help status marker with the existing palette-local shortcut. Help and debug diagnostics now expose `on@|` or `off@|`, so the current state and the key that changes it remain visible together.

## Implementation status

Implemented in this phase:

- Added `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_SHORTCUT` as the shared `|` key definition.
- Added `liveSessionCommandNeighborProgressBucketHelpIndicator(...)`.
- Combined the Phase153 status vocabulary with the shortcut as `on@|` or `off@|`.
- Reused the shared shortcut constant in the palette input mapping.
- Updated help to display `bucket legend:on@|` or `bucket legend:off@|`.
- Updated debug diagnostics to display `bucket_help=on@|` or `bucket_help=off@|`.
- Preserved legend visibility, toggle, and close/reopen persistence behavior.

## Goals

- Keep the bucket legend control discoverable while enabled or disabled.
- Make help, diagnostics, and actual key handling share one shortcut definition.
- Follow the existing `@key` indicator convention used by command-neighbor metadata.
- Avoid adding command-palette header width or new state.

## Non-goals

- No new shortcut or toggle action.
- No configurable key binding.
- No renderer header marker.
- No persistence field change.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Indicator behavior

- Enabled help includes `bucket legend:on@|` and the semantic bucket mapping.
- Disabled help includes `bucket legend:off@|` and omits the semantic mapping.
- Debug includes the same `bucket_help=on@|` or `bucket_help=off@|` indicator.
- Palette input compares against the same exported `|` constant used by the indicator.

## Acceptance criteria

- Enabled state maps to `on@|`.
- Disabled state maps to `off@|`.
- Help and debug diagnostics use the shared indicator.
- Pressing `|` still toggles the existing state.
- Existing legend visibility and persistence behavior remain unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
