# Phase 90: TUI assistant stream coalescing

Phase90 implements assistant streaming event coalescing for `god-code tui`. It prevents every `assistant_delta` from becoming a separate TUI event row while preserving the existing engine event stream and JSON-RPC protocol.

This phase is a focused TUI rendering/state improvement. It does not change Python Engine, JSON-RPC, transcript schema, provider APIs, MCP protocol, plugin manifests, permission policy, or host tool execution boundaries.

## Implementation status

Implemented in this phase:

- `TuiEvent.streaming` marker.
- `append_assistant_delta` reducer action.
- `finalize_assistant_message` reducer action.
- Consecutive assistant deltas coalesce into one streaming assistant event.
- Final `assistant_message` finalizes the streaming event and de-duplicates repeated full text.
- TUI event conversion in `ts-host/src/cli/tuiSession.ts` now routes assistant events through the coalescing reducer actions.
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

- Avoid TUI event pane spam from token-level `assistant_delta` events.
- Preserve live assistant streaming visibility.
- Finalize the streaming row when `assistant_message` arrives.
- Avoid duplicate full assistant messages after streamed deltas.
- Keep event coalescing deterministic and unit-testable.
- Preserve existing REPL and headless streaming behavior.

## Non-goals

- No engine event schema change.
- No provider streaming behavior change.
- No transcript compaction.
- No semantic chunking or markdown-aware rendering.
- No TUI layout rewrite.
- No JSON-RPC method addition.

## State behavior

Assistant stream state is represented inside the existing event list:

```ts
interface TuiEvent {
  kind: TuiEventKind;
  text: string;
  timestamp: string;
  streaming?: boolean;
}
```

Reducer behavior:

- `append_assistant_delta`:
  - if the last event is `assistant` and `streaming`, append text to that event;
  - otherwise append a new streaming assistant event.
- `finalize_assistant_message`:
  - if the last event is streaming assistant, replace/finalize it with the longest matching text;
  - otherwise append a final assistant event.

## Runtime behavior

`TuiController` maps GOD-code events:

```text
assistant_delta   -> append_assistant_delta
assistant_message -> finalize_assistant_message
```

Other event kinds still use normal `append_event`.

## Acceptance criteria

- Multiple assistant deltas render as one TUI assistant row.
- Final assistant message does not duplicate the streamed assistant row.
- The assistant row is marked non-streaming after finalization.
- Existing TUI scrolling, modal approval, screen driver, and REPL tests still pass.
- No protocol/schema/provider/MCP/plugin boundary changes are required.
