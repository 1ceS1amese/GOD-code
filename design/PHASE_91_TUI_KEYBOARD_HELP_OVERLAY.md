# Phase 91: TUI keyboard help overlay

Phase91 implements a pane-aware keyboard help overlay for `god-code tui`. It makes the Phase86-Phase90 TUI controls discoverable without changing the engine protocol or runtime boundaries.

This phase is a focused TUI usability improvement. It does not change Python Engine, JSON-RPC, transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- `buildTuiHelpLines(...)` in `ts-host/src/cli/tuiHelp.ts`.
- Pane-aware help content for prompt, events, history, timeline, and help panes.
- Modal-aware help content for TUI approval decisions.
- Running-turn help that shows cancel behavior.
- Renderer integration in `ts-host/src/cli/tuiRenderer.ts`.
- Focused tests in `ts-host/test/tuiHelp.test.ts` and renderer coverage in `ts-host/test/tui.test.ts`.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Make global TUI shortcuts visible from the help pane.
- Show pane-specific controls for prompt, events, history, timeline, and help.
- Prioritize modal approval controls when approval is pending.
- Show turn-specific behavior: submit/quit while idle, cancel while running.
- Keep help rendering deterministic and unit-testable.

## Non-goals

- No configurable keybinding file.
- No mouse support.
- No localization.
- No terminal capability detection change.
- No JSON-RPC method addition.
- No Python Engine awareness of TUI help.

## Help behavior

Global help includes:

- `Tab` switch pane;
- `?` toggle help;
- `Ctrl-L` redraw;
- `Enter` submit while idle;
- `Ctrl-C` quit while idle;
- `Ctrl-C` cancel while running.

Pane-specific help includes:

- prompt editing/submission;
- events older/newer scrolling;
- history session selection and list scrolling;
- timeline scrolling;
- help pane hide/cycle controls.

When an approval modal is active, help prioritizes:

- `y` allow;
- `n` deny;
- `Esc` deny;
- prompt input paused while approval is pending.

## Acceptance criteria

- Help lines are produced by a pure TS helper.
- Renderer uses the helper instead of hard-coded generic help strings.
- Modal approval help takes precedence over normal pane help.
- Running-turn help shows cancellation instead of idle submission.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
