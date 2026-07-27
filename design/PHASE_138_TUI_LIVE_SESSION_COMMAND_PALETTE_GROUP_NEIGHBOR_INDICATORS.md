# Phase 138: TUI live session command palette group neighbor indicators

Phase138 adds previous/next visible-group indicators to the `god-code tui` live session command palette. The palette header now includes `neighbors:prev/next`, while debug diagnostics expose `neighbors=prev/next`.

Neighbor derivation uses the same visible group list and the existing Phase133 wrapping preference. At a boundary, `wrap:off` produces `-`; `wrap:on` exposes the group that the next previous/next group action will reach.

## Implementation status

Implemented in this phase:

- Added exported `TuiLiveSessionCommandGroup` descriptor type.
- Added shared `liveSessionCommandGroupNeighbors(...)` derivation.
- Added palette-header `neighbors:prev/next` diagnostics.
- Added debug-line `neighbors=prev/next` diagnostics.
- Kept middle-group neighbors independent of wrapping.
- Made first/last neighbors follow the current wrapping preference.
- Kept single-group and empty scopes at `neighbors:-/-`.
- Updated help text to document `neighbors prev/next`.
- Added focused first/middle/last, wrapped boundary, single-group, empty-scope, renderer, debug, and help coverage.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Show the groups reachable through previous/next group navigation.
- Keep neighbor diagnostics aligned with current visible ordering.
- Reflect wrapping boundaries without duplicating navigation state.
- Preserve single-group and empty-scope clarity.

## Non-goals

- Neighbor group size indicators are added separately in Phase139.
- No direct selection of a displayed neighbor.
- No group history or custom group graph.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Indicator behavior

- First group, wrap off: `neighbors:-/session`.
- Middle group: `neighbors:session/bulk`.
- Last group, wrap off: `neighbors:view/-`.
- Last group, wrap on: `neighbors:view/favorite`.
- First group, wrap on: `neighbors:bulk/session`.
- Single group or empty scope: `neighbors:-/-`.

## Acceptance criteria

- Neighbor derivation is shared by renderer and debug diagnostics.
- Previous/next names come from current visible group ordering.
- First/last boundaries show `-` when wrapping is disabled.
- First/last boundaries show actual wrap targets when wrapping is enabled.
- Single-group and empty scopes do not point back to themselves.
- Header and debug diagnostics expose identical neighbor semantics.
- Help text documents the indicator shape.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
