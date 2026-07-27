import json

import pytest

from god_code_engine.models.base import ModelRequest
from god_code_engine.models.fake import FakeModelAdapter
from god_code_engine.providers.anthropic_messages import (
    ANTHROPIC_DEFAULT_BASE_URL,
    AnthropicMessagesProviderClient,
)
from god_code_engine.providers.config import ProviderConfig
from god_code_engine.providers.http_client import HttpProviderClient
from god_code_engine.providers.openai_compatible import (
    LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URL,
    OPENAI_COMPAT_DEFAULT_BASE_URL,
    OpenAICompatibleProviderClient,
)
from god_code_engine.providers.openai_responses import (
    OPENAI_RESPONSES_DEFAULT_BASE_URL,
    OpenAIResponsesProviderClient,
)
from god_code_engine.providers.real_adapter import (
    FallbackProviderModelAdapter,
    RealProviderModelAdapter,
)
from god_code_engine.providers.registry import (
    ProviderRegistry,
    ProviderRegistryError,
    create_default_provider_registry,
)
from god_code_engine.types import JsonMapping


class RegistryTestClient(HttpProviderClient):
    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        del request, config
        return {"kind": "assistant", "content": "ok"}


def test_default_provider_registry_returns_fake_adapter() -> None:
    registry = create_default_provider_registry()

    adapter = registry.get("fake")

    assert isinstance(adapter, FakeModelAdapter)
    assert registry.names() == ["fake"]


def test_provider_registry_rejects_unknown_adapter() -> None:
    registry = ProviderRegistry()

    with pytest.raises(ProviderRegistryError, match="Unsupported model adapter: missing"):
        registry.get("missing")


def test_default_provider_registry_registers_real_provider_from_env() -> None:
    registry = create_default_provider_registry(
        environ={
            "GOD_CODE_PROVIDER": "demo",
            "GOD_CODE_MODEL": "demo-model",
            "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
            "DEMO_API_KEY": "secret",
        },
        http_client=RegistryTestClient(),
    )

    assert registry.names() == ["demo", "fake"]
    assert isinstance(registry.get("fake"), FakeModelAdapter)
    assert isinstance(registry.get("demo"), RealProviderModelAdapter)


def test_default_provider_registry_wraps_real_provider_fallback_chain() -> None:
    registry = create_default_provider_registry(
        environ={
            "GOD_CODE_PROVIDER": "demo",
            "GOD_CODE_MODEL": "demo-model",
            "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
            "DEMO_API_KEY": "secret",
            "GOD_CODE_PROVIDER_FALLBACKS": json.dumps(
                [
                    {
                        "provider": "demo-fallback",
                        "model": "fallback-model",
                        "api_key_env": "FALLBACK_API_KEY",
                    }
                ]
            ),
            "FALLBACK_API_KEY": "fallback-secret",
        },
        http_client=RegistryTestClient(),
    )

    adapter = registry.get("demo")

    assert registry.names() == ["demo", "fake"]
    assert isinstance(adapter, FallbackProviderModelAdapter)
    assert adapter.name == "demo"
    assert len(adapter._adapters) == 2
    assert adapter._adapters[0]._config.name == "demo"
    assert adapter._adapters[1]._config.name == "demo-fallback"


def test_default_provider_registry_uses_openai_client_for_openai_provider() -> None:
    registry = create_default_provider_registry(
        environ={
            "GOD_CODE_PROVIDER": "openai",
            "GOD_CODE_MODEL": "gpt-test",
            "GOD_CODE_API_KEY_ENV": "OPENAI_API_KEY",
            "OPENAI_API_KEY": "secret",
        }
    )

    adapter = registry.get("openai")

    assert isinstance(adapter, RealProviderModelAdapter)
    assert isinstance(adapter._client, OpenAICompatibleProviderClient)
    assert adapter._config.base_url == OPENAI_COMPAT_DEFAULT_BASE_URL


def test_default_provider_registry_uses_openai_client_for_compatible_provider() -> None:
    registry = create_default_provider_registry(
        environ={
            "GOD_CODE_PROVIDER": "openai-compatible",
            "GOD_CODE_MODEL": "local-model",
            "GOD_CODE_API_KEY_ENV": "LOCAL_API_KEY",
            "LOCAL_API_KEY": "secret",
            "GOD_CODE_BASE_URL": "http://localhost:11434/v1",
        }
    )

    adapter = registry.get("openai-compatible")

    assert isinstance(adapter, RealProviderModelAdapter)
    assert isinstance(adapter._client, OpenAICompatibleProviderClient)
    assert adapter._config.base_url == "http://localhost:11434/v1"


def test_default_provider_registry_uses_openai_client_for_local_compatible_provider_without_api_key() -> None:
    registry = create_default_provider_registry(
        environ={
            "GOD_CODE_PROVIDER": "local-openai-compatible",
            "GOD_CODE_MODEL": "local-model",
        }
    )

    adapter = registry.get("local-openai-compatible")

    assert isinstance(adapter, RealProviderModelAdapter)
    assert isinstance(adapter._client, OpenAICompatibleProviderClient)
    assert adapter._client._require_api_key is False
    assert adapter._config.api_key_env is None
    assert adapter._config.base_url == LOCAL_OPENAI_COMPAT_DEFAULT_BASE_URL


def test_default_provider_registry_uses_configured_local_compatible_base_url() -> None:
    registry = create_default_provider_registry(
        environ={
            "GOD_CODE_PROVIDER": "local-openai-compatible",
            "GOD_CODE_MODEL": "local-model",
            "GOD_CODE_BASE_URL": "http://localhost:8000/v1",
        }
    )

    adapter = registry.get("local-openai-compatible")

    assert isinstance(adapter, RealProviderModelAdapter)
    assert adapter._config.base_url == "http://localhost:8000/v1"


def test_default_provider_registry_uses_responses_client_for_openai_responses() -> None:
    registry = create_default_provider_registry(
        environ={
            "GOD_CODE_PROVIDER": "openai-responses",
            "GOD_CODE_MODEL": "gpt-test",
            "GOD_CODE_API_KEY_ENV": "OPENAI_API_KEY",
            "OPENAI_API_KEY": "secret",
        }
    )

    adapter = registry.get("openai-responses")

    assert isinstance(adapter, RealProviderModelAdapter)
    assert isinstance(adapter._client, OpenAIResponsesProviderClient)
    assert adapter._config.base_url == OPENAI_RESPONSES_DEFAULT_BASE_URL


def test_default_provider_registry_uses_responses_client_for_compatible_responses() -> None:
    registry = create_default_provider_registry(
        environ={
            "GOD_CODE_PROVIDER": "openai-compatible-responses",
            "GOD_CODE_MODEL": "local-model",
            "GOD_CODE_API_KEY_ENV": "LOCAL_API_KEY",
            "LOCAL_API_KEY": "secret",
            "GOD_CODE_BASE_URL": "http://localhost:11434/v1",
        }
    )

    adapter = registry.get("openai-compatible-responses")

    assert isinstance(adapter, RealProviderModelAdapter)
    assert isinstance(adapter._client, OpenAIResponsesProviderClient)
    assert adapter._config.base_url == "http://localhost:11434/v1"


def test_default_provider_registry_uses_anthropic_client_for_anthropic_provider() -> None:
    registry = create_default_provider_registry(
        environ={
            "GOD_CODE_PROVIDER": "anthropic",
            "GOD_CODE_MODEL": "claude-test",
            "GOD_CODE_API_KEY_ENV": "ANTHROPIC_API_KEY",
            "ANTHROPIC_API_KEY": "secret",
        }
    )

    adapter = registry.get("anthropic")

    assert isinstance(adapter, RealProviderModelAdapter)
    assert isinstance(adapter._client, AnthropicMessagesProviderClient)
    assert adapter._config.base_url == ANTHROPIC_DEFAULT_BASE_URL


def test_default_provider_registry_uses_anthropic_client_for_compatible_provider() -> None:
    registry = create_default_provider_registry(
        environ={
            "GOD_CODE_PROVIDER": "anthropic-compatible",
            "GOD_CODE_MODEL": "claude-compatible",
            "GOD_CODE_API_KEY_ENV": "LOCAL_ANTHROPIC_KEY",
            "LOCAL_ANTHROPIC_KEY": "secret",
            "GOD_CODE_BASE_URL": "http://localhost:8080",
        }
    )

    adapter = registry.get("anthropic-compatible")

    assert isinstance(adapter, RealProviderModelAdapter)
    assert isinstance(adapter._client, AnthropicMessagesProviderClient)
    assert adapter._config.base_url == "http://localhost:8080"
