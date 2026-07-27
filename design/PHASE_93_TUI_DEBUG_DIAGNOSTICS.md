# Phase 93: TUI debug diagnostics

Phase93 implements a lightweight TUI debug diagnostics overlay for `god-code tui`. It exposes a bounded state snapshot for troubleshooting TUI behavior without dumping raw provider payloads or changing runtime protocols.

This phase is a focused TS Host TUI diagnostics improvement. It does not change Python Engine, JSON-RPC, transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- `buildTuiDebugLines(...)` in `ts-host/src/cli/tuiDebug.ts`.
- `debugVisible` state flag.
- `toggle_debug` reducer action.
- `Ctrl-G` key mapping for debug overlay toggle.
- Full dashboard and compact layout rendering for `Debug`.
- Help footer/global shortcut updated to mention `Ctrl-G debug`.
- Focused tests in `ts-host/test/tuiDebug.test.ts` and `ts-host/test/tui.test.ts`.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Provide a quick in-TUI state snapshot for debugging.
- Keep diagnostics bounded and deterministic.
- Show session/status/pane, prompt/event/history counts, scroll offsets, selected history/timeline, modal/debug/help flags, turn flags, and last error.
- Avoid raw tool input, provider payloads, headers, secrets, or full transcript contents.
- Keep the diagnostics helper unit-testable without terminal IO.

## Non-goals

- No JSON output mode.
- No persistent debug log.
- No raw event dump.
- No secret-bearing payload rendering.
- No Python Engine diagnostics change.
- No protocol or transcript schema change.

## Debug snapshot fields

Current snapshot lines:

- `session`
- `status` / `pane`
- prompt char count / event count / history count
- events/history/timeline scroll offsets
- selected history index / selected timeline session id
- help/debug/approval flags
- submit/cancel/exit turn flags
- last error

## Acceptance criteria

- `Ctrl-G` toggles debug overlay.
- Full layout can render debug diagnostics.
- Compact layout prioritizes debug diagnostics when enabled and no approval modal is active.
- Debug output is bounded and does not dump raw payloads.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
