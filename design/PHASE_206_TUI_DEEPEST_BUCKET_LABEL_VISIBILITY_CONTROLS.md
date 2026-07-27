# Phase 206: TUI deepest bucket label visibility controls

Phase206 adds an independent visibility control for the Phase205 `low/mid/high` labels while preserving the `L/M/H` bucket.

## Implementation status

- Added default-on current-level deepest bucket-label visibility state.
- Added a palette-local `<` toggle action and input mapping.
- Added `visibility_bucket_labels_labels_labels_labels:on@<` and `off@<` indicators.
- Extended the current deepest adaptive formatter with an independent label-visibility argument.
- Updated Help, Debug, closed-palette no-op, toggle, persistence, and input tests.
- Preserved width, percentage, bucket, distance, and all outer profiles.

## Behavior

- Enabled: `99%H(high)`.
- Disabled: `99%H`.
- `<` only acts while the command palette is open.
- Hidden labels do not remove `L/M/H` or affect adaptive resolution.

## Non-goals

- No visibility profile beyond boolean on/off in this phase.
- No separate threshold or externally persisted preference.
- No protocol, provider, MCP, plugin, or tool boundary change.

## Acceptance criteria

- Initial visibility is enabled and closed-palette action is a no-op.
- Help and Debug expose matching on/off state.
- State persists across palette close/reopen.
- TypeScript typecheck and the complete test suite pass.
