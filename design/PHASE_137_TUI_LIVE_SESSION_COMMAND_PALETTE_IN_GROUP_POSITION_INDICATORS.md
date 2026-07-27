# Phase 137: TUI live session command palette in-group position indicators

Phase137 extends the Phase136 group size indicator with the selected command's position inside the current visible group. The palette header and debug diagnostics now use `group:N/total:name(item/size)`, for example `group:3/4:view(2/3)`.

The in-group position is derived from the selected visible command position and the shared group's `startPosition`. It does not introduce a second selection index or persistent state, and it automatically follows Up/Down, Home/End, paging, group navigation, search, category, sort, and wrapping behavior.

## Implementation status

Implemented in this phase:

- Derived current in-group position as `selectedPosition - group.startPosition + 1`.
- Extended the palette header to `group:N/total:name(item/size)`.
- Extended debug diagnostics with identical semantics.
- Added empty-scope fallback `group:0/0:-(0/0)`.
- Preserved Phase136 group size as the denominator.
- Kept Phase134 group navigation and all command selection actions authoritative.
- Updated help text to document `item/size`.
- Added focused group-start, group-middle, group-end, category, search, empty-scope, compact-renderer, debug, and help coverage.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Show the selected command's position within the current visible group.
- Reuse shared group start and size data without adding selection state.
- Make group navigation and normal command navigation visibly distinguishable.
- Reflect scoped command ordering automatically.

## Non-goals

- Previous/next group name previews are added separately in Phase138.
- No percentage or progress-bar rendering.
- No custom grouping or group-local selection memory.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Indicator behavior

- Group start: `group:3/4:view(1/3)`.
- Group middle: `group:3/4:view(2/3)`.
- Group end: `group:3/4:view(3/3)`.
- Single-command search scope: `group:1/1:bulk(1/1)`.
- Empty visible scope: `group:0/0:-(0/0)`.
- Group jumps land on `1/size`; normal selection updates the numerator.

## Acceptance criteria

- In-group position is derived from selected visible position and shared group start.
- The denominator remains the Phase136 shared group size.
- Header and debug diagnostics expose identical `item/size` values.
- Group-start, middle, end, single-command, and empty scopes are covered.
- Existing group navigation, wrapping, paging, Home/End, search, category, and sort behavior remains unchanged.
- Help text documents the new indicator shape.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
