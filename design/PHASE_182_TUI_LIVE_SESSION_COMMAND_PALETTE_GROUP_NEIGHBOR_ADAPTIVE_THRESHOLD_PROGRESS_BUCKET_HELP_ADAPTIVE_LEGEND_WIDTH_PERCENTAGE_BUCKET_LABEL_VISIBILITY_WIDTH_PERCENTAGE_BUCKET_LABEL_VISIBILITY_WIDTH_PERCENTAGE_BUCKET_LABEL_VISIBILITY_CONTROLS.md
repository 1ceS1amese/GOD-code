# Phase 182: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility controls

Phase182 adds an independent visibility control for the Phase181 innermost `low/mid/high` labels while preserving the `L/M/H` bucket.

## Implementation status

- Added default-on innermost bucket-label visibility state.
- Added a palette-local `&` toggle action and input mapping.
- Added `visibility_bucket_labels:on@&` and `visibility_bucket_labels:off@&` indicators.
- Extended nested visibility formatting with an independent label-visibility argument.
- Added Help and Debug integration plus closed-palette no-op and close/reopen persistence tests.
- Preserved width, percentage, bucket, distance, and all outer visibility profiles.

## Behavior

- Enabled: `99%H(high)`.
- Disabled: `99%H`.
- `&` only acts while the command palette is open.
- Hidden labels do not remove `L/M/H` or affect adaptive resolution.

## Non-goals

- No visibility profile beyond boolean on/off in this phase.
- No separate threshold or external persisted preference.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Acceptance criteria

- Initial visibility is enabled and closed-palette action is a no-op.
- `&` maps to the toggle action.
- Help and Debug expose matching on/off state.
- State persists across palette close/reopen.
- Focused and complete tests plus TS typecheck pass.
- Cross-process interfaces remain unchanged.
