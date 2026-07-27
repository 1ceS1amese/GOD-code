from __future__ import annotations

import threading
from dataclasses import dataclass, field

from god_code_engine.api.god_code_api_models import ToolCatalogEntry
from god_code_engine.models.base import ModelAdapter
from god_code_engine.transcripts.base import TranscriptStore
from god_code_engine.types import JsonObject, Messages


class SessionError(RuntimeError):
    """Raised for invalid session or turn state transitions."""


@dataclass(slots=True)
class ActiveTurn:
    turn_id: str
    cancel_event: threading.Event = field(default_factory=threading.Event)
    thread: threading.Thread | None = None


@dataclass(slots=True)
class SessionState:
    session_id: str
    cwd: str
    tool_catalog: list[ToolCatalogEntry]
    model_adapter_name: str
    model_adapter: ModelAdapter
    transcript_store: TranscriptStore
    messages: Messages = field(default_factory=list)
    provider_context: JsonObject | None = None


class SessionManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[str, SessionState] = {}
        self._active_turns: dict[str, ActiveTurn] = {}

    def create_session(
        self,
        session_id: str,
        cwd: str,
        tool_catalog: list[ToolCatalogEntry],
        model_adapter_name: str,
        model_adapter: ModelAdapter,
        transcript_store: TranscriptStore,
        initial_messages: Messages | None = None,
    ) -> SessionState:
        with self._lock:
            if session_id in self._sessions:
                raise SessionError(f"Session already exists: {session_id}")

            session = SessionState(
                session_id=session_id,
                cwd=cwd,
                tool_catalog=tool_catalog,
                model_adapter_name=model_adapter_name,
                model_adapter=model_adapter,
                transcript_store=transcript_store,
                messages=[dict(message) for message in initial_messages or []],
            )
            self._sessions[session_id] = session
            return session

    def get_session(self, session_id: str) -> SessionState:
        with self._lock:
            return self._require_session(session_id)

    def begin_turn(self, session_id: str, turn_id: str) -> ActiveTurn:
        with self._lock:
            self._require_session(session_id)
            if session_id in self._active_turns:
                raise SessionError("A turn is already in progress for this session.")
            active_turn = ActiveTurn(turn_id=turn_id)
            self._active_turns[session_id] = active_turn
            return active_turn

    def attach_turn_thread(self, session_id: str, turn_id: str, thread: threading.Thread) -> None:
        with self._lock:
            self._require_session(session_id)
            active_turn = self._active_turns.get(session_id)
            if active_turn is None or active_turn.turn_id != turn_id:
                raise SessionError(f"Active turn not found: {turn_id}")
            active_turn.thread = thread

    def finish_turn(self, session_id: str, turn_id: str) -> None:
        with self._lock:
            self._require_session(session_id)
            active_turn = self._active_turns.get(session_id)
            if active_turn is not None and active_turn.turn_id == turn_id:
                del self._active_turns[session_id]

    def cancel_turn(self, session_id: str, turn_id: str) -> bool:
        with self._lock:
            self._require_session(session_id)
            active_turn = self._active_turns.get(session_id)
            if active_turn is None or active_turn.turn_id != turn_id:
                return False
            active_turn.cancel_event.set()
            return True

    def get_active_turn(self, session_id: str) -> ActiveTurn | None:
        with self._lock:
            self._require_session(session_id)
            return self._active_turns.get(session_id)

    def _require_session(self, session_id: str) -> SessionState:
        session = self._sessions.get(session_id)
        if session is None:
            raise SessionError(f"Session not found: {session_id}")
        return session
