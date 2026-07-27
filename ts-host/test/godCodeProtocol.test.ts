import { describe, expect, expectTypeOf, it } from "vitest";
import {
  asCancelToolExecutionNotification,
  asCancelTurnRequest,
  asCancelTurnResponse,
  asCreateSessionRequest,
  asCreateSessionResponse,
  asToolExecutionError,
  asGodCodeEventEnvelope,
  asInitializeRequest,
  asInitializeResponse,
  asSubmitTurnRequest,
  asSubmitTurnResponse,
  asShutdownRequest,
  asShutdownResponse,
  asToolExecutionResult,
  type ToolExecutionResult
} from "../src/types/godCodeProtocol.js";

describe("GodCode protocol result validation", () => {
  it("validates cancel_tool_execution notification identity and JSON safety", () => {
    const notification = { session_id: "session", turn_id: "turn" };
    expect(asCancelToolExecutionNotification(notification)).toBe(notification);

    for (const payload of [
      null,
      { ...notification, session_id: " " },
      { ...notification, turn_id: " " },
      { ...notification, extension: { value: undefined } }
    ]) {
      expect(() => asCancelToolExecutionNotification(payload))
        .toThrow("Invalid cancel_tool_execution payload");
    }
  });

  it("requires an exact empty shutdown request object", () => {
    const request = {};
    expect(asShutdownRequest(request)).toBe(request);

    for (const payload of [null, [], { reason: "cleanup" }, { value: undefined }]) {
      expect(() => asShutdownRequest(payload))
        .toThrow("Invalid GOD-code shutdown request payload");
    }
  });

  it("validates shutdown acknowledgement status and JSON safety", () => {
    const response = { status: "shutting_down" };
    expect(asShutdownResponse(response)).toBe(response);

    for (const payload of [
      null,
      {},
      { status: "stopped" },
      { ...response, extension: { value: undefined } }
    ]) {
      expect(() => asShutdownResponse(payload))
        .toThrow("Invalid GOD-code shutdown response payload");
    }
  });

  it("validates cancel_turn request identities and JSON safety", () => {
    const request = { session_id: "session", turn_id: "turn" };
    expect(asCancelTurnRequest(request)).toBe(request);

    for (const payload of [
      null,
      { ...request, session_id: " " },
      { ...request, turn_id: " " },
      { ...request, extension: { value: undefined } }
    ]) {
      expect(() => asCancelTurnRequest(payload))
        .toThrow("Invalid GOD-code cancel_turn request payload");
    }
  });

  it("validates cancel_turn response identities, status, and JSON safety", () => {
    for (const status of ["cancel_requested", "not_found"] as const) {
      const response = { session_id: "session", turn_id: "turn", status };
      expect(asCancelTurnResponse(response)).toBe(response);
    }

    const response = { session_id: "session", turn_id: "turn", status: "not_found" };
    for (const payload of [
      null,
      { ...response, session_id: " " },
      { ...response, turn_id: " " },
      { ...response, status: "cancelled" },
      { ...response, extension: { value: BigInt(1) } }
    ]) {
      expect(() => asCancelTurnResponse(payload))
        .toThrow("Invalid GOD-code cancel_turn response payload");
    }
  });

  it("validates submit_turn request prompt and known option types", () => {
    const request = {
      session_id: "session",
      prompt: { role: "user", content: "hello" },
      turn_options: { stream: true, max_tokens: 128, temperature: 0.2, provider: "demo" }
    };
    expect(asSubmitTurnRequest(request)).toBe(request);

    for (const payload of [
      { ...request, session_id: " " },
      { ...request, prompt: { role: "assistant", content: "hello" } },
      { ...request, prompt: { role: "user", content: "" } },
      { ...request, turn_options: [] },
      { ...request, turn_options: { stream: "yes" } },
      { ...request, turn_options: { max_tokens: 1.5 } },
      { ...request, turn_options: { temperature: Number.NaN } },
      { ...request, turn_options: { provider: false } },
      { ...request, extension: { value: undefined } }
    ]) {
      expect(() => asSubmitTurnRequest(payload))
        .toThrow("Invalid GOD-code submit_turn request payload");
    }
  });

  it("validates submit_turn response identities, status, and JSON safety", () => {
    const response = { session_id: "session", turn_id: "turn", status: "accepted" };
    expect(asSubmitTurnResponse(response)).toBe(response);

    for (const payload of [
      null,
      { ...response, session_id: " " },
      { ...response, turn_id: " " },
      { ...response, status: "created" },
      { ...response, extension: { value: Number.NaN } }
    ]) {
      expect(() => asSubmitTurnResponse(payload))
        .toThrow("Invalid GOD-code submit_turn response payload");
    }
  });

  it("validates create_session request identities, catalogs, and resume history", () => {
    const request = {
      session_id: "session",
      cwd: "/workspace",
      tool_catalog: [{ name: "Read", description: "read", input_schema: { type: "object" } }],
      model_adapter: "fake",
      initial_messages: [
        { kind: "user", role: "user", content: "read" },
        { kind: "assistant", role: "assistant", content: "done" },
        { kind: "tool_call", tool_call: { tool_call_id: "call", tool_name: "Read" } },
        { kind: "tool_result", tool_call_id: "call", tool_name: "Read", result: { ok: true } }
      ]
    };
    expect(asCreateSessionRequest(request)).toBe(request);

    for (const payload of [
      { ...request, session_id: " " },
      { ...request, cwd: " " },
      { ...request, model_adapter: " " },
      { ...request, tool_catalog: [{ name: "Read", description: "read" }, { name: "Read", description: "again" }] },
      { ...request, tool_catalog: [{ name: "Read", description: "read", input_schema: [] }] },
      { ...request, initial_messages: [{ kind: "user", role: "assistant", content: "bad" }] },
      { ...request, initial_messages: [{ kind: "assistant", role: "assistant", content: "" }] },
      { ...request, initial_messages: [{ kind: "tool_result", tool_name: " ", result: {} }] },
      { ...request, extension: { value: undefined } }
    ]) {
      expect(() => asCreateSessionRequest(payload))
        .toThrow("Invalid GOD-code create_session request payload");
    }
  });

  it("validates create_session response identity, status, and JSON safety", () => {
    const response = { session_id: "session", status: "created" };
    expect(asCreateSessionResponse(response)).toBe(response);

    for (const payload of [
      null,
      { ...response, session_id: " " },
      { ...response, status: "accepted" },
      { ...response, extension: { value: undefined } }
    ]) {
      expect(() => asCreateSessionResponse(payload))
        .toThrow("Invalid GOD-code create_session response payload");
    }
  });

  it("validates initialize request metadata and JSON-safe capabilities", () => {
    const request = {
      protocol_version: "2.0",
      host_info: { name: "host", version: "0.1.0" },
      capabilities: { mode: "headless", tools: ["Read"] }
    };
    expect(asInitializeRequest(request)).toBe(request);

    for (const payload of [
      { ...request, protocol_version: " " },
      { ...request, host_info: { version: "0.1.0" } },
      { ...request, host_info: { name: "host", version: " " } },
      { ...request, capabilities: [] },
      { ...request, capabilities: { value: undefined } },
      { ...request, extra: { value: BigInt(1) } }
    ]) {
      expect(() => asInitializeRequest(payload))
        .toThrow("Invalid GOD-code initialize request payload");
    }
  });

  it("validates initialize response metadata and unique catalogs", () => {
    const response = {
      engine_info: { name: "engine", version: "0.1.0", protocol_version: "2.0" },
      supported_tools: [
        { name: "Read", description: "read", input_schema: { type: "object" } },
        { name: "Custom", description: "custom" }
      ],
      supported_model_adapters: ["fake", "demo"]
    };
    expect(asInitializeResponse(response)).toBe(response);

    for (const payload of [
      null,
      { ...response, engine_info: { version: "0.1.0", protocol_version: "2.0" } },
      { ...response, engine_info: { name: "engine", version: " ", protocol_version: "2.0" } },
      { ...response, supported_tools: [{ name: "Read", description: "read", input_schema: [] }] },
      { ...response, supported_tools: [{ name: "Read", description: "read" }, { name: "Read", description: "again" }] },
      { ...response, supported_model_adapters: ["fake", " "] },
      { ...response, supported_model_adapters: ["fake", "fake"] },
      { ...response, extra: { value: undefined } }
    ]) {
      expect(() => asInitializeResponse(payload))
        .toThrow("Invalid GOD-code initialize response payload");
    }
  });

  it("validates event lifecycle identity and type-specific payloads", () => {
    expect(asGodCodeEventEnvelope({
      event_type: "session_started",
      session_id: "session",
      sequence: 0,
      payload: { cwd: "/workspace", model_adapter: "fake" }
    }).event_type).toBe("session_started");
    expect(asGodCodeEventEnvelope({
      event_type: "turn_finished",
      session_id: "session",
      turn_id: "turn",
      sequence: 1,
      payload: {
        status: "success",
        assistant_message: { role: "assistant", content: "done" }
      }
    }).turn_id).toBe("turn");

    const validTurnEvents = [
      { event_type: "turn_started", payload: {} },
      { event_type: "assistant_delta", payload: { delta: { text: "partial" } } },
      {
        event_type: "assistant_message",
        payload: { message: { role: "assistant", content: "done" } }
      },
      {
        event_type: "tool_call_requested",
        payload: {
          tool_call: { tool_call_id: "call", tool_name: "Read", input: { path: "a" } },
          execution_mode: "serial"
        }
      },
      {
        event_type: "tool_result_received",
        payload: {
          tool_call_id: "call",
          tool_name: "Read",
          result: { ok: true, output: { content: "value" } }
        }
      },
      {
        event_type: "god_code_error",
        payload: { error: { code: "failed", message: "failed" } }
      }
    ];
    for (const event of validTurnEvents) {
      expect(asGodCodeEventEnvelope({
        ...event,
        session_id: "session",
        turn_id: "turn",
        sequence: 1
      }).event_type).toBe(event.event_type);
    }

    for (const payload of [
      { event_type: "unknown", session_id: "session", payload: {} },
      { event_type: "turn_started", session_id: "session", payload: {} },
      { event_type: "turn_started", session_id: "session", turn_id: "  ", payload: {} },
      {
        event_type: "session_started",
        session_id: "session",
        turn_id: "turn",
        payload: { cwd: "/workspace", model_adapter: "fake" }
      },
      { event_type: "session_started", session_id: " ", payload: {} },
      { event_type: "session_started", session_id: "session", payload: { value: undefined } },
      { event_type: "session_started", session_id: "session", payload: { cwd: "/workspace" } },
      { event_type: "assistant_delta", session_id: "session", turn_id: "turn", payload: { delta: {} } },
      {
        event_type: "assistant_message",
        session_id: "session",
        turn_id: "turn",
        payload: { message: { role: "user", content: "wrong" } }
      },
      {
        event_type: "tool_call_requested",
        session_id: "session",
        turn_id: "turn",
        payload: { tool_call: { tool_call_id: "call", tool_name: "Read", input: [] } }
      },
      {
        event_type: "tool_result_received",
        session_id: "session",
        turn_id: "turn",
        payload: { tool_call_id: "call", tool_name: "Read", result: { ok: false } }
      },
      {
        event_type: "turn_finished",
        session_id: "session",
        turn_id: "turn",
        payload: { status: "success" }
      },
      {
        event_type: "turn_finished",
        session_id: "session",
        turn_id: "turn",
        payload: { status: "cancelled", error: { code: "failed", message: "failed" } }
      },
      {
        event_type: "god_code_error",
        session_id: "session",
        turn_id: "turn",
        payload: { error: { code: "", message: "failed" } }
      }
    ]) {
      const event = {
        sequence: payload.event_type === "session_started" ? 0 : 1,
        ...payload
      };
      expect(() => asGodCodeEventEnvelope(event)).toThrow("Invalid god_code_event payload");
    }

    expect(() => asGodCodeEventEnvelope({
      event_type: "session_started",
      session_id: "session",
      sequence: 1,
      payload: { cwd: "/workspace", model_adapter: "fake" }
    })).toThrow("Invalid god_code_event payload");
    expect(() => asGodCodeEventEnvelope({
      event_type: "turn_started",
      session_id: "session",
      turn_id: "turn",
      sequence: 0,
      payload: {}
    })).toThrow("Invalid god_code_event payload");
  });

  it("validates directly constructed tool errors", () => {
    expect(asToolExecutionError({ code: "failed", message: "failed" })).toEqual({
      code: "failed",
      message: "failed"
    });
    expect(() => asToolExecutionError({ code: "", message: "failed" }))
      .toThrow("Invalid tool execution error payload");
    expect(() => asToolExecutionError({ code: "   ", message: "failed" }))
      .toThrow("Invalid tool execution error payload");
    expect(() => asToolExecutionError({ code: "failed", message: "\n\t" }))
      .toThrow("Invalid tool execution error payload");
    expect(() => asToolExecutionError({ code: "failed", message: "", details: [] }))
      .toThrow("Invalid tool execution error payload");
  });

  it("rejects non-JSON and cyclic nested result values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    for (const output of [
      { value: undefined },
      { value: BigInt(1) },
      { value: Number.NaN },
      { value: () => undefined },
      { value: new Date() },
      cyclic
    ]) {
      expect(() => asToolExecutionResult({ ok: true, output }))
        .toThrow("Invalid tool execution result payload");
    }
  });

  it("exposes a discriminated result type", () => {
    const success: ToolExecutionResult = { ok: true, output: { content: "ok" } };
    const failure: ToolExecutionResult = {
      ok: false,
      error: { code: "failed", message: "failed" }
    };

    if (success.ok) {
      expectTypeOf(success.error).toEqualTypeOf<undefined>();
    }
    if (!failure.ok) {
      expectTypeOf(failure.error.code).toEqualTypeOf<string>();
    }
  });

  it("accepts valid success and failure results", () => {
    expect(asToolExecutionResult({ ok: true, output: { content: "ok" } })).toEqual({
      ok: true,
      output: { content: "ok" }
    });
    expect(asToolExecutionResult({
      ok: false,
      error: { code: "read_failed", message: "failed", details: { path: "a" } }
    })).toEqual({
      ok: false,
      error: { code: "read_failed", message: "failed", details: { path: "a" } }
    });
  });

  it.each([
    { ok: "true" },
    { ok: true, output: null },
    { ok: true, output: [] },
    { ok: true, error: { code: "unexpected", message: "unexpected" } },
    { ok: false },
    { ok: false, error: null },
    { ok: false, error: { code: "", message: "failed" } },
    { ok: false, error: { code: "failed", message: "" } },
    { ok: false, error: { code: "failed", message: "failed", details: null } },
    { ok: false, error: { code: "failed", message: "failed", details: [] } }
  ])("rejects malformed result payload %#", (payload) => {
    expect(() => asToolExecutionResult(payload)).toThrow("Invalid tool execution result payload");
  });
});
