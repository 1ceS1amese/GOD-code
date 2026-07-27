from __future__ import annotations

import json
from collections.abc import Iterator
from uuid import uuid4

from god_code_engine.api.god_code_api_models import AssistantMessage, ToolCall
from god_code_engine.models.base import (
    AssistantDelta,
    AssistantMessageAction,
    ModelRequest,
    ModelStreamEvent,
    StreamingModelAdapter,
    ToolCallAction,
)
from god_code_engine.types import JsonObject


class FakeModelAdapter(StreamingModelAdapter):
    name = "fake"

    def next_action(self, request: ModelRequest) -> AssistantMessageAction | ToolCallAction:
        messages = request.messages
        if not messages:
            return AssistantMessageAction(
                message=AssistantMessage(
                    role="assistant",
                    content="No messages were provided to the fake model.",
                )
            )

        last_message = messages[-1]
        kind = last_message.get("kind")

        if kind == "user":
            content = str(last_message.get("content", "")).strip()
            return self._action_from_prompt(content, request.tools)

        if kind == "tool_result":
            return AssistantMessageAction(
                message=AssistantMessage(
                    role="assistant",
                    content=self._summarize_tool_result(last_message),
                )
            )

        return AssistantMessageAction(
            message=AssistantMessage(
                role="assistant",
                content="Unsupported message flow for fake model adapter.",
            )
        )

    def stream_actions(self, request: ModelRequest) -> Iterator[ModelStreamEvent]:
        action = self.next_action(request)
        if isinstance(action, ToolCallAction):
            yield action
            return

        if action.message.content:
            yield AssistantDelta(text=action.message.content)
        yield action

    def _action_from_prompt(self, content: str, tools: list) -> AssistantMessageAction | ToolCallAction:
        if content.startswith("read "):
            file_path = content[5:].strip()
            if file_path:
                return ToolCallAction(
                    tool_call=ToolCall(
                        tool_call_id=uuid4().hex,
                        tool_name="Read",
                        input={"path": file_path},
                    )
                )

        if content.startswith("edit "):
            raw = content[5:]
            parts = [part.strip() for part in raw.split(":::")]
            if len(parts) == 3 and parts[0]:
                return ToolCallAction(
                    tool_call=ToolCall(
                        tool_call_id=uuid4().hex,
                        tool_name="Edit",
                        input={
                            "path": parts[0],
                            "find": parts[1],
                            "replace": parts[2],
                        },
                    )
                )

        if content.startswith("bash "):
            command = content[5:].strip()
            if command:
                return ToolCallAction(
                    tool_call=ToolCall(
                        tool_call_id=uuid4().hex,
                        tool_name="Bash",
                        input={"command": command},
                    )
                )

        if content.startswith("list "):
            file_path = content[5:].strip()
            if file_path:
                return ToolCallAction(
                    tool_call=ToolCall(
                        tool_call_id=uuid4().hex,
                        tool_name="ListFiles",
                        input={"path": file_path},
                    )
                )

        if content.startswith("search "):
            raw = content[7:]
            parts = [part.strip() for part in raw.split(":::")]
            if len(parts) == 2 and parts[0] and parts[1]:
                return ToolCallAction(
                    tool_call=ToolCall(
                        tool_call_id=uuid4().hex,
                        tool_name="Search",
                        input={"path": parts[0], "pattern": parts[1]},
                    )
                )

        if content.startswith("write "):
            raw = content[6:]
            parts = [part.strip() for part in raw.split(":::", 1)]
            if len(parts) == 2 and parts[0]:
                return ToolCallAction(
                    tool_call=ToolCall(
                        tool_call_id=uuid4().hex,
                        tool_name="Write",
                        input={"path": parts[0], "content": parts[1]},
                    )
                )

        if content.startswith("tool "):
            return self._external_tool_action(content[5:].strip(), tools)

        return AssistantMessageAction(
            message=AssistantMessage(
                role="assistant",
                content=(
                    "Fake model only supports deterministic prompts: "
                    "'read <path>', 'edit <path> ::: <find> ::: <replace>', "
                    "'bash <command>', 'list <path>', "
                    "'search <path> ::: <pattern>', 'write <path> ::: <content>', "
                    'or \'tool <tool_name> <json_object>\'.'
                ),
            )
        )

    def _external_tool_action(
        self,
        raw: str,
        tools: list,
    ) -> AssistantMessageAction | ToolCallAction:
        tool_name, separator, raw_input = raw.partition(" ")
        if not tool_name or not separator:
            return AssistantMessageAction(
                message=AssistantMessage(
                    role="assistant",
                    content='Fake model tool prompts use: tool <tool_name> <json_object>.',
                )
            )

        available_tool_names = {tool.name for tool in tools}
        if tool_name not in available_tool_names:
            return AssistantMessageAction(
                message=AssistantMessage(
                    role="assistant",
                    content=f"Tool is not available in the current fake model catalog: {tool_name}",
                )
            )

        try:
            parsed_input = json.loads(raw_input)
        except json.JSONDecodeError as error:
            return AssistantMessageAction(
                message=AssistantMessage(
                    role="assistant",
                    content=f"Fake model tool input must be valid JSON: {error}",
                )
            )

        if not isinstance(parsed_input, dict):
            return AssistantMessageAction(
                message=AssistantMessage(
                    role="assistant",
                    content="Fake model tool input must be a JSON object.",
                )
            )

        return ToolCallAction(
            tool_call=ToolCall(
                tool_call_id=uuid4().hex,
                tool_name=tool_name,
                input=parsed_input,
            )
        )

    def _summarize_tool_result(self, message: JsonObject) -> str:
        tool_name = str(message.get("tool_name", "unknown"))
        result = message.get("result")
        if not isinstance(result, dict):
            return f"{tool_name} completed with an unreadable result payload."

        if tool_name == "Read":
            output = result.get("output")
            if isinstance(output, dict):
                file_path = output.get("path", "<unknown>")
                content = output.get("content", "")
                return f"Read completed for {file_path}\n{content}"

        if tool_name == "Edit":
            output = result.get("output")
            if isinstance(output, dict):
                file_path = output.get("path", "<unknown>")
                replacements = output.get("replacements", 0)
                return f"Edit completed for {file_path} with {replacements} replacement(s)."

        if tool_name == "Bash":
            output = result.get("output")
            if isinstance(output, dict):
                stdout = str(output.get("stdout", "")).rstrip()
                stderr = str(output.get("stderr", "")).rstrip()
                exit_code = output.get("exit_code", 0)
                lines = [f"Bash completed with exit code {exit_code}."]
                if stdout:
                    lines.append("stdout:")
                    lines.append(stdout)
                if stderr:
                    lines.append("stderr:")
                    lines.append(stderr)
                return "\n".join(lines)

        if tool_name == "ListFiles":
            output = result.get("output")
            if isinstance(output, dict):
                file_path = output.get("path", "<unknown>")
                entries = output.get("entries", [])
                count = len(entries) if isinstance(entries, list) else 0
                return f"ListFiles completed for {file_path} with {count} entry/entries."

        if tool_name == "Search":
            output = result.get("output")
            if isinstance(output, dict):
                file_path = output.get("path", "<unknown>")
                matches = output.get("matches", [])
                count = len(matches) if isinstance(matches, list) else 0
                return f"Search completed for {file_path} with {count} match(es)."

        if tool_name == "Write":
            output = result.get("output")
            if isinstance(output, dict):
                file_path = output.get("path", "<unknown>")
                bytes_written = output.get("bytes", 0)
                return f"Write completed for {file_path} with {bytes_written} byte(s)."

        return f"{tool_name} completed."
