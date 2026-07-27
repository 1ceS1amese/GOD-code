# Phase 184: TUI innermost bucket label visibility threshold indicators

Phase184 exposes the shared 120-column boundary in the Phase183 innermost adaptive bucket-label visibility indicator.

## Implementation status

- Reused `LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_ADAPTIVE_WIDTH` in the innermost profile indicator.
- Changed adaptive output to `visibility_bucket_labels:adaptive>hidden[120]@&` below the boundary.
- Changed adaptive output to `visibility_bucket_labels:adaptive>shown[120]@&` at or above the boundary.
- Preserved compact explicit `shown` and `hidden` indicators.
- Updated helper, Help, Debug, and exact boundary tests.
- Preserved profile cycling, effective visibility, and close/reopen persistence.

## Non-goals

- No distance-to-threshold value in this phase.
- No separate threshold state or preference.
- No new shortcut, action, protocol, provider, MCP, plugin, or tool interface.

## Acceptance criteria

- Threshold text comes from the same constant used by the resolver.
- Widths 119 and 120 render exact hidden/shown threshold indicators.
- Explicit profile indicators remain unchanged.
- Help and Debug use identical formatting.
- TypeScript typecheck and the complete test suite pass.
