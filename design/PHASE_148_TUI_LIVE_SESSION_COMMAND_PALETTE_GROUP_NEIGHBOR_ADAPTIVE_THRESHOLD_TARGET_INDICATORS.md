# Phase 148: TUI live session command palette group neighbor adaptive threshold target indicators

Phase148 makes the Phase147 distance marker self-describing by identifying which detail threshold the distance leads to.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborAdaptiveThresholdTarget(...)`.
- Returned `standard`, `full`, or no target from the shared threshold semantics.
- Added `S` and `F` target codes to adaptive downgrade labels.
- Rendered compact-to-standard progress as `+S<N>`; Phase149 adds percentage progress.
- Rendered standard-to-full progress as `+F<N>`; Phase149 adds percentage progress.
- Preserved labels without a target when no adaptive downgrade occurs.
- Combined target markers with Phase146 non-default threshold values.
- Added direct target helper and renderer combination coverage.

## Goals

- Remove ambiguity from the Phase147 `+N` distance.
- Show whether additional width unlocks standard or full detail.
- Keep the marker compact enough for constrained headers.
- Preserve all existing adaptive profile and threshold behavior.

## Non-goals

- No full words in the renderer marker.
- No target indicator when no width increase is required.
- No target indicator in debug diagnostics because debug has no renderer width.
- No new state, shortcut, persistence, or protocol field.
- No JSON-RPC, provider, MCP, plugin, or tool boundary changes.

## Target behavior

- `neighbors(full>compact+S2):...` means standard detail is two columns away.
- `neighbors(full>standard+F20):...` means full detail is twenty columns away.
- `neighbors(full>compact+S2@104/144):...` combines the target, distance, and spacious threshold values.
- `S` always maps to the selected preset's standard threshold.
- `F` always maps to the selected preset's full threshold.
- Full or preference-limited output without adaptive downgrade has no target marker.

## Acceptance criteria

- Compact output below standard resolves target `standard`.
- Standard output below full resolves target `full`.
- Full output resolves no target.
- Preference-limited compact output on sufficient width resolves no target.
- Renderer target and distance are derived from the same effective profile and width.
- Dense, balanced, and spacious presets retain their own boundaries.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
