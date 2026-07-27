# Phase 94: TUI pane focus style

Phase94 implements a minimal active-pane focus marker for `god-code tui`. It makes the currently focused pane visible in section titles for both full dashboard and compact layouts without adding terminal styling dependencies.

This phase is a focused TS Host TUI rendering improvement. It does not change Python Engine, JSON-RPC, transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- `paneTitle(...)` helper in `ts-host/src/cli/tuiRenderer.ts`.
- Active pane titles are prefixed with `* ` in full layout.
- Compact layout uses the same active pane marker for prompt/help/active sections.
- Approval and debug overlays keep their modal/overlay titles unchanged.
- Focused renderer tests in `ts-host/test/tui.test.ts`.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Make the active pane visually clear without relying on ANSI color.
- Keep rendering deterministic and snapshot-friendly.
- Reuse one helper for full and compact layouts.
- Preserve modal/debug overlay priority and existing keyboard behavior.

## Non-goals

- No color theme system.
- No mouse focus handling.
- No terminal capability probing.
- No new TUI state field.
- No JSON-RPC, protocol, transcript, provider, MCP, plugin, or tool boundary changes.

## Focus marker behavior

Current marker behavior:

- Active `prompt`, `events`, `history`, `timeline`, or `help` pane title is rendered as `* <title>`.
- Scroll-aware titles keep their scroll suffix, for example `* Timeline offset 1/3`.
- Non-pane overlays such as `Approval` and `Debug` remain unmarked because they are prioritized overlays, not focus panes.

## Acceptance criteria

- Full layout marks the active pane title.
- Compact layout marks the active pane title when rendering prompt/help/active sections.
- Modal and debug overlay titles remain stable.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
