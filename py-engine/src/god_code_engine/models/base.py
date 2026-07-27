from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

from god_code_engine.api.god_code_api_models import AssistantMessage, ToolCall, ToolCatalogEntry
from god_code_engine.types import JsonObject, Messages


@dataclass(slots=True)
class ModelOptions:
    stream: bool = False
    max_tokens: int | None = None
    temperature: float | None = None
    provider: str | None = None


@dataclass(slots=True)
class ModelRequestBudget:
    estimated_input_tokens: int
    system_prompt_tokens: int
    message_tokens: int
    tool_schema_tokens: int
    provider_context_tokens: int
    model_option_tokens: int
    estimator: str
    max_input_tokens: int | None = None

    def to_dict(self) -> JsonObject:
        payload: JsonObject = {
            "estimated_input_tokens": self.estimated_input_tokens,
            "system_prompt_tokens": self.system_prompt_tokens,
            "message_tokens": self.message_tokens,
            "tool_schema_tokens": self.tool_schema_tokens,
            "provider_context_tokens": self.provider_context_tokens,
            "model_option_tokens": self.model_option_tokens,
            "estimator": self.estimator,
        }
        if self.max_input_tokens is not None:
            payload["max_input_tokens"] = self.max_input_tokens
        return payload


@dataclass(slots=True)
class PromptInjectionFinding:
    category: str
    message_index: int | None
    source: str
    severity: str
    pattern_id: str

    def to_dict(self) -> JsonObject:
        payload: JsonObject = {
            "category": self.category,
            "source": self.source,
            "severity": self.severity,
            "pattern_id": self.pattern_id,
        }
        if self.message_index is not None:
            payload["message_index"] = self.message_index
        return payload


@dataclass(slots=True)
class PromptInjectionReport:
    enabled: bool
    action: str
    finding_count: int
    findings: list[PromptInjectionFinding]

    def to_dict(self) -> JsonObject:
        return {
            "enabled": self.enabled,
            "action": self.action,
            "finding_count": self.finding_count,
            "findings": [finding.to_dict() for finding in self.findings],
        }


@dataclass(slots=True)
class ModelRequest:
    messages: Messages
    tools: list[ToolCatalogEntry]
    options: ModelOptions
    provider_context: JsonObject | None = None
    system_prompt: str | None = None
    budget: ModelRequestBudget | None = None
    prompt_injection_report: PromptInjectionReport | None = None


@dataclass(slots=True)
class AssistantMessageAction:
    message: AssistantMessage


@dataclass(slots=True)
class ToolCallAction:
    tool_call: ToolCall


@dataclass(slots=True)
class ToolCallBatchAction:
    tool_calls: list[ToolCall]


ModelAction = AssistantMessageAction | ToolCallAction | ToolCallBatchAction


@dataclass(slots=True)
class AssistantDelta:
    text: str

    def to_dict(self) -> JsonObject:
        return {"text": self.text}


ModelStreamEvent = AssistantDelta | AssistantMessageAction | ToolCallAction | ToolCallBatchAction


class ModelAdapter:
    name = "base"

    def next_action(self, request: ModelRequest) -> ModelAction:
        raise NotImplementedError("ModelAdapter.next_action must be implemented.")


class StreamingModelAdapter(ModelAdapter):
    def stream_actions(self, request: ModelRequest) -> Iterator[ModelStreamEvent]:
        raise NotImplementedError("StreamingModelAdapter.stream_actions must be implemented.")
