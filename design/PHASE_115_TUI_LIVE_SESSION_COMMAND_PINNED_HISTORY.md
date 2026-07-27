# Phase 115: TUI live session command pinned history

Phase115 adds a local pinned-command layer to the `god-code tui` live session command palette. While the palette is open, users can pin or unpin the selected command with `!`, and pinned commands are shown as a compact line above recent commands.

This phase is a focused TS Host TUI discoverability improvement. It builds on Phase109 live session command palette, Phase110 command search, Phase111 command categories, Phase112 command grouping UI, Phase113 command favorites, and Phase114 command history. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `liveSessionPinnedCommandHistory` to `TuiState`.
- Added `toggle_live_session_command_history_pin` TUI action.
- While the command palette is open, `!` toggles the selected visible command in pinned history.
- Pinned command history is local, bounded, and de-duplicated.
- Command palette rendering shows visible pinned commands as `Pinned commands: ...`.
- Pinned-command display composes with command search and category filtering.
- Help output documents the `! pin` shortcut.
- Debug output exposes `live_command_pinned_history`.
- Focused reducer, input, renderer, help, and debug tests cover pinned command history behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Let users highlight commands they want to keep visible.
- Keep pinned command history local, bounded, and deterministic.
- Preserve existing command search, category filtering, grouping, favorites, recent history, selection, and execution behavior.
- Keep the change local to TUI state, input mapping, rendering, help, debug, tests, and docs.

## Non-goals

- No persisted pinned command history.
- No cross-session pinned command history.
- No selectable pinned rows.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Pinned history behavior

Current behavior:

- `!` toggles the selected visible command while the command palette is open.
- Pinned history is stored most-recent-pin-first.
- Re-toggling a pinned command removes it.
- Pinned history is bounded to five command ids.
- The palette shows a pinned-command line only for pinned commands that remain visible under the current search/category filter.
- Command selection ignores the pinned-command line and continues to target command rows only.

## Acceptance criteria

- Palette command pins update local TUI pinned command history.
- Pinned command history is bounded and de-duplicated.
- Renderer shows pinned commands without adding selectable rows.
- Pinned-command display composes with command search and category filtering.
- Help/debug output exposes pinned command history behavior.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
