export type SessionId = string;
export type TurnId = string;
export type ToolCallId = string;
export type BuiltInToolName = "Read" | "Edit" | "Bash" | "ListFiles" | "Search" | "Write";
export type ToolName = string;
export const GOD_CODE_PROTOCOL_VERSION = "2.0";

export const BUILT_IN_TOOL_NAMES: readonly BuiltInToolName[] = [
  "Read",
  "Edit",
  "Bash",
  "ListFiles",
  "Search",
  "Write"
];

export interface ToolCatalogEntry {
  name: ToolName;
  description: string;
  input_schema?: Record<string, unknown>;
}

export interface PromptMessage {
  role: "user";
  content: string;
}

export interface AssistantMessage {
  role: "assistant";
  content: string;
}

export interface ToolCall {
  tool_call_id: ToolCallId;
  tool_name: ToolName;
  input: Record<string, unknown>;
}

export interface ToolExecutionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ToolExecutionResult =
  | {
      ok: true;
      output?: Record<string, unknown>;
      error?: never;
    }
  | {
      ok: false;
      output?: Record<string, unknown>;
      error: ToolExecutionError;
    };

export type ModelHistoryMessage =
  | {
      kind: "user";
      role: "user";
      content: string;
    }
  | {
      kind: "assistant";
      role: "assistant";
      content: string;
    }
  | {
      kind: "tool_call";
      tool_call: Record<string, unknown>;
    }
  | {
      kind: "tool_result";
      tool_call_id?: ToolCallId;
      tool_name: ToolName;
      result: Record<string, unknown>;
    };

export interface TurnResult {
  status: "success" | "error" | "cancelled";
  assistant_message?: AssistantMessage;
  error?: ToolExecutionError;
}

export type GodCodeEventType =
  | "session_started"
  | "turn_started"
  | "assistant_delta"
  | "assistant_message"
  | "tool_call_requested"
  | "tool_result_received"
  | "turn_finished"
  | "god_code_error";

interface GodCodeEventBase<TType extends GodCodeEventType, TPayload extends Record<string, unknown>> {
  event_type: TType;
  session_id: SessionId;
  sequence: number;
  payload: TPayload;
}

export type GodCodeEventEnvelope =
  | (GodCodeEventBase<"session_started", {
      cwd: string;
      model_adapter: string;
    }> & { turn_id?: never })
  | (GodCodeEventBase<"turn_started", Record<string, unknown>> & { turn_id: TurnId })
  | (GodCodeEventBase<"assistant_delta", {
      delta: { text: string };
    }> & { turn_id: TurnId })
  | (GodCodeEventBase<"assistant_message", {
      message: AssistantMessage;
    }> & { turn_id: TurnId })
  | (GodCodeEventBase<"tool_call_requested", {
      tool_call: ToolCall;
      execution_mode?: string;
      [key: string]: unknown;
    }> & { turn_id: TurnId })
  | (GodCodeEventBase<"tool_result_received", {
      tool_call_id: ToolCallId;
      tool_name: ToolName;
      result: ToolExecutionResult;
      [key: string]: unknown;
    }> & { turn_id: TurnId })
  | (GodCodeEventBase<"turn_finished", TurnResult & Record<string, unknown>> & { turn_id: TurnId })
  | (GodCodeEventBase<"god_code_error", {
      error: ToolExecutionError;
    }> & { turn_id: TurnId });

const GOD_CODE_EVENT_TYPES = new Set<GodCodeEventType>([
  "session_started",
  "turn_started",
  "assistant_delta",
  "assistant_message",
  "tool_call_requested",
  "tool_result_received",
  "turn_finished",
  "god_code_error"
]);

export interface InitializeRequest {
  protocol_version: string;
  host_info: {
    name: string;
    version: string;
    [key: string]: unknown;
  };
  capabilities: Record<string, unknown>;
}

export interface InitializeResponse {
  engine_info: {
    name: string;
    version: string;
    protocol_version: string;
    [key: string]: unknown;
  };
  supported_tools: ToolCatalogEntry[];
  supported_model_adapters: string[];
}

export interface CreateSessionRequest {
  session_id: SessionId;
  cwd: string;
  tool_catalog: ToolCatalogEntry[];
  model_adapter: string;
  initial_messages?: ModelHistoryMessage[];
}

export interface CreateSessionResponse {
  session_id: SessionId;
  status: "created";
}

export interface SubmitTurnRequest {
  session_id: SessionId;
  prompt: PromptMessage;
  turn_options: Record<string, unknown>;
}

export interface SubmitTurnResponse {
  session_id: SessionId;
  turn_id: TurnId;
  status: "accepted";
}

export interface CancelTurnRequest {
  session_id: SessionId;
  turn_id: TurnId;
}

export interface CancelTurnResponse {
  session_id: SessionId;
  turn_id: TurnId;
  status: "cancel_requested" | "not_found";
}

export interface ShutdownResponse {
  status: "shutting_down";
}

export type ShutdownRequest = Record<string, never>;

export interface CancelToolExecutionNotification {
  session_id: SessionId;
  turn_id: TurnId;
}

export interface ExecuteToolRequest {
  session_id: SessionId;
  turn_id: TurnId;
  tool_call_id: ToolCallId;
  tool_name: ToolName;
  input: Record<string, unknown>;
}

export interface ExecuteToolsRequest {
  session_id: SessionId;
  turn_id: TurnId;
  tool_calls: Array<{
    tool_call_id: ToolCallId;
    tool_name: ToolName;
    input: Record<string, unknown>;
  }>;
}

export interface ExecuteToolsResponse {
  results: ToolExecutionResult[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asToolExecutionResult(value: unknown): ToolExecutionResult {
  if (
    !isRecord(value) ||
    typeof value.ok !== "boolean" ||
    (value.output !== undefined && !isJsonObject(value.output)) ||
    (value.error !== undefined && !isToolExecutionError(value.error)) ||
    (value.ok && value.error !== undefined) ||
    (!value.ok && value.error === undefined)
  ) {
    throw new Error("Invalid tool execution result payload.");
  }
  return value as unknown as ToolExecutionResult;
}

export function asGodCodeEventEnvelope(value: unknown): GodCodeEventEnvelope {
  if (
    !isRecord(value) ||
    !isNonBlankString(value.event_type) ||
    !GOD_CODE_EVENT_TYPES.has(value.event_type as GodCodeEventType) ||
    !isNonBlankString(value.session_id) ||
    !Number.isSafeInteger(value.sequence) ||
    (value.event_type === "session_started" ? value.sequence !== 0 : (value.sequence as number) <= 0) ||
    !isJsonObject(value.payload) ||
    (value.event_type === "session_started"
      ? value.turn_id !== undefined
      : !isNonBlankString(value.turn_id)) ||
    !isGodCodeEventPayload(value.event_type as GodCodeEventType, value.payload)
  ) {
    throw new Error("Invalid god_code_event payload.");
  }
  return value as unknown as GodCodeEventEnvelope;
}

export function asInitializeResponse(value: unknown): InitializeResponse {
  if (
    !isJsonObject(value) ||
    !isRecord(value.engine_info) ||
    !isNonBlankString(value.engine_info.name) ||
    !isNonBlankString(value.engine_info.version) ||
    !isNonBlankString(value.engine_info.protocol_version) ||
    !Array.isArray(value.supported_tools) ||
    !value.supported_tools.every(isToolCatalogEntry) ||
    !hasUniqueStrings(value.supported_tools.map((tool) => tool.name)) ||
    !Array.isArray(value.supported_model_adapters) ||
    !value.supported_model_adapters.every(isNonBlankString) ||
    !hasUniqueStrings(value.supported_model_adapters)
  ) {
    throw new Error("Invalid GOD-code initialize response payload.");
  }
  return value as unknown as InitializeResponse;
}

export function asInitializeRequest(value: unknown): InitializeRequest {
  if (
    !isJsonObject(value) ||
    !isNonBlankString(value.protocol_version) ||
    !isRecord(value.host_info) ||
    !isNonBlankString(value.host_info.name) ||
    !isNonBlankString(value.host_info.version) ||
    !isJsonObject(value.capabilities)
  ) {
    throw new Error("Invalid GOD-code initialize request payload.");
  }
  return value as unknown as InitializeRequest;
}

export function asCreateSessionResponse(value: unknown): CreateSessionResponse {
  if (
    !isJsonObject(value) ||
    !isNonBlankString(value.session_id) ||
    value.status !== "created"
  ) {
    throw new Error("Invalid GOD-code create_session response payload.");
  }
  return value as unknown as CreateSessionResponse;
}

export function asCreateSessionRequest(value: unknown): CreateSessionRequest {
  if (
    !isJsonObject(value) ||
    !isNonBlankString(value.session_id) ||
    !isNonBlankString(value.cwd) ||
    !isNonBlankString(value.model_adapter) ||
    !Array.isArray(value.tool_catalog) ||
    !value.tool_catalog.every(isToolCatalogEntry) ||
    !hasUniqueStrings(value.tool_catalog.map((tool) => tool.name)) ||
    (value.initial_messages !== undefined && (
      !Array.isArray(value.initial_messages) ||
      !value.initial_messages.every(isModelHistoryMessage)
    ))
  ) {
    throw new Error("Invalid GOD-code create_session request payload.");
  }
  return value as unknown as CreateSessionRequest;
}

export function asSubmitTurnResponse(value: unknown): SubmitTurnResponse {
  if (
    !isJsonObject(value) ||
    !isNonBlankString(value.session_id) ||
    !isNonBlankString(value.turn_id) ||
    value.status !== "accepted"
  ) {
    throw new Error("Invalid GOD-code submit_turn response payload.");
  }
  return value as unknown as SubmitTurnResponse;
}

export function asSubmitTurnRequest(value: unknown): SubmitTurnRequest {
  if (
    !isJsonObject(value) ||
    !isNonBlankString(value.session_id) ||
    !isRecord(value.prompt) ||
    value.prompt.role !== "user" ||
    typeof value.prompt.content !== "string" ||
    value.prompt.content.length === 0 ||
    !isJsonObject(value.turn_options) ||
    !hasValidKnownTurnOptions(value.turn_options)
  ) {
    throw new Error("Invalid GOD-code submit_turn request payload.");
  }
  return value as unknown as SubmitTurnRequest;
}

export function asCancelTurnResponse(value: unknown): CancelTurnResponse {
  if (
    !isJsonObject(value) ||
    !isNonBlankString(value.session_id) ||
    !isNonBlankString(value.turn_id) ||
    (value.status !== "cancel_requested" && value.status !== "not_found")
  ) {
    throw new Error("Invalid GOD-code cancel_turn response payload.");
  }
  return value as unknown as CancelTurnResponse;
}

export function asCancelTurnRequest(value: unknown): CancelTurnRequest {
  if (
    !isJsonObject(value) ||
    !isNonBlankString(value.session_id) ||
    !isNonBlankString(value.turn_id)
  ) {
    throw new Error("Invalid GOD-code cancel_turn request payload.");
  }
  return value as unknown as CancelTurnRequest;
}

export function asShutdownResponse(value: unknown): ShutdownResponse {
  if (!isJsonObject(value) || value.status !== "shutting_down") {
    throw new Error("Invalid GOD-code shutdown response payload.");
  }
  return value as unknown as ShutdownResponse;
}

export function asShutdownRequest(value: unknown): ShutdownRequest {
  if (!isJsonObject(value) || Object.keys(value).length !== 0) {
    throw new Error("Invalid GOD-code shutdown request payload.");
  }
  return value as ShutdownRequest;
}

export function asCancelToolExecutionNotification(
  value: unknown
): CancelToolExecutionNotification {
  if (
    !isJsonObject(value) ||
    !isNonBlankString(value.session_id) ||
    !isNonBlankString(value.turn_id)
  ) {
    throw new Error("Invalid cancel_tool_execution payload.");
  }
  return value as unknown as CancelToolExecutionNotification;
}

function isToolCatalogEntry(value: unknown): value is ToolCatalogEntry {
  return isRecord(value) &&
    isNonBlankString(value.name) &&
    isNonBlankString(value.description) &&
    (value.input_schema === undefined || isJsonObject(value.input_schema));
}

function hasUniqueStrings(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function isModelHistoryMessage(value: unknown): value is ModelHistoryMessage {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === "user") {
    return value.role === "user" && typeof value.content === "string" && value.content.length > 0;
  }
  if (value.kind === "assistant") {
    return value.role === "assistant" && typeof value.content === "string" && value.content.length > 0;
  }
  if (value.kind === "tool_call") {
    return isJsonObject(value.tool_call);
  }
  return value.kind === "tool_result" &&
    isNonBlankString(value.tool_name) &&
    (value.tool_call_id === undefined || isNonBlankString(value.tool_call_id)) &&
    isJsonObject(value.result);
}

function hasValidKnownTurnOptions(options: Record<string, unknown>): boolean {
  return (options.stream === undefined || typeof options.stream === "boolean") &&
    (options.max_tokens === undefined || Number.isSafeInteger(options.max_tokens)) &&
    (options.temperature === undefined || (
      typeof options.temperature === "number" && Number.isFinite(options.temperature)
    )) &&
    (options.provider === undefined || typeof options.provider === "string");
}

function isGodCodeEventPayload(eventType: GodCodeEventType, payload: Record<string, unknown>): boolean {
  switch (eventType) {
    case "session_started":
      return isNonBlankString(payload.cwd) && isNonBlankString(payload.model_adapter);
    case "turn_started":
      return true;
    case "assistant_delta":
      return isRecord(payload.delta) && typeof payload.delta.text === "string";
    case "assistant_message":
      return isAssistantMessage(payload.message);
    case "tool_call_requested":
      return isToolCall(payload.tool_call) &&
        (payload.execution_mode === undefined || isNonBlankString(payload.execution_mode));
    case "tool_result_received":
      return isNonBlankString(payload.tool_call_id) &&
        isNonBlankString(payload.tool_name) &&
        isToolExecutionResult(payload.result);
    case "turn_finished":
      return isTurnResult(payload);
    case "god_code_error":
      return isToolExecutionError(payload.error);
  }
}

function isAssistantMessage(value: unknown): value is AssistantMessage {
  return isRecord(value) && value.role === "assistant" && typeof value.content === "string";
}

function isToolCall(value: unknown): value is ToolCall {
  return isRecord(value) &&
    isNonBlankString(value.tool_call_id) &&
    isNonBlankString(value.tool_name) &&
    isJsonObject(value.input);
}

function isToolExecutionResult(value: unknown): value is ToolExecutionResult {
  try {
    asToolExecutionResult(value);
    return true;
  } catch {
    return false;
  }
}

function isTurnResult(value: Record<string, unknown>): value is TurnResult & Record<string, unknown> {
  if (value.status === "success") {
    return isAssistantMessage(value.assistant_message) && value.error === undefined;
  }
  if (value.status === "error") {
    return value.assistant_message === undefined && isToolExecutionError(value.error);
  }
  return value.status === "cancelled" &&
    value.assistant_message === undefined &&
    value.error === undefined;
}

export function asToolExecutionError(value: unknown): ToolExecutionError {
  if (!isToolExecutionError(value)) {
    throw new Error("Invalid tool execution error payload.");
  }
  return value;
}

function isToolExecutionError(value: unknown): value is ToolExecutionError {
  return isRecord(value) &&
    isNonBlankString(value.code) &&
    isNonBlankString(value.message) &&
    (value.details === undefined || isJsonObject(value.details));
}

export function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && isJsonValue(value, new Set<object>());
}

function isJsonValue(value: unknown, ancestors: Set<object>): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return withCycleGuard(value, ancestors, () =>
      value.every((entry) => isJsonValue(entry, ancestors))
    );
  }
  if (isPlainObject(value)) {
    return withCycleGuard(value, ancestors, () =>
      Object.values(value).every((entry) => isJsonValue(entry, ancestors))
    );
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function withCycleGuard(value: object, ancestors: Set<object>, validate: () => boolean): boolean {
  if (ancestors.has(value)) {
    return false;
  }
  ancestors.add(value);
  try {
    return validate();
  } finally {
    ancestors.delete(value);
  }
}
