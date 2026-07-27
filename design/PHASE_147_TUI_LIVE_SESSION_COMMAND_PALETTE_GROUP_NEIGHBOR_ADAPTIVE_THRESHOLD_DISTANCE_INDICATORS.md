# Phase 147: TUI live session command palette group neighbor adaptive threshold distance indicators

Phase147 shows how many additional columns are required to reach the next neighbor-detail level whenever the renderer downgrades the preferred visibility profile.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborAdaptiveThresholdDistance(...)`.
- Reused the Phase146 shared threshold source.
- Added compact `+N` distance markers only when adaptive downgrade occurs; Phase148 adds the target code.
- Made compact output report distance to the standard threshold.
- Made standard output report distance to the full threshold.
- Kept non-downgraded compact, standard, and full labels unchanged.
- Combined distance markers with Phase146 non-default threshold values.
- Added direct distance helper and renderer coverage.

## Goals

- Explain why the renderer is currently using reduced neighbor detail.
- Show the exact width increase required for the next detail level.
- Avoid adding header width when no adaptive downgrade occurs.
- Preserve profile preference and threshold preset semantics.

## Non-goals

- No distance indicator in debug diagnostics because debug has no renderer width.
- No terminal resize prediction.
- No distance to every threshold simultaneously.
- No new state, shortcut, or persistence field.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Distance behavior

- Balanced width `86`: Phase147 introduced `neighbors(full>compact+2):...`; Phase148 renders `+S2`.
- Balanced width `108`: Phase147 introduced `neighbors(full>standard+20):...`; Phase148 renders `+F20`.
- Spacious width `102`: Phase148 renders `neighbors(full>compact+S2@104/144):...`.
- A full profile at or above its full threshold has no distance suffix.
- A user-selected compact profile on a wide terminal has no distance suffix because no adaptive downgrade occurred.

The marker is relative to the next effective detail level, not necessarily directly to the preferred level. A full preference downgraded to compact first reports the distance to standard; after crossing that threshold it reports the remaining distance to full.

## Acceptance criteria

- Compact distance equals `standardThreshold - maxWidth` below standard.
- Standard distance equals `fullThreshold - maxWidth` below full.
- Full and already-satisfied thresholds return no distance.
- Distance markers appear only when preferred and effective profiles differ.
- Balanced, dense, and spacious profiles use their shared threshold values.
- Phase146 threshold values remain visible for non-default profiles.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
