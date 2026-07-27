# Phase 102: TUI live session close command

Phase102 adds a close command for `god-code tui` live sessions. The TUI can now close the selected idle live session from the live session list, stop the associated `TuiSessionLike`, remove its per-session event buffer, and fall back to a remaining live session when the active session is closed.

This phase is a focused TS Host TUI lifecycle improvement. It builds on Phase97 live session switching, Phase98 live session list pane, Phase99 per-session event buffers, Phase100 status indicators, and Phase101 unread counters. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `close_live_session` to `TuiAction`.
- Added `Ctrl-W` key mapping for closing the selected live session.
- Added reducer behavior for removing the selected idle live session.
- Prevented closing the final remaining live session.
- Prevented closing running or stopping live sessions.
- When closing the active live session, the TUI falls back to a remaining session and restores that session's event buffer.
- Removed the closed session's event buffer from TUI state.
- Added `TuiController.closeSelectedLiveSession()` and controller-side `stop()` / map cleanup for the closed `TuiSessionLike`.
- Updated help and footer text to surface the shortcut.
- Added focused state, input, and controller tests.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Let users close no-longer-needed live TUI sessions without exiting the whole TUI.
- Keep close behavior deterministic and local to the selected live session.
- Preserve the invariant that the TUI always has at least one live session while running.
- Avoid losing the visible event pane when closing a background session.
- Clean up the closed controller session object with `stop()`.

## Non-goals

- No force-close for running / stopping turns.
- No persistent closed-session history beyond transcripts.
- No live process restore.
- No transcript schema migration.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Close behavior

Current behavior:

- `Ctrl-W` dispatches `close_live_session`.
- The selected live session is the close target.
- If there is only one live session, the action is ignored.
- If the target is `running` or `stopping`, the action is ignored.
- If a background session is closed, the active session remains active and its events remain visible.
- If the active session is closed, the previous remaining session is preferred as fallback; otherwise the first remaining session is used.
- The closed session's `eventsBySessionId` entry is removed.
- The controller calls `stop()` on the closed `TuiSessionLike` and deletes it from the live session map.
- A system event is appended to the fallback active session after successful close.

## Acceptance criteria

- `Ctrl-W` maps to `close_live_session`.
- Closing an idle selected background session removes it without switching away from the active session.
- Closing an idle active session selects a deterministic fallback session and restores its events.
- Closing the last live session is ignored.
- Closing running / stopping sessions is ignored.
- Controller cleanup stops and removes the closed session object.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
