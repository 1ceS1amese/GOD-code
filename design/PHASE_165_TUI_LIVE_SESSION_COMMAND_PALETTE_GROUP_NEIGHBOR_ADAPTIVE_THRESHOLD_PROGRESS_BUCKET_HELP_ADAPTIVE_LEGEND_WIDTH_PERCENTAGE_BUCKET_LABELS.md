# Phase 165: TUI live session command palette group neighbor adaptive threshold progress bucket help adaptive legend width percentage bucket labels

Phase165 adds explicit `low`, `mid`, and `high` labels beside the Phase164 L/M/H percentage buckets. The labels reuse the semantic mapping established in Phase151.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabel(...)`.
- Reused `liveSessionCommandNeighborAdaptiveThresholdProgressBucketLabel(...)`.
- Mapped width-derived bucket `L` to `low`, `M` to `mid`, and `H` to `high`.
- Changed width-119 output to `legend:adaptive>compact+1[119/120=99%H(high)]@\``.
- Changed width-120 output to `legend:adaptive>full[120/120=100%H(high)]@\``.
- Preserved raw width, threshold, percentage, bucket, distance, and profile information.
- Updated help and debug exact assertions.

## Goals

- Make L/M/H meanings directly understandable in the adaptive indicator.
- Reuse the existing semantic label source of truth.
- Keep the single-character bucket for compact scanning.
- Preserve exact numeric values for diagnostics.

## Non-goals

- No label visibility control in this phase.
- No alternative terminology or localization.
- No color styling.
- No new state, shortcut, action, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Label behavior

- Width 0 reports bucket `L(low)`.
- Width 40 reports bucket `M(mid)`.
- Width 80 and above the H boundary report `H(high)`.
- Explicit compact/full profiles omit adaptive bucket labels.
- Help and debug use identical label formatting.

## Acceptance criteria

- Label helper delegates to the shared Phase151 mapping.
- Low, mid, and high representative widths are tested.
- Help and debug render exact labeled indicators.
- Existing numeric, bucket, distance, and profile behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
