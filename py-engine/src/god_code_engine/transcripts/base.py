from __future__ import annotations

from god_code_engine.types import TranscriptEntries, TranscriptEntry


class TranscriptStore:
    def append(self, session_id: str, entry: TranscriptEntry) -> None:
        """Append one transcript entry."""
        raise NotImplementedError("TranscriptStore.append must be implemented.")

    def list_entries(self, session_id: str) -> TranscriptEntries:
        """Return transcript entries for the session."""
        raise NotImplementedError("TranscriptStore.list_entries must be implemented.")
