import { afterEach, describe, expect, it, vi } from "vitest";
import { renderDoctorReport, renderDoctorReportJson, runGodCodeDoctor } from "../src/cli/doctor.js";
import { GodCodeEngineProcess } from "../src/ipc/godCodeEngineProcess.js";
import type {
  GodCodeEventEnvelope,
  InitializeResponse
} from "../src/types/godCodeProtocol.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("doctor engine cleanup lifecycle", () => {
  it("downgrades successful python initialization when engine cleanup fails", async () => {
    mockDoctorEngineInitialization();
    const cleanupSecondary = new Error("injected python engine cleanup secondary");
    const stop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockRejectedValue(
      cleanupSecondary
    );

    await withDoctorEnv({}, async () => {
      const report = await runGodCodeDoctor(process.cwd());
      const checks = report.checks.filter((check) => check.name === "python_engine");
      const human = renderDoctorReport(report);
      const json = renderDoctorReportJson(report);

      expect(checks).toEqual([{
        name: "python_engine",
        status: "error",
        message: "initialized but engine cleanup failed"
      }]);
      expect(report.ok).toBe(false);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(human).not.toContain(cleanupSecondary.message);
      expect(json).not.toContain(cleanupSecondary.message);
    });
  });

  it("preserves a python initialization primary across engine cleanup failure", async () => {
    const initializePrimary = new Error("injected python initialize primary");
    vi.spyOn(GodCodeEngineProcess.prototype, "start").mockResolvedValue();
    vi.spyOn(GodCodeEngineProcess.prototype, "initialize").mockRejectedValue(initializePrimary);
    const cleanupSecondary = new Error("injected python cleanup secondary");
    const stop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockRejectedValue(
      cleanupSecondary
    );

    await withDoctorEnv({}, async () => {
      const report = await runGodCodeDoctor(process.cwd());
      const checks = report.checks.filter((check) => check.name === "python_engine");
      const output = renderDoctorReportJson(report);

      expect(checks).toEqual([{
        name: "python_engine",
        status: "error",
        message: initializePrimary.message
      }]);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(output).not.toContain(cleanupSecondary.message);
    });
  });

  it("normalizes a synchronous engine stop throw into the fixed cleanup projection", async () => {
    mockDoctorEngineInitialization();
    const cleanupSecondary = new Error("injected synchronous python cleanup secondary");
    vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockImplementation(() => {
      throw cleanupSecondary;
    });

    await withDoctorEnv({}, async () => {
      const report = await runGodCodeDoctor(process.cwd());
      const pythonEngine = report.checks.find((check) => check.name === "python_engine");

      expect(pythonEngine).toEqual({
        name: "python_engine",
        status: "error",
        message: "initialized but engine cleanup failed"
      });
      expect(renderDoctorReport(report)).not.toContain(cleanupSecondary.message);
    });
  });

  it("downgrades successful provider health after single-attempt waiter and engine cleanup", async () => {
    let startCalls = 0;
    let healthOff: ReturnType<typeof vi.fn> | undefined;
    vi.spyOn(GodCodeEngineProcess.prototype, "start").mockImplementation(
      async function (this: GodCodeEngineProcess): Promise<void> {
        startCalls += 1;
        if (startCalls === 2) {
          const originalOff = this.off.bind(this);
          healthOff = vi.fn((eventName: string, listener: (...args: unknown[]) => void) => {
            originalOff(eventName, listener);
            return this;
          });
          this.off = healthOff as typeof this.off;
        }
      }
    );
    mockDoctorEngineRpc();
    vi.spyOn(GodCodeEngineProcess.prototype, "submitTurn").mockImplementation(
      async function (this: GodCodeEngineProcess, request) {
        const event: GodCodeEventEnvelope = {
          event_type: "turn_finished",
          session_id: request.session_id,
          turn_id: "doctor-health-turn",
          sequence: 1,
          payload: {
            status: "success",
            assistant_message: { role: "assistant", content: "healthy" }
          }
        };
        setImmediate(() => this.emit("god_code_event", event));
        return {
          session_id: request.session_id,
          turn_id: "doctor-health-turn",
          status: "accepted"
        };
      }
    );
    const cleanupSecondary = new Error("injected provider cleanup secondary");
    let stopCalls = 0;
    const stop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockImplementation(
      async () => {
        stopCalls += 1;
        if (stopCalls === 2) {
          throw cleanupSecondary;
        }
      }
    );

    await withDoctorEnv({
      GOD_CODE_PROVIDER: "demo",
      GOD_CODE_MODEL: "demo-model",
      GOD_CODE_API_KEY_ENV: "DEMO_API_KEY",
      DEMO_API_KEY: "secret"
    }, async () => {
      const report = await runGodCodeDoctor(process.cwd(), { providerHealth: true });
      const checks = report.checks.filter((check) => check.name === "provider_health");
      const output = renderDoctorReportJson(report);

      expect(checks).toEqual([{
        name: "provider_health",
        status: "error",
        message: "demo: health check cleanup failed"
      }]);
      expect(stop).toHaveBeenCalledTimes(2);
      expect(healthOff).toHaveBeenCalledTimes(2);
      expect(output).not.toContain(cleanupSecondary.message);
      expect(output).not.toContain("secret");
    });
  });

  it("preserves provider submit primary while cleanup throw cannot block engine stop", async () => {
    const submitPrimary = new Error("injected provider submit primary");
    const waiterCleanupSecondary = new Error("injected provider waiter cleanup secondary");
    const engineCleanupSecondary = new Error("injected provider engine cleanup secondary");
    let startCalls = 0;
    vi.spyOn(GodCodeEngineProcess.prototype, "start").mockImplementation(
      async function (this: GodCodeEngineProcess): Promise<void> {
        startCalls += 1;
        if (startCalls === 2) {
          this.off = vi.fn(() => {
            throw waiterCleanupSecondary;
          }) as typeof this.off;
        }
      }
    );
    mockDoctorEngineRpc();
    vi.spyOn(GodCodeEngineProcess.prototype, "submitTurn").mockRejectedValue(submitPrimary);
    let stopCalls = 0;
    const stop = vi.spyOn(GodCodeEngineProcess.prototype, "stop").mockImplementation(
      async () => {
        stopCalls += 1;
        if (stopCalls === 2) {
          throw engineCleanupSecondary;
        }
      }
    );

    await withDoctorEnv({
      GOD_CODE_PROVIDER: "demo",
      GOD_CODE_MODEL: "demo-model",
      GOD_CODE_API_KEY_ENV: "DEMO_API_KEY",
      DEMO_API_KEY: "secret"
    }, async () => {
      const report = await runGodCodeDoctor(process.cwd(), { providerHealth: true });
      const providerHealth = report.checks.find((check) => check.name === "provider_health");
      const output = renderDoctorReportJson(report);

      expect(providerHealth).toEqual({
        name: "provider_health",
        status: "error",
        message: `demo: ${submitPrimary.message}`
      });
      expect(stop).toHaveBeenCalledTimes(2);
      expect(output).not.toContain(waiterCleanupSecondary.message);
      expect(output).not.toContain(engineCleanupSecondary.message);
      expect(output).not.toContain("secret");
    });
  });
});

function mockDoctorEngineInitialization(): void {
  vi.spyOn(GodCodeEngineProcess.prototype, "start").mockResolvedValue();
  vi.spyOn(GodCodeEngineProcess.prototype, "initialize").mockResolvedValue({
    supported_model_adapters: ["fake"]
  } as InitializeResponse);
}

function mockDoctorEngineRpc(): void {
  vi.spyOn(GodCodeEngineProcess.prototype, "initialize").mockResolvedValue({
    supported_model_adapters: ["fake", "demo"]
  } as InitializeResponse);
  vi.spyOn(GodCodeEngineProcess.prototype, "createSession").mockImplementation(
    async (request) => ({ session_id: request.session_id, status: "created" })
  );
}

async function withDoctorEnv<T>(
  overrides: Record<string, string | undefined>,
  run: () => Promise<T>
): Promise<T> {
  const baseline: Record<string, string | undefined> = {
    GOD_CODE_PROVIDER: undefined,
    GOD_CODE_MODEL: undefined,
    GOD_CODE_API_KEY_ENV: undefined,
    GOD_CODE_BASE_URL: undefined,
    GOD_CODE_PROVIDER_TIMEOUT_S: undefined,
    DEMO_API_KEY: undefined,
    GOD_CODE_AUDIT_FILE: undefined,
    GOD_CODE_AUDIT_MAX_BYTES: undefined,
    GOD_CODE_AUDIT_REDACT_KEYS: undefined,
    GOD_CODE_MCP_SERVERS: undefined,
    GOD_CODE_MCP_CONFIG_FILE: undefined,
    GOD_CODE_MCP_CONTEXT: undefined,
    GOD_CODE_MCP_CONTEXT_FILE: undefined,
    GOD_CODE_PLUGIN_DIRS: undefined,
    GOD_CODE_PLUGIN_CONFIG_FILE: undefined,
    GOD_CODE_PLUGIN_ENABLED_IDS: undefined,
    GOD_CODE_PLUGIN_REGISTRY_FILE: undefined,
    ...overrides
  };
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(baseline)) {
    previous.set(key, process.env[key]);
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
