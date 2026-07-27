# Phase 146: TUI live session command palette group neighbor adaptive threshold indicators

Phase146 exposes the actual standard/full width boundaries selected by the Phase145 threshold profile. Threshold data now has one shared source for adaptive resolution, renderer indicators, and debug diagnostics.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandNeighborAdaptiveThresholds(...)` as the shared threshold source.
- Added `liveSessionCommandNeighborAdaptiveThresholdLabel(...)` for diagnostic labels.
- Updated the adaptive resolver to consume the shared threshold helper.
- Changed non-default renderer markers from profile names to actual values.
- Rendered dense as `@72/112` and spacious as `@104/144`.
- Preserved the default balanced header without an added marker to protect the existing width budget.
- Expanded debug diagnostics to `neighbor_threshold=name[standard/full]`.
- Added direct helper, renderer, and debug assertions.

## Goals

- Show the actual boundaries that control adaptive neighbor detail.
- Prevent threshold values from drifting across resolver, renderer, and debug code.
- Preserve command palette header capacity for the default profile.
- Keep non-default indicators compact enough for narrow terminals.

## Non-goals

- No new threshold profiles.
- No numeric threshold editing.
- No default balanced threshold-value marker in the renderer header; Phase147 may still show a downgrade distance.
- No configuration-file persistence.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Indicator behavior

- Dense full output: `neighbors(full@72/112):...`.
- Dense downgraded output: `neighbors(full>standard@72/112):...`.
- Balanced output keeps the Phase144 form, such as `neighbors(full):...`.
- Spacious downgraded output: `neighbors(full>compact@104/144):...`.
- Debug always includes both profile and values, such as `neighbor_threshold=balanced[88/128]`.

The two values are the minimum widths for standard and full neighbor detail. Compact applies below the first value, standard applies from the first value to one less than the second, and full is allowed from the second value onward.

## Acceptance criteria

- The resolver reads thresholds through the shared helper.
- Dense, balanced, and spacious helpers return the documented values.
- Diagnostic labels include profile name and both values.
- Non-default renderer headers expose both actual values.
- Default balanced headers retain their Phase144 length.
- Debug diagnostics expose actual values for every threshold profile.
- Existing preference ceilings and adaptive boundaries remain unchanged.
- Focused and complete TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
