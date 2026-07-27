from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any


class ProviderConfigError(ValueError):
    """Raised when provider environment configuration is invalid."""


DEFAULT_PROVIDER_MAX_RETRIES = 0
DEFAULT_PROVIDER_RETRY_BASE_DELAY_MS = 250
DEFAULT_PROVIDER_RETRY_MAX_DELAY_MS = 2000
DEFAULT_PROVIDER_RATE_LIMIT_STRATEGY = "fail-fast"
DEFAULT_PROVIDER_RATE_LIMIT_SCOPE = "process"
LOCAL_OPENAI_COMPATIBLE_PROVIDER = "local-openai-compatible"


@dataclass(slots=True)
class ProviderRetryPolicy:
    max_retries: int = DEFAULT_PROVIDER_MAX_RETRIES
    base_delay_ms: int = DEFAULT_PROVIDER_RETRY_BASE_DELAY_MS
    max_delay_ms: int = DEFAULT_PROVIDER_RETRY_MAX_DELAY_MS


@dataclass(slots=True)
class ProviderUsageBudget:
    max_input_tokens: int | None = None
    max_output_tokens: int | None = None
    max_total_tokens: int | None = None
    require_usage: bool = False


@dataclass(slots=True)
class ProviderRateLimitPolicy:
    enabled: bool = False
    strategy: str = DEFAULT_PROVIDER_RATE_LIMIT_STRATEGY
    requests_per_minute: int | None = None
    min_interval_ms: int = 0
    max_wait_ms: int = 0
    scope: str = DEFAULT_PROVIDER_RATE_LIMIT_SCOPE


@dataclass(slots=True)
class ProviderToolUsePolicy:
    parallel_tool_calls: bool = False


@dataclass(slots=True)
class ProviderConfig:
    name: str
    model: str
    api_key_env: str | None = None
    base_url: str | None = None
    timeout_s: float = 30.0
    retry: ProviderRetryPolicy = field(default_factory=ProviderRetryPolicy)
    usage_budget: ProviderUsageBudget = field(default_factory=ProviderUsageBudget)
    rate_limit: ProviderRateLimitPolicy = field(default_factory=ProviderRateLimitPolicy)
    tool_use: ProviderToolUsePolicy = field(default_factory=ProviderToolUsePolicy)


@dataclass(slots=True)
class ProviderChainConfig:
    primary: ProviderConfig
    fallbacks: list[ProviderConfig] = field(default_factory=list)


def load_provider_config_from_env(
    environ: Mapping[str, str] | None = None,
) -> ProviderConfig | None:
    source = environ if environ is not None else os.environ
    provider = _read_optional(source, "GOD_CODE_PROVIDER")
    if provider is None or provider == "fake":
        return None

    model = _read_required(source, "GOD_CODE_MODEL")
    api_key_env = _read_provider_api_key_env(source, provider)

    return ProviderConfig(
        name=provider,
        model=model,
        api_key_env=api_key_env,
        base_url=_read_optional(source, "GOD_CODE_BASE_URL"),
        timeout_s=_read_timeout(source),
        retry=_read_retry_policy(source),
        usage_budget=_read_usage_budget(source),
        rate_limit=_read_rate_limit_policy(source),
        tool_use=_read_tool_use_policy(source),
    )


def load_provider_chain_config_from_env(
    environ: Mapping[str, str] | None = None,
) -> ProviderChainConfig | None:
    source = environ if environ is not None else os.environ
    primary = load_provider_config_from_env(source)
    if primary is None:
        return None
    return ProviderChainConfig(
        primary=primary,
        fallbacks=_read_fallback_configs(source, primary),
    )


def _read_optional(source: Mapping[str, str], key: str) -> str | None:
    value = source.get(key)
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _read_required(source: Mapping[str, str], key: str) -> str:
    value = _read_optional(source, key)
    if value is None:
        raise ProviderConfigError(f"Missing required provider environment variable: {key}")
    return value


def _provider_allows_missing_api_key(provider: str) -> bool:
    return provider == LOCAL_OPENAI_COMPATIBLE_PROVIDER


def _read_provider_api_key_env(source: Mapping[str, str], provider: str) -> str | None:
    if _provider_allows_missing_api_key(provider):
        api_key_env = _read_optional(source, "GOD_CODE_API_KEY_ENV")
        if api_key_env is not None and _read_optional(source, api_key_env) is None:
            raise ProviderConfigError(
                f"Provider API key environment variable is not set: {api_key_env}"
            )
        return api_key_env

    api_key_env = _read_required(source, "GOD_CODE_API_KEY_ENV")
    api_key_value = _read_optional(source, api_key_env)
    if api_key_value is None:
        raise ProviderConfigError(
            f"Provider API key environment variable is not set: {api_key_env}"
        )
    return api_key_env


def _read_timeout(source: Mapping[str, str]) -> float:
    raw = _read_optional(source, "GOD_CODE_PROVIDER_TIMEOUT_S")
    if raw is None:
        return 30.0
    try:
        timeout_s = float(raw)
    except ValueError as exc:
        raise ProviderConfigError("GOD_CODE_PROVIDER_TIMEOUT_S must be a number.") from exc
    if timeout_s <= 0:
        raise ProviderConfigError("GOD_CODE_PROVIDER_TIMEOUT_S must be greater than 0.")
    return timeout_s


def _read_retry_policy(source: Mapping[str, str]) -> ProviderRetryPolicy:
    policy = ProviderRetryPolicy(
        max_retries=_read_non_negative_int(
            source,
            "GOD_CODE_PROVIDER_MAX_RETRIES",
            default=DEFAULT_PROVIDER_MAX_RETRIES,
        ),
        base_delay_ms=_read_non_negative_int(
            source,
            "GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS",
            default=DEFAULT_PROVIDER_RETRY_BASE_DELAY_MS,
        ),
        max_delay_ms=_read_non_negative_int(
            source,
            "GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS",
            default=DEFAULT_PROVIDER_RETRY_MAX_DELAY_MS,
        ),
    )
    if policy.max_delay_ms < policy.base_delay_ms:
        raise ProviderConfigError(
            "GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS must be greater than or equal to "
            "GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS."
        )
    return policy


def _read_usage_budget(source: Mapping[str, str]) -> ProviderUsageBudget:
    return ProviderUsageBudget(
        max_input_tokens=_read_optional_positive_int(
            source,
            "GOD_CODE_PROVIDER_MAX_INPUT_TOKENS",
        ),
        max_output_tokens=_read_optional_positive_int(
            source,
            "GOD_CODE_PROVIDER_MAX_OUTPUT_TOKENS",
        ),
        max_total_tokens=_read_optional_positive_int(
            source,
            "GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS",
        ),
        require_usage=_read_bool(
            source,
            "GOD_CODE_PROVIDER_REQUIRE_USAGE",
            default=False,
        ),
    )


def _read_rate_limit_policy(source: Mapping[str, str]) -> ProviderRateLimitPolicy:
    strategy = _read_optional(source, "GOD_CODE_PROVIDER_RATE_LIMIT_STRATEGY")
    if strategy is None:
        strategy = DEFAULT_PROVIDER_RATE_LIMIT_STRATEGY
    if strategy not in {"fail-fast", "wait"}:
        raise ProviderConfigError(
            "GOD_CODE_PROVIDER_RATE_LIMIT_STRATEGY must be one of: fail-fast, wait."
        )

    scope = _read_optional(source, "GOD_CODE_PROVIDER_RATE_LIMIT_SCOPE")
    if scope is None:
        scope = DEFAULT_PROVIDER_RATE_LIMIT_SCOPE
    if scope != DEFAULT_PROVIDER_RATE_LIMIT_SCOPE:
        raise ProviderConfigError("GOD_CODE_PROVIDER_RATE_LIMIT_SCOPE must be process.")

    return ProviderRateLimitPolicy(
        enabled=_read_bool(
            source,
            "GOD_CODE_PROVIDER_RATE_LIMIT_ENABLED",
            default=False,
        ),
        strategy=strategy,
        requests_per_minute=_read_optional_positive_int(
            source,
            "GOD_CODE_PROVIDER_RATE_LIMIT_REQUESTS_PER_MINUTE",
        ),
        min_interval_ms=_read_non_negative_int(
            source,
            "GOD_CODE_PROVIDER_RATE_LIMIT_MIN_INTERVAL_MS",
            default=0,
        ),
        max_wait_ms=_read_non_negative_int(
            source,
            "GOD_CODE_PROVIDER_RATE_LIMIT_MAX_WAIT_MS",
            default=0,
        ),
        scope=scope,
    )


def _read_tool_use_policy(source: Mapping[str, str]) -> ProviderToolUsePolicy:
    return ProviderToolUsePolicy(
        parallel_tool_calls=_read_bool(
            source,
            "GOD_CODE_PROVIDER_PARALLEL_TOOL_CALLS",
            default=False,
        ),
    )


def _read_optional_positive_int(source: Mapping[str, str], key: str) -> int | None:
    raw = _read_optional(source, key)
    if raw is None:
        return None
    try:
        value = int(raw, 10)
    except ValueError as exc:
        raise ProviderConfigError(f"{key} must be a positive integer.") from exc
    if value <= 0:
        raise ProviderConfigError(f"{key} must be a positive integer.")
    return value


def _read_bool(source: Mapping[str, str], key: str, *, default: bool) -> bool:
    raw = _read_optional(source, key)
    if raw is None:
        return default
    normalized = raw.lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ProviderConfigError(f"{key} must be a boolean.")


def _read_fallback_configs(
    source: Mapping[str, str],
    primary: ProviderConfig,
) -> list[ProviderConfig]:
    raw = _read_optional(source, "GOD_CODE_PROVIDER_FALLBACKS")
    if raw is None:
        return []
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ProviderConfigError("GOD_CODE_PROVIDER_FALLBACKS must be valid JSON.") from exc
    if not isinstance(decoded, list):
        raise ProviderConfigError("GOD_CODE_PROVIDER_FALLBACKS must be a JSON array.")

    seen = {_provider_identity(primary)}
    fallbacks: list[ProviderConfig] = []
    for index, value in enumerate(decoded):
        if not isinstance(value, dict):
            raise ProviderConfigError(
                f"GOD_CODE_PROVIDER_FALLBACKS entry at index {index} must be an object."
            )
        config = _fallback_config_from_mapping(source, value, index, primary)
        identity = _provider_identity(config)
        if identity in seen:
            raise ProviderConfigError(
                f"GOD_CODE_PROVIDER_FALLBACKS entry at index {index} duplicates a provider/model/base_url entry."
            )
        seen.add(identity)
        fallbacks.append(config)
    return fallbacks


def _fallback_config_from_mapping(
    source: Mapping[str, str],
    value: Mapping[str, Any],
    index: int,
    primary: ProviderConfig,
) -> ProviderConfig:
    provider = _required_fallback_string(value, "provider", index)
    model = _required_fallback_string(value, "model", index)
    api_key_env = _fallback_api_key_env(value, provider, index)
    if api_key_env is not None and _read_optional(source, api_key_env) is None:
        raise ProviderConfigError(
            "GOD_CODE_PROVIDER_FALLBACKS entry at index "
            f"{index} references unset API key environment variable: {api_key_env}"
        )
    return ProviderConfig(
        name=provider,
        model=model,
        api_key_env=api_key_env,
        base_url=_optional_fallback_string(value, "base_url", index),
        timeout_s=_fallback_timeout(value, index),
        retry=_fallback_retry_policy(value, index),
        usage_budget=_read_usage_budget(source),
        rate_limit=_read_rate_limit_policy(source),
        tool_use=primary.tool_use,
    )


def _fallback_api_key_env(
    value: Mapping[str, Any],
    provider: str,
    index: int,
) -> str | None:
    if _provider_allows_missing_api_key(provider):
        return _optional_fallback_string(value, "api_key_env", index)
    return _required_fallback_string(value, "api_key_env", index)


def _required_fallback_string(
    value: Mapping[str, Any],
    key: str,
    index: int,
) -> str:
    field = value.get(key)
    if not isinstance(field, str) or field.strip() == "":
        raise ProviderConfigError(
            f"GOD_CODE_PROVIDER_FALLBACKS entry at index {index} requires non-empty string field: {key}"
        )
    return field.strip()


def _optional_fallback_string(
    value: Mapping[str, Any],
    key: str,
    index: int,
) -> str | None:
    field = value.get(key)
    if field is None:
        return None
    if not isinstance(field, str):
        raise ProviderConfigError(
            f"GOD_CODE_PROVIDER_FALLBACKS entry at index {index} field {key} must be a string."
        )
    stripped = field.strip()
    return stripped or None


def _fallback_timeout(value: Mapping[str, Any], index: int) -> float:
    field = value.get("timeout_s")
    if field is None:
        return 30.0
    if not isinstance(field, (int, float)) or isinstance(field, bool):
        raise ProviderConfigError(
            f"GOD_CODE_PROVIDER_FALLBACKS entry at index {index} field timeout_s must be a positive number."
        )
    timeout_s = float(field)
    if timeout_s <= 0:
        raise ProviderConfigError(
            f"GOD_CODE_PROVIDER_FALLBACKS entry at index {index} field timeout_s must be greater than 0."
        )
    return timeout_s


def _fallback_retry_policy(value: Mapping[str, Any], index: int) -> ProviderRetryPolicy:
    policy = ProviderRetryPolicy(
        max_retries=_fallback_non_negative_int(
            value,
            "max_retries",
            index,
            default=DEFAULT_PROVIDER_MAX_RETRIES,
        ),
        base_delay_ms=_fallback_non_negative_int(
            value,
            "retry_base_delay_ms",
            index,
            default=DEFAULT_PROVIDER_RETRY_BASE_DELAY_MS,
        ),
        max_delay_ms=_fallback_non_negative_int(
            value,
            "retry_max_delay_ms",
            index,
            default=DEFAULT_PROVIDER_RETRY_MAX_DELAY_MS,
        ),
    )
    if policy.max_delay_ms < policy.base_delay_ms:
        raise ProviderConfigError(
            "GOD_CODE_PROVIDER_FALLBACKS entry at index "
            f"{index} field retry_max_delay_ms must be greater than or equal to retry_base_delay_ms."
        )
    return policy


def _fallback_non_negative_int(
    value: Mapping[str, Any],
    key: str,
    index: int,
    *,
    default: int,
) -> int:
    field = value.get(key)
    if field is None:
        return default
    if not isinstance(field, int) or isinstance(field, bool) or field < 0:
        raise ProviderConfigError(
            f"GOD_CODE_PROVIDER_FALLBACKS entry at index {index} field {key} must be a non-negative integer."
        )
    return field


def _provider_identity(config: ProviderConfig) -> tuple[str, str, str | None]:
    return (config.name, config.model, config.base_url)


def _read_non_negative_int(
    source: Mapping[str, str],
    key: str,
    *,
    default: int,
) -> int:
    raw = _read_optional(source, key)
    if raw is None:
        return default
    try:
        value = int(raw, 10)
    except ValueError as exc:
        raise ProviderConfigError(f"{key} must be a non-negative integer.") from exc
    if value < 0:
        raise ProviderConfigError(f"{key} must be a non-negative integer.")
    return value
