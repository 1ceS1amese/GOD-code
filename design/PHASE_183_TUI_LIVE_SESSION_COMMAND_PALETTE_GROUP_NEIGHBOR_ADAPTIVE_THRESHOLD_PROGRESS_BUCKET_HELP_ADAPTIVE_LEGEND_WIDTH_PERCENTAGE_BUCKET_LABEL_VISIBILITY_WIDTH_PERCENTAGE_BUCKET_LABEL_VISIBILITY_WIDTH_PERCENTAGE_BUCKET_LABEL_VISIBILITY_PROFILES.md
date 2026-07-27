# Phase 183: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket label visibility width percentage bucket label visibility width percentage bucket label visibility profiles

Phase183 upgrades the Phase182 boolean innermost bucket-label control to explicit `shown`, `hidden`, and `adaptive` profiles. Adaptive visibility follows the shared 120-column boundary.

## Implementation status

- Added an innermost bucket-label visibility profile type and default `shown` state.
- Reused `&` to cycle `shown -> hidden -> adaptive -> shown` while the palette is open.
- Added effective profile resolution at the shared 120-column boundary.
- Added `visibility_bucket_labels:shown@&`, `hidden@&`, and `adaptive>hidden/shown@&` indicators.
- Updated nested adaptive formatting, Help, Debug, input, and persistence tests.
- Preserved `L/M/H`, all outer profiles, width percentage, and threshold distance behavior.

## Behavior

- `shown` always renders `(low/mid/high)`.
- `hidden` always omits the label while retaining `L/M/H`.
- `adaptive` resolves to hidden below 120 columns and shown at or above 120 columns.
- `&` only cycles profiles while the command palette is open.

## Non-goals

- No separate threshold or threshold-distance indicator in this phase.
- No persisted external preference.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Acceptance criteria

- Initial profile is `shown`.
- Closed-palette cycle action is a no-op.
- All profile transitions and adaptive boundary results are tested.
- Help and Debug expose configured and effective adaptive state.
- Profile persists across palette close and reopen.
- TypeScript typecheck and the complete test suite pass.
