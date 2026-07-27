# Phase 105: TUI live session filter

Phase105 adds a local filter for the `god-code tui` live session list. The live pane can now apply the current prompt buffer as a filter with `f` and clear it with `u`. Filtering is local to TUI state and matches session id, display name, status, pin state, and unread state.

This phase is a focused TS Host TUI list-management improvement. It builds on Phase98 live session list pane, Phase99 per-session event buffers, Phase100 status indicators, Phase101 unread counters, Phase102 close command, Phase103 pin command, and Phase104 rename command. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `liveSessionFilter` to `TuiState`.
- Added `set_live_session_filter` and `clear_live_session_filter` to `TuiAction`.
- Added live-pane `f` key mapping for filter and `u` key mapping for unfilter.
- `set_live_session_filter` uses `action.filter` when provided, otherwise normalizes the current prompt buffer.
- Prompt-buffer filter clears the prompt after applying.
- Live session rendering shows only filtered rows and includes `filter:<value>` in the live section title.
- Selection movement operates across visible filtered rows.
- Debug output includes a compact `live_filter` line.
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

- Let users narrow the live session list when multiple sessions exist.
- Keep filter state local to TUI state.
- Preserve underlying live session identities and controller session objects.
- Make filter state visible in rendering and debug output.

## Non-goals

- No persistent filter state across TUI restarts.
- No transcript search or transcript metadata changes.
- No provider / engine-side filtering.
- No fuzzy search or scoring.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Filter behavior

Current behavior:

- Pressing `f` in the live pane dispatches `set_live_session_filter`.
- Pressing `u` in the live pane dispatches `clear_live_session_filter`.
- If `action.filter` is provided, it is used as the filter value.
- Otherwise the current prompt buffer is normalized and used as the filter value.
- Whitespace is collapsed and the filter is capped at 48 characters.
- Empty filters clear the filter.
- Matching checks `sessionId`, `displayName`, `status`, `pinned` / `unpinned`, and `unread`.
- Selection movement operates within the visible filtered rows.
- Filtering does not change event buffers, unread counts, pinned state, display names, session status, or controller session objects.

## Acceptance criteria

- Live pane `f` maps to `set_live_session_filter`.
- Live pane `u` maps to `clear_live_session_filter`.
- TUI state carries `liveSessionFilter`.
- Renderer only shows matching live sessions while a filter is active.
- Selection movement respects the filtered visible rows.
- Renderer and debug output expose filter state.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
