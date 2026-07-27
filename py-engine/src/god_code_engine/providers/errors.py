from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Literal
from urllib.parse import urlparse

from god_code_engine.types import JsonMapping


ProviderErrorCategory = Literal[
    "auth",
    "permission",
    "rate_limit",
    "quota",
    "context_length",
    "model_not_found",
    "invalid_request",
    "content_policy",
    "server_error",
    "network",
    "invalid_response",
    "unknown",
]


@dataclass(frozen=True, slots=True)
class ProviderErrorInfo:
    category: ProviderErrorCategory
    provider: str | None = None
    status_code: int | None = None
    provider_error_type: str | None = None
    provider_error_code: str | None = None
    retryable: bool = False


_SAFE_PROVIDER_TOKEN = re.compile(r"^[A-Za-z0-9_.:-]{1,80}$")
_RETRYABLE_HTTP_STATUSES = {429, 500, 502, 503, 504}
_SERVER_HTTP_STATUSES = {500, 502, 503, 504}


def provider_error_message(info: ProviderErrorInfo) -> str:
    provider = f" from {info.provider}" if info.provider else ""
    details: list[str] = []
    if info.status_code is not None:
        details.append(f"HTTP {info.status_code}")
    if info.provider_error_code is not None:
        details.append(f"code={info.provider_error_code}")
    if info.provider_error_type is not None:
        details.append(f"type={info.provider_error_type}")
    suffix = f" ({', '.join(details)})" if details else ""
    return f"provider_error: {info.category}{provider}{suffix}"


def infer_provider_from_url(url: str) -> str | None:
    path = urlparse(url).path.rstrip("/").lower()
    if path.endswith("/chat/completions"):
        return "openai-compatible"
    if path.endswith("/responses"):
        return "openai-responses"
    if path.endswith("/messages"):
        return "anthropic"
    return None


def map_http_error_to_info(
    status_code: int,
    body: object,
    *,
    provider: str | None = None,
) -> ProviderErrorInfo:
    if _is_anthropic_provider(provider) or _looks_like_anthropic_error(body):
        return map_anthropic_error_to_info(status_code, body, provider=provider)
    if _is_openai_provider(provider) or _looks_like_openai_error(body):
        return map_openai_error_to_info(status_code, body, provider=provider)
    return _status_fallback_info(status_code, provider=provider)


def map_network_error_to_info(*, provider: str | None = None) -> ProviderErrorInfo:
    return ProviderErrorInfo(category="network", provider=provider, retryable=True)


def map_invalid_response_to_info(*, provider: str | None = None) -> ProviderErrorInfo:
    return ProviderErrorInfo(category="invalid_response", provider=provider, retryable=False)


def map_openai_error_to_info(
    status_code: int | None,
    body: object,
    *,
    provider: str | None = None,
) -> ProviderErrorInfo:
    error = _mapping_field(body, "error")
    error_type = _safe_token(error.get("type") if error is not None else None)
    error_code = _safe_token(error.get("code") if error is not None else None)
    category = _openai_category(status_code, error_type, error_code)
    retryable = _category_retryable(category)
    return ProviderErrorInfo(
        category=category,
        provider=provider,
        status_code=status_code,
        provider_error_type=error_type,
        provider_error_code=error_code,
        retryable=retryable,
    )


def map_openai_stream_error_to_info(
    event: JsonMapping,
    *,
    provider: str | None = "openai-compatible",
) -> ProviderErrorInfo:
    return map_openai_error_to_info(None, event, provider=provider)


def map_anthropic_error_to_info(
    status_code: int | None,
    body: object,
    *,
    provider: str | None = None,
) -> ProviderErrorInfo:
    error = _mapping_field(body, "error")
    error_type = _safe_token(error.get("type") if error is not None else None)
    error_code = _safe_token(error.get("code") if error is not None else None)
    raw_message = error.get("message") if error is not None else None
    category = _anthropic_category(status_code, error_type, error_code, raw_message)
    retryable = _category_retryable(category)
    return ProviderErrorInfo(
        category=category,
        provider=provider,
        status_code=status_code,
        provider_error_type=error_type,
        provider_error_code=error_code,
        retryable=retryable,
    )


def map_anthropic_stream_error_to_info(
    event: JsonMapping,
    *,
    provider: str | None = "anthropic",
) -> ProviderErrorInfo:
    return map_anthropic_error_to_info(None, event, provider=provider)


def _openai_category(
    status_code: int | None,
    error_type: str | None,
    error_code: str | None,
) -> ProviderErrorCategory:
    signal = " ".join(value for value in (error_type, error_code) if value).lower()
    if status_code == 401 or "invalid_api_key" in signal or "authentication" in signal:
        return "auth"
    if status_code == 403 or "permission" in signal:
        return "permission"
    if status_code == 404 or "model_not_found" in signal or "not_found" in signal:
        return "model_not_found"
    if "context_length" in signal or "maximum_context" in signal:
        return "context_length"
    if "content_policy" in signal or "safety" in signal or "policy" in signal:
        return "content_policy"
    if "insufficient_quota" in signal or "quota" in signal:
        return "quota"
    if status_code == 429 or "rate_limit" in signal or "rate-limit" in signal:
        return "rate_limit"
    if status_code in _SERVER_HTTP_STATUSES:
        return "server_error"
    if status_code == 400 or error_type == "invalid_request_error":
        return "invalid_request"
    if status_code is not None:
        return _status_fallback_info(status_code).category
    return "unknown"


def _anthropic_category(
    status_code: int | None,
    error_type: str | None,
    error_code: str | None,
    raw_message: object,
) -> ProviderErrorCategory:
    signal = " ".join(value for value in (error_type, error_code) if value).lower()
    if status_code == 401 or "authentication_error" in signal:
        return "auth"
    if status_code == 403 or "permission_error" in signal:
        return "permission"
    if status_code == 404 or "not_found_error" in signal:
        return "model_not_found"
    if "rate_limit_error" in signal:
        return "rate_limit"
    if "overloaded_error" in signal or status_code in _SERVER_HTTP_STATUSES:
        return "server_error"
    if "invalid_request_error" in signal:
        if _message_mentions_context(raw_message):
            return "context_length"
        return "invalid_request"
    if "content_policy" in signal or "safety" in signal or "policy" in signal:
        return "content_policy"
    if status_code is not None:
        return _status_fallback_info(status_code).category
    return "unknown"


def _status_fallback_info(
    status_code: int,
    *,
    provider: str | None = None,
) -> ProviderErrorInfo:
    if status_code == 401:
        category: ProviderErrorCategory = "auth"
    elif status_code == 403:
        category = "permission"
    elif status_code == 404:
        category = "model_not_found"
    elif status_code == 429:
        category = "rate_limit"
    elif status_code in _SERVER_HTTP_STATUSES:
        category = "server_error"
    elif 400 <= status_code < 500:
        category = "invalid_request"
    else:
        category = "unknown"
    return ProviderErrorInfo(
        category=category,
        provider=provider,
        status_code=status_code,
        retryable=_category_retryable(category),
    )


def _category_retryable(category: ProviderErrorCategory) -> bool:
    return category in {"rate_limit", "server_error", "network"}


def _is_openai_provider(provider: str | None) -> bool:
    return provider in {
        "openai",
        "openai-compatible",
        "openai-responses",
        "openai-compatible-responses",
        "local-openai-compatible",
    }


def _is_anthropic_provider(provider: str | None) -> bool:
    return provider in {"anthropic", "anthropic-compatible"}


def _looks_like_openai_error(body: object) -> bool:
    error = _mapping_field(body, "error")
    if error is None:
        return False
    return "type" in error or "code" in error or "param" in error


def _looks_like_anthropic_error(body: object) -> bool:
    if not isinstance(body, dict):
        return False
    return body.get("type") == "error" and isinstance(body.get("error"), dict)


def _mapping_field(value: object, key: str) -> JsonMapping | None:
    if not isinstance(value, dict):
        return None
    nested = value.get(key)
    if isinstance(nested, dict):
        return nested
    return None


def _safe_token(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    if _SAFE_PROVIDER_TOKEN.fullmatch(stripped) is None:
        return None
    return stripped


def _message_mentions_context(value: object) -> bool:
    if not isinstance(value, str):
        return False
    lowered = value.lower()
    return any(token in lowered for token in ("context", "token", "too long", "maximum"))
