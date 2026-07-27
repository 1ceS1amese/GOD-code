from __future__ import annotations

from collections.abc import Mapping

from god_code_engine.compaction.base import CompactionStrategy
from god_code_engine.compaction.config import load_compaction_strategy_from_env
from god_code_engine.models.base import ModelOptions, ModelRequest
from god_code_engine.prompting.injection_guard import (
    PromptInjectionGuard,
    load_prompt_injection_guard_from_env,
)
from god_code_engine.prompting.system_prompt import (
    SystemPromptBuilder,
    load_system_prompt_builder_from_env,
)
from god_code_engine.prompting.token_budget import (
    TokenBudgetManager,
    load_token_budget_manager_from_env,
)
from god_code_engine.session.manager import SessionState
from god_code_engine.types import JsonMapping


class PromptBuilder:
    def __init__(
        self,
        compaction_strategy: CompactionStrategy | None = None,
        system_prompt_builder: SystemPromptBuilder | None = None,
        token_budget_manager: TokenBudgetManager | None = None,
        prompt_injection_guard: PromptInjectionGuard | None = None,
        environ: Mapping[str, str] | None = None,
    ) -> None:
        self._compaction_strategy = compaction_strategy or load_compaction_strategy_from_env(environ)
        self._system_prompt_builder = system_prompt_builder or load_system_prompt_builder_from_env(environ)
        self._token_budget_manager = token_budget_manager or load_token_budget_manager_from_env(environ)
        self._prompt_injection_guard = (
            prompt_injection_guard or load_prompt_injection_guard_from_env(environ)
        )

    def build(
        self,
        session: SessionState,
        turn_options: JsonMapping | None = None,
    ) -> ModelRequest:
        options = self._parse_model_options(turn_options or {})
        messages = self._compaction_strategy.compact(list(session.messages), options)
        tools = list(session.tool_catalog)
        system_prompt = self._system_prompt_builder.build(tools=tools)
        prompt_injection_report = self._prompt_injection_guard.inspect(
            system_prompt=system_prompt,
            messages=messages,
            provider_context=session.provider_context,
        )
        budget = self._token_budget_manager.build_budget(
            system_prompt=system_prompt,
            messages=messages,
            tools=tools,
            provider_context=session.provider_context,
            options=options,
        )
        return ModelRequest(
            messages=messages,
            tools=tools,
            options=options,
            provider_context=session.provider_context,
            system_prompt=system_prompt,
            budget=budget,
            prompt_injection_report=prompt_injection_report,
        )

    def _parse_model_options(self, options: JsonMapping) -> ModelOptions:
        return ModelOptions(
            stream=self._optional_bool(options, "stream") or False,
            max_tokens=self._optional_int(options, "max_tokens"),
            temperature=self._optional_float(options, "temperature"),
            provider=self._optional_str(options, "provider"),
        )

    def _optional_bool(self, options: JsonMapping, key: str) -> bool | None:
        value = options.get(key)
        if value is None:
            return None
        if not isinstance(value, bool):
            raise ValueError(f"Expected boolean turn option: {key}.")
        return value

    def _optional_int(self, options: JsonMapping, key: str) -> int | None:
        value = options.get(key)
        if value is None:
            return None
        if not isinstance(value, int) or isinstance(value, bool):
            raise ValueError(f"Expected integer turn option: {key}.")
        return value

    def _optional_float(self, options: JsonMapping, key: str) -> float | None:
        value = options.get(key)
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, int | float):
            raise ValueError(f"Expected numeric turn option: {key}.")
        return float(value)

    def _optional_str(self, options: JsonMapping, key: str) -> str | None:
        value = options.get(key)
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError(f"Expected string turn option: {key}.")
        return value
