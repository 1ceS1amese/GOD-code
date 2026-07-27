from __future__ import annotations

import threading
import time
import posixpath
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Callable

from god_code_engine.api.god_code_api_models import (
    ToolCall,
    ToolExecutionResult,
    ValidationError,
    build_tool_error,
    is_json_object,
    parse_tool_execution_result,
)
from god_code_engine.types import JsonObject

RequestCallable = Callable[[str, JsonObject, float], JsonObject]

PARALLEL_SAFE_TOOL_NAMES = frozenset({"Read", "ListFiles", "Search"})


@dataclass(slots=True)
class ToolConcurrencyPolicy:
    max_parallel: int = 4
    parallel_safe_tool_names: frozenset[str] = PARALLEL_SAFE_TOOL_NAMES

    def is_parallel_safe(self, tool_call: ToolCall) -> bool:
        return tool_call.tool_name in self.parallel_safe_tool_names


@dataclass(slots=True)
class ScheduledToolResult:
    tool_call: ToolCall
    result: ToolExecutionResult
    started_at: float
    finished_at: float
    execution_mode: str
    scheduler_plan: str = "dependency_graph"
    scheduler_wave: int | None = None
    scheduler_wave_size: int | None = None
    dependency_count: int = 0


@dataclass(frozen=True, slots=True)
class ToolResourceAccess:
    access: str
    scope: str
    path: str | None
    key: str


@dataclass(slots=True)
class ToolDependencyEdge:
    before_index: int
    after_index: int
    reason: str


@dataclass(slots=True)
class ToolSchedulingNode:
    index: int
    tool_call: ToolCall
    parallel_safe: bool
    resource_keys: frozenset[str]


@dataclass(slots=True)
class ToolExecutionPlan:
    nodes: list[ToolSchedulingNode]
    edges: list[ToolDependencyEdge]
    waves: list[list[int]]
    plan_name: str = "dependency_graph"

    def execution_modes(self, max_parallel: int) -> list[str]:
        modes = ["serial"] * len(self.nodes)
        for wave in self.waves:
            if len(wave) <= 1 or max_parallel <= 1:
                continue
            for index in wave:
                modes[index] = "parallel"
        return modes

    def wave_index_for(self, node_index: int) -> int | None:
        for wave_index, wave in enumerate(self.waves):
            if node_index in wave:
                return wave_index
        return None

    def dependency_count_for(self, node_index: int) -> int:
        return sum(
            1
            for edge in self.edges
            if edge.before_index == node_index or edge.after_index == node_index
        )


class ToolScheduler:
    execution_mode = "serial"

    def __init__(
        self,
        requester: RequestCallable,
        request_timeout_s: float = 15.0,
        concurrency_policy: ToolConcurrencyPolicy | None = None,
        batch_request_supported: bool = False,
    ) -> None:
        self._requester = requester
        self._request_timeout_s = request_timeout_s
        self._concurrency_policy = concurrency_policy or ToolConcurrencyPolicy()
        self._batch_request_supported = batch_request_supported

    def execute(self, session_id: str, turn_id: str, tool_call: ToolCall) -> ToolExecutionResult:
        self._validate_execution_identity(session_id, turn_id)
        request = self._build_execute_tool_request(session_id, turn_id, tool_call)
        response = self._requester(
            "execute_tool",
            request,
            self._request_timeout_s,
        )
        return parse_tool_execution_result(response)

    def plan_execution_modes(self, tool_calls: list[ToolCall]) -> list[str]:
        return self.plan_execution(tool_calls).execution_modes(self._max_parallel)

    def plan_execution(self, tool_calls: list[ToolCall]) -> ToolExecutionPlan:
        nodes = [self._build_node(index, tool_call) for index, tool_call in enumerate(tool_calls)]
        edges = self._infer_edges(nodes)
        waves = self._build_dependency_waves(nodes, edges)
        return ToolExecutionPlan(nodes=nodes, edges=edges, waves=waves)

    def execute_many(
        self,
        session_id: str,
        turn_id: str,
        tool_calls: list[ToolCall],
        cancel_event: threading.Event | None = None,
    ) -> list[ScheduledToolResult]:
        self._validate_execution_identity(session_id, turn_id)
        self._validate_tool_call_batch(tool_calls)
        scheduled_results: list[ScheduledToolResult | None] = [None] * len(tool_calls)
        plan = self.plan_execution(tool_calls)
        modes = plan.execution_modes(self._max_parallel)

        for wave_index, wave in enumerate(plan.waves):
            if self._cancel_requested(cancel_event):
                self._fill_cancelled(tool_calls, scheduled_results, wave[0])
                break

            if len(wave) == 1 or self._max_parallel <= 1:
                for index in wave:
                    if self._cancel_requested(cancel_event):
                        self._fill_cancelled(tool_calls, scheduled_results, index)
                        break
                    scheduled_results[index] = self._execute_scheduled(
                        session_id,
                        turn_id,
                        tool_calls[index],
                        modes[index],
                        scheduler_wave=wave_index,
                        scheduler_wave_size=len(wave),
                        dependency_count=plan.dependency_count_for(index),
                    )
                continue

            for offset in range(0, len(wave), self._max_parallel):
                chunk = wave[offset : offset + self._max_parallel]
                if self._cancel_requested(cancel_event):
                    self._fill_cancelled(tool_calls, scheduled_results, chunk[0])
                    break
                self._execute_parallel_chunk(
                    session_id,
                    turn_id,
                    tool_calls,
                    scheduled_results,
                    chunk,
                    scheduler_wave=wave_index,
                    scheduler_wave_size=len(wave),
                    plan=plan,
                )

        missing_index = next(
            (index for index, result in enumerate(scheduled_results) if result is None),
            None,
        )
        if missing_index is not None:
            self._fill_cancelled(tool_calls, scheduled_results, missing_index)

        return [result for result in scheduled_results if result is not None]

    @property
    def max_parallel(self) -> int:
        return self._max_parallel

    @property
    def _max_parallel(self) -> int:
        return max(1, self._concurrency_policy.max_parallel)

    def _build_waves(self, tool_calls: list[ToolCall]) -> list[list[int]]:
        waves: list[list[int]] = []
        current_parallel_wave: list[int] = []

        for index, tool_call in enumerate(tool_calls):
            if self._concurrency_policy.is_parallel_safe(tool_call):
                current_parallel_wave.append(index)
                continue

            if current_parallel_wave:
                waves.append(current_parallel_wave)
                current_parallel_wave = []
            waves.append([index])

        if current_parallel_wave:
            waves.append(current_parallel_wave)
        return waves

    def _build_node(self, index: int, tool_call: ToolCall) -> ToolSchedulingNode:
        resources = self._resource_accesses(tool_call)
        parallel_safe = (
            self._concurrency_policy.is_parallel_safe(tool_call)
            and all(resource.access != "global" for resource in resources)
        )
        return ToolSchedulingNode(
            index=index,
            tool_call=tool_call,
            parallel_safe=parallel_safe,
            resource_keys=frozenset(resource.key for resource in resources),
        )

    def _resource_accesses(self, tool_call: ToolCall) -> tuple[ToolResourceAccess, ...]:
        tool_name = tool_call.tool_name
        if tool_name == "Read":
            path = self._normalized_input_path(tool_call)
            if path is None:
                return (_global_resource("unknown"),)
            return (_resource("read", "file", path),)
        if tool_name in {"ListFiles", "Search"}:
            path = self._normalized_input_path(tool_call)
            if path is None:
                return (_global_resource("unknown"),)
            return (_resource("read", "tree", path),)
        if tool_name in {"Edit", "Write"}:
            path = self._normalized_input_path(tool_call)
            if path is None:
                return (_global_resource("unknown"),)
            return (_resource("write", "file", path),)
        if tool_name == "Bash":
            return (_global_resource("process"),)
        return (_global_resource("external"),)

    def _normalized_input_path(self, tool_call: ToolCall) -> str | None:
        raw_path = tool_call.input.get("path")
        if not isinstance(raw_path, str) or raw_path.strip() == "":
            return None
        normalized = posixpath.normpath(raw_path.replace("\\", "/"))
        return "." if normalized == "" else normalized

    def _infer_edges(self, nodes: list[ToolSchedulingNode]) -> list[ToolDependencyEdge]:
        edges: list[ToolDependencyEdge] = []
        for left_index, left in enumerate(nodes):
            for right in nodes[left_index + 1 :]:
                reason = self._dependency_reason(left, right)
                if reason is not None:
                    edges.append(
                        ToolDependencyEdge(
                            before_index=left.index,
                            after_index=right.index,
                            reason=reason,
                        )
                    )
        return edges

    def _dependency_reason(
        self,
        left: ToolSchedulingNode,
        right: ToolSchedulingNode,
    ) -> str | None:
        if not left.parallel_safe or not right.parallel_safe:
            return "serial_only"
        left_resources = self._resource_accesses(left.tool_call)
        right_resources = self._resource_accesses(right.tool_call)
        for left_resource in left_resources:
            for right_resource in right_resources:
                if left_resource.access == "global" or right_resource.access == "global":
                    return "global_resource"
                if left_resource.access == "read" and right_resource.access == "read":
                    continue
                if _resources_overlap(left_resource, right_resource):
                    return "resource_conflict"
        return None

    def _build_dependency_waves(
        self,
        nodes: list[ToolSchedulingNode],
        edges: list[ToolDependencyEdge],
    ) -> list[list[int]]:
        remaining = {node.index for node in nodes}
        completed: set[int] = set()
        incoming: dict[int, set[int]] = {node.index: set() for node in nodes}
        for edge in edges:
            incoming[edge.after_index].add(edge.before_index)

        waves: list[list[int]] = []
        while remaining:
            ready = [
                node.index
                for node in nodes
                if node.index in remaining and incoming[node.index].issubset(completed)
            ]
            if not ready:
                return self._build_waves([node.tool_call for node in nodes])

            first_ready = ready[0]
            first_node = nodes[first_ready]
            if not first_node.parallel_safe:
                wave = [first_ready]
            else:
                wave = [
                    index
                    for index in ready
                    if nodes[index].parallel_safe
                ][: self._max_parallel]

            waves.append(wave)
            for index in wave:
                remaining.remove(index)
                completed.add(index)

        return waves

    def _execute_parallel_chunk(
        self,
        session_id: str,
        turn_id: str,
        tool_calls: list[ToolCall],
        scheduled_results: list[ScheduledToolResult | None],
        chunk: list[int],
        *,
        scheduler_wave: int,
        scheduler_wave_size: int,
        plan: ToolExecutionPlan,
    ) -> None:
        if not self._batch_request_supported:
            with ThreadPoolExecutor(max_workers=min(len(chunk), self._max_parallel)) as executor:
                futures: dict[Future[ScheduledToolResult], int] = {}
                for index in chunk:
                    futures[
                        executor.submit(
                            self._execute_scheduled,
                            session_id,
                            turn_id,
                            tool_calls[index],
                            "parallel",
                            scheduler_wave=scheduler_wave,
                            scheduler_wave_size=scheduler_wave_size,
                            dependency_count=plan.dependency_count_for(index),
                        )
                    ] = index
                for future in as_completed(futures):
                    scheduled_results[futures[future]] = future.result()
            return

        started_at = time.monotonic()
        request = self._build_execute_tools_request(
            session_id,
            turn_id,
            [tool_calls[index] for index in chunk],
        )
        response = self._requester(
            "execute_tools",
            request,
            self._request_timeout_s,
        )
        if not is_json_object(response):
            raise ValidationError("execute_tools response must contain only JSON values.")
        raw_results = response.get("results")
        if not isinstance(raw_results, list) or len(raw_results) != len(chunk):
            raise ValidationError("execute_tools returned an invalid result set.")
        parsed_results = [parse_tool_execution_result(result) for result in raw_results]
        finished_at = time.monotonic()
        for offset, index in enumerate(chunk):
            scheduled_results[index] = ScheduledToolResult(
                tool_call=tool_calls[index],
                result=parsed_results[offset],
                started_at=started_at,
                finished_at=finished_at,
                execution_mode="parallel",
                scheduler_wave=scheduler_wave,
                scheduler_wave_size=scheduler_wave_size,
                dependency_count=plan.dependency_count_for(index),
            )

    def _build_execute_tool_request(
        self,
        session_id: str,
        turn_id: str,
        tool_call: ToolCall,
    ) -> JsonObject:
        request: JsonObject = {
            "session_id": session_id,
            "turn_id": turn_id,
            **tool_call.to_dict(),
        }
        if not is_json_object(request):
            raise ValidationError("execute_tool request must contain only JSON values.")
        return request

    def _build_execute_tools_request(
        self,
        session_id: str,
        turn_id: str,
        tool_calls: list[ToolCall],
    ) -> JsonObject:
        request: JsonObject = {
            "session_id": session_id,
            "turn_id": turn_id,
            "tool_calls": [tool_call.to_dict() for tool_call in tool_calls],
        }
        if not is_json_object(request):
            raise ValidationError("execute_tools request must contain only JSON values.")
        return request

    @staticmethod
    def _validate_execution_identity(session_id: str, turn_id: str) -> None:
        if not isinstance(session_id, str) or not session_id.strip():
            raise ValidationError("Tool execution session id must be a non-empty string.")
        if not isinstance(turn_id, str) or not turn_id.strip():
            raise ValidationError("Tool execution turn id must be a non-empty string.")

    @staticmethod
    def _validate_tool_call_batch(tool_calls: list[ToolCall]) -> None:
        if not tool_calls:
            raise ValidationError("Tool execution batch must not be empty.")
        call_ids = [tool_call.tool_call_id for tool_call in tool_calls]
        if len(set(call_ids)) != len(call_ids):
            raise ValidationError("Tool execution batch contains duplicate tool call ids.")

    def _execute_scheduled(
        self,
        session_id: str,
        turn_id: str,
        tool_call: ToolCall,
        execution_mode: str,
        *,
        scheduler_wave: int | None = None,
        scheduler_wave_size: int | None = None,
        dependency_count: int = 0,
    ) -> ScheduledToolResult:
        started_at = time.monotonic()
        result = self.execute(session_id, turn_id, tool_call)
        finished_at = time.monotonic()
        return ScheduledToolResult(
            tool_call=tool_call,
            result=result,
            started_at=started_at,
            finished_at=finished_at,
            execution_mode=execution_mode,
            scheduler_wave=scheduler_wave,
            scheduler_wave_size=scheduler_wave_size,
            dependency_count=dependency_count,
        )

    def _fill_cancelled(
        self,
        tool_calls: list[ToolCall],
        scheduled_results: list[ScheduledToolResult | None],
        start_index: int,
    ) -> None:
        for index in range(start_index, len(tool_calls)):
            if scheduled_results[index] is not None:
                continue
            now = time.monotonic()
            scheduled_results[index] = ScheduledToolResult(
                tool_call=tool_calls[index],
                result=ToolExecutionResult(
                    ok=False,
                    error=build_tool_error("tool_cancelled", "Turn was cancelled before scheduling tool."),
                ),
                started_at=now,
                finished_at=now,
                execution_mode="cancelled",
                scheduler_plan="dependency_graph",
            )

    def _cancel_requested(self, cancel_event: threading.Event | None) -> bool:
        return cancel_event is not None and cancel_event.is_set()


def _resource(access: str, scope: str, path: str) -> ToolResourceAccess:
    return ToolResourceAccess(
        access=access,
        scope=scope,
        path=path,
        key=f"{access}:{scope}:{path}",
    )


def _global_resource(name: str) -> ToolResourceAccess:
    return ToolResourceAccess(
        access="global",
        scope="global",
        path=None,
        key=f"global:{name}",
    )


def _resources_overlap(left: ToolResourceAccess, right: ToolResourceAccess) -> bool:
    if left.path is None or right.path is None:
        return True
    if left.scope == "file" and right.scope == "file":
        return left.path == right.path
    if left.scope == "tree" and right.scope == "tree":
        return _same_or_child(left.path, right.path) or _same_or_child(right.path, left.path)
    if left.scope == "tree":
        return _same_or_child(right.path, left.path)
    if right.scope == "tree":
        return _same_or_child(left.path, right.path)
    return left.path == right.path


def _same_or_child(path: str, possible_parent: str) -> bool:
    if possible_parent == ".":
        return True
    return path == possible_parent or path.startswith(f"{possible_parent}/")
