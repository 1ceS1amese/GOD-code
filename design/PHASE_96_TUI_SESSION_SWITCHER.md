# Phase 96: TUI session switcher

Phase96 implements a basic session switcher flow inside `god-code tui`. It makes transcript history selection explicit: the history pane can select a session, `Enter` activates it as the viewed session, and the renderer marks the viewed session separately from the current keyboard selection.

This phase is a focused TS Host TUI usability improvement. It does not create multiple live Python Engine sessions, does not change JSON-RPC, and does not change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- `viewedSessionId` in `TuiState`.
- `activate_history_session` reducer action.
- History-pane `Enter` key mapping for switching the viewed session.
- Controller handling for `activate_history_session` using the existing timeline loading path.
- Renderer header shows `Live` and `View` session ids separately.
- History rows show both keyboard selection (`>`) and viewed session marker (`*`).
- Help/debug/footer text updated for session switching.
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

- Make the distinction between live engine session and viewed transcript session visible.
- Let users switch the viewed transcript session from the history pane with `Enter`.
- Keep the flow deterministic and local to TS Host TUI state.
- Preserve existing timeline loading and transcript history boundaries.

## Non-goals

- No multi-session live TUI runtime.
- No TUI session daemon.
- No cross-session active turn management.
- No transcript rewrite or schema migration.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Switcher behavior

Current behavior:

- `viewedSessionId` defaults to the first loaded history item when history is available.
- Up/Down in the history pane changes keyboard selection.
- `Enter` in the history pane activates the selected session as the viewed session and moves focus to timeline.
- History rows use `>` for current selection and `*` for the currently viewed session.
- Header shows `Live: <engine-session>` and `View: <transcript-session>`.

## Acceptance criteria

- History-pane `Enter` activates the selected transcript session as the viewed session.
- Renderer exposes both live and viewed session ids.
- History rows distinguish selected session from viewed session.
- Help/debug output documents the switcher state and shortcut.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
