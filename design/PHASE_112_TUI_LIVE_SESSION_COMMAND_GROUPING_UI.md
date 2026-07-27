# Phase 112: TUI live session command grouping UI

Phase112 adds grouped rendering to the `god-code tui` live session command palette. Visible commands are separated by category headers so the palette stays scannable as session, view, and bulk commands continue to grow.

This phase is a focused TS Host TUI readability improvement. It builds on Phase109 live session command palette, Phase110 command search, and Phase111 command categories. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Command palette rendering now inserts `-- <category> commands --` group headers.
- Group headers are derived from the existing `TUI_LIVE_SESSION_COMMANDS` category metadata.
- Selection remains command-only and continues to compare against `selectedLiveSessionCommandIndex`.
- Grouping composes with command search and category filtering.
- Help output documents that the palette is grouped by category.
- Debug output exposes the grouping mode as `live_command_grouping=category`.
- Focused renderer, help, and debug tests cover grouped palette behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Make the command palette easier to scan.
- Keep grouping deterministic and based on existing command metadata.
- Preserve command search, category filtering, selection, and execution behavior.
- Keep the change local to TUI state rendering, help, debug, tests, and docs.

## Non-goals

- No selectable group header rows.
- No configurable group order.
- No persisted grouping preference.
- No global command palette model outside live pane commands.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Grouping behavior

Current behavior:

- Visible commands are rendered in their existing order.
- A group header is emitted when the command category changes.
- Search results only render groups that still contain matching commands.
- Category-filtered palettes render the matching group header and its command rows.
- Command selection ignores group headers.

## Acceptance criteria

- Command palette rows are visually grouped by category.
- Grouping composes with command search and category filtering.
- Selection and command execution remain command-only.
- Help/debug output describes the grouping mode.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
