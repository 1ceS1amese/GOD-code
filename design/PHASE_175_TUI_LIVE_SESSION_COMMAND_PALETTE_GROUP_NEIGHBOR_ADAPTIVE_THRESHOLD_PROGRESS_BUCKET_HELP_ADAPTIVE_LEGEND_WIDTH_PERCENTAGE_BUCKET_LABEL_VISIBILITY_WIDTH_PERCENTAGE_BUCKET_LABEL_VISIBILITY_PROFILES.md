# Phase 175: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility profiles

Phase175 upgrades the Phase174 boolean nested label control to explicit `shown`, `hidden`, and `adaptive` profiles. Adaptive visibility follows the shared 120-column boundary.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile`.
- Replaced the boolean state with default `shown` profile state.
- Added cycle order `shown -> hidden -> adaptive -> shown` on `*`.
- Added `resolveLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile(...)`.
- Made adaptive nested labels hidden below 120 columns and shown at or above 120.
- Added `bucket_labels:adaptive>hidden@*` and `bucket_labels:adaptive>shown@*` indicators.
- Updated help and debug to derive effective visibility from the actual width.
- Preserved profile state across palette close/reopen.

## Goals

- Support explicit and width-aware nested bucket-label visibility.
- Preserve the Phase174 default visual output through default `shown`.
- Reuse the existing adaptive width boundary.
- Avoid storing effective visibility as derived state.

## Non-goals

- No separate nested-label threshold.
- No threshold or distance text in this profile indicator in this phase.
- No external persisted configuration.
- No new shortcut beyond `*`.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Profile behavior

- `shown` always renders `(low/mid/high)` labels.
- `hidden` always omits labels while retaining L/M/H.
- `adaptive` at width 119 resolves to hidden.
- `adaptive` at width 120 resolves to shown.
- `*` cycles all three profiles only while the palette is open.

## Acceptance criteria

- Initial profile is `shown`.
- Closed-palette cycle action is a no-op.
- All three profile and wrap transitions are tested.
- Help and debug expose configured/effective adaptive status.
- Adaptive output matches effective nested-label visibility.
- Profile persists across close/reopen.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
