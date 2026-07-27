from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace

from god_code_engine.models.base import ModelAdapter
from god_code_engine.models.fake import FakeModelAdapter
from god_code_engine.providers.anthropic_messages import (
    ANTHROPIC_DEFAULT_BASE_URL,
    AnthropicMessagesProviderClient,
)
from god_code_engine.providers.config import ProviderConfig
from god_code_engine.providers.config import load_provider_chain_config_from_env
from god_code_engine.providers.http_client import HttpProviderClient, UnsupportedHttpProviderClient
from god_code_engine.providers.openai_compatible import (
    LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URL,
    OPENAI_COMPAT_DEFAULT_BASE_URL,
    OpenAICompatibleProviderClient,
)
from god_code_engine.providers.openai_responses import (
    OPENAI_RESPONSES_DEFAULT_BASE_URL,
    OpenAIResponsesProviderClient,
)
from god_code_engine.providers.real_adapter import FallbackProviderModelAdapter, RealProviderModelAdapter


class ProviderRegistryError(ValueError):
    """Raised when a model adapter is not registered."""


class ProviderRegistry:
    def __init__(self) -> None:
        self._adapters: dict[str, ModelAdapter] = {}

    def register(self, name: str, adapter: ModelAdapter) -> None:
        self._adapters[name] = adapter

    def get(self, name: str) -> ModelAdapter:
        adapter = self._adapters.get(name)
        if adapter is None:
            raise ProviderRegistryError(f"Unsupported model adapter: {name}")
        return adapter

    def names(self) -> list[str]:
        return sorted(self._adapters)


def create_default_provider_registry(
    environ: Mapping[str, str] | None = None,
    http_client: HttpProviderClient | None = None,
) -> ProviderRegistry:
    registry = ProviderRegistry()
    registry.register("fake", FakeModelAdapter())
    chain_config = load_provider_chain_config_from_env(environ)
    if chain_config is not None:
        primary = _normalize_provider_config(chain_config.primary)
        adapters = [
            _real_adapter_for_config(primary, environ, http_client),
            *[
                _real_adapter_for_config(_normalize_provider_config(fallback), environ, http_client)
                for fallback in chain_config.fallbacks
            ],
        ]
        adapter: ModelAdapter = adapters[0] if len(adapters) == 1 else FallbackProviderModelAdapter(adapters)
        registry.register(primary.name, adapter)
    return registry


def _normalize_provider_config(config: ProviderConfig) -> ProviderConfig:
    if config.name in {"openai", "openai-compatible"} and config.base_url is None:
        return replace(config, base_url=OPENAI_COMPAT_DEFAULT_BASE_URL)
    if config.name == "local-openai-compatible" and config.base_url is None:
        return replace(config, base_url=LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URL)
    if (
        config.name in {"openai-responses", "openai-compatible-responses"}
        and config.base_url is None
    ):
        return replace(config, base_url=OPENAI_RESPONSES_DEFAULT_BASE_URL)
    if config.name in {"anthropic", "anthropic-compatible"} and config.base_url is None:
        return replace(config, base_url=ANTHROPIC_DEFAULT_BASE_URL)
    return config


def _default_http_client_for(
    config: ProviderConfig,
    environ: Mapping[str, str] | None,
) -> HttpProviderClient:
    if config.name in {"openai", "openai-compatible"}:
        return OpenAICompatibleProviderClient(environ=environ)
    if config.name == "local-openai-compatible":
        return OpenAICompatibleProviderClient(environ=environ, require_api_key=False)
    if config.name in {"openai-responses", "openai-compatible-responses"}:
        return OpenAIResponsesProviderClient(environ=environ)
    if config.name in {"anthropic", "anthropic-compatible"}:
        return AnthropicMessagesProviderClient(environ=environ)
    return UnsupportedHttpProviderClient()


def _real_adapter_for_config(
    config: ProviderConfig,
    environ: Mapping[str, str] | None,
    http_client: HttpProviderClient | None,
) -> RealProviderModelAdapter:
    client = http_client or _default_http_client_for(config, environ)
    return RealProviderModelAdapter(config=config, client=client)
