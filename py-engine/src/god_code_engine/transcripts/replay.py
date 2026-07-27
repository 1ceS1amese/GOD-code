from __future__ import annotations

from god_code_engine.types import JsonObject, Messages, TranscriptEntries, TranscriptEntry


def rebuild_messages(entries: TranscriptEntries) -> Messages:
    messages: Messages = []
    for entry in entries:
        payload = _payload_for(entry)
        entry_type = payload.get("type")

        if entry_type == "user":
            message = payload.get("message")
            if isinstance(message, dict):
                messages.append(
                    {
                        "kind": "user",
                        "role": _string_or_default(message.get("role"), "user"),
                        "content": _string_or_default(message.get("content"), ""),
                    }
                )
            continue

        if entry_type == "assistant":
            message = payload.get("message")
            if isinstance(message, dict):
                messages.append(
                    {
                        "kind": "assistant",
                        "role": _string_or_default(message.get("role"), "assistant"),
                        "content": _string_or_default(message.get("content"), ""),
                    }
                )
            continue

        if entry_type == "tool_call":
            tool_call = payload.get("tool_call")
            if isinstance(tool_call, dict):
                messages.append({"kind": "tool_call", "tool_call": dict(tool_call)})
            continue

        if entry_type == "tool_result":
            result = payload.get("result")
            message: JsonObject = {
                "kind": "tool_result",
                "tool_name": _string_or_default(payload.get("tool_name"), "unknown"),
                "result": dict(result) if isinstance(result, dict) else {},
            }
            tool_call_id = payload.get("tool_call_id")
            if isinstance(tool_call_id, str):
                message["tool_call_id"] = tool_call_id
            messages.append(message)

    return messages


def rebuild_provider_context(entries: TranscriptEntries) -> JsonObject | None:
    provider_context: JsonObject | None = None
    for entry in entries:
        payload = _payload_for(entry)
        if payload.get("type") != "provider_context":
            continue
        context = payload.get("provider_context")
        if isinstance(context, dict):
            provider_context = dict(context)
    return provider_context


def _payload_for(entry: TranscriptEntry) -> JsonObject:
    payload = entry.get("payload")
    return dict(payload) if isinstance(payload, dict) else entry


def _string_or_default(value: object, fallback: str) -> str:
    return value if isinstance(value, str) else fallback
