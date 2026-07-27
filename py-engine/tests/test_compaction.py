import pytest

from god_code_engine.compaction.config import (
    ContextCompactionConfigError,
    load_compaction_strategy_from_env,
)
from god_code_engine.compaction.noop import NoopCompactionStrategy
from god_code_engine.compaction.simple import (
    SUMMARY_PREFIX,
    ContextBudget,
    SimpleCompactionStrategy,
)
from god_code_engine.compaction.summary import (
    SUMMARY_COMPACTION_PREFIX,
    SummaryCompactionConfig,
    SummaryCompactionStrategy,
)
from god_code_engine.models.base import ModelOptions
from god_code_engine.types import Messages


def test_context_compaction_config_defaults_to_noop() -> None:
    strategy = load_compaction_strategy_from_env({})

    assert isinstance(strategy, NoopCompactionStrategy)


def test_context_compaction_config_loads_simple_strategy() -> None:
    strategy = load_compaction_strategy_from_env(
        {
            "GOD_CODE_CONTEXT_COMPACTION": "simple",
            "GOD_CODE_CONTEXT_MAX_CHARS": "1000",
            "GOD_CODE_CONTEXT_KEEP_RECENT_MESSAGES": "4",
            "GOD_CODE_CONTEXT_SUMMARY_MAX_CHARS": "200",
        }
    )

    assert isinstance(strategy, SimpleCompactionStrategy)


def test_context_compaction_config_loads_summary_strategy() -> None:
    strategy = load_compaction_strategy_from_env(
        {
            "GOD_CODE_CONTEXT_COMPACTION": "summary",
            "GOD_CODE_CONTEXT_SUMMARY_MAX_CHARS": "1000",
            "GOD_CODE_CONTEXT_SUMMARY_KEEP_RECENT_MESSAGES": "4",
            "GOD_CODE_CONTEXT_SUMMARY_OUTPUT_MAX_CHARS": "200",
            "GOD_CODE_CONTEXT_SUMMARY_INCLUDE_TOOL_RESULTS": "false",
        }
    )

    assert isinstance(strategy, SummaryCompactionStrategy)


def test_context_compaction_config_rejects_invalid_values() -> None:
    with pytest.raises(ContextCompactionConfigError, match="GOD_CODE_CONTEXT_COMPACTION"):
        load_compaction_strategy_from_env({"GOD_CODE_CONTEXT_COMPACTION": "magic"})

    with pytest.raises(ContextCompactionConfigError, match="GOD_CODE_CONTEXT_MAX_CHARS"):
        load_compaction_strategy_from_env({"GOD_CODE_CONTEXT_COMPACTION": "simple"})

    with pytest.raises(ContextCompactionConfigError, match="positive integer"):
        load_compaction_strategy_from_env(
            {
                "GOD_CODE_CONTEXT_COMPACTION": "simple",
                "GOD_CODE_CONTEXT_MAX_CHARS": "0",
            }
        )

    with pytest.raises(ContextCompactionConfigError, match="GOD_CODE_CONTEXT_SUMMARY_MAX_CHARS"):
        load_compaction_strategy_from_env({"GOD_CODE_CONTEXT_COMPACTION": "summary"})

    with pytest.raises(ContextCompactionConfigError, match="GOD_CODE_CONTEXT_SUMMARY_INCLUDE_TOOL_RESULTS"):
        load_compaction_strategy_from_env(
            {
                "GOD_CODE_CONTEXT_COMPACTION": "summary",
                "GOD_CODE_CONTEXT_SUMMARY_MAX_CHARS": "1000",
                "GOD_CODE_CONTEXT_SUMMARY_INCLUDE_TOOL_RESULTS": "maybe",
            }
        )


def test_simple_compaction_keeps_under_budget_messages_as_copy() -> None:
    messages: Messages = [
        {"kind": "user", "content": "hello"},
        {"kind": "assistant", "content": "world"},
    ]
    strategy = SimpleCompactionStrategy(ContextBudget(max_chars=1000))

    compacted = strategy.compact(messages, ModelOptions())

    assert compacted == messages
    assert compacted is not messages


def test_simple_compaction_summarizes_old_messages_and_keeps_recent() -> None:
    messages: Messages = [
        {"kind": "user", "content": "old user question about README " * 20},
        {"kind": "assistant", "content": "old assistant answer " * 20},
        {"kind": "user", "content": "second old user message " * 20},
        {"kind": "assistant", "content": "recent assistant"},
        {"kind": "user", "content": "current user turn"},
    ]
    strategy = SimpleCompactionStrategy(
        ContextBudget(max_chars=360, keep_recent_messages=2, summary_max_chars=220)
    )

    compacted = strategy.compact(messages, ModelOptions())

    assert compacted[0]["kind"] == "user"
    assert str(compacted[0]["content"]).startswith(SUMMARY_PREFIX)
    assert "Compacted 3 messages" in str(compacted[0]["content"])
    assert compacted[-2:] == messages[-2:]
    assert len(compacted) == 3


def test_simple_compaction_preserves_tool_call_result_pair_at_boundary() -> None:
    messages: Messages = [
        {"kind": "user", "content": "older context " * 60},
        {
            "kind": "tool_call",
            "tool_call": {
                "tool_call_id": "tc1",
                "tool_name": "Read",
                "input": {"path": "README.md"},
            },
        },
        {
            "kind": "tool_result",
            "tool_call_id": "tc1",
            "tool_name": "Read",
            "result": {"ok": True, "output": {"content": "hello"}},
        },
        {"kind": "user", "content": "current user turn"},
    ]
    strategy = SimpleCompactionStrategy(
        ContextBudget(max_chars=520, keep_recent_messages=2, summary_max_chars=200)
    )

    compacted = strategy.compact(messages, ModelOptions())

    assert compacted[0]["kind"] == "user"
    assert str(compacted[0]["content"]).startswith(SUMMARY_PREFIX)
    assert compacted[1:] == messages[1:]


def test_simple_compaction_summarizes_large_tool_result_without_full_output() -> None:
    secret_output = "SECRET_TOOL_OUTPUT_" * 30
    messages: Messages = [
        {
            "kind": "tool_result",
            "tool_call_id": "tc1",
            "tool_name": "Read",
            "result": {"ok": True, "output": {"content": secret_output}},
        },
        {"kind": "user", "content": "current user turn"},
    ]
    strategy = SimpleCompactionStrategy(
        ContextBudget(max_chars=280, keep_recent_messages=1, summary_max_chars=180)
    )

    compacted = strategy.compact(messages, ModelOptions())

    summary = str(compacted[0]["content"])
    assert summary.startswith(SUMMARY_PREFIX)
    assert "tool_result: name=Read id=tc1 status=ok" in summary
    assert "SECRET_TOOL_OUTPUT" not in summary
    assert compacted[-1] == messages[-1]


def test_simple_compaction_preserves_current_user_turn_as_last_resort() -> None:
    messages: Messages = [
        {"kind": "user", "content": "old " * 200},
        {"kind": "assistant", "content": "older " * 200},
        {"kind": "user", "content": "current user turn"},
    ]
    strategy = SimpleCompactionStrategy(
        ContextBudget(max_chars=80, keep_recent_messages=2, summary_max_chars=40)
    )

    compacted = strategy.compact(messages, ModelOptions())

    assert compacted == [{"kind": "user", "content": "current user turn"}]


def test_summary_compaction_is_deterministic_and_keeps_recent_messages() -> None:
    messages: Messages = [
        {"kind": "user", "content": "old user question about README " * 20},
        {"kind": "assistant", "content": "old assistant answer " * 20},
        {"kind": "user", "content": "second old user message " * 20},
        {"kind": "assistant", "content": "recent assistant"},
        {"kind": "user", "content": "current user turn"},
    ]
    strategy = SummaryCompactionStrategy(
        SummaryCompactionConfig(
            max_chars=360,
            keep_recent_messages=2,
            summary_max_chars=220,
        )
    )

    compacted = strategy.compact(messages, ModelOptions())
    compacted_again = strategy.compact(messages, ModelOptions())

    assert compacted == compacted_again
    assert compacted[0]["kind"] == "user"
    assert str(compacted[0]["content"]).startswith(SUMMARY_COMPACTION_PREFIX)
    assert "Compacted 3 messages" in str(compacted[0]["content"])
    assert compacted[-2:] == messages[-2:]
    assert len(compacted) == 3
    assert messages[0]["content"] == "old user question about README " * 20


def test_summary_compaction_preserves_tool_call_result_pair_at_boundary() -> None:
    messages: Messages = [
        {"kind": "user", "content": "older context " * 60},
        {
            "kind": "tool_call",
            "tool_call": {
                "tool_call_id": "tc1",
                "tool_name": "Read",
                "input": {"path": "README.md"},
            },
        },
        {
            "kind": "tool_result",
            "tool_call_id": "tc1",
            "tool_name": "Read",
            "result": {"ok": True, "output": {"content": "hello"}},
        },
        {"kind": "user", "content": "current user turn"},
    ]
    strategy = SummaryCompactionStrategy(
        SummaryCompactionConfig(
            max_chars=520,
            keep_recent_messages=2,
            summary_max_chars=200,
        )
    )

    compacted = strategy.compact(messages, ModelOptions())

    assert compacted[0]["kind"] == "user"
    assert str(compacted[0]["content"]).startswith(SUMMARY_COMPACTION_PREFIX)
    assert compacted[1:] == messages[1:]


def test_summary_compaction_bounds_summary_and_can_skip_tool_result_snippets() -> None:
    secret_output = "SECRET_TOOL_OUTPUT_" * 30
    messages: Messages = [
        {"kind": "user", "content": "old " * 80},
        {
            "kind": "tool_result",
            "tool_call_id": "tc1",
            "tool_name": "Read",
            "result": {"ok": True, "output": {"content": secret_output}},
        },
        {"kind": "user", "content": "current user turn"},
    ]
    strategy = SummaryCompactionStrategy(
        SummaryCompactionConfig(
            max_chars=320,
            keep_recent_messages=1,
            summary_max_chars=120,
            include_tool_results=False,
        )
    )

    compacted = strategy.compact(messages, ModelOptions())

    summary = str(compacted[0]["content"])
    assert summary.startswith(SUMMARY_COMPACTION_PREFIX)
    assert len(summary) <= 120
    assert "tool_result: name=Read" not in summary
    assert "SECRET_TOOL_OUTPUT" not in summary
    assert compacted[-1] == messages[-1]
