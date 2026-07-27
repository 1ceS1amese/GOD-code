# Phase 167: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility profiles

Phase167 upgrades the Phase166 boolean label control to explicit `shown`, `hidden`, and `adaptive` visibility profiles. Adaptive label visibility follows the same 120-column boundary used by the adaptive legend.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityProfile`.
- Replaced the boolean state with default `shown` profile state.
- Added cycle order `shown -> hidden -> adaptive -> shown` on `_`.
- Added `resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityProfile(...)`.
- Made adaptive labels hidden below 120 columns and shown at or above 120.
- Added `labels:adaptive>hidden@_` and `labels:adaptive>shown@_` indicators.
- Updated help and debug to use effective visibility derived from actual width.
- Preserved profile state across palette close/reopen.

## Goals

- Support explicit and width-aware label visibility with one control.
- Preserve the Phase166 default visual output through default `shown`.
- Reuse the existing adaptive width boundary.
- Avoid storing effective visibility as derived state.

## Non-goals

- No separate label-specific threshold.
- No threshold or distance text in the label indicator in this phase.
- No external persisted configuration.
- No new shortcut beyond `_`.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Profile behavior

- `shown` always renders `(low/mid/high)` labels.
- `hidden` always omits labels while retaining L/M/H.
- `adaptive` at width 119 resolves to hidden.
- `adaptive` at width 120 resolves to shown.
- `_` cycles all three profiles only while the palette is open.

## Acceptance criteria

- Initial profile is `shown`.
- Closed-palette cycle action is a no-op.
- All three profile and wrap transitions are tested.
- Help and debug expose configured/effective adaptive status.
- Adaptive output matches the effective label visibility.
- Profile persists across close/reopen.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
