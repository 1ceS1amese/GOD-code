# Phase 101: TUI per-session unread counters

Phase101 adds per-live-session unread counters to `god-code tui`. Background live session events now increment that session's unread count in the live session list pane, and activating the session clears the count.

This phase is a focused TS Host TUI observability improvement. It builds on Phase99 per-session event buffers and Phase100 status indicators. It does not add JSON-RPC methods, change Python Engine protocol shape, or change transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- Added `unreadCount` to `TuiLiveSessionItem`.
- Background session events increment the target live session's unread count.
- Active session events do not increment unread count.
- Switching / activating a live session clears that session's unread count.
- Live session list rows render `unread:<n>` when unread count is non-zero.
- Debug output includes a compact `live_unread` line.
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

- Surface background live session activity without mixing events across sessions.
- Keep unread state local to TUI state.
- Clear unread counters when the user activates the target live session.
- Preserve per-session event buffer and status indicator behavior.

## Non-goals

- No persistent unread state.
- No transcript schema migration.
- No cross-process notification store.
- No provider-level notification feed.
- No JSON-RPC, protocol, provider, MCP, plugin, or tool boundary changes.

## Counter behavior

Current behavior:

- New live sessions start with `unreadCount: 0`.
- Appending a new event to a non-active live session increments that session's unread count.
- Coalescing an existing streaming assistant row does not double-count unread.
- Activating or switching to a live session clears that session's unread count.
- Active live session events update the visible events pane and do not increment unread count.

## Acceptance criteria

- Live session list rows show unread counts only when non-zero.
- Background events increment unread count for their session.
- Activating the target live session clears unread count.
- Debug output includes per-session unread summaries.
- Focused TUI / REPL tests and TS typecheck pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
