import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderDoctorReport, renderDoctorReportJson, runGodCodeDoctor } from "../src/cli/doctor.js";
import {
  getHostTool,
  listHostTools,
  renderToolInspect,
  renderToolInspectJson,
  renderToolList,
  renderToolListJson
} from "../src/cli/tools.js";

const fixturePath = fileURLToPath(new URL("./fixtures/mcp-demo-server.py", import.meta.url));
const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const executablePluginPath = path.join(repoRoot, "examples", "plugins", "executable-plugin");

function demoServerEnv(): string {
  return JSON.stringify([
    {
      id: "demo",
      command: "python3",
      args: [fixturePath]
    }
  ]);
}

async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  run: () => Promise<T>
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key]);
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe("CLI tools list", () => {
  it("renders host tools as a human-readable list", () => {
    expect(
      renderToolList([
        {
          name: "Read",
          description: "Read a file."
        }
      ])
    ).toBe("Read - Read a file.");
  });

  it("renders host tools as JSON", () => {
    const output = renderToolListJson([
      {
        name: "Read",
        description: "Read a file."
      }
    ]);

    expect(JSON.parse(output)).toEqual([
      {
        name: "Read",
        description: "Read a file."
      }
    ]);
  });

  it("lists built-in tools by default", async () => {
    await withEnv(
      {
        GOD_CODE_MCP_SERVERS: undefined,
        GOD_CODE_MCP_CONFIG_FILE: undefined,
        GOD_CODE_PLUGIN_DIRS: undefined,
        GOD_CODE_PLUGIN_CONFIG_FILE: undefined,
        GOD_CODE_PLUGIN_ENABLED_IDS: undefined,
        GOD_CODE_PLUGIN_REGISTRY_FILE: undefined,
        GOD_CODE_AUDIT_FILE: undefined,
        GOD_CODE_AUDIT_MAX_BYTES: undefined,
        GOD_CODE_AUDIT_REDACT_KEYS: undefined
      },
      async () => {
        const tools = await listHostTools();
        expect(tools.map((tool) => tool.name)).toEqual([
          "Read",
          "Edit",
          "Bash",
          "ListFiles",
          "Search",
          "Write"
        ]);
        expect(tools.find((tool) => tool.name === "Read")?.input_schema).toEqual({
          type: "object",
          properties: {
            path: {
              type: "string"
            }
          },
          required: ["path"],
          additionalProperties: false
        });
      }
    );
  });

  it("includes env-configured MCP tools", async () => {
    await withEnv({ GOD_CODE_MCP_SERVERS: demoServerEnv(), GOD_CODE_MCP_CONFIG_FILE: undefined }, async () => {
      const tools = await listHostTools();
      expect(tools.map((tool) => tool.name)).toContain("mcp.demo.echo");
      expect(tools.find((tool) => tool.name === "mcp.demo.echo")?.input_schema).toEqual({
        type: "object",
        properties: {
          value: {
            type: "string"
          }
        }
      });
    });
  });

  it("includes env-configured plugin sandbox tools", async () => {
    await withEnv(
      {
        GOD_CODE_PLUGIN_DIRS: JSON.stringify([executablePluginPath]),
        GOD_CODE_PLUGIN_CONFIG_FILE: undefined,
        GOD_CODE_PLUGIN_ENABLED_IDS: undefined,
        GOD_CODE_PLUGIN_REGISTRY_FILE: undefined
      },
      async () => {
        const tools = await listHostTools();
        expect(tools.map((tool) => tool.name)).toContain("plugin.executable.echo");
        expect(tools.find((tool) => tool.name === "plugin.executable.echo")?.input_schema).toEqual({
          type: "object",
          properties: {
            value: {
              type: "string"
            }
          },
          required: ["value"],
          additionalProperties: false
        });
      }
    );
  });

  it("renders a single tool inspection", async () => {
    await withEnv(
      {
        GOD_CODE_MCP_SERVERS: undefined,
        GOD_CODE_MCP_CONFIG_FILE: undefined,
        GOD_CODE_PLUGIN_DIRS: undefined,
        GOD_CODE_PLUGIN_CONFIG_FILE: undefined,
        GOD_CODE_PLUGIN_ENABLED_IDS: undefined,
        GOD_CODE_PLUGIN_REGISTRY_FILE: undefined
      },
      async () => {
        const tool = await getHostTool("Read");
        expect(tool).toBeDefined();
        expect(renderToolInspect(tool!)).toContain("Tool: Read");
        expect(JSON.parse(renderToolInspectJson(tool!))).toEqual(tool);
      }
    );
  });
});

describe("CLI doctor", () => {
  it("checks the default local runtime", async () => {
    await withEnv(
      {
        GOD_CODE_MCP_SERVERS: undefined,
        GOD_CODE_MCP_CONFIG_FILE: undefined,
        GOD_CODE_PROVIDER: undefined,
        GOD_CODE_MODEL: undefined,
        GOD_CODE_API_KEY_ENV: undefined,
        GOD_CODE_BASE_URL: undefined,
        GOD_CODE_PROVIDER_TIMEOUT_S: undefined,
        GOD_CODE_PLUGIN_DIRS: undefined,
        GOD_CODE_PLUGIN_CONFIG_FILE: undefined,
        GOD_CODE_PLUGIN_ENABLED_IDS: undefined,
        GOD_CODE_PLUGIN_REGISTRY_FILE: undefined
      },
      async () => {
        const report = await runGodCodeDoctor(process.cwd());
        const output = renderDoctorReport(report);

        expect(report.ok).toBe(true);
        expect(output).toContain("OK node:");
        expect(output).toContain("OK transcript_dir:");
        expect(output).toContain("OK provider_config: using fake provider");
        expect(output).toContain("OK audit_config: disabled");
        expect(output).toContain("OK python_engine:");
        expect(output).toContain("OK tool_catalog:");
      }
    );
  });

  it("reports provider configuration errors without printing secrets", async () => {
    await withEnv(
      {
        GOD_CODE_PROVIDER: "openai",
        GOD_CODE_MODEL: undefined,
        GOD_CODE_API_KEY_ENV: "DEMO_API_KEY",
        GOD_CODE_BASE_URL: undefined,
        GOD_CODE_PROVIDER_TIMEOUT_S: undefined,
        DEMO_API_KEY: undefined
      },
      async () => {
        const report = await runGodCodeDoctor(process.cwd());
        const providerCheck = report.checks.find((check) => check.name === "provider_config");
        const pythonEngineCheck = report.checks.find((check) => check.name === "python_engine");
        const output = renderDoctorReport(report);

        expect(report.ok).toBe(false);
        expect(providerCheck?.status).toBe("error");
        expect(providerCheck?.message).toContain("missing GOD_CODE_MODEL");
        expect(providerCheck?.message).toContain("DEMO_API_KEY");
        expect(pythonEngineCheck?.status).toBe("warn");
        expect(pythonEngineCheck?.message).toContain("skipped");
        expect(output).not.toContain("JSON-RPC input stream ended");
      }
    );
  });

  it("reports audit configuration errors and skips host setup", async () => {
    await withEnv(
      {
        GOD_CODE_PROVIDER: undefined,
        GOD_CODE_MODEL: undefined,
        GOD_CODE_API_KEY_ENV: undefined,
        GOD_CODE_BASE_URL: undefined,
        GOD_CODE_PROVIDER_TIMEOUT_S: undefined,
        GOD_CODE_AUDIT_FILE: "audit.jsonl",
        GOD_CODE_AUDIT_MAX_BYTES: "hidden-invalid-capacity",
        GOD_CODE_AUDIT_REDACT_KEYS: undefined
      },
      async () => {
        const report = await runGodCodeDoctor(process.cwd());
        const auditCheck = report.checks.find((check) => check.name === "audit_config");
        const toolCatalogCheck = report.checks.find((check) => check.name === "tool_catalog");
        const output = renderDoctorReport(report);

        expect(report.ok).toBe(false);
        expect(auditCheck?.status).toBe("error");
        expect(auditCheck?.message).toContain("Invalid GOD_CODE_AUDIT_MAX_BYTES");
        expect(toolCatalogCheck).toEqual({
          name: "tool_catalog",
          status: "warn",
          message: "skipped because audit_config has errors"
        });
        expect(output).not.toContain("hidden-invalid-capacity");
      }
    );
  });

  it("warns for unknown provider families with complete config", async () => {
    await withEnv(
      {
        GOD_CODE_PROVIDER: "demo",
        GOD_CODE_MODEL: "demo-model",
        GOD_CODE_API_KEY_ENV: "DEMO_API_KEY",
        GOD_CODE_BASE_URL: undefined,
        DEMO_API_KEY: "secret",
        GOD_CODE_PROVIDER_TIMEOUT_S: undefined
      },
      async () => {
        const report = await runGodCodeDoctor(process.cwd());
        const output = renderDoctorReport(report);
        const providerCheck = report.checks.find((check) => check.name === "provider_config");

        expect(report.ok).toBe(true);
        expect(providerCheck?.status).toBe("warn");
        expect(output).toContain("WARN provider_config:");
        expect(output).not.toContain("secret");
      }
    );
  });

  it("checks provider health in fake-provider mode without HTTP", async () => {
    await withEnv(
      {
        GOD_CODE_PROVIDER: undefined,
        GOD_CODE_MODEL: undefined,
        GOD_CODE_API_KEY_ENV: undefined,
        GOD_CODE_BASE_URL: undefined,
        GOD_CODE_PROVIDER_TIMEOUT_S: undefined
      },
      async () => {
        const report = await runGodCodeDoctor(process.cwd(), { providerHealth: true });
        const output = renderDoctorReport(report);
        const providerHealth = report.checks.find((check) => check.name === "provider_health");

        expect(report.ok).toBe(true);
        expect(providerHealth?.status).toBe("ok");
        expect(output).toContain("OK provider_health:");
      }
    );
  });

  it("skips provider health when provider config has errors", async () => {
    await withEnv(
      {
        GOD_CODE_PROVIDER: "openai",
        GOD_CODE_MODEL: undefined,
        GOD_CODE_API_KEY_ENV: "DEMO_API_KEY",
        GOD_CODE_BASE_URL: undefined,
        GOD_CODE_PROVIDER_TIMEOUT_S: undefined,
        DEMO_API_KEY: undefined
      },
      async () => {
        const report = await runGodCodeDoctor(process.cwd(), { providerHealth: true });
        const providerHealth = report.checks.find((check) => check.name === "provider_health");

        expect(report.ok).toBe(false);
        expect(providerHealth?.status).toBe("warn");
        expect(providerHealth?.message).toContain("skipped");
      }
    );
  });

  it("reports provider health errors for unsupported provider families", async () => {
    await withEnv(
      {
        GOD_CODE_PROVIDER: "demo",
        GOD_CODE_MODEL: "demo-model",
        GOD_CODE_API_KEY_ENV: "DEMO_API_KEY",
        GOD_CODE_BASE_URL: undefined,
        GOD_CODE_PROVIDER_TIMEOUT_S: undefined,
        DEMO_API_KEY: "secret"
      },
      async () => {
        const report = await runGodCodeDoctor(process.cwd(), { providerHealth: true });
        const output = renderDoctorReport(report);
        const providerHealth = report.checks.find((check) => check.name === "provider_health");

        expect(report.ok).toBe(false);
        expect(providerHealth?.status).toBe("error");
        expect(providerHealth?.message).toContain("no HTTP provider client is installed");
        expect(output).not.toContain("secret");
      }
    );
  });

  it("renders failed checks clearly", () => {
    expect(
      renderDoctorReport({
        ok: false,
        checks: [
          {
            name: "python_engine",
            status: "error",
            message: "failed"
          }
        ]
      })
    ).toBe("GOD-code doctor:\nERROR python_engine: failed");
  });

  it("renders doctor reports as JSON", () => {
    const output = renderDoctorReportJson({
      ok: false,
      checks: [
        {
          name: "python_engine",
          status: "error",
          message: "failed"
        }
      ]
    });

    expect(JSON.parse(output)).toEqual({
      ok: false,
      checks: [
        {
          name: "python_engine",
          status: "error",
          message: "failed"
        }
      ]
    });
  });
});
