import io
import urllib.error

from god_code_engine.providers.errors import (
    infer_provider_from_url,
    map_anthropic_error_to_info,
    map_http_error_to_info,
    map_openai_error_to_info,
)
from god_code_engine.providers.http_client import ProviderClientError
from god_code_engine.providers.transport import _provider_http_error_from_exception


def test_openai_auth_error_mapping_is_sanitized() -> None:
    info = map_http_error_to_info(
        401,
        {
            "error": {
                "message": "raw prompt snippet must not leak",
                "type": "invalid_request_error",
                "code": "invalid_api_key",
            }
        },
        provider="openai-compatible",
    )

    error = ProviderClientError.from_error_info(info)

    assert info.category == "auth"
    assert info.retryable is False
    assert info.status_code == 401
    assert info.provider_error_code == "invalid_api_key"
    assert "raw prompt" not in str(error)
    assert str(error) == (
        "provider_error: auth from openai-compatible "
        "(HTTP 401, code=invalid_api_key, type=invalid_request_error)"
    )


def test_openai_quota_and_rate_limit_are_distinct() -> None:
    quota = map_openai_error_to_info(
        429,
        {"error": {"type": "insufficient_quota", "code": "insufficient_quota"}},
        provider="openai",
    )
    rate_limit = map_openai_error_to_info(
        429,
        {"error": {"type": "rate_limit_error", "code": "rate_limit_exceeded"}},
        provider="openai",
    )

    assert quota.category == "quota"
    assert quota.retryable is False
    assert rate_limit.category == "rate_limit"
    assert rate_limit.retryable is True


def test_anthropic_error_mapping_classifies_overloaded_and_context_length() -> None:
    overloaded = map_anthropic_error_to_info(
        529,
        {"type": "error", "error": {"type": "overloaded_error", "message": "busy"}},
        provider="anthropic",
    )
    context = map_anthropic_error_to_info(
        400,
        {
            "type": "error",
            "error": {
                "type": "invalid_request_error",
                "message": "context window is too long and must not leak",
            },
        },
        provider="anthropic",
    )

    assert overloaded.category == "server_error"
    assert overloaded.retryable is True
    assert context.category == "context_length"
    assert context.retryable is False
    assert "too long" not in ProviderClientError.from_error_info(context).args[0]


def test_provider_client_error_with_provider_preserves_sanitized_metadata() -> None:
    error = ProviderClientError.from_error_info(
        map_http_error_to_info(
            400,
            {"error": {"type": "invalid_request_error", "code": "context_length_exceeded"}},
            provider="openai-compatible",
        )
    )

    remapped = error.with_provider("local-openai-compatible")

    assert remapped is not error
    assert remapped.error_info is not None
    assert remapped.error_info.provider == "local-openai-compatible"
    assert remapped.error_info.category == "context_length"
    assert str(remapped) == (
        "provider_error: context_length from local-openai-compatible "
        "(HTTP 400, code=context_length_exceeded, type=invalid_request_error)"
    )


def test_urllib_http_error_body_mapping_is_bounded_and_sanitized() -> None:
    body = io.BytesIO(
        b'{"error":{"message":"secret prompt body","type":"rate_limit_error",'
        b'"code":"rate_limit_exceeded"}}'
    )
    http_error = urllib.error.HTTPError(
        "https://provider.test/v1/chat/completions",
        429,
        "Too Many Requests",
        {},
        body,
    )

    error = _provider_http_error_from_exception(
        "https://provider.test/v1/chat/completions",
        http_error,
    )

    assert error.retryable is True
    assert error.status_code == 429
    assert error.error_info is not None
    assert error.error_info.category == "rate_limit"
    assert error.error_info.provider == "openai-compatible"
    assert "secret prompt body" not in str(error)


def test_provider_family_inference_from_url() -> None:
    assert infer_provider_from_url("https://provider.test/v1/chat/completions") == (
        "openai-compatible"
    )
    assert infer_provider_from_url("https://provider.test/v1/responses") == "openai-responses"
    assert infer_provider_from_url("https://provider.test/v1/messages") == "anthropic"
    assert infer_provider_from_url("https://provider.test/unknown") is None
