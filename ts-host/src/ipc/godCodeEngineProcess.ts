import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcError, JsonRpcPeer } from "./jsonRpc.js";
import type {
  CancelTurnRequest,
  CancelTurnResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  GodCodeEventEnvelope,
  ExecuteToolRequest,
  ExecuteToolsRequest,
  ExecuteToolsResponse,
  InitializeRequest,
  InitializeResponse,
  SubmitTurnRequest,
  SubmitTurnResponse,
  ToolExecutionResult
} from "../types/godCodeProtocol.js";
import {
  asCancelToolExecutionNotification,
  asCancelTurnRequest,
  asCancelTurnResponse,
  asCreateSessionRequest,
  asCreateSessionResponse,
  asGodCodeEventEnvelope,
  asInitializeRequest,
  asInitializeResponse,
  asSubmitTurnRequest,
  asSubmitTurnResponse,
  asShutdownRequest,
  asShutdownResponse,
  asToolExecutionResult,
  GOD_CODE_PROTOCOL_VERSION,
  isJsonObject,
  isNonBlankString,
  isRecord
} from "../types/godCodeProtocol.js";

export interface GodCodeEngineExitInfo {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
}

export interface GodCodeEngineProcessOptions {
  env?: Record<string, string | undefined>;
}

type ToolExecutor = (
  request: ExecuteToolRequest,
  abortSignal?: AbortSignal
) => Promise<ToolExecutionResult> | ToolExecutionResult;

export const MAX_EXECUTE_TOOLS_BATCH_SIZE = 4;
export const MAX_FINALIZED_TURN_KEYS = 1024;

const ENGINE_SHUTDOWN_SETTLEMENT_TIMEOUT_MS = 5_000;
const ENGINE_GRACEFUL_EXIT_TIMEOUT_MS = 2_000;
const ENGINE_FORCE_EXIT_TIMEOUT_MS = 2_000;
const ENGINE_FORCE_EXIT_TIMEOUT_REASON =
  "GOD-code engine process did not exit after SIGKILL within 2000 ms.";

type EnginePeerCloser = (error?: Error) => Promise<void>;

export class GodCodeEngineProcess extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private peer?: JsonRpcPeer;
  private peerCloser?: EnginePeerCloser;
  private toolExecutor?: ToolExecutor;
  private exitInfo?: GodCodeEngineExitInfo;
  private initialized = false;
  private initializing = false;
  private startSettlement?: Promise<void>;
  private stopSettlement?: Promise<void>;
  private stopFailure?: { reason: unknown };
  private readonly turnAbortControllers = new Map<string, AbortController>();
  private readonly turnInFlightRequests = new Map<string, number>();
  private readonly finishedTurnKeys = new Set<string>();
  private readonly finalizedTurnKeys = new Map<string, true>();
  private readonly turnEventSequences = new Map<string, number>();

  public constructor(private readonly options: GodCodeEngineProcessOptions = {}) {
    super();
  }

  public start(): Promise<void> {
    if (this.startSettlement) {
      return this.startSettlement;
    }
    if (this.stopFailure) {
      return Promise.reject(this.stopFailure.reason);
    }

    const previousStopSettlement = this.stopSettlement;
    if (!previousStopSettlement && this.child) {
      return Promise.resolve();
    }
    this.stopSettlement = undefined;

    let resolveStart!: () => void;
    let rejectStart!: (reason?: unknown) => void;
    const settlement = new Promise<void>((resolve, reject) => {
      resolveStart = resolve;
      rejectStart = reject;
    });
    this.startSettlement = settlement;
    void this.startEngineProcessLifecycle(previousStopSettlement).then(resolveStart, rejectStart);
    const clearStartSettlement = (): void => {
      if (this.startSettlement === settlement) {
        this.startSettlement = undefined;
      }
    };
    void settlement.then(clearStartSettlement, clearStartSettlement);
    return settlement;
  }

  private async startEngineProcessLifecycle(
    previousStopSettlement: Promise<void> | undefined
  ): Promise<void> {
    if (previousStopSettlement) {
      await previousStopSettlement;
    }
    if (this.child) {
      return;
    }

    this.startEngineProcessGeneration();
  }

  private startEngineProcessGeneration(): void {

    const tsHostRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const godCodeRoot = path.resolve(tsHostRoot, "..");
    const pyEngineRoot = path.resolve(godCodeRoot, "py-engine");
    const pyEngineSrc = path.resolve(pyEngineRoot, "src");
    const pythonExecutable = process.env.GOD_CODE_PYTHON ?? "python3";
    const pythonPath = [pyEngineSrc, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
    const childEnv = buildChildEnv(this.options.env);
    childEnv.PYTHONPATH = pythonPath;

    const child = spawn(pythonExecutable, ["-m", "god_code_engine.api.god_code_engine_server"], {
      cwd: pyEngineRoot,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stderrBuffer = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderrBuffer += chunk;
    });

    const peer = new JsonRpcPeer(child.stdout, child.stdin);
    const closePeer = createEnginePeerCloser(peer);
    peer.setRequestHandler("execute_tool", async (params) => {
      return await this.handleExecuteTool(params);
    });
    peer.setRequestHandler("execute_tools", async (params) => {
      return await this.handleExecuteTools(params);
    });
    peer.onNotification("god_code_event", async (params) => {
      this.handleGodCodeEvent(params);
    });
    peer.onNotification("cancel_tool_execution", async (params) => {
      this.handleCancelToolExecution(params);
    });

    this.child = child;
    this.peer = peer;
    this.peerCloser = closePeer;
    this.exitInfo = undefined;
    this.initialized = false;
    this.initializing = false;
    this.stopFailure = undefined;

    child.on("exit", (code, signal) => {
      const info: GodCodeEngineExitInfo = {
        code,
        signal,
        stderr: stderrBuffer
      };
      this.exitInfo = info;
      this.initialized = false;
      this.initializing = false;
      const peerCloseSettlement = closePeer(new Error(this.describeExit(info)));
      void peerCloseSettlement.catch(() => undefined);
      this.emit("exit", info);
    });
  }

  public setToolExecutor(executor: ToolExecutor): void {
    this.toolExecutor = executor;
  }

  public onGodCodeEvent(listener: (event: GodCodeEventEnvelope) => void): void {
    this.on("god_code_event", listener);
  }

  public async initialize(request: InitializeRequest): Promise<InitializeResponse> {
    if (this.initialized) {
      throw new Error("GOD-code engine process is already initialized.");
    }
    if (this.initializing) {
      throw new Error("GOD-code engine process initialization is already in progress.");
    }
    if (request.protocol_version !== GOD_CODE_PROTOCOL_VERSION) {
      throw new Error(
        `Unsupported GOD-code Host protocol version: ${request.protocol_version}; expected ${GOD_CODE_PROTOCOL_VERSION}.`
      );
    }
    const wireRequest = asInitializeRequest({
      ...request,
      capabilities: {
        ...request.capabilities,
        execute_tools: true,
        execute_tools_max_batch_size: MAX_EXECUTE_TOOLS_BATCH_SIZE
      }
    });
    this.initializing = true;
    try {
      const rawResponse = await this.rpc().request<unknown>("initialize", wireRequest);
      const response = asInitializeResponse(rawResponse);
      if (response.engine_info.protocol_version !== GOD_CODE_PROTOCOL_VERSION) {
        throw new Error(
          `Incompatible GOD-code Engine protocol version: ${response.engine_info.protocol_version}; expected ${GOD_CODE_PROTOCOL_VERSION}.`
        );
      }
      this.initialized = true;
      return response;
    } finally {
      this.initializing = false;
    }
  }

  public async createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
    this.requireInitialized();
    const wireRequest = asCreateSessionRequest(request);
    const rawResponse = await this.rpc().request<unknown>("create_session", wireRequest);
    const response = asCreateSessionResponse(rawResponse);
    if (response.session_id !== request.session_id) {
      throw new Error(
        `Mismatched GOD-code create_session response session_id: ${response.session_id}; expected ${request.session_id}.`
      );
    }
    return response;
  }

  public async submitTurn(request: SubmitTurnRequest): Promise<SubmitTurnResponse> {
    this.requireInitialized();
    const wireRequest = asSubmitTurnRequest(request);
    const rawResponse = await this.rpc().request<unknown>("submit_turn", wireRequest);
    const response = asSubmitTurnResponse(rawResponse);
    if (response.session_id !== request.session_id) {
      throw new Error(
        `Mismatched GOD-code submit_turn response session_id: ${response.session_id}; expected ${request.session_id}.`
      );
    }
    return response;
  }

  public async cancelTurn(request: CancelTurnRequest): Promise<CancelTurnResponse> {
    this.requireInitialized();
    const wireRequest = asCancelTurnRequest(request);
    this.abortTurn(wireRequest.session_id, wireRequest.turn_id);
    const rawResponse = await this.rpc().request<unknown>("cancel_turn", wireRequest);
    const response = asCancelTurnResponse(rawResponse);
    if (response.session_id !== request.session_id || response.turn_id !== request.turn_id) {
      throw new Error(
        `Mismatched GOD-code cancel_turn response identity: ` +
        `${response.session_id}/${response.turn_id}; expected ${request.session_id}/${request.turn_id}.`
      );
    }
    if (response.status === "not_found") {
      this.finishTurn(request.session_id, request.turn_id);
    }
    return response;
  }

  public async shutdown(): Promise<void> {
    const peer = this.peer;
    if (!peer) {
      return;
    }
    await requestEngineShutdown(peer);
  }

  public stop(): Promise<void> {
    if (this.stopSettlement) {
      return this.stopSettlement;
    }

    const activeStartSettlement = this.startSettlement;
    let resolveStop!: () => void;
    let rejectStop!: (reason?: unknown) => void;
    const settlement = new Promise<void>((resolve, reject) => {
      resolveStop = resolve;
      rejectStop = reject;
    });
    this.stopSettlement = settlement;
    void this.stopEngineProcessLifecycle(activeStartSettlement).then(
      resolveStop,
      (reason: unknown) => {
        this.stopFailure = { reason };
        rejectStop(reason);
      }
    );
    return settlement;
  }

  private async stopEngineProcessLifecycle(
    activeStartSettlement: Promise<void> | undefined
  ): Promise<void> {
    if (activeStartSettlement) {
      await activeStartSettlement.catch(() => undefined);
    }
    if (this.stopFailure) {
      throw this.stopFailure.reason;
    }

    const child = this.child;
    const peer = this.peer;
    const closePeer = this.peerCloser ?? (peer ? createEnginePeerCloser(peer) : undefined);
    this.child = undefined;
    this.peer = undefined;
    this.peerCloser = undefined;
    this.transferTurnStateToStopped();

    if (child && peer) {
      await settleEngineShutdownRequest(peer);
    }
    if (child) {
      endEngineChildInput(child);
    }

    let processFailure: unknown;
    if (child) {
      try {
        await settleEngineChildProcess(child);
      } catch (error) {
        processFailure = error;
      }
    }

    let peerFailure: unknown;
    if (closePeer) {
      try {
        await closePeer();
      } catch (error) {
        peerFailure = error;
      }
    }

    if (processFailure !== undefined) {
      throw processFailure;
    }
    if (peerFailure !== undefined) {
      throw peerFailure;
    }
  }

  private transferTurnStateToStopped(): void {
    this.initialized = false;
    this.initializing = false;
    for (const controller of this.turnAbortControllers.values()) {
      controller.abort();
    }
    this.turnAbortControllers.clear();
    this.turnInFlightRequests.clear();
    this.finishedTurnKeys.clear();
    this.finalizedTurnKeys.clear();
    this.turnEventSequences.clear();
  }

  public getLastExitInfo(): GodCodeEngineExitInfo | undefined {
    return this.exitInfo;
  }

  private requireInitialized(): void {
    if (!this.initialized) {
      throw new Error("GOD-code engine process is not initialized.");
    }
  }

  private async handleExecuteTool(params: unknown): Promise<ToolExecutionResult> {
    if (!this.toolExecutor) {
      throw new JsonRpcError(-32000, "No tool executor is registered on the host.");
    }
    const request = asExecuteToolRequest(params);
    const lease = this.acquireTurnLease(request.session_id, request.turn_id);
    try {
      if (lease.controller.signal.aborted) {
        return cancelledBeforeDispatch();
      }
      const result = await this.toolExecutor(request, lease.controller.signal);
      if (lease.controller.signal.aborted) {
        return cancelledDuringExecution();
      }
      return asToolExecutionResult(result);
    } finally {
      this.releaseTurnLease(lease.key);
    }
  }

  private async handleExecuteTools(params: unknown): Promise<ExecuteToolsResponse> {
    if (!this.toolExecutor) {
      throw new JsonRpcError(-32000, "No tool executor is registered on the host.");
    }
    const request = asExecuteToolsRequest(params);
    const lease = this.acquireTurnLease(request.session_id, request.turn_id);
    try {
      if (lease.controller.signal.aborted) {
        return {
          results: request.tool_calls.map(() => cancelledBeforeDispatch())
        };
      }
      const results = await Promise.all(request.tool_calls.map(async (toolCall) => {
        if (lease.controller.signal.aborted) {
          return cancelledBeforeDispatch();
        }
        try {
          const result = await this.toolExecutor!({
            session_id: request.session_id,
            turn_id: request.turn_id,
            ...toolCall
          }, lease.controller.signal);
          if (lease.controller.signal.aborted) {
            return cancelledDuringExecution();
          }
          return asToolExecutionResult(result);
        } catch (error) {
          if (lease.controller.signal.aborted) {
            return cancelledDuringExecution();
          }
          return {
            ok: false,
            error: {
              code: "tool_executor_failed",
              message: error instanceof Error ? error.message : String(error)
            }
          } satisfies ToolExecutionResult;
        }
      }));
      return { results };
    } finally {
      this.releaseTurnLease(lease.key);
    }
  }

  private handleGodCodeEvent(params: unknown): void {
    let event: GodCodeEventEnvelope;
    try {
      event = asGodCodeEventEnvelope(params);
    } catch {
      throw new JsonRpcError(-32602, "Invalid god_code_event payload.");
    }
    if (event.event_type === "session_started") {
      this.emit("god_code_event", event);
      return;
    }
    const key = turnKey(event.session_id, event.turn_id);
    if (this.finalizedTurnKeys.has(key)) {
      return;
    }
    const previousSequence = this.turnEventSequences.get(key) ?? 0;
    if (event.sequence <= previousSequence) {
      return;
    }
    if (event.event_type === "turn_finished") {
      this.finishTurn(event.session_id, event.turn_id);
    } else {
      this.turnEventSequences.set(key, event.sequence);
    }
    this.emit("god_code_event", event);
  }

  private handleCancelToolExecution(params: unknown): void {
    let notification;
    try {
      notification = asCancelToolExecutionNotification(params);
    } catch {
      throw new JsonRpcError(-32602, "Invalid cancel_tool_execution payload.");
    }
    if (this.finalizedTurnKeys.has(turnKey(notification.session_id, notification.turn_id))) {
      return;
    }
    this.abortTurn(notification.session_id, notification.turn_id);
  }

  private rpc(): JsonRpcPeer {
    if (!this.peer) {
      throw new Error("GOD-code engine process is not started.");
    }
    return this.peer;
  }

  private describeExit(info: GodCodeEngineExitInfo): string {
    const base = `GOD-code engine exited (code=${String(info.code)}, signal=${String(info.signal)}).`;
    if (!info.stderr) {
      return base;
    }
    return `${base} stderr: ${info.stderr.trim()}`;
  }

  private getTurnAbortController(sessionId: string, turnId: string): AbortController {
    const key = turnKey(sessionId, turnId);
    let controller = this.turnAbortControllers.get(key);
    if (!controller) {
      controller = new AbortController();
      this.turnAbortControllers.set(key, controller);
    }
    return controller;
  }

  private abortTurn(sessionId: string, turnId: string): void {
    this.getTurnAbortController(sessionId, turnId).abort();
  }

  private acquireTurnLease(sessionId: string, turnId: string): {
    key: string;
    controller: AbortController;
  } {
    const key = turnKey(sessionId, turnId);
    const controller = this.getTurnAbortController(sessionId, turnId);
    if (this.finalizedTurnKeys.has(key)) {
      controller.abort();
      this.finishedTurnKeys.add(key);
    }
    this.turnInFlightRequests.set(key, (this.turnInFlightRequests.get(key) ?? 0) + 1);
    return { key, controller };
  }

  private releaseTurnLease(key: string): void {
    const remaining = (this.turnInFlightRequests.get(key) ?? 1) - 1;
    if (remaining > 0) {
      this.turnInFlightRequests.set(key, remaining);
      return;
    }
    this.turnInFlightRequests.delete(key);
    if (this.finishedTurnKeys.delete(key)) {
      this.turnAbortControllers.delete(key);
    }
  }

  private finishTurn(sessionId: string, turnId: string): void {
    const key = turnKey(sessionId, turnId);
    this.markTurnFinalized(key);
    this.turnEventSequences.delete(key);
    const controller = this.turnAbortControllers.get(key);
    controller?.abort();
    if ((this.turnInFlightRequests.get(key) ?? 0) === 0) {
      this.turnAbortControllers.delete(key);
      this.finishedTurnKeys.delete(key);
      return;
    }
    this.finishedTurnKeys.add(key);
  }

  private markTurnFinalized(key: string): void {
    this.finalizedTurnKeys.delete(key);
    this.finalizedTurnKeys.set(key, true);
    while (this.finalizedTurnKeys.size > MAX_FINALIZED_TURN_KEYS) {
      const oldest = this.finalizedTurnKeys.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      this.finalizedTurnKeys.delete(oldest);
    }
  }
}

function turnKey(sessionId: string, turnId: string): string {
  return JSON.stringify([sessionId, turnId]);
}

function cancelledBeforeDispatch(): ToolExecutionResult {
  return {
    ok: false,
    error: {
      code: "tool_cancelled",
      message: "Turn was cancelled before Host tool dispatch."
    }
  };
}

function cancelledDuringExecution(): ToolExecutionResult {
  return {
    ok: false,
    error: {
      code: "tool_cancelled",
      message: "Turn was cancelled while Host tool execution was in flight."
    }
  };
}

function buildChildEnv(overrides: Record<string, string | undefined> | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env
  };

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === undefined) {
      delete env[key];
      continue;
    }
    env[key] = value;
  }

  return env;
}

function asExecuteToolRequest(value: unknown): ExecuteToolRequest {
  if (
    !isRecord(value) ||
    !isNonBlankString(value.session_id) ||
    !isNonBlankString(value.turn_id) ||
    !isNonBlankString(value.tool_call_id) ||
    !isNonBlankString(value.tool_name) ||
    !isJsonObject(value.input)
  ) {
    throw new JsonRpcError(-32602, "Invalid execute_tool request payload.");
  }
  return value as unknown as ExecuteToolRequest;
}

function asExecuteToolsRequest(value: unknown): ExecuteToolsRequest {
  const toolCalls = isRecord(value) && Array.isArray(value.tool_calls)
    ? value.tool_calls
    : [];
  if (
    !isRecord(value) ||
    !isNonBlankString(value.session_id) ||
    !isNonBlankString(value.turn_id) ||
    !Array.isArray(value.tool_calls) ||
    value.tool_calls.length === 0 ||
    value.tool_calls.length > MAX_EXECUTE_TOOLS_BATCH_SIZE ||
    value.tool_calls.some((toolCall) =>
      !isRecord(toolCall) ||
      !isNonBlankString(toolCall.tool_call_id) ||
      !isNonBlankString(toolCall.tool_name) ||
      !isJsonObject(toolCall.input)
    ) ||
    new Set(toolCalls.map((toolCall) =>
      isRecord(toolCall) ? toolCall.tool_call_id : undefined
    )).size !== toolCalls.length
  ) {
    throw new JsonRpcError(-32602, "Invalid execute_tools request payload.");
  }
  return value as unknown as ExecuteToolsRequest;
}

async function requestEngineShutdown(peer: JsonRpcPeer): Promise<void> {
  if (peer.isClosed()) {
    return;
  }
  const request = asShutdownRequest({});
  const rawResponse = await peer.request<unknown>(
    "shutdown",
    request,
    ENGINE_SHUTDOWN_SETTLEMENT_TIMEOUT_MS
  );
  asShutdownResponse(rawResponse);
}

async function settleEngineShutdownRequest(peer: JsonRpcPeer): Promise<void> {
  const shutdownSettlement = invokeEngineLifecycleAction(async () => {
    await requestEngineShutdown(peer);
  }).then(
    () => ({ status: "fulfilled" as const }),
    () => ({ status: "rejected" as const })
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutSettlement = new Promise<{ status: "timed_out" }>((resolve) => {
    timeout = setTimeout(() => {
      resolve({ status: "timed_out" });
    }, ENGINE_SHUTDOWN_SETTLEMENT_TIMEOUT_MS);
  });
  try {
    await Promise.race([shutdownSettlement, timeoutSettlement]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function createEnginePeerCloser(peer: JsonRpcPeer): EnginePeerCloser {
  let closeSettlement: Promise<void> | undefined;
  return (error?: Error): Promise<void> => {
    if (closeSettlement) {
      return closeSettlement;
    }

    let resolveClose!: () => void;
    let rejectClose!: (reason?: unknown) => void;
    closeSettlement = new Promise<void>((resolve, reject) => {
      resolveClose = resolve;
      rejectClose = reject;
    });
    try {
      Promise.resolve(peer.close(error)).then(resolveClose, rejectClose);
    } catch (closeError) {
      rejectClose(closeError);
    }
    return closeSettlement;
  };
}

function endEngineChildInput(child: ChildProcessWithoutNullStreams): void {
  try {
    if (!child.stdin.destroyed && !child.stdin.writableEnded) {
      child.stdin.end();
    }
  } catch {
    // Stdin closure is best-effort before bounded process exit settlement.
  }
}

async function settleEngineChildProcess(
  child: ChildProcessWithoutNullStreams
): Promise<void> {
  try {
    await waitForProcessExit(child, ENGINE_GRACEFUL_EXIT_TIMEOUT_MS);
    return;
  } catch {
    // Escalate to forced termination below.
  }

  let killFailure: unknown;
  if (!hasEngineChildExited(child) && !child.killed) {
    try {
      child.kill("SIGKILL");
    } catch (error) {
      killFailure = error;
    }
  }

  try {
    await waitForProcessExit(child, ENGINE_FORCE_EXIT_TIMEOUT_MS);
    return;
  } catch {
    if (killFailure !== undefined) {
      throw killFailure;
    }
    throw new Error(ENGINE_FORCE_EXIT_TIMEOUT_REASON);
  }
}

function invokeEngineLifecycleAction(action: () => void | Promise<void>): Promise<void> {
  try {
    return Promise.resolve(action());
  } catch (error) {
    return Promise.reject(error);
  }
}

async function waitForProcessExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<void> {
  if (hasEngineChildExited(child)) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      reject(new Error("Timed out waiting for child process exit."));
    }, timeoutMs);

    const onExit = () => {
      clearTimeout(timer);
      resolve();
    };

    child.once("exit", onExit);
  });
}

function hasEngineChildExited(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null
    || (child.signalCode !== null && child.signalCode !== undefined);
}
