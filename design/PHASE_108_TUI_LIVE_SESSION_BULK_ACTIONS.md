# Phase 108: TUI live session bulk actions

Phase108 adds safe bulk actions for the `god-code tui` live session pane. The live pane can now close inactive live sessions, unpin all live sessions, and mark all live sessions as read without changing Python Engine or protocol responsibilities.

This phase is a focused TS Host TUI list-management improvement. It builds on Phase98 live session list pane, Phase101 unread counters, Phase102 close command, Phase103 pin command, Phase106 sort modes, and Phase107 quick actions. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `close_inactive_live_sessions` TUI action.
- Added `unpin_all_live_sessions` TUI action.
- Added `clear_all_live_session_unread` TUI action.
- Added live-pane bulk key mappings:
  - `x` closes inactive live sessions.
  - `P` unpins all live sessions.
  - `A` marks all live sessions as read.
- Added `TuiController.closeInactiveLiveSessions()` so controller-owned session objects are stopped and removed after reducer state changes.
- Renderer shows a live pane bulk-action hint row.
- Help, footer, and debug output expose the bulk action map.
- Focused reducer, input, renderer, controller, help, and debug tests.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Make common multi-session cleanup actions available from the live pane.
- Keep active live session identity stable during bulk actions.
- Reuse existing TUI state / controller boundaries.
- Keep all changes local to TS Host TUI.

## Non-goals

- No destructive close-all including the active session.
- No closing running / stopping sessions.
- No confirmation modal for bulk actions.
- No persisted key binding configuration.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Bulk action behavior

Current behavior:

- `x` closes inactive sessions whose status is not `running` or `stopping`; the active live session is kept.
- `P` clears `pinned` from every live session.
- `A` clears `unreadCount` from every live session.
- Bulk close removes event buffers for closed sessions and keeps the active session's event buffer visible.
- Controller bulk close stops and deletes closed `TuiSessionLike` objects, then emits a system event listing the closed session ids.
- Bulk actions do not mutate transcript files or Python Engine session protocol state.

## Acceptance criteria

- Live pane `x`, `P`, and `A` map to the intended bulk actions.
- Reducer preserves active live session identity while closing inactive sessions.
- Controller stops closed inactive session objects.
- Renderer/help/footer/debug expose the bulk actions.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
