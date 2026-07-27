# Phase 166: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility controls

Phase166 adds an independent visibility control for the Phase165 low/mid/high bucket labels. The L/M/H bucket remains present when labels are hidden, preserving compact semantic information.

## Implementation status

Implemented in this phase:

- Added default-on bucket-label visibility state.
- Added `toggle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label`.
- Added palette-local `_` shortcut through a shared constant.
- Added `labels:on@_` and `labels:off@_` indicators.
- Extended the width and profile indicator formatters with label visibility input.
- Added help and debug visibility indicators.
- Preserved label state across palette close/reopen.
- Added closed-palette no-op, input, help, debug, and persistence coverage.

## Goals

- Let users reclaim indicator width without removing L/M/H buckets.
- Keep the control discoverable in both visible and hidden states.
- Keep help and debug terminology identical.
- Preserve the existing adaptive profile and legend visibility controls independently.

## Non-goals

- No visibility profile beyond boolean on/off in this phase.
- No automatic width-based label hiding.
- No external persisted preference.
- No renderer header marker.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Visibility behavior

- Default enabled output includes `99%H(high)` and `labels:on@_`.
- Disabled output includes `99%H` and `labels:off@_`.
- `_` toggles labels only while the command palette is open.
- Hidden labels do not affect percentage, bucket, distance, or profile resolution.
- The selected visibility survives palette close/reopen.

## Acceptance criteria

- Initial label visibility is enabled.
- Closed-palette toggle action is a no-op.
- `_` maps to the toggle action in the palette-local branch.
- Help and debug show on/off status and matching formatted output.
- Label state persists across close/reopen.
- Existing legend/profile/visibility behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
