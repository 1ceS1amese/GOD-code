# Phase 89: TUI pane scrolling

Phase89 implements independent pane scrolling for `god-code tui`. It builds on Phase86 TUI dashboard, Phase87 screen/timeline polish, and Phase88 modal approval.

This phase is a focused TUI navigation improvement. It does not change Python Engine, JSON-RPC, transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- `timeline` pane in `TuiPane`.
- Independent scroll offsets in `TuiState`:
  - `eventScrollOffset`
  - `historyScrollOffset`
  - `timelineScrollOffset`
- `scroll_pane` reducer action.
- PageUp / PageDown input mapping.
- Up / Down scrolling for events and timeline panes.
- Existing Up / Down history selection remains intact.
- Renderer support for offset windows and visible offset labels.
- Focused tests in `ts-host/test/tui.test.ts`.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Allow events, history, and timeline panes to keep independent scroll positions.
- Keep history selection behavior separate from generic pane scrolling.
- Keep event scrolling useful for live streams where offset `0` means follow latest output.
- Keep selected timeline detail scrollable without reloading transcript data.
- Make scroll behavior deterministic and unit-testable without a real terminal.

## Non-goals

- No mouse wheel handling.
- No scrollbar drawing beyond compact offset labels.
- No persistent layout state.
- No configurable keybinding file.
- No transcript search or semantic navigation.
- No JSON-RPC or Python Engine changes.

## Input behavior

Added:

- `PageUp`: scroll active pane upward / older by five rows.
- `PageDown`: scroll active pane downward / newer by five rows.
- `Up` in `events`: scroll older by one row.
- `Down` in `events`: scroll newer by one row.
- `Up` / `Down` in `history`: keep selecting previous / next session.
- `Up` in `timeline`: scroll upward by one row.
- `Down` in `timeline`: scroll downward by one row.

## State behavior

Event pane uses a newest-following offset:

- `eventScrollOffset = 0`: show latest events.
- increasing offset: inspect older event windows.
- appending events while offset is non-zero preserves the viewed historical window by incrementing offset.

History and timeline panes use top-based offsets:

- `historyScrollOffset`
- `timelineScrollOffset`

History selection still auto-adjusts `historyScrollOffset` to keep the selected item visible.

## Rendering behavior

Renderer now:

- slices events using newest-following offset;
- slices history from `historyScrollOffset`;
- slices timeline entries from `timelineScrollOffset`;
- shows compact offset labels, for example:
  - `History offset 2/9`
  - `Timeline offset 4/12`

## Acceptance criteria

- Events/history/timeline panes can scroll independently.
- Existing history selection and timeline loading still work.
- Modal approval remains unaffected by scroll input routing.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
