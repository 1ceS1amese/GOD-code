from god_code_engine.api.god_code_api_models import ToolCatalogEntry
from god_code_engine.models.fake import FakeModelAdapter
from god_code_engine.session.manager import SessionError, SessionManager
from god_code_engine.transcripts.in_memory import InMemoryTranscriptStore
import pytest


def create_session(manager: SessionManager, session_id: str):
    return manager.create_session(
        session_id=session_id,
        cwd=".",
        tool_catalog=[ToolCatalogEntry(name="Read", description="read")],
        model_adapter_name="fake",
        model_adapter=FakeModelAdapter(),
        transcript_store=InMemoryTranscriptStore(),
    )


def test_session_manager_accepts_multiple_sessions_and_rejects_duplicate_ids() -> None:
    manager = SessionManager()
    s1 = create_session(manager, "s1")
    s2 = create_session(manager, "s2")

    assert manager.get_session("s1") is s1
    assert manager.get_session("s2") is s2

    with pytest.raises(SessionError):
        create_session(manager, "s1")


def test_session_manager_tracks_active_turns_per_session() -> None:
    manager = SessionManager()
    create_session(manager, "s1")
    create_session(manager, "s2")

    t1 = manager.begin_turn("s1", "t1")
    t2 = manager.begin_turn("s2", "t2")

    with pytest.raises(SessionError):
        manager.begin_turn("s1", "t2")

    assert manager.get_active_turn("s1") is t1
    assert manager.get_active_turn("s2") is t2

    manager.finish_turn("s1", "t1")

    assert manager.get_active_turn("s1") is None
    assert manager.get_active_turn("s2") is t2


def test_session_manager_seeds_initial_messages() -> None:
    manager = SessionManager()
    initial_messages = [{"kind": "user", "role": "user", "content": "previous"}]

    session = manager.create_session(
        session_id="s1",
        cwd=".",
        tool_catalog=[ToolCatalogEntry(name="Read", description="read")],
        model_adapter_name="fake",
        model_adapter=FakeModelAdapter(),
        transcript_store=InMemoryTranscriptStore(),
        initial_messages=initial_messages,
    )
    initial_messages[0]["content"] = "mutated"

    assert session.messages == [{"kind": "user", "role": "user", "content": "previous"}]


def test_session_manager_cancel_turn() -> None:
    manager = SessionManager()
    create_session(manager, "s1")
    create_session(manager, "s2")
    turn1 = manager.begin_turn("s1", "t1")
    turn2 = manager.begin_turn("s2", "t2")

    assert manager.cancel_turn("s1", "t1") is True
    assert turn1.cancel_event.is_set() is True
    assert turn2.cancel_event.is_set() is False
    assert manager.cancel_turn("s1", "t2") is False
