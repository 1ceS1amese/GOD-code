# Phase 143: TUI live session command palette group neighbor visibility profiles

Phase143 adds explicit `compact`, `standard`, and `full` visibility profiles for the increasingly detailed command-group neighbor indicator. Users can press `'` while the command palette is open to cycle the profile.

The selected profile is local TUI state, defaults to `full` for compatibility, and persists across palette close/reopen. A shared neighbor-label formatter keeps renderer and debug output aligned.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionCommandNeighborVisibilityProfile`.
- Added persistent `liveSessionCommandNeighborVisibilityProfile` state with default `full`.
- Added `cycle_live_session_command_neighbor_visibility_profile`.
- Added palette-local `'` shortcut.
- Added shared `liveSessionCommandGroupNeighborLabel(...)` formatting.
- Added `compact` output with group names only.
- Added `standard` output with group name, size, and first command key.
- Preserved Phase142 complete metadata in `full` output.
- Added profile-aware header prefixes such as `neighbors(compact):`.
- Added `neighbor_profile=...` debug diagnostics.
- Updated help text and added closed no-op, cycle, formatting, debug, input, and close/reopen persistence coverage.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Let users control neighbor metadata density.
- Preserve full metadata while offering compact headers.
- Keep renderer and debug formatting on one shared helper.
- Persist the selected profile locally across palette reopen.

## Non-goals

- No terminal-width-based automatic profile selection in Phase143; Phase144 adds renderer-local adaptive downgrades.
- No global configuration file persistence.
- No independent previous/next profiles.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Profile behavior

- `compact`: `neighbors(compact):session/bulk`.
- `standard`: `neighbors(standard):session(2)@2/bulk(3)@x`.
- `full`: `neighbors(full):session(2)@2#2:pin/bulk(3)@x#7:close_inactive`.
- Missing, single-group, and empty neighbors remain `-` in every profile.
- Cycle order: `full -> compact -> standard -> full`.
- The profile persists across palette close/reopen.

## Acceptance criteria

- Default profile is `full`.
- Profile cycle is ignored while the palette is closed.
- `'` maps to the profile-cycle action while the palette is open.
- Compact, standard, and full profiles expose the documented fields only.
- Renderer and debug consume the shared formatter.
- Debug diagnostics expose the active profile.
- Profile selection persists across palette close/reopen.
- Help text documents the shortcut and profiles.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
