# Phase 215: TUI deepest bucket label visibility profiles

Phase215 upgrades the Phase214 boolean current-level deepest nested bucket-label control to explicit `shown`, `hidden`, and `adaptive` profiles.

## Implementation status

- Added a nested bucket-label visibility profile type and default `shown` state.
- Reused `>` to cycle `shown -> hidden -> adaptive -> shown` while the palette is open.
- Added effective profile resolution at the shared 120-column boundary.
- Added `visibility_bucket_labels_labels_labels_labels_labels:shown@>`, `hidden@>`, and adaptive effective indicators.
- Updated formatter, Help, Debug, input, no-op, boundary, and persistence tests.
- Preserved `L/M/H`, all outer profiles, width percentage, and threshold distance behavior.

## Behavior

- `shown` always renders the nested `(low/mid/high)` label.
- `hidden` always omits that label while retaining `L/M/H`.
- `adaptive` resolves to hidden below 120 columns and shown at or above 120 columns.
- `>` only cycles profiles while the command palette is open.

## Non-goals

- No threshold text or distance in this profile indicator yet.
- No externally persisted preference.
- No protocol, provider, MCP, plugin, or tool boundary change.

## Acceptance criteria

- Initial profile is `shown` and closed-palette action is a no-op.
- All profile transitions and adaptive boundary results are tested.
- Help and Debug expose configured and effective adaptive state.
- Profile persists across palette close/reopen.
- TypeScript typecheck and the complete test suite pass.
