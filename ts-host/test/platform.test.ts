import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../src/audit/memoryAuditSink.js";
import { toolError } from "../src/host_tools/common.js";
import { createDefaultHostToolRegistry } from "../src/host_tools/registry.js";
import { InMemoryMcpToolRegistry, registerMcpToolsWithHostRegistry } from "../src/mcp/registry.js";
import { PluginManifestError, parsePluginManifest } from "../src/plugins/manifest.js";
import { PluginRegistry } from "../src/plugins/registry.js";
import { PluginRuntimeError, PluginSkillRuntime } from "../src/plugins/runtime.js";
import type { PermissionPolicy, PolicyDecision } from "../src/policy/base.js";
import { BUILT_IN_TOOL_NAMES, type ExecuteToolRequest, type ToolName } from "../src/types/godCodeProtocol.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

function toolRequest(toolName: ToolName, input: Record<string, unknown> = {}): ExecuteToolRequest {
  return {
    session_id: "session-1",
    turn_id: "turn-1",
    tool_call_id: `${toolName}-1`,
    tool_name: toolName,
    input
  };
}

async function createManifestDir(fileName: "plugin.json" | "skill.json", manifest: unknown): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-plugin-"));
  tempDirs.push(dir);
  await fs.writeFile(path.join(dir, fileName), JSON.stringify(manifest), "utf8");
  return dir;
}

describe("Phase3 platform skeleton", () => {
  it("keeps built-in tool names while allowing custom tool names", () => {
    expect(BUILT_IN_TOOL_NAMES).toEqual([
      "Read",
      "Edit",
      "Bash",
      "ListFiles",
      "Search",
      "Write"
    ]);

    const customToolName: ToolName = "plugin.echo";
    expect(customToolName).toBe("plugin.echo");
  });

  it("registers fake MCP tools through HostToolRegistry and preserves audit", async () => {
    const auditSink = new MemoryAuditSink();
    const hostRegistry = createDefaultHostToolRegistry({ auditSink });
    const mcpRegistry = new InMemoryMcpToolRegistry();
    mcpRegistry.registerTool(
      { name: "mcp.echo", description: "echo from fake MCP" },
      async (input) => {
        return { ok: true, output: { echoed: input.value ?? "" } };
      }
    );

    await registerMcpToolsWithHostRegistry(mcpRegistry, hostRegistry);
    const result = await hostRegistry.executeRequest(
      toolRequest("mcp.echo", { value: "hello" }),
      { cwd: process.cwd() }
    );

    expect(result.ok).toBe(true);
    expect(result.output?.echoed).toBe("hello");
    expect(auditSink.events.map((event) => event.type)).toEqual([
      "tool_requested",
      "tool_decision",
      "tool_finished"
    ]);
  });

  it("applies permission policy to MCP tools", async () => {
    const denyMcpPolicy: PermissionPolicy = {
      async beforeExecute(request): Promise<PolicyDecision> {
        if (request.tool_name === "mcp.echo") {
          return { action: "deny", reason: "blocked mcp" };
        }
        return { action: "allow" };
      },
      async afterExecute(): Promise<void> {
        // No-op.
      }
    };
    const hostRegistry = createDefaultHostToolRegistry({ permissionPolicy: denyMcpPolicy });
    const mcpRegistry = new InMemoryMcpToolRegistry();
    mcpRegistry.registerTool(
      { name: "mcp.echo", description: "echo from fake MCP" },
      async () => toolError("should_not_run", "MCP tool should not run.")
    );

    await registerMcpToolsWithHostRegistry(mcpRegistry, hostRegistry);
    const result = await hostRegistry.executeRequest(toolRequest("mcp.echo"), {
      cwd: process.cwd()
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("permission_denied");
  });

  it("validates plugin manifests", () => {
    const manifest = parsePluginManifest({
      id: "plugin-1",
      name: "Plugin One",
      version: "0.1.0",
      runtime: {
        kind: "node-subprocess",
        entry: "handler.mjs",
        timeout_ms: 5000,
        env_keys: ["PLUGIN_TOKEN"]
      },
      tools: [
        {
          name: "plugin.echo",
          description: "echo",
          input_schema: {
            type: "object",
            properties: {
              value: {
                type: "string"
              }
            }
          }
        }
      ],
      permissions: ["tools"],
      promptFragments: ["Use plugin tools when useful."]
    });

    expect(manifest.id).toBe("plugin-1");
    expect(manifest.runtime).toEqual({
      kind: "node-subprocess",
      entry: "handler.mjs",
      timeout_ms: 5000,
      env_keys: ["PLUGIN_TOKEN"]
    });
    expect(manifest.tools?.[0]?.name).toBe("plugin.echo");
    expect(manifest.tools?.[0]?.input_schema).toEqual({
      type: "object",
      properties: {
        value: {
          type: "string"
        }
      }
    });
    expect(() => parsePluginManifest({ id: "missing-fields" })).toThrow(PluginManifestError);
    expect(() =>
      parsePluginManifest({
        id: "plugin-2",
        name: "Plugin Two",
        version: "0.1.0",
        tools: [{ name: "plugin.bad", description: "bad", input_schema: "bad" }]
      })
    ).toThrow(PluginManifestError);
    expect(() =>
      parsePluginManifest({
        id: "plugin-2",
        name: "Plugin Two",
        version: "0.1.0",
        runtime: { kind: "shell", entry: "handler.mjs" }
      })
    ).toThrow(PluginManifestError);
    expect(() =>
      parsePluginManifest({
        id: "plugin-2",
        name: "Plugin Two",
        version: "0.1.0",
        runtime: { kind: "node-subprocess", entry: "../handler.mjs" }
      })
    ).toThrow(PluginManifestError);
  });

  it("registers plugin tools through HostToolRegistry", async () => {
    const auditSink = new MemoryAuditSink();
    const hostRegistry = createDefaultHostToolRegistry({ auditSink });
    const pluginRegistry = new PluginRegistry();
    pluginRegistry.registerManifest({
      id: "plugin-1",
      name: "Plugin One",
      version: "0.1.0",
      tools: [{ name: "plugin.echo", description: "echo" }]
    });
    pluginRegistry.registerTool(
      "plugin-1",
      { name: "plugin.echo", description: "echo" },
      async (input) => ({ ok: true, output: { echoed: input.value ?? "" } })
    );

    pluginRegistry.registerToolsWithHostRegistry(hostRegistry);
    const result = await hostRegistry.executeRequest(
      toolRequest("plugin.echo", { value: "hello" }),
      { cwd: process.cwd() }
    );

    expect(pluginRegistry.listTools()).toEqual([{ name: "plugin.echo", description: "echo" }]);
    expect(result.ok).toBe(true);
    expect(result.output?.echoed).toBe("hello");
    expect(auditSink.events.map((event) => event.type)).toEqual([
      "tool_requested",
      "tool_decision",
      "tool_finished"
    ]);
  });

  it("loads plugin manifests through PluginSkillRuntime and registers executable tools", async () => {
    const pluginDir = await createManifestDir("plugin.json", {
      id: "plugin-1",
      name: "Plugin One",
      version: "0.1.0",
      tools: [
        { name: "plugin.plugin-1.echo", description: "echo" },
        { name: "plugin.plugin-1.unbound", description: "not executable yet" }
      ],
      promptFragments: ["Prefer plugin tools for echo requests."]
    });
    const runtime = new PluginSkillRuntime({ pluginDirs: [pluginDir] });
    runtime.registerToolHandler("plugin.plugin-1.echo", async (input) => ({
      ok: true,
      output: { echoed: input.value ?? "" }
    }));

    await runtime.load();

    expect(runtime.listLoadedPlugins()).toEqual([
      {
        manifest: {
          id: "plugin-1",
          name: "Plugin One",
          version: "0.1.0",
          tools: [
            { name: "plugin.plugin-1.echo", description: "echo" },
            { name: "plugin.plugin-1.unbound", description: "not executable yet" }
          ],
          promptFragments: ["Prefer plugin tools for echo requests."]
        },
        rootDir: pluginDir
      }
    ]);
    expect(runtime.promptFragments()).toEqual(["Prefer plugin tools for echo requests."]);
    expect(runtime.listTools()).toEqual([{ name: "plugin.plugin-1.echo", description: "echo" }]);

    const auditSink = new MemoryAuditSink();
    const hostRegistry = createDefaultHostToolRegistry({ auditSink });
    runtime.registerToolsWithHostRegistry(hostRegistry);
    const result = await hostRegistry.executeRequest(
      toolRequest("plugin.plugin-1.echo", { value: "hello" }),
      { cwd: process.cwd() }
    );

    expect(result.ok).toBe(true);
    expect(result.output?.echoed).toBe("hello");
    expect(auditSink.events.map((event) => event.type)).toEqual([
      "tool_requested",
      "tool_decision",
      "tool_finished"
    ]);
  });

  it("loads skill manifests and applies enabled plugin filtering", async () => {
    const enabledDir = await createManifestDir("skill.json", {
      id: "skill-1",
      name: "Skill One",
      version: "0.1.0",
      tools: [{ name: "skill.skill-1.echo", description: "skill echo" }],
      promptFragments: ["Skill prompt fragment."]
    });
    const disabledDir = await createManifestDir("plugin.json", {
      id: "plugin-disabled",
      name: "Disabled Plugin",
      version: "0.1.0",
      tools: [{ name: "plugin.disabled.echo", description: "disabled" }],
      promptFragments: ["Disabled fragment."]
    });
    const runtime = new PluginSkillRuntime({
      pluginDirs: [enabledDir, disabledDir],
      enabledPluginIds: ["skill-1"],
      toolHandlers: new Map([
        [
          "skill.skill-1.echo",
          async (input) => ({ ok: true, output: { echoed: input.value ?? "" } })
        ]
      ])
    });

    await runtime.load();

    expect(runtime.listLoadedPlugins().map((plugin) => plugin.manifest.id)).toEqual(["skill-1"]);
    expect(runtime.listTools()).toEqual([{ name: "skill.skill-1.echo", description: "skill echo" }]);
    expect(runtime.promptFragments()).toEqual(["Skill prompt fragment."]);
  });

  it("executes plugin-owned tools through the sandbox runtime", async () => {
    const pluginDir = await createManifestDir("plugin.json", {
      id: "plugin-runtime",
      name: "Runtime Plugin",
      version: "0.1.0",
      runtime: {
        kind: "node-subprocess",
        entry: "handler.mjs",
        timeout_ms: 1000,
        env_keys: ["GOD_CODE_PLUGIN_TEST_TOKEN"]
      },
      tools: [{ name: "plugin.runtime.echo", description: "runtime echo" }]
    });
    await fs.writeFile(
      path.join(pluginDir, "handler.mjs"),
      [
        'let raw = "";',
        'process.stdin.setEncoding("utf8");',
        "for await (const chunk of process.stdin) raw += chunk;",
        "const request = JSON.parse(raw);",
        'if (request.input.invalidJson) {',
        '  process.stdout.write("not json");',
        "} else if (request.input.hang) {",
        "  await new Promise((resolve) => setTimeout(resolve, 10000));",
        "} else ",
        'if (request.input.fail) {',
        '  process.stdout.write(JSON.stringify({ ok: false, error: { code: "plugin_failure", message: "requested failure" } }));',
        "} else {",
        "  process.stdout.write(JSON.stringify({ ok: true, output: { echoed: request.input.value, tool_name: request.tool_name, token_present: process.env.GOD_CODE_PLUGIN_TEST_TOKEN !== undefined } }));",
        "}"
      ].join("\n"),
      "utf8"
    );

    const previousToken = process.env.GOD_CODE_PLUGIN_TEST_TOKEN;
    process.env.GOD_CODE_PLUGIN_TEST_TOKEN = "not-rendered";
    try {
      const runtime = new PluginSkillRuntime({ pluginDirs: [pluginDir] });
      await runtime.load();

      expect(runtime.listTools()).toEqual([{ name: "plugin.runtime.echo", description: "runtime echo" }]);

      const hostRegistry = createDefaultHostToolRegistry();
      runtime.registerToolsWithHostRegistry(hostRegistry);
      const result = await hostRegistry.executeRequest(
        toolRequest("plugin.runtime.echo", { value: "hello" }),
        { cwd: process.cwd() }
      );
      const failed = await hostRegistry.executeRequest(
        toolRequest("plugin.runtime.echo", { fail: true }),
        { cwd: process.cwd() }
      );
      const invalidJson = await hostRegistry.executeRequest(
        toolRequest("plugin.runtime.echo", { invalidJson: true }),
        { cwd: process.cwd() }
      );
      const timedOut = await hostRegistry.executeRequest(
        toolRequest("plugin.runtime.echo", { hang: true }),
        { cwd: process.cwd() }
      );

      expect(result.ok).toBe(true);
      expect(result.output).toEqual({
        echoed: "hello",
        tool_name: "plugin.runtime.echo",
        token_present: true
      });
      expect(failed.ok).toBe(false);
      expect(failed.error?.code).toBe("plugin_failure");
      expect(invalidJson.ok).toBe(false);
      expect(invalidJson.error?.code).toBe("plugin_invalid_response");
      expect(timedOut.ok).toBe(false);
      expect(timedOut.error?.code).toBe("plugin_timeout");
    } finally {
      if (previousToken === undefined) {
        delete process.env.GOD_CODE_PLUGIN_TEST_TOKEN;
      } else {
        process.env.GOD_CODE_PLUGIN_TEST_TOKEN = previousToken;
      }
    }
  });

  it("rejects unsafe or ambiguous plugin runtime inputs", async () => {
    const duplicateOne = await createManifestDir("plugin.json", {
      id: "duplicate",
      name: "Duplicate One",
      version: "0.1.0"
    });
    const duplicateTwo = await createManifestDir("plugin.json", {
      id: "duplicate",
      name: "Duplicate Two",
      version: "0.1.0"
    });
    await expect(new PluginSkillRuntime({ pluginDirs: [duplicateOne, duplicateTwo] }).load()).rejects.toThrow(
      PluginRuntimeError
    );

    const builtInConflict = await createManifestDir("plugin.json", {
      id: "plugin-conflict",
      name: "Conflict",
      version: "0.1.0",
      tools: [{ name: "Read", description: "override read" }]
    });
    await expect(new PluginSkillRuntime({ pluginDirs: [builtInConflict] }).load()).rejects.toThrow(
      "Plugin tool cannot override built-in tool: Read"
    );

    await expect(
      new PluginSkillRuntime({ pluginDirs: [duplicateOne], enabledPluginIds: ["missing"] }).load()
    ).rejects.toThrow("Enabled plugin was not loaded: missing");
  });
});
