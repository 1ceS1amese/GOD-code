import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inspectMcpConfig,
  inspectMcpContext,
  readMcpResource,
  renderMcpDiagnosticReportJson
} from "../src/cli/mcp.js";
import { SdkMcpStdioRuntime } from "../src/mcp/runtime.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MCP diagnostic runtime cleanup lifecycle", () => {
  it("keeps a normal generic resource diagnostic after cleanup", async () => {
    installBaseRuntimeMocks();
    const close = vi.spyOn(SdkMcpStdioRuntime.prototype, "close").mockResolvedValue();
    vi.spyOn(SdkMcpStdioRuntime.prototype, "readResource").mockResolvedValue(
      demoResourceRead()
    );

    const report = await readMcpResource(resourceOptions());
    const operationChecks = report.checks.filter(
      (check) => check.name === "mcp_read_resource"
    );

    expect(operationChecks).toHaveLength(1);
    expect(operationChecks[0]).toMatchObject({
      name: "mcp_read_resource",
      status: "ok",
      message: "read MCP resource memory://demo/readme"
    });
    expect(report.ok).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("downgrades a successful generic operation when cleanup rejects", async () => {
    installBaseRuntimeMocks();
    vi.spyOn(SdkMcpStdioRuntime.prototype, "readResource").mockResolvedValue(
      demoResourceRead()
    );
    const cleanupSecondary = new Error("injected MCP generic cleanup secondary");
    const close = vi.spyOn(SdkMcpStdioRuntime.prototype, "close").mockRejectedValue(
      cleanupSecondary
    );

    const report = await readMcpResource(resourceOptions());
    const operationChecks = report.checks.filter(
      (check) => check.name === "mcp_read_resource"
    );
    const output = renderMcpDiagnosticReportJson(report);

    expect(operationChecks).toEqual([{
      name: "mcp_read_resource",
      status: "error",
      message: "MCP runtime cleanup failed"
    }]);
    expect(report.ok).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(cleanupSecondary.message);
  });

  it("preserves a generic operation primary across synchronous cleanup throw", async () => {
    installBaseRuntimeMocks();
    const operationPrimary = new Error("injected MCP resource operation primary");
    vi.spyOn(SdkMcpStdioRuntime.prototype, "readResource").mockRejectedValue(
      operationPrimary
    );
    const cleanupSecondary = new Error("injected MCP generic cleanup replacement");
    const close = vi.spyOn(SdkMcpStdioRuntime.prototype, "close").mockImplementation(() => {
      throw cleanupSecondary;
    });

    const report = await readMcpResource(resourceOptions());
    const operationChecks = report.checks.filter(
      (check) => check.name === "mcp_read_resource"
    );
    const output = renderMcpDiagnosticReportJson(report);

    expect(operationChecks).toEqual([{
      name: "mcp_read_resource",
      status: "error",
      message: operationPrimary.message
    }]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(cleanupSecondary.message);
  });

  it("downgrades only the connection owner after successful multi-check cleanup failure", async () => {
    installBaseRuntimeMocks();
    vi.spyOn(SdkMcpStdioRuntime.prototype, "listResources").mockResolvedValue([]);
    vi.spyOn(SdkMcpStdioRuntime.prototype, "listResourceTemplates").mockResolvedValue([]);
    vi.spyOn(SdkMcpStdioRuntime.prototype, "listPrompts").mockResolvedValue([]);
    const cleanupSecondary = new Error("injected MCP multi-check cleanup secondary");
    const close = vi.spyOn(SdkMcpStdioRuntime.prototype, "close").mockRejectedValue(
      cleanupSecondary
    );

    const report = await inspectMcpConfig({
      ...configOptions(),
      connect: true,
      resources: true,
      resourceTemplates: true,
      prompts: true
    });
    const runtimeChecks = report.checks.filter((check) => check.name !== "mcp_config");
    const output = renderMcpDiagnosticReportJson(report);

    expect(runtimeChecks).toEqual([
      {
        name: "mcp_connect",
        status: "error",
        message: "MCP runtime cleanup failed"
      },
      {
        name: "mcp_resources",
        status: "ok",
        message: "0 MCP resource(s) loaded",
        details: { resource_count: 0, resources: [] }
      },
      {
        name: "mcp_resource_templates",
        status: "ok",
        message: "0 MCP resource template(s) loaded",
        details: { resource_template_count: 0, resource_templates: [] }
      },
      {
        name: "mcp_prompts",
        status: "ok",
        message: "0 MCP prompt(s) loaded",
        details: { prompt_count: 0, prompts: [] }
      }
    ]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(cleanupSecondary.message);
  });

  it("preserves an optional multi-check primary across synchronous cleanup throw", async () => {
    installBaseRuntimeMocks();
    const resourcePrimary = new Error("injected MCP resources primary");
    vi.spyOn(SdkMcpStdioRuntime.prototype, "listResources").mockRejectedValue(
      resourcePrimary
    );
    const cleanupSecondary = new Error("injected MCP connection cleanup replacement");
    const close = vi.spyOn(SdkMcpStdioRuntime.prototype, "close").mockImplementation(() => {
      throw cleanupSecondary;
    });

    const report = await inspectMcpConfig({
      ...configOptions(),
      connect: true,
      resources: true
    });
    const connectChecks = report.checks.filter((check) => check.name === "mcp_connect");
    const resourceChecks = report.checks.filter((check) => check.name === "mcp_resources");
    const output = renderMcpDiagnosticReportJson(report);

    expect(connectChecks).toHaveLength(1);
    expect(connectChecks[0]?.status).toBe("ok");
    expect(resourceChecks).toEqual([{
      name: "mcp_resources",
      status: "error",
      message: resourcePrimary.message
    }]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(cleanupSecondary.message);
  });

  it("downgrades the context owner after successful context cleanup failure", async () => {
    installBaseRuntimeMocks();
    vi.spyOn(SdkMcpStdioRuntime.prototype, "readResource").mockResolvedValue(
      demoResourceRead()
    );
    const cleanupSecondary = new Error("injected MCP context cleanup secondary");
    const close = vi.spyOn(SdkMcpStdioRuntime.prototype, "close").mockRejectedValue(
      cleanupSecondary
    );

    const report = await inspectMcpContext({
      environ: {
        ...configOptions().environ,
        GOD_CODE_MCP_CONTEXT: JSON.stringify([{
          type: "resource",
          uri: "memory://demo/readme",
          server_id: "demo"
        }])
      }
    });
    const contextChecks = report.checks.filter((check) => check.name === "mcp_context");
    const output = renderMcpDiagnosticReportJson(report);

    expect(contextChecks).toEqual([{
      name: "mcp_context",
      status: "error",
      message: "MCP runtime cleanup failed"
    }]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(cleanupSecondary.message);
  });
});

function installBaseRuntimeMocks(): void {
  vi.spyOn(SdkMcpStdioRuntime.prototype, "connect").mockResolvedValue();
  vi.spyOn(SdkMcpStdioRuntime.prototype, "listTools").mockResolvedValue([]);
}

function configOptions(): {
  environ: Record<string, string | undefined>;
} {
  return {
    environ: {
      GOD_CODE_MCP_SERVERS: JSON.stringify([{
        id: "demo",
        command: "python3",
        args: ["unused-mcp-fixture.py"]
      }]),
      GOD_CODE_MCP_CONFIG_FILE: undefined
    }
  };
}

function resourceOptions(): {
  uri: string;
  serverId: string;
  environ: Record<string, string | undefined>;
} {
  return {
    ...configOptions(),
    uri: "memory://demo/readme",
    serverId: "demo"
  };
}

function demoResourceRead(): {
  server_id: string;
  uri: string;
  contents: Array<{ uri: string; mime_type: string; text: string }>;
} {
  return {
    server_id: "demo",
    uri: "memory://demo/readme",
    contents: [{
      uri: "memory://demo/readme",
      mime_type: "text/plain",
      text: "demo context"
    }]
  };
}
