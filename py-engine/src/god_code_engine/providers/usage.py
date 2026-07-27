from __future__ import annotations

from dataclasses import dataclass

from god_code_engine.providers.base import ProviderResponseError
from god_code_engine.types import JsonMapping, JsonObject

PROVIDER_USAGE_KEY = "provider_usage"


@dataclass(slots=True)
class ProviderUsage:
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    source: str | None = None


def usage_to_dict(usage: ProviderUsage) -> JsonObject:
    payload: JsonObject = {}
    if usage.input_tokens is not None:
        payload["input_tokens"] = usage.input_tokens
    if usage.output_tokens is not None:
        payload["output_tokens"] = usage.output_tokens
    if usage.total_tokens is not None:
        payload["total_tokens"] = usage.total_tokens
    if usage.source is not None:
        payload["source"] = usage.source
    return payload


def attach_provider_usage(payload: JsonObject, usage: ProviderUsage | None) -> JsonObject:
    if usage is None:
        return payload
    encoded = usage_to_dict(usage)
    if encoded:
        payload[PROVIDER_USAGE_KEY] = encoded
    return payload


def provider_usage_from_payload(payload: JsonMapping) -> ProviderUsage | None:
    raw = payload.get(PROVIDER_USAGE_KEY)
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ProviderResponseError("provider_usage must be an object.")
    return ProviderUsage(
        input_tokens=_optional_non_negative_int(raw, "input_tokens", "provider_usage"),
        output_tokens=_optional_non_negative_int(raw, "output_tokens", "provider_usage"),
        total_tokens=_optional_non_negative_int(raw, "total_tokens", "provider_usage"),
        source=_optional_string(raw, "source", "provider_usage"),
    )


def openai_chat_usage_from_raw(raw: JsonMapping) -> ProviderUsage | None:
    usage = raw.get("usage")
    if usage is None:
        return None
    if not isinstance(usage, dict):
        raise ProviderResponseError("OpenAI usage must be an object.")
    return ProviderUsage(
        input_tokens=_optional_non_negative_int(usage, "prompt_tokens", "OpenAI usage"),
        output_tokens=_optional_non_negative_int(usage, "completion_tokens", "OpenAI usage"),
        total_tokens=_optional_non_negative_int(usage, "total_tokens", "OpenAI usage"),
        source="openai-compatible.usage",
    )


def openai_responses_usage_from_raw(raw: JsonMapping) -> ProviderUsage | None:
    usage = raw.get("usage")
    if usage is None:
        return None
    if not isinstance(usage, dict):
        raise ProviderResponseError("Responses usage must be an object.")
    return ProviderUsage(
        input_tokens=_optional_non_negative_int(usage, "input_tokens", "Responses usage"),
        output_tokens=_optional_non_negative_int(usage, "output_tokens", "Responses usage"),
        total_tokens=_optional_non_negative_int(usage, "total_tokens", "Responses usage"),
        source="openai-responses.usage",
    )


def anthropic_usage_from_raw(raw: JsonMapping) -> ProviderUsage | None:
    usage = raw.get("usage")
    if usage is None:
        return None
    if not isinstance(usage, dict):
        raise ProviderResponseError("Anthropic usage must be an object.")
    input_tokens = _optional_non_negative_int(usage, "input_tokens", "Anthropic usage")
    output_tokens = _optional_non_negative_int(usage, "output_tokens", "Anthropic usage")
    total_tokens = (
        input_tokens + output_tokens
        if input_tokens is not None and output_tokens is not None
        else None
    )
    return ProviderUsage(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        source="anthropic-messages.usage",
    )


def _optional_non_negative_int(raw: JsonMapping, key: str, label: str) -> int | None:
    value = raw.get(key)
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ProviderResponseError(f"{label} field {key} must be a non-negative integer.")
    return value


def _optional_string(raw: JsonMapping, key: str, label: str) -> str | None:
    value = raw.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or value == "":
        raise ProviderResponseError(f"{label} field {key} must be a non-empty string.")
    return value
