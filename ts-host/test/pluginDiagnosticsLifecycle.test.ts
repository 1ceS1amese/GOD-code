import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inspectPluginConfig,
  listConfiguredPlugins,
  renderPluginDiagnosticReportJson
} from "../src/cli/plugins.js";
import { PluginSkillRuntime } from "../src/plugins/runtime.js";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const executablePluginPath = path.join(
  repoRoot,
  "examples",
  "plugins",
  "executable-plugin"
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("plugin diagnostic runtime cleanup lifecycle", () => {
  it("keeps the existing runtime diagnostic after successful cleanup", async () => {
    const report = await inspectPluginConfig(pluginOptions());
    const runtimeChecks = report.checks.filter((check) => check.name === "plugin_runtime");

    expect(runtimeChecks).toHaveLength(1);
    expect(runtimeChecks[0]).toMatchObject({
      name: "plugin_runtime",
      status: "ok"
    });
    expect(report.ok).toBe(true);
  });

  it("projects a fixed runtime error when plugin cleanup rejects", async () => {
    const cleanupSecondary = new Error("injected plugin diagnostic cleanup secondary");
    const close = vi.spyOn(PluginSkillRuntime.prototype, "close").mockRejectedValue(
      cleanupSecondary
    );

    const report = await inspectPluginConfig(pluginOptions());
    const runtimeChecks = report.checks.filter((check) => check.name === "plugin_runtime");
    const output = renderPluginDiagnosticReportJson(report);

    expect(runtimeChecks).toEqual([{
      name: "plugin_runtime",
      status: "error",
      message: "plugin runtime cleanup failed"
    }]);
    expect(report.ok).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(cleanupSecondary.message);
  });

  it("preserves plugin load primary across a synchronous cleanup throw", async () => {
    const loadPrimary = new Error("injected plugin diagnostic load primary");
    const cleanupSecondary = new Error("injected plugin cleanup replacement");
    vi.spyOn(PluginSkillRuntime.prototype, "load").mockRejectedValue(loadPrimary);
    const close = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(() => {
      throw cleanupSecondary;
    });

    const report = await inspectPluginConfig(pluginOptions());
    const runtimeChecks = report.checks.filter((check) => check.name === "plugin_runtime");
    const output = renderPluginDiagnosticReportJson(report);

    expect(runtimeChecks).toEqual([{
      name: "plugin_runtime",
      status: "error",
      message: loadPrimary.message
    }]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(cleanupSecondary.message);
  });

  it("projects a fixed plugin-list error for a synchronous cleanup throw", async () => {
    const cleanupSecondary = new Error("injected plugin list cleanup secondary");
    const close = vi.spyOn(PluginSkillRuntime.prototype, "close").mockImplementation(() => {
      throw cleanupSecondary;
    });

    const report = await listConfiguredPlugins(pluginOptions());
    const listChecks = report.checks.filter((check) => check.name === "plugin_list");
    const output = renderPluginDiagnosticReportJson(report);

    expect(listChecks).toEqual([{
      name: "plugin_list",
      status: "error",
      message: "plugin runtime cleanup failed"
    }]);
    expect(report.ok).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(cleanupSecondary.message);
  });
});

function pluginOptions(): {
  environ: Record<string, string | undefined>;
} {
  return {
    environ: {
      GOD_CODE_PLUGIN_DIRS: JSON.stringify([executablePluginPath]),
      GOD_CODE_PLUGIN_CONFIG_FILE: undefined,
      GOD_CODE_PLUGIN_ENABLED_IDS: undefined,
      GOD_CODE_PLUGIN_REGISTRY_FILE: undefined
    }
  };
}
