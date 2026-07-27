import { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";

interface JsonRpcBaseMessage {
  jsonrpc: "2.0";
}

interface JsonRpcRequest extends JsonRpcBaseMessage {
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcNotification extends JsonRpcBaseMessage {
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcSuccessResponse extends JsonRpcBaseMessage {
  id: number;
  result: unknown;
}

interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcErrorResponse extends JsonRpcBaseMessage {
  id: number | null;
  error: JsonRpcErrorObject;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

type SettledRequestState = "completed" | "timed_out";

export class JsonRpcError extends Error {
  public readonly code: number;
  public readonly data?: unknown;

  public constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

class JsonRpcSendCanceledError extends Error {
  public constructor() {
    super("JSON-RPC outbound frame canceled before write.");
  }
}

type RequestHandler = (params: unknown) => Promise<unknown> | unknown;
type NotificationHandler = (params: unknown) => Promise<void> | void;

interface RequestRegistration {
  handler: RequestHandler;
}

interface NotificationRegistration {
  handler: NotificationHandler;
}

export const JSON_RPC_MAX_LINE_BYTES = 1024 * 1024;
export const JSON_RPC_MAX_PENDING_REQUESTS = 256;
export const JSON_RPC_MAX_TIMEOUT_MS = 2_147_483_647;
export const JSON_RPC_MAX_REQUEST_ID = Number.MAX_SAFE_INTEGER;
export const JSON_RPC_SETTLED_HISTORY_LIMIT = 512;
export const JSON_RPC_MAX_QUEUED_FRAMES = 256;
export const JSON_RPC_MAX_QUEUED_BYTES = 4 * 1024 * 1024;
export const JSON_RPC_MAX_ACTIVE_INBOUND_REQUESTS = 256;
export const JSON_RPC_MAX_ACTIVE_INBOUND_NOTIFICATIONS = 256;
export const JSON_RPC_MAX_INBOUND_FRAMES_IN_FLIGHT = 512;
export const JSON_RPC_MAX_INBOUND_BYTES_IN_FLIGHT = 4 * 1024 * 1024;

export class JsonRpcPeer extends EventEmitter {
  private readonly requestHandlers = new Map<string, RequestRegistration>();
  private readonly notificationHandlers = new Map<string, NotificationRegistration[]>();
  private readonly pending = new Map<number, PendingRequest>();
  private readonly settledRequests = new Map<number, SettledRequestState>();
  private readonly activeInboundRequestIds = new Set<number>();
  private writeTail: Promise<void> = Promise.resolve();
  private queuedFrames = 0;
  private queuedBytes = 0;
  private activeInboundNotifications = 0;
  private inboundFramesInFlight = 0;
  private inboundBytesInFlight = 0;
  private readonly activeWriteAborters = new Set<(error: Error) => void>();
  private nextId: number | null = 1;
  private buffer = "";
  private discardingOversizedLine = false;
  private closed = false;
  private terminalError: Error | null = null;
  private readonly onReadableData = (chunk: string): void => {
    this.handleChunk(chunk);
  };
  private readonly onReadableEnd = (): void => {
    this.close(new Error("JSON-RPC input stream ended."));
  };
  private readonly onReadableClose = (): void => {
    this.close(new Error("JSON-RPC input stream closed."));
  };
  private readonly onReadableError = (error: unknown): void => {
    this.close(error instanceof Error ? error : new Error(String(error)));
  };
  private readonly onWritableClose = (): void => {
    this.close(new Error("JSON-RPC output stream closed."));
  };
  private readonly onWritableError = (error: unknown): void => {
    this.close(error instanceof Error ? error : new Error(String(error)));
  };

  public constructor(
    private readonly readable: Readable,
    private readonly writable: Writable
  ) {
    super();
    this.readable.setEncoding("utf8");
    this.readable.off("error", ignoreClosedTransportError);
    this.writable.off("error", ignoreClosedTransportError);
    this.readable.on("data", this.onReadableData);
    this.readable.on("end", this.onReadableEnd);
    this.readable.on("close", this.onReadableClose);
    this.readable.on("error", this.onReadableError);
    this.writable.on("close", this.onWritableClose);
    this.writable.on("error", this.onWritableError);
  }

  public override on(
    eventName: string | symbol,
    listener: (...args: any[]) => void
  ): this {
    this.requireObserverRegistrationOpen();
    return super.on(eventName, listener);
  }

  public override addListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void
  ): this {
    this.requireObserverRegistrationOpen();
    return super.addListener(eventName, listener);
  }

  public override once(
    eventName: string | symbol,
    listener: (...args: any[]) => void
  ): this {
    this.requireObserverRegistrationOpen();
    return super.once(eventName, listener);
  }

  public override prependListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void
  ): this {
    this.requireObserverRegistrationOpen();
    return super.prependListener(eventName, listener);
  }

  public override prependOnceListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void
  ): this {
    this.requireObserverRegistrationOpen();
    return super.prependOnceListener(eventName, listener);
  }

  private requireObserverRegistrationOpen(): void {
    if (this.closed) {
      throw this.getTerminalError();
    }
  }

  private getTerminalError(): Error {
    return this.terminalError ?? new Error("JSON-RPC peer is closed.");
  }

  public isClosed(): boolean {
    return this.closed;
  }

  public setRequestHandler(method: string, handler: RequestHandler): () => void {
    if (this.closed) {
      throw this.getTerminalError();
    }
    requireJsonRpcMethod(method);
    const registration: RequestRegistration = { handler };
    this.requestHandlers.set(method, registration);
    let registered = true;
    return () => {
      if (!registered) {
        return;
      }
      registered = false;
      if (this.requestHandlers.get(method) === registration) {
        this.requestHandlers.delete(method);
      }
    };
  }

  public onNotification(method: string, handler: NotificationHandler): () => void {
    if (this.closed) {
      throw this.getTerminalError();
    }
    requireJsonRpcMethod(method);
    const registration: NotificationRegistration = { handler };
    const current = this.notificationHandlers.get(method) ?? [];
    this.notificationHandlers.set(method, [...current, registration]);
    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }
      subscribed = false;
      const registered = this.notificationHandlers.get(method) ?? [];
      const remaining = registered.filter((candidate) => candidate !== registration);
      if (remaining.length === 0) {
        this.notificationHandlers.delete(method);
      } else {
        this.notificationHandlers.set(method, remaining);
      }
    };
  }

  public async request<T>(method: string, params: unknown, timeoutMs = 30_000): Promise<T> {
    if (this.closed) {
      throw this.getTerminalError();
    }

    requireJsonRpcMethod(method);
    let paramsSnapshot: Record<string, unknown>;
    try {
      paramsSnapshot = requireJsonRpcParams(params);
    } catch (error) {
      if (this.closed) {
        throw this.getTerminalError();
      }
      throw error;
    }
    if (this.closed) {
      throw this.getTerminalError();
    }
    requireJsonRpcTimeout(timeoutMs);
    if (this.pending.size >= JSON_RPC_MAX_PENDING_REQUESTS) {
      throw new Error("JSON-RPC pending request limit exceeded.");
    }
    const id = this.allocateRequestId();
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params: paramsSnapshot
    };

    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.recordSettledRequest(id, "timed_out");
        reject(new Error(`JSON-RPC request timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      });

      try {
        void this.send(payload, () => this.pending.has(id)).catch(() => undefined);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public async notify(method: string, params: unknown): Promise<void> {
    if (this.closed) {
      throw this.getTerminalError();
    }
    requireJsonRpcMethod(method);
    let paramsSnapshot: Record<string, unknown>;
    try {
      paramsSnapshot = requireJsonRpcParams(params);
    } catch (error) {
      if (this.closed) {
        throw this.getTerminalError();
      }
      throw error;
    }
    if (this.closed) {
      throw this.getTerminalError();
    }
    const payload: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params: paramsSnapshot
    };
    await this.send(payload);
  }

  private allocateRequestId(): number {
    if (this.nextId === null) {
      throw new Error("JSON-RPC request id space exhausted.");
    }
    const id = this.nextId;
    this.nextId = id === JSON_RPC_MAX_REQUEST_ID ? null : id + 1;
    return id;
  }

  public close(error?: Error): void {
    if (this.closed) {
      return;
    }

    this.terminalError = error ?? new Error("JSON-RPC peer is closed.");
    this.closed = true;
    this.detachTransportListeners();
    const writeError = this.terminalError;
    for (const abort of [...this.activeWriteAborters]) {
      abort(writeError);
    }
    this.activeWriteAborters.clear();
    this.buffer = "";
    this.discardingOversizedLine = false;
    this.requestHandlers.clear();
    this.notificationHandlers.clear();
    this.settledRequests.clear();
    this.nextId = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.terminalError);
    }
    this.pending.clear();
    const closeObserversSettled = this.emitClose(error);
    for (const eventName of this.eventNames()) {
      if (eventName !== "protocol_error") {
        this.removeAllListeners(eventName);
      }
    }
    void closeObserversSettled.then(() => {
      this.removeAllListeners("protocol_error");
    });
  }

  private detachTransportListeners(): void {
    this.readable.off("data", this.onReadableData);
    this.readable.off("end", this.onReadableEnd);
    this.readable.off("close", this.onReadableClose);
    this.readable.off("error", this.onReadableError);
    this.writable.off("close", this.onWritableClose);
    this.writable.off("error", this.onWritableError);

    // Closed transports can still emit a late error; keep it from becoming an
    // uncaught EventEmitter error without retaining this peer through a closure.
    this.readable.on("error", ignoreClosedTransportError);
    this.writable.on("error", ignoreClosedTransportError);
  }

  private async emitClose(error?: Error): Promise<void> {
    const asyncObservers: Promise<void>[] = [];
    const listeners = this.rawListeners("close");
    const observerErrors = error === undefined
      ? Array<undefined>(listeners.length).fill(undefined)
      : snapshotProtocolErrors(error, listeners.length);
    for (let index = 0; index < listeners.length; index += 1) {
      const listener = listeners[index]!;
      try {
        const result = listener.call(this, observerErrors[index]) as unknown;
        if (isPromiseLike(result)) {
          asyncObservers.push(
            Promise.resolve(result).then(
              () => undefined,
              () => {
                this.emitProtocolError(new Error("JSON-RPC close observer failed."));
              }
            )
          );
        }
      } catch {
        this.emitProtocolError(new Error("JSON-RPC close observer failed."));
      }
    }
    await Promise.all(asyncObservers);
  }

  private handleChunk(chunk: string): void {
    if (this.closed) {
      return;
    }
    let remainder = chunk;
    while (remainder.length > 0) {
      if (this.closed) {
        return;
      }
      if (this.discardingOversizedLine) {
        const discardEnd = remainder.indexOf("\n");
        if (discardEnd === -1) {
          return;
        }
        this.discardingOversizedLine = false;
        remainder = remainder.slice(discardEnd + 1);
        continue;
      }

      const newlineIndex = remainder.indexOf("\n");
      if (newlineIndex === -1) {
        this.buffer += remainder;
        if (Buffer.byteLength(this.buffer, "utf8") > JSON_RPC_MAX_LINE_BYTES) {
          this.buffer = "";
          this.discardingOversizedLine = true;
          this.emitProtocolError(new Error("JSON-RPC input line exceeds maximum size."));
        }
        return;
      }

      const rawLine = this.buffer + remainder.slice(0, newlineIndex);
      this.buffer = "";
      remainder = remainder.slice(newlineIndex + 1);
      const content = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (Buffer.byteLength(content, "utf8") > JSON_RPC_MAX_LINE_BYTES) {
        this.emitProtocolError(new Error("JSON-RPC input line exceeds maximum size."));
        continue;
      }
      const line = content.trim();
      if (!line) {
        continue;
      }
      if (!this.dispatchInboundLine(line, Buffer.byteLength(content, "utf8"))) {
        return;
      }
    }
  }

  private dispatchInboundLine(line: string, encodedBytes: number): boolean {
    if (this.inboundFramesInFlight >= JSON_RPC_MAX_INBOUND_FRAMES_IN_FLIGHT ||
        this.inboundBytesInFlight + encodedBytes > JSON_RPC_MAX_INBOUND_BYTES_IN_FLIGHT) {
      const error = new Error("JSON-RPC inbound frame capacity exceeded.");
      this.emitProtocolError(error);
      this.close(error);
      return false;
    }

    this.inboundFramesInFlight += 1;
    this.inboundBytesInFlight += encodedBytes;
    void this.handleLine(line)
      .catch((error) => {
        this.close(error instanceof Error ? error : new Error(String(error)));
      })
      .finally(() => {
        this.inboundFramesInFlight -= 1;
        this.inboundBytesInFlight -= encodedBytes;
      });
    return true;
  }

  private async handleLine(line: string): Promise<void> {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch (error) {
      this.emitProtocolError(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    if (!isObject(message) || message.jsonrpc !== "2.0") {
      this.emitProtocolError(new Error("Invalid JSON-RPC envelope."));
      return;
    }

    if ("method" in message) {
      if (!isJsonRpcMethod(message.method)) {
        this.emitProtocolError(new Error("Invalid JSON-RPC method identity."));
        return;
      }
      if ("result" in message || "error" in message) {
        if ("id" in message && isJsonRpcId(message.id)) {
          await this.sendInvalidRequestResponse(message.id);
        } else {
          this.emitProtocolError(new Error("Invalid JSON-RPC request message shape."));
        }
        return;
      }
      if ("id" in message) {
        if (!isJsonRpcId(message.id)) {
          this.emitProtocolError(new Error("Invalid JSON-RPC request id."));
          return;
        }
        if (!("params" in message) || !isJsonObject(message.params)) {
          await this.sendInvalidParamsResponse(message.id);
          return;
        }
        await this.handleRequest(message as unknown as JsonRpcRequest);
        return;
      }
      if (!("params" in message) || !isJsonObject(message.params)) {
        this.emitProtocolError(new Error("Invalid JSON-RPC notification params."));
        return;
      }
      await this.handleNotification(message as unknown as JsonRpcNotification);
      return;
    }

    if ("id" in message) {
      if (!isJsonRpcId(message.id)) {
        this.emitProtocolError(new Error("Invalid JSON-RPC response id."));
        return;
      }
      if ("params" in message) {
        this.emitProtocolError(new Error("Invalid JSON-RPC response message shape."));
        return;
      }
      this.handleResponse(message as unknown as JsonRpcSuccessResponse | JsonRpcErrorResponse);
      return;
    }

    this.emitProtocolError(new Error("Unknown JSON-RPC message shape."));
  }

  private async handleRequest(message: JsonRpcRequest): Promise<void> {
    if (this.activeInboundRequestIds.has(message.id)) {
      this.emitProtocolError(
        new Error(`Duplicate active JSON-RPC request id: ${String(message.id)}`)
      );
      await this.sendErrorResponseWithSizeFallback(message.id, {
        code: -32600,
        message: "Duplicate active JSON-RPC request id."
      });
      return;
    }
    if (this.activeInboundRequestIds.size >= JSON_RPC_MAX_ACTIVE_INBOUND_REQUESTS) {
      this.emitProtocolError(new Error("JSON-RPC active inbound request limit exceeded."));
      await this.sendErrorResponseWithSizeFallback(message.id, {
        code: -32000,
        message: "JSON-RPC active inbound request limit exceeded."
      });
      return;
    }

    this.activeInboundRequestIds.add(message.id);
    try {
      await this.dispatchRequest(message);
    } finally {
      this.activeInboundRequestIds.delete(message.id);
    }
  }

  private async dispatchRequest(message: JsonRpcRequest): Promise<void> {
    const registration = this.requestHandlers.get(message.method);
    if (!registration) {
      await this.sendErrorResponseWithSizeFallback(message.id, {
        code: -32601,
        message: `Method not found: ${message.method}`
      });
      return;
    }

    try {
      const result = await registration.handler(message.params);
      const resultSnapshot = snapshotJsonObject(result);
      if (!resultSnapshot) {
        const error = new Error("JSON-RPC request handler returned an invalid result.");
        this.emitProtocolError(error);
        await this.sendHandlerContractError(message.id);
        return;
      }
      await this.send({
        jsonrpc: "2.0",
        id: message.id,
        result: resultSnapshot
      } satisfies JsonRpcSuccessResponse);
    } catch (error) {
      if (isJsonRpcOutputSizeError(error)) {
        this.emitProtocolError(error);
        await this.sendOutputSizeError(message.id);
        return;
      }
      const rpcError = normalizeJsonRpcError(error);
      if (!isJsonRpcErrorObject(rpcError)) {
        this.emitProtocolError(new Error("JSON-RPC request handler produced an invalid error."));
        await this.sendHandlerContractError(message.id);
        return;
      }
      await this.sendErrorResponseWithSizeFallback(message.id, rpcError);
    }
  }

  private async handleNotification(message: JsonRpcNotification): Promise<void> {
    if (this.activeInboundNotifications >= JSON_RPC_MAX_ACTIVE_INBOUND_NOTIFICATIONS) {
      this.emitProtocolError(
        new Error("JSON-RPC active inbound notification limit exceeded.")
      );
      return;
    }

    this.activeInboundNotifications += 1;
    try {
      await this.dispatchNotification(message);
    } finally {
      this.activeInboundNotifications -= 1;
    }
  }

  private async dispatchNotification(message: JsonRpcNotification): Promise<void> {
    const listeners = this.rawListeners("notification");
    const registrations = [...(this.notificationHandlers.get(message.method) ?? [])];
    const canonicalParams = snapshotJsonObject(message.params);
    if (!canonicalParams) {
      this.emitProtocolError(new Error("Invalid JSON-RPC notification params."));
      return;
    }
    const consumerParams = Array.from(
      { length: listeners.length + registrations.length },
      () => snapshotJsonObject(canonicalParams)
    );
    if (consumerParams.some((params) => params === null)) {
      this.emitProtocolError(new Error("Invalid JSON-RPC notification params."));
      return;
    }
    let consumerIndex = 0;
    for (const listener of listeners) {
      const params = consumerParams[consumerIndex++]!;
      try {
        await listener.call(this, message.method, params);
      } catch {
        this.emitProtocolError(
          new Error(`JSON-RPC notification observer failed: ${message.method}`)
        );
      }
    }
    for (const { handler } of registrations) {
      const params = consumerParams[consumerIndex++]!;
      try {
        await handler(params);
      } catch {
        this.emitProtocolError(
          new Error(`JSON-RPC notification handler failed: ${message.method}`)
        );
      }
    }
  }

  private emitProtocolError(error: Error): void {
    const listeners = this.rawListeners("protocol_error");
    const diagnostics = snapshotProtocolErrors(error, listeners.length);
    for (let index = 0; index < listeners.length; index += 1) {
      const listener = listeners[index]!;
      try {
        const result = listener.call(this, diagnostics[index]!) as unknown;
        if (isPromiseLike(result)) {
          void Promise.resolve(result).catch(() => undefined);
        }
      } catch {
        // Diagnostics must not change transport control flow.
      }
    }
  }

  private handleResponse(message: JsonRpcSuccessResponse | JsonRpcErrorResponse): void {
    if (message.id === null) {
      this.emitProtocolError(new Error("JSON-RPC response id cannot be null for pending requests."));
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      const settledState = this.settledRequests.get(message.id);
      if (settledState === "completed") {
        this.emitProtocolError(new Error(`Duplicate JSON-RPC response id: ${String(message.id)}`));
      } else if (settledState === "timed_out") {
        this.emitProtocolError(new Error(`Late JSON-RPC response id: ${String(message.id)}`));
      } else {
        this.emitProtocolError(new Error(`Unexpected JSON-RPC response id: ${String(message.id)}`));
      }
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    this.recordSettledRequest(message.id, "completed");

    if ("error" in message) {
      const errorSnapshot = snapshotJsonObject(message.error);
      if ("result" in message ||
          !errorSnapshot ||
          !isJsonRpcErrorObject(errorSnapshot)) {
        const error = new Error("Invalid JSON-RPC error response payload.");
        pending.reject(error);
        this.emitProtocolError(error);
        return;
      }
      pending.reject(new JsonRpcError(
        errorSnapshot.code,
        errorSnapshot.message,
        errorSnapshot.data
      ));
      return;
    }

    const resultSnapshot = "result" in message
      ? snapshotJsonObject(message.result)
      : null;
    if (!resultSnapshot) {
      const error = new Error("Invalid JSON-RPC success response payload.");
      pending.reject(error);
      this.emitProtocolError(error);
      return;
    }

    pending.resolve(resultSnapshot);
  }

  private recordSettledRequest(id: number, state: SettledRequestState): void {
    this.settledRequests.delete(id);
    this.settledRequests.set(id, state);
    while (this.settledRequests.size > JSON_RPC_SETTLED_HISTORY_LIMIT) {
      const oldest = this.settledRequests.keys().next().value as number | undefined;
      if (oldest === undefined) {
        break;
      }
      this.settledRequests.delete(oldest);
    }
  }

  private async sendInvalidParamsResponse(id: number): Promise<void> {
    await this.send({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message: "JSON-RPC params must be a JSON-safe object."
      }
    } satisfies JsonRpcErrorResponse);
  }

  private async sendInvalidRequestResponse(id: number): Promise<void> {
    await this.send({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32600,
        message: "Invalid JSON-RPC request message shape."
      }
    } satisfies JsonRpcErrorResponse);
  }

  private async sendHandlerContractError(id: number): Promise<void> {
    await this.send({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: "Invalid JSON-RPC request handler response."
      }
    } satisfies JsonRpcErrorResponse);
  }

  private async sendOutputSizeError(id: number): Promise<void> {
    await this.send({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: "JSON-RPC output line exceeds maximum size."
      }
    } satisfies JsonRpcErrorResponse);
  }

  private async sendErrorResponseWithSizeFallback(
    id: number,
    error: JsonRpcErrorObject
  ): Promise<void> {
    try {
      await this.send({ jsonrpc: "2.0", id, error } satisfies JsonRpcErrorResponse);
    } catch (sendError) {
      if (!this.closed &&
          (isJsonRpcInvalidOutboundError(sendError) ||
            isJsonRpcOutputEncodingError(sendError))) {
        this.emitProtocolError(sendError);
        await this.sendHandlerContractError(id);
        return;
      }
      if (!isJsonRpcOutputSizeError(sendError)) {
        throw sendError;
      }
      this.emitProtocolError(sendError);
      await this.sendOutputSizeError(id);
    }
  }

  private send(
    payload: JsonRpcRequest | JsonRpcNotification | JsonRpcSuccessResponse | JsonRpcErrorResponse,
    shouldWrite?: () => boolean
  ): Promise<void> {
    if (this.closed) {
      throw this.getTerminalError();
    }
    if (!isJsonRpcOutboundMessage(payload)) {
      throw new Error("Invalid outbound JSON-RPC message.");
    }
    let json: string;
    try {
      json = JSON.stringify(payload);
    } catch (error) {
      if (this.closed) {
        throw this.getTerminalError();
      }
      throw new JsonRpcError(
        -32603,
        "JSON-RPC output encoding failed.",
        error instanceof Error ? { cause: error.message } : undefined
      );
    }
    if (Buffer.byteLength(json, "utf8") > JSON_RPC_MAX_LINE_BYTES) {
      throw new Error("JSON-RPC output line exceeds maximum size.");
    }
    const encoded = `${json}\n`;
    const encodedBytes = Buffer.byteLength(encoded, "utf8");
    if (this.queuedFrames >= JSON_RPC_MAX_QUEUED_FRAMES ||
        this.queuedBytes + encodedBytes > JSON_RPC_MAX_QUEUED_BYTES) {
      throw new Error("JSON-RPC outbound queue capacity exceeded.");
    }
    this.queuedFrames += 1;
    this.queuedBytes += encodedBytes;
    const write = this.writeTail.then(async () => {
      if (this.closed) {
        throw this.getTerminalError();
      }
      if (shouldWrite && !shouldWrite()) {
        throw new JsonRpcSendCanceledError();
      }
      await this.writeFrame(encoded);
    });
    this.writeTail = write.catch(() => undefined);
    const releaseCapacity = (): void => {
      this.queuedFrames -= 1;
      this.queuedBytes -= encodedBytes;
    };
    void write.then(releaseCapacity, releaseCapacity);
    void write.catch((error) => {
      if (!(error instanceof JsonRpcSendCanceledError)) {
        this.close(error instanceof Error ? error : new Error(String(error)));
      }
    });
    return write;
  }

  private async writeFrame(encoded: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let callbackComplete = false;
      let drainComplete = false;
      let settled = false;

      const cleanup = (): void => {
        this.activeWriteAborters.delete(fail);
        this.writable.off("error", onError);
        this.writable.off("close", onClose);
        this.writable.off("drain", onDrain);
      };
      const finish = (): void => {
        if (!settled && callbackComplete && drainComplete) {
          settled = true;
          cleanup();
          resolve();
        }
      };
      const fail = (error: Error): void => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(error);
        }
      };
      const onError = (error: Error): void => fail(error);
      const onClose = (): void => fail(new Error("JSON-RPC output stream closed during write."));
      const onDrain = (): void => {
        drainComplete = true;
        finish();
      };

      this.activeWriteAborters.add(fail);
      this.writable.once("error", onError);
      this.writable.once("close", onClose);
      try {
        const accepted = this.writable.write(encoded, (error?: Error | null) => {
          if (error) {
            fail(error);
            return;
          }
          callbackComplete = true;
          finish();
        });
        if (settled) {
          return;
        }
        if (accepted) {
          drainComplete = true;
          finish();
        } else {
          this.writable.once("drain", onDrain);
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function ignoreClosedTransportError(): void {}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === "object" && value !== null) || typeof value === "function"
    ? typeof (value as { then?: unknown }).then === "function"
    : false;
}

function isJsonRpcMethod(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requireJsonRpcMethod(value: unknown): asserts value is string {
  if (!isJsonRpcMethod(value)) {
    throw new Error("JSON-RPC method must be a non-blank string.");
  }
}

function requireJsonRpcParams(value: unknown): Record<string, unknown> {
  const snapshot = snapshotJsonObject(value);
  if (!snapshot) {
    throw new Error("JSON-RPC params must be a JSON-safe object.");
  }
  return snapshot;
}

function requireJsonRpcTimeout(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 ||
      (value as number) > JSON_RPC_MAX_TIMEOUT_MS) {
    throw new Error("JSON-RPC request timeout is out of range.");
  }
}

function isJsonRpcId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isJsonRpcOutputSizeError(value: unknown): value is Error {
  return value instanceof Error && value.message === "JSON-RPC output line exceeds maximum size.";
}

function isJsonRpcInvalidOutboundError(value: unknown): value is Error {
  return value instanceof Error && value.message === "Invalid outbound JSON-RPC message.";
}

function isJsonRpcOutputEncodingError(value: unknown): value is JsonRpcError {
  return value instanceof JsonRpcError &&
    value.code === -32603 &&
    value.message === "JSON-RPC output encoding failed.";
}

function isJsonRpcOutboundMessage(value: unknown): boolean {
  try {
    if (!isJsonObject(value) || value.jsonrpc !== "2.0") {
      return false;
    }
    if ("method" in value) {
      return isJsonRpcMethod(value.method) &&
        "params" in value &&
        isJsonObject(value.params) &&
        !("result" in value) &&
        !("error" in value) &&
        (!("id" in value) || isJsonRpcId(value.id));
    }
    if (!("id" in value) || !isJsonRpcId(value.id) || "params" in value) {
      return false;
    }
    const hasResult = "result" in value;
    const hasError = "error" in value;
    if (hasResult === hasError) {
      return false;
    }
    return hasResult ? isJsonObject(value.result) : isJsonRpcErrorObject(value.error);
  } catch {
    return false;
  }
}

function isJsonRpcErrorObject(value: unknown): value is JsonRpcErrorObject {
  return isObject(value) &&
    !Array.isArray(value) &&
    isJsonValue(value, new Set<object>()) &&
    Number.isSafeInteger(value.code) &&
    typeof value.message === "string" &&
    value.message.trim().length > 0 &&
    (value.data === undefined || isJsonValue(value.data, new Set<object>()));
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return isPlainJsonObject(value) &&
    isJsonValue(value, new Set<object>());
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value) || Array.isArray(value)) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isJsonValue(value: unknown, ancestors: Set<object>): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value) || isPlainJsonObject(value)) {
    if (ancestors.has(value)) {
      return false;
    }
    ancestors.add(value);
    try {
      const entries = Array.isArray(value) ? value : Object.values(value);
      return entries.every((entry) => isJsonValue(entry, ancestors));
    } catch {
      return false;
    } finally {
      ancestors.delete(value);
    }
  }
  return false;
}

const INVALID_JSON_SNAPSHOT = Symbol("invalid-json-snapshot");

function snapshotJsonObject(value: unknown): Record<string, unknown> | null {
  const snapshot = snapshotJsonValue(value, new Set<object>());
  return snapshot !== INVALID_JSON_SNAPSHOT &&
    typeof snapshot === "object" && snapshot !== null && !Array.isArray(snapshot)
    ? snapshot as Record<string, unknown>
    : null;
}

function snapshotJsonValue(
  value: unknown,
  ancestors: Set<object>
): unknown | typeof INVALID_JSON_SNAPSHOT {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : INVALID_JSON_SNAPSHOT;
  }
  if (!Array.isArray(value) && !isPlainJsonObject(value)) {
    return INVALID_JSON_SNAPSHOT;
  }
  if (ancestors.has(value)) {
    return INVALID_JSON_SNAPSHOT;
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const entry = snapshotJsonValue(value[index], ancestors);
        if (entry === INVALID_JSON_SNAPSHOT) {
          return INVALID_JSON_SNAPSHOT;
        }
        result.push(entry);
      }
      return result;
    }
    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      const entry = snapshotJsonValue(entryValue, ancestors);
      if (entry === INVALID_JSON_SNAPSHOT) {
        return INVALID_JSON_SNAPSHOT;
      }
      Object.defineProperty(result, key, {
        value: entry,
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return result;
  } catch {
    return INVALID_JSON_SNAPSHOT;
  } finally {
    ancestors.delete(value);
  }
}

function snapshotProtocolErrors(error: Error, count: number): Error[] {
  let message = "JSON-RPC protocol error.";
  let name = "Error";
  let stack: string | undefined;
  try {
    message = typeof error.message === "string" ? error.message : message;
    name = typeof error.name === "string" ? error.name : name;
    stack = typeof error.stack === "string" ? error.stack : undefined;
  } catch {
    // Diagnostic extraction must not alter transport control flow.
  }

  let code: number | undefined;
  let canonicalData: unknown | typeof INVALID_JSON_SNAPSHOT = INVALID_JSON_SNAPSHOT;
  try {
    if (error instanceof JsonRpcError) {
      code = error.code;
      canonicalData = snapshotJsonValue(error.data, new Set<object>());
    }
  } catch {
    code = undefined;
    canonicalData = INVALID_JSON_SNAPSHOT;
  }

  return Array.from({ length: count }, () => {
    let diagnostic: Error;
    if (code !== undefined) {
      const data = canonicalData === INVALID_JSON_SNAPSHOT
        ? undefined
        : snapshotJsonValue(canonicalData, new Set<object>());
      diagnostic = new JsonRpcError(
        code,
        message,
        data === INVALID_JSON_SNAPSHOT ? undefined : data
      );
    } else {
      diagnostic = new Error(message);
    }
    diagnostic.name = name;
    if (stack !== undefined) {
      diagnostic.stack = stack;
    }
    return diagnostic;
  });
}

function normalizeJsonRpcError(error: unknown): JsonRpcErrorObject {
  try {
    if (error instanceof JsonRpcError) {
      const result: JsonRpcErrorObject = {
        code: error.code,
        message: error.message
      };
      if (error.data !== undefined) {
        result.data = error.data;
      }
      return result;
    }

    if (error instanceof Error) {
      return {
        code: -32000,
        message: error.message
      };
    }

    return {
      code: -32000,
      message: String(error)
    };
  } catch {
    return {
      code: -32603,
      message: "Invalid JSON-RPC request handler response."
    };
  }
}
