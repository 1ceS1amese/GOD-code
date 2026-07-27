import { once } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  JSON_RPC_MAX_ACTIVE_INBOUND_NOTIFICATIONS,
  JSON_RPC_MAX_ACTIVE_INBOUND_REQUESTS,
  JSON_RPC_MAX_INBOUND_BYTES_IN_FLIGHT,
  JSON_RPC_MAX_INBOUND_FRAMES_IN_FLIGHT,
  JSON_RPC_MAX_LINE_BYTES,
  JSON_RPC_MAX_PENDING_REQUESTS,
  JSON_RPC_MAX_QUEUED_BYTES,
  JSON_RPC_MAX_QUEUED_FRAMES,
  JSON_RPC_MAX_REQUEST_ID,
  JSON_RPC_SETTLED_HISTORY_LIMIT,
  JSON_RPC_MAX_TIMEOUT_MS,
  JsonRpcError,
  JsonRpcPeer
} from "../src/ipc/jsonRpc.js";

function createPeerPair(): { left: JsonRpcPeer; right: JsonRpcPeer } {
  const leftToRight = new PassThrough();
  const rightToLeft = new PassThrough();

  return {
    left: new JsonRpcPeer(rightToLeft, leftToRight),
    right: new JsonRpcPeer(leftToRight, rightToLeft)
  };
}

describe("JsonRpcPeer", () => {
  it("pairs requests with responses", async () => {
    const { left, right } = createPeerPair();
    right.setRequestHandler("echo", async (params) => params);

    const result = await left.request<{ value: number }>("echo", { value: 42 }, 1_000);
    expect(result).toEqual({ value: 42 });

    left.close();
    right.close();
  });

  it("keeps replacement request handlers safe from stale unregister handles", async () => {
    const { left, right } = createPeerPair();
    const unregisterFirst = right.setRequestHandler("owned", () => ({ owner: "first" }));
    const unregisterSecond = right.setRequestHandler("owned", () => ({ owner: "second" }));

    unregisterFirst();
    unregisterFirst();
    await expect(left.request("owned", {}, 1_000)).resolves.toEqual({ owner: "second" });

    unregisterSecond();
    unregisterSecond();
    await expect(left.request("owned", {}, 1_000)).rejects.toMatchObject({
      code: -32601,
      message: "Method not found: owned"
    });
    expect((right as unknown as { requestHandlers: Map<string, unknown> })
      .requestHandlers.has("owned")).toBe(false);
    left.close();
    right.close();
  });

  it("disposes handler registries on close and rejects new registrations", () => {
    const peer = new JsonRpcPeer(new PassThrough(), new PassThrough());
    const unregisterRequest = peer.setRequestHandler("request", () => ({}));
    const unsubscribeNotification = peer.onNotification("notification", () => undefined);
    expect((peer as unknown as { requestHandlers: Map<string, unknown> })
      .requestHandlers.size).toBe(1);
    expect((peer as unknown as { notificationHandlers: Map<string, unknown> })
      .notificationHandlers.size).toBe(1);
    (peer as unknown as { recordSettledRequest(id: number, state: string): void })
      .recordSettledRequest(1, "completed");

    peer.close();

    expect((peer as unknown as { requestHandlers: Map<string, unknown> })
      .requestHandlers.size).toBe(0);
    expect((peer as unknown as { notificationHandlers: Map<string, unknown> })
      .notificationHandlers.size).toBe(0);
    expect((peer as unknown as { settledRequests: Map<number, string> })
      .settledRequests.size).toBe(0);
    expect((peer as unknown as { nextId: number | null }).nextId).toBeNull();
    expect(() => unregisterRequest()).not.toThrow();
    expect(() => unsubscribeNotification()).not.toThrow();
    expect(() => peer.setRequestHandler("late", () => ({})))
      .toThrow("JSON-RPC peer is closed");
    expect(() => peer.onNotification("late", () => undefined))
      .toThrow("JSON-RPC peer is closed");
  });

  it("preserves the first terminal cause across pending and post-close APIs", async () => {
    const peer = new JsonRpcPeer(new PassThrough(), new PassThrough());
    const pending = peer.request("pending", {}, 60_000);
    const firstCause = new Error("first terminal cause");

    peer.close(firstCause);
    peer.close(new Error("later terminal cause"));

    await expect(pending).rejects.toBe(firstCause);
    await expect(peer.request("after_close", {}, 1_000)).rejects.toBe(firstCause);
    await expect(peer.notify("after_close", {})).rejects.toBe(firstCause);
    expect(() => peer.setRequestHandler("after_close", () => ({}))).toThrow(firstCause);
    expect(() => peer.onNotification("after_close", () => undefined)).toThrow(firstCause);
    expect(() => peer.on("after_close", () => undefined)).toThrow(firstCause);
    expect((peer as unknown as { terminalError: Error }).terminalError).toBe(firstCause);
  });

  it("disposes arbitrary observers and rejects every post-close registration surface", () => {
    const peer = new JsonRpcPeer(new PassThrough(), new PassThrough());
    const observer = (): void => undefined;
    peer.on("custom", observer);
    peer.addListener("custom", observer);
    peer.once("custom", observer);
    peer.prependListener("custom", observer);
    peer.prependOnceListener("custom", observer);
    expect(peer.listenerCount("custom")).toBe(5);

    peer.close();

    expect(peer.listenerCount("custom")).toBe(0);
    for (const register of [
      () => peer.on("custom", observer),
      () => peer.addListener("custom", observer),
      () => peer.once("custom", observer),
      () => peer.prependListener("custom", observer),
      () => peer.prependOnceListener("custom", observer)
    ]) {
      expect(register).toThrow("JSON-RPC peer is closed");
    }
    expect(peer.eventNames()).toEqual([]);
  });

  it("does not create pending entries for notifications", async () => {
    const { left, right } = createPeerPair();
    const received = once(right, "notification");

    await left.notify("ping", { value: "ok" });
    const [method, params] = await received;

    expect(method).toBe("ping");
    expect(params).toEqual({ value: "ok" });
    expect((left as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);

    left.close();
    right.close();
  });

  it("emits protocol_error for malformed json", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const protocolError = once(peer, "protocol_error");

    readable.write("{not-json}\n");
    const [error] = await protocolError;

    expect(error).toBeInstanceOf(Error);
    peer.close();
  });

  it("validates error responses before rejecting pending requests", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);

    const validRequest = peer.request("valid", {}, 1_000);
    readable.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32001, message: "remote failed", data: { retryable: false } }
    })}\n`);
    await expect(validRequest).rejects.toMatchObject({
      name: "Error",
      code: -32001,
      message: "remote failed",
      data: { retryable: false }
    } satisfies Partial<JsonRpcError>);

    const protocolError = once(peer, "protocol_error");
    const invalidRequest = peer.request("invalid", {}, 1_000);
    readable.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      error: { code: "bad", message: "remote failed" }
    })}\n`);
    await expect(invalidRequest).rejects.toThrow("Invalid JSON-RPC error response payload");
    await expect(protocolError).resolves.toEqual([
      expect.objectContaining({ message: "Invalid JSON-RPC error response payload." })
    ]);
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
    peer.close();
  });

  it("requires JSON-safe object success results", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);

    const validRequest = peer.request("valid", {}, 1_000);
    readable.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: 1 } })}\n`);
    await expect(validRequest).resolves.toEqual({ value: 1 });

    const protocolError = once(peer, "protocol_error");
    const invalidRequest = peer.request("invalid", {}, 1_000);
    readable.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, result: [] })}\n`);
    await expect(invalidRequest).rejects.toThrow("Invalid JSON-RPC success response payload");
    await expect(protocolError).resolves.toEqual([
      expect.objectContaining({ message: "Invalid JSON-RPC success response payload." })
    ]);
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
    peer.close();
  });

  it("returns owned snapshots for inbound success results and error data", async () => {
    const peer = new JsonRpcPeer(new PassThrough(), new PassThrough());

    const success = peer.request("success", {}, 1_000);
    const resultSource = { nested: { count: 1 } };
    (peer as unknown as {
      handleResponse(message: {
        jsonrpc: "2.0";
        id: number;
        result: unknown;
      }): void;
    }).handleResponse({ jsonrpc: "2.0", id: 1, result: resultSource });
    resultSource.nested.count = 2;

    const errorRequest = peer.request("error", {}, 1_000);
    const errorOutcome = errorRequest.then(
      () => null,
      (error: JsonRpcError) => error
    );
    const errorDataSource = { nested: { count: 1 } };
    (peer as unknown as {
      handleResponse(message: {
        jsonrpc: "2.0";
        id: number;
        error: { code: number; message: string; data: unknown };
      }): void;
    }).handleResponse({
      jsonrpc: "2.0",
      id: 2,
      error: { code: -32042, message: "remote failed", data: errorDataSource }
    });
    errorDataSource.nested.count = 2;

    const result = await success as { nested: { count: number } };
    expect(result).toEqual({ nested: { count: 1 } });
    expect(result).not.toBe(resultSource);
    expect(result.nested).not.toBe(resultSource.nested);
    const remoteError = await errorOutcome;
    expect(remoteError).toMatchObject({
      code: -32042,
      message: "remote failed",
      data: { nested: { count: 1 } }
    });
    expect(remoteError?.data).not.toBe(errorDataSource);
    peer.close();
  });

  it("contains dynamic inbound response snapshots at one inspection boundary", async () => {
    const peer = new JsonRpcPeer(new PassThrough(), new PassThrough());
    let resultReads = 0;
    const dynamicResult: Record<string, unknown> = {};
    Object.defineProperty(dynamicResult, "nested", {
      enumerable: true,
      get: () => {
        resultReads += 1;
        if (resultReads > 1) {
          throw new Error("dynamic result changed");
        }
        return { count: 1 };
      }
    });
    const success = peer.request("dynamic_success", {}, 1_000);
    (peer as unknown as {
      handleResponse(message: {
        jsonrpc: "2.0";
        id: number;
        result: unknown;
      }): void;
    }).handleResponse({ jsonrpc: "2.0", id: 1, result: dynamicResult });

    let dataReads = 0;
    const dynamicError: Record<string, unknown> = {
      code: -32042,
      message: "dynamic remote error"
    };
    Object.defineProperty(dynamicError, "data", {
      enumerable: true,
      get: () => {
        dataReads += 1;
        if (dataReads > 1) {
          throw new Error("dynamic error changed");
        }
        return { nested: { count: 1 } };
      }
    });
    const errorRequest = peer.request("dynamic_error", {}, 1_000);
    const errorOutcome = errorRequest.then(
      () => null,
      (error: JsonRpcError) => error
    );
    (peer as unknown as {
      handleResponse(message: {
        jsonrpc: "2.0";
        id: number;
        error: unknown;
      }): void;
    }).handleResponse({ jsonrpc: "2.0", id: 2, error: dynamicError });

    const invalid = peer.request("invalid_dynamic", {}, 1_000);
    const invalidExpectation = expect(invalid).rejects.toThrow(
      "Invalid JSON-RPC success response payload"
    );
    const invalidResult = new Proxy({}, {
      ownKeys: () => {
        throw new Error("result inspection failed");
      }
    });
    expect(() => (peer as unknown as {
      handleResponse(message: {
        jsonrpc: "2.0";
        id: number;
        result: unknown;
      }): void;
    }).handleResponse({ jsonrpc: "2.0", id: 3, result: invalidResult })).not.toThrow();

    await expect(success).resolves.toEqual({ nested: { count: 1 } });
    expect(resultReads).toBe(1);
    await expect(errorOutcome).resolves.toMatchObject({
      code: -32042,
      message: "dynamic remote error",
      data: { nested: { count: 1 } }
    });
    expect(dataReads).toBe(1);
    await invalidExpectation;
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
    peer.close();
  });

  it("enforces non-blank methods and positive safe integer ids", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);

    await expect(peer.request(" ", {}, 1_000))
      .rejects.toThrow("JSON-RPC method must be a non-blank string");
    await expect(peer.notify("\t", {}))
      .rejects.toThrow("JSON-RPC method must be a non-blank string");
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);

    const protocolError = once(peer, "protocol_error");
    readable.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1.5, method: "echo", params: {} })}\n`);
    await expect(protocolError).resolves.toEqual([
      expect.objectContaining({ message: "Invalid JSON-RPC request id." })
    ]);

    const responseProtocolError = once(peer, "protocol_error");
    const pending = peer.request("echo", {}, 1_000);
    readable.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2.5, result: {} })}\n`);
    await expect(responseProtocolError).resolves.toEqual([
      expect.objectContaining({ message: "Invalid JSON-RPC response id." })
    ]);
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(1);
    peer.close(new Error("test cleanup"));
    await expect(pending).rejects.toThrow("test cleanup");
  });

  it("requires explicit JSON-safe object params before dispatch", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    let calls = 0;
    peer.setRequestHandler("echo", () => {
      calls += 1;
      return {};
    });

    await expect(peer.request("echo", [], 1_000))
      .rejects.toThrow("JSON-RPC params must be a JSON-safe object");
    await expect(peer.notify("echo", { value: undefined }))
      .rejects.toThrow("JSON-RPC params must be a JSON-safe object");
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);

    const response = once(writable, "data");
    readable.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "echo" })}\n`);
    const [chunk] = await response;
    expect(JSON.parse(String(chunk))).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32602,
        message: "JSON-RPC params must be a JSON-safe object."
      }
    });
    expect(calls).toBe(0);

    const protocolError = once(peer, "protocol_error");
    readable.write(`${JSON.stringify({ jsonrpc: "2.0", method: "echo", params: [] })}\n`);
    await expect(protocolError).resolves.toEqual([
      expect.objectContaining({ message: "Invalid JSON-RPC notification params." })
    ]);
    expect(calls).toBe(0);
    peer.close();
  });

  it("snapshots outbound request and notification params once", async () => {
    const { left, right } = createPeerPair();
    right.setRequestHandler("echo", (params) => params);

    const requestParams: Record<string, unknown> = {};
    let requestReads = 0;
    Object.defineProperty(requestParams, "value", {
      enumerable: true,
      get() {
        requestReads += 1;
        if (requestReads > 1) {
          throw new Error("dynamic request params changed");
        }
        return "request";
      }
    });
    await expect(left.request("echo", requestParams, 1_000))
      .resolves.toEqual({ value: "request" });
    expect(requestReads).toBe(1);

    const notificationParams: Record<string, unknown> = {};
    let notificationReads = 0;
    Object.defineProperty(notificationParams, "value", {
      enumerable: true,
      get() {
        notificationReads += 1;
        if (notificationReads > 1) {
          throw new Error("dynamic notification params changed");
        }
        return "notification";
      }
    });
    const notification = once(right, "notification");
    await left.notify("notice", notificationParams);
    await expect(notification).resolves.toEqual([
      "notice",
      { value: "notification" }
    ]);
    expect(notificationReads).toBe(1);

    const invalidParams: Record<string, unknown> = {};
    Object.defineProperty(invalidParams, "value", {
      enumerable: true,
      get() {
        throw new Error("params inspection failed");
      }
    });
    const nextId = (left as unknown as { nextId: number }).nextId;
    await expect(left.request("echo", invalidParams, 1_000))
      .rejects.toThrow("JSON-RPC params must be a JSON-safe object");
    expect((left as unknown as { nextId: number }).nextId).toBe(nextId);
    expect((left as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
    expect(left.isClosed()).toBe(false);

    left.close();
    right.close();
  });

  it("preserves terminal cause when params snapshot closes the peer", async () => {
    for (const throwsAfterClose of [true, false]) {
      const peer = new JsonRpcPeer(new PassThrough(), new PassThrough());
      const terminalCause = new Error("closed during params snapshot");
      const params: Record<string, unknown> = {};
      Object.defineProperty(params, "value", {
        enumerable: true,
        get() {
          peer.close(terminalCause);
          if (throwsAfterClose) {
            throw new Error("params getter failed");
          }
          return "ok";
        }
      });

      await expect(peer.request("probe", params, 0)).rejects.toBe(terminalCause);
      expect(peer.isClosed()).toBe(true);
      expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
    }
  });

  it("preserves prototype-like JSON keys without changing object prototypes", async () => {
    const { left, right } = createPeerPair();
    const createPayload = (): Record<string, unknown> => JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"safe":true},' +
      '"nested":{"__proto__":{"nested":true}}}'
    ) as Record<string, unknown>;
    right.setRequestHandler("special_keys", () => createPayload());

    const result = await left.request<Record<string, unknown>>(
      "special_keys",
      createPayload(),
      1_000
    );
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(result["__proto__"]).toEqual({ polluted: true });
    expect(result.constructor).toEqual({ safe: true });
    const nested = result.nested as Record<string, unknown>;
    expect(Object.getPrototypeOf(nested)).toBe(Object.prototype);
    expect(Object.hasOwn(nested, "__proto__")).toBe(true);
    expect(nested["__proto__"]).toEqual({ nested: true });

    const notification = once(right, "notification");
    await left.notify("special_keys", createPayload());
    const [, notificationParams] = await notification;
    expect(Object.getPrototypeOf(notificationParams)).toBe(Object.prototype);
    expect(Object.hasOwn(notificationParams, "__proto__")).toBe(true);
    expect(notificationParams["__proto__"]).toEqual({ polluted: true });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    left.close();
    right.close();
  });

  it("rejects mixed request and response role fields before state mutation", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    let calls = 0;
    peer.setRequestHandler("echo", () => {
      calls += 1;
      return {};
    });

    const invalidRequestResponse = once(writable, "data");
    readable.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 10,
      method: "echo",
      params: {},
      result: {}
    })}\n`);
    const [chunk] = await invalidRequestResponse;
    expect(JSON.parse(String(chunk))).toEqual({
      jsonrpc: "2.0",
      id: 10,
      error: {
        code: -32600,
        message: "Invalid JSON-RPC request message shape."
      }
    });
    expect(calls).toBe(0);

    const notificationProtocolError = once(peer, "protocol_error");
    readable.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "echo",
      params: {},
      error: { code: -32000, message: "mixed" }
    })}\n`);
    await expect(notificationProtocolError).resolves.toEqual([
      expect.objectContaining({ message: "Invalid JSON-RPC request message shape." })
    ]);
    expect(calls).toBe(0);

    const responseProtocolError = once(peer, "protocol_error");
    const pending = peer.request("echo", {}, 1_000);
    readable.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, params: {}, result: {} })}\n`);
    await expect(responseProtocolError).resolves.toEqual([
      expect.objectContaining({ message: "Invalid JSON-RPC response message shape." })
    ]);
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(1);
    peer.close(new Error("test cleanup"));
    await expect(pending).rejects.toThrow("test cleanup");
  });

  it("converts invalid handler results and errors into valid internal errors", async () => {
    const { left, right } = createPeerPair();
    const resultProtocolError = once(right, "protocol_error");
    right.setRequestHandler("invalid_result", () => []);

    await expect(left.request("invalid_result", {}, 1_000)).rejects.toMatchObject({
      code: -32603,
      message: "Invalid JSON-RPC request handler response."
    });
    await expect(resultProtocolError).resolves.toEqual([
      expect.objectContaining({ message: "JSON-RPC request handler returned an invalid result." })
    ]);

    const errorProtocolError = once(right, "protocol_error");
    right.setRequestHandler("invalid_error", () => {
      throw new JsonRpcError(
        Number.NaN,
        " ",
        { value: undefined }
      );
    });
    await expect(left.request("invalid_error", {}, 1_000)).rejects.toMatchObject({
      code: -32603,
      message: "Invalid JSON-RPC request handler response."
    });
    await expect(errorProtocolError).resolves.toEqual([
      expect.objectContaining({ message: "JSON-RPC request handler produced an invalid error." })
    ]);

    left.close();
    right.close();
  });

  it("falls back safely when handler error data fails during encoding", async () => {
    for (const [failureRead, diagnostic] of [
      [3, "Invalid outbound JSON-RPC message."],
      [6, "JSON-RPC output encoding failed."]
    ] as const) {
      const { left, right } = createPeerPair();
      const data: Record<string, unknown> = {};
      let reads = 0;
      Object.defineProperty(data, "value", {
        enumerable: true,
        get() {
          reads += 1;
          if (reads === failureRead) {
            throw new Error("error data preparation failed");
          }
          return "ok";
        }
      });
      const protocolError = once(right, "protocol_error");
      right.setRequestHandler("dynamic_error", () => {
        throw new JsonRpcError(-32042, "dynamic error", data);
      });
      right.setRequestHandler("recovered", () => ({ ok: true }));

      await expect(left.request("dynamic_error", {}, 1_000)).rejects.toMatchObject({
        code: -32603,
        message: "Invalid JSON-RPC request handler response."
      });
      await expect(protocolError).resolves.toEqual([
        expect.objectContaining({ message: diagnostic })
      ]);
      expect(right.isClosed()).toBe(false);
      await expect(left.request("recovered", {}, 1_000)).resolves.toEqual({ ok: true });

      left.close();
      right.close();
    }
  });

  it("snapshots handler results before outbound validation and encoding", async () => {
    const { left, right } = createPeerPair();
    const snapshotResult: Record<string, unknown> = {};
    let snapshotReads = 0;
    Object.defineProperty(snapshotResult, "value", {
      enumerable: true,
      get() {
        snapshotReads += 1;
        if (snapshotReads > 1) {
          throw new Error("dynamic result changed");
        }
        return "ok";
      }
    });
    const invalidResult: Record<string, unknown> = {};
    Object.defineProperty(invalidResult, "value", {
      enumerable: true,
      get() {
        throw new Error("result inspection failed");
      }
    });
    right.setRequestHandler("snapshot", () => snapshotResult);
    right.setRequestHandler("invalid", () => invalidResult);
    right.setRequestHandler("recovered", () => ({ ok: true }));

    await expect(left.request("snapshot", {}, 1_000)).resolves.toEqual({ value: "ok" });
    await expect(left.request("invalid", {}, 1_000)).rejects.toMatchObject({
      code: -32603,
      message: "Invalid JSON-RPC request handler response."
    });
    expect(snapshotReads).toBe(1);
    expect(right.isClosed()).toBe(false);
    await expect(left.request("recovered", {}, 1_000)).resolves.toEqual({ ok: true });

    left.close();
    right.close();
  });

  it("validates complete outbound envelopes at the writer boundary", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const writer = peer as unknown as { send(payload: unknown): Promise<void> };
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    for (const payload of [
      { jsonrpc: "1.0", id: 1, method: "echo", params: {} },
      { jsonrpc: "2.0", id: 0, method: "echo", params: {} },
      { jsonrpc: "2.0", method: "echo", params: new Date() },
      { jsonrpc: "2.0", id: 1, result: cyclic },
      { jsonrpc: "2.0", id: 1, result: {}, error: { code: -32000, message: "mixed" } }
    ]) {
      expect(() => writer.send(payload)).toThrow("Invalid outbound JSON-RPC message");
    }
    expect(writable.readableLength).toBe(0);

    await writer.send({
      jsonrpc: "2.0",
      method: "echo",
      params: {},
      trace: { sampled: true }
    });
    expect(JSON.parse(String(writable.read()))).toEqual({
      jsonrpc: "2.0",
      method: "echo",
      params: {},
      trace: { sampled: true }
    });
    peer.close();
  });

  it("contains outbound JSON encoding failures without closing the peer", async () => {
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(new PassThrough(), writable);
    const writer = peer as unknown as { send(payload: unknown): Promise<void> };
    const params: Record<string, unknown> = {};
    let reads = 0;
    Object.defineProperty(params, "value", {
      enumerable: true,
      get() {
        reads += 1;
        if (reads === 3) {
          throw new Error("encoding getter failed");
        }
        return "ok";
      }
    });

    await expect(Promise.resolve().then(() => writer.send({
      jsonrpc: "2.0",
      method: "dynamic",
      params
    }))).rejects.toMatchObject({
      code: -32603,
      message: "JSON-RPC output encoding failed.",
      data: { cause: "encoding getter failed" }
    });
    expect(peer.isClosed()).toBe(false);
    expect(writable.readableLength).toBe(0);
    expect((peer as unknown as { queuedFrames: number }).queuedFrames).toBe(0);
    expect((peer as unknown as { queuedBytes: number }).queuedBytes).toBe(0);

    const written = once(writable, "data");
    await writer.send({ jsonrpc: "2.0", method: "recovered", params });
    const [chunk] = await written;
    expect(JSON.parse(String(chunk))).toMatchObject({ method: "recovered" });
    peer.close();
  });

  it("preserves a concurrent close cause over outbound encoding failure", async () => {
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(new PassThrough(), writable);
    const writer = peer as unknown as { send(payload: unknown): Promise<void> };
    const terminalCause = new Error("closed during encoding");
    const params: Record<string, unknown> = {};
    let reads = 0;
    Object.defineProperty(params, "value", {
      enumerable: true,
      get() {
        reads += 1;
        if (reads === 3) {
          peer.close(terminalCause);
          throw new Error("encoding getter failed");
        }
        return "ok";
      }
    });

    await expect(Promise.resolve().then(() => writer.send({
      jsonrpc: "2.0",
      method: "dynamic",
      params
    }))).rejects.toBe(terminalCause);
    expect(peer.isClosed()).toBe(true);
    expect(writable.readableLength).toBe(0);
    expect((peer as unknown as { queuedFrames: number }).queuedFrames).toBe(0);
    expect((peer as unknown as { queuedBytes: number }).queuedBytes).toBe(0);
  });

  it("discards oversized input lines and resumes at the next frame", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const protocolError = once(peer, "protocol_error");
    const notification = once(peer, "notification");

    readable.write("x".repeat(JSON_RPC_MAX_LINE_BYTES + 1));
    await expect(protocolError).resolves.toEqual([
      expect.objectContaining({ message: "JSON-RPC input line exceeds maximum size." })
    ]);
    readable.write(`\n${JSON.stringify({
      jsonrpc: "2.0",
      method: "recovered",
      params: { ok: true }
    })}\n`);
    await expect(notification).resolves.toEqual(["recovered", { ok: true }]);
    expect((peer as unknown as { buffer: string }).buffer).toBe("");
    peer.close();
  });

  it("enforces the reader line limit on outbound frames", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const oversized = { value: "x".repeat(JSON_RPC_MAX_LINE_BYTES) };

    await expect(peer.notify("oversized", oversized))
      .rejects.toThrow("JSON-RPC output line exceeds maximum size");
    await expect(peer.request("oversized", oversized, 1_000))
      .rejects.toThrow("JSON-RPC output line exceeds maximum size");
    expect(writable.readableLength).toBe(0);
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
    peer.close();

    const { left, right } = createPeerPair();
    const resultProtocolError = once(right, "protocol_error");
    right.setRequestHandler("large_result", () => oversized);
    await expect(left.request("large_result", {}, 1_000)).rejects.toMatchObject({
      code: -32603,
      message: "JSON-RPC output line exceeds maximum size."
    });
    await expect(resultProtocolError).resolves.toEqual([
      expect.objectContaining({ message: "JSON-RPC output line exceeds maximum size." })
    ]);

    const errorProtocolError = once(right, "protocol_error");
    right.setRequestHandler("large_error", () => {
      throw new JsonRpcError(-32000, "x".repeat(JSON_RPC_MAX_LINE_BYTES));
    });
    await expect(left.request("large_error", {}, 1_000)).rejects.toMatchObject({
      code: -32603,
      message: "JSON-RPC output line exceeds maximum size."
    });
    await expect(errorProtocolError).resolves.toEqual([
      expect.objectContaining({ message: "JSON-RPC output line exceeds maximum size." })
    ]);
    left.close();
    right.close();
  });

  it("caps pending requests before allocating another id or timer", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const requests = Array.from(
      { length: JSON_RPC_MAX_PENDING_REQUESTS },
      () => peer.request("pending", {}, 60_000)
    );
    const settled = Promise.allSettled(requests);

    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size)
      .toBe(JSON_RPC_MAX_PENDING_REQUESTS);
    const nextId = (peer as unknown as { nextId: number }).nextId;
    await expect(peer.request("overflow", {}, 60_000))
      .rejects.toThrow("JSON-RPC pending request limit exceeded");
    expect((peer as unknown as { nextId: number }).nextId).toBe(nextId);
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size)
      .toBe(JSON_RPC_MAX_PENDING_REQUESTS);

    peer.close(new Error("test cleanup"));
    const outcomes = await settled;
    expect(outcomes.every((outcome) => outcome.status === "rejected")).toBe(true);
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
  });

  it("rejects duplicate active inbound request ids until the original settles", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const frames: Array<Record<string, unknown>> = [];
    writable.on("data", (chunk) => {
      frames.push(JSON.parse(String(chunk)) as Record<string, unknown>);
    });
    const peer = new JsonRpcPeer(readable, writable);
    const diagnostics: string[] = [];
    peer.on("protocol_error", (error: Error) => diagnostics.push(error.message));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let handlerCalls = 0;
    peer.setRequestHandler("slow", async () => {
      handlerCalls += 1;
      await gate;
      return { ok: true };
    });
    const request = JSON.stringify({ jsonrpc: "2.0", id: 7, method: "slow", params: {} });

    readable.write(`${request}\n${request}\n`);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(handlerCalls).toBe(1);
    expect(diagnostics).toContain("Duplicate active JSON-RPC request id: 7");
    expect(frames).toContainEqual(expect.objectContaining({
      id: 7,
      error: expect.objectContaining({
        code: -32600,
        message: "Duplicate active JSON-RPC request id."
      })
    }));

    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((peer as unknown as { activeInboundRequestIds: Set<number> })
      .activeInboundRequestIds.size).toBe(0);
    expect(frames).toContainEqual({ jsonrpc: "2.0", id: 7, result: { ok: true } });
    peer.close();
  });

  it("bounds active inbound requests and returns admission after settlement", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const frames: Array<Record<string, unknown>> = [];
    writable.on("data", (chunk) => {
      frames.push(JSON.parse(String(chunk)) as Record<string, unknown>);
    });
    const peer = new JsonRpcPeer(readable, writable);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let handlerCalls = 0;
    peer.setRequestHandler("slow", async () => {
      handlerCalls += 1;
      await gate;
      return { ok: true };
    });
    const requests = Array.from(
      { length: JSON_RPC_MAX_ACTIVE_INBOUND_REQUESTS + 1 },
      (_, index) => JSON.stringify({
        jsonrpc: "2.0",
        id: index + 1,
        method: "slow",
        params: {}
      })
    );

    readable.write(`${requests.join("\n")}\n`);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(handlerCalls).toBe(JSON_RPC_MAX_ACTIVE_INBOUND_REQUESTS);
    expect((peer as unknown as { activeInboundRequestIds: Set<number> })
      .activeInboundRequestIds.size).toBe(JSON_RPC_MAX_ACTIVE_INBOUND_REQUESTS);
    expect(frames).toContainEqual(expect.objectContaining({
      id: JSON_RPC_MAX_ACTIVE_INBOUND_REQUESTS + 1,
      error: expect.objectContaining({
        code: -32000,
        message: "JSON-RPC active inbound request limit exceeded."
      })
    }));

    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((peer as unknown as { activeInboundRequestIds: Set<number> })
      .activeInboundRequestIds.size).toBe(0);

    readable.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1_000,
      method: "slow",
      params: {}
    })}\n`);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(handlerCalls).toBe(JSON_RPC_MAX_ACTIVE_INBOUND_REQUESTS + 1);
    expect(frames).toContainEqual({ jsonrpc: "2.0", id: 1_000, result: { ok: true } });
    peer.close();
  });

  it("bounds active inbound notifications and resumes after handlers settle", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const diagnostics: string[] = [];
    peer.on("protocol_error", (error: Error) => diagnostics.push(error.message));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let handlerCalls = 0;
    peer.onNotification("slow", async () => {
      handlerCalls += 1;
      await gate;
    });
    const notifications = Array.from(
      { length: JSON_RPC_MAX_ACTIVE_INBOUND_NOTIFICATIONS + 1 },
      (_, index) => JSON.stringify({
        jsonrpc: "2.0",
        method: "slow",
        params: { index }
      })
    );

    readable.write(`${notifications.join("\n")}\n`);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(handlerCalls).toBe(JSON_RPC_MAX_ACTIVE_INBOUND_NOTIFICATIONS);
    expect((peer as unknown as { activeInboundNotifications: number })
      .activeInboundNotifications).toBe(JSON_RPC_MAX_ACTIVE_INBOUND_NOTIFICATIONS);
    expect(diagnostics).toContain("JSON-RPC active inbound notification limit exceeded.");
    expect(writable.readableLength).toBe(0);

    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((peer as unknown as { activeInboundNotifications: number })
      .activeInboundNotifications).toBe(0);

    readable.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "slow",
      params: { index: "replacement" }
    })}\n`);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(handlerCalls).toBe(JSON_RPC_MAX_ACTIVE_INBOUND_NOTIFICATIONS + 1);
    expect((peer as unknown as { activeInboundNotifications: number })
      .activeInboundNotifications).toBe(0);
    peer.close();
  });

  it("terminates when one reader turn exceeds the in-flight frame capacity", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const diagnostics: string[] = [];
    peer.on("protocol_error", (error: Error) => diagnostics.push(error.message));
    const closed = new Promise<Error | undefined>((resolve) => {
      peer.on("close", resolve);
    });

    readable.write(`${Array.from(
      { length: JSON_RPC_MAX_INBOUND_FRAMES_IN_FLIGHT + 1 },
      () => "{"
    ).join("\n")}\n`);

    const closeError = await closed;
    expect(closeError?.message).toBe("JSON-RPC inbound frame capacity exceeded.");
    expect(diagnostics).toContain("JSON-RPC inbound frame capacity exceeded.");
    expect(peer.isClosed()).toBe(true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((peer as unknown as { inboundFramesInFlight: number })
      .inboundFramesInFlight).toBe(0);
    expect((peer as unknown as { inboundBytesInFlight: number })
      .inboundBytesInFlight).toBe(0);
  });

  it("bounds in-flight input bytes and releases accounting after dispatch", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let handlerCalls = 0;
    peer.onNotification("large", async () => {
      handlerCalls += 1;
      await gate;
    });
    const largeNotification = JSON.stringify({
      jsonrpc: "2.0",
      method: "large",
      params: { value: "x".repeat(900_000) }
    });

    readable.write(`${Array.from({ length: 4 }, () => largeNotification).join("\n")}\n`);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(handlerCalls).toBe(4);
    expect((peer as unknown as { inboundBytesInFlight: number })
      .inboundBytesInFlight).toBeLessThanOrEqual(JSON_RPC_MAX_INBOUND_BYTES_IN_FLIGHT);
    expect(peer.isClosed()).toBe(false);

    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((peer as unknown as { inboundFramesInFlight: number })
      .inboundFramesInFlight).toBe(0);
    expect((peer as unknown as { inboundBytesInFlight: number })
      .inboundBytesInFlight).toBe(0);

    readable.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "large",
      params: { value: "replacement" }
    })}\n`);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(handlerCalls).toBe(5);
    expect(peer.isClosed()).toBe(false);
    peer.close();

    const overflowReadable = new PassThrough();
    const overflowPeer = new JsonRpcPeer(overflowReadable, new PassThrough());
    let releaseOverflow!: () => void;
    const overflowGate = new Promise<void>((resolve) => {
      releaseOverflow = resolve;
    });
    overflowPeer.onNotification("large", async () => {
      await overflowGate;
    });
    const overflowClosed = new Promise<Error | undefined>((resolve) => {
      overflowPeer.on("close", resolve);
    });
    overflowReadable.write(`${Array.from(
      { length: 5 },
      () => largeNotification
    ).join("\n")}\n`);

    const overflowError = await overflowClosed;
    expect(overflowError?.message).toBe("JSON-RPC inbound frame capacity exceeded.");
    expect(overflowPeer.isClosed()).toBe(true);
    releaseOverflow();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((overflowPeer as unknown as { inboundBytesInFlight: number })
      .inboundBytesInFlight).toBe(0);
  });

  it("validates request timeouts before pending admission", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const nextId = (peer as unknown as { nextId: number }).nextId;

    for (const timeoutMs of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      0,
      -1,
      1.5,
      JSON_RPC_MAX_TIMEOUT_MS + 1
    ]) {
      await expect(peer.request("invalid_timeout", {}, timeoutMs))
        .rejects.toThrow("JSON-RPC request timeout is out of range");
    }
    expect((peer as unknown as { nextId: number }).nextId).toBe(nextId);
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
    expect(writable.readableLength).toBe(0);
    peer.close();
  });

  it("cancels a timed-out request that has not entered the writable", async () => {
    const chunks: string[] = [];
    const callbacks: Array<() => void> = [];
    const writable = new Writable({
      highWaterMark: 1,
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callbacks.push(callback);
      }
    });
    const peer = new JsonRpcPeer(new PassThrough(), writable);
    const blocker = peer.notify("blocker", {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(chunks).toHaveLength(1);

    const queuedRequest = peer.request("must_not_send", {}, 20);
    await expect(queuedRequest).rejects.toThrow("JSON-RPC request timed out: must_not_send");
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
    expect(peer.isClosed()).toBe(false);

    callbacks.shift()?.();
    await blocker;
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(chunks).toHaveLength(1);
    expect(JSON.parse(chunks[0] ?? "{}").method).toBe("blocker");
    expect((peer as unknown as { queuedFrames: number }).queuedFrames).toBe(0);
    expect((peer as unknown as { queuedBytes: number }).queuedBytes).toBe(0);
    expect(peer.isClosed()).toBe(false);
    peer.close();
  });

  it("enters a stable terminal state after allocating the final request id", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    (peer as unknown as { nextId: number | null }).nextId = JSON_RPC_MAX_REQUEST_ID;

    const written = once(writable, "data");
    const finalRequest = peer.request("final", {}, 60_000);
    const [chunk] = await written;
    const encoded = JSON.parse(String(chunk));
    expect(encoded.id).toBe(JSON_RPC_MAX_REQUEST_ID);
    expect((peer as unknown as { nextId: number | null }).nextId).toBeNull();

    await expect(peer.request("exhausted", {}, 60_000))
      .rejects.toThrow("JSON-RPC request id space exhausted");
    expect((peer as unknown as { nextId: number | null }).nextId).toBeNull();
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(1);

    peer.close(new Error("test cleanup"));
    await expect(finalRequest).rejects.toThrow("test cleanup");
  });

  it("classifies duplicate, late, and unexpected response ids with bounded history", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);

    const completed = peer.request("completed", {}, 1_000);
    readable.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} })}\n`);
    await completed;
    const duplicate = once(peer, "protocol_error");
    readable.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} })}\n`);
    await expect(duplicate).resolves.toEqual([
      expect.objectContaining({ message: "Duplicate JSON-RPC response id: 1" })
    ]);

    await expect(peer.request("timeout", {}, 1)).rejects.toThrow("timed out");
    const late = once(peer, "protocol_error");
    readable.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} })}\n`);
    await expect(late).resolves.toEqual([
      expect.objectContaining({ message: "Late JSON-RPC response id: 2" })
    ]);

    const unexpected = once(peer, "protocol_error");
    readable.write(`${JSON.stringify({ jsonrpc: "2.0", id: 999, result: {} })}\n`);
    await expect(unexpected).resolves.toEqual([
      expect.objectContaining({ message: "Unexpected JSON-RPC response id: 999" })
    ]);

    const history = (peer as unknown as { settledRequests: Map<number, string> }).settledRequests;
    for (let id = 10; id < 10 + JSON_RPC_SETTLED_HISTORY_LIMIT + 1; id += 1) {
      (peer as unknown as { recordSettledRequest(id: number, state: string): void })
        .recordSettledRequest(id, "completed");
    }
    expect(history.size).toBe(JSON_RPC_SETTLED_HISTORY_LIMIT);
    expect(history.has(10)).toBe(false);
    peer.close();
  });

  it("isolates notification observer and handler failures", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const calls: string[] = [];
    const diagnostics: string[] = [];
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });

    peer.on("protocol_error", () => {
      throw new Error("diagnostic consumer failed");
    });
    peer.on("protocol_error", (error: Error) => diagnostics.push(error.message));
    peer.on("notification", () => {
      calls.push("observer-1");
      throw new Error("observer failed");
    });
    peer.on("notification", () => calls.push("observer-2"));
    peer.onNotification("event", async () => {
      calls.push("handler-1");
      throw new Error("handler failed");
    });
    peer.onNotification("event", () => {
      calls.push("handler-2");
      finish();
    });

    readable.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "event",
      params: { ok: true }
    })}\n`);
    await finished;

    expect(calls).toEqual(["observer-1", "observer-2", "handler-1", "handler-2"]);
    expect(diagnostics).toEqual([
      "JSON-RPC notification observer failed: event",
      "JSON-RPC notification handler failed: event"
    ]);
    peer.close();
  });

  it("isolates notification params across every observer and handler", async () => {
    const readable = new PassThrough();
    const peer = new JsonRpcPeer(readable, new PassThrough());
    const seen: Array<[string, unknown, unknown]> = [];
    const paramsReferences: object[] = [];
    const nestedReferences: object[] = [];
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const consume = (label: string, params: unknown): void => {
      const value = params as Record<string, unknown>;
      const nested = value.nested as Record<string, unknown>;
      seen.push([label, value.value, nested.count]);
      paramsReferences.push(value);
      nestedReferences.push(nested);
      value.value = label;
      nested.count = 99;
    };

    peer.on("notification", (_method, params) => consume("observer-1", params));
    peer.on("notification", (_method, params) => consume("observer-2", params));
    peer.onNotification("event", (params) => consume("handler-1", params));
    peer.onNotification("event", (params) => {
      consume("handler-2", params);
      finish();
    });

    readable.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "event",
      params: { value: "original", nested: { count: 1 } }
    })}\n`);
    await finished;

    expect(seen).toEqual([
      ["observer-1", "original", 1],
      ["observer-2", "original", 1],
      ["handler-1", "original", 1],
      ["handler-2", "original", 1]
    ]);
    expect(new Set(paramsReferences).size).toBe(4);
    expect(new Set(nestedReferences).size).toBe(4);
    peer.close();
  });

  it("snapshots method notification handlers before dispatch", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const calls: string[] = [];
    let registered = false;
    peer.onNotification("mutable", () => {
      calls.push("first");
      if (!registered) {
        registered = true;
        peer.onNotification("mutable", () => {
          calls.push("late");
        });
      }
    });
    const notification = JSON.stringify({
      jsonrpc: "2.0",
      method: "mutable",
      params: {}
    });

    readable.write(`${notification}\n`);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(calls).toEqual(["first"]);

    readable.write(`${notification}\n`);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(calls).toEqual(["first", "first", "late"]);
    expect((peer as unknown as { activeInboundNotifications: number })
      .activeInboundNotifications).toBe(0);
    peer.close();
  });

  it("unsubscribes exact notification registrations idempotently", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const calls: string[] = [];
    let unsubscribeSecond!: () => void;
    const unsubscribeFirst = peer.onNotification("owned", () => {
      calls.push("shared");
      unsubscribeSecond();
    });
    const shared = (): void => {
      calls.push("shared");
    };
    unsubscribeSecond = peer.onNotification("owned", shared);
    const unsubscribeThird = peer.onNotification("owned", shared);
    const notification = JSON.stringify({
      jsonrpc: "2.0",
      method: "owned",
      params: {}
    });

    unsubscribeThird();
    unsubscribeThird();
    readable.write(`${notification}\n`);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(calls).toEqual(["shared", "shared"]);

    readable.write(`${notification}\n`);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(calls).toEqual(["shared", "shared", "shared"]);

    unsubscribeFirst();
    unsubscribeFirst();
    readable.write(`${notification}\n`);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(calls).toEqual(["shared", "shared", "shared"]);
    expect((peer as unknown as { notificationHandlers: Map<string, unknown> })
      .notificationHandlers.has("owned")).toBe(false);
    peer.close();
  });

  it("isolates protocol diagnostics across reader and response control flow", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const diagnostics: string[] = [];

    peer.on("protocol_error", async () => {
      throw new Error("async diagnostic failed");
    });
    peer.on("protocol_error", (error: Error) => diagnostics.push(error.message));

    const notification = once(peer, "notification");
    readable.write("{bad-json}\n");
    readable.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "recovered",
      params: {}
    })}\n`);
    await expect(notification).resolves.toEqual(["recovered", {}]);
    expect(diagnostics[0]).toContain("Unexpected token");

    const pending = peer.request("invalid", {}, 1_000);
    readable.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, result: [] })}\n`);
    await expect(pending).rejects.toThrow("Invalid JSON-RPC success response payload");
    expect(diagnostics).toContain("Invalid JSON-RPC success response payload.");
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
    peer.close();
  });

  it("isolates protocol diagnostic payloads from observers and pending control flow", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const observations: string[] = [];
    const diagnosticRefs: Error[] = [];

    peer.on("protocol_error", (error: Error) => {
      observations.push(error.message);
      diagnosticRefs.push(error);
      error.message = "mutated diagnostic";
    });
    peer.on("protocol_error", (error: Error) => {
      observations.push(error.message);
      diagnosticRefs.push(error);
    });

    const pending = peer.request("invalid", {}, 1_000);
    readable.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, result: [] })}\n`);

    await expect(pending).rejects.toThrow("Invalid JSON-RPC success response payload");
    expect(observations).toEqual([
      "Invalid JSON-RPC success response payload.",
      "Invalid JSON-RPC success response payload."
    ]);
    expect(diagnosticRefs[0]).not.toBe(diagnosticRefs[1]);
    peer.close();
  });

  it("deeply isolates structured protocol diagnostic data", () => {
    const peer = new JsonRpcPeer(new PassThrough(), new PassThrough());
    const observations: number[] = [];
    const dataRefs: unknown[] = [];

    peer.on("protocol_error", (error: Error) => {
      const data = (error as JsonRpcError).data as { nested: { count: number } };
      observations.push(data.nested.count);
      dataRefs.push(data);
      data.nested.count = 2;
    });
    peer.on("protocol_error", (error: Error) => {
      const data = (error as JsonRpcError).data as { nested: { count: number } };
      observations.push(data.nested.count);
      dataRefs.push(data);
    });

    (peer as unknown as { emitProtocolError(error: Error): void }).emitProtocolError(
      new JsonRpcError(-32042, "structured diagnostic", { nested: { count: 1 } })
    );

    expect(observations).toEqual([1, 1]);
    expect(dataRefs[0]).not.toBe(dataRefs[1]);
    peer.close();
  });

  it("isolates close observers after pending cleanup", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const calls: string[] = [];
    const diagnostics: string[] = [];
    peer.on("notification", () => undefined);
    peer.on("protocol_error", (error: Error) => diagnostics.push(error.message));
    peer.on("close", () => {
      calls.push("close-1");
      throw new Error("sync close failure");
    });
    peer.on("close", async () => {
      calls.push("close-2");
      throw new Error("async close failure");
    });
    peer.on("close", () => calls.push("close-3"));

    const pending = peer.request("pending", {}, 60_000);
    expect(() => peer.close(new Error("closed for test"))).not.toThrow();
    expect(peer.listenerCount("notification")).toBe(0);
    expect(peer.listenerCount("close")).toBe(0);
    await expect(pending).rejects.toThrow("closed for test");
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(calls).toEqual(["close-1", "close-2", "close-3"]);
    expect(diagnostics).toEqual([
      "JSON-RPC close observer failed.",
      "JSON-RPC close observer failed."
    ]);
    expect(peer.listenerCount("protocol_error")).toBe(0);
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);

    peer.close();
    expect(calls).toEqual(["close-1", "close-2", "close-3"]);
  });

  it("isolates close error payloads from observers and terminal control flow", async () => {
    const peer = new JsonRpcPeer(new PassThrough(), new PassThrough());
    const observations: Array<[string, number]> = [];
    const closeErrorRefs: Error[] = [];
    const closeDataRefs: unknown[] = [];

    peer.on("close", (error?: Error) => {
      const closeError = error as JsonRpcError;
      const data = closeError.data as { nested: { count: number } };
      observations.push([closeError.message, data.nested.count]);
      closeErrorRefs.push(closeError);
      closeDataRefs.push(data);
      closeError.message = "mutated close diagnostic";
      data.nested.count = 2;
    });
    peer.on("close", (error?: Error) => {
      const closeError = error as JsonRpcError;
      const data = closeError.data as { nested: { count: number } };
      observations.push([closeError.message, data.nested.count]);
      closeErrorRefs.push(closeError);
      closeDataRefs.push(data);
    });

    const pending = peer.request("pending", {}, 60_000);
    const terminal = new JsonRpcError(-32042, "terminal close", {
      nested: { count: 1 }
    });
    peer.close(terminal);

    await expect(pending).rejects.toBe(terminal);
    expect(terminal.message).toBe("terminal close");
    expect((terminal.data as { nested: { count: number } }).nested.count).toBe(1);
    expect(observations).toEqual([
      ["terminal close", 1],
      ["terminal close", 1]
    ]);
    expect(closeErrorRefs[0]).not.toBe(closeErrorRefs[1]);
    expect(closeDataRefs[0]).not.toBe(closeDataRefs[1]);
    await expect(peer.request("after_close", {}, 1_000)).rejects.toBe(terminal);
  });

  it("detaches transport listeners and rejects post-close input dispatch", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const readableBaseline = {
      data: readable.listenerCount("data"),
      end: readable.listenerCount("end"),
      close: readable.listenerCount("close")
    };
    const writableCloseBaseline = writable.listenerCount("close");
    const peer = new JsonRpcPeer(readable, writable);
    let notifications = 0;
    peer.onNotification("after_close", () => {
      notifications += 1;
    });

    expect(readable.listenerCount("data")).toBe(readableBaseline.data + 1);
    expect(writable.listenerCount("close")).toBe(writableCloseBaseline + 1);
    peer.close();

    expect(readable.listenerCount("data")).toBe(readableBaseline.data);
    expect(readable.listenerCount("end")).toBe(readableBaseline.end);
    expect(readable.listenerCount("close")).toBe(readableBaseline.close);
    expect(writable.listenerCount("close")).toBe(writableCloseBaseline);
    readable.emit(
      "data",
      `${JSON.stringify({ jsonrpc: "2.0", method: "after_close", params: {} })}\n`
    );
    expect(() => readable.emit("error", new Error("late readable error"))).not.toThrow();
    expect(() => writable.emit("error", new Error("late writable error"))).not.toThrow();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(notifications).toBe(0);
  });

  it("treats an idle output stream close as terminal", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const peer = new JsonRpcPeer(readable, writable);
    const closed = new Promise<Error | undefined>((resolve) => {
      peer.on("close", resolve);
    });

    writable.emit("close");

    const closeError = await closed;
    expect(closeError?.message).toContain("JSON-RPC output stream closed");
    expect(peer.isClosed()).toBe(true);
    await expect(peer.notify("after_close", {}))
      .rejects.toThrow("JSON-RPC output stream closed");
  });

  it("serializes writes and waits for callback and drain acknowledgement", async () => {
    const chunks: string[] = [];
    const callbacks: Array<() => void> = [];
    const writable = new Writable({
      highWaterMark: 1,
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callbacks.push(callback);
      }
    });
    const peer = new JsonRpcPeer(new PassThrough(), writable);
    let firstSettled = false;
    const first = peer.notify("first", {}).then(() => {
      firstSettled = true;
    });
    const second = peer.notify("second", {});

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(chunks).toHaveLength(1);
    expect(firstSettled).toBe(false);

    callbacks.shift()?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(chunks).toHaveLength(2);
    expect(JSON.parse(chunks[0] ?? "{}").method).toBe("first");
    expect(JSON.parse(chunks[1] ?? "{}").method).toBe("second");

    callbacks.shift()?.();
    await Promise.all([first, second]);
    peer.close();
  });

  it("treats write callback failure as terminal for pending requests", async () => {
    const writable = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error("write callback failed"));
      }
    });
    const peer = new JsonRpcPeer(new PassThrough(), writable);

    await expect(peer.request("request", {}, 60_000))
      .rejects.toThrow("write callback failed");
    expect(peer.isClosed()).toBe(true);
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
    await expect(peer.notify("after_close", {})).rejects.toThrow("write callback failed");
  });

  it("aborts active and queued writes when the peer closes without stream acknowledgement", async () => {
    const callbacks: Array<() => void> = [];
    const writable = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, callback) {
        callbacks.push(callback);
      }
    });
    const peer = new JsonRpcPeer(new PassThrough(), writable);
    const active = peer.notify("active", {});
    const queued = peer.notify("queued", {});
    const settled = Promise.allSettled([active, queued]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(callbacks).toHaveLength(1);

    peer.close(new Error("manual close"));

    const outcomes = await settled;
    expect(outcomes).toEqual([
      expect.objectContaining({
        status: "rejected",
        reason: expect.objectContaining({ message: "manual close" })
      }),
      expect.objectContaining({
        status: "rejected",
        reason: expect.objectContaining({ message: "manual close" })
      })
    ]);
    expect((peer as unknown as { activeWriteAborters: Set<unknown> })
      .activeWriteAborters.size).toBe(0);
    expect((peer as unknown as { queuedFrames: number }).queuedFrames).toBe(0);
    expect((peer as unknown as { queuedBytes: number }).queuedBytes).toBe(0);
    expect(() => callbacks.shift()?.()).not.toThrow();
  });

  it("bounds outbound queue frames and bytes and returns capacity on settle", async () => {
    const callbacks: Array<() => void> = [];
    const writable = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, callback) {
        callbacks.push(callback);
      }
    });
    const peer = new JsonRpcPeer(new PassThrough(), writable);
    const admitted = Array.from(
      { length: JSON_RPC_MAX_QUEUED_FRAMES },
      (_, index) => peer.notify("queued", { index })
    );
    const admittedSettled = Promise.allSettled(admitted);

    await expect(peer.notify("frame_overflow", {}))
      .rejects.toThrow("JSON-RPC outbound queue capacity exceeded");
    await expect(peer.request("request_overflow", {}, 60_000))
      .rejects.toThrow("JSON-RPC outbound queue capacity exceeded");
    expect(peer.isClosed()).toBe(false);
    expect((peer as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
    expect((peer as unknown as { queuedFrames: number }).queuedFrames)
      .toBe(JSON_RPC_MAX_QUEUED_FRAMES);

    callbacks.shift()?.();
    await admitted[0];
    const replacement = peer.notify("replacement", {});
    const replacementSettled = Promise.allSettled([replacement]);
    expect((peer as unknown as { queuedFrames: number }).queuedFrames)
      .toBe(JSON_RPC_MAX_QUEUED_FRAMES);

    peer.close(new Error("test cleanup"));
    callbacks.shift()?.();
    await admittedSettled;
    await replacementSettled;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((peer as unknown as { queuedFrames: number }).queuedFrames).toBe(0);
    expect((peer as unknown as { queuedBytes: number }).queuedBytes).toBe(0);

    const byteCallbacks: Array<() => void> = [];
    const bytePeer = new JsonRpcPeer(
      new PassThrough(),
      new Writable({
        write(_chunk, _encoding, callback) {
          byteCallbacks.push(callback);
        }
      })
    );
    const largePayload = { value: "x".repeat(900_000) };
    const large = Array.from({ length: 4 }, () => bytePeer.notify("large", largePayload));
    const largeSettled = Promise.allSettled(large);
    expect((bytePeer as unknown as { queuedBytes: number }).queuedBytes)
      .toBeLessThanOrEqual(JSON_RPC_MAX_QUEUED_BYTES);
    await expect(bytePeer.notify("byte_overflow", largePayload))
      .rejects.toThrow("JSON-RPC outbound queue capacity exceeded");

    bytePeer.close(new Error("test cleanup"));
    byteCallbacks.shift()?.();
    await largeSettled;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((bytePeer as unknown as { queuedBytes: number }).queuedBytes).toBe(0);
  });
});
