import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreparedGodCodeHost } from "../src/headless/godCodeHostSetup.js";
import type { HostToolRegistry } from "../src/host_tools/registry.js";
import type { ToolCatalogEntry } from "../src/types/godCodeProtocol.js";

const hostSetupMocks = vi.hoisted(() => ({
  prepareGodCodeHost: vi.fn()
}));

vi.mock("../src/headless/godCodeHostSetup.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../src/headless/godCodeHostSetup.js")
  >();
  return {
    ...actual,
    prepareGodCodeHost: hostSetupMocks.prepareGodCodeHost
  };
});

import {
  renderDoctorReport,
  renderDoctorReportJson,
  runGodCodeDoctor
} from "../src/cli/doctor.js";
import { GodCodeEngineProcess } from "../src/ipc/godCodeEngineProcess.js";

beforeEach(() => {
  hostSetupMocks.prepareGodCodeHost.mockReset();
  vi.spyOn(GodCodeEngineProcess.prototype, "start").mockResolvedValue();
  vi.spyOn(GodCodeEngineProcess.prototype, "initialize").mockResolvedValue({
    supported_model_adapters: ["fake"]
  });
  vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("doctor prepared host cleanup lifecycle", () => {
  it("keeps the existing tool count when prepared host cleanup succeeds", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    hostSetupMocks.prepareGodCodeHost.mockResolvedValue(createPreparedHost(close, 7));

    await withDoctorHostEnv(async () => {
      const report = await runGodCodeDoctor(process.cwd());
      const checks = report.checks.filter((check) => check.name === "tool_catalog");

      expect(checks).toEqual([{
        name: "tool_catalog",
        status: "ok",
        message: "7 tool(s)"
      }]);
      expect(close).toHaveBeenCalledTimes(1);
    });
  });

  it("projects a single fixed error when prepared host cleanup rejects", async () => {
    const cleanupSecondary = new Error("injected prepared host cleanup secondary");
    const close = vi.fn().mockRejectedValue(cleanupSecondary);
    hostSetupMocks.prepareGodCodeHost.mockResolvedValue(createPreparedHost(close, 8));

    await withDoctorHostEnv(async () => {
      const report = await runGodCodeDoctor(process.cwd());
      const checks = report.checks.filter((check) => check.name === "tool_catalog");
      const human = renderDoctorReport(report);
      const json = renderDoctorReportJson(report);

      expect(checks).toEqual([{
        name: "tool_catalog",
        status: "error",
        message: "tool catalog loaded but host cleanup failed"
      }]);
      expect(report.ok).toBe(false);
      expect(close).toHaveBeenCalledTimes(1);
      expect(human).not.toContain(cleanupSecondary.message);
      expect(json).not.toContain(cleanupSecondary.message);
    });
  });

  it("normalizes a synchronous prepared host close throw", async () => {
    const cleanupSecondary = new Error("injected synchronous host cleanup secondary");
    const close = vi.fn(() => {
      throw cleanupSecondary;
    });
    hostSetupMocks.prepareGodCodeHost.mockResolvedValue(createPreparedHost(close, 9));

    await withDoctorHostEnv(async () => {
      const report = await runGodCodeDoctor(process.cwd());
      const checks = report.checks.filter((check) => check.name === "tool_catalog");

      expect(checks).toEqual([{
        name: "tool_catalog",
        status: "error",
        message: "tool catalog loaded but host cleanup failed"
      }]);
      expect(close).toHaveBeenCalledTimes(1);
      expect(renderDoctorReport(report)).not.toContain(cleanupSecondary.message);
    });
  });

  it("preserves a tool catalog primary across prepared host cleanup failure", async () => {
    const catalogPrimary = new Error("injected tool catalog primary");
    const cleanupSecondary = new Error("injected host cleanup replacement");
    const close = vi.fn().mockRejectedValue(cleanupSecondary);
    const host = createPreparedHost(close, 0);
    Object.defineProperty(host, "toolCatalog", {
      configurable: true,
      get() {
        throw catalogPrimary;
      }
    });
    hostSetupMocks.prepareGodCodeHost.mockResolvedValue(host);

    await withDoctorHostEnv(async () => {
      const report = await runGodCodeDoctor(process.cwd());
      const checks = report.checks.filter((check) => check.name === "tool_catalog");
      const output = renderDoctorReportJson(report);

      expect(checks).toEqual([{
        name: "tool_catalog",
        status: "error",
        message: catalogPrimary.message
      }]);
      expect(close).toHaveBeenCalledTimes(1);
      expect(output).not.toContain(cleanupSecondary.message);
    });
  });
});

function createPreparedHost(
  close: () => Promise<void>,
  toolCount: number
): PreparedGodCodeHost {
  const toolCatalog = Array.from({ length: toolCount }, (_, index) => ({
    name: `TestTool${index}`,
    description: "test tool",
    input_schema: { type: "object" }
  })) satisfies ToolCatalogEntry[];
  return {
    registry: {} as HostToolRegistry,
    toolCatalog,
    initialMessages: [],
    close
  };
}

async function withDoctorHostEnv<T>(run: () => Promise<T>): Promise<T> {
  const keys = [
    "GOD_CODE_PROVIDER",
    "GOD_CODE_MODEL",
    "GOD_CODE_API_KEY_ENV",
    "GOD_CODE_BASE_URL",
    "GOD_CODE_PROVIDER_TIMEOUT_S",
    "GOD_CODE_AUDIT_FILE",
    "GOD_CODE_AUDIT_MAX_BYTES",
    "GOD_CODE_AUDIT_REDACT_KEYS",
    "GOD_CODE_MCP_SERVERS",
    "GOD_CODE_MCP_CONFIG_FILE",
    "GOD_CODE_MCP_CONTEXT",
    "GOD_CODE_MCP_CONTEXT_FILE",
    "GOD_CODE_PLUGIN_DIRS",
    "GOD_CODE_PLUGIN_CONFIG_FILE",
    "GOD_CODE_PLUGIN_ENABLED_IDS",
    "GOD_CODE_PLUGIN_REGISTRY_FILE"
  ];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    delete process.env[key];
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
