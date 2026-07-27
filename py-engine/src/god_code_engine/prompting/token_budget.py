from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass

from god_code_engine.api.god_code_api_models import ToolCatalogEntry
from god_code_engine.models.base import ModelOptions, ModelRequestBudget
from god_code_engine.types import JsonObject, Messages

DEFAULT_CHARS_PER_TOKEN = 4


class TokenBudgetConfigError(ValueError):
    """Raised when token budget environment configuration is invalid."""


class TokenBudgetExceededError(ValueError):
    """Raised when the local estimated input budget exceeds the configured limit."""


@dataclass(frozen=True, slots=True)
class TokenBudgetConfig:
    enabled: bool = True
    max_input_tokens: int | None = None
    chars_per_token: int = DEFAULT_CHARS_PER_TOKEN
    include_tool_schemas: bool = True
    include_provider_context: bool = True

    def __post_init__(self) -> None:
        if self.max_input_tokens is not None and self.max_input_tokens <= 0:
            raise TokenBudgetConfigError("max_input_tokens must be a positive integer.")
        if self.chars_per_token <= 0:
            raise TokenBudgetConfigError("chars_per_token must be a positive integer.")


class TokenEstimator:
    def __init__(self, *, chars_per_token: int = DEFAULT_CHARS_PER_TOKEN) -> None:
        if chars_per_token <= 0:
            raise TokenBudgetConfigError("chars_per_token must be a positive integer.")
        self._chars_per_token = chars_per_token

    @property
    def name(self) -> str:
        return f"char_count_div_{self._chars_per_token}"

    def estimate_text(self, text: str) -> int:
        if text == "":
            return 0
        return (len(text) + self._chars_per_token - 1) // self._chars_per_token

    def estimate_json(self, value: object) -> int:
        return self.estimate_text(_stable_json(value))


class TokenBudgetManager:
    def __init__(
        self,
        config: TokenBudgetConfig | None = None,
        estimator: TokenEstimator | None = None,
    ) -> None:
        self._config = config or TokenBudgetConfig()
        self._estimator = estimator or TokenEstimator(
            chars_per_token=self._config.chars_per_token
        )

    def build_budget(
        self,
        *,
        system_prompt: str | None,
        messages: Messages,
        tools: list[ToolCatalogEntry],
        provider_context: JsonObject | None,
        options: ModelOptions | None = None,
    ) -> ModelRequestBudget | None:
        if not self._config.enabled:
            return None

        system_prompt_tokens = self._estimator.estimate_text(system_prompt or "")
        message_tokens = self._estimator.estimate_json(list(messages))
        tool_schema_tokens = (
            self._estimator.estimate_json([tool.to_dict() for tool in tools])
            if self._config.include_tool_schemas
            else 0
        )
        provider_context_tokens = (
            self._estimator.estimate_json(provider_context)
            if self._config.include_provider_context and provider_context is not None
            else 0
        )
        model_option_tokens = self._estimate_model_options(options)
        estimated_input_tokens = (
            system_prompt_tokens
            + message_tokens
            + tool_schema_tokens
            + provider_context_tokens
            + model_option_tokens
        )
        budget = ModelRequestBudget(
            estimated_input_tokens=estimated_input_tokens,
            system_prompt_tokens=system_prompt_tokens,
            message_tokens=message_tokens,
            tool_schema_tokens=tool_schema_tokens,
            provider_context_tokens=provider_context_tokens,
            model_option_tokens=model_option_tokens,
            estimator=self._estimator.name,
            max_input_tokens=self._config.max_input_tokens,
        )
        if (
            self._config.max_input_tokens is not None
            and estimated_input_tokens > self._config.max_input_tokens
        ):
            raise TokenBudgetExceededError(
                "Estimated input tokens exceed configured token budget: "
                f"estimated_input_tokens={estimated_input_tokens}, "
                f"max_input_tokens={self._config.max_input_tokens}, "
                f"estimator={self._estimator.name}."
            )
        return budget

    def _estimate_model_options(self, options: ModelOptions | None) -> int:
        payload = _model_options_payload(options)
        if not payload:
            return 0
        return self._estimator.estimate_json(payload)


def load_token_budget_manager_from_env(
    environ: Mapping[str, str] | None = None,
) -> TokenBudgetManager:
    source = environ if environ is not None else os.environ
    enabled = _read_bool(source, "GOD_CODE_TOKEN_BUDGET_ENABLED", default=True)
    config = TokenBudgetConfig(
        enabled=enabled,
        max_input_tokens=_read_positive_int(
            source,
            "GOD_CODE_TOKEN_BUDGET_MAX_INPUT_TOKENS",
            default=None,
        ),
        chars_per_token=_read_positive_int(
            source,
            "GOD_CODE_TOKEN_BUDGET_CHARS_PER_TOKEN",
            default=DEFAULT_CHARS_PER_TOKEN,
        ),
        include_tool_schemas=_read_bool(
            source,
            "GOD_CODE_TOKEN_BUDGET_INCLUDE_TOOL_SCHEMAS",
            default=True,
        ),
        include_provider_context=_read_bool(
            source,
            "GOD_CODE_TOKEN_BUDGET_INCLUDE_PROVIDER_CONTEXT",
            default=True,
        ),
    )
    return TokenBudgetManager(config)


def _model_options_payload(options: ModelOptions | None) -> JsonObject:
    if options is None:
        return {}
    payload: JsonObject = {}
    if options.stream:
        payload["stream"] = options.stream
    if options.max_tokens is not None:
        payload["max_tokens"] = options.max_tokens
    if options.temperature is not None:
        payload["temperature"] = options.temperature
    if options.provider is not None:
        payload["provider"] = options.provider
    return payload


def _stable_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


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
    raise TokenBudgetConfigError(f"{key} must be a boolean.")


def _read_positive_int(
    source: Mapping[str, str],
    key: str,
    *,
    default: int | None,
) -> int | None:
    raw = _read_optional(source, key)
    if raw is None:
        return default
    try:
        value = int(raw, 10)
    except ValueError as exc:
        raise TokenBudgetConfigError(f"{key} must be a positive integer.") from exc
    if value <= 0:
        raise TokenBudgetConfigError(f"{key} must be a positive integer.")
    return value
