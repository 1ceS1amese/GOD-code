# Phase 103: TUI live session pin command

Phase103 adds a pin command for `god-code tui` live sessions. The live session list pane can now toggle the selected session as pinned with `p`; pinned sessions are rendered with a `pinned` marker and sorted before unpinned sessions while preserving the active and selected session identities.

This phase is a focused TS Host TUI list-management improvement. It builds on Phase98 live session list pane, Phase99 per-session event buffers, Phase100 status indicators, Phase101 unread counters, and Phase102 close command. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `pinned` to `TuiLiveSessionItem`.
- Added `toggle_live_session_pin` to `TuiAction`.
- Added live-pane `p` key mapping for pin / unpin.
- Pinned sessions sort before unpinned sessions.
- Active and selected session indices are restored by session id after sorting.
- Live session rows render `pinned` for pinned sessions.
- Debug output includes a compact `live_pinned` line.
- Focused state, input, renderer, help, and debug tests.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Let users keep important live sessions near the top of the TUI list.
- Keep pin state local to TUI state.
- Preserve active and selected session identities when the list is reordered.
- Make pin state visible in normal rendering and debug output.

## Non-goals

- No persistent pin state across TUI restarts.
- No pinned transcript metadata.
- No session rename or custom label support.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Pin behavior

Current behavior:

- Pressing `p` in the live pane dispatches `toggle_live_session_pin`.
- The selected live session is toggled pinned / unpinned.
- Pinned sessions are sorted before unpinned sessions.
- Sorting is stable within the pinned and unpinned groups.
- Active and selected indices are recalculated by session id after sorting.
- New live sessions start unpinned.
- Pinning does not change event buffers, unread counts, session status, or controller session objects.

## Acceptance criteria

- Live pane `p` maps to `toggle_live_session_pin`.
- `TuiLiveSessionItem` carries a boolean `pinned` field.
- Toggling pin reorders pinned sessions before unpinned sessions.
- Active and selected session identities survive reorder.
- Renderer and debug output expose pin state.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
