# Phase 150: TUI live session command palette group neighbor adaptive threshold progress buckets

Phase150 adds a compact low/medium/high bucket beside the exact Phase149 progress percentage, making adaptive threshold progress faster to scan.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborAdaptiveThresholdProgressBucket(...)`.
- Defined `L` for progress `0..32`.
- Defined `M` for progress `33..65`.
- Defined `H` for progress `66..99`.
- Appended the bucket directly after the exact percentage; Phase151 documents its semantic label.
- Preserved exact target, distance, and percentage information.
- Kept non-downgraded labels unchanged.
- Added direct boundary and renderer coverage.

## Goals

- Make progress state readable without parsing every percentage.
- Preserve the exact percentage for precise interpretation.
- Use one character so narrow headers remain practical.
- Keep bucket calculation independent of threshold preset values.

## Non-goals

- No colors or terminal styling for buckets.
- No configurable bucket boundaries.
- No replacement of the exact percentage.
- No bucket when no adaptive downgrade occurs.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Bucket behavior

- `0%` through `32%`: `L`.
- `33%` through `65%`: `M`.
- `66%` through `99%`: `H`.
- `neighbors(full>standard+F30/25%L):...`.
- `neighbors(full>standard+F20/50%M):...`.
- `neighbors(full>compact+S2/97%H):...`.
- `neighbors(full>compact+S2/98%H@104/144):...`.

The bucket classifies progress toward the current target threshold, not overall terminal width or the preferred profile.

## Acceptance criteria

- Boundary values `32/33` separate low and medium.
- Boundary values `65/66` separate medium and high.
- Active progress always maps to exactly one bucket.
- Renderer preserves target, distance, and exact percentage.
- Non-default threshold values remain visible after the bucket.
- No indicator appears when no adaptive downgrade occurs.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
