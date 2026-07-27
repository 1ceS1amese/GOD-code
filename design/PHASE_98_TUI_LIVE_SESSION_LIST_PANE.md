# Phase 98: TUI live session list pane

Phase98 adds a first-class live session list pane to `god-code tui`. The pane exposes all live sessions owned by the TUI controller, lets users select a live session with Up/Down, and activates the selected live session with `Enter`.

This phase is a focused TS Host TUI usability improvement. It builds on Phase97 live session switching and does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `live` to the TUI pane order.
- Added `selectedLiveSessionIndex` and `liveSessionScrollOffset` to `TuiState`.
- Added `select_live_session` and `activate_live_session` TUI actions.
- Up/Down in the live pane selects live sessions.
- `Enter` in the live pane activates the selected live session.
- Full renderer includes a `Live Sessions` section.
- Compact renderer prioritizes the live pane when it is active.
- Help/debug output documents live pane selection and scroll state.
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

- Make live sessions visible as a browsable pane instead of only header/debug text.
- Separate live session keyboard selection from active live session.
- Reuse existing renderer/input/state reducer boundaries.
- Keep active live session switching local to TS Host TUI.

## Non-goals

- No session daemon.
- No cross-process session handoff.
- No concurrent active turns across live sessions.
- No transcript schema migration.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Pane behavior

Current behavior:

- Pane order includes `live` after `prompt`.
- `>` marks the selected live session row.
- `*` marks the active live session row.
- Up/Down changes the selected live session when the live pane is active.
- `Enter` activates the selected live session and returns focus to prompt.
- PageUp/PageDown can scroll the live session list.

## Acceptance criteria

- Live sessions render in full and compact TUI layouts.
- Live pane supports selection and activation through existing key handling.
- Renderer distinguishes selected and active live sessions.
- Help/debug output includes live pane state.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
