import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runGodCodeRpcSmoke, runGodCodeSession } from "../src/headless/godCodeRunSession.js";
import { GodCodeEngineProcess } from "../src/ipc/godCodeEngineProcess.js";
import { PluginSkillRuntime } from "../src/plugins/runtime.js";
import type { TurnRenderer } from "../src/rendering/terminalRenderer.js";
import type {
  GodCodeEventEnvelope,
  InitializeResponse,
  SubmitTurnRequest
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

describe("headless composite finalization", () => {
  it("preserves a run primary while host and engine cleanup settle concurrently", async () => {
    const pluginDir = await createPluginDir("headless-primary");
    const previous = configurePluginEnvironment(pluginDir);
    const startPrimary = new Error("injected headless start primary");
    const stopSecondary = new Error("injected headless stop secondary");
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
    const start = vi.spyOn(GodCodeEngineProcess.prototype, "start").mockRejectedValue(startPrimary);
    const stop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockImplementation(
      async function (): Promise<void> {
        engineStopStarted.resolve();
        throw stopSecondary;
      }
    );
    const renderer = createRenderer();
    const runPromise = runGodCodeSession("ignored", process.cwd(), { renderer }).then(
      () => undefined,
      (error: unknown) => error
    );

    try {
      expect(await observesSettlementWithin(pluginCloseStarted.promise, 500)).toBe(true);
      expect(await observesSettlementWithin(engineStopStarted.promise, 500)).toBe(true);
      expect(await observesSettlementWithin(runPromise, 25)).toBe(false);

      pluginGate.resolve();
      const failure = await runPromise;

      expect(failure).toBe(startPrimary);
      expect(JSON.stringify(failure)).not.toContain(stopSecondary.message);
      expect(start).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(pluginClose).toHaveBeenCalledTimes(1);
      expect(renderer.finish).toHaveBeenCalledTimes(1);
    } finally {
      pluginGate.resolve();
      await runPromise;
      restoreHostEnvironment(previous);
    }
  });

  it("finalizes every resource and keeps renderer cleanup priority after a successful turn", async () => {
    const pluginDir = await createPluginDir("headless-success-cleanup");
    const previous = configurePluginEnvironment(pluginDir);
    const rendererFailure = new Error("injected renderer cleanup failure");
    const engineFailure = new Error("injected engine cleanup failure");
    const originalPluginClose = PluginSkillRuntime.prototype.close;
    const pluginClose = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(
      async function (this: PluginSkillRuntime): Promise<void> {
        await originalPluginClose.call(this);
      }
    );
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
      async function (this: GodCodeEngineProcess, request: SubmitTurnRequest) {
        const event: GodCodeEventEnvelope = {
          event_type: "turn_finished",
          session_id: request.session_id,
          turn_id: "synthetic-turn",
          sequence: 1,
          payload: {
            status: "success",
            assistant_message: { role: "assistant", content: "done" }
          }
        };
        queueMicrotask(() => this.emit("god_code_event", event));
        return {
          session_id: request.session_id,
          turn_id: "synthetic-turn",
          status: "accepted"
        };
      }
    );
    const stop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockRejectedValue(engineFailure);
    const renderer = createRenderer(() => {
      throw rendererFailure;
    });

    try {
      const failure = await runGodCodeSession("synthetic", process.cwd(), { renderer }).then(
        () => undefined,
        (error: unknown) => error
      );

      expect(failure).toBe(rendererFailure);
      expect(pluginClose).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(renderer.finish).toHaveBeenCalledTimes(1);
      expect(observedEngine?.listenerCount("god_code_event")).toBe(0);
      expect(observedEngine?.listenerCount("exit")).toBe(0);
    } finally {
      restoreHostEnvironment(previous);
    }
  });

  it("preserves an RPC smoke primary across host and engine cleanup failures", async () => {
    const pluginDir = await createPluginDir("rpc-smoke-primary");
    const previous = configurePluginEnvironment(pluginDir);
    const initializePrimary = new Error("injected RPC smoke initialize primary");
    const stopSecondary = new Error("injected RPC smoke stop secondary");
    const originalPluginClose = PluginSkillRuntime.prototype.close;
    const pluginClose = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(
      async function (this: PluginSkillRuntime): Promise<void> {
        await originalPluginClose.call(this);
      }
    );
    vi.spyOn(GodCodeEngineProcess.prototype, "start").mockResolvedValue();
    vi.spyOn(GodCodeEngineProcess.prototype, "initialize").mockRejectedValue(initializePrimary);
    const stop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockRejectedValue(stopSecondary);

    try {
      const failure = await runGodCodeRpcSmoke(process.cwd()).then(
        () => undefined,
        (error: unknown) => error
      );

      expect(failure).toBe(initializePrimary);
      expect(JSON.stringify(failure)).not.toContain(stopSecondary.message);
      expect(pluginClose).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      restoreHostEnvironment(previous);
    }
  });
});

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-headless-finalization-"));
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
} {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
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
