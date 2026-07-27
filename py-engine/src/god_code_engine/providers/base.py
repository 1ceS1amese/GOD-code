from __future__ import annotations

from god_code_engine.models.base import ModelAction, ModelAdapter
from god_code_engine.types import JsonMapping


class ProviderResponseError(ValueError):
    """Raised when a provider payload cannot be normalized."""


class ProviderModelAdapter(ModelAdapter):
    provider_name = "base-provider"


class ProviderResponseNormalizer:
    def normalize(self, raw: JsonMapping) -> ModelAction:
        raise NotImplementedError("ProviderResponseNormalizer.normalize must be implemented.")
