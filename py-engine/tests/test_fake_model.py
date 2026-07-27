from god_code_engine.models.base import (
    AssistantDelta,
    AssistantMessageAction,
    ModelOptions,
    ModelRequest,
    ToolCallAction,
)
from god_code_engine.models.fake import FakeModelAdapter
from god_code_engine.types import Messages
from god_code_engine.api.god_code_api_models import ToolCatalogEntry


def model_request(
    messages: Messages,
    stream: bool = False,
    tools: list[ToolCatalogEntry] | None = None,
) -> ModelRequest:
    return ModelRequest(messages=messages, tools=tools or [], options=ModelOptions(stream=stream))


def test_fake_model_emits_read_tool_call() -> None:
    model = FakeModelAdapter()

    action = model.next_action(model_request([{"kind": "user", "content": "read README.md"}]))

    assert isinstance(action, ToolCallAction)
    assert action.tool_call.tool_name == "Read"
    assert action.tool_call.input["path"] == "README.md"


def test_fake_model_emits_edit_tool_call() -> None:
    model = FakeModelAdapter()

    action = model.next_action(model_request([{"kind": "user", "content": "edit a.txt ::: hello ::: world"}]))

    assert isinstance(action, ToolCallAction)
    assert action.tool_call.tool_name == "Edit"
    assert action.tool_call.input["find"] == "hello"
    assert action.tool_call.input["replace"] == "world"


def test_fake_model_summarizes_tool_result() -> None:
    model = FakeModelAdapter()

    action = model.next_action(
        model_request(
            [
                {
                    "kind": "tool_result",
                    "tool_name": "Bash",
                    "result": {"ok": True, "output": {"stdout": "ok", "stderr": "", "exit_code": 0}},
                }
            ]
        )
    )

    assert isinstance(action, AssistantMessageAction)
    assert "stdout" in action.message.content
    assert "ok" in action.message.content


def test_fake_model_streams_final_assistant_message() -> None:
    model = FakeModelAdapter()

    events = list(
        model.stream_actions(
            model_request(
                [
                    {
                        "kind": "tool_result",
                        "tool_name": "Bash",
                        "result": {
                            "ok": True,
                            "output": {"stdout": "ok", "stderr": "", "exit_code": 0},
                        },
                    }
                ],
                stream=True,
            )
        )
    )

    assert isinstance(events[0], AssistantDelta)
    assert isinstance(events[1], AssistantMessageAction)
    assert events[0].text == events[1].message.content


def test_fake_model_streams_tool_calls_as_single_event() -> None:
    model = FakeModelAdapter()

    events = list(
        model.stream_actions(
            model_request(
                [
                    {
                        "kind": "user",
                        "content": "read README.md",
                    }
                ],
                stream=True,
            )
        )
    )

    assert len(events) == 1
    assert isinstance(events[0], ToolCallAction)


def test_fake_model_emits_list_files_tool_call() -> None:
    model = FakeModelAdapter()

    action = model.next_action(model_request([{"kind": "user", "content": "list ."}]))

    assert isinstance(action, ToolCallAction)
    assert action.tool_call.tool_name == "ListFiles"
    assert action.tool_call.input["path"] == "."


def test_fake_model_emits_search_tool_call() -> None:
    model = FakeModelAdapter()

    action = model.next_action(model_request([{"kind": "user", "content": "search README.md ::: GOD-code"}]))

    assert isinstance(action, ToolCallAction)
    assert action.tool_call.tool_name == "Search"
    assert action.tool_call.input["path"] == "README.md"
    assert action.tool_call.input["pattern"] == "GOD-code"


def test_fake_model_emits_write_tool_call() -> None:
    model = FakeModelAdapter()

    action = model.next_action(model_request([{"kind": "user", "content": "write fixture.txt ::: hello"}]))

    assert isinstance(action, ToolCallAction)
    assert action.tool_call.tool_name == "Write"
    assert action.tool_call.input["path"] == "fixture.txt"
    assert action.tool_call.input["content"] == "hello"


def test_fake_model_emits_configured_external_tool_call() -> None:
    model = FakeModelAdapter()

    action = model.next_action(
        model_request(
            [{"kind": "user", "content": 'tool plugin.executable.echo {"value":"hello"}'}],
            tools=[ToolCatalogEntry(name="plugin.executable.echo", description="echo")],
        )
    )

    assert isinstance(action, ToolCallAction)
    assert action.tool_call.tool_name == "plugin.executable.echo"
    assert action.tool_call.input == {"value": "hello"}


def test_fake_model_rejects_unconfigured_external_tool_call() -> None:
    model = FakeModelAdapter()

    action = model.next_action(
        model_request([{"kind": "user", "content": 'tool plugin.missing.echo {"value":"hello"}'}])
    )

    assert isinstance(action, AssistantMessageAction)
    assert "not available" in action.message.content
