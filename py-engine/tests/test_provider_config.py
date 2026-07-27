import json

import pytest

from god_code_engine.providers.config import (
    ProviderConfig,
    ProviderConfigError,
    ProviderRateLimitPolicy,
    ProviderRetryPolicy,
    ProviderToolUsePolicy,
    ProviderUsageBudget,
    load_provider_chain_config_from_env,
    load_provider_config_from_env,
)


def test_provider_config_returns_none_without_provider_env() -> None:
    assert load_provider_config_from_env({}) is None


def test_provider_config_treats_fake_as_default() -> None:
    assert load_provider_config_from_env({"GOD_CODE_PROVIDER": "fake"}) is None


def test_provider_config_requires_model_for_real_provider() -> None:
    with pytest.raises(ProviderConfigError, match="GOD_CODE_MODEL"):
        load_provider_config_from_env({"GOD_CODE_PROVIDER": "demo"})


def test_provider_config_requires_api_key_env_name_for_real_provider() -> None:
    with pytest.raises(ProviderConfigError, match="GOD_CODE_API_KEY_ENV"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
            }
        )


def test_provider_config_requires_api_key_env_value_for_real_provider() -> None:
    with pytest.raises(ProviderConfigError, match="DEMO_API_KEY"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
            }
        )


def test_provider_config_allows_local_openai_compatible_without_api_key() -> None:
    config = load_provider_config_from_env(
        {
            "GOD_CODE_PROVIDER": "local-openai-compatible",
            "GOD_CODE_MODEL": "local-model",
        }
    )

    assert config == ProviderConfig(
        name="local-openai-compatible",
        model="local-model",
    )


def test_provider_config_accepts_optional_local_openai_compatible_api_key() -> None:
    config = load_provider_config_from_env(
        {
            "GOD_CODE_PROVIDER": "local-openai-compatible",
            "GOD_CODE_MODEL": "local-model",
            "GOD_CODE_API_KEY_ENV": "LOCAL_API_KEY",
            "LOCAL_API_KEY": "local-secret",
        }
    )

    assert config is not None
    assert config.api_key_env == "LOCAL_API_KEY"


def test_provider_config_rejects_missing_optional_local_openai_compatible_api_key_value() -> None:
    with pytest.raises(ProviderConfigError, match="LOCAL_API_KEY"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "local-openai-compatible",
                "GOD_CODE_MODEL": "local-model",
                "GOD_CODE_API_KEY_ENV": "LOCAL_API_KEY",
            }
        )


def test_provider_config_rejects_invalid_timeout() -> None:
    with pytest.raises(ProviderConfigError, match="must be a number"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_TIMEOUT_S": "slow",
            }
        )


def test_provider_config_rejects_non_positive_timeout() -> None:
    with pytest.raises(ProviderConfigError, match="greater than 0"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_TIMEOUT_S": "0",
            }
        )


def test_provider_config_loads_complete_env() -> None:
    config = load_provider_config_from_env(
        {
            "GOD_CODE_PROVIDER": "demo",
            "GOD_CODE_MODEL": "demo-model",
            "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
            "DEMO_API_KEY": "secret",
            "GOD_CODE_BASE_URL": "https://example.invalid",
            "GOD_CODE_PROVIDER_TIMEOUT_S": "12.5",
        }
    )

    assert config == ProviderConfig(
        name="demo",
        model="demo-model",
        api_key_env="DEMO_API_KEY",
        base_url="https://example.invalid",
        timeout_s=12.5,
    )


def test_provider_config_loads_retry_policy() -> None:
    config = load_provider_config_from_env(
        {
            "GOD_CODE_PROVIDER": "demo",
            "GOD_CODE_MODEL": "demo-model",
            "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
            "DEMO_API_KEY": "secret",
            "GOD_CODE_PROVIDER_MAX_RETRIES": "2",
            "GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS": "10",
            "GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS": "40",
        }
    )

    assert config is not None
    assert config.retry == ProviderRetryPolicy(max_retries=2, base_delay_ms=10, max_delay_ms=40)


def test_provider_config_loads_usage_budget() -> None:
    config = load_provider_config_from_env(
        {
            "GOD_CODE_PROVIDER": "demo",
            "GOD_CODE_MODEL": "demo-model",
            "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
            "DEMO_API_KEY": "secret",
            "GOD_CODE_PROVIDER_MAX_INPUT_TOKENS": "100",
            "GOD_CODE_PROVIDER_MAX_OUTPUT_TOKENS": "20",
            "GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS": "120",
            "GOD_CODE_PROVIDER_REQUIRE_USAGE": "true",
        }
    )

    assert config is not None
    assert config.usage_budget == ProviderUsageBudget(
        max_input_tokens=100,
        max_output_tokens=20,
        max_total_tokens=120,
        require_usage=True,
    )


def test_provider_config_loads_rate_limit_policy() -> None:
    config = load_provider_config_from_env(
        {
            "GOD_CODE_PROVIDER": "demo",
            "GOD_CODE_MODEL": "demo-model",
            "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
            "DEMO_API_KEY": "secret",
            "GOD_CODE_PROVIDER_RATE_LIMIT_ENABLED": "true",
            "GOD_CODE_PROVIDER_RATE_LIMIT_STRATEGY": "wait",
            "GOD_CODE_PROVIDER_RATE_LIMIT_REQUESTS_PER_MINUTE": "30",
            "GOD_CODE_PROVIDER_RATE_LIMIT_MIN_INTERVAL_MS": "1000",
            "GOD_CODE_PROVIDER_RATE_LIMIT_MAX_WAIT_MS": "2500",
            "GOD_CODE_PROVIDER_RATE_LIMIT_SCOPE": "process",
        }
    )

    assert config is not None
    assert config.rate_limit == ProviderRateLimitPolicy(
        enabled=True,
        strategy="wait",
        requests_per_minute=30,
        min_interval_ms=1000,
        max_wait_ms=2500,
        scope="process",
    )


def test_provider_config_loads_tool_use_policy() -> None:
    config = load_provider_config_from_env(
        {
            "GOD_CODE_PROVIDER": "demo",
            "GOD_CODE_MODEL": "demo-model",
            "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
            "DEMO_API_KEY": "secret",
            "GOD_CODE_PROVIDER_PARALLEL_TOOL_CALLS": "true",
        }
    )

    assert config is not None
    assert config.tool_use == ProviderToolUsePolicy(parallel_tool_calls=True)


def test_provider_config_rejects_invalid_tool_use_policy() -> None:
    with pytest.raises(ProviderConfigError, match="GOD_CODE_PROVIDER_PARALLEL_TOOL_CALLS"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_PARALLEL_TOOL_CALLS": "maybe",
            }
        )


def test_provider_config_rejects_invalid_usage_budget() -> None:
    with pytest.raises(ProviderConfigError, match="GOD_CODE_PROVIDER_MAX_INPUT_TOKENS"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_MAX_INPUT_TOKENS": "0",
            }
        )

    with pytest.raises(ProviderConfigError, match="GOD_CODE_PROVIDER_REQUIRE_USAGE"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_REQUIRE_USAGE": "maybe",
            }
        )


def test_provider_config_rejects_invalid_rate_limit_policy() -> None:
    with pytest.raises(ProviderConfigError, match="RATE_LIMIT_ENABLED"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_RATE_LIMIT_ENABLED": "maybe",
            }
        )

    with pytest.raises(ProviderConfigError, match="RATE_LIMIT_STRATEGY"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_RATE_LIMIT_STRATEGY": "adaptive",
            }
        )

    with pytest.raises(ProviderConfigError, match="RATE_LIMIT_REQUESTS_PER_MINUTE"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_RATE_LIMIT_REQUESTS_PER_MINUTE": "0",
            }
        )

    with pytest.raises(ProviderConfigError, match="RATE_LIMIT_SCOPE"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_RATE_LIMIT_SCOPE": "global",
            }
        )


def test_provider_config_rejects_invalid_retry_policy() -> None:
    with pytest.raises(ProviderConfigError, match="GOD_CODE_PROVIDER_MAX_RETRIES"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_MAX_RETRIES": "-1",
            }
        )


def test_provider_config_rejects_retry_max_delay_below_base_delay() -> None:
    with pytest.raises(ProviderConfigError, match="RETRY_MAX_DELAY_MS"):
        load_provider_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS": "100",
                "GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS": "50",
            }
        )


def test_provider_chain_config_returns_none_without_real_primary() -> None:
    assert (
        load_provider_chain_config_from_env(
            {
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
            }
        )
        is None
    )
    assert load_provider_chain_config_from_env({"GOD_CODE_PROVIDER": "fake"}) is None


def test_provider_chain_config_loads_fallback_entries() -> None:
    config = load_provider_chain_config_from_env(
        {
            "GOD_CODE_PROVIDER": "openai",
            "GOD_CODE_MODEL": "primary-model",
            "GOD_CODE_API_KEY_ENV": "PRIMARY_API_KEY",
            "PRIMARY_API_KEY": "primary-secret",
            "GOD_CODE_PROVIDER_FALLBACKS": json.dumps(
                [
                    {
                        "provider": "openai-compatible",
                        "model": "fallback-model",
                        "api_key_env": "FALLBACK_API_KEY",
                        "base_url": "https://fallback.example.test/v1",
                        "timeout_s": 20,
                        "max_retries": 1,
                        "retry_base_delay_ms": 10,
                        "retry_max_delay_ms": 40,
                    }
                ]
            ),
            "FALLBACK_API_KEY": "fallback-secret",
        }
    )

    assert config is not None
    assert config.primary.name == "openai"
    assert config.primary.model == "primary-model"
    assert config.primary.usage_budget == ProviderUsageBudget()
    assert len(config.fallbacks) == 1
    fallback = config.fallbacks[0]
    assert fallback == ProviderConfig(
        name="openai-compatible",
        model="fallback-model",
        api_key_env="FALLBACK_API_KEY",
        base_url="https://fallback.example.test/v1",
        timeout_s=20.0,
        retry=ProviderRetryPolicy(max_retries=1, base_delay_ms=10, max_delay_ms=40),
    )


def test_provider_chain_config_applies_usage_budget_to_fallback_entries() -> None:
    config = load_provider_chain_config_from_env(
        {
            "GOD_CODE_PROVIDER": "openai",
            "GOD_CODE_MODEL": "primary-model",
            "GOD_CODE_API_KEY_ENV": "PRIMARY_API_KEY",
            "PRIMARY_API_KEY": "primary-secret",
            "GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS": "100",
            "GOD_CODE_PROVIDER_REQUIRE_USAGE": "yes",
            "GOD_CODE_PROVIDER_FALLBACKS": json.dumps(
                [
                    {
                        "provider": "openai-compatible",
                        "model": "fallback-model",
                        "api_key_env": "FALLBACK_API_KEY",
                    }
                ]
            ),
            "FALLBACK_API_KEY": "fallback-secret",
        }
    )

    assert config is not None
    assert config.primary.usage_budget == ProviderUsageBudget(
        max_total_tokens=100,
        require_usage=True,
    )
    assert config.fallbacks[0].usage_budget == ProviderUsageBudget(
        max_total_tokens=100,
        require_usage=True,
    )


def test_provider_chain_config_applies_rate_limit_policy_to_fallback_entries() -> None:
    config = load_provider_chain_config_from_env(
        {
            "GOD_CODE_PROVIDER": "openai",
            "GOD_CODE_MODEL": "primary-model",
            "GOD_CODE_API_KEY_ENV": "PRIMARY_API_KEY",
            "PRIMARY_API_KEY": "primary-secret",
            "GOD_CODE_PROVIDER_RATE_LIMIT_ENABLED": "yes",
            "GOD_CODE_PROVIDER_RATE_LIMIT_MIN_INTERVAL_MS": "500",
            "GOD_CODE_PROVIDER_FALLBACKS": json.dumps(
                [
                    {
                        "provider": "openai-compatible",
                        "model": "fallback-model",
                        "api_key_env": "FALLBACK_API_KEY",
                    }
                ]
            ),
            "FALLBACK_API_KEY": "fallback-secret",
        }
    )

    assert config is not None
    assert config.primary.rate_limit == ProviderRateLimitPolicy(
        enabled=True,
        min_interval_ms=500,
    )
    assert config.fallbacks[0].rate_limit == ProviderRateLimitPolicy(
        enabled=True,
        min_interval_ms=500,
    )


def test_provider_chain_config_applies_tool_use_policy_to_fallback_entries() -> None:
    config = load_provider_chain_config_from_env(
        {
            "GOD_CODE_PROVIDER": "openai",
            "GOD_CODE_MODEL": "primary-model",
            "GOD_CODE_API_KEY_ENV": "PRIMARY_API_KEY",
            "PRIMARY_API_KEY": "primary-secret",
            "GOD_CODE_PROVIDER_PARALLEL_TOOL_CALLS": "yes",
            "GOD_CODE_PROVIDER_FALLBACKS": json.dumps(
                [
                    {
                        "provider": "openai-compatible",
                        "model": "fallback-model",
                        "api_key_env": "FALLBACK_API_KEY",
                    }
                ]
            ),
            "FALLBACK_API_KEY": "fallback-secret",
        }
    )

    assert config is not None
    assert config.primary.tool_use == ProviderToolUsePolicy(parallel_tool_calls=True)
    assert config.fallbacks[0].tool_use == ProviderToolUsePolicy(parallel_tool_calls=True)


def test_provider_chain_config_rejects_invalid_fallback_json() -> None:
    with pytest.raises(ProviderConfigError, match="valid JSON"):
        load_provider_chain_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_FALLBACKS": "not-json",
            }
        )

    with pytest.raises(ProviderConfigError, match="JSON array"):
        load_provider_chain_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_FALLBACKS": json.dumps({"provider": "fallback"}),
            }
        )


def test_provider_chain_config_rejects_invalid_fallback_entry_shape() -> None:
    with pytest.raises(ProviderConfigError, match="index 0 must be an object"):
        load_provider_chain_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_FALLBACKS": json.dumps(["fallback"]),
            }
        )

    with pytest.raises(ProviderConfigError, match="requires non-empty string field: model"):
        load_provider_chain_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_FALLBACKS": json.dumps(
                    [
                        {
                            "provider": "fallback",
                            "api_key_env": "FALLBACK_API_KEY",
                        }
                    ]
                ),
                "FALLBACK_API_KEY": "fallback-secret",
            }
        )


def test_provider_chain_config_rejects_unset_fallback_api_key() -> None:
    with pytest.raises(ProviderConfigError, match="FALLBACK_API_KEY"):
        load_provider_chain_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_FALLBACKS": json.dumps(
                    [
                        {
                            "provider": "fallback",
                            "model": "fallback-model",
                            "api_key_env": "FALLBACK_API_KEY",
                        }
                    ]
                ),
            }
        )


def test_provider_chain_config_accepts_local_openai_compatible_fallback_without_api_key() -> None:
    config = load_provider_chain_config_from_env(
        {
            "GOD_CODE_PROVIDER": "openai",
            "GOD_CODE_MODEL": "primary-model",
            "GOD_CODE_API_KEY_ENV": "PRIMARY_API_KEY",
            "PRIMARY_API_KEY": "primary-secret",
            "GOD_CODE_PROVIDER_FALLBACKS": json.dumps(
                [
                    {
                        "provider": "local-openai-compatible",
                        "model": "local-fallback",
                        "base_url": "http://127.0.0.1:11434/v1",
                    }
                ]
            ),
        }
    )

    assert config is not None
    assert config.fallbacks == [
        ProviderConfig(
            name="local-openai-compatible",
            model="local-fallback",
            base_url="http://127.0.0.1:11434/v1",
        )
    ]


def test_provider_chain_config_rejects_local_fallback_with_unset_optional_api_key() -> None:
    with pytest.raises(ProviderConfigError, match="LOCAL_FALLBACK_KEY"):
        load_provider_chain_config_from_env(
            {
                "GOD_CODE_PROVIDER": "openai",
                "GOD_CODE_MODEL": "primary-model",
                "GOD_CODE_API_KEY_ENV": "PRIMARY_API_KEY",
                "PRIMARY_API_KEY": "primary-secret",
                "GOD_CODE_PROVIDER_FALLBACKS": json.dumps(
                    [
                        {
                            "provider": "local-openai-compatible",
                            "model": "local-fallback",
                            "api_key_env": "LOCAL_FALLBACK_KEY",
                        }
                    ]
                ),
            }
        )


def test_provider_chain_config_rejects_duplicate_fallback_identity() -> None:
    with pytest.raises(ProviderConfigError, match="duplicates"):
        load_provider_chain_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_FALLBACKS": json.dumps(
                    [
                        {
                            "provider": "demo",
                            "model": "demo-model",
                            "api_key_env": "FALLBACK_API_KEY",
                        }
                    ]
                ),
                "FALLBACK_API_KEY": "fallback-secret",
            }
        )


def test_provider_chain_config_rejects_invalid_fallback_retry_policy() -> None:
    with pytest.raises(ProviderConfigError, match="retry_max_delay_ms"):
        load_provider_chain_config_from_env(
            {
                "GOD_CODE_PROVIDER": "demo",
                "GOD_CODE_MODEL": "demo-model",
                "GOD_CODE_API_KEY_ENV": "DEMO_API_KEY",
                "DEMO_API_KEY": "secret",
                "GOD_CODE_PROVIDER_FALLBACKS": json.dumps(
                    [
                        {
                            "provider": "fallback",
                            "model": "fallback-model",
                            "api_key_env": "FALLBACK_API_KEY",
                            "max_retries": 1,
                            "retry_base_delay_ms": 100,
                            "retry_max_delay_ms": 50,
                        }
                    ]
                ),
                "FALLBACK_API_KEY": "fallback-secret",
            }
        )
