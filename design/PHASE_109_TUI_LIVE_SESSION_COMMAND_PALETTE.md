# Phase 109: TUI live session command palette

Phase109 adds a local command palette for the `god-code tui` live session pane. Users can press `:` in the live pane to open a selectable list of live session commands, use Up / Down to choose a command, press Enter to run it, and press Esc to close the palette.

This phase is a focused TS Host TUI discoverability and command-routing improvement. It builds on Phase98 live session list pane, Phase102 close command, Phase103 pin command, Phase105 filter, Phase106 sort modes, Phase107 quick actions, and Phase108 bulk actions. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionCommandId`.
- Added `TUI_LIVE_SESSION_COMMANDS` as the single local command list for the live session palette.
- Added `liveSessionCommandPaletteVisible` and `selectedLiveSessionCommandIndex` to `TuiState`.
- Added `open_live_session_command_palette`, `close_live_session_command_palette`, and `select_live_session_command` TUI actions.
- Added `selectedLiveSessionCommand(...)` and `tuiActionForLiveSessionCommand(...)` helpers.
- Added live-pane key handling:
  - `:` opens the command palette.
  - Up / Down moves command selection while the palette is open.
  - Enter dispatches the selected command as an existing TUI action.
  - Esc closes the palette.
- Renderer shows command palette rows in the live pane.
- Help and debug output expose command palette state.
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

- Make live session actions discoverable without relying only on memorized shortcuts.
- Reuse existing TUI actions so controller-sensitive behavior remains unchanged.
- Keep the command palette local to TS Host TUI state.
- Preserve active / selected live session identity when opening, navigating, or closing the palette.

## Non-goals

- No global command palette outside the live pane.
- No fuzzy search or text query matching.
- No persisted key binding configuration.
- No confirmation modal for destructive commands.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Command palette behavior

Current behavior:

- `:` opens the live session command palette and focuses the live pane.
- Up / Down select commands while the palette is open.
- Enter maps the selected command id to an existing TUI action:
  - activate
  - pin
  - close
  - sort
  - filter
  - clear filter
  - close inactive
  - unpin all
  - mark read
- Esc closes the command palette.
- Running a selected command closes the palette through the existing reducer path for that command.
- The controller still handles close / bulk-close side effects through the same existing action boundaries.

## Acceptance criteria

- Live pane `:` opens a command palette.
- Up / Down navigate command entries while the palette is open.
- Enter dispatches the selected command through existing actions.
- Esc closes the palette.
- Renderer/help/debug expose command palette state.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
