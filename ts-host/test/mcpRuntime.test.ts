import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { MemoryAuditSink } from "../src/audit/memoryAuditSink.js";
import { createDefaultHostToolRegistry } from "../src/host_tools/registry.js";
import {
  isStdioMcpServerConfig,
  loadMcpServerConfigsFromEnv,
  McpConfigError
} from "../src/mcp/config.js";
import { registerMcpToolsWithHostRegistry } from "../src/mcp/registry.js";
import {
  McpRuntimeDiagnosticError,
  SdkMcpStdioRuntime
} from "../src/mcp/runtime.js";
import type { PermissionPolicy, PolicyDecision } from "../src/policy/base.js";
import type { ExecuteToolRequest, ToolName } from "../src/types/godCodeProtocol.js";
import { runGodCodeRpcSmoke } from "../src/headless/godCodeRunSession.js";

const fixturePath = fileURLToPath(new URL("./fixtures/mcp-demo-server.py", import.meta.url));
const httpFixturePath = fileURLToPath(new URL("./fixtures/mcp-streamable-http-server.mjs", import.meta.url));

function toolRequest(toolName: ToolName, input: Record<string, unknown> = {}): ExecuteToolRequest {
  return {
    session_id: "session-1",
    turn_id: "turn-1",
    tool_call_id: `${toolName}-1`,
    tool_name: toolName,
    input
  };
}

function demoServerEnv(): string {
  return JSON.stringify([
    {
      id: "demo",
      command: "python3",
      args: [fixturePath]
    }
  ]);
}

function demoStdioServerConfigs() {
  return loadMcpServerConfigsFromEnv({ GOD_CODE_MCP_SERVERS: demoServerEnv() }).filter(
    isStdioMcpServerConfig
  );
}

async function startHttpMcpFixture(): Promise<{ url: string; close(): Promise<void> }> {
  const child = spawn(process.execPath, [httpFixturePath], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const url = await readFirstStdoutLine(child, stderr);
  return {
    url,
    async close(): Promise<void> {
      if (child.exitCode !== null) {
        return;
      }
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        setTimeout(resolve, 1000).unref();
      });
    }
  };
}

async function readFirstStdoutLine(
  child: ChildProcessWithoutNullStreams,
  stderr: string
): Promise<string> {
  return await new Promise((resolve, reject) => {
    let stdout = "";
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for HTTP MCP fixture. stderr=${stderr}`));
    }, 5000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const newlineIndex = stdout.indexOf("\n");
      if (newlineIndex >= 0) {
        clearTimeout(timer);
        resolve(stdout.slice(0, newlineIndex).trim());
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`HTTP MCP fixture exited early with code ${code}. stderr=${stderr}`));
    });
  });
}

async function withMcpEnv<T>(value: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.GOD_CODE_MCP_SERVERS;
  process.env.GOD_CODE_MCP_SERVERS = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.GOD_CODE_MCP_SERVERS;
    } else {
      process.env.GOD_CODE_MCP_SERVERS = previous;
    }
  }
}

async function withMcpConfigFile<T>(value: string, run: () => Promise<T>): Promise<T> {
  const previousServers = process.env.GOD_CODE_MCP_SERVERS;
  const previousConfigFile = process.env.GOD_CODE_MCP_CONFIG_FILE;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-mcp-config-"));
  const configPath = path.join(dir, "mcp-servers.json");
  await fs.writeFile(configPath, value, "utf8");
  delete process.env.GOD_CODE_MCP_SERVERS;
  process.env.GOD_CODE_MCP_CONFIG_FILE = configPath;
  try {
    return await run();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    if (previousServers === undefined) {
      delete process.env.GOD_CODE_MCP_SERVERS;
    } else {
      process.env.GOD_CODE_MCP_SERVERS = previousServers;
    }
    if (previousConfigFile === undefined) {
      delete process.env.GOD_CODE_MCP_CONFIG_FILE;
    } else {
      process.env.GOD_CODE_MCP_CONFIG_FILE = previousConfigFile;
    }
  }
}

interface TestMcpClosableResource {
  close(): Promise<void>;
}

interface TestConnectedMcpServer {
  id: string;
  client: TestMcpClosableResource;
  transport: TestMcpClosableResource;
}

function appendTestMcpServers(
  runtime: SdkMcpStdioRuntime,
  servers: readonly TestConnectedMcpServer[]
): void {
  const internals = runtime as unknown as {
    servers: TestConnectedMcpServer[];
  };
  internals.servers.push(...servers);
}

function createPendingMcpClose() {
  let resolveCloseStarted!: () => void;
  let resolvePendingClose!: () => void;
  let rejectPendingClose!: (reason: unknown) => void;
  const closeStarted = new Promise<void>((resolve) => {
    resolveCloseStarted = resolve;
  });
  const pendingClose = new Promise<void>((resolve, reject) => {
    resolvePendingClose = resolve;
    rejectPendingClose = reject;
  });
  const close = vi.fn(() => {
    resolveCloseStarted();
    return pendingClose;
  });
  return {
    close,
    closeStarted,
    resolve: () => resolvePendingClose(),
    reject: (reason) => rejectPendingClose(reason)
  };
}

async function observeMcpPromiseAfterCloseDeadline<T>(
  operation: Promise<T>,
  closeStarted: Promise<void>
): Promise<{ settled: true; value: T } | { settled: false }> {
  await closeStarted;
  await vi.advanceTimersByTimeAsync(60_000);
  vi.useRealTimers();
  return Promise.race([
    operation.then((value) => ({ settled: true as const, value })),
    new Promise<{ settled: false }>((resolve) => {
      setTimeout(() => resolve({ settled: false }), 500);
    })
  ]);
}

describe("MCP runtime", () => {
  it("loads MCP server configs from GOD_CODE_MCP_SERVERS", () => {
    expect(loadMcpServerConfigsFromEnv({})).toEqual([]);
    expect(loadMcpServerConfigsFromEnv({ GOD_CODE_MCP_SERVERS: "" })).toEqual([]);

    expect(
      loadMcpServerConfigsFromEnv({
        GOD_CODE_MCP_SERVERS: JSON.stringify([
          {
            id: "demo",
            command: "node",
            args: ["server.js"],
            cwd: ".",
            env: { FOO: "bar" }
          }
        ])
      })
    ).toEqual([
      {
        id: "demo",
        command: "node",
        args: ["server.js"],
        cwd: ".",
        env: { FOO: "bar" }
      }
    ]);

    expect(
      loadMcpServerConfigsFromEnv({
        GOD_CODE_MCP_SERVERS: JSON.stringify([
          {
            id: "remote",
            transport: "streamable-http",
            url: "https://mcp.example.test/mcp",
            headers: { Authorization: "Bearer secret" }
          }
        ])
      })
    ).toEqual([
      {
        id: "remote",
        transport: "streamable-http",
        url: "https://mcp.example.test/mcp",
        headers: { Authorization: "Bearer secret" }
      }
    ]);
  });

  it("rejects invalid MCP server configs", () => {
    expect(() =>
      loadMcpServerConfigsFromEnv({
        GOD_CODE_MCP_SERVERS: JSON.stringify([{ id: "missing-command" }])
      })
    ).toThrow(McpConfigError);

    expect(() =>
      loadMcpServerConfigsFromEnv({
        GOD_CODE_MCP_SERVERS: JSON.stringify([
          { id: "demo", command: "node" },
          { id: "demo", command: "node" }
        ])
      })
    ).toThrow("Duplicate MCP server id: demo");

    expect(() =>
      loadMcpServerConfigsFromEnv({
        GOD_CODE_MCP_SERVERS: JSON.stringify([
          { id: "remote", transport: "streamable-http", url: "file:///tmp/mcp.sock" }
        ])
      })
    ).toThrow("field url must use http or https");

    expect(() =>
      loadMcpServerConfigsFromEnv({
        GOD_CODE_MCP_SERVERS: JSON.stringify([
          { id: "remote", transport: "streamable-http", url: "https://mcp.example.test/mcp", headers: { Authorization: 123 } }
        ])
      })
    ).toThrow("field headers.Authorization must be a string");
  });

  it("bounds concurrent MCP server close settlement and memoizes repeated close", async () => {
    const runtime = new SdkMcpStdioRuntime([]);
    const pendingClient = createPendingMcpClose();
    const pendingTransportClose = vi.fn(async () => undefined);
    const settledClientClose = vi.fn(async () => undefined);
    const settledTransportClose = vi.fn(async () => undefined);
    appendTestMcpServers(runtime, [
      {
        id: "settled",
        client: { close: settledClientClose },
        transport: { close: settledTransportClose }
      },
      {
        id: "pending",
        client: { close: pendingClient.close },
        transport: { close: pendingTransportClose }
      }
    ]);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const firstClose = runtime.close();
    let secondClose: Promise<void> | undefined;

    try {
      await pendingClient.closeStarted;
      const settledStartedBeforeRepeatedClose =
        settledClientClose.mock.calls.length === 1;
      let secondSettledBeforeDeadline = false;
      secondClose = runtime.close().then(() => {
        secondSettledBeforeDeadline = true;
      });
      await Promise.resolve();
      await Promise.resolve();
      const repeatedCloseWaitedForLifecycle = !secondSettledBeforeDeadline;
      const settlement = await observeMcpPromiseAfterCloseDeadline(
        Promise.all([firstClose, secondClose]).then(() => undefined),
        Promise.resolve()
      );
      pendingClient.reject(
        new Error("late MCP client close rejection")
      );
      await Promise.all([firstClose, secondClose]);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settlement.settled).toBe(true);
      expect(settledStartedBeforeRepeatedClose).toBe(true);
      expect(repeatedCloseWaitedForLifecycle).toBe(true);
      expect(pendingClient.close).toHaveBeenCalledTimes(1);
      expect(pendingTransportClose).toHaveBeenCalledTimes(1);
      expect(settledClientClose).toHaveBeenCalledTimes(1);
      expect(settledTransportClose).not.toHaveBeenCalled();
      expect(unhandled).toEqual([]);
    } finally {
      pendingClient.resolve();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
      await Promise.allSettled([
        firstClose,
        ...(secondClose === undefined ? [] : [secondClose])
      ]);
    }
  });

  it("bounds MCP transport fallback settlement after client close rejects", async () => {
    const runtime = new SdkMcpStdioRuntime([]);
    const pendingTransport = createPendingMcpClose();
    const clientClose = vi.fn(async () => {
      throw new Error("injected MCP client close failure");
    });
    appendTestMcpServers(runtime, [{
      id: "fallback",
      client: { close: clientClose },
      transport: { close: pendingTransport.close }
    }]);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const closePromise = runtime.close();

    try {
      const settlement = await observeMcpPromiseAfterCloseDeadline(
        closePromise,
        pendingTransport.closeStarted
      );
      pendingTransport.reject(
        new Error("late MCP transport close rejection")
      );
      await closePromise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settlement.settled).toBe(true);
      expect(clientClose).toHaveBeenCalledTimes(1);
      expect(pendingTransport.close).toHaveBeenCalledTimes(1);
      expect(unhandled).toEqual([]);
    } finally {
      pendingTransport.resolve();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
      await closePromise;
    }
  });

  it("preserves MCP connect primary across bounded cleanup settlement", async () => {
    const runtime = new SdkMcpStdioRuntime(demoStdioServerConfigs());
    const pendingClient = createPendingMcpClose();
    const transportClose = vi.fn(async () => undefined);
    const server: TestConnectedMcpServer = {
      id: "demo",
      client: { close: pendingClient.close },
      transport: { close: transportClose }
    };
    const internals = runtime as unknown as {
      connectServer(config: unknown): Promise<TestConnectedMcpServer>;
      loadServerTools(server: TestConnectedMcpServer): Promise<void>;
    };
    internals.connectServer = vi.fn(async () => server);
    internals.loadServerTools = vi.fn(async () => {
      throw new Error("primary MCP list-tools failure");
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const failurePromise = runtime.connect().catch((error: unknown) => error);

    try {
      const settlement = await observeMcpPromiseAfterCloseDeadline(
        failurePromise,
        pendingClient.closeStarted
      );
      pendingClient.reject(
        new Error("late MCP connect cleanup close rejection")
      );
      const failure = settlement.settled
        ? settlement.value
        : await failurePromise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settlement.settled).toBe(true);
      expect(failure).toBeInstanceOf(McpRuntimeDiagnosticError);
      expect(failure).toMatchObject({
        message:
          "MCP server list tools failed for demo: primary MCP list-tools failure",
        details: {
          code: "list_tools_failed",
          server_id: "demo",
          cause_message: "primary MCP list-tools failure"
        }
      });
      expect(pendingClient.close).toHaveBeenCalledTimes(1);
      expect(transportClose).toHaveBeenCalledTimes(1);
      expect(unhandled).toEqual([]);
      expect(JSON.stringify(failure)).not.toContain(
        "late MCP connect cleanup close rejection"
      );
    } finally {
      pendingClient.resolve();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
      await failurePromise;
    }
  });

  it("connects to a local MCP stdio server and maps tools", async () => {
    const runtime = new SdkMcpStdioRuntime(demoStdioServerConfigs());
    try {
      await runtime.connect();
      expect(await runtime.listTools()).toEqual([
        {
          name: "mcp.demo.echo",
          description: "Echo a value from the fake MCP server.",
          input_schema: {
            type: "object",
            properties: {
              value: {
                type: "string"
              }
            }
          }
        },
        {
          name: "mcp.demo.noDescription",
          description: "MCP tool noDescription from demo",
          input_schema: { type: "object" }
        },
        {
          name: "mcp.demo.fail",
          description: "Return a tool error.",
          input_schema: { type: "object" }
        }
      ]);

      const result = await runtime.executeTool("mcp.demo.echo", { value: "hello" }, { cwd: process.cwd() });
      expect(result.ok).toBe(true);
      expect(result.output?.structuredContent).toEqual({ echoed: "hello" });

      const failure = await runtime.executeTool("mcp.demo.fail", {}, { cwd: process.cwd() });
      expect(failure.ok).toBe(false);
      expect(failure.error?.code).toBe("mcp_tool_error");
      expect(failure.error?.message).toBe("intentional MCP failure");
      expect(await runtime.listResources()).toEqual([
        {
          server_id: "demo",
          uri: "memory://demo/readme",
          name: "Demo README",
          description: "A fake MCP resource for diagnostics.",
          mime_type: "text/plain"
        }
      ]);
      expect(await runtime.listResourceTemplates()).toEqual([
        {
          server_id: "demo",
          uri_template: "memory://demo/item/{id}",
          name: "Demo Item",
          description: "A fake MCP resource template for diagnostics.",
          mime_type: "text/plain"
        }
      ]);
      expect(await runtime.listPrompts()).toEqual([
        {
          server_id: "demo",
          name: "summarize",
          description: "Summarize a value from the fake MCP server.",
          arguments: [
            {
              name: "text",
              description: "Text to summarize.",
              required: true
            }
          ]
        }
      ]);
      expect(await runtime.readResource("memory://demo/readme")).toEqual({
        server_id: "demo",
        uri: "memory://demo/readme",
        contents: [
          {
            uri: "memory://demo/readme",
            mime_type: "text/plain",
            text: "Demo README resource body."
          }
        ]
      });
      expect(await runtime.subscribeResource("memory://demo/readme")).toEqual({
        server_id: "demo",
        uri: "memory://demo/readme",
        subscribed: true
      });
      expect(await runtime.unsubscribeResource("memory://demo/readme")).toEqual({
        server_id: "demo",
        uri: "memory://demo/readme",
        subscribed: false
      });
      expect(await runtime.waitForResourceUpdate("memory://demo/readme")).toEqual({
        server_id: "demo",
        uri: "memory://demo/readme",
        updated: true,
        timed_out: false,
        timeout_ms: 1000,
        notification_uri: "memory://demo/readme"
      });
      expect(await runtime.watchResourceUpdates("memory://demo/readme", { maxEvents: 3 })).toEqual({
        server_id: "demo",
        uri: "memory://demo/readme",
        event_count: 3,
        max_events: 3,
        timed_out: false,
        timeout_ms: 1000,
        updates: [
          { uri: "memory://demo/readme" },
          { uri: "memory://demo/readme" },
          { uri: "memory://demo/readme" }
        ]
      });
      expect(await runtime.completePrompt("summarize", { name: "text", value: "alph" })).toEqual({
        server_id: "demo",
        ref_type: "prompt",
        ref: "summarize",
        argument: {
          name: "text",
          value: "alph"
        },
        values: ["alpha", "alphabet"],
        total: 2,
        has_more: false
      });
      expect(await runtime.completeResourceTemplate("memory://demo/item/{id}", { name: "id", value: "item" })).toEqual({
        server_id: "demo",
        ref_type: "resource_template",
        ref: "memory://demo/item/{id}",
        argument: {
          name: "id",
          value: "item"
        },
        values: ["item-1", "item-2"],
        total: 2,
        has_more: false
      });
      expect(await runtime.getPrompt("summarize", { text: "hello" })).toEqual({
        server_id: "demo",
        name: "summarize",
        description: "Summarize prompt from the fake MCP server.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Summarize: hello"
            }
          }
        ]
      });
    } finally {
      await runtime.close();
    }
  });

  it("connects to a local MCP streamable HTTP server and maps tools", async () => {
    const fixture = await startHttpMcpFixture();
    const runtime = new SdkMcpStdioRuntime(
      loadMcpServerConfigsFromEnv({
        GOD_CODE_MCP_SERVERS: JSON.stringify([
          {
            id: "remote",
            transport: "streamable-http",
            url: fixture.url,
            headers: {
              Authorization: "Bearer test-token"
            }
          }
        ])
      })
    );
    try {
      await runtime.connect();
      expect(await runtime.listTools()).toEqual([
        {
          name: "mcp.remote.echo",
          description: "Echo a value from the fake HTTP MCP server.",
          input_schema: {
            type: "object",
            properties: {
              value: {
                type: "string"
              }
            }
          }
        },
        {
          name: "mcp.remote.fail",
          description: "Return a tool error over HTTP.",
          input_schema: { type: "object" }
        }
      ]);

      const result = await runtime.executeTool("mcp.remote.echo", { value: "hello" }, { cwd: process.cwd() });
      expect(result.ok).toBe(true);
      expect(result.output?.structuredContent).toEqual({ echoed: "hello" });

      const failure = await runtime.executeTool("mcp.remote.fail", {}, { cwd: process.cwd() });
      expect(failure.ok).toBe(false);
      expect(failure.error?.code).toBe("mcp_tool_error");
      expect(failure.error?.message).toBe("intentional HTTP MCP failure");
      expect(await runtime.listResources()).toEqual([
        {
          server_id: "remote",
          uri: "memory://remote/http-readme",
          name: "HTTP Demo README",
          description: "A fake HTTP MCP resource for diagnostics.",
          mime_type: "text/plain"
        }
      ]);
      expect(await runtime.listResourceTemplates()).toEqual([
        {
          server_id: "remote",
          uri_template: "memory://remote/item/{id}",
          name: "HTTP Demo Item",
          description: "A fake HTTP MCP resource template for diagnostics.",
          mime_type: "text/plain"
        }
      ]);
      expect(await runtime.listPrompts()).toEqual([
        {
          server_id: "remote",
          name: "httpSummarize",
          description: "Summarize a value from the fake HTTP MCP server.",
          arguments: [
            {
              name: "text",
              description: "Text to summarize.",
              required: true
            }
          ]
        }
      ]);
      expect(await runtime.readResource("memory://remote/http-readme")).toEqual({
        server_id: "remote",
        uri: "memory://remote/http-readme",
        contents: [
          {
            uri: "memory://remote/http-readme",
            mime_type: "text/plain",
            text: "HTTP Demo README resource body."
          }
        ]
      });
      expect(await runtime.subscribeResource("memory://remote/http-readme")).toEqual({
        server_id: "remote",
        uri: "memory://remote/http-readme",
        subscribed: true
      });
      expect(await runtime.unsubscribeResource("memory://remote/http-readme")).toEqual({
        server_id: "remote",
        uri: "memory://remote/http-readme",
        subscribed: false
      });
      expect(await runtime.completePrompt("httpSummarize", { name: "text", value: "http-alph" })).toEqual({
        server_id: "remote",
        ref_type: "prompt",
        ref: "httpSummarize",
        argument: {
          name: "text",
          value: "http-alph"
        },
        values: ["http-alpha", "http-alphabet"],
        total: 2,
        has_more: false
      });
      expect(await runtime.completeResourceTemplate("memory://remote/item/{id}", { name: "id", value: "remote" })).toEqual({
        server_id: "remote",
        ref_type: "resource_template",
        ref: "memory://remote/item/{id}",
        argument: {
          name: "id",
          value: "remote"
        },
        values: ["remote-1", "remote-2"],
        total: 2,
        has_more: false
      });
      expect(await runtime.getPrompt("httpSummarize", { text: "hello" })).toEqual({
        server_id: "remote",
        name: "httpSummarize",
        description: "Summarize prompt from the fake HTTP MCP server.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "HTTP summarize: hello"
            }
          }
        ]
      });
    } finally {
      await runtime.close();
      await fixture.close();
    }
  });

  it("registers MCP runtime tools through HostToolRegistry with audit", async () => {
    const runtime = new SdkMcpStdioRuntime(demoStdioServerConfigs());
    try {
      await runtime.connect();
      const auditSink = new MemoryAuditSink();
      const hostRegistry = createDefaultHostToolRegistry({ auditSink });
      await registerMcpToolsWithHostRegistry(runtime, hostRegistry);

      const result = await hostRegistry.executeRequest(
        toolRequest("mcp.demo.echo", { value: "hello" }),
        { cwd: process.cwd() }
      );

      expect(result.ok).toBe(true);
      expect(result.output?.structuredContent).toEqual({ echoed: "hello" });
      expect(auditSink.events.map((event) => event.type)).toEqual([
        "tool_requested",
        "tool_decision",
        "tool_finished"
      ]);
    } finally {
      await runtime.close();
    }
  });

  it("keeps permission policy in front of MCP runtime tools", async () => {
    const runtime = new SdkMcpStdioRuntime(demoStdioServerConfigs());
    const denyMcpPolicy: PermissionPolicy = {
      async beforeExecute(request): Promise<PolicyDecision> {
        if (request.tool_name === "mcp.demo.echo") {
          return { action: "deny", reason: "blocked MCP runtime tool" };
        }
        return { action: "allow" };
      },
      async afterExecute(): Promise<void> {
        // No-op.
      }
    };

    try {
      await runtime.connect();
      const hostRegistry = createDefaultHostToolRegistry({ permissionPolicy: denyMcpPolicy });
      await registerMcpToolsWithHostRegistry(runtime, hostRegistry);

      const result = await hostRegistry.executeRequest(
        toolRequest("mcp.demo.echo", { value: "hello" }),
        { cwd: process.cwd() }
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("permission_denied");
    } finally {
      await runtime.close();
    }
  });

  it("can include env-configured MCP tools in headless session setup", async () => {
    await withMcpEnv(demoServerEnv(), async () => {
      await runGodCodeRpcSmoke(process.cwd());
    });
  });

  it("can include file-configured MCP tools in headless session setup", async () => {
    await withMcpConfigFile(demoServerEnv(), async () => {
      await runGodCodeRpcSmoke(process.cwd());
    });
  });

  it("can include streamable HTTP MCP tools in headless session setup", async () => {
    const fixture = await startHttpMcpFixture();
    try {
      await withMcpEnv(
        JSON.stringify([
          {
            id: "remote",
            transport: "streamable-http",
            url: fixture.url
          }
        ]),
        async () => {
          await runGodCodeRpcSmoke(process.cwd());
        }
      );
    } finally {
      await fixture.close();
    }
  });
});
