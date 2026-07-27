# Phase 111: TUI live session command categories

Phase111 adds category filtering to the `god-code tui` live session command palette. While the palette is open, Tab cycles command categories so users can narrow the palette to session, view, or bulk commands before searching and executing a command.

This phase is a focused TS Host TUI discoverability improvement. It builds on Phase109 live session command palette and Phase110 command search. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionCommandCategory`.
- Added command `category` metadata to `TUI_LIVE_SESSION_COMMANDS`.
- Added `liveSessionCommandCategory` to `TuiState`.
- Added `cycle_live_session_command_category` TUI action.
- Updated `visibleLiveSessionCommands(...)` to combine category filtering with command search.
- Added command palette Tab handling for category cycling.
- Renderer shows `cat:<category>` in the command palette header and displays each command category inline.
- Help and debug output expose command category behavior and state.
- Focused reducer, input, renderer, help, and debug tests.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Make the command palette easier to scan as command count grows.
- Keep category filtering local and deterministic.
- Compose category filtering with existing command search.
- Keep command execution routed through existing TUI actions.

## Non-goals

- No user-defined categories.
- No persisted command category preference.
- No global palette category model outside live pane commands.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Category behavior

Current behavior:

- Opening the command palette resets category to `all`.
- Tab cycles `all -> session -> view -> bulk -> all`.
- Category filtering is applied before command search matching.
- Selection moves to the first command visible in the new category.
- Renderer includes command category labels in palette rows.

## Acceptance criteria

- Command metadata includes categories.
- TUI state carries the active command category.
- Tab cycles categories while the command palette is open.
- Search and category filtering compose correctly.
- Renderer/help/debug expose category state.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
