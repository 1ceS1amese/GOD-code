# Phase 153: TUI live session command palette group neighbor adaptive threshold progress bucket help status indicators

Phase153 makes the Phase152 bucket-legend control self-describing by showing its current `on/off` state directly in command-palette help.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpStatusLabel(...)`.
- Centralized boolean-to-`on/off` formatting.
- Changed the help control to `bucket legend:on` or `bucket legend:off`.
- Reused the same status helper in debug diagnostics.
- Preserved the legend mapping only while status is `on`.
- Kept the control visible while status is `off`.
- Added direct helper and on/off help assertions.

## Goals

- Show the current legend state without requiring users to infer it.
- Keep help and debug status terminology identical.
- Preserve the Phase152 toggle and persistence behavior.
- Avoid adding any command-palette header width.

## Non-goals

- No renderer header status marker.
- No alternative status words such as visible/hidden.
- No new shortcut or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Status behavior

- Enabled help includes `| bucket legend:on` and the semantic mapping.
- Disabled help includes `| bucket legend:off` and omits the mapping.
- Debug continues to include `bucket_help=on` or `bucket_help=off` through the shared formatter.
- Pressing `|` changes both the state marker and mapping visibility.

## Acceptance criteria

- Boolean true maps to `on`.
- Boolean false maps to `off`.
- Help always displays the current state.
- Enabled help displays the legend mapping.
- Disabled help omits the legend mapping.
- Debug uses the same status vocabulary.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.

