from __future__ import annotations

from god_code_engine.models.base import ModelOptions
from god_code_engine.types import Messages


class CompactionStrategy:
    def compact(self, messages: Messages, options: ModelOptions) -> Messages:
        raise NotImplementedError("CompactionStrategy.compact must be implemented.")
