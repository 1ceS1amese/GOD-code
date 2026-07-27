from __future__ import annotations

from god_code_engine.compaction.base import CompactionStrategy
from god_code_engine.models.base import ModelOptions
from god_code_engine.types import Messages


class NoopCompactionStrategy(CompactionStrategy):
    def compact(self, messages: Messages, options: ModelOptions) -> Messages:
        del options
        return messages

