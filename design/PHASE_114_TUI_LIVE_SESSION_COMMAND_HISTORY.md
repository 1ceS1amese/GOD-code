# Phase 114: TUI live session command history

Phase114 adds recent command history to the `god-code tui` live session command palette. Commands executed from the palette are recorded in bounded local TUI state and shown as a compact recent-command line when the palette is reopened.

This phase is a focused TS Host TUI discoverability improvement. It builds on Phase109 live session command palette, Phase110 command search, Phase111 command categories, Phase112 command grouping UI, and Phase113 command favorites. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandHistory` to `TuiState`.
- Added palette-source metadata to live session command actions.
- `tuiActionForLiveSessionCommand(...)` can mark actions as coming from the command palette.
- Reducer records palette command executions in most-recent-first order.
- Command history is bounded and de-duplicated by command id.
- Command palette rendering shows visible recent commands as `Recent commands: ...`.
- Recent-command display composes with command search and category filtering.
- Help output documents recent commands.
- Debug output exposes `live_command_history`.
- Focused reducer, input, renderer, help, and debug tests cover command history behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Make repeated palette commands easier to rediscover.
- Keep command history local, bounded, and deterministic.
- Preserve existing command search, category filtering, grouping, favorites, selection, and execution behavior.
- Keep the change local to TUI state, input mapping, rendering, help, debug, tests, and docs.

## Non-goals

- No persisted command history.
- No cross-session command history.
- No selectable history rows.
- No history clear command in Phase114; Phase116 adds that separately.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## History behavior

Current behavior:

- Only commands executed through the live session command palette are recorded.
- History is stored most-recent-first.
- Re-executing a command moves it to the front instead of duplicating it.
- History is bounded to five command ids.
- The palette shows a recent-command line only for recent commands that remain visible under the current search/category filter.
- Command selection ignores the recent-command line and continues to target command rows only.

## Acceptance criteria

- Palette command executions update local TUI command history.
- Command history is bounded and de-duplicated.
- Renderer shows recent commands without adding selectable rows.
- Recent-command display composes with command search and category filtering.
- Help/debug output exposes command history behavior.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
