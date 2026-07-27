from __future__ import annotations

from collections import defaultdict
from copy import deepcopy

from god_code_engine.transcripts.base import TranscriptStore
from god_code_engine.types import TranscriptEntries, TranscriptEntry


class InMemoryTranscriptStore(TranscriptStore):
    def __init__(self) -> None:
        self._entries: dict[str, TranscriptEntries] = defaultdict(list)

    def append(self, session_id: str, entry: TranscriptEntry) -> None:
        self._entries[session_id].append(deepcopy(entry))

    def list_entries(self, session_id: str) -> TranscriptEntries:
        return deepcopy(self._entries.get(session_id, []))
