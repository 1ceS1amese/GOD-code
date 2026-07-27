# Phase 110: TUI live session command search

Phase110 adds local search to the `god-code tui` live session command palette. When the command palette is open, printable input filters command rows, Backspace edits the search query, `/` clears the query, Up / Down move through the filtered rows, and Enter runs the selected filtered command.

This phase is a focused TS Host TUI discoverability improvement. It builds on Phase109 live session command palette and keeps using the existing live session actions from Phase102 through Phase108. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandSearch` to `TuiState`.
- Added `visibleLiveSessionCommands(...)` helper.
- Updated `selectedLiveSessionCommand(...)` to respect command search.
- Added `append_live_session_command_search`, `backspace_live_session_command_search`, and `clear_live_session_command_search` TUI actions.
- Updated live-pane command palette key handling:
  - printable text appends to command search while the palette is open.
  - Backspace edits command search.
  - `/` clears command search.
  - Up / Down navigate filtered command rows.
  - Enter executes the selected filtered command.
- Renderer shows command search state and filtered command rows.
- Help and debug output expose command search state.
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

- Make command palette entries easier to find as the live pane command list grows.
- Keep filtering local, deterministic, and testable.
- Reuse existing TUI actions for command execution.
- Avoid changing Python Engine, JSON-RPC, transcript, provider, MCP, plugin, or tool boundaries.

## Non-goals

- No fuzzy ranking or scored search.
- No global command search outside the live pane.
- No persisted command search history.
- No configurable key bindings.
- No provider-backed or model-backed command lookup.

## Search behavior

Current behavior:

- Opening the command palette resets command search.
- Search matches command id, shortcut key, and label.
- Search is normalized to lowercase, trimmed on the left, and capped to a bounded length.
- Up / Down move through matching command rows.
- If search has no matches, renderer shows `No commands match search.` and Enter falls back safely to the default command helper behavior.
- Running an existing command closes the palette through the existing reducer path for that command.

## Acceptance criteria

- Command palette search state is stored in `TuiState`.
- Printable input while the palette is open filters command rows instead of editing the prompt buffer.
- Backspace and `/` edit / clear command search.
- Enter executes the selected filtered command.
- Renderer/help/debug expose search state.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
