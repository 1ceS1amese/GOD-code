# Phase 174: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility controls

Phase174 adds an independent visibility control for the Phase173 `low/mid/high` labels. The `L/M/H` bucket remains visible when its human-readable label is hidden.

## Implementation status

Implemented in this phase:

- Added default-on bucket-label visibility state.
- Added `toggle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility`.
- Added palette-local `*` shortcut through a shared constant.
- Added `bucket_labels:on@*` and `bucket_labels:off@*` indicators.
- Extended the label visibility width and profile indicator formatters with bucket-label visibility input.
- Added help and debug visibility indicators.
- Preserved the selected visibility across palette close/reopen.
- Added closed-palette no-op, input, helper, help, debug, and persistence coverage.

## Goals

- Let users reclaim indicator width without removing the `L/M/H` bucket.
- Keep this nested label control independent from the outer label visibility profile.
- Keep help and debug terminology identical.
- Preserve exact width, percentage, bucket, distance, and profile semantics.

## Non-goals

- No shown/hidden/adaptive visibility profile in this phase.
- No automatic width-based hiding.
- No external persisted preference.
- No renderer header marker.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Visibility behavior

- Default enabled output includes `99%H(high)` and `bucket_labels:on@*`.
- Disabled output includes `99%H` and `bucket_labels:off@*`.
- `*` toggles labels only while the command palette is open.
- Hidden bucket labels do not affect percentage, bucket, distance, or profile resolution.
- The selected visibility survives palette close/reopen.

## Acceptance criteria

- Initial bucket-label visibility is enabled.
- Closed-palette toggle action is a no-op.
- `*` maps to the toggle action in the palette-local branch.
- Help and debug show on/off status and matching formatted output.
- Visibility state persists across close/reopen.
- Existing outer label profile and legend label visibility behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
