from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from god_code_engine.transcripts.base import TranscriptStore
from god_code_engine.types import JsonObject, TranscriptEntries, TranscriptEntry


class JsonlTranscriptStore(TranscriptStore):
    def __init__(self, root_dir: str | Path) -> None:
        self._root_dir = Path(root_dir)
        self._root_dir.mkdir(parents=True, exist_ok=True)

    def append(self, session_id: str, entry: TranscriptEntry) -> None:
        file_path = self._session_file(session_id)
        payload = dict(entry)
        wire_entry: JsonObject = {
            "session_id": session_id,
            "turn_id": self._string_value(payload, "turn_id"),
            "type": self._string_value(payload, "type") or "unknown",
            "timestamp": datetime.now(UTC).isoformat(),
            "payload": payload,
        }
        with file_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(wire_entry, ensure_ascii=False) + "\n")

    def list_entries(self, session_id: str) -> TranscriptEntries:
        file_path = self._session_file(session_id)
        if not file_path.exists():
            return []

        entries: TranscriptEntries = []
        with file_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                stripped = line.strip()
                if not stripped:
                    continue
                raw = json.loads(stripped)
                if isinstance(raw, dict):
                    entries.append(dict(raw))
        return entries

    def _session_file(self, session_id: str) -> Path:
        safe_session_id = "".join(
            char if char.isalnum() or char in ("-", "_") else "_"
            for char in session_id
        )
        return self._root_dir / f"{safe_session_id}.jsonl"

    def _string_value(self, payload: TranscriptEntry, key: str) -> str:
        value = payload.get(key)
        return value if isinstance(value, str) else ""
