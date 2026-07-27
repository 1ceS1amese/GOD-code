import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pruneLocalProviderModels,
  pullLocalProviderModel,
  removeLocalProviderModel,
  renderLocalProviderDaemonReportJson,
  renderLocalProviderModelPruneReportJson,
  renderLocalProviderModelPullReportJson,
  renderLocalProviderModelRemoveReportJson,
  startLocalProviderDaemon,
  type ProviderDiagnosticReport
} from "../src/cli/provider.js";

const tempDirs: string[] = [];
const pendingSentinel = Symbol("pending");
const cleanupFailureMessage = "local provider log cleanup failed";

afterEach(async () => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  }
});

describe("provider log descriptor finalization continuity", () => {
  it("projects successful daemon cleanup uncertainty through the existing check", async () => {
    const cwd = await createTempDir();
    const rawCleanupFailure = new Error("daemon-log-close-secret-phase601");

    const result = await withThrowingLogClose(rawCleanupFailure, () => captureOutcome(
      startLocalProviderDaemon({
        cwd,
        environ: daemonEnvironment(),
        dryRun: false,
        yes: true
      })
    ));

    expect(result.outcome.kind).toBe("fulfilled");
    const report = fulfilledReport(result.outcome);
    const details = report.checks[0]?.details as Record<string, unknown>;
    expect(report.ok).toBe(false);
    expect(report.checks[0]?.status).toBe("error");
    expect(report.checks[0]?.message).toBe(cleanupFailureMessage);
    expect(details.marker_pid).toEqual(expect.any(Number));
    expect(renderLocalProviderDaemonReportJson(report)).not.toContain(rawCleanupFailure.message);
    expect(result.closeAttempts).toBe(1);
  });

  it("preserves a daemon marker-write primary across descriptor cleanup failure", async () => {
    const cwd = await createTempDir();
    const operationPrimary = { kind: "daemon-marker-write-primary-phase601" };
    const writeSpy = vi.spyOn(fsp, "writeFile").mockRejectedValue(operationPrimary);

    const result = await withThrowingLogClose(
      new Error("daemon-marker-close-secondary-phase601"),
      () => captureOutcome(startLocalProviderDaemon({
        cwd,
        environ: daemonEnvironment(),
        dryRun: false,
        yes: true
      }))
    );

    expect(result.outcome).toEqual({ kind: "rejected", reason: operationPrimary });
    expect(result.closeAttempts).toBe(1);
    writeSpy.mockRestore();
  });

  it.each(modelOperations)(
    "settles successful $name callback cleanup failure through a fixed diagnostic",
    async ({ run, render }) => {
      const cwd = await createTempDir();
      const rawCleanupFailure = new Error("model-log-close-secret-phase601");

      const result = await withThrowingLogClose(rawCleanupFailure, () => settleWithin(
        captureOutcome(run(cwd, 0)),
        2_000
      ));

      expect(result.outcome).not.toBe(pendingSentinel);
      const settled = result.outcome as CapturedOutcome<ProviderDiagnosticReport>;
      expect(settled.kind).toBe("fulfilled");
      const report = fulfilledReport(settled);
      const details = report.checks[0]?.details as Record<string, unknown>;
      expect(report.ok).toBe(false);
      expect(report.checks[0]?.status).toBe("error");
      expect(report.checks[0]?.message).toBe(cleanupFailureMessage);
      expect(details.exit_code).toBe(0);
      expect(render(report)).not.toContain(rawCleanupFailure.message);
      expect(result.closeAttempts).toBe(1);
    }
  );

  it.each(modelOperations)(
    "preserves the non-zero $name operation primary across callback cleanup failure",
    async ({ run, render }) => {
      const cwd = await createTempDir();
      const rawCleanupFailure = new Error("model-log-close-secondary-phase601");

      const result = await withThrowingLogClose(rawCleanupFailure, () => settleWithin(
        captureOutcome(run(cwd, 7)),
        2_000
      ));

      expect(result.outcome).not.toBe(pendingSentinel);
      const settled = result.outcome as CapturedOutcome<ProviderDiagnosticReport>;
      expect(settled.kind).toBe("fulfilled");
      const report = fulfilledReport(settled);
      const details = report.checks[0]?.details as Record<string, unknown>;
      expect(report.ok).toBe(false);
      expect(report.checks[0]?.message).toContain("exit code 7");
      expect(report.checks[0]?.message).not.toBe(cleanupFailureMessage);
      expect(details.exit_code).toBe(7);
      expect(render(report)).not.toContain(rawCleanupFailure.message);
      expect(result.closeAttempts).toBe(1);
    }
  );

  it("preserves a synchronous model spawn error report across descriptor cleanup failure", async () => {
    const cwd = await createTempDir();

    const result = await withThrowingLogClose(
      new Error("model-spawn-close-secondary-phase601"),
      () => captureOutcome(pullLocalProviderModel("fixture-model", {
        cwd,
        environ: pullEnvironment("command-with-nul\u0000", 0),
        dryRun: false,
        yes: true
      }))
    );

    expect(result.outcome.kind).toBe("fulfilled");
    const report = fulfilledReport(result.outcome);
    expect(report.ok).toBe(false);
    expect(report.checks[0]?.message).toContain("failed to start local provider model pull");
    expect(report.checks[0]?.message).not.toBe(cleanupFailureMessage);
    expect(result.closeAttempts).toBe(1);
  });
});

type CapturedOutcome<T> =
  | { kind: "fulfilled"; value: T }
  | { kind: "rejected"; reason: unknown };

interface ModelOperationFixture {
  name: string;
  run: (cwd: string, exitCode: number) => Promise<ProviderDiagnosticReport>;
  render: (report: ProviderDiagnosticReport) => string;
}

const modelOperations: ModelOperationFixture[] = [
  {
    name: "pull",
    run: (cwd, exitCode) => pullLocalProviderModel("fixture-model", {
      cwd,
      environ: pullEnvironment(process.execPath, exitCode),
      dryRun: false,
      yes: true
    }),
    render: renderLocalProviderModelPullReportJson
  },
  {
    name: "remove",
    run: (cwd, exitCode) => removeLocalProviderModel("fixture-model", {
      cwd,
      environ: removeEnvironment(exitCode),
      dryRun: false,
      yes: true
    }),
    render: renderLocalProviderModelRemoveReportJson
  },
  {
    name: "prune",
    run: (cwd, exitCode) => pruneLocalProviderModels("unused", {
      cwd,
      environ: pruneEnvironment(exitCode),
      dryRun: false,
      yes: true
    }),
    render: renderLocalProviderModelPruneReportJson
  }
];

function daemonEnvironment(): Record<string, string> {
  return {
    GOD_CODE_PROVIDER: "local-openai-compatible",
    GOD_CODE_MODEL: "local-model",
    GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED: "true",
    GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND: process.execPath,
    GOD_CODE_LOCAL_PROVIDER_DAEMON_ARGS: JSON.stringify(["-e", "process.exit(0)"])
  };
}

function pullEnvironment(command: string, exitCode: number): Record<string, string> {
  return {
    GOD_CODE_PROVIDER: "local-openai-compatible",
    GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED: "true",
    GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND: command,
    GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE: JSON.stringify([
      "-e",
      `process.exit(${exitCode})`,
      "{model}"
    ])
  };
}

function removeEnvironment(exitCode: number): Record<string, string> {
  return {
    GOD_CODE_PROVIDER: "local-openai-compatible",
    GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED: "true",
    GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND: process.execPath,
    GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE: JSON.stringify([
      "-e",
      `process.exit(${exitCode})`,
      "{model}"
    ])
  };
}

function pruneEnvironment(exitCode: number): Record<string, string> {
  return {
    GOD_CODE_PROVIDER: "local-openai-compatible",
    GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED: "true",
    GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND: process.execPath,
    GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE: JSON.stringify([
      "-e",
      `process.exit(${exitCode})`,
      "{target}"
    ]),
    GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS: "unused"
  };
}

async function withThrowingLogClose<T>(
  cleanupFailure: Error,
  run: () => Promise<T>
): Promise<{ outcome: T; closeAttempts: number }> {
  const originalClose = fs.closeSync.bind(fs);
  const leakedDescriptors = new Set<number>();
  let closeAttempts = 0;
  const closeSpy = vi.spyOn(fs, "closeSync").mockImplementation((fd) => {
    closeAttempts += 1;
    leakedDescriptors.add(fd);
    throw cleanupFailure;
  });

  try {
    return {
      outcome: await run(),
      closeAttempts
    };
  } finally {
    closeSpy.mockRestore();
    for (const fd of leakedDescriptors) {
      originalClose(fd);
    }
  }
}

async function captureOutcome<T>(promise: Promise<T>): Promise<CapturedOutcome<T>> {
  try {
    return { kind: "fulfilled", value: await promise };
  } catch (reason) {
    return { kind: "rejected", reason };
  }
}

function fulfilledReport(outcome: CapturedOutcome<ProviderDiagnosticReport>): ProviderDiagnosticReport {
  if (outcome.kind !== "fulfilled") {
    throw new Error("Expected provider operation to fulfill with a diagnostic report.");
  }
  return outcome.value;
}

async function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T | typeof pendingSentinel> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof pendingSentinel>((resolve) => {
        timer = setTimeout(() => resolve(pendingSentinel), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function createTempDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "god-code-provider-log-lifecycle-"));
  tempDirs.push(dir);
  return dir;
}
