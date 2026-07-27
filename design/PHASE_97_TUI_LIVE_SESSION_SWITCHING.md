# Phase 97: TUI live session switching

Phase97 implements basic live session switching for `god-code tui`. It lets the TUI own multiple live `TuiSessionLike` instances, create a new live session with `Ctrl-N`, and switch the active live session with `Ctrl-P`.

This phase is a focused TS Host TUI runtime improvement. It uses the existing session abstraction and does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- `liveSessions` and `activeLiveSessionIndex` in `TuiState`.
- `create_live_session` and `switch_live_session` TUI actions.
- `Ctrl-N` key mapping for creating a new live session.
- `Ctrl-P` key mapping for switching to the previous live session.
- `TuiController.createLiveSession(...)` and `TuiController.switchLiveSession(...)`.
- Controller storage and cleanup for multiple live `TuiSessionLike` instances.
- Renderer header now shows active live session position, for example `Live: <id> (1/2)`.
- Help/debug/footer text updated for live session switching.
- Focused tests in `ts-host/test/tui.test.ts`, `ts-host/test/tuiHelp.test.ts`, and `ts-host/test/tuiDebug.test.ts`.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Allow a TUI controller to own more than one live session.
- Keep prompt submission and cancellation scoped to the currently active live session.
- Preserve the distinction between live session switching and transcript view switching.
- Make live session position visible in renderer and debug output.
- Stop all live sessions during controller shutdown.

## Non-goals

- No concurrent active turns across sessions.
- No persistent session daemon.
- No cross-process session handoff.
- No live session list pane beyond the existing header/debug indicators.
- No JSON-RPC, protocol, transcript, provider, MCP, plugin, or tool boundary changes.

## Switching behavior

Current behavior:

- Initial TUI startup creates one live session.
- `Ctrl-N` creates and starts a new live session, making it active.
- `Ctrl-P` switches to the previous live session when at least two live sessions exist.
- Live session switching is ignored while the active turn is running or stopping.
- `stop()` shuts down all tracked live sessions.

## Acceptance criteria

- TUI state tracks active live session index and live session ids.
- `Ctrl-N` maps to live session creation and `Ctrl-P` maps to live session switching.
- Controller can create a second live session and route prompt submission to the active session after switching.
- Renderer/debug/help expose live session switching state and shortcuts.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.

## Phase599 completed integration

Phase599 makes shutdown of the Phase97 live-session set all-settled and terminal. Unique sessions are snapshotted once, concurrent/repeated stop callers share one Promise, and inactive-session close attempts every candidate even when one stop throws synchronously. Failed inactive candidates remain under controller ownership for terminal cleanup. Switching state, shortcuts, return shapes, and public session interfaces remain unchanged.
