import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  completeMcpPrompt,
  completeMcpResourceTemplate,
  getMcpPrompt,
  inspectMcpConfig,
  inspectMcpContext,
  loopMcpResourceUpdates,
  readMcpResource,
  renderMcpCompletionJsonl,
  renderMcpCompletionValues,
  renderMcpDiagnosticReport,
  renderMcpDiagnosticReportJson,
  subscribeMcpResource,
  unsubscribeMcpResource,
  waitMcpResourceUpdate,
  watchMcpResourceUpdates
} from "../src/cli/mcp.js";
import {
  installMcpCompletionScript,
  renderMcpCompletionInstallReport,
  renderMcpCompletionInstallReportJson,
  renderMcpCompletionScript
} from "../src/cli/mcpCompletionScript.js";
import { prepareGodCodeHost } from "../src/headless/godCodeHostSetup.js";
import {
  inspectPluginConfig,
  inspectConfiguredPlugin,
  installLocalPluginRegistryEntry,
  listConfiguredPlugins,
  renderPluginDiagnosticReport,
  renderPluginDiagnosticReportJson,
  renderPluginManifestSchema,
  renderPluginManifestSchemaJson,
  renderPluginRegistryInstallResult,
  renderPluginRegistryInstallResultJson,
  renderPluginRegistrySetEnabledResult,
  renderPluginRegistrySetEnabledResultJson,
  renderPluginRegistryTagsResult,
  renderPluginRegistryTagsResultJson,
  renderPluginRegistryUninstallResult,
  renderPluginRegistryUninstallResultJson,
  setLocalPluginRegistryEntryEnabled,
  uninstallLocalPluginRegistryEntry,
  updateLocalPluginRegistryEntryTags,
  validatePluginManifestTarget
} from "../src/cli/plugins.js";

const fixturePath = fileURLToPath(new URL("./fixtures/mcp-demo-server.py", import.meta.url));
const httpFixturePath = fileURLToPath(new URL("./fixtures/mcp-streamable-http-server.mjs", import.meta.url));
const sseFixturePath = fileURLToPath(new URL("./fixtures/mcp-sse-server.mjs", import.meta.url));
const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

async function startHttpMcpFixture(
  options: { env?: Record<string, string> } = {}
): Promise<{ url: string; close(): Promise<void> }> {
  return await startNodeMcpFixture(httpFixturePath, options);
}

async function startSseMcpFixture(
  options: { env?: Record<string, string> } = {}
): Promise<{ url: string; close(): Promise<void> }> {
  return await startNodeMcpFixture(sseFixturePath, options);
}

async function startNodeMcpFixture(
  fixture: string,
  options: { env?: Record<string, string> } = {}
): Promise<{ url: string; close(): Promise<void> }> {
  const child = spawn(process.execPath, [fixture], {
    env: {
      ...process.env,
      ...options.env
    },
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

describe("CLI MCP diagnostics", () => {
  it("reports empty MCP config without connecting", async () => {
    const report = await inspectMcpConfig({ environ: {} });
    const output = renderMcpDiagnosticReport(report);

    expect(report.ok).toBe(true);
    expect(output).toContain("OK mcp_config: no MCP servers configured");
    expect(JSON.parse(renderMcpDiagnosticReportJson(report)).ok).toBe(true);
  });

  it("reports invalid MCP config JSON", async () => {
    const report = await inspectMcpConfig({
      environ: {
        GOD_CODE_MCP_SERVERS: "{bad"
      }
    });

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.status).toBe("error");
    expect(report.checks[0]?.message).toContain("GOD_CODE_MCP_SERVERS must be valid JSON");
  });

  it("loads MCP config from GOD_CODE_MCP_CONFIG_FILE", async () => {
    const dir = await createTempDir();
    await fs.writeFile(
      path.join(dir, "mcp-servers.json"),
      JSON.stringify([
        {
          id: "demo-file",
          command: "python3",
          args: [fixturePath],
          env: {
            SECRET_VALUE: "not-rendered"
          }
        }
      ]),
      "utf8"
    );

    const report = await inspectMcpConfig({
      cwd: dir,
      environ: {
        GOD_CODE_MCP_CONFIG_FILE: "mcp-servers.json"
      }
    });
    const output = renderMcpDiagnosticReport(report);
    const json = JSON.parse(renderMcpDiagnosticReportJson(report));

    expect(report.ok).toBe(true);
    expect(output).toContain("OK mcp_config: 1 MCP server(s) configured from file");
    expect(output).toContain("source=file");
    expect(output).not.toContain("not-rendered");
    expect(json.checks[0].details.source).toBe("file");
    expect(json.checks[0].details.servers[0].id).toBe("demo-file");
    expect(json.checks[0].details.servers[0].env_keys).toEqual(["SECRET_VALUE"]);
  });

  it("reports streamable HTTP MCP config without leaking headers", async () => {
    const report = await inspectMcpConfig({
      environ: {
        GOD_CODE_MCP_SERVERS: JSON.stringify([
          {
            id: "remote",
            transport: "streamable-http",
            url: "https://mcp.example.test/mcp",
            headers: {
              Authorization: "Bearer not-rendered"
            }
          }
        ])
      }
    });
    const output = renderMcpDiagnosticReport(report);
    const json = JSON.parse(renderMcpDiagnosticReportJson(report));

    expect(report.ok).toBe(true);
    expect(output).toContain("transport=streamable-http");
    expect(output).toContain("url=https://mcp.example.test/mcp");
    expect(output).toContain("header_keys=1");
    expect(output).not.toContain("not-rendered");
    expect(json.checks[0].details.servers[0]).toMatchObject({
      id: "remote",
      transport: "streamable-http",
      url: "https://mcp.example.test/mcp",
      header_keys: ["Authorization"]
    });
  });

  it("resolves streamable HTTP MCP bearer tokens from environment without leaking values", async () => {
    const fixture = await startHttpMcpFixture({
      env: {
        MCP_EXPECT_AUTHORIZATION: "Bearer secret-token"
      }
    });
    try {
      const report = await inspectMcpConfig({
        connect: true,
        environ: {
          GOD_CODE_MCP_SERVERS: JSON.stringify([
            {
              id: "remote",
              transport: "streamable-http",
              url: fixture.url,
              bearer_token_env: "REMOTE_MCP_TOKEN"
            }
          ]),
          REMOTE_MCP_TOKEN: "secret-token"
        }
      });
      const output = renderMcpDiagnosticReport(report);
      const json = JSON.parse(renderMcpDiagnosticReportJson(report));
      const server = json.checks.find((check: { name: string }) => check.name === "mcp_config").details.servers[0];

      expect(report.ok).toBe(true);
      expect(output).toContain("bearer_token_env=REMOTE_MCP_TOKEN");
      expect(output).not.toContain("secret-token");
      expect(JSON.stringify(json)).not.toContain("secret-token");
      expect(server).toMatchObject({
        id: "remote",
        transport: "streamable-http",
        header_keys: ["Authorization"],
        bearer_token_env: "REMOTE_MCP_TOKEN"
      });
    } finally {
      await fixture.close();
    }
  });

  it("resolves streamable HTTP MCP custom headers from environment without leaking values", async () => {
    const report = await inspectMcpConfig({
      environ: {
        GOD_CODE_MCP_SERVERS: JSON.stringify([
          {
            id: "remote",
            transport: "streamable-http",
            url: "https://mcp.example.test/mcp",
            headers_env: {
              "X-API-Key": "REMOTE_MCP_API_KEY"
            }
          }
        ]),
        REMOTE_MCP_API_KEY: "api-key-secret"
      }
    });
    const output = renderMcpDiagnosticReport(report);
    const json = JSON.parse(renderMcpDiagnosticReportJson(report));
    const server = json.checks.find((check: { name: string }) => check.name === "mcp_config").details.servers[0];

    expect(report.ok).toBe(true);
    expect(output).toContain("header_keys=1");
    expect(output).toContain("header_env_keys=1");
    expect(output).not.toContain("api-key-secret");
    expect(JSON.stringify(json)).not.toContain("api-key-secret");
    expect(server).toMatchObject({
      id: "remote",
      transport: "streamable-http",
      header_keys: ["X-API-Key"],
      header_env_keys: ["X-API-Key"]
    });
  });

  it("reports missing streamable HTTP MCP auth environment variables", async () => {
    const report = await inspectMcpConfig({
      environ: {
        GOD_CODE_MCP_SERVERS: JSON.stringify([
          {
            id: "remote",
            transport: "streamable-http",
            url: "https://mcp.example.test/mcp",
            bearer_token_env: "REMOTE_MCP_TOKEN"
          }
        ])
      }
    });

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.name).toBe("mcp_config");
    expect(report.checks[0]?.message).toContain("REMOTE_MCP_TOKEN");
    expect(report.checks[0]?.message).toContain("unset environment variable");
  });

  it("connects to streamable HTTP MCP servers when requested", async () => {
    const fixture = await startHttpMcpFixture();
    try {
      const report = await inspectMcpConfig({
        connect: true,
        environ: {
          GOD_CODE_MCP_SERVERS: JSON.stringify([
            {
              id: "remote",
              transport: "streamable-http",
              url: fixture.url,
              headers: {
                Authorization: "Bearer not-rendered"
              }
            }
          ])
        }
      });
      const output = renderMcpDiagnosticReport(report);
      const connectCheck = report.checks.find((check) => check.name === "mcp_connect");
      const json = JSON.parse(renderMcpDiagnosticReportJson(report));

      expect(report.ok).toBe(true);
      expect(connectCheck?.status).toBe("ok");
      expect(connectCheck?.details).toMatchObject({
        tool_count: 2
      });
      expect(output).toContain("mcp.remote.echo");
      expect(output).not.toContain("not-rendered");
      expect(json.checks.find((check: { name: string }) => check.name === "mcp_config").details.servers[0].header_keys).toEqual(["Authorization"]);
    } finally {
      await fixture.close();
    }
  });

  it("connects to legacy SSE MCP servers when requested", async () => {
    const fixture = await startSseMcpFixture({
      env: {
        MCP_EXPECT_AUTHORIZATION: "Bearer sse-secret"
      }
    });
    try {
      const report = await inspectMcpConfig({
        connect: true,
        resources: true,
        resourceTemplates: true,
        prompts: true,
        environ: {
          GOD_CODE_MCP_SERVERS: JSON.stringify([
            {
              id: "legacy",
              transport: "sse",
              url: fixture.url,
              bearer_token_env: "SSE_MCP_TOKEN"
            }
          ]),
          SSE_MCP_TOKEN: "sse-secret"
        }
      });
      const output = renderMcpDiagnosticReport(report);
      const configCheck = report.checks.find((check) => check.name === "mcp_config");
      const connectCheck = report.checks.find((check) => check.name === "mcp_connect");
      const resourcesCheck = report.checks.find((check) => check.name === "mcp_resources");
      const resourceTemplatesCheck = report.checks.find((check) => check.name === "mcp_resource_templates");
      const promptsCheck = report.checks.find((check) => check.name === "mcp_prompts");

      expect(report.ok).toBe(true);
      expect(configCheck?.details).toMatchObject({
        servers: [
          {
            id: "legacy",
            transport: "sse",
            header_keys: ["Authorization"],
            bearer_token_env: "SSE_MCP_TOKEN"
          }
        ]
      });
      expect(connectCheck?.details).toMatchObject({
        tool_count: 1
      });
      expect(resourcesCheck?.details).toMatchObject({
        resources: [
          {
            server_id: "legacy",
            uri: "memory://sse/readme"
          }
        ]
      });
      expect(resourceTemplatesCheck?.details).toMatchObject({
        resource_templates: [
          {
            server_id: "legacy",
            uri_template: "memory://sse/item/{id}"
          }
        ]
      });
      expect(promptsCheck?.details).toMatchObject({
        prompts: [
          {
            server_id: "legacy",
            name: "sseSummarize"
          }
        ]
      });
      expect(output).toContain("transport=sse");
      expect(output).toContain("mcp.legacy.echo");
      expect(output).not.toContain("sse-secret");
    } finally {
      await fixture.close();
    }
  });

  it("reports invalid MCP config files", async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, "bad-mcp.json"), "{bad", "utf8");

    const report = await inspectMcpConfig({
      cwd: dir,
      environ: {
        GOD_CODE_MCP_CONFIG_FILE: "bad-mcp.json"
      }
    });

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.status).toBe("error");
    expect(report.checks[0]?.message).toContain("MCP config file must be valid JSON");
  });

  it("connects to configured MCP stdio servers when requested", async () => {
    const report = await inspectMcpConfig({
      connect: true,
      resources: true,
      resourceTemplates: true,
      prompts: true,
      environ: {
        GOD_CODE_MCP_SERVERS: JSON.stringify([
          {
            id: "demo",
            command: "python3",
            args: [fixturePath],
            env: {
              SECRET_VALUE: "not-rendered"
            }
          }
        ])
      }
    });
    const output = renderMcpDiagnosticReport(report);
    const connectCheck = report.checks.find((check) => check.name === "mcp_connect");
    const resourcesCheck = report.checks.find((check) => check.name === "mcp_resources");
    const resourceTemplatesCheck = report.checks.find((check) => check.name === "mcp_resource_templates");
    const promptsCheck = report.checks.find((check) => check.name === "mcp_prompts");
    const json = JSON.parse(renderMcpDiagnosticReportJson(report));

    expect(report.ok).toBe(true);
    expect(connectCheck?.status).toBe("ok");
    expect(resourcesCheck?.status).toBe("ok");
    expect(resourceTemplatesCheck?.status).toBe("ok");
    expect(promptsCheck?.status).toBe("ok");
    expect(output).toContain("mcp.demo.echo");
    expect(output).toContain("schema=type=object required=- properties=value");
    expect(output).toContain("resource=memory://demo/readme");
    expect(output).toContain("resource_template=memory://demo/item/{id}");
    expect(output).toContain("prompt=summarize");
    expect(connectCheck?.details).toMatchObject({
      tool_count: 3
    });
    expect(json.checks.find((check: { name: string }) => check.name === "mcp_resources").details.resources[0]).toMatchObject({
      server_id: "demo",
      uri: "memory://demo/readme",
      name: "Demo README"
    });
    expect(json.checks.find((check: { name: string }) => check.name === "mcp_resource_templates").details.resource_templates[0]).toMatchObject({
      server_id: "demo",
      uri_template: "memory://demo/item/{id}",
      name: "Demo Item"
    });
    expect(json.checks.find((check: { name: string }) => check.name === "mcp_prompts").details.prompts[0]).toMatchObject({
      server_id: "demo",
      name: "summarize"
    });
    expect(output).not.toContain("not-rendered");
  });

  it("reads MCP resources and gets MCP prompts through explicit diagnostics", async () => {
    const environ = {
      GOD_CODE_MCP_SERVERS: JSON.stringify([
        {
          id: "demo",
          command: "python3",
          args: [fixturePath]
        }
      ])
    };

    const resourceReport = await readMcpResource({
      uri: "memory://demo/readme",
      environ
    });
    const subscribeReport = await subscribeMcpResource({
      uri: "memory://demo/readme",
      environ
    });
    const unsubscribeReport = await unsubscribeMcpResource({
      uri: "memory://demo/readme",
      environ
    });
    const updateReport = await waitMcpResourceUpdate({
      uri: "memory://demo/readme",
      timeoutMs: 1000,
      environ
    });
    const updateWatchReport = await watchMcpResourceUpdates({
      uri: "memory://demo/readme",
      timeoutMs: 1000,
      maxEvents: 3,
      environ
    });
    const updateLoopReport = await loopMcpResourceUpdates({
      uris: ["memory://demo/readme"],
      timeoutMs: 1000,
      maxEvents: 3,
      environ
    });
    const completePromptReport = await completeMcpPrompt({
      name: "summarize",
      argument: { name: "text", value: "alph" },
      environ
    });
    const completeResourceTemplateReport = await completeMcpResourceTemplate({
      uriTemplate: "memory://demo/item/{id}",
      argument: { name: "id", value: "item" },
      environ
    });
    const promptReport = await getMcpPrompt({
      name: "summarize",
      arguments: { text: "hello" },
      environ
    });
    const resourceOutput = renderMcpDiagnosticReport(resourceReport);
    const promptOutput = renderMcpDiagnosticReport(promptReport);

    expect(resourceReport.ok).toBe(true);
    expect(resourceOutput).toContain("content=memory://demo/readme");
    expect(resourceOutput).toContain("Demo README resource body.");
    expect(resourceReport.checks.find((check) => check.name === "mcp_read_resource")?.details).toMatchObject({
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

    expect(subscribeReport.ok).toBe(true);
    expect(subscribeReport.checks.find((check) => check.name === "mcp_subscribe_resource")?.details).toMatchObject({
      server_id: "demo",
      uri: "memory://demo/readme",
      subscribed: true
    });
    expect(renderMcpDiagnosticReport(subscribeReport)).toContain("subscribed=true");

    expect(unsubscribeReport.ok).toBe(true);
    expect(unsubscribeReport.checks.find((check) => check.name === "mcp_unsubscribe_resource")?.details).toMatchObject({
      server_id: "demo",
      uri: "memory://demo/readme",
      subscribed: false
    });
    expect(renderMcpDiagnosticReport(unsubscribeReport)).toContain("subscribed=false");

    expect(updateReport.ok).toBe(true);
    expect(updateReport.checks.find((check) => check.name === "mcp_resource_update")?.details).toMatchObject({
      server_id: "demo",
      uri: "memory://demo/readme",
      updated: true,
      timed_out: false,
      notification_uri: "memory://demo/readme"
    });
    expect(renderMcpDiagnosticReport(updateReport)).toContain("resource_update=memory://demo/readme");

    expect(updateWatchReport.ok).toBe(true);
    expect(updateWatchReport.checks.find((check) => check.name === "mcp_resource_update_watch")?.details).toMatchObject({
      server_id: "demo",
      uri: "memory://demo/readme",
      event_count: 3,
      max_events: 3,
      timed_out: false,
      updates: [
        { uri: "memory://demo/readme" },
        { uri: "memory://demo/readme" },
        { uri: "memory://demo/readme" }
      ]
    });
    expect(renderMcpDiagnosticReport(updateWatchReport)).toContain("resource_update_watch=memory://demo/readme");

    expect(updateLoopReport.ok).toBe(true);
    expect(updateLoopReport.checks.find((check) => check.name === "mcp_resource_update_loop")?.details).toMatchObject({
      server_ids: ["demo"],
      uris: ["memory://demo/readme"],
      subscription_count: 1,
      event_count: 3,
      max_events: 3,
      timed_out: false,
      updates: [
        { index: 0, server_id: "demo", uri: "memory://demo/readme" },
        { index: 1, server_id: "demo", uri: "memory://demo/readme" },
        { index: 2, server_id: "demo", uri: "memory://demo/readme" }
      ]
    });
    expect(renderMcpDiagnosticReport(updateLoopReport)).toContain("resource_update_loop=memory://demo/readme");

    expect(completePromptReport.ok).toBe(true);
    expect(completePromptReport.checks.find((check) => check.name === "mcp_complete_prompt")?.details).toMatchObject({
      server_id: "demo",
      ref_type: "prompt",
      ref: "summarize",
      values: ["alpha", "alphabet"]
    });
    expect(renderMcpDiagnosticReport(completePromptReport)).toContain("completion_ref=summarize");
    expect(renderMcpCompletionValues(completePromptReport)).toBe("alpha\nalphabet");
    expect(renderMcpCompletionJsonl(completePromptReport).split("\n").map((line) => JSON.parse(line))).toEqual([
      {
        value: "alpha",
        index: 0,
        server_id: "demo",
        ref_type: "prompt",
        ref: "summarize",
        argument: {
          name: "text",
          value: "alph"
        }
      },
      {
        value: "alphabet",
        index: 1,
        server_id: "demo",
        ref_type: "prompt",
        ref: "summarize",
        argument: {
          name: "text",
          value: "alph"
        }
      }
    ]);

    expect(completeResourceTemplateReport.ok).toBe(true);
    expect(completeResourceTemplateReport.checks.find((check) => check.name === "mcp_complete_resource_template")?.details).toMatchObject({
      server_id: "demo",
      ref_type: "resource_template",
      ref: "memory://demo/item/{id}",
      values: ["item-1", "item-2"]
    });
    expect(renderMcpDiagnosticReport(completeResourceTemplateReport)).toContain("completion_ref=memory://demo/item/{id}");
    expect(renderMcpCompletionValues(completeResourceTemplateReport)).toBe("item-1\nitem-2");

    expect(promptReport.ok).toBe(true);
    expect(promptOutput).toContain("message role=user");
    expect(promptOutput).toContain("Summarize: hello");
    expect(promptReport.checks.find((check) => check.name === "mcp_get_prompt")?.details).toMatchObject({
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
  });

  it("builds MCP context messages for PromptBuilder injection", async () => {
    const mcpServers = JSON.stringify([
      {
        id: "demo",
        command: "python3",
        args: [fixturePath]
      }
    ]);
    const mcpContext = JSON.stringify([
      {
        type: "resource",
        uri: "memory://demo/readme"
      },
      {
        type: "prompt",
        name: "summarize",
        arguments: { text: "hello" }
      }
    ]);
    const report = await inspectMcpContext({
      environ: {
        GOD_CODE_MCP_SERVERS: mcpServers,
        GOD_CODE_MCP_CONTEXT: mcpContext
      }
    });
    const contextCheck = report.checks.find((check) => check.name === "mcp_context");

    expect(report.ok).toBe(true);
    expect(contextCheck?.details).toMatchObject({
      entry_count: 2,
      message_count: 2,
      messages: [
        {
          kind: "user",
          role: "user",
          content: expect.stringContaining("Demo README resource body.")
        },
        {
          kind: "user",
          role: "user",
          content: expect.stringContaining("Summarize: hello")
        }
      ]
    });
    expect(renderMcpDiagnosticReport(report)).toContain("context_message=0");

    const previous = {
      GOD_CODE_MCP_SERVERS: process.env.GOD_CODE_MCP_SERVERS,
      GOD_CODE_MCP_CONFIG_FILE: process.env.GOD_CODE_MCP_CONFIG_FILE,
      GOD_CODE_MCP_CONTEXT: process.env.GOD_CODE_MCP_CONTEXT,
      GOD_CODE_MCP_CONTEXT_FILE: process.env.GOD_CODE_MCP_CONTEXT_FILE,
      GOD_CODE_PLUGIN_DIRS: process.env.GOD_CODE_PLUGIN_DIRS,
      GOD_CODE_PLUGIN_CONFIG_FILE: process.env.GOD_CODE_PLUGIN_CONFIG_FILE,
      GOD_CODE_PLUGIN_ENABLED_IDS: process.env.GOD_CODE_PLUGIN_ENABLED_IDS,
      GOD_CODE_PLUGIN_REGISTRY_FILE: process.env.GOD_CODE_PLUGIN_REGISTRY_FILE
    };
    process.env.GOD_CODE_MCP_SERVERS = mcpServers;
    delete process.env.GOD_CODE_MCP_CONFIG_FILE;
    process.env.GOD_CODE_MCP_CONTEXT = mcpContext;
    delete process.env.GOD_CODE_MCP_CONTEXT_FILE;
    delete process.env.GOD_CODE_PLUGIN_DIRS;
    delete process.env.GOD_CODE_PLUGIN_CONFIG_FILE;
    delete process.env.GOD_CODE_PLUGIN_ENABLED_IDS;
    delete process.env.GOD_CODE_PLUGIN_REGISTRY_FILE;
    let host: Awaited<ReturnType<typeof prepareGodCodeHost>> | undefined;
    try {
      host = await prepareGodCodeHost();
      expect(host.initialMessages).toHaveLength(2);
      expect(host.initialMessages[0]?.kind).toBe("user");
      expect("content" in host.initialMessages[0]!).toBe(true);
      expect((host.initialMessages[0] as { content: string }).content).toContain("Demo README resource body.");
    } finally {
      await host?.close();
      restoreEnv(previous);
    }
  });

  it("deduplicates and truncates MCP context messages", async () => {
    const mcpServers = JSON.stringify([
      {
        id: "demo",
        command: "python3",
        args: [fixturePath]
      }
    ]);
    const mcpContext = JSON.stringify([
      {
        type: "resource",
        uri: "memory://demo/readme"
      },
      {
        type: "resource",
        uri: "memory://demo/readme"
      },
      {
        type: "prompt",
        name: "summarize",
        arguments: { text: "hello" }
      }
    ]);

    const report = await inspectMcpContext({
      environ: {
        GOD_CODE_MCP_SERVERS: mcpServers,
        GOD_CODE_MCP_CONTEXT: mcpContext,
        GOD_CODE_MCP_CONTEXT_MAX_ENTRY_CHARS: "96"
      }
    });
    const contextCheck = report.checks.find((check) => check.name === "mcp_context");
    const details = contextCheck?.details as {
      requested_entry_count: number;
      entry_count: number;
      message_count: number;
      skipped_duplicate_count: number;
      truncated_message_count: number;
      limits: { max_entry_chars: number; dedupe: boolean };
      messages: Array<{ content: string; content_chars: number; truncated: boolean }>;
    };
    const output = renderMcpDiagnosticReport(report);

    expect(report.ok).toBe(true);
    expect(details.requested_entry_count).toBe(3);
    expect(details.entry_count).toBe(2);
    expect(details.message_count).toBe(2);
    expect(details.skipped_duplicate_count).toBe(1);
    expect(details.truncated_message_count).toBeGreaterThanOrEqual(1);
    expect(details.limits).toMatchObject({
      max_entry_chars: 96,
      dedupe: true
    });
    expect(details.messages[0]?.content_chars).toBeLessThanOrEqual(96);
    expect(details.messages[0]?.truncated).toBe(true);
    expect(details.messages[0]?.content).toContain("truncated by GOD_CODE_MCP_CONTEXT_MAX_ENTRY_CHARS");
    expect(output).toContain("skipped_duplicates=1");
    expect(output).toContain("context_limits_dedupe=true");
  });

  it("reports invalid MCP context limit configuration", async () => {
    const report = await inspectMcpContext({
      environ: {
        GOD_CODE_MCP_CONTEXT_MAX_ENTRY_CHARS: "0"
      }
    });

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.name).toBe("mcp_context_config");
    expect(report.checks[0]?.message).toContain("GOD_CODE_MCP_CONTEXT_MAX_ENTRY_CHARS must be a positive integer");
  });

  it("renders MCP shell completion hook scripts", () => {
    const bash = renderMcpCompletionScript("bash");
    const zsh = renderMcpCompletionScript("zsh", { programName: "god-code-dev" });

    expect(bash).toContain("complete -F _god_code_mcp_completion -- 'god-code'");
    expect(bash).toContain("complete-prompt");
    expect(bash).toContain("complete-resource-template");
    expect(bash).toContain("--values-only");
    expect(bash).toContain("completion-script");

    expect(zsh).toContain("compdef _god_code_mcp_completion 'god-code-dev'");
    expect(zsh).toContain("mcp_subcommands=(inspect-config");
    expect(zsh).toContain("completion-script");
    expect(zsh).toContain("--values-only");
  });

  it("installs MCP shell completion hooks into managed rc blocks", async () => {
    const dir = await createTempDir();
    const rcFile = path.join(dir, ".bashrc");
    await fs.writeFile(rcFile, "export EXISTING=1\n", "utf8");

    const dryRun = await installMcpCompletionScript({
      shell: "bash",
      programName: "god-code-test",
      rcFile,
      dryRun: true
    });
    expect(dryRun.action).toBe("would_append");
    expect(await fs.readFile(rcFile, "utf8")).toBe("export EXISTING=1\n");
    expect(renderMcpCompletionInstallReport(dryRun)).toContain("dry-run");

    const installed = await installMcpCompletionScript({
      shell: "bash",
      programName: "god-code-test",
      rcFile,
      dryRun: false
    });
    const installedContent = await fs.readFile(rcFile, "utf8");
    expect(installed.action).toBe("append");
    expect(installedContent).toContain("# >>> GOD-code MCP completion >>>");
    expect(installedContent).toContain("complete -F _god_code_mcp_completion -- 'god-code-test'");
    expect(JSON.parse(renderMcpCompletionInstallReportJson(installed)).changed).toBe(true);

    const unchanged = await installMcpCompletionScript({
      shell: "bash",
      programName: "god-code-test",
      rcFile,
      dryRun: false
    });
    expect(unchanged.action).toBe("noop");

    const updated = await installMcpCompletionScript({
      shell: "bash",
      programName: "god-code-next",
      rcFile,
      dryRun: false
    });
    const updatedContent = await fs.readFile(rcFile, "utf8");
    expect(updated.action).toBe("update");
    expect(updatedContent).toContain("complete -F _god_code_mcp_completion -- 'god-code-next'");
    expect(updatedContent).not.toContain("complete -F _god_code_mcp_completion -- 'god-code-test'");
  });

  it("reports structured MCP runtime connection errors without leaking env values", async () => {
    const report = await inspectMcpConfig({
      connect: true,
      environ: {
        GOD_CODE_MCP_SERVERS: JSON.stringify([
          {
            id: "broken",
            command: "__god_code_missing_mcp_command__",
            env: {
              SECRET_VALUE: "not-rendered"
            }
          }
        ])
      }
    });
    const output = renderMcpDiagnosticReport(report);
    const connectCheck = report.checks.find((check) => check.name === "mcp_connect");
    const json = JSON.parse(renderMcpDiagnosticReportJson(report));

    expect(report.ok).toBe(false);
    expect(connectCheck?.status).toBe("error");
    expect(connectCheck?.details).toMatchObject({
      error_code: "connect_failed",
      server_id: "broken",
      server: {
        id: "broken",
        command: "__god_code_missing_mcp_command__",
        env_keys: ["SECRET_VALUE"]
      }
    });
    expect(output).toContain("error_code=connect_failed");
    expect(output).toContain("failed_server=broken");
    expect(output).not.toContain("not-rendered");
    expect(json.checks.find((check: { name: string }) => check.name === "mcp_connect").details.error_code).toBe("connect_failed");
  });
});

describe("CLI plugin diagnostics", () => {
  it("renders plugin manifest schema as text and JSON", () => {
    const text = renderPluginManifestSchema();
    const json = JSON.parse(renderPluginManifestSchemaJson());

    expect(text).toContain("plugin.json or skill.json");
    expect(text).toContain("Required fields: id, name, version");
    expect(json.required).toEqual(["id", "name", "version"]);
    expect(json.properties.tools.items.required).toEqual(["name", "description"]);
    expect(json.properties.tools.items.properties.input_schema.type).toBe("object");
    expect(text).toContain("Runtime fields: kind=node-subprocess");
    expect(json.properties.runtime.properties.kind.enum).toEqual(["node-subprocess"]);
  });

  it("validates plugin manifest files", async () => {
    const dir = await createTempDir();
    const manifestPath = path.join(dir, "plugin.json");
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        id: "plugin-1",
        name: "Plugin One",
        version: "0.1.0",
        tools: [{ name: "plugin.one.echo", description: "echo" }],
        permissions: ["read-workspace"],
        promptFragments: ["Plugin prompt fragment."]
      }),
      "utf8"
    );

    const report = await validatePluginManifestTarget(manifestPath);
    const text = renderPluginDiagnosticReport(report);
    const json = JSON.parse(renderPluginDiagnosticReportJson(report));

    expect(report.ok).toBe(true);
    expect(text).toContain("OK plugin_manifest:");
    expect(text).toContain("tool=plugin.one.echo");
    expect(json.checks[1].details.tool_count).toBe(1);
  });

  it("validates plugin manifests with sandbox runtime metadata without leaking env values", async () => {
    const dir = await createTempDir();
    await fs.writeFile(
      path.join(dir, "plugin.json"),
      JSON.stringify({
        id: "plugin-runtime",
        name: "Runtime Plugin",
        version: "0.1.0",
        runtime: {
          kind: "node-subprocess",
          entry: "handler.mjs",
          timeout_ms: 5000,
          env_keys: ["PLUGIN_RUNTIME_SECRET"]
        },
        tools: [{ name: "plugin.runtime.echo", description: "runtime echo" }]
      }),
      "utf8"
    );
    const previousSecret = process.env.PLUGIN_RUNTIME_SECRET;
    process.env.PLUGIN_RUNTIME_SECRET = "not-rendered";
    try {
      const report = await validatePluginManifestTarget(dir);
      const text = renderPluginDiagnosticReport(report);
      const json = JSON.parse(renderPluginDiagnosticReportJson(report));
      const details = json.checks[1].details;

      expect(report.ok).toBe(true);
      expect(text).toContain("runtime=node-subprocess");
      expect(text).toContain("entry=handler.mjs");
      expect(text).not.toContain("not-rendered");
      expect(details.runtime).toEqual({
        kind: "node-subprocess",
        entry: "handler.mjs",
        timeout_ms: 5000,
        env_keys: ["PLUGIN_RUNTIME_SECRET"]
      });
      expect(JSON.stringify(json)).not.toContain("not-rendered");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.PLUGIN_RUNTIME_SECRET;
      } else {
        process.env.PLUGIN_RUNTIME_SECRET = previousSecret;
      }
    }
  });

  it("validates the packaged demo plugin example", async () => {
    const packageDir = path.join(repoRoot, "examples", "plugins", "demo-plugin");
    const report = await validatePluginManifestTarget(packageDir);
    const json = JSON.parse(renderPluginDiagnosticReportJson(report));
    const readme = await fs.readFile(path.join(packageDir, "README.md"), "utf8");
    const inputFixture = JSON.parse(
      await fs.readFile(path.join(packageDir, "fixtures", "echo-input.json"), "utf8")
    );
    const outputFixture = JSON.parse(
      await fs.readFile(path.join(packageDir, "fixtures", "echo-output.json"), "utf8")
    );

    expect(report.ok).toBe(true);
    expect(json.checks[1].details.id).toBe("demo-plugin");
    expect(json.checks[1].details.tools[0].name).toBe("plugin.demo.echo");
    expect(readme).toContain("manifest-only GOD-code plugin package");
    expect(inputFixture.value).toBe("hello from demo plugin");
    expect(outputFixture.echoed).toBe(inputFixture.value);
  });

  it("validates the packaged executable plugin example", async () => {
    const packageDir = path.join(repoRoot, "examples", "plugins", "executable-plugin");
    const report = await validatePluginManifestTarget(packageDir);
    const json = JSON.parse(renderPluginDiagnosticReportJson(report));

    expect(report.ok).toBe(true);
    expect(json.checks[1].details.id).toBe("executable-plugin");
    expect(json.checks[1].details.runtime).toMatchObject({
      kind: "node-subprocess",
      entry: "handler.mjs"
    });
    expect(json.checks[1].details.tools[0].name).toBe("plugin.executable.echo");
  });

  it("inspects configured plugin directories and runtime-backed tools", async () => {
    const packageDir = path.join(repoRoot, "examples", "plugins", "executable-plugin");
    const report = await inspectPluginConfig({
      environ: {
        GOD_CODE_PLUGIN_DIRS: JSON.stringify([packageDir]),
        GOD_CODE_PLUGIN_ENABLED_IDS: JSON.stringify(["executable-plugin"])
      }
    });
    const text = renderPluginDiagnosticReport(report);
    const json = JSON.parse(renderPluginDiagnosticReportJson(report));
    const config = json.checks.find((check: { name: string }) => check.name === "plugin_config");
    const runtime = json.checks.find((check: { name: string }) => check.name === "plugin_runtime");

    expect(report.ok).toBe(true);
    expect(text).toContain("OK plugin_config:");
    expect(text).toContain("plugin=executable-plugin");
    expect(config.details.source).toBe("env");
    expect(config.details.enabled_plugin_ids).toEqual(["executable-plugin"]);
    expect(runtime.details.tool_count).toBe(1);
    expect(runtime.details.tools[0].name).toBe("plugin.executable.echo");
  });

  it("inspects plugin config files relative to the config file directory", async () => {
    const dir = await createTempDir();
    const packageDir = path.join(repoRoot, "examples", "plugins", "executable-plugin");
    await fs.writeFile(
      path.join(dir, "plugins.json"),
      JSON.stringify({
        plugin_dirs: [path.relative(dir, packageDir)],
        enabled_plugin_ids: ["executable-plugin"]
      }),
      "utf8"
    );

    const report = await inspectPluginConfig({
      cwd: dir,
      environ: {
        GOD_CODE_PLUGIN_CONFIG_FILE: "plugins.json"
      }
    });
    const json = JSON.parse(renderPluginDiagnosticReportJson(report));

    expect(report.ok).toBe(true);
    expect(json.checks[0].details.source).toBe("file");
    expect(json.checks[1].details.plugins[0].id).toBe("executable-plugin");
  });

  it("lists and inspects local plugin registry entries", async () => {
    const dir = await createTempDir();
    const executableDir = path.join(repoRoot, "examples", "plugins", "executable-plugin");
    const skillDir = path.join(repoRoot, "examples", "plugins", "demo-skill");
    await fs.writeFile(
      path.join(dir, "registry.json"),
      JSON.stringify({
        plugins: [
          {
            id: "executable-plugin",
            path: path.relative(dir, executableDir),
            enabled: true,
            tags: ["demo", "sandbox"]
          },
          {
            id: "demo-skill",
            path: path.relative(dir, skillDir),
            enabled: false,
            tags: ["demo", "skill"]
          }
        ]
      }),
      "utf8"
    );

    const environ = {
      GOD_CODE_PLUGIN_REGISTRY_FILE: "registry.json"
    };
    const list = await listConfiguredPlugins({ cwd: dir, environ });
    const inspect = await inspectConfiguredPlugin("demo-skill", { cwd: dir, environ });
    const config = await inspectPluginConfig({ cwd: dir, environ });
    const listJson = JSON.parse(renderPluginDiagnosticReportJson(list));
    const inspectJson = JSON.parse(renderPluginDiagnosticReportJson(inspect));
    const configJson = JSON.parse(renderPluginDiagnosticReportJson(config));

    expect(list.ok).toBe(true);
    expect(listJson.checks[0].details.plugins.map((plugin: { id: string }) => plugin.id)).toEqual([
      "executable-plugin",
      "demo-skill"
    ]);
    expect(listJson.checks[0].details.plugins[1].enabled).toBe(false);
    expect(inspect.ok).toBe(true);
    expect(inspectJson.checks[0].details.plugin.id).toBe("demo-skill");
    expect(inspectJson.checks[0].details.plugin.enabled).toBe(false);
    expect(config.ok).toBe(true);
    expect(configJson.checks[0].details.source).toBe("registry");
    expect(configJson.checks[1].details.plugins.map((plugin: { id: string }) => plugin.id)).toEqual([
      "executable-plugin"
    ]);
  });

  it("plans local registry install without writing", async () => {
    const dir = await createTempDir();
    const packageDir = await createPluginPackage(dir, "plugins/demo-plugin", "demo-plugin");
    const registryFile = path.join(dir, "registry.json");

    const result = await installLocalPluginRegistryEntry({
      cwd: dir,
      packageDir,
      registryFile: "registry.json",
      dryRun: true,
      yes: false,
      tags: ["local", "demo"]
    });
    const text = renderPluginRegistryInstallResult(result);
    const json = JSON.parse(renderPluginRegistryInstallResultJson(result));

    expect(result.action).toBe("create_registry");
    expect(result.changed).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(result.path_value).toBe("plugins/demo-plugin");
    expect(text).toContain("action: create_registry");
    expect(json.type).toBe("plugin_local_registry_install");
    await expect(fs.stat(registryFile)).rejects.toThrow();
  });

  it("writes local registry installs and keeps paths relative to the registry file", async () => {
    const dir = await createTempDir();
    const packageDir = await createPluginPackage(dir, "packages/demo-plugin", "demo-plugin");
    const registryDir = path.join(dir, ".god-code");

    const result = await installLocalPluginRegistryEntry({
      cwd: dir,
      packageDir: path.relative(dir, packageDir),
      registryFile: ".god-code/plugin-registry.json",
      dryRun: false,
      yes: true,
      tags: ["local"],
      enabled: true
    });
    const registryPath = path.join(registryDir, "plugin-registry.json");
    const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
    const list = await listConfiguredPlugins({
      cwd: dir,
      environ: {
        GOD_CODE_PLUGIN_REGISTRY_FILE: ".god-code/plugin-registry.json"
      }
    });
    const listJson = JSON.parse(renderPluginDiagnosticReportJson(list));

    expect(result.dry_run).toBe(false);
    expect(result.action).toBe("create_registry");
    expect(registry.plugins).toEqual([
      {
        id: "demo-plugin",
        path: "../packages/demo-plugin",
        enabled: true,
        tags: ["local"]
      }
    ]);
    expect(list.ok).toBe(true);
    expect(listJson.checks[0].details.plugins[0].id).toBe("demo-plugin");
  });

  it("updates same-path registry entries and preserves state by default", async () => {
    const dir = await createTempDir();
    const packageDir = await createPluginPackage(dir, "plugins/demo-plugin", "demo-plugin");

    await installLocalPluginRegistryEntry({
      cwd: dir,
      packageDir,
      registryFile: "registry.json",
      dryRun: false,
      yes: true,
      enabled: false,
      tags: ["initial"]
    });

    const noOp = await installLocalPluginRegistryEntry({
      cwd: dir,
      packageDir,
      registryFile: "registry.json",
      dryRun: true,
      yes: false
    });
    const update = await installLocalPluginRegistryEntry({
      cwd: dir,
      packageDir,
      registryFile: "registry.json",
      dryRun: false,
      yes: true,
      enabled: true,
      tags: ["updated"]
    });
    const registry = JSON.parse(await fs.readFile(path.join(dir, "registry.json"), "utf8"));

    expect(noOp.action).toBe("no_op");
    expect(noOp.enabled).toBe(false);
    expect(noOp.tags).toEqual(["initial"]);
    expect(update.action).toBe("update_entry");
    expect(registry.plugins[0]).toMatchObject({
      id: "demo-plugin",
      enabled: true,
      tags: ["updated"]
    });
  });

  it("rejects duplicate ids with different paths unless replace is explicit", async () => {
    const dir = await createTempDir();
    const firstPackageDir = await createPluginPackage(dir, "plugins/first", "demo-plugin");
    const secondPackageDir = await createPluginPackage(dir, "plugins/second", "demo-plugin");

    await installLocalPluginRegistryEntry({
      cwd: dir,
      packageDir: firstPackageDir,
      registryFile: "registry.json",
      dryRun: false,
      yes: true
    });

    await expect(
      installLocalPluginRegistryEntry({
        cwd: dir,
        packageDir: secondPackageDir,
        registryFile: "registry.json",
        dryRun: true,
        yes: false
      })
    ).rejects.toThrow("--replace");

    const replaced = await installLocalPluginRegistryEntry({
      cwd: dir,
      packageDir: secondPackageDir,
      registryFile: "registry.json",
      dryRun: false,
      yes: true,
      replace: true
    });
    const registry = JSON.parse(await fs.readFile(path.join(dir, "registry.json"), "utf8"));

    expect(replaced.action).toBe("replace_entry");
    expect(registry.plugins[0].path).toBe("plugins/second");
  });

  it("rejects unsafe local registry install inputs", async () => {
    const dir = await createTempDir();
    const outsideDir = await createTempDir();
    const outsidePackageDir = await createPluginPackage(outsideDir, "plugins/outside", "outside-plugin");
    const packageDir = await createPluginPackage(dir, "plugins/demo-plugin", "demo-plugin");

    await expect(
      installLocalPluginRegistryEntry({
        cwd: dir,
        packageDir: outsidePackageDir,
        registryFile: "registry.json",
        dryRun: true,
        yes: false
      })
    ).rejects.toThrow("inside current workspace");

    await expect(
      installLocalPluginRegistryEntry({
        cwd: dir,
        packageDir,
        registryFile: "registry.json",
        dryRun: true,
        yes: false,
        tags: ["bad tag"]
      })
    ).rejects.toThrow("Plugin registry tag");
  });

  it("plans local registry uninstall without writing", async () => {
    const dir = await createTempDir();
    const registryPath = path.join(dir, "registry.json");
    await writePluginRegistry(registryPath, {
      plugins: [
        {
          id: "demo-plugin",
          path: "plugins/demo-plugin",
          enabled: false,
          tags: ["local", "demo"]
        }
      ]
    });

    const result = await uninstallLocalPluginRegistryEntry({
      cwd: dir,
      pluginId: "demo-plugin",
      registryFile: "registry.json",
      dryRun: true,
      yes: false
    });
    const text = renderPluginRegistryUninstallResult(result);
    const json = JSON.parse(renderPluginRegistryUninstallResultJson(result));
    const registryAfterDryRun = JSON.parse(await fs.readFile(registryPath, "utf8"));

    expect(result.action).toBe("remove_entry");
    expect(result.changed).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(result.removed_path).toBe("plugins/demo-plugin");
    expect(result.enabled).toBe(false);
    expect(result.tags).toEqual(["local", "demo"]);
    expect(text).toContain("GOD-code plugin registry uninstall:");
    expect(json.type).toBe("plugin_local_registry_uninstall");
    expect(registryAfterDryRun.plugins).toHaveLength(1);
  });

  it("writes local registry uninstall while preserving unrelated entries and top-level fields", async () => {
    const dir = await createTempDir();
    const registryPath = path.join(dir, "registry.json");
    await writePluginRegistry(registryPath, {
      registry_version: 1,
      plugins: [
        {
          id: "demo-plugin",
          path: "plugins/demo-plugin",
          enabled: true,
          tags: ["remove"]
        },
        {
          id: "other-plugin",
          path: "plugins/other-plugin",
          enabled: false,
          tags: ["keep"]
        }
      ]
    });

    const result = await uninstallLocalPluginRegistryEntry({
      cwd: dir,
      pluginId: "demo-plugin",
      registryFile: "registry.json",
      dryRun: false,
      yes: true
    });
    const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));

    expect(result.dry_run).toBe(false);
    expect(result.action).toBe("remove_entry");
    expect(registry.registry_version).toBe(1);
    expect(registry.plugins).toEqual([
      {
        id: "other-plugin",
        path: "plugins/other-plugin",
        enabled: false,
        tags: ["keep"]
      }
    ]);
  });

  it("handles missing local registry uninstall ids explicitly", async () => {
    const dir = await createTempDir();
    const registryPath = path.join(dir, "registry.json");
    await writePluginRegistry(registryPath, {
      plugins: [
        {
          id: "demo-plugin",
          path: "plugins/demo-plugin",
          enabled: true
        }
      ]
    });

    await expect(
      uninstallLocalPluginRegistryEntry({
        cwd: dir,
        pluginId: "missing-plugin",
        registryFile: "registry.json",
        dryRun: true,
        yes: false
      })
    ).rejects.toThrow("not found");

    const result = await uninstallLocalPluginRegistryEntry({
      cwd: dir,
      pluginId: "missing-plugin",
      registryFile: "registry.json",
      dryRun: true,
      yes: false,
      missingOk: true
    });

    expect(result.action).toBe("no_op");
    expect(result.changed).toBe(false);
    expect(result.removed_path).toBeNull();
    expect(result.enabled).toBeNull();
  });

  it("rejects unsafe local registry uninstall inputs", async () => {
    const dir = await createTempDir();
    await writePluginRegistry(path.join(dir, "duplicate-registry.json"), {
      plugins: [
        { id: "demo-plugin", path: "plugins/one" },
        { id: "demo-plugin", path: "plugins/two" }
      ]
    });

    await expect(
      uninstallLocalPluginRegistryEntry({
        cwd: dir,
        pluginId: "demo-plugin",
        registryFile: "missing-registry.json",
        dryRun: true,
        yes: false,
        missingOk: true
      })
    ).rejects.toThrow("does not exist");

    await expect(
      uninstallLocalPluginRegistryEntry({
        cwd: dir,
        pluginId: "demo-plugin",
        registryFile: "duplicate-registry.json",
        dryRun: true,
        yes: false
      })
    ).rejects.toThrow("Duplicate plugin registry id");
  });

  it("plans local registry disable without writing", async () => {
    const dir = await createTempDir();
    const registryPath = path.join(dir, "registry.json");
    await writePluginRegistry(registryPath, {
      plugins: [
        {
          id: "demo-plugin",
          path: "plugins/demo-plugin",
          enabled: true,
          tags: ["local", "demo"]
        }
      ]
    });

    const result = await setLocalPluginRegistryEntryEnabled({
      cwd: dir,
      pluginId: "demo-plugin",
      enabled: false,
      registryFile: "registry.json",
      dryRun: true,
      yes: false
    });
    const text = renderPluginRegistrySetEnabledResult(result);
    const json = JSON.parse(renderPluginRegistrySetEnabledResultJson(result));
    const registryAfterDryRun = JSON.parse(await fs.readFile(registryPath, "utf8"));

    expect(result.action).toBe("disable_entry");
    expect(result.changed).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(result.previous_enabled).toBe(true);
    expect(result.enabled).toBe(false);
    expect(result.path).toBe("plugins/demo-plugin");
    expect(result.tags).toEqual(["local", "demo"]);
    expect(text).toContain("GOD-code plugin registry state:");
    expect(json.type).toBe("plugin_local_registry_set_enabled");
    expect(registryAfterDryRun.plugins[0].enabled).toBe(true);
  });

  it("writes local registry disable and enable while preserving metadata", async () => {
    const dir = await createTempDir();
    const registryPath = path.join(dir, "registry.json");
    await writePluginRegistry(registryPath, {
      registry_version: 1,
      plugins: [
        {
          id: "demo-plugin",
          path: "plugins/demo-plugin",
          enabled: true,
          tags: ["local"],
          extra_field: "preserved"
        },
        {
          id: "other-plugin",
          path: "plugins/other-plugin",
          enabled: false
        }
      ]
    });

    const disabled = await setLocalPluginRegistryEntryEnabled({
      cwd: dir,
      pluginId: "demo-plugin",
      enabled: false,
      registryFile: "registry.json",
      dryRun: false,
      yes: true
    });
    const afterDisable = JSON.parse(await fs.readFile(registryPath, "utf8"));
    const enabled = await setLocalPluginRegistryEntryEnabled({
      cwd: dir,
      pluginId: "demo-plugin",
      enabled: true,
      registryFile: "registry.json",
      dryRun: false,
      yes: true
    });
    const afterEnable = JSON.parse(await fs.readFile(registryPath, "utf8"));

    expect(disabled.action).toBe("disable_entry");
    expect(enabled.action).toBe("enable_entry");
    expect(afterDisable.registry_version).toBe(1);
    expect(afterDisable.plugins[0]).toMatchObject({
      id: "demo-plugin",
      path: "plugins/demo-plugin",
      enabled: false,
      tags: ["local"],
      extra_field: "preserved"
    });
    expect(afterDisable.plugins[1]).toMatchObject({
      id: "other-plugin",
      enabled: false
    });
    expect(afterEnable.plugins[0]).toMatchObject({
      id: "demo-plugin",
      path: "plugins/demo-plugin",
      enabled: true,
      tags: ["local"],
      extra_field: "preserved"
    });
  });

  it("treats missing enabled as enabled and reports no-op state changes", async () => {
    const dir = await createTempDir();
    const registryPath = path.join(dir, "registry.json");
    await writePluginRegistry(registryPath, {
      plugins: [
        {
          id: "demo-plugin",
          path: "plugins/demo-plugin",
          tags: ["local"]
        },
        {
          id: "disabled-plugin",
          path: "plugins/disabled-plugin",
          enabled: false
        }
      ]
    });

    const alreadyEnabled = await setLocalPluginRegistryEntryEnabled({
      cwd: dir,
      pluginId: "demo-plugin",
      enabled: true,
      registryFile: "registry.json",
      dryRun: false,
      yes: true
    });
    const alreadyDisabled = await setLocalPluginRegistryEntryEnabled({
      cwd: dir,
      pluginId: "disabled-plugin",
      enabled: false,
      registryFile: "registry.json",
      dryRun: false,
      yes: true
    });
    const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));

    expect(alreadyEnabled.action).toBe("no_op");
    expect(alreadyEnabled.changed).toBe(false);
    expect(alreadyEnabled.previous_enabled).toBe(true);
    expect(alreadyDisabled.action).toBe("no_op");
    expect(alreadyDisabled.changed).toBe(false);
    expect(registry.plugins[0].enabled).toBeUndefined();
    expect(registry.plugins[1].enabled).toBe(false);
  });

  it("rejects unsafe local registry enable and disable inputs", async () => {
    const dir = await createTempDir();
    await writePluginRegistry(path.join(dir, "duplicate-registry.json"), {
      plugins: [
        { id: "demo-plugin", path: "plugins/one" },
        { id: "demo-plugin", path: "plugins/two" }
      ]
    });
    await writePluginRegistry(path.join(dir, "registry.json"), {
      plugins: [{ id: "demo-plugin", path: "plugins/demo-plugin" }]
    });

    await expect(
      setLocalPluginRegistryEntryEnabled({
        cwd: dir,
        pluginId: "demo-plugin",
        enabled: false,
        registryFile: "missing-registry.json",
        dryRun: true,
        yes: false
      })
    ).rejects.toThrow("does not exist");

    await expect(
      setLocalPluginRegistryEntryEnabled({
        cwd: dir,
        pluginId: "missing-plugin",
        enabled: true,
        registryFile: "registry.json",
        dryRun: true,
        yes: false
      })
    ).rejects.toThrow("not found");

    await expect(
      setLocalPluginRegistryEntryEnabled({
        cwd: dir,
        pluginId: "demo-plugin",
        enabled: false,
        registryFile: "duplicate-registry.json",
        dryRun: true,
        yes: false
      })
    ).rejects.toThrow("Duplicate plugin registry id");
  });

  it("plans local registry tag add without writing", async () => {
    const dir = await createTempDir();
    const registryPath = path.join(dir, "registry.json");
    await writePluginRegistry(registryPath, {
      plugins: [
        {
          id: "demo-plugin",
          path: "plugins/demo-plugin",
          enabled: true,
          tags: ["local"]
        }
      ]
    });

    const result = await updateLocalPluginRegistryEntryTags({
      cwd: dir,
      pluginId: "demo-plugin",
      registryFile: "registry.json",
      dryRun: true,
      yes: false,
      addTags: ["demo"]
    });
    const text = renderPluginRegistryTagsResult(result);
    const json = JSON.parse(renderPluginRegistryTagsResultJson(result));
    const registryAfterDryRun = JSON.parse(await fs.readFile(registryPath, "utf8"));

    expect(result.action).toBe("add_tags");
    expect(result.changed).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(result.previous_tags).toEqual(["local"]);
    expect(result.tags).toEqual(["local", "demo"]);
    expect(result.added_tags).toEqual(["demo"]);
    expect(result.removed_tags).toEqual([]);
    expect(text).toContain("GOD-code plugin registry tags:");
    expect(json.type).toBe("plugin_local_registry_tags");
    expect(registryAfterDryRun.plugins[0].tags).toEqual(["local"]);
  });

  it("writes local registry tag updates while preserving metadata", async () => {
    const dir = await createTempDir();
    const registryPath = path.join(dir, "registry.json");
    await writePluginRegistry(registryPath, {
      registry_version: 1,
      plugins: [
        {
          id: "demo-plugin",
          path: "plugins/demo-plugin",
          enabled: true,
          tags: ["local"],
          extra_field: "preserved"
        },
        {
          id: "other-plugin",
          path: "plugins/other-plugin",
          tags: ["keep"]
        }
      ]
    });

    const added = await updateLocalPluginRegistryEntryTags({
      cwd: dir,
      pluginId: "demo-plugin",
      registryFile: "registry.json",
      dryRun: false,
      yes: true,
      addTags: ["demo", "local"]
    });
    const removed = await updateLocalPluginRegistryEntryTags({
      cwd: dir,
      pluginId: "demo-plugin",
      registryFile: "registry.json",
      dryRun: false,
      yes: true,
      removeTags: ["local"]
    });
    const set = await updateLocalPluginRegistryEntryTags({
      cwd: dir,
      pluginId: "demo-plugin",
      registryFile: "registry.json",
      dryRun: false,
      yes: true,
      setTags: ["stable", "release"]
    });
    const cleared = await updateLocalPluginRegistryEntryTags({
      cwd: dir,
      pluginId: "demo-plugin",
      registryFile: "registry.json",
      dryRun: false,
      yes: true,
      clear: true
    });
    const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));

    expect(added.action).toBe("add_tags");
    expect(added.tags).toEqual(["local", "demo"]);
    expect(added.added_tags).toEqual(["demo"]);
    expect(removed.action).toBe("remove_tags");
    expect(removed.tags).toEqual(["demo"]);
    expect(removed.removed_tags).toEqual(["local"]);
    expect(set.action).toBe("set_tags");
    expect(set.tags).toEqual(["stable", "release"]);
    expect(set.added_tags).toEqual(["stable", "release"]);
    expect(set.removed_tags).toEqual(["demo"]);
    expect(cleared.action).toBe("clear_tags");
    expect(cleared.tags).toEqual([]);
    expect(cleared.removed_tags).toEqual(["stable", "release"]);
    expect(registry.registry_version).toBe(1);
    expect(registry.plugins[0]).toMatchObject({
      id: "demo-plugin",
      path: "plugins/demo-plugin",
      enabled: true,
      tags: [],
      extra_field: "preserved"
    });
    expect(registry.plugins[1]).toEqual({
      id: "other-plugin",
      path: "plugins/other-plugin",
      tags: ["keep"]
    });
  });

  it("reports local registry tag no-op changes", async () => {
    const dir = await createTempDir();
    const registryPath = path.join(dir, "registry.json");
    await writePluginRegistry(registryPath, {
      plugins: [
        {
          id: "demo-plugin",
          path: "plugins/demo-plugin",
          tags: ["local"]
        }
      ]
    });

    const addExisting = await updateLocalPluginRegistryEntryTags({
      cwd: dir,
      pluginId: "demo-plugin",
      registryFile: "registry.json",
      dryRun: false,
      yes: true,
      addTags: ["local"]
    });
    const removeMissing = await updateLocalPluginRegistryEntryTags({
      cwd: dir,
      pluginId: "demo-plugin",
      registryFile: "registry.json",
      dryRun: false,
      yes: true,
      removeTags: ["missing"]
    });
    const setSame = await updateLocalPluginRegistryEntryTags({
      cwd: dir,
      pluginId: "demo-plugin",
      registryFile: "registry.json",
      dryRun: false,
      yes: true,
      setTags: ["local"]
    });
    const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));

    expect(addExisting.action).toBe("no_op");
    expect(addExisting.changed).toBe(false);
    expect(removeMissing.action).toBe("no_op");
    expect(removeMissing.changed).toBe(false);
    expect(setSame.action).toBe("no_op");
    expect(setSame.changed).toBe(false);
    expect(registry.plugins[0].tags).toEqual(["local"]);
  });

  it("rejects unsafe local registry tag inputs", async () => {
    const dir = await createTempDir();
    await writePluginRegistry(path.join(dir, "duplicate-registry.json"), {
      plugins: [
        { id: "demo-plugin", path: "plugins/one" },
        { id: "demo-plugin", path: "plugins/two" }
      ]
    });
    await writePluginRegistry(path.join(dir, "registry.json"), {
      plugins: [{ id: "demo-plugin", path: "plugins/demo-plugin" }]
    });
    await writePluginRegistry(path.join(dir, "invalid-tags-registry.json"), {
      plugins: [{ id: "demo-plugin", path: "plugins/demo-plugin", tags: ["bad tag"] }]
    });

    await expect(
      updateLocalPluginRegistryEntryTags({
        cwd: dir,
        pluginId: "demo-plugin",
        registryFile: "missing-registry.json",
        dryRun: true,
        yes: false,
        addTags: ["local"]
      })
    ).rejects.toThrow("does not exist");

    await expect(
      updateLocalPluginRegistryEntryTags({
        cwd: dir,
        pluginId: "missing-plugin",
        registryFile: "registry.json",
        dryRun: true,
        yes: false,
        addTags: ["local"]
      })
    ).rejects.toThrow("not found");

    await expect(
      updateLocalPluginRegistryEntryTags({
        cwd: dir,
        pluginId: "demo-plugin",
        registryFile: "duplicate-registry.json",
        dryRun: true,
        yes: false,
        addTags: ["local"]
      })
    ).rejects.toThrow("Duplicate plugin registry id");

    await expect(
      updateLocalPluginRegistryEntryTags({
        cwd: dir,
        pluginId: "demo-plugin",
        registryFile: "registry.json",
        dryRun: true,
        yes: false,
        addTags: ["bad tag"]
      })
    ).rejects.toThrow("Plugin registry tag");

    await expect(
      updateLocalPluginRegistryEntryTags({
        cwd: dir,
        pluginId: "demo-plugin",
        registryFile: "invalid-tags-registry.json",
        dryRun: true,
        yes: false,
        addTags: ["local"]
      })
    ).rejects.toThrow("Plugin registry tag");

    await expect(
      updateLocalPluginRegistryEntryTags({
        cwd: dir,
        pluginId: "demo-plugin",
        registryFile: "registry.json",
        dryRun: true,
        yes: false,
        addTags: ["local"],
        clear: true
      })
    ).rejects.toThrow("--set/--clear");
  });

  it("validates skill manifest directories", async () => {
    const dir = await createTempDir();
    await fs.writeFile(
      path.join(dir, "skill.json"),
      JSON.stringify({
        id: "skill-1",
        name: "Skill One",
        version: "0.1.0"
      }),
      "utf8"
    );

    const report = await validatePluginManifestTarget(dir);

    expect(report.ok).toBe(true);
    expect(report.checks[0]?.message).toContain("skill.json");
  });

  it("rejects invalid or ambiguous plugin manifest targets", async () => {
    const invalidDir = await createTempDir();
    await fs.writeFile(
      path.join(invalidDir, "plugin.json"),
      JSON.stringify({ id: "missing-fields" }),
      "utf8"
    );
    const invalidReport = await validatePluginManifestTarget(invalidDir);
    expect(invalidReport.ok).toBe(false);
    expect(invalidReport.checks[1]?.message).toContain("name");

    const ambiguousDir = await createTempDir();
    await fs.writeFile(path.join(ambiguousDir, "plugin.json"), "{}", "utf8");
    await fs.writeFile(path.join(ambiguousDir, "skill.json"), "{}", "utf8");
    const ambiguousReport = await validatePluginManifestTarget(ambiguousDir);
    expect(ambiguousReport.ok).toBe(false);
    expect(ambiguousReport.checks[0]?.message).toContain("both plugin.json and skill.json");
  });
});

async function createPluginPackage(rootDir: string, relativeDir: string, id: string): Promise<string> {
  const packageDir = path.join(rootDir, relativeDir);
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(
    path.join(packageDir, "plugin.json"),
    JSON.stringify({
      id,
      name: `Plugin ${id}`,
      version: "0.1.0",
      tools: [{ name: `${id}.echo`, description: "echo" }]
    }),
    "utf8"
  );
  return packageDir;
}

async function writePluginRegistry(registryPath: string, value: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, JSON.stringify(value, null, 2), "utf8");
}

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-cli-diag-"));
  tempDirs.push(dir);
  return dir;
}
