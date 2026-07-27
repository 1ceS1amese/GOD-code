import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareGodCodeHost } from "../src/headless/godCodeHostSetup.js";
import { SdkMcpStdioRuntime } from "../src/mcp/runtime.js";
import { PluginSkillRuntime } from "../src/plugins/runtime.js";

const fixturePath = fileURLToPath(new URL("./fixtures/mcp-demo-server.py", import.meta.url));
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

describe("prepareGodCodeHost runtime lifecycle", () => {
  it("rolls back created runtimes while preserving the setup primary", async () => {
    const pluginDir = await createPluginDir({
      id: "host-rollback-conflict",
      name: "Host rollback conflict",
      version: "0.1.0",
      tools: [{ name: "Read", description: "conflicts with the built-in tool" }]
    });
    const previous = configureHostEnvironment(pluginDir);
    const originalMcpClose = SdkMcpStdioRuntime.prototype.close;
    const originalPluginClose = PluginSkillRuntime.prototype.close;
    let connectedServerCountAtClose = 0;
    let connectedMcpCloseCount = 0;
    const mcpClose = vi.spyOn(SdkMcpStdioRuntime.prototype, "close").mockImplementation(
      async function (this: SdkMcpStdioRuntime): Promise<void> {
        const serverCount = (this as unknown as { servers: unknown[] }).servers.length;
        await originalMcpClose.call(this);
        if (serverCount === 0) {
          return;
        }
        connectedServerCountAtClose = serverCount;
        connectedMcpCloseCount += 1;
        throw new Error("injected MCP rollback close failure");
      }
    );
    const pluginClose = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(
      async function (this: PluginSkillRuntime): Promise<void> {
        await originalPluginClose.call(this);
        throw new Error("injected plugin rollback close failure");
      }
    );

    let failure: unknown;
    try {
      await prepareGodCodeHost();
    } catch (error) {
      failure = error;
    } finally {
      restoreHostEnvironment(previous);
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("Plugin tool cannot override built-in tool: Read");
    expect(connectedServerCountAtClose).toBe(1);
    expect(connectedMcpCloseCount).toBe(1);
    expect(pluginClose).toHaveBeenCalledTimes(1);
    expect(mcpClose).toHaveBeenCalledTimes(2);
  });

  it("closes prepared runtimes concurrently through one terminal lifecycle", async () => {
    const pluginDir = await createPluginDir({
      id: "host-close-concurrency",
      name: "Host close concurrency",
      version: "0.1.0"
    });
    const previous = configureHostEnvironment(pluginDir);
    let host: Awaited<ReturnType<typeof prepareGodCodeHost>> | undefined;
    try {
      host = await prepareGodCodeHost();
    } catch (error) {
      restoreHostEnvironment(previous);
      throw error;
    }
    const originalMcpClose = SdkMcpStdioRuntime.prototype.close;
    const originalPluginClose = PluginSkillRuntime.prototype.close;
    const pluginGate = createDeferred<void>();
    const pluginCloseStarted = createDeferred<void>();
    const mcpCloseStarted = createDeferred<void>();
    const pluginClose = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(
      async function (this: PluginSkillRuntime): Promise<void> {
        pluginCloseStarted.resolve();
        await pluginGate.promise;
        await originalPluginClose.call(this);
      }
    );
    const mcpClose = vi.spyOn(SdkMcpStdioRuntime.prototype, "close").mockImplementation(
      async function (this: SdkMcpStdioRuntime): Promise<void> {
        mcpCloseStarted.resolve();
        await originalMcpClose.call(this);
      }
    );
    let firstClose: Promise<void> | undefined;
    let secondClose: Promise<void> | undefined;

    try {
      firstClose = host.close();
      await pluginCloseStarted.promise;
      secondClose = host.close();

      expect(secondClose).toBe(firstClose);
      expect(await observesSettlementWithin(mcpCloseStarted.promise, 500)).toBe(true);
      expect(await observesSettlementWithin(firstClose, 25)).toBe(false);
      expect(pluginClose).toHaveBeenCalledTimes(1);
      expect(mcpClose).toHaveBeenCalledTimes(1);

      pluginGate.resolve();
      await Promise.all([firstClose, secondClose]);
      expect(host.close()).toBe(firstClose);
      await host.close();

      expect(pluginClose).toHaveBeenCalledTimes(1);
      expect(mcpClose).toHaveBeenCalledTimes(1);
    } finally {
      pluginGate.resolve();
      await Promise.allSettled([
        ...(firstClose === undefined ? [] : [firstClose]),
        ...(secondClose === undefined ? [] : [secondClose])
      ]);
      restoreHostEnvironment(previous);
    }
  });

  it("isolates a runtime close throw without blocking the other runtime", async () => {
    const pluginDir = await createPluginDir({
      id: "host-close-isolation",
      name: "Host close isolation",
      version: "0.1.0"
    });
    const previous = configureHostEnvironment(pluginDir);
    let host: Awaited<ReturnType<typeof prepareGodCodeHost>>;
    try {
      host = await prepareGodCodeHost();
    } catch (error) {
      restoreHostEnvironment(previous);
      throw error;
    }
    const originalMcpClose = SdkMcpStdioRuntime.prototype.close;
    const pluginClose = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(
      function (): Promise<void> {
        throw new Error("injected synchronous plugin close failure");
      }
    );
    const mcpClose = vi.spyOn(SdkMcpStdioRuntime.prototype, "close").mockImplementation(
      async function (this: SdkMcpStdioRuntime): Promise<void> {
        await originalMcpClose.call(this);
      }
    );
    try {
      await expect(host.close()).resolves.toBeUndefined();
      await expect(host.close()).resolves.toBeUndefined();
      expect(pluginClose).toHaveBeenCalledTimes(1);
      expect(mcpClose).toHaveBeenCalledTimes(1);
    } finally {
      pluginClose.mockRestore();
      await host.close().catch(() => undefined);
      restoreHostEnvironment(previous);
    }
  });
});

function configureHostEnvironment(pluginDir: string): Record<string, string | undefined> {
  const previous = Object.fromEntries(
    hostConfigEnvKeys.map((key) => [key, process.env[key]])
  ) as Record<string, string | undefined>;
  for (const key of hostConfigEnvKeys) {
    delete process.env[key];
  }
  process.env.GOD_CODE_MCP_SERVERS = JSON.stringify([
    { id: "host-lifecycle", command: "python3", args: [fixturePath] }
  ]);
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

async function createPluginDir(manifest: unknown): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-host-lifecycle-"));
  tempDirs.push(dir);
  await fs.writeFile(path.join(dir, "plugin.json"), JSON.stringify(manifest), "utf8");
  return dir;
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
