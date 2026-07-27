# Phase 142: TUI live session command palette group neighbor command-id indicators

Phase142 extends the Phase141 neighbor indicator with the stable command ID of each neighboring group's first visible command. The palette header and debug diagnostics now use `neighbors:name(size)@key#position:id/name(size)@key#position:id`, for example `neighbors:session(2)@2#2:pin/bulk(3)@x#7:close_inactive`.

The ID is captured together with the first command key when a shared group descriptor is created. Usage sorting can therefore change the displayed key and ID together while the group start position remains aligned with current visible ordering.

## Implementation status

Implemented in this phase:

- Added strongly typed `firstCommandId` to `TuiLiveSessionCommandGroup`.
- Captured the group-start command ID during one-pass group derivation.
- Added `:id` to renderer neighbor diagnostics.
- Added identical `:id` output to debug diagnostics.
- Preserved Phase140 shortcut-key and Phase141 position semantics.
- Preserved wrap-aware neighbor targets and missing-neighbor `-` output.
- Reflected usage-sorted group-start IDs automatically.
- Updated help text to document `@key#position:id`.
- Added focused catalog, usage-sorted, first/middle/last, wrapped boundary, single-group, empty-scope, renderer, debug, and help coverage.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Show the stable command identity reached by neighbor group navigation.
- Keep ID, key, and position derived from the same group-start command.
- Reflect usage sorting without relying on fixed catalog order.
- Preserve shared renderer/debug semantics.

## Non-goals

- Neighbor metadata visibility profiles are added separately in Phase143.
- No command label preview in the compact header.
- No direct execution by displayed command ID.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Indicator behavior

- First group, wrap off: `neighbors:-/session(2)@2#2:pin`.
- Middle group: `neighbors:session(2)@2#2:pin/bulk(3)@x#7:close_inactive`.
- Last group, wrap off: `neighbors:view(3)@4#4:sort/-`.
- Last group, wrap on: `neighbors:view(3)@4#4:sort/favorite(1)@1#1:activate`.
- Usage-sorted view neighbor: `view(3)@5#4:filter`.
- Single group or empty scope: `neighbors:-/-`.

## Acceptance criteria

- Shared group descriptors contain a strongly typed first command ID.
- ID, key, and position originate from the same visible group-start command.
- Renderer and debug diagnostics expose identical IDs.
- Catalog and usage-sorted ordering produce the correct command identity.
- Wrapping changes the target descriptor and displayed ID together.
- Single-group, missing, and empty-scope output remains stable.
- Help text documents the `:id` suffix.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
