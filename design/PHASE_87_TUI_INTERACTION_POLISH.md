# Phase 87: TUI interaction polish

Phase87 implements the next TUI increment after the Phase86 minimal session dashboard. The goal is to make the existing `god-code tui` more usable as an interactive terminal surface without changing Python Engine, JSON-RPC, transcript schema, provider APIs, MCP protocol, plugin manifests, or tool execution boundaries.

This phase is a focused TUI polish implementation, not the final complete TUI.

## Implementation status

Implemented in this phase:

- `TuiScreen` terminal screen driver in `ts-host/src/cli/tuiScreen.ts`.
- Raw-mode alternate-screen entry, in-place redraw, cursor hide/show, and terminal restore.
- TUI approval suspend/resume bridge around the existing Phase80 approval prompt path.
- Selected history timeline detail state and rendering.
- Timeline loading through existing `readTranscriptTimelineForSession(...)`.
- Additional input actions for `Esc` and `Ctrl-L`.
- Terminal control and timeline/controller tests in `ts-host/test/tuiScreen.test.ts` and `ts-host/test/tui.test.ts`.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiScreen.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Improve raw-mode rendering so the TUI updates in place instead of appending full frames.
- Add a selected-history timeline detail panel using existing transcript timeline helpers.
- Add a TUI-owned approval modal flow or a safe suspend/redraw bridge around the existing Phase80 approval prompt.
- Add deterministic tests for render diffing / terminal control output.
- Add PTY-level smoke coverage for startup, prompt submission, cancel, and non-interactive refusal when the test environment supports it.
- Keep Phase86 state/input/renderer/controller boundaries intact.
- Keep the TUI local, bounded, single-live-session, and non-daemonized.

## Non-goals

- No GUI or browser UI.
- No multiple concurrent live turns inside one TUI session.
- No live process restore from transcript history.
- No background daemon.
- No semantic search or automatic unbounded transcript discovery.
- No provider-specific UI state.
- No JSON-RPC method additions.
- No Python Engine awareness of TUI.
- No transcript schema changes.
- No replacement for `run`, `repl`, or `sessions ...` commands.

## Phase86 baseline before this implementation

Implemented Phase86 files:

- `ts-host/src/cli/tuiState.ts`
- `ts-host/src/cli/tuiInput.ts`
- `ts-host/src/cli/tuiRenderer.ts`
- `ts-host/src/cli/tuiSession.ts`
- `ts-host/src/cli/main.ts`
- `ts-host/src/cli/repl.ts`
- `ts-host/test/tui.test.ts`

Phase86 behavior:

- `god-code tui` command exists.
- TUI refuses non-interactive terminals by default.
- TUI state/input/render/controller are unit-testable.
- A single live session can submit prompts, receive event summaries, cancel, and show recent transcript history summaries.
- Rendering wrote full frames repeatedly before Phase87.
- Approval prompt mode used the existing terminal prompt path without a TUI screen suspend/resume handoff before Phase87.
- History showed summaries, not a selected timeline detail panel, before Phase87.

## Proposed implementation areas

### 1. Terminal screen driver

Add a small terminal driver layer:

```text
TuiController
  -> TuiScreen
  -> renderTuiFrame(...)
  -> terminal control sequences
```

Proposed file:

- `ts-host/src/cli/tuiScreen.ts`

Responsibilities:

- enter alternate screen when raw-mode TUI starts;
- hide cursor while rendering;
- clear and redraw frame in place;
- restore cursor / raw mode / alternate screen on exit;
- expose deterministic output in tests through a fake terminal output;
- avoid terminal control sequences when running controller tests in non-raw compatibility mode.

Initial control sequence policy:

- `\x1b[?1049h` enter alternate screen;
- `\x1b[?1049l` leave alternate screen;
- `\x1b[?25l` hide cursor;
- `\x1b[?25h` show cursor;
- `\x1b[H` move cursor home;
- `\x1b[2J` clear screen.

All sequences should be centralized in one module.

### 2. History timeline detail panel

Extend TUI state:

```ts
interface TuiState {
  selectedTimeline?: TuiTimelineSummary;
  historyLoading: boolean;
}

interface TuiTimelineSummary {
  sessionId: string;
  entryCount: number;
  turnCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  entries: TuiTimelineEntrySummary[];
}
```

Use existing `readTranscriptTimelineForSession(...)` from `transcripts/history.ts`.

Behavior:

- when history list loads, select index `0` if available;
- when `Up` / `Down` changes selection in history pane, load the selected session timeline;
- render a compact timeline detail panel below or beside history depending terminal height;
- show bounded previews only;
- if loading fails, append a non-fatal TUI error event and keep the session running.

Do not read arbitrary transcript roots. Use the same transcript root already resolved for Phase86.

### 3. Approval modal or safe prompt bridge

Future modal route:

- introduce a `TuiApprovalPrompt` implementing `ToolApprovalPrompt`;
- translate approval requests into TUI modal state;
- allow keyboard actions:
  - `y` allow;
  - `n` deny;
  - `Esc` deny;
- redact / truncate tool input previews;
- keep the final permission decision flowing through `HostToolRegistry.executeRequest(...)`.

Implemented route:

- add explicit screen suspend / resume hooks;
- leave alternate screen;
- call existing `TerminalApprovalPrompt`;
- re-enter alternate screen and redraw after a decision.

The Phase87 implementation uses the suspend/resume bridge. A full modal can replace it later without changing the permission decision boundary.

### 4. Input and rendering polish

Input additions:

- `Esc` returns focus to prompt or exits help/modal state.
- `Ctrl-L` forces redraw.
- `PageUp` / `PageDown` scroll event/history panes when scroll state is added.

Renderer additions:

- status line includes current model adapter and transcript root basename;
- active pane is visibly marked;
- event summaries are de-duplicated for assistant streaming;
- narrow terminal fallback remains deterministic and covered by tests.

### 5. PTY smoke tests

Add optional PTY tests only if a dependency-free or already-present mechanism is available.

Candidate tests:

- `god-code tui --help` exits with usage text.
- non-interactive `god-code tui` exits with clear error.
- raw-mode TUI startup emits alternate-screen enter sequence.
- Ctrl-C exits idle TUI and restores terminal sequence.

If true PTY coverage requires new dependencies, keep it as a documented optional follow-up rather than adding a new dependency in Phase87.

## Proposed files

Implemented additions:

- `ts-host/src/cli/tuiScreen.ts`
- approval bridge inside `ts-host/src/cli/tuiSession.ts`
- `ts-host/test/tuiScreen.test.ts`

Deferred optional additions:

- `ts-host/src/cli/tuiApproval.ts` if a full modal approval path is added later
- `ts-host/test/tuiApproval.test.ts` if modal approval is implemented

Likely updates:

- `ts-host/src/cli/tuiState.ts`
- `ts-host/src/cli/tuiInput.ts`
- `ts-host/src/cli/tuiRenderer.ts`
- `ts-host/src/cli/tuiSession.ts`
- `ts-host/test/tui.test.ts`
- `README.md`
- `PROJECT_PLAN.md`
- `INTERNAL_DESIGN.md`
- `ARCHITECTURE.md`
- `EXTENSION_POINTS.md`
- `protocol/README.md`

## Testing plan

TS unit tests:

- `tuiScreen`:
  - enters/leaves alternate screen;
  - renders in place;
  - restores cursor on stop;
  - is idempotent on double stop.
- `tuiState`:
  - history selection requests timeline refresh;
  - timeline loading success/failure states;
  - modal approval state transitions if implemented.
- `tuiInput`:
  - `Esc`;
  - `Ctrl-L`;
  - `PageUp` / `PageDown`;
  - modal approval keys if implemented.
- `tuiRenderer`:
  - selected timeline detail panel;
  - active pane marker;
  - narrow terminal fallback.
- `tuiSession`:
  - selected history loads timeline through existing helper;
  - cancel still works while screen driver is active;
  - screen restore runs on normal exit and thrown error.

Focused verification:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui*.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

Optional smoke if build output and terminal support are available:

```bash
node ts-host/dist/cli/main.js tui --help
```

## Acceptance criteria

- TUI raw-mode rendering updates in place and restores terminal state on exit/error.
- History pane can show bounded selected-session timeline details.
- Approval prompt mode has either a TUI modal or a safe suspend/redraw bridge.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
- Non-interactive refusal remains clear.
- Existing Phase86 submit/cancel/event/history behavior remains covered.
- Focused TS typecheck and TUI/REPL tests pass.
