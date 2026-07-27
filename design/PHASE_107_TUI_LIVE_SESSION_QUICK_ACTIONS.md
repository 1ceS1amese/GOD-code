# Phase 107: TUI live session quick actions

Phase107 adds numeric quick actions for the `god-code tui` live session pane. The live pane now exposes one-key shortcuts for the most common selected-session actions while preserving the existing mnemonic keys and controller boundaries.

This phase is a focused TS Host TUI input / rendering improvement. It builds on Phase98 live session list pane, Phase102 close command, Phase103 pin command, Phase105 filter, and Phase106 sort modes. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added live-pane numeric quick actions:
  - `1` activates the selected live session.
  - `2` pins / unpins the selected live session.
  - `3` closes the selected idle live session.
  - `4` cycles live session sort mode.
  - `5` sets live session filter from the prompt buffer.
  - `0` clears the live session filter.
- Kept existing mnemonic keys: `Enter`, `p`, `r`, `f`, `u`, `s`, and `Ctrl-W`.
- Added an inline live pane quick-action hint row.
- Added footer / help updates so the quick actions are discoverable.
- Added a compact `live_quick_actions` debug line.
- Added focused input, renderer, help, and debug test coverage.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Make high-frequency live session actions faster than mnemonic-only key paths.
- Keep quick actions visible inside the live pane.
- Reuse existing TUI actions so controller-sensitive behavior remains unchanged.
- Preserve active / selected live session identity and existing list semantics.

## Non-goals

- No modal command palette.
- No persisted key binding configuration.
- No bulk live session actions.
- No engine-side command routing.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Quick action behavior

Current behavior:

- Numeric shortcuts only apply when the active pane is `live`.
- `1` maps to `activate_live_session`.
- `2` maps to `toggle_live_session_pin`.
- `3` maps to `close_live_session`.
- `4` maps to `cycle_live_session_sort_mode`.
- `5` maps to `set_live_session_filter`.
- `0` maps to `clear_live_session_filter`.
- The renderer shows `Quick actions: 1 activate | 2 pin | 3 close | 4 sort | 5 filter | 0 unfilter` above live session rows when matching rows exist.
- The debug snapshot exposes the same mapping as `live_quick_actions`.

## Acceptance criteria

- Live pane numeric shortcuts map to the intended existing TUI actions.
- Renderer and help output document the quick actions.
- Debug output exposes the quick action map without raw payload dumps.
- Existing mnemonic shortcuts continue to work.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
