# Phase 113: TUI live session command favorites

Phase113 adds favorite command metadata to the `god-code tui` live session command palette. Favorite commands render in a dedicated group before the regular category groups, making the highest-frequency command easier to find without changing command execution.

This phase is a focused TS Host TUI discoverability improvement. It builds on Phase109 live session command palette, Phase110 command search, Phase111 command categories, and Phase112 command grouping UI. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `favorite` metadata to `TUI_LIVE_SESSION_COMMANDS`.
- Marked `activate` as the initial favorite live session command.
- Command palette rendering now emits a `-- favorite commands --` group for favorite commands.
- Non-favorite commands continue to render under category group headers.
- Favorite rendering composes with command search and category filtering.
- Selection and execution continue to use the existing command index and TUI action mapping.
- Help output documents that favorites are displayed first.
- Debug output exposes favorite command ids via `live_command_favorites`.
- Focused renderer, help, and debug tests cover favorite command behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Surface the most common live session command first.
- Keep favorites deterministic and metadata-driven.
- Preserve existing command search, category filtering, grouping, selection, and execution behavior.
- Keep the change local to TUI state metadata, rendering, help, debug, tests, and docs.

## Non-goals

- No user-configurable favorites.
- No persisted favorite preference.
- No new favorite toggle action.
- No command reordering outside the existing command list order.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Favorite behavior

Current behavior:

- `activate` is the initial favorite command.
- Favorite commands render under `-- favorite commands --`.
- Non-favorite commands render under their category headers.
- Search results only render the favorite group when a matching favorite command is visible.
- Category-filtered palettes still show matching favorite commands first.
- Command selection ignores group headers and continues to target command rows only.

## Acceptance criteria

- Command metadata includes favorite information.
- Favorite commands render in a dedicated command palette group.
- Favorite grouping composes with command search and category filtering.
- Selection and command execution remain command-only.
- Help/debug output describes favorite state.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
