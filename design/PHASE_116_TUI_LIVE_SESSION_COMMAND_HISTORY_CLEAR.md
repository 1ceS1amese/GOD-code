# Phase 116: TUI live session command history clear

Phase116 adds a local clear action for the `god-code tui` live session command palette history. While the palette is open, `@` clears both recent command history and pinned command history.

This phase is a focused TS Host TUI housekeeping improvement. It builds on Phase109 live session command palette, Phase110 command search, Phase111 command categories, Phase112 command grouping UI, Phase113 command favorites, Phase114 command history, and Phase115 pinned command history. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `clear_live_session_command_history` TUI action.
- While the command palette is open, `@` clears command history.
- Clearing removes both `liveSessionCommandHistory` and `liveSessionPinnedCommandHistory`.
- Clearing keeps the command palette open and leaves command selection unchanged.
- Help output documents the `@ clear history` shortcut.
- Focused reducer, input, and help tests cover command history clear behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Provide a deterministic way to clear local command palette history.
- Clear both recent and pinned command history together.
- Preserve existing command search, category filtering, grouping, favorites, selection, and execution behavior.
- Keep the change local to TUI state, input mapping, help, tests, and docs.

## Non-goals

- No persisted history deletion because command history is not persisted.
- No separate clear actions for recent vs pinned history.
- No confirmation prompt.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Clear behavior

Current behavior:

- `@` clears command history only while the live session command palette is open.
- Both recent and pinned command history arrays are cleared.
- The command palette remains open.
- Command selection and command search are not changed.

## Acceptance criteria

- Palette-local clear action removes recent command history.
- Palette-local clear action removes pinned command history.
- Input mapping exposes the clear shortcut.
- Help output documents the clear shortcut.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
