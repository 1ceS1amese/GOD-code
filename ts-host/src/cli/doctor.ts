import { randomUUID } from "node:crypto";
import {
  buildGodCodeCreateSessionRequest,
  buildGodCodeInitializeRequest,
  prepareGodCodeHost,
  type PreparedGodCodeHost
} from "../headless/godCodeHostSetup.js";
import { GodCodeEngineProcess } from "../ipc/godCodeEngineProcess.js";
import { resolveTranscriptDir } from "../transcripts/history.js";
import type { GodCodeEventEnvelope, TurnResult } from "../types/godCodeProtocol.js";
import { inspectAuditConfig } from "./audit.js";
import { inspectProviderConfig } from "./provider.js";

export type DoctorCheckStatus = "ok" | "warn" | "error";

export interface DoctorCheck {
  name: string;
  status: DoctorCheckStatus;
  message: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

export interface RunDoctorOptions {
  providerHealth?: boolean;
}

type DoctorFinalizationOutcome =
  | { ok: true }
  | { ok: false };

const PYTHON_ENGINE_CLEANUP_FAILURE_MESSAGE =
  "initialized but engine cleanup failed";
const TOOL_CATALOG_CLEANUP_FAILURE_MESSAGE =
  "tool catalog loaded but host cleanup failed";

export async function runGodCodeDoctor(
  cwd: string,
  options: RunDoctorOptions = {}
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [
    {
      name: "node",
      status: "ok",
      message: process.version
    },
    {
      name: "transcript_dir",
      status: "ok",
      message: resolveTranscriptDir(cwd)
    }
  ];

  checkProviderConfig(checks);
  checkAuditConfig(checks, cwd);
  if (hasProviderConfigError(checks)) {
    checks.push({
      name: "python_engine",
      status: "warn",
      message: "skipped because provider_config has errors"
    });
  } else {
    await checkPythonEngine(checks);
  }
  if (hasAuditConfigError(checks)) {
    checks.push({
      name: "tool_catalog",
      status: "warn",
      message: "skipped because audit_config has errors"
    });
  } else {
    await checkHostTools(checks);
  }
  if (options.providerHealth) {
    await checkProviderHealth(checks, cwd);
  }

  return {
    ok: checks.every((check) => check.status !== "error"),
    checks
  };
}

export function renderDoctorReport(report: DoctorReport): string {
  const lines = ["GOD-code doctor:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
  }
  return lines.join("\n");
}

export function renderDoctorReportJson(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}

async function checkPythonEngine(checks: DoctorCheck[]): Promise<void> {
  const engine = new GodCodeEngineProcess();
  let diagnostic: DoctorCheck;
  try {
    await engine.start();
    const response = await engine.initialize(buildGodCodeInitializeRequest("doctor"));
    diagnostic = {
      name: "python_engine",
      status: "ok",
      message: `initialized; adapters=${response.supported_model_adapters.join(",")}`
    };
  } catch (error) {
    diagnostic = {
      name: "python_engine",
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    };
  }

  const finalization = await finalizeDoctorEngine(engine);
  if (diagnostic.status === "ok" && !finalization.ok) {
    diagnostic = {
      name: "python_engine",
      status: "error",
      message: PYTHON_ENGINE_CLEANUP_FAILURE_MESSAGE
    };
  }
  checks.push(diagnostic);
}

function checkProviderConfig(checks: DoctorCheck[]): void {
  const report = inspectProviderConfig();
  for (const check of report.checks) {
    checks.push({
      name: check.name,
      status: check.status,
      message: check.message
    });
  }
}

function hasProviderConfigError(checks: DoctorCheck[]): boolean {
  return checks.some((check) => check.name === "provider_config" && check.status === "error");
}

function checkAuditConfig(checks: DoctorCheck[], cwd: string): void {
  const report = inspectAuditConfig(process.env, cwd);
  for (const check of report.checks) {
    checks.push({
      name: check.name,
      status: check.status,
      message: check.message
    });
  }
}

function hasAuditConfigError(checks: DoctorCheck[]): boolean {
  return checks.some((check) => check.name === "audit_config" && check.status === "error");
}

async function checkHostTools(checks: DoctorCheck[]): Promise<void> {
  let host: PreparedGodCodeHost | undefined;
  let diagnostic: DoctorCheck;
  try {
    host = await prepareGodCodeHost();
    diagnostic = {
      name: "tool_catalog",
      status: "ok",
      message: `${host.toolCatalog.length} tool(s)`
    };
  } catch (error) {
    diagnostic = {
      name: "tool_catalog",
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    };
  }

  if (host) {
    const finalization = await finalizeDoctorHost(host);
    if (diagnostic.status === "ok" && !finalization.ok) {
      diagnostic = {
        name: "tool_catalog",
        status: "error",
        message: TOOL_CATALOG_CLEANUP_FAILURE_MESSAGE
      };
    }
  }
  checks.push(diagnostic);
}

async function checkProviderHealth(checks: DoctorCheck[], cwd: string): Promise<void> {
  const provider = optionalEnv("GOD_CODE_PROVIDER");
  if (!provider || provider === "fake") {
    checks.push({
      name: "provider_health",
      status: "ok",
      message: "fake provider does not require HTTP health check"
    });
    return;
  }

  if (hasProviderConfigError(checks)) {
    checks.push({
      name: "provider_health",
      status: "warn",
      message: "skipped because provider_config has errors"
    });
    return;
  }

  const engine = new GodCodeEngineProcess({
    env: {
      GOD_CODE_TRANSCRIPT_DIR: undefined
    }
  });
  const sessionId = randomUUID();
  let expectedTurnId: string | undefined;
  let cleanupFinalResult: () => void | Promise<void> = () => undefined;
  let diagnostic: DoctorCheck;

  try {
    await engine.start();
    await engine.initialize(buildGodCodeInitializeRequest("doctor-provider-health"));
    await engine.createSession(buildGodCodeCreateSessionRequest(sessionId, cwd, [], provider));
    const wait = waitForTurnFinished(engine, () => expectedTurnId, providerHealthTimeoutMs());
    cleanupFinalResult = wait.cleanup;
    const submitResponse = await engine.submitTurn({
      session_id: sessionId,
      prompt: {
        role: "user",
        content: "health check"
      },
      turn_options: {
        max_tokens: 8,
        temperature: 0
      }
    });
    expectedTurnId = submitResponse.turn_id;

    const result = await wait.promise;
    if (result.status === "success") {
      diagnostic = {
        name: "provider_health",
        status: "ok",
        message: `${provider}: health turn completed`
      };
    } else {
      diagnostic = {
        name: "provider_health",
        status: "error",
        message: `${provider}: ${result.error?.message ?? `health turn ${result.status}`}`
      };
    }
  } catch (error) {
    diagnostic = {
      name: "provider_health",
      status: "error",
      message: `${provider}: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  const finalization = await finalizeDoctorEngine(engine, cleanupFinalResult);
  if (diagnostic.status === "ok" && !finalization.ok) {
    diagnostic = {
      name: "provider_health",
      status: "error",
      message: `${provider}: health check cleanup failed`
    };
  }
  checks.push(diagnostic);
}

function waitForTurnFinished(
  engine: GodCodeEngineProcess,
  getExpectedTurnId: () => string | undefined,
  timeoutMs: number
): { promise: Promise<TurnResult>; cleanup: () => Promise<void> } {
  let settled = false;
  let cleanupSettlement: Promise<void> | undefined;
  let timer: NodeJS.Timeout | undefined;
  let onGodCodeEvent: (event: GodCodeEventEnvelope) => void = () => undefined;
  let onExit: () => void = () => undefined;

  const cleanup = (): Promise<void> => {
    if (cleanupSettlement) {
      return cleanupSettlement;
    }

    let resolveCleanup!: () => void;
    let rejectCleanup!: (reason?: unknown) => void;
    cleanupSettlement = new Promise<void>((resolve, reject) => {
      resolveCleanup = resolve;
      rejectCleanup = reject;
    });
    const timerSettlement = invokeDoctorFinalizer(() => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    });
    const eventSettlement = invokeDoctorFinalizer(() => {
      engine.off("god_code_event", onGodCodeEvent);
    });
    const exitSettlement = invokeDoctorFinalizer(() => {
      engine.off("exit", onExit);
    });
    void Promise.allSettled([
      timerSettlement,
      eventSettlement,
      exitSettlement
    ]).then((results) => {
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") {
        rejectCleanup(failure.reason);
        return;
      }
      resolveCleanup();
    });
    return cleanupSettlement;
  };

  const promise = new Promise<TurnResult>((resolve, reject) => {
    timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      void cleanup().catch(() => undefined);
      reject(new Error("provider health turn timed out"));
    }, timeoutMs);

    function finish(result: TurnResult): void {
      if (settled) {
        return;
      }
      settled = true;
      void cleanup().catch(() => undefined);
      resolve(result);
    }

    function fail(error: Error): void {
      if (settled) {
        return;
      }
      settled = true;
      void cleanup().catch(() => undefined);
      reject(error);
    }

    onGodCodeEvent = (event: GodCodeEventEnvelope): void => {
      const expectedTurnId = getExpectedTurnId();
      if (expectedTurnId && event.turn_id !== expectedTurnId) {
        return;
      }
      if (event.event_type === "turn_finished") {
        finish(event.payload);
      }
    };

    onExit = (): void => {
      fail(new Error("provider health engine exited before turn_finished"));
    };

    engine.on("god_code_event", onGodCodeEvent);
    engine.once("exit", onExit);
  });

  return { promise, cleanup };
}

async function finalizeDoctorEngine(
  engine: GodCodeEngineProcess,
  cleanup: () => void | Promise<void> = () => undefined
): Promise<DoctorFinalizationOutcome> {
  const cleanupSettlement = invokeDoctorFinalizer(cleanup);
  const engineSettlement = invokeDoctorFinalizer(() => engine.stop());
  const results = await Promise.allSettled([cleanupSettlement, engineSettlement]);
  return results.some((result) => result.status === "rejected")
    ? { ok: false }
    : { ok: true };
}

async function finalizeDoctorHost(
  host: PreparedGodCodeHost
): Promise<DoctorFinalizationOutcome> {
  const [result] = await Promise.allSettled([
    invokeDoctorFinalizer(() => host.close())
  ]);
  return result.status === "rejected" ? { ok: false } : { ok: true };
}

function invokeDoctorFinalizer(finalizer: () => void | Promise<void>): Promise<void> {
  try {
    return Promise.resolve(finalizer());
  } catch (error) {
    return Promise.reject(error);
  }
}

function providerHealthTimeoutMs(): number {
  const timeout = optionalEnv("GOD_CODE_PROVIDER_TIMEOUT_S");
  if (timeout === undefined) {
    return 35_000;
  }
  const parsed = Number(timeout);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 35_000;
  }
  return Math.max(1_000, Math.ceil(parsed * 1_000) + 5_000);
}

function optionalEnv(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
