from __future__ import annotations

import json
import re
from dataclasses import dataclass

from god_code_engine.compaction.base import CompactionStrategy
from god_code_engine.models.base import ModelOptions
from god_code_engine.types import JsonMapping, JsonObject, Messages

SUMMARY_PREFIX = "[GOD-code compacted history]"


@dataclass(frozen=True, slots=True)
class ContextBudget:
    max_chars: int | None = None
    keep_recent_messages: int = 12
    summary_max_chars: int = 4000

    def __post_init__(self) -> None:
        if self.max_chars is not None and self.max_chars <= 0:
            raise ValueError("max_chars must be a positive integer.")
        if self.keep_recent_messages <= 0:
            raise ValueError("keep_recent_messages must be a positive integer.")
        if self.summary_max_chars <= 0:
            raise ValueError("summary_max_chars must be a positive integer.")


class SimpleCompactionStrategy(CompactionStrategy):
    def __init__(self, budget: ContextBudget) -> None:
        self._budget = budget

    def compact(self, messages: Messages, options: ModelOptions) -> Messages:
        del options
        copied_messages = list(messages)
        if self._budget.max_chars is None:
            return copied_messages
        if _messages_size(copied_messages) <= self._budget.max_chars:
            return copied_messages

        preserve_start = max(0, len(copied_messages) - self._budget.keep_recent_messages)
        preserve_start = _expand_start_for_tool_result_pair(copied_messages, preserve_start)
        compacted = copied_messages[:preserve_start]
        preserved = copied_messages[preserve_start:]

        candidate = _with_summary(compacted, preserved, self._budget.summary_max_chars)
        candidate = _trim_to_budget(candidate, self._budget.max_chars)
        return candidate


def _with_summary(
    compacted: Messages,
    preserved: Messages,
    summary_max_chars: int,
) -> Messages:
    if not compacted:
        return list(preserved)
    return [_summary_message(compacted, summary_max_chars), *preserved]


def _summary_message(messages: Messages, summary_max_chars: int) -> JsonObject:
    lines = [SUMMARY_PREFIX, _count_line(messages)]
    snippets = _summary_snippets(messages)
    if snippets:
        lines.append("Highlights:")
        lines.extend(snippets)
    content = "\n".join(lines)
    return {"kind": "user", "content": _truncate(content, summary_max_chars)}


def _count_line(messages: Messages) -> str:
    counts: dict[str, int] = {}
    for message in messages:
        kind = message.get("kind")
        label = kind if isinstance(kind, str) and kind else "unknown"
        counts[label] = counts.get(label, 0) + 1
    ordered = ["user", "assistant", "tool_call", "tool_result"]
    parts = [f"{key}={counts.pop(key)}" for key in ordered if key in counts]
    parts.extend(f"{key}={counts[key]}" for key in sorted(counts))
    return f"Compacted {len(messages)} messages: " + ", ".join(parts)


def _summary_snippets(messages: Messages) -> list[str]:
    snippets: list[str] = []
    for message in messages:
        kind = message.get("kind")
        if kind in {"user", "assistant"}:
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                snippets.append(f"- {kind}: {_snippet(content)}")
        elif kind == "tool_call":
            tool_call = message.get("tool_call")
            if isinstance(tool_call, dict):
                tool_name = tool_call.get("tool_name")
                tool_call_id = tool_call.get("tool_call_id")
                snippets.append(
                    f"- tool_call: name={_safe_label(tool_name)} id={_safe_label(tool_call_id)}"
                )
        elif kind == "tool_result":
            snippets.append(_tool_result_summary(message))
        if len(snippets) >= 6:
            break
    return snippets


def _tool_result_summary(message: JsonMapping) -> str:
    tool_name = message.get("tool_name")
    tool_call_id = message.get("tool_call_id")
    result = message.get("result")
    status = "unknown"
    if isinstance(result, dict):
        ok = result.get("ok")
        if isinstance(ok, bool):
            status = "ok" if ok else "error"
    return (
        f"- tool_result: name={_safe_label(tool_name)} "
        f"id={_safe_label(tool_call_id)} status={status}"
    )


def _expand_start_for_tool_result_pair(messages: Messages, start: int) -> int:
    if start <= 0 or start >= len(messages):
        return start
    first = messages[start]
    if first.get("kind") != "tool_result":
        return start
    tool_call_id = first.get("tool_call_id")
    previous = messages[start - 1]
    if previous.get("kind") != "tool_call":
        return start
    tool_call = previous.get("tool_call")
    if not isinstance(tool_call, dict):
        return start
    if tool_call.get("tool_call_id") == tool_call_id:
        return start - 1
    return start


def _trim_to_budget(messages: Messages, max_chars: int) -> Messages:
    candidate = list(messages)
    if _messages_size(candidate) <= max_chars:
        return candidate

    if candidate and _is_summary_message(candidate[0]):
        candidate[0] = _trim_summary(candidate[0], candidate[1:], max_chars)
        if _messages_size(candidate) <= max_chars:
            return candidate
        candidate = candidate[1:]

    while len(candidate) > 1 and _messages_size(candidate) > max_chars:
        candidate = candidate[1:]
    return candidate


def _trim_summary(summary: JsonObject, preserved: Messages, max_chars: int) -> JsonObject:
    content = summary.get("content")
    if not isinstance(content, str):
        return summary
    overhead = _messages_size([{"kind": "user", "content": ""}, *preserved])
    available = max(0, max_chars - overhead)
    trimmed_content = _truncate(content, max(len(SUMMARY_PREFIX), available))
    return {"kind": "user", "content": trimmed_content}


def _messages_size(messages: Messages) -> int:
    return sum(_message_size(message) for message in messages)


def _message_size(message: JsonMapping) -> int:
    return len(json.dumps(dict(message), ensure_ascii=False, sort_keys=True, separators=(",", ":")))


def _is_summary_message(message: JsonMapping) -> bool:
    return message.get("kind") == "user" and isinstance(message.get("content"), str) and str(
        message.get("content")
    ).startswith(SUMMARY_PREFIX)


def _snippet(value: str, max_chars: int = 120) -> str:
    collapsed = re.sub(r"\s+", " ", value).strip()
    return _truncate(collapsed, max_chars)


def _truncate(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    if max_chars <= 3:
        return "." * max_chars
    return value[: max_chars - 3] + "..."


def _safe_label(value: object) -> str:
    if isinstance(value, str) and value:
        return _snippet(value, 80)
    return "unknown"
