# Phase 104: TUI live session rename command

Phase104 adds a local display-name command for `god-code tui` live sessions. The live pane can now rename the selected session with `r` using the current prompt buffer as the new display name. The underlying `sessionId` remains unchanged and is still shown in parentheses.

This phase is a focused TS Host TUI list-management improvement. It builds on Phase98 live session list pane, Phase99 per-session event buffers, Phase100 status indicators, Phase101 unread counters, Phase102 close command, and Phase103 pin command. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added optional `displayName` to `TuiLiveSessionItem`.
- Added `rename_live_session` to `TuiAction`.
- Added live-pane `r` key mapping for rename.
- `rename_live_session` uses `action.label` when provided, otherwise normalizes the current prompt buffer.
- Prompt-buffer rename clears the prompt after a successful rename.
- Live session rows render `displayName (sessionId)` when a display name exists.
- Debug output includes a compact `live_names` line.
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

- Let users distinguish multiple live sessions with a short local label.
- Keep the immutable `sessionId` visible and unchanged.
- Keep rename state local to TUI state.
- Avoid protocol, transcript, provider, MCP, plugin, or tool boundary changes.

## Non-goals

- No persistent rename state across TUI restarts.
- No transcript metadata rename.
- No engine-side session rename RPC.
- No dedicated text-entry modal.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Rename behavior

Current behavior:

- Pressing `r` in the live pane dispatches `rename_live_session`.
- The selected live session is the rename target.
- If `action.label` is provided, it is used as the display name.
- Otherwise the current prompt buffer is normalized and used as the display name.
- Whitespace is collapsed and the display name is capped at 48 characters.
- Empty display names are ignored.
- Prompt-buffer rename clears the prompt buffer after success.
- Rendering shows `displayName (sessionId)` while preserving the underlying session id.
- Rename does not change event buffers, unread counts, pinned state, session status, or controller session objects.

## Acceptance criteria

- Live pane `r` maps to `rename_live_session`.
- `TuiLiveSessionItem` carries optional `displayName`.
- Renaming updates only the selected session's display name.
- Underlying `sessionId` and active / selected identity remain unchanged.
- Renderer and debug output expose display names.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
