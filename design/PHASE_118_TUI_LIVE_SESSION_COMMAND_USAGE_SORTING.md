# Phase 118: TUI live session command usage sorting

Phase118 adds an explicit usage-based sorting mode to the `god-code tui` live session command palette. Users can press `^` while the palette is open to switch between the original catalog order and usage-ranked order.

This phase builds on Phase117 usage counts without introducing automatic reordering. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `liveSessionCommandSortMode` with `catalog` and `usage` modes.
- Added `cycle_live_session_command_sort_mode` to the TUI reducer.
- Added `^` as the palette-local sort shortcut.
- Usage sorting preserves favorite and category group boundaries.
- Commands within each group sort by descending usage count and then original catalog index.
- Palette headers, help, and debug output expose the active command sort mode.
- Search and category filtering continue to select the first command in the active sorted result.
- Focused input, reducer, renderer, help, and debug tests cover the new behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Let users explicitly rank frequently used commands first.
- Preserve deterministic grouping and stable tie-breaking.
- Keep catalog order as the default mode.
- Keep sorting local to TUI state and rendering.

## Non-goals

- No automatic mode switching based on usage.
- No dedicated usage ranking summary in Phase118; Phase119 adds the derived Top-3 summary.
- No persisted sort preference or usage counters.
- No cross-session or transcript usage analytics.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Sorting behavior

The `catalog` mode returns commands in their declared catalog order.

The `usage` mode applies these keys in order:

1. favorite commands group first;
2. remaining groups follow `session`, `view`, then `bulk`;
3. commands within a group use descending usage count;
4. equal counts fall back to original catalog index.

The sort mode remains active when the palette is closed and reopened. Opening the palette still resets command search and category to their existing defaults.

## Acceptance criteria

- `^` cycles `catalog -> usage -> catalog` while the palette is open.
- The action is ignored while the palette is closed.
- Usage order does not split favorite or category groups.
- Equal counts remain deterministic through catalog-index tie-breaking.
- Search and category filtering use the active sort mode.
- Header, help, and debug output expose the active mode.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
