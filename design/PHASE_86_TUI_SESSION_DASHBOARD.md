# Phase 86: TUI session dashboard

Phase86 implements the first terminal UI shell for GOD-code. It builds on the existing TS Host CLI, Phase10 REPL, Phase70 timeline diagnostics, Phase75-79 transcript search/watch/index diagnostics, Phase80 interactive approval prompt, and Phase81 multi-session runtime.

This phase is a minimal implementation, not the final complete TUI.

## Implementation status

Implemented in this phase:

- `god-code tui` command dispatch in `ts-host/src/cli/main.ts`.
- TUI state reducer in `ts-host/src/cli/tuiState.ts`.
- Deterministic frame renderer in `ts-host/src/cli/tuiRenderer.ts`.
- Key/line input action mapping in `ts-host/src/cli/tuiInput.ts`.
- TUI controller/session wrapper in `ts-host/src/cli/tuiSession.ts`.
- REPL session event tap and session id accessor in `ts-host/src/cli/repl.ts`.
- Unit coverage in `ts-host/test/tui.test.ts`.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Add a minimal `god-code tui` entry point in TS Host.
- Provide a keyboard-driven session dashboard for local terminal use.
- Reuse existing TS Host session/transcript helpers and existing Python Engine JSON-RPC methods.
- Keep Python Engine unaware of whether the host is headless, REPL, or TUI.
- Show bounded, local session state:
  - active TUI session
  - current turn status
  - recent event stream
  - tool call / tool result summaries
  - transcript history list
  - selected session timeline
- Support a single active engine session in the first TUI phase.
- Provide clear degrade behavior for non-interactive terminals.
- Keep all tool execution, permission, approval, audit, MCP, plugin, and provider logic in existing host/runtime boundaries.
- Make the UI testable through deterministic render snapshots / state-machine tests.

## Non-goals

- No GUI or browser UI.
- No new JSON-RPC methods.
- No Python Engine TUI awareness.
- No concurrent turns inside one session.
- No multi-session live process restore.
- No background daemon.
- No unbounded transcript root discovery.
- No semantic search.
- No persistent UI layout config.
- No remote collaboration / sharing.
- No replacement for `run`, `repl`, or `sessions ...` CLI commands.
- No change to TS Host permission policy or approval semantics.

## Current state

Existing interactive surfaces:

- `god-code run <prompt>` for headless one-shot turns.
- `god-code repl` for a single long-running CLI session.
- `sessions list/replay/timeline/resume/search/global-search/...` for transcript history diagnostics.
- `sessions watch` and `sessions index watch-refresh` for short-lived file/index diagnostics.
- `--approval-mode prompt` for explicit terminal approval prompts.

Current REPL boundary:

```text
god-code repl
  -> ts-host/src/cli/repl.ts
  -> GodCodeReplSession
  -> GodCodeEngineProcess
  -> Python Engine session
  -> execute_tool
  -> HostToolRegistry.executeRequest(...)
```

Phase86 should reuse this boundary instead of creating a new engine protocol.

## Proposed command surface

Add:

```bash
god-code tui
god-code tui --transcript-dir <dir>
god-code tui --model-adapter <name>
god-code tui --approval-mode <never|prompt>
god-code tui --no-stream
```

Rules:

- If stdout/stdin is not interactive, fail with a clear usage error.
- `--json` is not supported for TUI.
- TUI should not write machine-readable output to stdout.
- TUI may write fatal startup errors to stderr.

## UI layout

First version layout:

```text
┌ GOD-code ────────────────────────────────────────────────┐
│ Session: <session-id>  Status: idle/running/stopped       │
├ Prompt ──────────────────────────────────────────────────┤
│ > user input area                                         │
├ Events ──────────────────────────────────────────────────┤
│ assistant delta / tool requested / tool result / errors   │
├ History ─────────────────────────────────────────────────┤
│ recent transcript sessions and selected timeline summary  │
└ Help: Ctrl-C cancel/quit | Tab switch pane | Enter submit ┘
```

The first implementation can be simpler than this layout as long as state boundaries are explicit and testable.

## State model

Add TS-side TUI state:

```ts
type TuiPane = "prompt" | "events" | "history" | "help";
type TuiStatus = "starting" | "idle" | "running" | "stopping" | "stopped" | "error";

interface TuiState {
  sessionId?: string;
  status: TuiStatus;
  activePane: TuiPane;
  promptBuffer: string;
  events: TuiEvent[];
  history: TuiHistoryItem[];
  selectedHistoryIndex: number;
  lastError?: string;
}
```

The renderer should be a pure-ish function of state and terminal dimensions:

```ts
renderTuiFrame(state, dimensions) -> string
```

This keeps most behavior testable without a real terminal.

## Runtime architecture

Implemented TS files:

- `ts-host/src/cli/tuiState.ts`
  - state types and reducer-like updates
- `ts-host/src/cli/tuiRenderer.ts`
  - deterministic terminal frame renderer
- `ts-host/src/cli/tuiInput.ts`
  - key parsing and action mapping
- `ts-host/src/cli/tuiSession.ts`
  - wrapper around `GodCodeReplSession` / engine session flow
- `ts-host/src/cli/main.ts`
  - `tui` command dispatch

Recommended flow:

```text
main.ts tui command
  -> create TuiController
  -> create GodCodeReplSession or equivalent shared session wrapper
  -> render initial frame
  -> handle key input
  -> submit prompt through existing session.submit(...)
  -> convert GodCode events into TuiState events
  -> render updated frames
```

## Reuse boundaries

Prefer reuse:

- `GodCodeReplSession` for session lifecycle where possible.
- `TerminalRenderer` logic for assistant delta de-duplication where possible.
- `transcripts/history.ts` for session history list / timeline summaries.
- Phase80 approval prompt path for permission decisions.
- Existing `prepareGodCodeHost(...)` for tool catalog, MCP, plugin, and initial context.

Avoid:

- Direct Python Engine calls outside `GodCodeEngineProcess`.
- Direct tool execution outside `HostToolRegistry.executeRequest(...)`.
- Reading arbitrary transcript roots beyond explicit roots / existing bounded discovery helpers.
- Embedding provider-specific state in the UI.

## Input behavior

Minimum key behavior:

- Printable text edits prompt buffer.
- `Enter` submits prompt when idle and prompt buffer is non-empty.
- `Ctrl-C`:
  - if a turn is running, cancel current turn;
  - otherwise exit TUI.
- `Tab` switches pane.
- `Up` / `Down` moves history selection when history pane is active.
- `?` toggles help pane.

All key actions should map to explicit state actions for unit testing.

## Event model

Convert existing GOD-code events into UI events:

```text
turn_started          -> status running
assistant_delta       -> append/update assistant stream event
assistant_message     -> finalize assistant event
tool_call_requested   -> append tool-call summary
tool_result_received  -> append tool-result summary
god_code_error        -> append error summary
turn_finished         -> status idle/stopped depending result
```

Do not expose raw provider payloads, secrets, headers, or full tool input values by default.

## Approval behavior

Phase86 should reuse Phase80 approval prompt.

If TUI owns the terminal:

- approval prompts should render as a modal-like state or temporarily suspend frame rendering;
- non-interactive prompt mode still fails closed;
- approval decisions still flow through `HostToolRegistry.executeRequest(...)`.

First implementation can choose the conservative route:

- support `--approval-mode deny` by default;
- allow `--approval-mode prompt` only if the TUI controller can safely suspend/redraw around the existing approval prompt.

## Transcript/history behavior

Initial dashboard should use existing bounded helpers:

- current session events from live stream;
- transcript root from current env / `--transcript-dir`;
- recent session list via existing history functions;
- selected timeline through existing timeline renderer/parser where possible.

Do not add:

- background watcher daemon;
- persistent cross-command indexer;
- semantic search;
- destructive transcript repair.

## Testing plan

TS tests:

- state reducer transitions:
  - starting -> idle
  - idle + submit -> running
  - running + turn_finished -> idle
  - running + Ctrl-C -> cancel requested
  - idle + Ctrl-C -> exit requested
- key mapping:
  - printable input
  - Enter submit
  - Tab pane switch
  - Up/Down history selection
  - help toggle
- renderer snapshots:
  - empty state
  - running state
  - assistant stream state
  - tool call/result state
  - error state
  - narrow terminal fallback
- controller tests with fake session:
  - submits prompt through existing session boundary
  - converts events to UI state
  - cancels running turn
  - refuses non-interactive terminal

Integration / smoke:

```bash
node ts-host/dist/cli/main.js tui --help
```

Avoid full interactive terminal smoke until deterministic PTY tests are available.

## Documentation updates

Implementation should update:

- `README.md`
- `PROJECT_PLAN.md`
- `INTERNAL_DESIGN.md`
- `ARCHITECTURE.md`
- `EXTENSION_POINTS.md`
- `protocol/README.md`

## Verification plan

After implementation:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui*.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

If sandbox permissions allow full regression:

```bash
./tools/run-ts-tests.sh
./tools/run-integration-tests.sh
./tools/run-cli-smoke.sh
```

## Acceptance criteria

- A Phase86 implementation has a `god-code tui` entry point.
- TUI state and rendering are testable without a real terminal.
- The TUI reuses existing engine/session/tool boundaries.
- Non-interactive terminal use fails clearly.
- A single live session can submit prompts, stream events, cancel a running turn, and show recent history summaries.
- No JSON-RPC method, request shape, response shape, transcript schema, provider API, MCP protocol, plugin manifest, or TS Host tool execution boundary change is required.

## Phase599 completed integration

Phase599 gives the Phase86 controller a terminal composite lifecycle. Failed start and first render now roll back candidate/registered sessions and screen ownership while preserving the original failure. Run-owned input listeners, pending actions, raw mode, live sessions, and screen cleanup settle through a memoized stop boundary; cleanup-only uncertainty uses one fixed local error. Phase86 state, renderer, input actions, session APIs, and cross-layer schemas remain unchanged.
