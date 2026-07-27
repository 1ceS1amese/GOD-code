# Phase 145: TUI live session command palette group neighbor adaptive threshold controls

Phase145 makes the Phase144 width thresholds selectable through three local presets. Users can press `"` while the command palette is open to cycle `balanced`, `dense`, and `spacious` behavior without changing their preferred neighbor visibility profile.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionCommandNeighborAdaptiveThresholdProfile`.
- Added persistent `liveSessionCommandNeighborAdaptiveThresholdProfile` state.
- Defaulted the threshold profile to `balanced` to preserve Phase144 behavior.
- Added `cycle_live_session_command_neighbor_adaptive_threshold_profile`.
- Added palette-local `"` shortcut.
- Extended `resolveLiveSessionCommandNeighborVisibilityProfile(...)` with a threshold profile.
- Added deterministic `dense`, `balanced`, and `spacious` threshold pairs.
- Added compact non-default renderer profile indicators; Phase146 replaces their names with actual threshold values.
- Added `neighbor_threshold=...` debug diagnostics.
- Preserved threshold selection across palette close/reopen.
- Updated help text and added reducer, threshold-edge, persistence, renderer, debug, and input coverage.

## Goals

- Let users choose how aggressively command neighbor metadata uses terminal width.
- Preserve the visibility profile as the maximum detail level.
- Keep threshold selection local, deterministic, and testable.
- Preserve Phase144 output length for the default `balanced` preset.

## Non-goals

- No arbitrary numeric threshold editing in Phase145.
- No configuration-file persistence.
- No separate compact-to-standard and standard-to-full controls.
- No automatic threshold-profile selection.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Threshold profiles

Each profile defines the minimum renderer `maxWidth` required for `standard` and `full` output:

| Profile | Standard from | Full from |
| --- | ---: | ---: |
| `dense` | 72 | 112 |
| `balanced` | 88 | 128 |
| `spacious` | 104 | 144 |

Widths below the standard threshold use `compact`; widths between the two thresholds use `standard`; widths at or above the full threshold allow `full`. The selected visibility profile remains a ceiling, so a compact preference is never upgraded.

Cycle order is `balanced -> dense -> spacious -> balanced`. Cycling is ignored while the command palette is closed, and the selected preset persists across close/reopen.

The default `balanced` profile does not add a renderer marker, preserving Phase144 header space. Phase145 initially appended non-default profile names; Phase146 replaces those names with actual threshold values. Debug diagnostics expose the selected threshold profile.

## Acceptance criteria

- Default threshold profile is `balanced`.
- Closed-palette cycle actions are no-ops.
- `"` maps to threshold-profile cycling while the palette is open.
- Dense edges resolve at `71/72/111/112`.
- Balanced edges remain `87/88/127/128`.
- Spacious edges resolve at `103/104/143/144`.
- Threshold profiles never override the visibility preference ceiling.
- Dense and spacious renderer output identifies the active preset.
- Debug diagnostics expose `neighbor_threshold` for every state.
- Threshold selection persists across palette close/reopen.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
