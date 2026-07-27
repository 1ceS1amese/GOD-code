from __future__ import annotations

from god_code_engine.transcripts.base import TranscriptStore
from god_code_engine.types import TranscriptEntries, TranscriptEntry


class NoopTranscriptStore(TranscriptStore):
    def append(self, session_id: str, entry: TranscriptEntry) -> None:
        del session_id, entry

    def list_entries(self, session_id: str) -> TranscriptEntries:
        del session_id
        return []
