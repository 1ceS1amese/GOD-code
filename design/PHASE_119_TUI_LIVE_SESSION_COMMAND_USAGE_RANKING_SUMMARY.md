# Phase 119: TUI live session command usage ranking summary

Phase119 adds a compact usage ranking summary to the `god-code tui` live session command palette. The summary shows up to three used commands from the current search and category scope, ranked by usage count.

This phase builds on Phase117 usage counts and Phase118 explicit usage sorting. It is a read-only derived view: it adds no persistent state and does not change command execution. It also does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `rankedLiveSessionCommandUsage(...)` as the shared ranking derivation.
- Ranking uses the current command search and category scope.
- Only commands with non-zero usage are included.
- The summary is limited to the top three commands.
- Ranking uses descending usage count and original catalog index as the stable tie-breaker.
- The palette renders `Usage ranking: ...` as a non-selectable summary row.
- Debug diagnostics expose the same derived order through `live_command_ranking`.
- Clearing command history and usage counts automatically removes the summary.
- Focused renderer, search-scope, top-three, clear, and debug tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Expose the most-used commands without requiring usage sort mode.
- Keep the summary aligned with the commands currently visible through search and category filters.
- Reuse a deterministic ranking derivation across renderer and debug diagnostics.
- Keep the feature local to TUI state derivation, rendering, diagnostics, tests, and docs.

## Non-goals

- No selectable ranking rows or direct ranking shortcuts.
- No ranking visibility control in Phase119; Phase120 adds an explicit palette-local toggle.
- No persisted ranking snapshot.
- No time decay, recency weighting, or cross-session analytics.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Ranking behavior

The ranking pipeline is:

1. derive commands visible under the current search and category;
2. attach each command's local usage count;
3. remove commands with zero usage;
4. sort by usage count descending;
5. use original catalog index for equal counts;
6. return at most three entries.

The ranking is independent of whether command rows currently use `catalog` or `usage` sort mode. Search, category changes, usage increments, and history clear are reflected immediately because the summary is derived rather than stored.

## Acceptance criteria

- The palette shows a ranking only when at least one visible command has non-zero usage.
- The ranking contains no more than three commands.
- Higher usage appears before lower usage.
- Equal usage follows catalog order.
- Search and category scope update the ranking.
- History clear removes the ranking.
- Debug output exposes the same ranking order.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
