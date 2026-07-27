# Phase 200: TUI deepest bucket label visibility threshold indicators

Phase200 exposes the shared 120-column boundary in the Phase199 deepest adaptive bucket-label visibility indicator.

## Implementation status

- Reused the shared adaptive-width constant in the deepest profile indicator.
- Changed adaptive output to `visibility_bucket_labels_labels_labels:adaptive>hidden[120]@)` below the boundary.
- Changed adaptive output to `visibility_bucket_labels_labels_labels:adaptive>shown[120]@)` at or above the boundary.
- Preserved compact explicit `shown` and `hidden` indicators.
- Updated helper, Help, Debug, and exact boundary tests.
- Preserved profile cycling, effective visibility, and persistence.

## Non-goals

- No distance-to-threshold value in this phase.
- No separate threshold state or preference.
- No new shortcut, action, protocol, provider, MCP, plugin, or tool interface.

## Acceptance criteria

- Threshold text comes from the same constant used by the resolver.
- Widths 119 and 120 render exact hidden/shown threshold indicators.
- Explicit profile indicators remain unchanged.
- TypeScript typecheck and the complete test suite pass.
