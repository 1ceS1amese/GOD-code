# Phase 100: TUI per-session status indicators

Phase100 adds per-live-session status indicators to `god-code tui`. The live session list pane now shows each live session's status so multi-session TUI usage is easier to inspect.

This phase is a focused TS Host TUI observability improvement. It builds on Phase97-99 live session switching, live session list pane, and per-session event buffers. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `status` to `TuiLiveSessionItem`.
- `session_started` registers live sessions as `idle`.
- Active live session status updates on `submit_prompt`, `turn_finished`, `request_cancel`, `request_exit`, `set_status`, and `set_error`.
- Live session list rows render status as `[idle]`, `[running]`, `[stopping]`, `[stopped]`, or `[error]`.
- Debug output includes a compact `live_statuses` line.
- Focused tests in `ts-host/test/tui.test.ts` and `ts-host/test/tuiDebug.test.ts`.

Verified:

```bash
cd ts-host
./node_modules/.bin/tsc -p tsconfig.json --noEmit
TMPDIR=/dev/shm ./node_modules/.bin/vitest run test/tui.test.ts test/tuiDebug.test.ts test/tuiHelp.test.ts test/tuiApproval.test.ts test/tuiScreen.test.ts test/tuiPtySmoke.test.ts test/repl.test.ts --run \
  --configLoader runner --environment node --testTimeout 45000 \
  --hookTimeout 45000 --no-file-parallelism
```

## Goals

- Show each live session's current status in the live pane.
- Keep global TUI status and active live session status aligned.
- Preserve session switching and per-session event buffer behavior.
- Keep status tracking local to TS Host TUI state.

## Non-goals

- No concurrent active turns across live sessions.
- No session daemon.
- No provider-level status feed.
- No transcript schema migration.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Status behavior

Current behavior:

- New live sessions start as `idle`.
- Submitting a prompt marks the active live session `running`.
- Cancelling marks the active live session `stopping`.
- Successful or cancelled turn completion returns the active live session to `idle`.
- Error completion or explicit TUI error marks the active live session `error`.
- Exiting marks tracked live sessions as `stopped` or `stopping` depending on the active global status.

## Acceptance criteria

- Live session list rows include status labels.
- Active live session status changes during submit / finish / cancel / error flows.
- Debug output includes per-session status summaries.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
