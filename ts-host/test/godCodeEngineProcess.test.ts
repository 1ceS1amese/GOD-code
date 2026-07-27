import { once } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultHostToolRegistry } from "../src/host_tools/registry.js";
import { GodCodeEngineProcess } from "../src/ipc/godCodeEngineProcess.js";
import type { GodCodeEventEnvelope } from "../src/types/godCodeProtocol.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-engine-"));
  tempDirs.push(dir);
  return dir;
}

async function withProviderEnv<T>(run: () => Promise<T>): Promise<T> {
  const previous = {
    GOD_CODE_PROVIDER: process.env.GOD_CODE_PROVIDER,
    GOD_CODE_MODEL: process.env.GOD_CODE_MODEL,
    GOD_CODE_API_KEY_ENV: process.env.GOD_CODE_API_KEY_ENV,
    DEMO_API_KEY: process.env.DEMO_API_KEY
  };
  process.env.GOD_CODE_PROVIDER = "demo";
  process.env.GOD_CODE_MODEL = "demo-model";
  process.env.GOD_CODE_API_KEY_ENV = "DEMO_API_KEY";
  process.env.DEMO_API_KEY = "secret";
  try {
    return await run();
  } finally {
    restoreEnv("GOD_CODE_PROVIDER", previous.GOD_CODE_PROVIDER);
    restoreEnv("GOD_CODE_MODEL", previous.GOD_CODE_MODEL);
    restoreEnv("GOD_CODE_API_KEY_ENV", previous.GOD_CODE_API_KEY_ENV);
    restoreEnv("DEMO_API_KEY", previous.DEMO_API_KEY);
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

async function waitForTurnFinished(
  engine: GodCodeEngineProcess,
  turnId: string
): Promise<GodCodeEventEnvelope> {
  return await new Promise((resolve) => {
    const handler = (event: GodCodeEventEnvelope) => {
      if (event.event_type === "turn_finished" && event.turn_id === turnId) {
        engine.off("god_code_event", handler);
        resolve(event);
      }
    };
    engine.on("god_code_event", handler);
  });
}

async function collectTurnEventsForNextTurn(
  engine: GodCodeEngineProcess
): Promise<GodCodeEventEnvelope[]> {
  return await new Promise((resolve) => {
    const events: GodCodeEventEnvelope[] = [];
    let turnId: string | undefined;
    const handler = (event: GodCodeEventEnvelope) => {
      if (typeof event.turn_id !== "string") {
        return;
      }
      if (!turnId) {
        turnId = event.turn_id;
      }
      if (event.turn_id !== turnId) {
        return;
      }
      events.push(event);
      if (event.event_type === "turn_finished") {
        engine.off("god_code_event", handler);
        resolve(events);
      }
    };
    engine.on("god_code_event", handler);
  });
}

async function collectTurnFinishedEvents(
  engine: GodCodeEngineProcess,
  count: number
): Promise<GodCodeEventEnvelope[]> {
  return await new Promise((resolve) => {
    const events: GodCodeEventEnvelope[] = [];
    const handler = (event: GodCodeEventEnvelope) => {
      if (event.event_type !== "turn_finished") {
        return;
      }
      events.push(event);
      if (events.length >= count) {
        engine.off("god_code_event", handler);
        resolve(events);
      }
    };
    engine.on("god_code_event", handler);
  });
}

describe("GodCodeEngineProcess", () => {
  it("validates explicit shutdown acknowledgements", async () => {
    const engine = new GodCodeEngineProcess();
    const responses: unknown[] = [
      { status: "stopped" },
      { status: "shutting_down" }
    ];
    const requests: unknown[] = [];
    (engine as unknown as {
      peer: { isClosed(): boolean; request(method: string, params: unknown): Promise<unknown> };
    }).peer = {
      isClosed: () => false,
      request: async (_method, params) => {
        requests.push(params);
        return responses.shift();
      }
    };

    await expect(engine.shutdown())
      .rejects.toThrow("Invalid GOD-code shutdown response payload");
    await expect(engine.shutdown()).resolves.toBeUndefined();
    expect(requests).toEqual([{}, {}]);
  });

  it("rejects malformed cancel_turn requests before abort or RPC mutation", async () => {
    const engine = new GodCodeEngineProcess();
    let requests = 0;
    const internals = engine as unknown as {
      initialized: boolean;
      peer: { isClosed(): boolean; request(): Promise<unknown> };
      turnAbortControllers: Map<string, AbortController>;
    };
    internals.initialized = true;
    internals.peer = {
      isClosed: () => false,
      request: async () => {
        requests += 1;
        return { session_id: "session", turn_id: "turn", status: "not_found" };
      }
    };

    await expect(engine.cancelTurn({ session_id: "session", turn_id: " " }))
      .rejects.toThrow("Invalid GOD-code cancel_turn request payload");
    expect(requests).toBe(0);
    expect(internals.turnAbortControllers.size).toBe(0);
  });

  it("validates cancel_turn responses before response-driven lifecycle cleanup", async () => {
    const engine = new GodCodeEngineProcess();
    const responses: unknown[] = [
      { session_id: "session", turn_id: "turn", status: "cancelled" },
      { session_id: "other", turn_id: "turn", status: "not_found" },
      { session_id: "session", turn_id: "turn", status: "not_found" }
    ];
    const internals = engine as unknown as {
      initialized: boolean;
      peer: { isClosed(): boolean; request(): Promise<unknown> };
      turnAbortControllers: Map<string, AbortController>;
    };
    internals.initialized = true;
    internals.peer = {
      isClosed: () => false,
      request: async () => responses.shift()
    };
    const request = { session_id: "session", turn_id: "turn" };

    await expect(engine.cancelTurn(request))
      .rejects.toThrow("Invalid GOD-code cancel_turn response payload");
    expect(internals.turnAbortControllers.size).toBe(1);
    await expect(engine.cancelTurn(request))
      .rejects.toThrow("Mismatched GOD-code cancel_turn response identity: other/turn; expected session/turn");
    expect(internals.turnAbortControllers.size).toBe(1);
    await expect(engine.cancelTurn(request)).resolves.toEqual({
      session_id: "session",
      turn_id: "turn",
      status: "not_found"
    });
    expect(internals.turnAbortControllers.size).toBe(0);
  });

  it("rejects malformed submit_turn requests before sending RPC", async () => {
    const engine = new GodCodeEngineProcess();
    let requests = 0;
    const internals = engine as unknown as {
      initialized: boolean;
      peer: { isClosed(): boolean; request(): Promise<unknown> };
    };
    internals.initialized = true;
    internals.peer = {
      isClosed: () => false,
      request: async () => {
        requests += 1;
        return { session_id: "session", turn_id: "turn", status: "accepted" };
      }
    };

    await expect(engine.submitTurn({
      session_id: "session",
      prompt: { role: "user", content: "hello" },
      turn_options: { stream: "yes" } as never
    })).rejects.toThrow("Invalid GOD-code submit_turn request payload");
    expect(requests).toBe(0);
  });

  it("validates submit_turn responses and correlates session identity", async () => {
    const engine = new GodCodeEngineProcess();
    const responses: unknown[] = [
      { session_id: "session", turn_id: "turn", status: "created" },
      { session_id: "other", turn_id: "turn", status: "accepted" },
      { session_id: "session", turn_id: "turn", status: "accepted" }
    ];
    const internals = engine as unknown as {
      initialized: boolean;
      peer: { isClosed(): boolean; request(): Promise<unknown> };
    };
    internals.initialized = true;
    internals.peer = {
      isClosed: () => false,
      request: async () => responses.shift()
    };
    const request = {
      session_id: "session",
      prompt: { role: "user" as const, content: "hello" },
      turn_options: {}
    };

    await expect(engine.submitTurn(request))
      .rejects.toThrow("Invalid GOD-code submit_turn response payload");
    await expect(engine.submitTurn(request))
      .rejects.toThrow("Mismatched GOD-code submit_turn response session_id: other; expected session");
    await expect(engine.submitTurn(request)).resolves.toEqual({
      session_id: "session",
      turn_id: "turn",
      status: "accepted"
    });
  });

  it("rejects malformed create_session requests before sending RPC", async () => {
    const engine = new GodCodeEngineProcess();
    let requests = 0;
    const internals = engine as unknown as {
      initialized: boolean;
      peer: { isClosed(): boolean; request(): Promise<unknown> };
    };
    internals.initialized = true;
    internals.peer = {
      isClosed: () => false,
      request: async () => {
        requests += 1;
        return { session_id: "session", status: "created" };
      }
    };

    await expect(engine.createSession({
      session_id: "session",
      cwd: "/workspace",
      tool_catalog: [
        { name: "Read", description: "read" },
        { name: "Read", description: "duplicate" }
      ],
      model_adapter: "fake"
    })).rejects.toThrow("Invalid GOD-code create_session request payload");
    expect(requests).toBe(0);
  });

  it("validates create_session responses and correlates session identity", async () => {
    const engine = new GodCodeEngineProcess();
    const responses: unknown[] = [
      { session_id: "session", status: "accepted" },
      { session_id: "other", status: "created" },
      { session_id: "session", status: "created" }
    ];
    const internals = engine as unknown as {
      initialized: boolean;
      peer: { isClosed(): boolean; request(): Promise<unknown> };
    };
    internals.initialized = true;
    internals.peer = {
      isClosed: () => false,
      request: async () => responses.shift()
    };
    const request = {
      session_id: "session",
      cwd: "/workspace",
      tool_catalog: [],
      model_adapter: "fake"
    };

    await expect(engine.createSession(request))
      .rejects.toThrow("Invalid GOD-code create_session response payload");
    await expect(engine.createSession(request))
      .rejects.toThrow("Mismatched GOD-code create_session response session_id: other; expected session");
    await expect(engine.createSession(request)).resolves.toEqual({
      session_id: "session",
      status: "created"
    });
  });

  it("advertises execute_tools while preserving caller capabilities", async () => {
    const engine = new GodCodeEngineProcess();
    let requestParams: unknown;
    (engine as unknown as { peer: { isClosed(): boolean; request(method: string, params: unknown): Promise<unknown> } }).peer = {
      isClosed: () => false,
      request: async (_method, params) => {
        requestParams = params;
        return {
          engine_info: { name: "test-engine", version: "0.1.0", protocol_version: "2.0" },
          supported_tools: [],
          supported_model_adapters: []
        };
      }
    };

    await engine.initialize({
      protocol_version: "2.0",
      host_info: { name: "test", version: "0.1.0" },
      capabilities: { mode: "headless" }
    });

    expect(requestParams).toMatchObject({
      capabilities: { mode: "headless", execute_tools: true, execute_tools_max_batch_size: 4 }
    });
    await expect(engine.initialize({
      protocol_version: "2.0",
      host_info: { name: "test", version: "0.1.0" },
      capabilities: {}
    })).rejects.toThrow("GOD-code engine process is already initialized");
  });

  it("rejects business requests before initialization", async () => {
    const engine = new GodCodeEngineProcess();
    let requests = 0;
    (engine as unknown as { peer: { isClosed(): boolean; request(): Promise<unknown> } }).peer = {
      isClosed: () => false,
      request: async () => {
        requests += 1;
        return {};
      }
    };

    await expect(engine.createSession({
      session_id: "session",
      cwd: "/workspace",
      tool_catalog: [],
      model_adapter: "fake"
    })).rejects.toThrow("GOD-code engine process is not initialized");
    await expect(engine.submitTurn({
      session_id: "session",
      prompt: { role: "user", content: "hello" },
      turn_options: {}
    })).rejects.toThrow("GOD-code engine process is not initialized");
    await expect(engine.cancelTurn({
      session_id: "session",
      turn_id: "turn"
    })).rejects.toThrow("GOD-code engine process is not initialized");
    expect(requests).toBe(0);
  });

  it("rejects malformed initialize requests before sending RPC", async () => {
    const engine = new GodCodeEngineProcess();
    let requests = 0;
    (engine as unknown as { peer: { isClosed(): boolean; request(): Promise<unknown> } }).peer = {
      isClosed: () => false,
      request: async () => {
        requests += 1;
        return {};
      }
    };

    await expect(engine.initialize({
      protocol_version: "2.0",
      host_info: { name: "test-host" },
      capabilities: {}
    } as never)).rejects.toThrow("Invalid GOD-code initialize request payload");
    expect(requests).toBe(0);
  });

  it("rejects concurrent initialize calls while negotiation is in progress", async () => {
    const engine = new GodCodeEngineProcess();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    (engine as unknown as { peer: { isClosed(): boolean; request(): Promise<unknown> } }).peer = {
      isClosed: () => false,
      request: async () => {
        requests += 1;
        await gate;
        return {
          engine_info: { name: "test-engine", version: "0.1.0", protocol_version: "2.0" },
          supported_tools: [],
          supported_model_adapters: []
        };
      }
    };
    const request = {
      protocol_version: "2.0",
      host_info: { name: "test-host", version: "0.1.0" },
      capabilities: {}
    };

    const first = engine.initialize(request);
    await expect(engine.initialize(request))
      .rejects.toThrow("GOD-code engine process initialization is already in progress");
    expect(requests).toBe(1);
    release?.();
    await expect(first).resolves.toMatchObject({
      engine_info: { protocol_version: "2.0" }
    });
  });

  it("rejects Host and Engine protocol version mismatches", async () => {
    const engine = new GodCodeEngineProcess();
    let requests = 0;
    (engine as unknown as { peer: { isClosed(): boolean; request(): Promise<unknown> } }).peer = {
      isClosed: () => false,
      request: async () => {
        requests += 1;
        return {
          engine_info: { name: "old-engine", version: "0.1.0", protocol_version: "1.0" },
          supported_tools: [],
          supported_model_adapters: []
        };
      }
    };

    await expect(engine.initialize({
      protocol_version: "1.0",
      host_info: { name: "old-host", version: "0.1.0" },
      capabilities: {}
    })).rejects.toThrow("Unsupported GOD-code Host protocol version: 1.0; expected 2.0");
    expect(requests).toBe(0);

    await expect(engine.initialize({
      protocol_version: "2.0",
      host_info: { name: "test-host", version: "0.1.0" },
      capabilities: {}
    })).rejects.toThrow("Incompatible GOD-code Engine protocol version: 1.0; expected 2.0");
    expect(requests).toBe(1);
  });

  it("rejects malformed initialize responses and rolls back initialization state", async () => {
    const engine = new GodCodeEngineProcess();
    const responses: unknown[] = [
      {
        engine_info: { name: "engine", version: "0.1.0", protocol_version: "2.0" },
        supported_tools: [
          { name: "Read", description: "read" },
          { name: "Read", description: "duplicate" }
        ],
        supported_model_adapters: ["fake"]
      },
      {
        engine_info: { name: "engine", version: "0.1.0", protocol_version: "2.0" },
        supported_tools: [{ name: "Read", description: "read" }],
        supported_model_adapters: ["fake"]
      }
    ];
    (engine as unknown as { peer: { isClosed(): boolean; request(): Promise<unknown> } }).peer = {
      isClosed: () => false,
      request: async () => responses.shift()
    };
    const request = {
      protocol_version: "2.0",
      host_info: { name: "test-host", version: "0.1.0" },
      capabilities: {}
    };

    await expect(engine.initialize(request))
      .rejects.toThrow("Invalid GOD-code initialize response payload");
    await expect(engine.initialize(request)).resolves.toMatchObject({
      supported_model_adapters: ["fake"]
    });
  });

  it("starts and initializes the python engine", async () => {
    const engine = new GodCodeEngineProcess();
    try {
      await engine.start();
      const init = await engine.initialize({
        protocol_version: "2.0",
        host_info: { name: "test-host", version: "0.1.0" },
        capabilities: { mode: "headless" }
      });

      expect(init.engine_info.name).toBe("god-code-py-engine");

      const created = await engine.createSession({
        session_id: randomUUID(),
        cwd: process.cwd(),
        tool_catalog: [
          { name: "Read", description: "read" },
          { name: "Edit", description: "edit" },
          { name: "Bash", description: "bash" }
        ],
        model_adapter: "fake"
      });

      expect(created.status).toBe("created");
    } finally {
      await engine.stop();
    }
  }, 10_000);

  it("runs a read turn end-to-end", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "fixture.txt");
    await fs.writeFile(filePath, "fixture-body", "utf8");

    const engine = new GodCodeEngineProcess();
    const registry = createDefaultHostToolRegistry();
    engine.setToolExecutor(async (request) => {
      return await registry.executeRequest(request, { cwd: dir });
    });

    try {
      await engine.start();
      await engine.initialize({
        protocol_version: "2.0",
        host_info: { name: "test-host", version: "0.1.0" },
        capabilities: { mode: "headless" }
      });
      const sessionId = randomUUID();
      await engine.createSession({
        session_id: sessionId,
        cwd: dir,
        tool_catalog: [
          { name: "Read", description: "read" },
          { name: "Edit", description: "edit" },
          { name: "Bash", description: "bash" }
        ],
        model_adapter: "fake"
      });

      const submit = await engine.submitTurn({
        session_id: sessionId,
        prompt: { role: "user", content: "read fixture.txt" },
        turn_options: {}
      });

      const finalEvent = await waitForTurnFinished(engine, submit.turn_id);
      expect(finalEvent.payload.status).toBe("success");
      expect(JSON.stringify(finalEvent.payload)).toContain("fixture-body");
    } finally {
      await engine.stop();
    }
  });

  it("runs turns for two sessions in one python engine process", async () => {
    const root = await createTempDir();
    const sessionOneCwd = path.join(root, "session-one");
    const sessionTwoCwd = path.join(root, "session-two");
    await fs.mkdir(sessionOneCwd);
    await fs.mkdir(sessionTwoCwd);
    await fs.writeFile(path.join(sessionOneCwd, "fixture.txt"), "session-one-body", "utf8");
    await fs.writeFile(path.join(sessionTwoCwd, "fixture.txt"), "session-two-body", "utf8");

    const engine = new GodCodeEngineProcess();
    const registry = createDefaultHostToolRegistry();
    const cwdBySession = new Map<string, string>();
    engine.setToolExecutor(async (request) => {
      const cwd = cwdBySession.get(request.session_id);
      if (!cwd) {
        throw new Error(`Missing cwd for session: ${request.session_id}`);
      }
      return await registry.executeRequest(request, { cwd });
    });

    try {
      await engine.start();
      await engine.initialize({
        protocol_version: "2.0",
        host_info: { name: "test-host", version: "0.1.0" },
        capabilities: { mode: "headless" }
      });
      const sessionOneId = randomUUID();
      const sessionTwoId = randomUUID();
      cwdBySession.set(sessionOneId, sessionOneCwd);
      cwdBySession.set(sessionTwoId, sessionTwoCwd);
      for (const [sessionId, cwd] of cwdBySession.entries()) {
        await engine.createSession({
          session_id: sessionId,
          cwd,
          tool_catalog: [{ name: "Read", description: "read" }],
          model_adapter: "fake"
        });
      }

      const finishedEventsPromise = collectTurnFinishedEvents(engine, 2);
      const firstSubmit = await engine.submitTurn({
        session_id: sessionOneId,
        prompt: { role: "user", content: "read fixture.txt" },
        turn_options: {}
      });
      const secondSubmit = await engine.submitTurn({
        session_id: sessionTwoId,
        prompt: { role: "user", content: "read fixture.txt" },
        turn_options: {}
      });
      const finishedEvents = await finishedEventsPromise;
      const bySession = new Map(finishedEvents.map((event) => [event.session_id, event]));

      expect(firstSubmit.session_id).toBe(sessionOneId);
      expect(secondSubmit.session_id).toBe(sessionTwoId);
      expect(bySession.get(sessionOneId)?.payload.status).toBe("success");
      expect(bySession.get(sessionTwoId)?.payload.status).toBe("success");
      expect(JSON.stringify(bySession.get(sessionOneId)?.payload)).toContain("session-one-body");
      expect(JSON.stringify(bySession.get(sessionTwoId)?.payload)).toContain("session-two-body");
    } finally {
      await engine.stop();
    }
  });

  it("forwards assistant_delta events when the turn requests streaming", async () => {
    const engine = new GodCodeEngineProcess();
    try {
      await engine.start();
      await engine.initialize({
        protocol_version: "2.0",
        host_info: { name: "test-host", version: "0.1.0" },
        capabilities: { mode: "headless" }
      });
      const sessionId = randomUUID();
      await engine.createSession({
        session_id: sessionId,
        cwd: process.cwd(),
        tool_catalog: [],
        model_adapter: "fake"
      });

      const eventPromise = collectTurnEventsForNextTurn(engine);
      await engine.submitTurn({
        session_id: sessionId,
        prompt: {
          role: "user",
          content: "hello"
        },
        turn_options: { stream: true }
      });

      const events = await eventPromise;
      expect(events.map((event) => event.event_type)).toEqual([
        "turn_started",
        "assistant_delta",
        "assistant_message",
        "turn_finished"
      ]);
      expect(events[1]?.payload.delta).toEqual({
        text:
          "Fake model only supports deterministic prompts: 'read <path>', 'edit <path> ::: <find> ::: <replace>', 'bash <command>', 'list <path>', 'search <path> ::: <pattern>', 'write <path> ::: <content>', or 'tool <tool_name> <json_object>'."
      });
    } finally {
      await engine.stop();
    }
  });

  it("lists env-registered provider adapters during initialize", async () => {
    await withProviderEnv(async () => {
      const engine = new GodCodeEngineProcess();
      try {
        await engine.start();
        const init = await engine.initialize({
          protocol_version: "2.0",
          host_info: { name: "test-host", version: "0.1.0" },
          capabilities: { mode: "headless" }
        });

        expect(init.supported_model_adapters).toEqual(["demo", "fake"]);
      } finally {
        await engine.stop();
      }
    });
  });

  it("executes a host tool batch concurrently and preserves request order", async () => {
    const engine = new GodCodeEngineProcess();
    const started: string[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    engine.setToolExecutor(async (request) => {
      started.push(request.tool_call_id);
      if (started.length === 2) {
        release?.();
      }
      await gate;
      return { ok: true, output: { id: request.tool_call_id } };
    });

    const batchHost = engine as unknown as {
      handleExecuteTools(params: unknown): Promise<{ results: Array<{ output?: { id?: string } }> }>;
    };
    const response = await batchHost.handleExecuteTools({
      session_id: "session",
      turn_id: "turn",
      tool_calls: [
        { tool_call_id: "first", tool_name: "Read", input: { path: "a" } },
        { tool_call_id: "second", tool_name: "Search", input: { path: ".", pattern: "x" } }
      ]
    });

    expect(started).toEqual(["first", "second"]);
    expect(response.results.map((result) => result.output?.id)).toEqual(["first", "second"]);
  });

  it("isolates thrown host executor failures within a tool batch", async () => {
    const engine = new GodCodeEngineProcess();
    engine.setToolExecutor(async (request) => {
      if (request.tool_call_id === "failed") {
        throw new Error("executor exploded");
      }
      return { ok: true, output: { id: request.tool_call_id } };
    });

    const batchHost = engine as unknown as {
      handleExecuteTools(params: unknown): Promise<{
        results: Array<{ ok: boolean; output?: { id?: string }; error?: { code?: string; message?: string } }>;
      }>;
    };
    const response = await batchHost.handleExecuteTools({
      session_id: "session",
      turn_id: "turn",
      tool_calls: [
        { tool_call_id: "first", tool_name: "Read", input: { path: "a" } },
        { tool_call_id: "failed", tool_name: "Search", input: { path: ".", pattern: "x" } },
        { tool_call_id: "last", tool_name: "Read", input: { path: "b" } }
      ]
    });

    expect(response.results).toEqual([
      { ok: true, output: { id: "first" } },
      { ok: false, error: { code: "tool_executor_failed", message: "executor exploded" } },
      { ok: true, output: { id: "last" } }
    ]);
  });

  it("isolates malformed executor results and validates serial results", async () => {
    const engine = new GodCodeEngineProcess();
    engine.setToolExecutor(async () => ({ ok: true, output: [] } as never));
    const handlers = engine as unknown as {
      handleExecuteTool(params: unknown): Promise<unknown>;
      handleExecuteTools(params: unknown): Promise<{
        results: Array<{ ok: boolean; error?: { code?: string; message?: string } }>;
      }>;
    };

    await expect(handlers.handleExecuteTool({
      session_id: "session",
      turn_id: "turn",
      tool_call_id: "serial",
      tool_name: "Read",
      input: { path: "a" }
    })).rejects.toThrow("Invalid tool execution result payload");

    const response = await handlers.handleExecuteTools({
      session_id: "session",
      turn_id: "turn",
      tool_calls: [{ tool_call_id: "batch", tool_name: "Read", input: { path: "a" } }]
    });
    expect(response.results).toEqual([{
      ok: false,
      error: {
        code: "tool_executor_failed",
        message: "Invalid tool execution result payload."
      }
    }]);
  });

  it("scopes tool cancellation and cleanup by session plus turn id", async () => {
    const engine = new GodCodeEngineProcess();
    const internals = engine as unknown as {
      getTurnAbortController(sessionId: string, turnId: string): AbortController;
      handleCancelToolExecution(params: unknown): void;
      handleGodCodeEvent(params: unknown): void;
      turnAbortControllers: Map<string, AbortController>;
    };
    const first = internals.getTurnAbortController("session-a", "shared-turn");
    const second = internals.getTurnAbortController("session-b", "shared-turn");

    internals.handleCancelToolExecution({ session_id: "session-a", turn_id: "shared-turn" });
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);

    internals.handleGodCodeEvent({
      event_type: "turn_finished",
      session_id: "session-a",
      turn_id: "shared-turn",
      sequence: 1,
      payload: { status: "cancelled" }
    });
    expect(internals.turnAbortControllers.size).toBe(1);
    expect(internals.getTurnAbortController("session-b", "shared-turn")).toBe(second);

    expect(() => internals.handleCancelToolExecution({ turn_id: "shared-turn" }))
      .toThrow("Invalid cancel_tool_execution payload");
    expect(() => internals.handleCancelToolExecution({
      session_id: "session-b",
      turn_id: "shared-turn",
      extension: { value: undefined }
    })).toThrow("Invalid cancel_tool_execution payload");
    expect(second.signal.aborted).toBe(false);
  });

  it("preserves cancellation that arrives before tool dispatch", async () => {
    const engine = new GodCodeEngineProcess();
    let executions = 0;
    engine.setToolExecutor(async () => {
      executions += 1;
      return { ok: true, output: {} };
    });
    const internals = engine as unknown as {
      getTurnAbortController(sessionId: string, turnId: string): AbortController;
      handleCancelToolExecution(params: unknown): void;
      handleExecuteTool(params: unknown): Promise<{ ok: boolean; error?: { code?: string } }>;
      handleExecuteTools(params: unknown): Promise<{
        results: Array<{ ok: boolean; error?: { code?: string } }>;
      }>;
    };

    internals.handleCancelToolExecution({ session_id: "session", turn_id: "turn" });
    expect(internals.getTurnAbortController("session", "turn").signal.aborted).toBe(true);

    const serial = await internals.handleExecuteTool({
      session_id: "session",
      turn_id: "turn",
      sequence: 1,
      tool_call_id: "serial",
      tool_name: "Read",
      input: { path: "a" }
    });
    const batch = await internals.handleExecuteTools({
      session_id: "session",
      turn_id: "turn",
      sequence: 1,
      tool_calls: [
        { tool_call_id: "first", tool_name: "Read", input: { path: "a" } },
        { tool_call_id: "second", tool_name: "Read", input: { path: "b" } }
      ]
    });

    expect(serial.error?.code).toBe("tool_cancelled");
    expect(batch.results.map((result) => result.error?.code)).toEqual([
      "tool_cancelled",
      "tool_cancelled"
    ]);
    expect(executions).toBe(0);
  });

  it("stops dispatching later batch slots when cancellation occurs mid-dispatch", async () => {
    const engine = new GodCodeEngineProcess();
    const executed: string[] = [];
    const internals = engine as unknown as {
      handleCancelToolExecution(params: unknown): void;
      handleExecuteTools(params: unknown): Promise<{
        results: Array<{ ok: boolean; error?: { code?: string }; output?: { id?: string } }>;
      }>;
    };
    engine.setToolExecutor(async (request) => {
      executed.push(request.tool_call_id);
      if (request.tool_call_id === "first") {
        internals.handleCancelToolExecution({
          session_id: request.session_id,
          turn_id: request.turn_id
        });
      }
      return { ok: true, output: { id: request.tool_call_id } };
    });

    const response = await internals.handleExecuteTools({
      session_id: "session",
      turn_id: "turn",
      tool_calls: [
        { tool_call_id: "first", tool_name: "Read", input: { path: "a" } },
        { tool_call_id: "second", tool_name: "Read", input: { path: "b" } },
        { tool_call_id: "third", tool_name: "Read", input: { path: "c" } }
      ]
    });

    expect(executed).toEqual(["first"]);
    expect(response.results.map((result) => result.error?.code)).toEqual([
      "tool_cancelled",
      "tool_cancelled",
      "tool_cancelled"
    ]);
  });

  it("gives cancellation precedence over late single and batch executor results", async () => {
    const engine = new GodCodeEngineProcess();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    engine.setToolExecutor(async (request) => {
      started += 1;
      await gate;
      return { ok: true, output: { id: request.tool_call_id } };
    });
    const internals = engine as unknown as {
      handleCancelToolExecution(params: unknown): void;
      handleExecuteTool(params: unknown): Promise<{ error?: { code?: string } }>;
      handleExecuteTools(params: unknown): Promise<{
        results: Array<{ error?: { code?: string } }>;
      }>;
    };

    const serialPromise = internals.handleExecuteTool({
      session_id: "serial-session",
      turn_id: "turn",
      tool_call_id: "serial",
      tool_name: "Read",
      input: { path: "a" }
    });
    const batchPromise = internals.handleExecuteTools({
      session_id: "batch-session",
      turn_id: "turn",
      tool_calls: [
        { tool_call_id: "first", tool_name: "Read", input: { path: "a" } },
        { tool_call_id: "second", tool_name: "Read", input: { path: "b" } }
      ]
    });
    expect(started).toBe(3);

    internals.handleCancelToolExecution({ session_id: "serial-session", turn_id: "turn" });
    internals.handleCancelToolExecution({ session_id: "batch-session", turn_id: "turn" });
    release?.();

    const serial = await serialPromise;
    const batch = await batchPromise;
    expect(serial.error?.code).toBe("tool_cancelled");
    expect(batch.results.map((result) => result.error?.code)).toEqual([
      "tool_cancelled",
      "tool_cancelled"
    ]);
  });

  it("defers turn controller cleanup until in-flight Host requests settle", async () => {
    const engine = new GodCodeEngineProcess();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    engine.setToolExecutor(async () => {
      await gate;
      return { ok: true, output: {} };
    });
    const internals = engine as unknown as {
      handleExecuteTool(params: unknown): Promise<{ error?: { code?: string } }>;
      handleGodCodeEvent(params: unknown): void;
      turnAbortControllers: Map<string, AbortController>;
      turnInFlightRequests: Map<string, number>;
      finishedTurnKeys: Set<string>;
    };

    const resultPromise = internals.handleExecuteTool({
      session_id: "session",
      turn_id: "turn",
      tool_call_id: "call",
      tool_name: "Read",
      input: { path: "a" }
    });
    expect(internals.turnInFlightRequests.size).toBe(1);

    internals.handleGodCodeEvent({
      event_type: "turn_finished",
      session_id: "session",
      turn_id: "turn",
      sequence: 1,
      payload: { status: "cancelled" }
    });
    expect(internals.turnAbortControllers.size).toBe(1);
    expect(internals.finishedTurnKeys.size).toBe(1);

    release?.();
    const result = await resultPromise;
    expect(result.error?.code).toBe("tool_cancelled");
    expect(internals.turnAbortControllers.size).toBe(0);
    expect(internals.turnInFlightRequests.size).toBe(0);
    expect(internals.finishedTurnKeys.size).toBe(0);
  });

  it("removes a pre-cancel tombstone when Engine reports turn not found", async () => {
    const engine = new GodCodeEngineProcess();
    const internals = engine as unknown as {
      peer: { isClosed(): boolean; request<T>(method: string, params: unknown): Promise<T> };
      turnAbortControllers: Map<string, AbortController>;
      initialized: boolean;
    };
    internals.initialized = true;
    internals.peer = {
      isClosed: () => false,
      request: async <T>() => ({
        session_id: "session",
        turn_id: "missing",
        status: "not_found"
      } as T)
    };

    const response = await engine.cancelTurn({ session_id: "session", turn_id: "missing" });
    expect(response.status).toBe("not_found");
    expect(internals.turnAbortControllers.size).toBe(0);
  });

  it("defers not-found cleanup while a Host request is still in flight", async () => {
    const engine = new GodCodeEngineProcess();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    engine.setToolExecutor(async () => {
      await gate;
      return { ok: true, output: {} };
    });
    const internals = engine as unknown as {
      peer: { isClosed(): boolean; request<T>(method: string, params: unknown): Promise<T> };
      handleExecuteTool(params: unknown): Promise<{ error?: { code?: string } }>;
      turnAbortControllers: Map<string, AbortController>;
      finishedTurnKeys: Set<string>;
      initialized: boolean;
    };
    internals.initialized = true;
    internals.peer = {
      isClosed: () => false,
      request: async <T>() => ({
        session_id: "session",
        turn_id: "turn",
        status: "not_found"
      } as T)
    };

    const resultPromise = internals.handleExecuteTool({
      session_id: "session",
      turn_id: "turn",
      tool_call_id: "call",
      tool_name: "Read",
      input: { path: "a" }
    });
    const cancel = await engine.cancelTurn({ session_id: "session", turn_id: "turn" });
    expect(cancel.status).toBe("not_found");
    expect(internals.turnAbortControllers.size).toBe(1);
    expect(internals.finishedTurnKeys.size).toBe(1);

    release?.();
    const result = await resultPromise;
    expect(result.error?.code).toBe("tool_cancelled");
    expect(internals.turnAbortControllers.size).toBe(0);
    expect(internals.finishedTurnKeys.size).toBe(0);
  });

  it("ignores late cancellation and rejects late tools for a finalized turn", async () => {
    const engine = new GodCodeEngineProcess();
    let executions = 0;
    engine.setToolExecutor(async () => {
      executions += 1;
      return { ok: true, output: {} };
    });
    const internals = engine as unknown as {
      handleGodCodeEvent(params: unknown): void;
      handleCancelToolExecution(params: unknown): void;
      handleExecuteTool(params: unknown): Promise<{ error?: { code?: string } }>;
      turnAbortControllers: Map<string, AbortController>;
      finalizedTurnKeys: Map<string, true>;
    };

    internals.handleGodCodeEvent({
      event_type: "turn_finished",
      session_id: "session",
      turn_id: "turn",
      sequence: 1,
      payload: {
        status: "success",
        assistant_message: { role: "assistant", content: "done" }
      }
    });
    expect(internals.finalizedTurnKeys.size).toBe(1);
    expect(internals.turnAbortControllers.size).toBe(0);

    internals.handleCancelToolExecution({ session_id: "session", turn_id: "turn" });
    expect(internals.turnAbortControllers.size).toBe(0);

    const late = await internals.handleExecuteTool({
      session_id: "session",
      turn_id: "turn",
      tool_call_id: "late",
      tool_name: "Read",
      input: { path: "a" }
    });
    expect(late.error?.code).toBe("tool_cancelled");
    expect(executions).toBe(0);
    expect(internals.turnAbortControllers.size).toBe(0);
  });

  it("rejects malformed Engine events before lifecycle mutation or emission", () => {
    const engine = new GodCodeEngineProcess();
    let emitted = 0;
    engine.on("god_code_event", () => {
      emitted += 1;
    });
    const internals = engine as unknown as {
      handleGodCodeEvent(params: unknown): void;
      finalizedTurnKeys: Map<string, true>;
    };

    expect(() => internals.handleGodCodeEvent({
      event_type: "turn_finished",
      session_id: "session",
      turn_id: " ",
      sequence: 1,
      payload: { status: "success" }
    })).toThrow("Invalid god_code_event payload");
    expect(() => internals.handleGodCodeEvent({
      event_type: "turn_finished",
      session_id: "session",
      turn_id: "turn",
      sequence: 1,
      payload: { value: undefined }
    })).toThrow("Invalid god_code_event payload");
    expect(() => internals.handleGodCodeEvent({
      event_type: "turn_finished",
      session_id: "session",
      turn_id: "turn",
      sequence: 1,
      payload: { status: "success" }
    })).toThrow("Invalid god_code_event payload");
    expect(emitted).toBe(0);
    expect(internals.finalizedTurnKeys.size).toBe(0);
  });

  it("suppresses late and duplicate events after a turn is finalized", () => {
    const engine = new GodCodeEngineProcess();
    const emitted: GodCodeEventEnvelope[] = [];
    engine.on("god_code_event", (event) => {
      emitted.push(event);
    });
    const internals = engine as unknown as {
      handleGodCodeEvent(params: unknown): void;
      finalizedTurnKeys: Map<string, true>;
    };

    internals.handleGodCodeEvent({
      event_type: "turn_finished",
      session_id: "session-a",
      turn_id: "turn",
      sequence: 1,
      payload: { status: "cancelled" }
    });
    internals.handleGodCodeEvent({
      event_type: "assistant_delta",
      session_id: "session-a",
      turn_id: "turn",
      sequence: 2,
      payload: { delta: { text: "late" } }
    });
    internals.handleGodCodeEvent({
      event_type: "god_code_error",
      session_id: "session-a",
      turn_id: "turn",
      sequence: 3,
      payload: { error: { code: "late", message: "late" } }
    });
    internals.handleGodCodeEvent({
      event_type: "turn_finished",
      session_id: "session-a",
      turn_id: "turn",
      sequence: 4,
      payload: { status: "cancelled" }
    });
    internals.handleGodCodeEvent({
      event_type: "assistant_delta",
      session_id: "session-b",
      turn_id: "turn",
      sequence: 1,
      payload: { delta: { text: "other session" } }
    });
    internals.handleGodCodeEvent({
      event_type: "session_started",
      session_id: "session-c",
      sequence: 0,
      payload: { cwd: "/workspace", model_adapter: "fake" }
    });

    expect(emitted.map((event) => [event.event_type, event.session_id])).toEqual([
      ["turn_finished", "session-a"],
      ["assistant_delta", "session-b"],
      ["session_started", "session-c"]
    ]);
    expect(internals.finalizedTurnKeys.size).toBe(1);
  });

  it("suppresses duplicate and regressing sequences for an active turn", () => {
    const engine = new GodCodeEngineProcess();
    const emitted: GodCodeEventEnvelope[] = [];
    engine.on("god_code_event", (event) => {
      emitted.push(event);
    });
    const internals = engine as unknown as {
      handleGodCodeEvent(params: unknown): void;
      turnEventSequences: Map<string, number>;
    };

    for (const [sequence, text] of [[2, "first"], [1, "regressing"], [2, "duplicate"], [3, "next"]] as const) {
      internals.handleGodCodeEvent({
        event_type: "assistant_delta",
        session_id: "session",
        turn_id: "turn",
        sequence,
        payload: { delta: { text } }
      });
    }

    expect(emitted.map((event) => event.sequence)).toEqual([2, 3]);
    expect(internals.turnEventSequences.size).toBe(1);
    internals.handleGodCodeEvent({
      event_type: "turn_finished",
      session_id: "session",
      turn_id: "turn",
      sequence: 4,
      payload: { status: "cancelled" }
    });
    expect(emitted.map((event) => event.sequence)).toEqual([2, 3, 4]);
    expect(internals.turnEventSequences.size).toBe(0);
  });

  it("rejects malformed or empty host tool batches", async () => {
    const engine = new GodCodeEngineProcess();
    engine.setToolExecutor(async () => ({ ok: true, output: {} }));
    const batchHost = engine as unknown as {
      handleExecuteTools(params: unknown): Promise<unknown>;
    };

    await expect(batchHost.handleExecuteTools({ session_id: "s", turn_id: "t", tool_calls: [] }))
      .rejects.toThrow("Invalid execute_tools request payload");
    await expect(batchHost.handleExecuteTools({
      session_id: "s",
      turn_id: "t",
      tool_calls: [{ tool_call_id: "id", tool_name: "Read", input: [] }]
    })).rejects.toThrow("Invalid execute_tools request payload");
    await expect(batchHost.handleExecuteTools({
      session_id: "s",
      turn_id: "t",
      tool_calls: Array.from({ length: 5 }, (_, index) => ({
        tool_call_id: `id-${index}`,
        tool_name: "Read",
        input: { path: `${index}` }
      }))
    })).rejects.toThrow("Invalid execute_tools request payload");
    await expect(batchHost.handleExecuteTools({
      session_id: "s",
      turn_id: "t",
      tool_calls: [
        { tool_call_id: "duplicate", tool_name: "Read", input: { path: "a" } },
        { tool_call_id: "duplicate", tool_name: "Read", input: { path: "b" } }
      ]
    })).rejects.toThrow("Invalid execute_tools request payload");
    await expect(batchHost.handleExecuteTools({
      session_id: "s",
      turn_id: "t",
      tool_calls: [{ tool_call_id: "", tool_name: "Read", input: { path: "a" } }]
    })).rejects.toThrow("Invalid execute_tools request payload");
    await expect(batchHost.handleExecuteTools({
      session_id: "",
      turn_id: "t",
      tool_calls: [{ tool_call_id: "id", tool_name: "Read", input: { path: "a" } }]
    })).rejects.toThrow("Invalid execute_tools request payload");
    await expect(batchHost.handleExecuteTools({
      session_id: "s",
      turn_id: "   ",
      tool_calls: [{ tool_call_id: "id", tool_name: "Read", input: { path: "a" } }]
    })).rejects.toThrow("Invalid execute_tools request payload");
    await expect(batchHost.handleExecuteTools({
      session_id: "s",
      turn_id: "t",
      tool_calls: [{ tool_call_id: "\t", tool_name: "Read", input: { path: "a" } }]
    })).rejects.toThrow("Invalid execute_tools request payload");
    await expect(batchHost.handleExecuteTools({
      session_id: "s",
      turn_id: "t",
      tool_calls: [{ tool_call_id: "id", tool_name: "Read", input: { path: undefined } }]
    })).rejects.toThrow("Invalid execute_tools request payload");

    const cyclicInput: Record<string, unknown> = {};
    cyclicInput.self = cyclicInput;
    await expect(batchHost.handleExecuteTools({
      session_id: "s",
      turn_id: "t",
      tool_calls: [{ tool_call_id: "id", tool_name: "Read", input: cyclicInput }]
    })).rejects.toThrow("Invalid execute_tools request payload");
  });

  it("emits exit when the child process dies", async () => {
    const engine = new GodCodeEngineProcess();
    try {
      await engine.start();
      const exitPromise = once(engine, "exit");
      const child = (engine as unknown as { child: { kill: (signal?: string) => void } }).child;
      child.kill("SIGTERM");
      const [info] = await exitPromise;
      expect(info).toBeTruthy();
    } finally {
      await engine.stop();
    }
  });
});
