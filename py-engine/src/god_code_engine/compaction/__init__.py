"""Context compaction extension points."""

from god_code_engine.compaction.base import CompactionStrategy
from god_code_engine.compaction.config import (
    ContextCompactionConfigError,
    load_compaction_strategy_from_env,
)
from god_code_engine.compaction.noop import NoopCompactionStrategy
from god_code_engine.compaction.simple import ContextBudget, SimpleCompactionStrategy
from god_code_engine.compaction.summary import (
    SummaryCompactionConfig,
    SummaryCompactionStrategy,
)

__all__ = [
    "CompactionStrategy",
    "ContextBudget",
    "ContextCompactionConfigError",
    "NoopCompactionStrategy",
    "SimpleCompactionStrategy",
    "SummaryCompactionConfig",
    "SummaryCompactionStrategy",
    "load_compaction_strategy_from_env",
]
