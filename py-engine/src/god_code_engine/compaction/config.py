from __future__ import annotations

import os
from collections.abc import Mapping

from god_code_engine.compaction.base import CompactionStrategy
from god_code_engine.compaction.noop import NoopCompactionStrategy
from god_code_engine.compaction.simple import ContextBudget, SimpleCompactionStrategy
from god_code_engine.compaction.summary import (
    SummaryCompactionConfig,
    SummaryCompactionStrategy,
)


class ContextCompactionConfigError(ValueError):
    """Raised when context compaction environment configuration is invalid."""


DEFAULT_CONTEXT_KEEP_RECENT_MESSAGES = 12
DEFAULT_CONTEXT_SUMMARY_MAX_CHARS = 4000
DEFAULT_CONTEXT_SUMMARY_KEEP_RECENT_MESSAGES = 12
DEFAULT_CONTEXT_SUMMARY_OUTPUT_MAX_CHARS = 4000


def load_compaction_strategy_from_env(
    environ: Mapping[str, str] | None = None,
) -> CompactionStrategy:
    source = environ if environ is not None else os.environ
    mode = _read_optional(source, "GOD_CODE_CONTEXT_COMPACTION") or "none"
    if mode == "none":
        return NoopCompactionStrategy()
    if mode == "summary":
        return _load_summary_compaction_strategy(source)
    if mode != "simple":
        raise ContextCompactionConfigError(
            "GOD_CODE_CONTEXT_COMPACTION must be one of: none, simple, summary."
        )

    return _load_simple_compaction_strategy(source)


def _load_simple_compaction_strategy(source: Mapping[str, str]) -> SimpleCompactionStrategy:
    max_chars = _read_positive_int(source, "GOD_CODE_CONTEXT_MAX_CHARS", required=True)
    keep_recent = _read_positive_int(
        source,
        "GOD_CODE_CONTEXT_KEEP_RECENT_MESSAGES",
        default=DEFAULT_CONTEXT_KEEP_RECENT_MESSAGES,
    )
    summary_max = _read_positive_int(
        source,
        "GOD_CODE_CONTEXT_SUMMARY_MAX_CHARS",
        default=DEFAULT_CONTEXT_SUMMARY_MAX_CHARS,
    )
    return SimpleCompactionStrategy(
        ContextBudget(
            max_chars=max_chars,
            keep_recent_messages=keep_recent,
            summary_max_chars=summary_max,
        )
    )


def _load_summary_compaction_strategy(source: Mapping[str, str]) -> SummaryCompactionStrategy:
    max_chars = _read_positive_int(
        source,
        "GOD_CODE_CONTEXT_SUMMARY_MAX_CHARS",
        required=True,
    )
    keep_recent = _read_positive_int(
        source,
        "GOD_CODE_CONTEXT_SUMMARY_KEEP_RECENT_MESSAGES",
        default=DEFAULT_CONTEXT_SUMMARY_KEEP_RECENT_MESSAGES,
    )
    output_max = _read_positive_int(
        source,
        "GOD_CODE_CONTEXT_SUMMARY_OUTPUT_MAX_CHARS",
        default=DEFAULT_CONTEXT_SUMMARY_OUTPUT_MAX_CHARS,
    )
    include_tool_results = _read_bool(
        source,
        "GOD_CODE_CONTEXT_SUMMARY_INCLUDE_TOOL_RESULTS",
        default=True,
    )
    return SummaryCompactionStrategy(
        SummaryCompactionConfig(
            max_chars=max_chars,
            keep_recent_messages=keep_recent,
            summary_max_chars=output_max,
            include_tool_results=include_tool_results,
        )
    )


def _read_optional(source: Mapping[str, str], key: str) -> str | None:
    value = source.get(key)
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _read_bool(source: Mapping[str, str], key: str, *, default: bool) -> bool:
    raw = _read_optional(source, key)
    if raw is None:
        return default
    normalized = raw.lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ContextCompactionConfigError(f"{key} must be a boolean.")


def _read_positive_int(
    source: Mapping[str, str],
    key: str,
    *,
    required: bool = False,
    default: int | None = None,
) -> int:
    raw = _read_optional(source, key)
    if raw is None:
        if default is not None:
            return default
        if required:
            raise ContextCompactionConfigError(f"Missing required context environment variable: {key}")
        raise ContextCompactionConfigError(f"Missing context environment variable: {key}")
    try:
        value = int(raw, 10)
    except ValueError as exc:
        raise ContextCompactionConfigError(f"{key} must be a positive integer.") from exc
    if value <= 0:
        raise ContextCompactionConfigError(f"{key} must be a positive integer.")
    return value
