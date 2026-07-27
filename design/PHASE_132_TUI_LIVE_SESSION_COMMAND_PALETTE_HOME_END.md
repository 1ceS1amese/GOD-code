# Phase 132: TUI live session command palette Home/End navigation

Phase132 adds direct first/last navigation to the `god-code tui` live session command palette. Home jumps to the first command and End jumps to the last command in the current visible scope after search, category, and sort rules are applied.

The jump updates both the selected absolute command index and the Phase129 visible-command scroll anchor. Phase130 indicators therefore immediately report the destination range, while Phase131 page-size configuration remains unchanged.

## Implementation status

Implemented in this phase:

- Added `jump_live_session_command_palette` with `first | last` targets.
- Added palette-specific Home and End key mappings.
- The action is ignored while the command palette is closed.
- Empty visible command sets remain unchanged.
- Home selects visible position zero and sets the explicit anchor to zero.
- End selects the last visible position and sets the anchor to that position.
- Jumps use the same `visibleLiveSessionCommands(...)` search/category/sort scope as selection and paging.
- Absolute catalog command indices remain the execution identity.
- Renderer selection following, group headings, and scroll indicators require no special-case path.
- Help text documents `Home/End bounds`.
- Focused closed no-op, full-scope first/last, category-scope first/last, anchor, indicator, input, and help tests cover the behavior.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Provide constant-time keyboard access to visible command boundaries.
- Keep boundary navigation scoped to the current filtered/sorted command set.
- Synchronize selection and explicit scroll anchor at the destination.
- Reuse existing renderer following and indicator behavior.

## Non-goals

- No selection wrapping in Phase132; Phase133 adds an optional bounded/cyclic mode.
- No Ctrl-Home/Ctrl-End global catalog bypass.
- No jump-to-group shortcut.
- No changes to configured page size.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Navigation behavior

- Home selects the first visible command.
- End selects the last visible command.
- Search, category, and usage/catalog sort determine the visible ordering.
- A one-command scope makes Home and End equivalent.
- An empty scope leaves selection and anchor unchanged.
- Closing and reopening the palette continues to use Phase129 open/reset behavior; Home/End introduces no persistence state.

## Acceptance criteria

- Home maps to a first-command jump while the live palette is open.
- End maps to a last-command jump while the live palette is open.
- Both keys remain unhandled by this feature outside the live palette.
- Closed palette and empty scope are no-op cases.
- Full catalog Home/End reaches visible positions one and total.
- Category-scoped Home/End reaches that category's first and last commands.
- Scroll anchor equals the destination visible position.
- Phase130 header range reflects the destination.
- Help text documents boundary navigation.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
