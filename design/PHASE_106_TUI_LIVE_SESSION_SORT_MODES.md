# Phase 106: TUI live session sort modes

Phase106 adds local sort modes for the `god-code tui` live session list. The live pane can now cycle sort modes with `s`; visible rows can be ordered by manual order, display name / session id, status, or unread count while preserving selected / active session identity.

This phase is a focused TS Host TUI list-management improvement. It builds on Phase98 live session list pane, Phase99 per-session event buffers, Phase100 status indicators, Phase101 unread counters, Phase102 close command, Phase103 pin command, Phase104 rename command, and Phase105 filter. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionSortMode`.
- Added `liveSessionSortMode` to `TuiState`.
- Added `cycle_live_session_sort_mode` to `TuiAction`.
- Added live-pane `s` key mapping for cycling sort mode.
- Supported sort modes: `manual`, `name`, `status`, and `unread`.
- Kept pinned sessions before unpinned sessions across all sort modes.
- Made filtered visible-row selection respect the active sort mode.
- Renderer shows `sort:<mode>` in the live section title when sort mode is not `manual`.
- Debug output includes a compact `live_sort` line.
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

- Let users order live sessions by useful local criteria.
- Keep sort state local to TUI state.
- Preserve selected and active session identity while changing visible order.
- Compose sort mode with existing filter, pin, rename, status, and unread indicators.

## Non-goals

- No persistent sort state across TUI restarts.
- No engine-side ordering or transcript metadata changes.
- No fuzzy ranking or custom comparator configuration.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Sort behavior

Current behavior:

- Pressing `s` in the live pane dispatches `cycle_live_session_sort_mode`.
- Sort mode cycles through `manual -> name -> status -> unread -> manual`.
- `manual` keeps the existing list order.
- `name` sorts by display name when present, otherwise session id.
- `status` sorts running / stopping / error / idle / starting / stopped.
- `unread` sorts by unread count descending.
- Pinned sessions remain before unpinned sessions in all modes.
- Selection movement operates within the sorted visible rows.
- Sorting does not change event buffers, unread counts, pinned state, display names, session status, or controller session objects.

## Acceptance criteria

- Live pane `s` maps to `cycle_live_session_sort_mode`.
- TUI state carries `liveSessionSortMode`.
- Sort mode cycles through all supported modes.
- Renderer visible rows respect sort mode and filter together.
- Renderer and debug output expose non-manual sort state.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
