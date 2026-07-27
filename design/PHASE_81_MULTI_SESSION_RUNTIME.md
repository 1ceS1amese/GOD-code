# Phase 81: Multi session runtime

Phase81 implements the first multi-session runtime inside one Python Engine process. It upgrades the previous single-session `SessionManager` shape into a session map while preserving the existing JSON-RPC method set and single-turn-per-session invariant.

## Goals

- Allow one Python Engine process to own multiple active `SessionState` objects.
- Keep the existing JSON-RPC methods: `initialize`, `create_session`, `submit_turn`, `cancel_turn`, and `shutdown`.
- Preserve the existing request/response payload shapes; they already carry `session_id`.
- Keep one active turn per session.
- Allow turns from different sessions to run independently.
- Keep session-specific state isolated:
  - cwd
  - tool catalog
  - model adapter instance/name
  - transcript store
  - messages
  - provider context
  - active turn/cancel event/thread
- Preserve existing `run`, `repl`, transcript history, approval UI, MCP, plugin, and provider behavior.
- Add tests that prove two sessions can exist in one engine process and cannot corrupt each other's state.

## Non-goals

- No multi-session CLI UX or TUI session switcher.
- No persisted live process restore.
- No cross-process session registry.
- No session eviction, idle timeout, or daemon lifecycle.
- No multiple concurrent turns inside the same session.
- No parallel tool calls inside one turn.
- No change to `ToolScheduler` semantics.
- No new JSON-RPC methods.
- No transcript schema change.
- No provider API change.
- No shared mutable model context across sessions.

## Previous limitation

`py-engine/src/god_code_engine/session/manager.py` previously stored exactly one session and one active turn:

```py
class SessionManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._session: SessionState | None = None
        self._active_turn: ActiveTurn | None = None
```

Previous behavior:

- A second `create_session` call failed with a duplicate active session error.
- A second `begin_turn` while any turn is active fails, even if the requested session would be different.
- `cancel_turn` checks one global active turn.
- `get_active_turn` returns the one global active turn.

The JSON-RPC protocol already has the required routing key:

```json
{
  "session_id": "..."
}
```

So Phase81 changes runtime state ownership, not the wire protocol.

## Runtime model

Singleton state is replaced with maps:

```py
class SessionManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[str, SessionState] = {}
        self._active_turns: dict[str, ActiveTurn] = {}
```

Rules:

- `create_session(session_id=...)`
  - Rejects duplicate `session_id`.
  - Allows different `session_id` values.
  - Stores a new `SessionState` under that ID.
- `get_session(session_id)`
  - Returns only that session.
  - Fails if the ID is missing.
- `begin_turn(session_id, turn_id)`
  - Requires the target session to exist.
  - Rejects if that same session already has an active turn.
  - Does not reject merely because another session has an active turn.
- `attach_turn_thread(session_id, turn_id, thread)`
  - Checks the active turn under that same `session_id`.
- `finish_turn(session_id, turn_id)`
  - Clears only that session's active turn.
- `cancel_turn(session_id, turn_id)`
  - Cancels only that session's matching active turn.
- `get_active_turn(session_id)`
  - Returns the active turn for that session only.

## Concurrency boundary

Phase81 permits:

```text
session A: one active turn
session B: one active turn
```

Phase81 still rejects:

```text
session A: turn 1 and turn 2 at the same time
```

This is intentionally narrower than full parallel tool scheduling. Each turn still owns its own `TurnEngine` invocation and its own `ToolScheduler`. Tool calls still route through the existing TS Host `execute_tool` request path.

## Python Engine flow

`GodCodeEngineServer.handle_create_session(...)`:

```text
parse params
adapter = provider_registry.get(model_adapter)
session_manager.create_session(...)
emit session_started(session_id)
return created
```

No wire change.

`GodCodeEngineServer.handle_submit_turn(...)`:

```text
session = session_manager.get_session(session_id)
turn_id = uuid4().hex
active_turn = session_manager.begin_turn(session_id, turn_id)
thread = Thread(target=_run_turn_thread, args=(session, turn_id, ...))
session_manager.attach_turn_thread(session_id, turn_id, thread)
thread.start()
return accepted
```

The important invariant is that the `session` object passed into `_run_turn_thread` must be the one resolved by `session_id`, and `finish_turn(session.session_id, turn_id)` must only clear that session's active turn.

`GodCodeEngineServer.handle_cancel_turn(...)`:

```text
found = session_manager.cancel_turn(session_id, turn_id)
if found:
  notify cancel_tool_execution with same session_id and turn_id
return cancel_requested | not_found
```

No wire change.

## TS Host interaction

The TS Host already receives tool requests with:

```ts
session_id
turn_id
tool_call_id
tool_name
input
```

Phase81 does not add a new TS Host protocol layer. Existing components continue to work:

- `GodCodeEngineProcess` routes `execute_tool` requests by payload.
- `HostToolRegistry.executeRequest(...)` already receives the full request.
- Phase80 approval prompt already includes session/turn/tool-call IDs in `ToolApprovalRequest`.
- `runGodCodeSession(...)` still creates one engine and one session for one prompt.
- `GodCodeReplSession` still creates one REPL session.

The main TS test uses one `GodCodeEngineProcess` directly and creates two sessions in the same engine process.

## Transcript behavior

Each session keeps its own `SessionState.transcript_store`.

For JSONL transcript storage:

- Same transcript directory can be shared by multiple sessions.
- Different `session_id` values naturally map to different transcript files.
- No transcript schema change is needed.

Phase81 adds tests that two sessions in the same engine process emit independent session IDs and preserve separate cwd/tool execution state.

## Code touch points

- `py-engine/src/god_code_engine/session/manager.py`
  - Replaced `_session` with `_sessions`.
  - Replaced `_active_turn` with `_active_turns`.
  - Keep public method names stable.
  - Added duplicate-ID and per-session active-turn checks.
- `py-engine/tests/test_session_manager.py`
  - Replaced duplicate-session expectation with duplicate-ID expectation.
  - Added multi-session creation/get tests.
  - Added per-session active-turn tests.
  - Added cancel-is-scoped-to-session tests.
- `py-engine/tests/test_engine_server_phase3.py`
  - Added server-level test that creates two sessions in one server.
  - Added test that duplicate `session_id` still fails.
- `ts-host/test/godCodeEngineProcess.test.ts`
  - Added end-to-end test that one engine process can create two sessions and submit turns to both.
- Docs:
  - `README.md`
  - `PROJECT_PLAN.md`
  - `INTERNAL_DESIGN.md`
  - `ARCHITECTURE.md`
  - `EXTENSION_POINTS.md`
  - `protocol/README.md`

## Test coverage

- Creating `s1` and `s2` in the same `SessionManager` succeeds.
- Creating duplicate `s1` fails.
- `get_session("s1")` and `get_session("s2")` return different objects and isolated message lists.
- `begin_turn("s1", "t1")` and `begin_turn("s2", "t2")` can both succeed.
- A second active turn in `s1` still fails while `s1/t1` is active.
- `finish_turn("s1", "t1")` does not clear `s2/t2`.
- `cancel_turn("s1", "t1")` does not cancel `s2/t2`.
- `GodCodeEngineServer` can create two sessions and emits two `session_started` events.
- `GodCodeEngineProcess` can create two sessions in one Python process and run turns with correct `session_id` on events.

## Verification

Implementation checks:

```bash
cd py-engine
python3 -m pytest tests/test_session_manager.py tests/test_engine_server_phase3.py
cd ../ts-host
npm run build
npm test -- godCodeEngineProcess.test.ts --run
cd ..
./tools/run-cli-smoke.sh
./tools/check.sh
```

## Acceptance criteria

- One Python Engine process accepts two distinct `create_session` calls.
- Duplicate `session_id` still fails deterministically.
- Each session keeps isolated messages, tool catalog, model adapter, transcript store, provider context, and active turn state.
- Different sessions can have active turns at the same time.
- The same session still cannot have two active turns at the same time.
- `cancel_turn` is scoped by both `session_id` and `turn_id`.
- Existing single-session `run`, `repl`, `sessions resume`, transcript, approval UI, MCP, plugin, provider, and smoke behavior remains compatible.
- No JSON-RPC method, request shape, response shape, transcript schema, or provider API change is required.
