# Phase 121: TUI live session command usage ranking size

Phase121 adds explicit size controls for the `god-code tui` live session command usage ranking summary. Users can press `+` while the command palette is open to cycle the ranking limit through Top-1, Top-3, and Top-5.

This phase extends Phase119 ranking derivation and Phase120 visibility control. It changes only how many ranked commands are displayed and diagnosed. It does not change usage counting, command execution, command row sorting, or any JSON-RPC, transcript, provider, MCP, plugin, permission, or host tool boundary.

## Implementation status

Implemented in this phase:

- Added `TuiLiveSessionCommandUsageRankingLimit` with supported values `1 | 3 | 5`.
- Added `liveSessionCommandUsageRankingLimit` to `TuiState`, defaulting to `3`.
- Added `cycle_live_session_command_usage_ranking_limit` to the reducer.
- Added `+` as the palette-local ranking size shortcut.
- The size action is ignored while the palette is closed.
- Ranking size cycles deterministically through `1 -> 3 -> 5 -> 1`.
- The selected size persists across palette close and reopen.
- Palette headers expose visibility and limit together as `ranking:on/3` or `ranking:off/3`.
- Renderer and debug diagnostics pass the current limit to the shared ranking derivation.
- Focused input, reducer, Top-1, Top-3, Top-5, and persistence tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Let users choose a compact or expanded usage ranking.
- Keep the supported sizes bounded and deterministic.
- Keep renderer and debug ranking output aligned.
- Preserve ranking visibility, usage counts, filtering, and sorting behavior.

## Non-goals

- No arbitrary numeric ranking limit.
- No automatic terminal-size-based configured-limit mutation; Phase122 adds renderer-only effective-limit adaptation.
- No persisted preference across TUI process restarts.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Size behavior

Current behavior:

- Ranking size starts at Top-3.
- `+` cycles Top-3 to Top-5, Top-5 to Top-1, and Top-1 to Top-3.
- The action only works while the command palette is open.
- The current size remains selected when the palette is closed and reopened.
- Hidden ranking still retains its selected limit.
- The limit applies after search/category scoping and usage ranking.

## Acceptance criteria

- `+` maps to the ranking size action while the palette is open.
- The action is ignored while the palette is closed.
- Only the supported limits `1`, `3`, and `5` are representable.
- The cycle order is deterministic.
- Top-1, Top-3, and Top-5 render the expected number and order of entries.
- The selected size persists across palette close and reopen.
- Header, help, renderer, and debug diagnostics expose or consume the current size.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
