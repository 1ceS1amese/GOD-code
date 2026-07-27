# Phase 151: TUI live session command palette group neighbor adaptive threshold progress bucket labels

Phase151 defines explicit semantic labels for the Phase150 `L/M/H` progress buckets while preserving the one-character renderer representation.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborAdaptiveThresholdProgressBucketLabel(...)`.
- Mapped `L` to `low`.
- Mapped `M` to `mid`.
- Mapped `H` to `high`.
- Kept renderer markers as `L/M/H` to protect narrow-header capacity.
- Added the `L=low/M=mid/H=high` legend to command-palette help; Phase152 adds local visibility control.
- Added direct label mapping and exact help coverage.
- Verified that expanding full words in the header would truncate existing scroll fields and rejected that layout.

## Goals

- Make the compact bucket codes understandable without guesswork.
- Preserve the exact Phase150 header width.
- Centralize bucket semantics in a typed helper.
- Document the legend where users discover command-palette controls.

## Non-goals

- No full `low/mid/high` words in the renderer header.
- No configurable labels or localization layer.
- No colors or styling changes.
- No new state, shortcut, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Label behavior

- Renderer remains `25%L`, `50%M`, or `97%H`.
- Help explains `L=low/M=mid/H=high`.
- Shared code can resolve `L -> low`, `M -> mid`, and `H -> high` without duplicating string mappings.
- The labels describe progress toward the current target threshold.

## Acceptance criteria

- Every bucket maps to exactly one semantic label.
- Help exposes all three mappings.
- Renderer output retains single-character buckets.
- Existing scroll, page, category, and summary fields remain visible at established test widths.
- Exact percentages and threshold values remain unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
