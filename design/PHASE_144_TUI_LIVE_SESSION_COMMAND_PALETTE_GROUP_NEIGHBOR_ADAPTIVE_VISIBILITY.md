# Phase 144: TUI live session command palette group neighbor adaptive visibility

Phase144 makes the Phase143 command-group neighbor visibility profiles responsive to the available palette width. The selected profile remains the user's persistent preference and acts as the maximum detail level; rendering may only downgrade it for narrower terminals.

## Implementation status

Implemented in this phase:

- Added `resolveLiveSessionCommandNeighborVisibilityProfile(...)`.
- Treated the selected `compact / standard / full` profile as a detail ceiling.
- Added deterministic width caps based on the renderer `maxWidth`.
- Kept wide terminals at the preferred profile.
- Downgraded `full` to `standard` or `compact` when the header budget is narrower.
- Downgraded `standard` to `compact` when required.
- Never upgraded a user-selected compact or standard profile automatically.
- Added explicit downgrade markers such as `neighbors(full>standard):`.
- Kept rendering pure: adaptive resolution does not mutate TUI state.
- Updated help text and added threshold, preference-ceiling, rendering, and regression coverage.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Preserve useful neighbor navigation context on narrow terminals.
- Avoid spending limited header width on command position and ID metadata first.
- Respect explicit user density preferences as an upper bound.
- Make automatic downgrades visible and deterministic.

## Non-goals

- No automatic upgrade beyond the selected profile.
- No mutation of the selected profile during rendering.
- No configurable threshold controls in Phase144; Phase145 adds local threshold presets.
- No terminal-width field in debug diagnostics.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Adaptive behavior

The resolver receives the renderer `maxWidth`:

- `maxWidth < 88`: effective profile is capped at `compact`.
- `88 <= maxWidth < 128`: effective profile is capped at `standard`.
- `maxWidth >= 128`: `full` is allowed.

The effective profile is the lower-detail value of the preferred profile and the width cap:

- Preferred `compact` always remains `compact`.
- Preferred `standard` remains `standard` on medium/wide terminals and becomes `compact` on narrow terminals.
- Preferred `full` becomes `compact`, `standard`, or remains `full` according to width.

When a downgrade occurs, the palette header exposes both values, for example `neighbors(full>compact):` or `neighbors(standard>compact):`. If no downgrade occurs, the Phase143 form remains unchanged, such as `neighbors(full):`.

Debug diagnostics do not receive terminal dimensions, so they continue to expose the persistent preferred profile and format neighbors using that profile. This avoids inventing an effective width outside the renderer boundary.

## Acceptance criteria

- Threshold edges at `87`, `88`, `127`, and `128` resolve deterministically.
- Automatic resolution never exceeds the selected profile.
- Narrow rendering preserves compact neighbor names.
- Medium rendering removes command position and ID metadata.
- Wide rendering preserves full Phase142 metadata when preferred.
- Downgraded headers expose preferred and effective profiles.
- Adaptive rendering does not mutate persistent TUI state.
- Debug diagnostics continue to report the preferred profile.
- Help text documents width-adaptive neighbor profiles.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
