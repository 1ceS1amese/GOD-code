from pathlib import Path

from god_code_engine.transcripts.in_memory import InMemoryTranscriptStore
from god_code_engine.transcripts.jsonl import JsonlTranscriptStore
from god_code_engine.transcripts.noop import NoopTranscriptStore
from god_code_engine.transcripts.replay import rebuild_messages, rebuild_provider_context


def test_noop_transcript_store_returns_empty() -> None:
    store = NoopTranscriptStore()
    store.append("s1", {"a": 1})

    assert store.list_entries("s1") == []


def test_in_memory_transcript_store_round_trips_entries() -> None:
    store = InMemoryTranscriptStore()
    store.append("s1", {"a": 1})
    store.append("s1", {"b": 2})

    assert store.list_entries("s1") == [{"a": 1}, {"b": 2}]


def test_jsonl_transcript_store_round_trips_entries(tmp_path: Path) -> None:
    store = JsonlTranscriptStore(tmp_path)
    store.append("s1", {"type": "user", "turn_id": "t1", "message": {"role": "user", "content": "hello"}})
    store.append(
        "s1",
        {
            "type": "assistant",
            "turn_id": "t1",
            "message": {"role": "assistant", "content": "world"},
        },
    )

    entries = store.list_entries("s1")

    assert len(entries) == 2
    assert entries[0]["session_id"] == "s1"
    assert entries[0]["turn_id"] == "t1"
    assert entries[0]["type"] == "user"
    assert isinstance(entries[0]["timestamp"], str)
    assert entries[0]["payload"] == {
        "type": "user",
        "turn_id": "t1",
        "message": {"role": "user", "content": "hello"},
    }


def test_rebuild_messages_from_transcript_entries(tmp_path: Path) -> None:
    store = JsonlTranscriptStore(tmp_path)
    store.append("s1", {"type": "user", "turn_id": "t1", "message": {"role": "user", "content": "read a.txt"}})
    store.append("s1", {"type": "tool_call", "turn_id": "t1", "tool_call": {"tool_name": "Read"}})
    store.append(
        "s1",
        {
            "type": "tool_result",
            "turn_id": "t1",
            "tool_name": "Read",
            "result": {"ok": True, "output": {"content": "hello"}},
        },
    )
    store.append(
        "s1",
        {
            "type": "assistant",
            "turn_id": "t1",
            "message": {"role": "assistant", "content": "done"},
        },
    )

    assert rebuild_messages(store.list_entries("s1")) == [
        {"kind": "user", "role": "user", "content": "read a.txt"},
        {"kind": "tool_call", "tool_call": {"tool_name": "Read"}},
        {
            "kind": "tool_result",
            "tool_name": "Read",
            "result": {"ok": True, "output": {"content": "hello"}},
        },
        {"kind": "assistant", "role": "assistant", "content": "done"},
    ]


def test_rebuild_messages_preserves_tool_call_id_on_tool_result(tmp_path: Path) -> None:
    store = JsonlTranscriptStore(tmp_path)
    store.append(
        "s1",
        {
            "type": "tool_result",
            "turn_id": "t1",
            "tool_call_id": "tc1",
            "tool_name": "Read",
            "result": {"ok": True, "output": {"content": "hello"}},
        },
    )

    assert rebuild_messages(store.list_entries("s1")) == [
        {
            "kind": "tool_result",
            "tool_call_id": "tc1",
            "tool_name": "Read",
            "result": {"ok": True, "output": {"content": "hello"}},
        }
    ]


def test_rebuild_provider_context_from_transcript_entries(tmp_path: Path) -> None:
    store = JsonlTranscriptStore(tmp_path)
    store.append(
        "s1",
        {
            "type": "provider_context",
            "turn_id": "t1",
            "provider_context": {
                "provider_name": "openai-responses",
                "response_id": "resp_1",
                "items": [{"type": "message"}],
            },
        },
    )

    assert rebuild_provider_context(store.list_entries("s1")) == {
        "provider_name": "openai-responses",
        "response_id": "resp_1",
        "items": [{"type": "message"}],
    }
