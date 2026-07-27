from __future__ import annotations

import json
import math
import os
import queue
import sys
import threading
from collections import OrderedDict
from dataclasses import dataclass
from typing import Callable, TextIO
from uuid import uuid4

from god_code_engine.api.god_code_api_models import (
    CancelToolExecutionNotification,
    GodCodeEventEnvelope,
    JSON_SAFE_INTEGER_MAX,
    PromptMessage,
    ValidationError,
    parse_initial_messages,
    parse_prompt_message,
    parse_turn_options,
    parse_tool_catalog,
    is_json_object,
    is_json_value,
    require_dict,
    require_str,
)
from god_code_engine.engine.turn_engine import TurnEngine
from god_code_engine.providers.config import ProviderConfigError
from god_code_engine.providers.registry import (
    ProviderRegistry,
    ProviderRegistryError,
    create_default_provider_registry,
)
from god_code_engine.session.manager import SessionError, SessionManager, SessionState
from god_code_engine.tools.scheduler import ToolScheduler
from god_code_engine.tools.scheduler import ToolConcurrencyPolicy
from god_code_engine.transcripts.in_memory import InMemoryTranscriptStore
from god_code_engine.transcripts.jsonl import JsonlTranscriptStore
from god_code_engine.transcripts.base import TranscriptStore
from god_code_engine.types import JsonMapping, JsonObject

GOD_CODE_PROTOCOL_VERSION = "2.0"
JSON_RPC_MAX_LINE_BYTES = 1024 * 1024
JSON_RPC_MAX_PENDING_REQUESTS = 256
JSON_RPC_MIN_TIMEOUT_S = 0.001
JSON_RPC_MAX_TIMEOUT_S = 2_147_483.647
JSON_RPC_MAX_REQUEST_ID = JSON_SAFE_INTEGER_MAX
JSON_RPC_SETTLED_HISTORY_LIMIT = 512


class JsonRpcRequestError(RuntimeError):
    def __init__(self, code: int, message: str, data: object | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.data = data


@dataclass(slots=True)
class PendingResponse:
    waiter: queue.Queue[JsonObject]


RequestHandler = Callable[[JsonMapping], JsonObject]
NotificationHandler = Callable[[JsonMapping], None]


@dataclass(slots=True, eq=False)
class RequestRegistration:
    handler: RequestHandler


@dataclass(slots=True, eq=False)
class NotificationRegistration:
    handler: NotificationHandler


class JsonRpcConnection:
    def __init__(
        self,
        infile: TextIO,
        outfile: TextIO,
        protocol_diagnostic: Callable[[str], None] | None = None,
    ) -> None:
        self._infile = infile
        self._outfile = outfile
        self._write_lock = threading.Lock()
        self._pending_lock = threading.Lock()
        self._handler_lock = threading.Lock()
        self._stop_lock = threading.Lock()
        self._pending: dict[int, PendingResponse] = {}
        self._settled_requests: OrderedDict[int, str] = OrderedDict()
        self._protocol_diagnostic = protocol_diagnostic
        self._request_handlers: dict[str, RequestRegistration] = {}
        self._notification_handlers: dict[str, list[NotificationRegistration]] = {}
        self._stop_event = threading.Event()
        self._terminal_error: JsonRpcRequestError | None = None
        self._next_id: int | None = 1

    def register_request_handler(
        self, method: str, handler: RequestHandler
    ) -> Callable[[], None]:
        with self._handler_lock:
            self._raise_if_stopped()
            require_json_rpc_method(method)
            registration = RequestRegistration(handler=handler)
            self._request_handlers[method] = registration
        registered = True

        def unregister() -> None:
            nonlocal registered
            with self._handler_lock:
                if not registered:
                    return
                registered = False
                if self._request_handlers.get(method) is registration:
                    self._request_handlers.pop(method, None)

        return unregister

    def register_notification_handler(
        self, method: str, handler: NotificationHandler
    ) -> Callable[[], None]:
        with self._handler_lock:
            self._raise_if_stopped()
            require_json_rpc_method(method)
            registration = NotificationRegistration(handler=handler)
            current = self._notification_handlers.get(method, [])
            self._notification_handlers[method] = [*current, registration]
        subscribed = True

        def unsubscribe() -> None:
            nonlocal subscribed
            with self._handler_lock:
                if not subscribed:
                    return
                subscribed = False
                registered = self._notification_handlers.get(method, [])
                remaining = [item for item in registered if item is not registration]
                if remaining:
                    self._notification_handlers[method] = remaining
                else:
                    self._notification_handlers.pop(method, None)

        return unsubscribe

    def serve_forever(self) -> None:
        failure: Exception | None = None
        try:
            while not self._stop_event.is_set():
                line = self._read_bounded_line()
                if line is None:
                    break
                if not line:
                    continue
                stripped = line.strip()
                if not stripped:
                    continue
                self._dispatch_line(stripped)
        except Exception as exc:  # noqa: BLE001
            failure = exc
            raise
        finally:
            self.stop(failure)

    def _read_bounded_line(self) -> str | None:
        line = self._infile.readline(JSON_RPC_MAX_LINE_BYTES + 2)
        if not line:
            return None

        has_newline = line.endswith("\n")
        content = line[:-1] if has_newline else line
        if content.endswith("\r"):
            content = content[:-1]
        if len(content.encode("utf-8")) <= JSON_RPC_MAX_LINE_BYTES:
            if has_newline or len(line) < JSON_RPC_MAX_LINE_BYTES + 2:
                return content

        if not has_newline:
            while True:
                remainder = self._infile.readline(JSON_RPC_MAX_LINE_BYTES + 2)
                if not remainder or remainder.endswith("\n"):
                    break
        return ""

    def stop(self, error: Exception | None = None) -> None:
        with self._stop_lock:
            if self._terminal_error is not None:
                return
            self._terminal_error = normalize_json_rpc_terminal_error(error)
            terminal_error_object: JsonObject = {
                "code": self._terminal_error.code,
                "message": str(self._terminal_error),
            }
            if self._terminal_error.data is not None:
                terminal_error_object["data"] = self._terminal_error.data
            self._stop_event.set()
            with self._write_lock:
                pass
            with self._handler_lock:
                self._request_handlers.clear()
                self._notification_handlers.clear()
            stopped_response: JsonObject = {
                "jsonrpc": "2.0",
                "id": 1,
                "error": {
                    **terminal_error_object,
                },
            }
            with self._pending_lock:
                pending_requests = tuple(self._pending.items())
                self._pending.clear()
                self._settled_requests.clear()
                self._next_id = None
                for request_id, pending in pending_requests:
                    response = dict(stopped_response)
                    response["id"] = request_id
                    response["error"] = clone_json_value(terminal_error_object)
                    pending.waiter.put(response)
            self._protocol_diagnostic = None

    def request(self, method: str, params: JsonObject, timeout_s: float) -> JsonObject:
        self._raise_if_stopped()
        require_json_rpc_method(method)
        params = require_json_rpc_params(params)
        timeout_s = require_json_rpc_timeout(timeout_s)
        waiter: queue.Queue[JsonObject] = queue.Queue(maxsize=1)
        with self._pending_lock:
            self._raise_if_stopped()
            if len(self._pending) >= JSON_RPC_MAX_PENDING_REQUESTS:
                raise JsonRpcRequestError(
                    -32000, "JSON-RPC pending request limit exceeded."
                )
            if self._next_id is None:
                raise JsonRpcRequestError(
                    -32600, "JSON-RPC request id space exhausted."
                )
            request_id = self._next_id
            self._next_id = (
                None
                if request_id == JSON_RPC_MAX_REQUEST_ID
                else request_id + 1
            )
            self._pending[request_id] = PendingResponse(waiter=waiter)
        try:
            self._send_message(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "method": method,
                    "params": params,
                },
                require_running=True,
            )
        except Exception:
            with self._pending_lock:
                self._pending.pop(request_id, None)
            raise
        try:
            response = waiter.get(timeout=timeout_s)
        except queue.Empty as exc:
            with self._pending_lock:
                removed = self._pending.pop(request_id, None)
                if removed is not None:
                    self._record_settled_request(request_id, "timed_out")
            if removed is None:
                try:
                    response = waiter.get_nowait()
                except queue.Empty:
                    raise JsonRpcRequestError(
                        -32000, f"Timed out waiting for response: {method}"
                    ) from exc
            else:
                raise JsonRpcRequestError(
                    -32000, f"Timed out waiting for response: {method}"
                ) from exc

        if "error" in response:
            if "result" in response:
                raise JsonRpcRequestError(-32603, "Invalid JSON-RPC error response payload.")
            raise parse_json_rpc_error(response["error"])
        return parse_json_rpc_result(response)

    def notify(self, method: str, params: JsonObject) -> None:
        self._raise_if_stopped()
        require_json_rpc_method(method)
        params = require_json_rpc_params(params)
        self._send_message(
            {"jsonrpc": "2.0", "method": method, "params": params},
            require_running=True,
        )

    def _dispatch_line(self, line: str) -> None:
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            return

        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            return

        if "method" in message:
            if not is_json_rpc_method(message.get("method")):
                return
            if "result" in message or "error" in message:
                request_id = message.get("id")
                if is_json_rpc_id(request_id):
                    self._send_message(
                        {
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "error": {
                                "code": -32600,
                                "message": "Invalid JSON-RPC request message shape.",
                            },
                        }
                    )
                return
            if "id" in message:
                if not is_json_rpc_id(message.get("id")):
                    return
                self._handle_request(message)
                return
            if not is_json_object(message.get("params")):
                return
            self._handle_notification(message)
            return

        if "id" in message:
            if not is_json_rpc_id(message.get("id")):
                return
            if "params" in message:
                return
            self._handle_response(message)

    def _handle_request(self, message: JsonMapping) -> None:
        request_id = message.get("id")
        method = message.get("method")
        params = message.get("params")

        if not is_json_rpc_id(request_id) or not is_json_rpc_method(method):
            return

        if not is_json_object(params):
            self._send_message(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {
                        "code": -32602,
                        "message": "JSON-RPC params must be a JSON-safe object.",
                    },
                }
            )
            return

        with self._handler_lock:
            registration = self._request_handlers.get(method)
        if registration is None:
            self._send_error_response_with_size_fallback(
                request_id,
                {"code": -32601, "message": f"Method not found: {method}"},
            )
            return

        try:
            result = registration.handler(params)
            result_snapshot = snapshot_json_rpc_handler_result(result)
            if result_snapshot is None:
                self._send_handler_contract_error(request_id)
                return
            self._send_message(
                {"jsonrpc": "2.0", "id": request_id, "result": result_snapshot}
            )
        except JsonRpcRequestError as exc:
            error = build_json_rpc_handler_error(exc, default_code=-32000)
            self._send_error_response_with_size_fallback(request_id, error)
        except (ValidationError, SessionError) as exc:
            error = build_json_rpc_handler_error(exc, default_code=-32602)
            self._send_error_response_with_size_fallback(request_id, error)
        except Exception as exc:  # noqa: BLE001
            error = build_json_rpc_handler_error(exc, default_code=-32000)
            self._send_error_response_with_size_fallback(request_id, error)

    def _handle_notification(self, message: JsonMapping) -> None:
        method = message.get("method")
        params = message.get("params")
        if not is_json_rpc_method(method) or not is_json_object(params):
            return
        with self._handler_lock:
            registrations = tuple(self._notification_handlers.get(method, []))
        canonical_params = snapshot_json_rpc_object(params)
        if canonical_params is None:
            self._emit_protocol_diagnostic("Invalid JSON-RPC notification params.")
            return
        consumer_params = tuple(
            snapshot_json_rpc_object(canonical_params) for _ in registrations
        )
        if any(snapshot is None for snapshot in consumer_params):
            self._emit_protocol_diagnostic("Invalid JSON-RPC notification params.")
            return
        for registration, owned_params in zip(registrations, consumer_params):
            try:
                assert owned_params is not None
                registration.handler(owned_params)
            except Exception:  # noqa: BLE001
                self._emit_protocol_diagnostic(
                    f"JSON-RPC notification handler failed: {method}"
                )

    def _handle_response(self, message: JsonMapping) -> None:
        request_id = message.get("id")
        if not is_json_rpc_id(request_id):
            return
        response_snapshot = snapshot_json_rpc_object(message)
        if response_snapshot is None:
            response_snapshot = {"jsonrpc": "2.0", "id": request_id}
        with self._pending_lock:
            pending = self._pending.pop(request_id, None)
            if pending is not None:
                self._record_settled_request(request_id, "completed")
                pending.waiter.put(response_snapshot)
            settled_state = self._settled_requests.get(request_id)
        if pending is None:
            if settled_state == "completed":
                self._emit_protocol_diagnostic(
                    f"Duplicate JSON-RPC response id: {request_id}"
                )
            elif settled_state == "timed_out":
                self._emit_protocol_diagnostic(
                    f"Late JSON-RPC response id: {request_id}"
                )
            else:
                self._emit_protocol_diagnostic(
                    f"Unexpected JSON-RPC response id: {request_id}"
                )
            return

    def _record_settled_request(self, request_id: int, state: str) -> None:
        self._settled_requests.pop(request_id, None)
        self._settled_requests[request_id] = state
        while len(self._settled_requests) > JSON_RPC_SETTLED_HISTORY_LIMIT:
            self._settled_requests.popitem(last=False)

    def _emit_protocol_diagnostic(self, message: str) -> None:
        if self._protocol_diagnostic is not None:
            try:
                self._protocol_diagnostic(message)
            except Exception:  # noqa: BLE001
                pass

    def _send_message(
        self, payload: JsonObject, *, require_running: bool = False
    ) -> None:
        if require_running:
            self._raise_if_stopped()
        if not is_json_rpc_outbound_message(payload):
            if require_running:
                self._raise_if_stopped()
            raise JsonRpcRequestError(-32603, "Invalid outbound JSON-RPC message.")
        try:
            encoded = json.dumps(payload, ensure_ascii=False)
            encoded_size = len(encoded.encode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            if require_running:
                self._raise_if_stopped()
            raise JsonRpcRequestError(
                -32603, "JSON-RPC output encoding failed."
            ) from exc
        if encoded_size > JSON_RPC_MAX_LINE_BYTES:
            if require_running:
                self._raise_if_stopped()
            raise JsonRpcRequestError(
                -32603, "JSON-RPC output line exceeds maximum size."
            )
        stopped = False
        write_error: Exception | None = None
        with self._write_lock:
            if require_running and self._stop_event.is_set():
                stopped = True
            else:
                try:
                    self._outfile.write(encoded + "\n")
                    self._outfile.flush()
                except Exception as exc:  # noqa: BLE001
                    write_error = exc
        if stopped:
            self._raise_if_stopped()
        if write_error is not None:
            self.stop(write_error)
            raise write_error

    def _raise_if_stopped(self) -> None:
        if not self._stop_event.is_set():
            return
        terminal_error = self._terminal_error
        raise JsonRpcRequestError(
            terminal_error.code if terminal_error else -32000,
            str(terminal_error or "JSON-RPC connection stopped."),
            clone_json_value(terminal_error.data) if terminal_error else None,
        )

    def _send_error_response_with_size_fallback(
        self, request_id: int, error: JsonObject
    ) -> None:
        try:
            self._send_message(
                {"jsonrpc": "2.0", "id": request_id, "error": error}
            )
        except JsonRpcRequestError as exc:
            if str(exc) != "JSON-RPC output line exceeds maximum size.":
                raise
            self._send_message(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {
                        "code": -32603,
                        "message": "JSON-RPC output line exceeds maximum size.",
                    },
                }
            )

    def _send_handler_contract_error(self, request_id: int) -> None:
        self._send_message(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": -32603,
                    "message": "Invalid JSON-RPC request handler response.",
                },
            }
        )


def clone_json_value(value: object) -> object:
    if value is None or type(value) in (str, bool, int, float):
        return value
    if isinstance(value, str):
        return str.__str__(value)
    if isinstance(value, bool):
        return bool(value)
    if isinstance(value, int):
        return int.__int__(value)
    if isinstance(value, float):
        return float.__float__(value)
    if isinstance(value, list):
        return [clone_json_value(entry) for entry in list.__iter__(value)]
    if isinstance(value, dict):
        return {
            str.__str__(key): clone_json_value(entry)
            for key, entry in dict.items(value)
        }
    raise TypeError("Value is not JSON-safe.")


def normalize_json_rpc_terminal_error(
    error: Exception | None,
) -> JsonRpcRequestError:
    try:
        message = str(error).strip() if error is not None else ""
    except Exception:  # noqa: BLE001
        message = ""
    message = message or "JSON-RPC connection stopped."
    if not isinstance(error, JsonRpcRequestError):
        return JsonRpcRequestError(-32000, message)

    try:
        candidate_code = error.code
        if isinstance(candidate_code, bool) or not isinstance(candidate_code, int):
            raise TypeError("Terminal error code is not an integer.")
        code = (
            candidate_code
            if type(candidate_code) is int
            else int.__int__(candidate_code)
        )
        if abs(code) > JSON_SAFE_INTEGER_MAX:
            raise ValueError("Terminal error code is outside the safe range.")
    except Exception:  # noqa: BLE001
        code = -32000
    try:
        data = error.data
        if data is not None and not is_json_value(data, set()):
            data = None
        data = clone_json_value(data)
    except Exception:  # noqa: BLE001
        data = None
    return JsonRpcRequestError(code, message, data)


def parse_json_rpc_error(value: object) -> JsonRpcRequestError:
    snapshot = snapshot_json_rpc_object(value)
    if snapshot is None or not is_json_rpc_error_object(snapshot):
        return JsonRpcRequestError(-32603, "Invalid JSON-RPC error response payload.")
    code = snapshot.get("code")
    message = snapshot.get("message")
    data = snapshot.get("data")
    assert isinstance(code, int) and not isinstance(code, bool)
    assert isinstance(message, str)
    return JsonRpcRequestError(code, message, data)


def is_json_rpc_error_object(value: object) -> bool:
    if not is_json_object(value):
        return False
    code = value.get("code")
    message = value.get("message")
    return (
        isinstance(code, int)
        and not isinstance(code, bool)
        and abs(code) <= JSON_SAFE_INTEGER_MAX
        and isinstance(message, str)
        and bool(message.strip())
        and ("data" not in value or is_json_value(value.get("data"), set()))
    )


def build_json_rpc_handler_error(
    error: Exception, *, default_code: object
) -> JsonObject:
    try:
        message = str(error)
    except Exception:  # noqa: BLE001
        message = ""
    code = default_code
    data: object = None
    if isinstance(error, JsonRpcRequestError):
        try:
            code = error.code
        except Exception:  # noqa: BLE001
            pass
        try:
            data = error.data
        except Exception:  # noqa: BLE001
            data = None
    try:
        if isinstance(code, bool) or not isinstance(code, int):
            raise TypeError("Handler error code is not an integer.")
        code = code if type(code) is int else int.__int__(code)
        if abs(code) > JSON_SAFE_INTEGER_MAX or not message.strip():
            raise ValueError("Handler error metadata is invalid.")
        if data is not None:
            if not is_json_value(data, set()):
                raise TypeError("Handler error data is not JSON-safe.")
            data = clone_json_value(data)
    except Exception:  # noqa: BLE001
        return {
            "code": -32603,
            "message": "Invalid JSON-RPC request handler response.",
        }
    result: JsonObject = {"code": code, "message": message}
    if data is not None:
        result["data"] = data
    return result


def snapshot_json_rpc_object(value: object) -> JsonObject | None:
    try:
        if not is_json_object(value):
            return None
        snapshot = clone_json_value(value)
    except Exception:  # noqa: BLE001
        return None
    return snapshot if isinstance(snapshot, dict) else None


def snapshot_json_rpc_handler_result(value: object) -> JsonObject | None:
    return snapshot_json_rpc_object(value)


def is_json_rpc_method(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def require_json_rpc_method(value: object) -> str:
    if not is_json_rpc_method(value):
        raise JsonRpcRequestError(-32600, "JSON-RPC method must be a non-blank string.")
    return value


def require_json_rpc_params(value: object) -> JsonObject:
    try:
        if not is_json_object(value):
            raise TypeError("Params are not a JSON object.")
        snapshot = clone_json_value(value)
    except Exception as exc:  # noqa: BLE001
        raise JsonRpcRequestError(
            -32602, "JSON-RPC params must be a JSON-safe object."
        ) from exc
    if not isinstance(snapshot, dict):
        raise JsonRpcRequestError(
            -32602, "JSON-RPC params must be a JSON-safe object."
        )
    return snapshot


def require_json_rpc_timeout(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise JsonRpcRequestError(
            -32602, "JSON-RPC request timeout is out of range."
        )
    try:
        timeout = float(value)
    except (OverflowError, ValueError):
        timeout = math.inf
    if (
        not math.isfinite(timeout)
        or timeout < JSON_RPC_MIN_TIMEOUT_S
        or timeout > JSON_RPC_MAX_TIMEOUT_S
    ):
        raise JsonRpcRequestError(
            -32602, "JSON-RPC request timeout is out of range."
        )
    return timeout


def is_json_rpc_id(value: object) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and 0 < value <= JSON_SAFE_INTEGER_MAX
    )


def is_json_rpc_outbound_message(value: object) -> bool:
    if not is_json_object(value) or value.get("jsonrpc") != "2.0":
        return False
    if "method" in value:
        return (
            is_json_rpc_method(value.get("method"))
            and "params" in value
            and is_json_object(value.get("params"))
            and "result" not in value
            and "error" not in value
            and ("id" not in value or is_json_rpc_id(value.get("id")))
        )
    if (
        "id" not in value
        or not is_json_rpc_id(value.get("id"))
        or "params" in value
    ):
        return False
    has_result = "result" in value
    has_error = "error" in value
    if has_result == has_error:
        return False
    if has_result:
        return is_json_object(value.get("result"))
    return is_json_rpc_error_object(value.get("error"))


def parse_json_rpc_result(response: JsonMapping) -> JsonObject:
    try:
        if "error" in response or "result" not in response:
            raise TypeError("Response shape is invalid.")
        result = response.get("result")
        snapshot = snapshot_json_rpc_object(result)
    except Exception:  # noqa: BLE001
        snapshot = None
    if snapshot is None:
        raise JsonRpcRequestError(-32603, "Invalid JSON-RPC success response payload.")
    return snapshot


class GodCodeEngineServer:
    def __init__(
        self,
        connection: JsonRpcConnection,
        provider_registry: ProviderRegistry | None = None,
    ) -> None:
        self._connection = connection
        self._session_manager = SessionManager()
        self._provider_registry = provider_registry or create_default_provider_registry()
        self._initialized = False
        self._host_execute_tools_supported = False
        self._host_execute_tools_max_batch_size = 4
        self._connection.register_request_handler("initialize", self.handle_initialize)
        self._connection.register_request_handler("create_session", self.handle_create_session)
        self._connection.register_request_handler("submit_turn", self.handle_submit_turn)
        self._connection.register_request_handler("cancel_turn", self.handle_cancel_turn)
        self._connection.register_request_handler("shutdown", self.handle_shutdown)

    def handle_initialize(self, params: JsonMapping) -> JsonObject:
        if self._initialized:
            raise JsonRpcRequestError(-32002, "GOD-code Engine is already initialized.")
        protocol_version = require_str(params, "protocol_version")
        if protocol_version != GOD_CODE_PROTOCOL_VERSION:
            raise JsonRpcRequestError(
                -32602,
                f"Unsupported GOD-code protocol version: {protocol_version}; "
                f"expected {GOD_CODE_PROTOCOL_VERSION}.",
            )
        if not is_json_object(dict(params)):
            raise ValidationError("Initialize request must contain only JSON values.")
        host_info = require_dict(params.get("host_info"), "host_info")
        host_name = require_str(host_info, "name")
        host_version = require_str(host_info, "version")
        capabilities = require_dict(params.get("capabilities"), "capabilities")
        if not host_name.strip() or not host_version.strip():
            raise ValidationError("Host name and version must be non-empty strings.")
        if not is_json_object(host_info) or not is_json_object(capabilities):
            raise ValidationError("Initialize metadata must contain only JSON values.")
        self._host_execute_tools_supported = (
            capabilities.get("execute_tools") is True
        )
        requested_batch_size = capabilities.get("execute_tools_max_batch_size")
        self._host_execute_tools_max_batch_size = (
            min(64, requested_batch_size)
            if isinstance(requested_batch_size, int) and not isinstance(requested_batch_size, bool) and requested_batch_size > 0
            else 4
        )
        self._initialized = True
        return {
            "engine_info": {
                "name": "god-code-py-engine",
                "version": "0.1.0",
                "protocol_version": GOD_CODE_PROTOCOL_VERSION,
            },
            "supported_tools": [
                {"name": "Read", "description": "Read a UTF-8 text file from the host filesystem."},
                {"name": "Edit", "description": "Apply a literal string replacement to a UTF-8 text file."},
                {"name": "Bash", "description": "Run a shell command on the host via bash -lc."},
                {"name": "ListFiles", "description": "List files and directories from the host filesystem."},
                {"name": "Search", "description": "Search UTF-8 text files with literal string matching."},
                {"name": "Write", "description": "Write a UTF-8 text file on the host filesystem."},
            ],
            "supported_model_adapters": self._provider_registry.names(),
        }

    def handle_create_session(self, params: JsonMapping) -> JsonObject:
        self._require_initialized()
        if not is_json_object(dict(params)):
            raise ValidationError("Create session request must contain only JSON values.")
        session_id = require_str(params, "session_id")
        cwd = require_str(params, "cwd")
        tool_catalog = parse_tool_catalog(params.get("tool_catalog"))
        model_adapter = require_str(params, "model_adapter")
        initial_messages = parse_initial_messages(params.get("initial_messages"))
        if not session_id.strip() or not cwd.strip() or not model_adapter.strip():
            raise ValidationError(
                "Session id, cwd, and model adapter must be non-empty strings."
            )
        try:
            adapter = self._provider_registry.get(model_adapter)
        except ProviderRegistryError as exc:
            raise JsonRpcRequestError(-32602, str(exc)) from exc

        self._session_manager.create_session(
            session_id=session_id,
            cwd=cwd,
            tool_catalog=tool_catalog,
            model_adapter_name=model_adapter,
            model_adapter=adapter,
            transcript_store=self._create_transcript_store(),
            initial_messages=initial_messages,
        )
        self._emit_event(
            GodCodeEventEnvelope(
                event_type="session_started",
                session_id=session_id,
                turn_id=None,
                payload={"cwd": cwd, "model_adapter": model_adapter},
                sequence=0,
            )
        )
        return {"session_id": session_id, "status": "created"}

    def handle_submit_turn(self, params: JsonMapping) -> JsonObject:
        self._require_initialized()
        if not is_json_object(dict(params)):
            raise ValidationError("Submit turn request must contain only JSON values.")
        session_id = require_str(params, "session_id")
        prompt = parse_prompt_message(params.get("prompt"))
        turn_options = parse_turn_options(params.get("turn_options"))
        if not session_id.strip():
            raise ValidationError("Session id must be a non-empty string.")

        session = self._session_manager.get_session(session_id)
        turn_id = uuid4().hex
        active_turn = self._session_manager.begin_turn(session_id, turn_id)

        thread = threading.Thread(
            target=self._run_turn_thread,
            args=(session, turn_id, prompt, active_turn.cancel_event, turn_options),
            daemon=True,
        )
        self._session_manager.attach_turn_thread(session_id, turn_id, thread)
        thread.start()
        return {"session_id": session_id, "turn_id": turn_id, "status": "accepted"}

    def handle_cancel_turn(self, params: JsonMapping) -> JsonObject:
        self._require_initialized()
        if not is_json_object(dict(params)):
            raise ValidationError("Cancel turn request must contain only JSON values.")
        session_id = require_str(params, "session_id")
        turn_id = require_str(params, "turn_id")
        if not session_id.strip() or not turn_id.strip():
            raise ValidationError("Session id and turn id must be non-empty strings.")
        found = self._session_manager.cancel_turn(session_id, turn_id)
        if found:
            self._connection.notify(
                "cancel_tool_execution",
                CancelToolExecutionNotification(session_id, turn_id).to_dict(),
            )
        return {
            "session_id": session_id,
            "turn_id": turn_id,
            "status": "cancel_requested" if found else "not_found",
        }

    def handle_shutdown(self, params: JsonMapping) -> JsonObject:
        if not is_json_object(dict(params)) or params:
            raise ValidationError("Shutdown request must be an empty JSON object.")
        self._connection.stop()
        return {"status": "shutting_down"}

    def _require_initialized(self) -> None:
        if not self._initialized:
            raise JsonRpcRequestError(-32002, "GOD-code Engine is not initialized.")

    def _run_turn_thread(
        self,
        session: SessionState,
        turn_id: str,
        prompt: PromptMessage,
        cancel_event: threading.Event,
        turn_options: JsonMapping,
    ) -> None:
        scheduler = ToolScheduler(
            self._connection.request,
            concurrency_policy=ToolConcurrencyPolicy(
                max_parallel=self._host_execute_tools_max_batch_size,
            ),
            batch_request_supported=self._host_execute_tools_supported,
        )
        turn_engine = TurnEngine(scheduler=scheduler, emit_event=self._emit_event)
        try:
            turn_engine.run_turn(
                session=session,
                turn_id=turn_id,
                prompt=prompt,
                cancel_event=cancel_event,
                turn_options=turn_options,
            )
        finally:
            self._session_manager.finish_turn(session.session_id, turn_id)

    def _emit_event(self, envelope: GodCodeEventEnvelope) -> None:
        self._connection.notify("god_code_event", envelope.to_dict())

    def _create_transcript_store(self) -> TranscriptStore:
        transcript_dir = os.environ.get("GOD_CODE_TRANSCRIPT_DIR")
        if transcript_dir:
            return JsonlTranscriptStore(transcript_dir)
        return InMemoryTranscriptStore()


def main() -> None:
    connection = JsonRpcConnection(sys.stdin, sys.stdout)
    try:
        GodCodeEngineServer(connection)
    except ProviderConfigError as exc:
        print(f"Provider config error: {exc}", file=sys.stderr)
        raise SystemExit(2) from None
    connection.serve_forever()


if __name__ == "__main__":
    main()
