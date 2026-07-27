import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GodCodeReplSession, runGodCodeRepl } from "../src/cli/repl.js";
import { GodCodeEngineProcess } from "../src/ipc/godCodeEngineProcess.js";
import { PluginSkillRuntime } from "../src/plugins/runtime.js";
import type { TurnRenderer } from "../src/rendering/terminalRenderer.js";
import type {
  GodCodeEventEnvelope,
  InitializeResponse
} from "../src/types/godCodeProtocol.js";

const tempDirs: string[] = [];
const hostConfigEnvKeys = [
  "GOD_CODE_MCP_SERVERS",
  "GOD_CODE_MCP_CONFIG_FILE",
  "GOD_CODE_MCP_CONTEXT",
  "GOD_CODE_MCP_CONTEXT_FILE",
  "GOD_CODE_PLUGIN_DIRS",
  "GOD_CODE_PLUGIN_CONFIG_FILE",
  "GOD_CODE_PLUGIN_ENABLED_IDS",
  "GOD_CODE_PLUGIN_REGISTRY_FILE"
] as const;

afterEach(async () => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe("REPL lifecycle finalization", () => {
  it("preserves a start primary while cleanup resources settle concurrently", async () => {
    const pluginDir = await createPluginDir("repl-start-primary");
    const previous = configurePluginEnvironment(pluginDir);
    const startPrimary = new Error("injected REPL start primary");
    const stopSecondary = new Error("injected REPL stop secondary");
    const pluginGate = createDeferred<void>();
    const pluginCloseStarted = createDeferred<void>();
    const engineStopStarted = createDeferred<void>();
    const originalPluginClose = PluginSkillRuntime.prototype.close;
    const pluginClose = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(
      async function (this: PluginSkillRuntime): Promise<void> {
        pluginCloseStarted.resolve();
        await pluginGate.promise;
        await originalPluginClose.call(this);
      }
    );
    let observedEngine: GodCodeEngineProcess | undefined;
    vi.spyOn(GodCodeEngineProcess.prototype, "start").mockImplementation(
      async function (this: GodCodeEngineProcess): Promise<void> {
        observedEngine = this;
        throw startPrimary;
      }
    );
    const stop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockImplementation(
      async function (): Promise<void> {
        engineStopStarted.resolve();
        throw stopSecondary;
      }
    );
    const renderer = createRenderer();
    const session = new GodCodeReplSession(process.cwd(), { renderer });
    const startPromise = session.start().then(
      () => undefined,
      (error: unknown) => error
    );

    try {
      expect(await observesSettlementWithin(pluginCloseStarted.promise, 500)).toBe(true);
      expect(await observesSettlementWithin(engineStopStarted.promise, 500)).toBe(true);
      expect(await observesSettlementWithin(startPromise, 25)).toBe(false);

      pluginGate.resolve();
      const failure = await startPromise;

      expect(failure).toBe(startPrimary);
      expect(JSON.stringify(failure)).not.toContain(stopSecondary.message);
      expect(session.getStatus()).toBe("stopped");
      expect(pluginClose).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(renderer.finish).toHaveBeenCalledTimes(1);
      expect(observedEngine?.listenerCount("god_code_event")).toBe(0);
      expect(observedEngine?.listenerCount("exit")).toBe(0);
    } finally {
      pluginGate.resolve();
      await startPromise;
      restoreHostEnvironment(previous);
    }
  });

  it("memoizes concurrent start and stop while allowing a new generation after normal stop", async () => {
    const pluginDir = await createPluginDir("repl-generation");
    const previous = configurePluginEnvironment(pluginDir);
    const firstStartGate = createDeferred<void>();
    let startCalls = 0;
    const start = vi.spyOn(GodCodeEngineProcess.prototype, "start").mockImplementation(
      async function (): Promise<void> {
        startCalls += 1;
        if (startCalls === 1) {
          await firstStartGate.promise;
        }
      }
    );
    const initialize = vi.spyOn(GodCodeEngineProcess.prototype, "initialize").mockResolvedValue(
      {} as InitializeResponse
    );
    const createSession = vi.spyOn(GodCodeEngineProcess.prototype, "createSession").mockImplementation(
      async (request) => ({ session_id: request.session_id, status: "created" })
    );
    const stop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockResolvedValue();
    const originalPluginClose = PluginSkillRuntime.prototype.close;
    const pluginClose = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(
      async function (this: PluginSkillRuntime): Promise<void> {
        await originalPluginClose.call(this);
      }
    );
    const renderer = createRenderer();
    const session = new GodCodeReplSession(process.cwd(), { renderer });
    let firstStart: Promise<void> | undefined;
    let secondStart: Promise<void> | undefined;

    try {
      firstStart = session.start();
      secondStart = session.start();
      expect(secondStart).toBe(firstStart);
      expect(await observesSettlementWithin(firstStart, 25)).toBe(false);
      expect(start).toHaveBeenCalledTimes(1);

      firstStartGate.resolve();
      await Promise.all([firstStart, secondStart]);
      expect(session.getStatus()).toBe("idle");
      expect(initialize).toHaveBeenCalledTimes(1);
      expect(createSession).toHaveBeenCalledTimes(1);

      const firstStop = session.stop();
      const secondStop = session.stop();
      expect(secondStop).toBe(firstStop);
      await Promise.all([firstStop, secondStop]);
      expect(session.stop()).toBe(firstStop);

      const restart = session.start();
      expect(restart).not.toBe(firstStart);
      await restart;
      expect(session.getStatus()).toBe("idle");
      expect(start).toHaveBeenCalledTimes(2);
      expect(initialize).toHaveBeenCalledTimes(2);
      expect(createSession).toHaveBeenCalledTimes(2);

      const finalStop = session.stop();
      expect(finalStop).not.toBe(firstStop);
      await finalStop;
      expect(pluginClose).toHaveBeenCalledTimes(2);
      expect(stop).toHaveBeenCalledTimes(2);
      expect(renderer.finish).toHaveBeenCalledTimes(2);
    } finally {
      firstStartGate.resolve();
      await Promise.allSettled([
        ...(firstStart === undefined ? [] : [firstStart]),
        ...(secondStart === undefined ? [] : [secondStart])
      ]);
      await session.stop().catch(() => undefined);
      restoreHostEnvironment(previous);
    }
  });

  it("settles an active turn and stop without waiting for late cancellation", async () => {
    const pluginDir = await createPluginDir("repl-active-stop");
    const previous = configurePluginEnvironment(pluginDir);
    mockSuccessfulReplStart();
    vi.spyOn(GodCodeEngineProcess.prototype, "submitTurn").mockImplementation(
      async (request) => ({
        session_id: request.session_id,
        turn_id: "pending-turn",
        status: "accepted"
      })
    );
    const pendingCancel = createDeferred<never>();
    const cancelTurn = vi.spyOn(GodCodeEngineProcess.prototype, "cancelTurn").mockImplementation(
      async () => await pendingCancel.promise
    );
    const engineStop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockResolvedValue();
    const originalPluginClose = PluginSkillRuntime.prototype.close;
    const pluginClose = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(
      async function (this: PluginSkillRuntime): Promise<void> {
        await originalPluginClose.call(this);
      }
    );
    const renderer = createRenderer();
    const session = new GodCodeReplSession(process.cwd(), { renderer });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      await session.start();
      const turnFailure = session.submit("pending").then(
        () => undefined,
        (error: unknown) => error
      );
      await waitForCondition(() => session.getStatus() === "running");

      const firstStop = session.stop();
      const secondStop = session.stop();
      expect(secondStop).toBe(firstStop);
      expect(await observesSettlementWithin(firstStop, 500)).toBe(true);
      expect(session.stop()).toBe(firstStop);

      const failure = await turnFailure;
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe(
        "GOD-code REPL session stopped during an active turn."
      );
      expect(session.getStatus()).toBe("stopped");
      expect(cancelTurn).toHaveBeenCalledTimes(1);
      expect(pluginClose).toHaveBeenCalledTimes(1);
      expect(engineStop).toHaveBeenCalledTimes(1);
      expect(renderer.finish).toHaveBeenCalledTimes(1);

      pendingCancel.reject(new Error("late REPL cancellation rejection"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      pendingCancel.reject(new Error("final REPL cancellation release"));
      process.off("unhandledRejection", onUnhandled);
      await session.stop().catch(() => undefined);
      restoreHostEnvironment(previous);
    }
  });

  it("preserves a submit primary across renderer finalization failure", async () => {
    const pluginDir = await createPluginDir("repl-submit-primary");
    const previous = configurePluginEnvironment(pluginDir);
    mockSuccessfulReplStart();
    const submitPrimary = new Error("injected REPL submit primary");
    vi.spyOn(GodCodeEngineProcess.prototype, "submitTurn").mockRejectedValue(submitPrimary);
    const engineStop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockResolvedValue();
    const originalPluginClose = PluginSkillRuntime.prototype.close;
    const pluginClose = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(
      async function (this: PluginSkillRuntime): Promise<void> {
        await originalPluginClose.call(this);
      }
    );
    const rendererFailure = new Error("injected REPL renderer failure");
    const renderer = createRenderer(() => {
      throw rendererFailure;
    });
    const session = new GodCodeReplSession(process.cwd(), { renderer });

    try {
      await session.start();
      const failure = await session.submit("fails").then(
        () => undefined,
        (error: unknown) => error
      );

      expect(failure).toBe(submitPrimary);
      expect(session.getStatus()).toBe("idle");
      await expect(session.stop()).rejects.toBe(rendererFailure);
      await expect(session.start()).rejects.toBe(rendererFailure);
      expect(pluginClose).toHaveBeenCalledTimes(1);
      expect(engineStop).toHaveBeenCalledTimes(1);
    } finally {
      await session.stop().catch(() => undefined);
      restoreHostEnvironment(previous);
    }
  });

  it("returns a turn-finished renderer failure without leaving the turn active", async () => {
    const pluginDir = await createPluginDir("repl-turn-finished-renderer");
    const previous = configurePluginEnvironment(pluginDir);
    mockSuccessfulReplStart();
    vi.spyOn(GodCodeEngineProcess.prototype, "submitTurn").mockImplementation(
      async function (this: GodCodeEngineProcess, request) {
        const event: GodCodeEventEnvelope = {
          event_type: "turn_finished",
          session_id: request.session_id,
          turn_id: "renderer-failure-turn",
          sequence: 1,
          payload: {
            status: "success",
            assistant_message: { role: "assistant", content: "done" }
          }
        };
        queueMicrotask(() => this.emit("god_code_event", event));
        return {
          session_id: request.session_id,
          turn_id: "renderer-failure-turn",
          status: "accepted"
        };
      }
    );
    const engineStop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockResolvedValue();
    const originalPluginClose = PluginSkillRuntime.prototype.close;
    const pluginClose = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(
      async function (this: PluginSkillRuntime): Promise<void> {
        await originalPluginClose.call(this);
      }
    );
    const rendererFailure = new Error("injected turn-finished renderer failure");
    const renderer = createRenderer(() => {
      throw rendererFailure;
    });
    const session = new GodCodeReplSession(process.cwd(), { renderer });

    try {
      await session.start();
      await expect(session.submit("renderer failure")).rejects.toBe(rendererFailure);
      expect(session.getStatus()).toBe("idle");
      await expect(session.stop()).rejects.toBe(rendererFailure);
      expect(renderer.finish).toHaveBeenCalledTimes(2);
      expect(pluginClose).toHaveBeenCalledTimes(1);
      expect(engineStop).toHaveBeenCalledTimes(1);
    } finally {
      await session.stop().catch(() => undefined);
      restoreHostEnvironment(previous);
    }
  });

  it("preserves an engine-exit turn primary and leaves host cleanup for stop", async () => {
    const pluginDir = await createPluginDir("repl-engine-exit");
    const previous = configurePluginEnvironment(pluginDir);
    let observedEngine: GodCodeEngineProcess | undefined;
    vi.spyOn(GodCodeEngineProcess.prototype, "start").mockImplementation(
      async function (this: GodCodeEngineProcess): Promise<void> {
        observedEngine = this;
      }
    );
    vi.spyOn(GodCodeEngineProcess.prototype, "initialize").mockResolvedValue(
      {} as InitializeResponse
    );
    vi.spyOn(GodCodeEngineProcess.prototype, "createSession").mockImplementation(
      async (request) => ({ session_id: request.session_id, status: "created" })
    );
    vi.spyOn(GodCodeEngineProcess.prototype, "submitTurn").mockImplementation(
      async (request) => ({
        session_id: request.session_id,
        turn_id: "engine-exit-turn",
        status: "accepted"
      })
    );
    const engineStop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockResolvedValue();
    const originalPluginClose = PluginSkillRuntime.prototype.close;
    const pluginClose = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(
      async function (this: PluginSkillRuntime): Promise<void> {
        await originalPluginClose.call(this);
      }
    );
    const rendererFailure = new Error("injected engine-exit renderer secondary");
    const renderer = createRenderer(() => {
      throw rendererFailure;
    });
    const session = new GodCodeReplSession(process.cwd(), { renderer });

    try {
      await session.start();
      const turnFailure = session.submit("pending exit").then(
        () => undefined,
        (error: unknown) => error
      );
      await waitForCondition(() => session.getStatus() === "running");
      observedEngine?.emit("exit", {
        code: 17,
        signal: null,
        stderr: "synthetic engine exit"
      });

      const failure = await turnFailure;
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain("synthetic engine exit");
      expect(failure).not.toBe(rendererFailure);
      expect(session.getStatus()).toBe("stopped");
      expect(observedEngine?.listenerCount("god_code_event")).toBe(0);
      expect(observedEngine?.listenerCount("exit")).toBe(0);

      await expect(session.stop()).rejects.toBe(rendererFailure);
      expect(renderer.finish).toHaveBeenCalledTimes(2);
      expect(pluginClose).toHaveBeenCalledTimes(1);
      expect(engineStop).toHaveBeenCalledTimes(1);
    } finally {
      await session.stop().catch(() => undefined);
      restoreHostEnvironment(previous);
    }
  });

  it("preserves the outer REPL primary while closing readline and all resources", async () => {
    const pluginDir = await createPluginDir("repl-outer-primary");
    const previous = configurePluginEnvironment(pluginDir);
    const startPrimary = new Error("injected outer REPL start primary");
    const rendererSecondary = new Error("injected outer REPL renderer secondary");
    vi.spyOn(GodCodeEngineProcess.prototype, "start").mockRejectedValue(startPrimary);
    const engineStop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockRejectedValue(
      new Error("injected outer REPL engine secondary")
    );
    const originalPluginClose = PluginSkillRuntime.prototype.close;
    const pluginClose = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(
      async function (this: PluginSkillRuntime): Promise<void> {
        await originalPluginClose.call(this);
      }
    );
    const renderer = createRenderer(() => {
      throw rendererSecondary;
    });
    const input = new PassThrough();

    try {
      const failure = await runGodCodeRepl(process.cwd(), { input, renderer }).then(
        () => undefined,
        (error: unknown) => error
      );

      expect(failure).toBe(startPrimary);
      expect(pluginClose).toHaveBeenCalledTimes(1);
      expect(engineStop).toHaveBeenCalledTimes(1);
      expect(input.listenerCount("data")).toBe(0);
    } finally {
      input.end();
      restoreHostEnvironment(previous);
    }
  });
});

function mockSuccessfulReplStart(): void {
  vi.spyOn(GodCodeEngineProcess.prototype, "start").mockResolvedValue();
  vi.spyOn(GodCodeEngineProcess.prototype, "initialize").mockResolvedValue(
    {} as InitializeResponse
  );
  vi.spyOn(GodCodeEngineProcess.prototype, "createSession").mockImplementation(
    async (request) => ({ session_id: request.session_id, status: "created" })
  );
}

function createRenderer(finish: () => void = () => undefined): TurnRenderer & {
  finish: ReturnType<typeof vi.fn>;
} {
  return {
    onAssistantDelta: vi.fn(),
    onAssistantMessage: vi.fn(),
    onToolCallRequested: vi.fn(),
    finish: vi.fn(finish)
  };
}

async function createPluginDir(id: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-repl-lifecycle-"));
  tempDirs.push(dir);
  await fs.writeFile(
    path.join(dir, "plugin.json"),
    JSON.stringify({ id, name: `Plugin ${id}`, version: "0.1.0" }),
    "utf8"
  );
  return dir;
}

function configurePluginEnvironment(pluginDir: string): Record<string, string | undefined> {
  const previous = Object.fromEntries(
    hostConfigEnvKeys.map((key) => [key, process.env[key]])
  ) as Record<string, string | undefined>;
  for (const key of hostConfigEnvKeys) {
    delete process.env[key];
  }
  process.env.GOD_CODE_PLUGIN_DIRS = JSON.stringify([pluginDir]);
  return previous;
}

function restoreHostEnvironment(previous: Record<string, string | undefined>): void {
  for (const key of hostConfigEnvKeys) {
    const value = previous[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
} {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function observesSettlementWithin(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(true);
      }
    );
  });
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for REPL lifecycle condition.");
}
