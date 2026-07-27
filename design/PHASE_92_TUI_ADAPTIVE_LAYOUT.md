# Phase 92: TUI adaptive layout

Phase92 implements adaptive layout behavior for `god-code tui`. It keeps the existing full dashboard for larger terminals and switches to a compact active-pane layout for constrained terminals.

This phase is a focused TUI renderer improvement. It does not change Python Engine, JSON-RPC, transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Compact renderer path in `ts-host/src/cli/tuiRenderer.ts`.
- Small terminal detection through terminal row count.
- Active-pane prioritization for events/history/timeline/help.
- Approval modal prioritization in compact layout.
- Footer preservation in compact layout.
- Focused compact layout tests in `ts-host/test/tui.test.ts`.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Avoid fixed-order truncation on small terminals.
- Preserve status and prompt visibility.
- Prioritize approval modal when present.
- Prioritize help overlay when visible.
- Otherwise render the currently active pane first.
- Keep footer shortcuts visible in compact layout.
- Keep layout behavior deterministic and unit-testable.

## Non-goals

- No full layout engine.
- No split-pane geometry or column layout.
- No mouse support.
- No persistent layout configuration.
- No terminal capability probing beyond available dimensions.
- No JSON-RPC method addition.
- No Python Engine awareness of TUI layout.

## Layout behavior

For larger terminals, the existing full dashboard remains:

```text
header -> prompt -> events -> history -> timeline -> help/error/approval -> footer
```

For constrained terminals, compact layout is used:

```text
header -> prompt -> prioritized section -> footer
```

Priority order:

1. approval modal;
2. help overlay;
3. active pane.

The compact active pane uses the same scroll offsets and render summaries as the full dashboard.

## Acceptance criteria

- Small terminal frames keep header, prompt, prioritized content, and footer.
- Approval modal is visible on small terminals.
- Active timeline/history/events panes remain usable on small terminals.
- Larger terminal behavior remains compatible with previous tests.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
