from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace

from god_code_engine.models.base import ModelRequest
from god_code_engine.providers.config import ProviderConfig
from god_code_engine.providers.errors import ProviderErrorInfo, provider_error_message
from god_code_engine.types import JsonMapping


class ProviderClientError(RuntimeError):
    """Raised when a provider client cannot produce a usable response."""

    def __init__(
        self,
        message: str,
        *,
        retryable: bool = False,
        status_code: int | None = None,
        attempts: int = 1,
        error_info: ProviderErrorInfo | None = None,
    ) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.status_code = status_code
        self.attempts = attempts
        self.error_info = error_info

    @classmethod
    def from_error_info(
        cls,
        error_info: ProviderErrorInfo,
        *,
        attempts: int = 1,
    ) -> ProviderClientError:
        return cls(
            provider_error_message(error_info),
            retryable=error_info.retryable,
            status_code=error_info.status_code,
            attempts=attempts,
            error_info=error_info,
        )

    def with_provider(self, provider: str) -> ProviderClientError:
        if self.error_info is None or self.error_info.provider == provider:
            return self
        error_info = replace(self.error_info, provider=provider)
        return ProviderClientError.from_error_info(error_info, attempts=self.attempts)


class HttpProviderClient:
    supports_stream = False

    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        raise NotImplementedError("HttpProviderClient.complete must be implemented.")

    def stream(
        self,
        request: ModelRequest,
        config: ProviderConfig,
    ) -> Iterator[JsonMapping]:
        raise NotImplementedError("HttpProviderClient.stream must be implemented.")


class UnsupportedHttpProviderClient(HttpProviderClient):
    def complete(self, request: ModelRequest, config: ProviderConfig) -> JsonMapping:
        del request
        raise ProviderClientError(
            f"Provider '{config.name}' is configured, but no HTTP provider client is installed."
        )

    def stream(
        self,
        request: ModelRequest,
        config: ProviderConfig,
    ) -> Iterator[JsonMapping]:
        del request
        raise ProviderClientError(
            f"Provider '{config.name}' is configured, but no streaming provider client is installed."
        )
