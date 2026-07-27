# Phase 149: TUI live session command palette group neighbor adaptive threshold progress indicators

Phase149 augments the Phase148 target-and-distance marker with percentage progress toward the target detail threshold.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborAdaptiveThresholdProgress(...)`.
- Calculated compact progress against the standard threshold.
- Calculated standard progress within the standard-to-full interval.
- Floored progress to stable integer percentages.
- Clamped active progress to `0..99` because reaching the target changes the effective profile.
- Extended renderer markers to `+S<N>/<P>%` and `+F<N>/<P>%`; Phase150 appends a progress bucket.
- Preserved no-indicator behavior when no adaptive downgrade occurs.
- Added direct helper and balanced/dense/spacious renderer coverage.

## Goals

- Show both remaining width and completed progress toward the next detail level.
- Make progress comparable across threshold presets with different numeric boundaries.
- Preserve the compact target and distance semantics from Phase148.
- Keep the calculation deterministic and renderer-local.

## Non-goals

- No progress bar or additional renderer row.
- No progress value at or above an already-satisfied threshold.
- No progress in debug diagnostics because debug has no renderer width.
- No persistent progress state.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Progress behavior

- Balanced width `86`: `neighbors(full>compact+S2/97%):...`.
- Balanced width `108`: `neighbors(full>standard+F20/50%):...`.
- Balanced width `98`: standard-to-full progress is `25%`.
- Dense width `70`: compact-to-standard progress is `97%`.
- Dense width `100`: standard-to-full progress is `70%`.
- Spacious width `102`: `neighbors(full>compact+S2/98%@104/144):...`.

Compact progress uses `floor(maxWidth / standardThreshold * 100)`. Standard progress uses `floor((maxWidth - standardThreshold) / (fullThreshold - standardThreshold) * 100)`.

## Acceptance criteria

- Compact progress uses the selected standard threshold.
- Standard progress uses the selected standard-to-full interval.
- Active progress is an integer from `0` through `99`.
- Full and preference-limited output without downgrade return no progress.
- Target, distance, and progress use the same effective profile, width, and threshold preset.
- Non-default threshold values remain visible after the percentage marker.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
