# Phase 120: TUI live session command usage ranking visibility

Phase120 adds an explicit visibility control for the `god-code tui` live session command usage ranking summary. Users can press `%` while the command palette is open to show or hide the Phase119 `Usage ranking: ...` row.

This phase changes presentation only. Hiding the summary does not clear usage counts, command history, pinned history, search, category, selection, or command sort mode. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandUsageRankingVisible` to `TuiState`, defaulting to `true`.
- Added `toggle_live_session_command_usage_ranking` to the TUI reducer.
- Added `%` as the palette-local ranking visibility shortcut.
- The action is ignored while the command palette is closed.
- The visibility setting persists across palette close and reopen.
- Palette headers expose `ranking:on` / `ranking:off`.
- Help and debug diagnostics expose the visibility control and current state.
- Hidden ranking leaves command row `uses:<count>` indicators and usage sorting unchanged.
- Focused reducer, input, renderer, persistence, help, and debug tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Let users reduce command palette summary density without discarding usage data.
- Keep visibility state explicit and observable.
- Preserve Phase117 counts, Phase118 sorting, and Phase119 ranking derivation.
- Keep the change local to TUI state, input, rendering, diagnostics, tests, and docs.

## Non-goals

- No persisted preference across TUI process restarts.
- No automatic visibility changes based on terminal size.
- No configurable ranking limit in Phase120; Phase121 adds bounded Top-1 / Top-3 / Top-5 controls.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Visibility behavior

Current behavior:

- Ranking visibility starts enabled.
- `%` toggles visibility only while the palette is open.
- Closing and reopening the palette preserves the current visibility value.
- When hidden, the ranking derivation and usage counts remain available to debug diagnostics and usage sorting.
- History clear still clears the underlying usage counts but does not change the visibility preference.

## Acceptance criteria

- `%` maps to the ranking visibility action while the palette is open.
- The action is ignored while the palette is closed.
- The header shows the current visibility state.
- Hidden mode removes only the `Usage ranking: ...` row.
- Usage counts and usage-sorted command rows remain intact.
- Visibility persists across palette close and reopen.
- Help and debug output expose the control and state.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
