import pytest

from god_code_engine.api.god_code_api_models import ToolCatalogEntry
from god_code_engine.models.base import AssistantMessageAction, ToolCallAction, ToolCallBatchAction
from god_code_engine.providers.base import ProviderResponseError
from god_code_engine.providers.normalizer import (
    SimpleProviderResponseNormalizer,
    validate_tool_call_against_catalog,
)


def test_provider_normalizer_maps_assistant_payload() -> None:
    action = SimpleProviderResponseNormalizer().normalize(
        {"kind": "assistant", "content": "hello"}
    )

    assert isinstance(action, AssistantMessageAction)
    assert action.message.content == "hello"


def test_provider_normalizer_maps_tool_call_payload() -> None:
    action = SimpleProviderResponseNormalizer().normalize(
        {
            "kind": "tool_call",
            "tool_call_id": "tc1",
            "tool_name": "Read",
            "input": {"path": "README.md"},
        }
    )

    assert isinstance(action, ToolCallAction)
    assert action.tool_call.tool_call_id == "tc1"
    assert action.tool_call.tool_name == "Read"
    assert action.tool_call.input["path"] == "README.md"


def test_provider_normalizer_maps_tool_call_batch_payload() -> None:
    action = SimpleProviderResponseNormalizer().normalize(
        {
            "kind": "tool_call_batch",
            "tool_calls": [
                {
                    "tool_call_id": "tc1",
                    "tool_name": "Read",
                    "input": {"path": "README.md"},
                },
                {
                    "tool_call_id": "tc2",
                    "tool_name": "Search",
                    "input": {"path": ".", "pattern": "TODO"},
                },
            ],
        }
    )

    assert isinstance(action, ToolCallBatchAction)
    assert [tool_call.tool_call_id for tool_call in action.tool_calls] == ["tc1", "tc2"]
    assert action.tool_calls[1].tool_name == "Search"


def test_provider_normalizer_rejects_malformed_tool_call_batch_payloads() -> None:
    with pytest.raises(ProviderResponseError, match="non-empty list"):
        SimpleProviderResponseNormalizer().normalize(
            {"kind": "tool_call_batch", "tool_calls": []}
        )

    with pytest.raises(ProviderResponseError, match="Duplicate provider tool_call_id"):
        SimpleProviderResponseNormalizer().normalize(
            {
                "kind": "tool_call_batch",
                "tool_calls": [
                    {"tool_call_id": "tc1", "tool_name": "Read", "input": {}},
                    {"tool_call_id": "tc1", "tool_name": "Search", "input": {}},
                ],
            }
        )

    with pytest.raises(ProviderResponseError, match="input"):
        SimpleProviderResponseNormalizer().normalize(
            {
                "kind": "tool_call_batch",
                "tool_calls": [
                    {"tool_call_id": "tc1", "tool_name": "Read", "input": "not-object"},
                ],
            }
        )


def test_provider_normalizer_rejects_unknown_kind() -> None:
    with pytest.raises(ProviderResponseError):
        SimpleProviderResponseNormalizer().normalize({"kind": "unknown"})


def test_provider_catalog_validation_allows_assistant_actions() -> None:
    action = SimpleProviderResponseNormalizer().normalize(
        {"kind": "assistant", "content": "hello"}
    )

    validated = validate_tool_call_against_catalog(action, [])

    assert validated is action


def test_provider_catalog_validation_allows_known_tool_calls() -> None:
    action = SimpleProviderResponseNormalizer().normalize(
        {
            "kind": "tool_call",
            "tool_call_id": "tc1",
            "tool_name": "Read",
            "input": {"path": "README.md"},
        }
    )

    validated = validate_tool_call_against_catalog(
        action,
        [ToolCatalogEntry(name="Read", description="read files")],
    )

    assert validated is action


def test_provider_catalog_validation_rejects_unknown_tool_calls() -> None:
    action = SimpleProviderResponseNormalizer().normalize(
        {
            "kind": "tool_call",
            "tool_call_id": "tc1",
            "tool_name": "Bash",
            "input": {"command": "printf ok"},
        }
    )

    with pytest.raises(ProviderResponseError, match="Provider returned unknown tool: Bash"):
        validate_tool_call_against_catalog(
            action,
            [ToolCatalogEntry(name="Read", description="read files")],
        )


def test_provider_catalog_validation_rejects_unknown_batch_tool_calls() -> None:
    action = SimpleProviderResponseNormalizer().normalize(
        {
            "kind": "tool_call_batch",
            "tool_calls": [
                {"tool_call_id": "tc1", "tool_name": "Read", "input": {"path": "README.md"}},
                {"tool_call_id": "tc2", "tool_name": "Bash", "input": {"command": "printf ok"}},
            ],
        }
    )

    with pytest.raises(ProviderResponseError, match="Provider returned unknown tool: Bash"):
        validate_tool_call_against_catalog(
            action,
            [ToolCatalogEntry(name="Read", description="read files")],
        )
