# Phase 156: TUI live session command palette group neighbor adaptive threshold progress bucket help compact legend indicators

Phase156 compacts the semantic bucket legend shown by Phase152-Phase155. The enabled help text now uses `bucket:L/M/H=low/mid/high`, preserving the ordered mapping while reducing command-palette help width.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborProgressBucketHelpCompactLegend()`.
- Built the legend from the existing `L`, `M`, and `H` bucket labels.
- Replaced `with progress L=low/M=mid/H=high` with `bucket:L/M/H=low/mid/high`.
- Preserved conditional legend visibility.
- Preserved the Phase155 `bucket:on@|` / `bucket:off@|` control indicator.
- Preserved debug diagnostics, input mapping, and close/reopen persistence.

## Goals

- Reduce semantic legend width without dropping low/mid/high meanings.
- Keep bucket order explicit and deterministic.
- Reuse the Phase151 semantic label helper as the source of truth.
- Avoid new state, actions, or protocol fields.

## Non-goals

- No legend display profile state.
- No user-configurable labels or separators.
- No width-dependent legend selection.
- No new shortcut or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary change.

## Legend behavior

- Enabled help includes `bucket:L/M/H=low/mid/high`.
- Disabled help omits the entire compact legend.
- `L`, `M`, and `H` remain ordered as low, mid, and high.
- The status/shortcut control remains independently visible in both states.

## Acceptance criteria

- The shared helper returns ` bucket:L/M/H=low/mid/high`.
- Enabled help renders the compact legend exactly once.
- Disabled help omits the compact legend.
- Existing status, shortcut, debug, input, and persistence behavior remains unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- Protocol/schema/provider/MCP/plugin boundaries remain unchanged.
