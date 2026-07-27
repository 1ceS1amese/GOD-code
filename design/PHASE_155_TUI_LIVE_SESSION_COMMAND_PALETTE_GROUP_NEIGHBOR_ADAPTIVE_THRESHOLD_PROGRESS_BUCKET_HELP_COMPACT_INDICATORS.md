# Phase 155: TUI live session command palette group neighbor adaptive threshold progress bucket help compact indicators

Phase155 reduces the command-palette help width used by the Phase154 bucket-help control. The help label now uses `bucket:on@|` or `bucket:off@|` while preserving the existing state and shortcut semantics.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpCompactIndicator(...)`.
- Composed the compact label from the existing Phase154 indicator.
- Changed command-palette help from `bucket legend:on@|` to `bucket:on@|`.
- Changed the disabled help marker from `bucket legend:off@|` to `bucket:off@|`.
- Preserved `bucket_help=on@|` / `bucket_help=off@|` debug diagnostics.
- Preserved the shared `|` input mapping, legend visibility, and close/reopen persistence.

## Goals

- Reduce help-line width without removing state or shortcut discoverability.
- Build on the Phase154 shared indicator instead of duplicating formatting.
- Keep the debug field stable for diagnostics and tests.
- Avoid adding renderer state or protocol fields.

## Non-goals

- No compacting of the `L=low/M=mid/H=high` semantic legend.
- No width-dependent help mode.
- No new shortcut, action, or persistence field.
- No debug field rename.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Compact behavior

- Enabled help includes `bucket:on@|` and the semantic legend.
- Disabled help includes `bucket:off@|` and omits the semantic legend.
- Debug continues to expose the explicit `bucket_help` field.
- The compact label is seven characters shorter than the Phase154 help label.

## Acceptance criteria

- Enabled compact indicator maps to `bucket:on@|`.
- Disabled compact indicator maps to `bucket:off@|`.
- Help uses the compact indicator in both states.
- Debug and input behavior remain unchanged.
- Existing visibility and persistence tests continue to pass.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
