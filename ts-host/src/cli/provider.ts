import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ProviderDiagnosticStatus = "ok" | "warn" | "error";

export interface ProviderDiagnosticCheck {
  name: string;
  status: ProviderDiagnosticStatus;
  message: string;
  details?: unknown;
}

export interface ProviderDiagnosticReport {
  ok: boolean;
  checks: ProviderDiagnosticCheck[];
}

export type ProviderContractStatus = ProviderDiagnosticStatus;
export interface ProviderContractCheck extends ProviderDiagnosticCheck {}
export interface ProviderContractReport extends ProviderDiagnosticReport {}

export interface ProviderContractRunnerOptions {
  pythonExecutable?: string;
  runnerArgs?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

export interface LocalProviderDaemonOptions {
  cwd?: string;
  environ?: Record<string, string | undefined>;
  dryRun?: boolean;
  yes?: boolean;
}

export interface LocalProviderModelsOptions {
  environ?: Record<string, string | undefined>;
  requireConfiguredModel?: boolean;
  fetchImpl?: LocalProviderModelsFetch;
}

export interface LocalProviderModelPullOptions {
  cwd?: string;
  environ?: Record<string, string | undefined>;
  dryRun?: boolean;
  yes?: boolean;
}

export interface LocalProviderModelRemoveOptions {
  cwd?: string;
  environ?: Record<string, string | undefined>;
  dryRun?: boolean;
  yes?: boolean;
}

export interface LocalProviderModelPruneOptions {
  cwd?: string;
  environ?: Record<string, string | undefined>;
  dryRun?: boolean;
  yes?: boolean;
}

export interface LocalProviderModelInfo {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

export type LocalProviderModelsFetch = (url: string, init: RequestInit) => Promise<Response>;

export function inspectProviderConfig(
  environ: Record<string, string | undefined> = process.env
): ProviderDiagnosticReport {
  const provider = optionalEnv(environ, "GOD_CODE_PROVIDER");
  if (!provider || provider === "fake") {
    return {
      ok: true,
      checks: [
        {
          name: "provider_config",
          status: "ok",
          message: "using fake provider",
          details: {
            provider: "fake",
            model: undefined,
            api_key_env: undefined,
            api_key_present: false,
            configured_base_url: undefined,
            effective_base_url: undefined,
            timeout_s: 30,
            known_family: true,
            tool_use: {
              parallel_tool_calls: false
            }
          }
        }
      ]
    };
  }

  const errors: string[] = [];
  const model = optionalEnv(environ, "GOD_CODE_MODEL");
  const apiKeyEnv = optionalEnv(environ, "GOD_CODE_API_KEY_ENV");
  const configuredBaseUrl = optionalEnv(environ, "GOD_CODE_BASE_URL");
  const timeout = optionalEnv(environ, "GOD_CODE_PROVIDER_TIMEOUT_S");
  const parsedTimeout = parseProviderTimeout(timeout);
  const retryPolicy = parseProviderRetryPolicy(environ);
  const budgetPolicy = parseProviderBudgetPolicy(environ);
  const rateLimitPolicy = parseProviderRateLimitPolicy(environ);
  const toolUsePolicy = parseProviderToolUsePolicy(environ);
  const apiKeyRequired = providerApiKeyRequired(provider);
  const fallbackChain = parseProviderFallbacks(environ, {
    provider,
    model,
    configuredBaseUrl
  });
  const apiKeyPresent = apiKeyEnv ? optionalEnv(environ, apiKeyEnv) !== undefined : false;
  const knownFamily = KNOWN_PROVIDER_FAMILIES.has(provider);

  if (!model) {
    errors.push("missing GOD_CODE_MODEL");
  }
  if (!apiKeyEnv && apiKeyRequired) {
    errors.push("missing GOD_CODE_API_KEY_ENV");
  } else if (apiKeyEnv && !apiKeyPresent) {
    errors.push(`missing provider API key environment variable: ${apiKeyEnv}`);
  }
  if (timeout !== undefined && parsedTimeout === undefined) {
    errors.push("GOD_CODE_PROVIDER_TIMEOUT_S must be a positive number");
  }
  errors.push(...retryPolicy.errors);
  errors.push(...budgetPolicy.errors);
  errors.push(...rateLimitPolicy.errors);
  errors.push(...toolUsePolicy.errors);
  errors.push(...fallbackChain.errors);

  const details = compactDetails({
    provider,
    model,
    api_key_env: apiKeyEnv,
    api_key_present: apiKeyPresent,
    api_key_required: apiKeyRequired,
    configured_base_url: configuredBaseUrl,
    effective_base_url: effectiveBaseUrl(provider, configuredBaseUrl),
    timeout_s: parsedTimeout,
    known_family: knownFamily,
    retry: retryPolicy.details,
    budget: budgetPolicy.details,
    rate_limit: rateLimitPolicy.details,
    tool_use: toolUsePolicy.details,
    fallbacks: fallbackChain.details.length > 0 ? fallbackChain.details : undefined
  });

  if (errors.length > 0) {
    return {
      ok: false,
      checks: [
        {
          name: "provider_config",
          status: "error",
          message: `${provider}: ${errors.join("; ")}`,
          details
        }
      ]
    };
  }

  if (!knownFamily) {
    return {
      ok: true,
      checks: [
        {
          name: "provider_config",
          status: "warn",
          message: `${provider}: config shape is complete, but provider family is not built in`,
          details
        }
      ]
    };
  }

  return {
    ok: true,
    checks: [
      {
          name: "provider_config",
          status: "ok",
          message: `${provider}: model=${model}; api_key_env=${apiKeyEnv ?? "(optional unset)"}; timeout_s=${timeout ?? "30"}`,
          details
        }
    ]
  };
}

export function renderProviderConfigReport(report: ProviderDiagnosticReport): string {
  const lines = ["GOD-code provider config:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    if (isRecord(check.details)) {
      for (const key of PROVIDER_CONFIG_DETAIL_KEYS) {
        if (check.details[key] !== undefined) {
          lines.push(`  ${key}: ${String(check.details[key])}`);
        }
      }
      if (isRecord(check.details.retry)) {
        lines.push(
          [
            "  retry:",
            `max_retries=${String(check.details.retry.max_retries)}`,
            `base_delay_ms=${String(check.details.retry.base_delay_ms)}`,
            `max_delay_ms=${String(check.details.retry.max_delay_ms)}`
          ].join(" ")
        );
      }
      if (isRecord(check.details.budget)) {
        lines.push(
          [
            "  budget:",
            `max_input_tokens=${String(check.details.budget.max_input_tokens)}`,
            `max_output_tokens=${String(check.details.budget.max_output_tokens)}`,
            `max_total_tokens=${String(check.details.budget.max_total_tokens)}`,
            `require_usage=${String(check.details.budget.require_usage)}`
          ].join(" ")
        );
      }
      if (isRecord(check.details.rate_limit)) {
        const parts = [
          "  rate_limit:",
          `enabled=${String(check.details.rate_limit.enabled)}`,
          `strategy=${String(check.details.rate_limit.strategy)}`,
          `min_interval_ms=${String(check.details.rate_limit.min_interval_ms)}`,
          `max_wait_ms=${String(check.details.rate_limit.max_wait_ms)}`,
          `scope=${String(check.details.rate_limit.scope)}`
        ];
        if (check.details.rate_limit.requests_per_minute !== undefined) {
          parts.splice(
            3,
            0,
            `requests_per_minute=${String(check.details.rate_limit.requests_per_minute)}`
          );
        }
        lines.push(parts.join(" "));
      }
      if (isRecord(check.details.tool_use)) {
        lines.push(
          [
            "  tool_use:",
            `parallel_tool_calls=${String(check.details.tool_use.parallel_tool_calls)}`
          ].join(" ")
        );
      }
      if (Array.isArray(check.details.fallbacks)) {
        for (const [index, fallback] of check.details.fallbacks.entries()) {
          if (!isRecord(fallback)) {
            continue;
          }
          const parts = [
            `provider=${String(fallback.provider)}`,
            `model=${String(fallback.model)}`,
            `base_url=${String(fallback.effective_base_url)}`,
            `api_key_env=${String(fallback.api_key_env)}`,
            `api_key_present=${String(fallback.api_key_present)}`,
            `timeout_s=${String(fallback.timeout_s)}`
          ];
          if (isRecord(fallback.retry)) {
            parts.push(
              `retry=max_retries=${String(fallback.retry.max_retries)},base_delay_ms=${String(fallback.retry.base_delay_ms)},max_delay_ms=${String(fallback.retry.max_delay_ms)}`
            );
          }
          lines.push(`  fallback[${index}]: ${parts.join(" ")}`);
        }
      }
    }
  }
  return lines.join("\n");
}

export function renderProviderConfigReportJson(report: ProviderDiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}

export async function inspectLocalProviderDaemon(
  options: LocalProviderDaemonOptions = {}
): Promise<ProviderDiagnosticReport> {
  const context = parseLocalProviderDaemonContext(options);
  return localProviderDaemonReport(context, "status");
}

export async function startLocalProviderDaemon(
  options: LocalProviderDaemonOptions = {}
): Promise<ProviderDiagnosticReport> {
  const context = parseLocalProviderDaemonContext(options);
  if (context.errors.length > 0) {
    return localProviderDaemonReport(context, "start");
  }
  if (!context.config.enabled) {
    return localProviderDaemonReport(context, "start", {
      status: "error",
      message: "local provider daemon lifecycle is disabled"
    });
  }
  const marker = await readLocalDaemonMarker(context.config.pidFile);
  const markerLive = marker ? isPidLive(marker.pid) : false;
  if (marker && markerLive && marker.command_hash === context.commandHash) {
    return localProviderDaemonReport(context, "start", {
      status: "ok",
      message: "local provider daemon is already running",
      marker,
      markerLive
    });
  }
  if (options.dryRun !== false || !options.yes) {
    return localProviderDaemonReport(context, "start", {
      status: "ok",
      message: "dry-run: local provider daemon would be started",
      marker,
      markerLive
    });
  }

  await fsp.mkdir(path.dirname(context.config.pidFile), { recursive: true });
  await fsp.mkdir(path.dirname(context.config.logFile), { recursive: true });
  const logFd = fs.openSync(context.config.logFile, "a");
  let operationReport: ProviderDiagnosticReport;
  try {
    const child = spawn(context.config.command!, context.config.args, {
      cwd: context.config.daemonCwd ?? context.cwd,
      detached: true,
      env: buildLocalDaemonEnv(context.config.envAllowlist),
      stdio: ["ignore", logFd, logFd]
    });
    if (child.pid === undefined) {
      operationReport = localProviderDaemonReport(context, "start", {
        status: "error",
        message: "failed to start local provider daemon"
      });
    } else {
      child.unref();
      const newMarker: LocalProviderDaemonMarker = {
        schema_version: 1,
        provider: "local-openai-compatible",
        pid: child.pid,
        command_hash: context.commandHash,
        base_url: context.config.baseUrl,
        started_at: new Date().toISOString()
      };
      await fsp.writeFile(context.config.pidFile, `${JSON.stringify(newMarker, null, 2)}\n`, "utf8");
      operationReport = localProviderDaemonReport(context, "start", {
        status: "ok",
        message: "local provider daemon started",
        marker: newMarker,
        markerLive: true
      });
    }
  } catch (error) {
    invokeLocalProviderLogDescriptorFinalizer(logFd);
    throw error;
  }
  return finalizeLocalProviderLogReport(operationReport, logFd);
}

export async function stopLocalProviderDaemon(
  options: LocalProviderDaemonOptions = {}
): Promise<ProviderDiagnosticReport> {
  const context = parseLocalProviderDaemonContext(options);
  if (context.errors.length > 0) {
    return localProviderDaemonReport(context, "stop");
  }
  const marker = await readLocalDaemonMarker(context.config.pidFile);
  const markerLive = marker ? isPidLive(marker.pid) : false;
  if (!marker) {
    return localProviderDaemonReport(context, "stop", {
      status: options.yes ? "error" : "ok",
      message: "no GOD-code local provider daemon marker found"
    });
  }
  if (marker.command_hash !== context.commandHash) {
    return localProviderDaemonReport(context, "stop", {
      status: "error",
      message: "local provider daemon marker does not match current daemon config",
      marker,
      markerLive
    });
  }
  if (options.dryRun !== false || !options.yes) {
    return localProviderDaemonReport(context, "stop", {
      status: "ok",
      message: markerLive
        ? "dry-run: local provider daemon would be stopped"
        : "dry-run: local provider daemon marker is stale",
      marker,
      markerLive
    });
  }
  if (markerLive) {
    process.kill(marker.pid, "SIGTERM");
  }
  await fsp.rm(context.config.pidFile, { force: true });
  return localProviderDaemonReport(context, "stop", {
    status: "ok",
    message: markerLive
      ? "local provider daemon stop signal sent"
      : "stale local provider daemon marker removed",
    marker,
    markerLive: false
  });
}

export function renderLocalProviderDaemonReport(report: ProviderDiagnosticReport): string {
  const lines = ["GOD-code local provider daemon:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    if (!isRecord(check.details)) {
      continue;
    }
    for (const key of LOCAL_DAEMON_DETAIL_KEYS) {
      if (check.details[key] !== undefined) {
        lines.push(`  ${key}: ${String(check.details[key])}`);
      }
    }
  }
  return lines.join("\n");
}

export function renderLocalProviderDaemonReportJson(report: ProviderDiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}

export async function listLocalProviderModels(
  options: LocalProviderModelsOptions = {}
): Promise<ProviderDiagnosticReport> {
  const context = parseLocalProviderModelsContext(options);
  if (context.errors.length > 0) {
    return localProviderModelsReport(context, {
      status: "error",
      message: context.errors.join("; ")
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.ceil(context.config.timeoutS * 1000));
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    clearTimeout(timer);
    return localProviderModelsReport(context, {
      status: "error",
      message: "fetch API is unavailable in this Node.js runtime"
    });
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    if (context.config.apiKey !== undefined) {
      headers.Authorization = `Bearer ${context.config.apiKey}`;
    }

    const response = await fetchImpl(context.config.modelsUrl!, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: controller.signal
    });
    const body = await response.text();
    if (!response.ok) {
      return localProviderModelsReport(context, {
        status: "error",
        message: localProviderModelsHttpErrorMessage(response.status),
        httpStatus: response.status
      });
    }

    const parsed = parseLocalProviderModelsResponse(body, context.config.maxResults);
    if (parsed.error !== undefined) {
      return localProviderModelsReport(context, {
        status: "error",
        message: parsed.error,
        responseBytes: Buffer.byteLength(body, "utf8")
      });
    }

    const configuredModelPresent = context.config.model === undefined
      ? undefined
      : parsed.modelIds.includes(context.config.model);
    if (options.requireConfiguredModel && context.config.model === undefined) {
      return localProviderModelsReport(context, {
        status: "error",
        message: "--require-configured-model requires GOD_CODE_MODEL"
      });
    }
    if (options.requireConfiguredModel && configuredModelPresent === false) {
      return localProviderModelsReport(context, {
        status: "error",
        message: `configured model was not found in local provider model list`,
        models: parsed.models,
        truncated: parsed.truncated,
        configuredModelPresent
      });
    }

    return localProviderModelsReport(context, {
      status: "ok",
      message: `discovered ${parsed.models.length} local provider model${parsed.models.length === 1 ? "" : "s"}`,
      models: parsed.models,
      truncated: parsed.truncated,
      configuredModelPresent
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? `local provider models request timed out after ${context.config.timeoutS}s`
      : `local provider models request failed: ${error instanceof Error ? error.message : String(error)}`;
    return localProviderModelsReport(context, {
      status: "error",
      message: sanitizeDiagnosticString(message, 240)
    });
  } finally {
    clearTimeout(timer);
  }
}

export function renderLocalProviderModelsReport(report: ProviderDiagnosticReport): string {
  const lines = ["GOD-code local provider models:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    if (!isRecord(check.details)) {
      continue;
    }
    for (const key of LOCAL_MODELS_DETAIL_KEYS) {
      if (check.details[key] !== undefined) {
        lines.push(`  ${key}: ${String(check.details[key])}`);
      }
    }
    if (Array.isArray(check.details.models)) {
      lines.push("  models:");
      for (const model of check.details.models) {
        if (!isRecord(model) || typeof model.id !== "string") {
          continue;
        }
        const suffix = typeof model.owned_by === "string" ? ` owned_by=${model.owned_by}` : "";
        lines.push(`  - ${model.id}${suffix}`);
      }
    }
  }
  return lines.join("\n");
}

export function renderLocalProviderModelsReportJson(report: ProviderDiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}

export async function pullLocalProviderModel(
  model: string,
  options: LocalProviderModelPullOptions = {}
): Promise<ProviderDiagnosticReport> {
  const context = parseLocalProviderModelPullContext(model, options);
  if (context.errors.length > 0) {
    return localProviderModelPullReport(context, {
      status: "error",
      message: context.errors.join("; ")
    });
  }
  if (!context.config.enabled) {
    return localProviderModelPullReport(context, {
      status: "error",
      message: "local provider model pull is disabled"
    });
  }
  if (options.dryRun !== false || !options.yes) {
    return localProviderModelPullReport(context, {
      status: "ok",
      message: "dry-run: local provider model pull would be executed"
    });
  }

  await fsp.mkdir(path.dirname(context.config.logFile), { recursive: true });
  const logFd = fs.openSync(context.config.logFile, "a");
  const startedAt = Date.now();
  try {
    const child = spawn(context.config.command!, context.config.args, {
      cwd: context.config.pullCwd ?? context.cwd,
      env: buildLocalProcessEnv(context.config.envAllowlist),
      shell: false,
      stdio: ["ignore", logFd, logFd]
    });
    return await waitForLocalModelPullProcess(context, child, logFd, startedAt);
  } catch (error) {
    return finalizeLocalProviderLogReport(
      localProviderModelPullReport(context, {
        status: "error",
        message: sanitizeDiagnosticString(
          `failed to start local provider model pull: ${error instanceof Error ? error.message : String(error)}`,
          240
        ),
        durationMs: Date.now() - startedAt
      }),
      logFd
    );
  }
}

export function renderLocalProviderModelPullReport(report: ProviderDiagnosticReport): string {
  const lines = ["GOD-code local provider model pull:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    if (!isRecord(check.details)) {
      continue;
    }
    for (const key of LOCAL_MODEL_PULL_DETAIL_KEYS) {
      if (check.details[key] !== undefined) {
        lines.push(`  ${key}: ${String(check.details[key])}`);
      }
    }
  }
  return lines.join("\n");
}

export function renderLocalProviderModelPullReportJson(report: ProviderDiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}

export async function removeLocalProviderModel(
  model: string,
  options: LocalProviderModelRemoveOptions = {}
): Promise<ProviderDiagnosticReport> {
  const context = parseLocalProviderModelRemoveContext(model, options);
  if (context.errors.length > 0) {
    return localProviderModelRemoveReport(context, {
      status: "error",
      message: context.errors.join("; ")
    });
  }
  if (!context.config.enabled) {
    return localProviderModelRemoveReport(context, {
      status: "error",
      message: "local provider model remove is disabled"
    });
  }
  if (options.dryRun !== false || !options.yes) {
    return localProviderModelRemoveReport(context, {
      status: "ok",
      message: "dry-run: local provider model remove would be executed"
    });
  }

  await fsp.mkdir(path.dirname(context.config.logFile), { recursive: true });
  const logFd = fs.openSync(context.config.logFile, "a");
  const startedAt = Date.now();
  try {
    const child = spawn(context.config.command!, context.config.args, {
      cwd: context.config.removeCwd ?? context.cwd,
      env: buildLocalProcessEnv(context.config.envAllowlist),
      shell: false,
      stdio: ["ignore", logFd, logFd]
    });
    return await waitForLocalModelRemoveProcess(context, child, logFd, startedAt);
  } catch (error) {
    return finalizeLocalProviderLogReport(
      localProviderModelRemoveReport(context, {
        status: "error",
        message: sanitizeDiagnosticString(
          `failed to start local provider model remove: ${error instanceof Error ? error.message : String(error)}`,
          240
        ),
        durationMs: Date.now() - startedAt
      }),
      logFd
    );
  }
}

export function renderLocalProviderModelRemoveReport(report: ProviderDiagnosticReport): string {
  const lines = ["GOD-code local provider model remove:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    if (!isRecord(check.details)) {
      continue;
    }
    for (const key of LOCAL_MODEL_REMOVE_DETAIL_KEYS) {
      if (check.details[key] !== undefined) {
        lines.push(`  ${key}: ${String(check.details[key])}`);
      }
    }
  }
  return lines.join("\n");
}

export function renderLocalProviderModelRemoveReportJson(report: ProviderDiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}

export async function pruneLocalProviderModels(
  target: string,
  options: LocalProviderModelPruneOptions = {}
): Promise<ProviderDiagnosticReport> {
  const context = parseLocalProviderModelPruneContext(target, options);
  if (context.errors.length > 0) {
    return localProviderModelPruneReport(context, {
      status: "error",
      message: context.errors.join("; ")
    });
  }
  if (!context.config.enabled) {
    return localProviderModelPruneReport(context, {
      status: "error",
      message: "local provider model prune is disabled"
    });
  }
  if (options.dryRun === false && options.yes && !context.config.targetAllowed) {
    return localProviderModelPruneReport(context, {
      status: "error",
      message: "local provider model prune target is not allowed by GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS"
    });
  }
  if (options.dryRun !== false || !options.yes) {
    return localProviderModelPruneReport(context, {
      status: "ok",
      message: "dry-run: local provider model prune would be executed"
    });
  }

  await fsp.mkdir(path.dirname(context.config.logFile), { recursive: true });
  const logFd = fs.openSync(context.config.logFile, "a");
  const startedAt = Date.now();
  try {
    const child = spawn(context.config.command!, context.config.args, {
      cwd: context.config.pruneCwd ?? context.cwd,
      env: buildLocalProcessEnv(context.config.envAllowlist),
      shell: false,
      stdio: ["ignore", logFd, logFd]
    });
    return await waitForLocalModelPruneProcess(context, child, logFd, startedAt);
  } catch (error) {
    return finalizeLocalProviderLogReport(
      localProviderModelPruneReport(context, {
        status: "error",
        message: sanitizeDiagnosticString(
          `failed to start local provider model prune: ${error instanceof Error ? error.message : String(error)}`,
          240
        ),
        durationMs: Date.now() - startedAt
      }),
      logFd
    );
  }
}

export function renderLocalProviderModelPruneReport(report: ProviderDiagnosticReport): string {
  const lines = ["GOD-code local provider model prune:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    if (!isRecord(check.details)) {
      continue;
    }
    for (const key of LOCAL_MODEL_PRUNE_DETAIL_KEYS) {
      if (check.details[key] !== undefined) {
        lines.push(`  ${key}: ${String(check.details[key])}`);
      }
    }
  }
  return lines.join("\n");
}

export function renderLocalProviderModelPruneReportJson(report: ProviderDiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}

export async function runProviderContractTests(
  options: ProviderContractRunnerOptions = {}
): Promise<ProviderContractReport> {
  const tsHostRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const godCodeRoot = path.resolve(tsHostRoot, "..");
  const pyEngineRoot = path.resolve(godCodeRoot, "py-engine");
  const pyEngineSrc = path.resolve(pyEngineRoot, "src");
  const pythonExecutable = options.pythonExecutable ?? process.env.GOD_CODE_PYTHON ?? "python3";
  const runnerArgs = options.runnerArgs ?? ["-m", "god_code_engine.providers.contracts"];
  const timeoutMs = options.timeoutMs ?? 30_000;
  const env = buildRunnerEnv(pyEngineSrc, options.env);

  return await new Promise<ProviderContractReport>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(pythonExecutable, runnerArgs, {
      cwd: options.cwd ?? pyEngineRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      resolve(runnerErrorReport("provider contract runner timed out", { timeout_ms: timeoutMs }));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(runnerErrorReport(`provider contract runner failed to start: ${error.message}`));
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);

      const report = parseProviderContractReport(stdout);
      if (!report) {
        resolve(
          runnerErrorReport("provider contract runner returned invalid JSON", {
            exit_code: code ?? -1,
            stderr: trimDiagnostic(stderr)
          })
        );
        return;
      }

      if (code !== 0 && report.ok) {
        resolve(
          runnerErrorReport("provider contract runner exited non-zero with ok report", {
            exit_code: code ?? -1,
            stderr: trimDiagnostic(stderr)
          })
        );
        return;
      }

      resolve(report);
    });
  });
}

export function renderProviderContractReport(report: ProviderContractReport): string {
  const lines = ["GOD-code provider contract tests:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
  }
  return lines.join("\n");
}

export function renderProviderContractReportJson(report: ProviderContractReport): string {
  return JSON.stringify(report, null, 2);
}

function buildRunnerEnv(
  pyEngineSrc: string,
  overrides: Record<string, string | undefined> | undefined
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env
  };

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  env.PYTHONPATH = [pyEngineSrc, env.PYTHONPATH].filter(Boolean).join(path.delimiter);
  return env;
}

function parseProviderContractReport(raw: string): ProviderContractReport | undefined {
  try {
    const decoded = JSON.parse(raw) as unknown;
    if (!isProviderContractReport(decoded)) {
      return undefined;
    }
    return decoded;
  } catch {
    return undefined;
  }
}

function isProviderContractReport(value: unknown): value is ProviderContractReport {
  if (!isRecord(value) || typeof value.ok !== "boolean" || !Array.isArray(value.checks)) {
    return false;
  }
  return value.checks.every(isProviderContractCheck);
}

function isProviderContractCheck(value: unknown): value is ProviderContractCheck {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.name !== "string" || typeof value.message !== "string") {
    return false;
  }
  return value.status === "ok" || value.status === "warn" || value.status === "error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runnerErrorReport(message: string, details?: Record<string, unknown>): ProviderContractReport {
  return {
    ok: false,
    checks: [
      {
        name: "provider_contract_runner",
        status: "error",
        message,
        ...(details ? { details } : {})
      }
    ]
  };
}

function trimDiagnostic(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 1000 ? `${trimmed.slice(0, 1000)}...` : trimmed;
}

const KNOWN_PROVIDER_FAMILIES = new Set([
  "openai",
  "openai-compatible",
  "openai-responses",
  "openai-compatible-responses",
  "anthropic",
  "anthropic-compatible",
  "local-openai-compatible"
]);

const DEFAULT_PROVIDER_BASE_URLS = new Map<string, string>([
  ["openai", "https://api.openai.com/v1"],
  ["openai-compatible", "https://api.openai.com/v1"],
  ["openai-responses", "https://api.openai.com/v1"],
  ["openai-compatible-responses", "https://api.openai.com/v1"],
  ["anthropic", "https://api.anthropic.com"],
  ["anthropic-compatible", "https://api.anthropic.com"],
  ["local-openai-compatible", "http://127.0.0.1:11434/v1"]
]);

const PROVIDER_CONFIG_DETAIL_KEYS = [
  "provider",
  "model",
  "api_key_env",
  "api_key_present",
  "api_key_required",
  "configured_base_url",
  "effective_base_url",
  "timeout_s",
  "known_family"
];

const DEFAULT_PROVIDER_RETRY_POLICY = {
  max_retries: 0,
  base_delay_ms: 250,
  max_delay_ms: 2000
};

const DEFAULT_PROVIDER_RATE_LIMIT_POLICY = {
  enabled: false,
  strategy: "fail-fast",
  min_interval_ms: 0,
  max_wait_ms: 0,
  scope: "process"
};

interface LocalProviderDaemonConfig {
  enabled: boolean;
  provider: string | undefined;
  baseUrl: string | undefined;
  command?: string;
  args: string[];
  daemonCwd?: string;
  readyUrl?: string;
  readyTimeoutMs: number;
  pidFile: string;
  logFile: string;
  envAllowlist?: string[];
}

interface LocalProviderDaemonContext {
  cwd: string;
  config: LocalProviderDaemonConfig;
  commandHash: string;
  errors: string[];
}

interface LocalProviderDaemonMarker {
  schema_version: 1;
  provider: "local-openai-compatible";
  pid: number;
  command_hash: string;
  base_url?: string;
  started_at: string;
}

interface LocalProviderModelsConfig {
  provider: string;
  model?: string;
  baseUrl?: string;
  modelsUrl?: string;
  timeoutS: number;
  maxResults: number;
  apiKeyEnv?: string;
  apiKeyPresent: boolean;
  apiKey?: string;
}

interface LocalProviderModelsContext {
  config: LocalProviderModelsConfig;
  errors: string[];
}

interface LocalProviderModelPullConfig {
  enabled: boolean;
  provider: string;
  model: string;
  command?: string;
  argsTemplate: string[];
  args: string[];
  pullCwd?: string;
  timeoutMs: number;
  logFile: string;
  envAllowlist?: string[];
}

interface LocalProviderModelPullContext {
  cwd: string;
  config: LocalProviderModelPullConfig;
  errors: string[];
}

interface LocalProviderModelRemoveConfig {
  enabled: boolean;
  provider: string;
  model: string;
  command?: string;
  argsTemplate: string[];
  args: string[];
  removeCwd?: string;
  timeoutMs: number;
  logFile: string;
  envAllowlist?: string[];
}

interface LocalProviderModelRemoveContext {
  cwd: string;
  config: LocalProviderModelRemoveConfig;
  errors: string[];
}

interface LocalProviderModelPruneConfig {
  enabled: boolean;
  provider: string;
  target: string;
  targetAllowed: boolean;
  allowedTargets?: string[];
  command?: string;
  argsTemplate: string[];
  args: string[];
  pruneCwd?: string;
  timeoutMs: number;
  logFile: string;
  envAllowlist?: string[];
}

interface LocalProviderModelPruneContext {
  cwd: string;
  config: LocalProviderModelPruneConfig;
  errors: string[];
}

const DEFAULT_LOCAL_DAEMON_READY_TIMEOUT_MS = 15_000;
const DEFAULT_LOCAL_MODELS_MAX_RESULTS = 200;
const MAX_LOCAL_MODELS_MAX_RESULTS = 1000;
const DEFAULT_LOCAL_MODEL_PULL_TIMEOUT_MS = 600_000;
const MAX_LOCAL_MODEL_PULL_TIMEOUT_MS = 86_400_000;
const DEFAULT_LOCAL_MODEL_REMOVE_TIMEOUT_MS = 600_000;
const MAX_LOCAL_MODEL_REMOVE_TIMEOUT_MS = 86_400_000;
const DEFAULT_LOCAL_MODEL_PRUNE_TIMEOUT_MS = 600_000;
const MAX_LOCAL_MODEL_PRUNE_TIMEOUT_MS = 86_400_000;
const LOCAL_PROVIDER_LOG_CLEANUP_FAILURE_MESSAGE =
  "local provider log cleanup failed";
const MAX_LOCAL_MODEL_NAME_LENGTH = 512;
const MAX_LOCAL_MODEL_PRUNE_TARGET_LENGTH = 128;

const LOCAL_DAEMON_DETAIL_KEYS = [
  "action",
  "enabled",
  "provider",
  "base_url",
  "command_configured",
  "command_basename",
  "args_count",
  "daemon_cwd",
  "pid_file",
  "log_file",
  "marker_present",
  "marker_pid",
  "marker_live",
  "ready_url",
  "ready_timeout_ms",
  "env_allowlist_count"
];

const LOCAL_MODELS_DETAIL_KEYS = [
  "provider",
  "base_url",
  "models_url",
  "configured_model",
  "configured_model_present",
  "model_count",
  "truncated",
  "timeout_s",
  "max_results",
  "api_key_env",
  "api_key_present",
  "http_status",
  "response_bytes"
];

const LOCAL_MODEL_PULL_DETAIL_KEYS = [
  "enabled",
  "provider",
  "model",
  "command_configured",
  "command_basename",
  "args_count",
  "pull_cwd",
  "log_file",
  "timeout_ms",
  "env_allowlist_count",
  "exit_code",
  "signal",
  "duration_ms",
  "timed_out"
];

const LOCAL_MODEL_REMOVE_DETAIL_KEYS = [
  "enabled",
  "provider",
  "model",
  "command_configured",
  "command_basename",
  "args_count",
  "remove_cwd",
  "log_file",
  "timeout_ms",
  "env_allowlist_count",
  "exit_code",
  "signal",
  "duration_ms",
  "timed_out"
];

const LOCAL_MODEL_PRUNE_DETAIL_KEYS = [
  "enabled",
  "provider",
  "target",
  "target_allowed",
  "allowed_target_count",
  "command_configured",
  "command_basename",
  "args_count",
  "prune_cwd",
  "log_file",
  "timeout_ms",
  "env_allowlist_count",
  "exit_code",
  "signal",
  "duration_ms",
  "timed_out"
];

function optionalEnv(source: Record<string, string | undefined>, key: string): string | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseProviderTimeout(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return 30;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function parseProviderRetryPolicy(environ: Record<string, string | undefined>): {
  details: Record<string, number>;
  errors: string[];
} {
  const errors: string[] = [];
  const maxRetries = parseNonNegativeIntegerEnv(environ, "GOD_CODE_PROVIDER_MAX_RETRIES");
  const baseDelayMs = parseNonNegativeIntegerEnv(environ, "GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS");
  const maxDelayMs = parseNonNegativeIntegerEnv(environ, "GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS");

  for (const parsed of [maxRetries, baseDelayMs, maxDelayMs]) {
    if (parsed.error) {
      errors.push(parsed.error);
    }
  }

  const details = {
    max_retries: maxRetries.value ?? DEFAULT_PROVIDER_RETRY_POLICY.max_retries,
    base_delay_ms: baseDelayMs.value ?? DEFAULT_PROVIDER_RETRY_POLICY.base_delay_ms,
    max_delay_ms: maxDelayMs.value ?? DEFAULT_PROVIDER_RETRY_POLICY.max_delay_ms
  };
  if (details.max_delay_ms < details.base_delay_ms) {
    errors.push(
      "GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS must be greater than or equal to GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS"
    );
  }
  return { details, errors };
}

function parseProviderBudgetPolicy(environ: Record<string, string | undefined>): {
  details: Record<string, unknown>;
  errors: string[];
} {
  const errors: string[] = [];
  const maxInputTokens = parsePositiveIntegerEnv(environ, "GOD_CODE_PROVIDER_MAX_INPUT_TOKENS");
  const maxOutputTokens = parsePositiveIntegerEnv(environ, "GOD_CODE_PROVIDER_MAX_OUTPUT_TOKENS");
  const maxTotalTokens = parsePositiveIntegerEnv(environ, "GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS");
  const requireUsage = parseBooleanEnv(environ, "GOD_CODE_PROVIDER_REQUIRE_USAGE");

  for (const parsed of [maxInputTokens, maxOutputTokens, maxTotalTokens, requireUsage]) {
    if (parsed.error) {
      errors.push(parsed.error);
    }
  }

  return {
    details: compactDetails({
      max_input_tokens: maxInputTokens.value,
      max_output_tokens: maxOutputTokens.value,
      max_total_tokens: maxTotalTokens.value,
      require_usage: requireUsage.value ?? false
    }),
    errors
  };
}

function parseProviderRateLimitPolicy(environ: Record<string, string | undefined>): {
  details: Record<string, unknown>;
  errors: string[];
} {
  const errors: string[] = [];
  const enabled = parseBooleanEnv(environ, "GOD_CODE_PROVIDER_RATE_LIMIT_ENABLED");
  const requestsPerMinute = parsePositiveIntegerEnv(
    environ,
    "GOD_CODE_PROVIDER_RATE_LIMIT_REQUESTS_PER_MINUTE"
  );
  const minIntervalMs = parseNonNegativeIntegerEnv(
    environ,
    "GOD_CODE_PROVIDER_RATE_LIMIT_MIN_INTERVAL_MS"
  );
  const maxWaitMs = parseNonNegativeIntegerEnv(
    environ,
    "GOD_CODE_PROVIDER_RATE_LIMIT_MAX_WAIT_MS"
  );
  const strategy = optionalEnv(environ, "GOD_CODE_PROVIDER_RATE_LIMIT_STRATEGY") ??
    DEFAULT_PROVIDER_RATE_LIMIT_POLICY.strategy;
  const scope = optionalEnv(environ, "GOD_CODE_PROVIDER_RATE_LIMIT_SCOPE") ??
    DEFAULT_PROVIDER_RATE_LIMIT_POLICY.scope;

  for (const parsed of [enabled, requestsPerMinute, minIntervalMs, maxWaitMs]) {
    if (parsed.error) {
      errors.push(parsed.error);
    }
  }
  if (!["fail-fast", "wait"].includes(strategy)) {
    errors.push("GOD_CODE_PROVIDER_RATE_LIMIT_STRATEGY must be one of: fail-fast, wait");
  }
  if (scope !== "process") {
    errors.push("GOD_CODE_PROVIDER_RATE_LIMIT_SCOPE must be process");
  }

  return {
    details: compactDetails({
      enabled: enabled.value ?? DEFAULT_PROVIDER_RATE_LIMIT_POLICY.enabled,
      strategy,
      requests_per_minute: requestsPerMinute.value,
      min_interval_ms: minIntervalMs.value ?? DEFAULT_PROVIDER_RATE_LIMIT_POLICY.min_interval_ms,
      max_wait_ms: maxWaitMs.value ?? DEFAULT_PROVIDER_RATE_LIMIT_POLICY.max_wait_ms,
      scope
    }),
    errors
  };
}

function parseProviderToolUsePolicy(environ: Record<string, string | undefined>): {
  details: Record<string, unknown>;
  errors: string[];
} {
  const parallelToolCalls = parseBooleanEnv(environ, "GOD_CODE_PROVIDER_PARALLEL_TOOL_CALLS");
  return {
    details: {
      parallel_tool_calls: parallelToolCalls.value ?? false
    },
    errors: parallelToolCalls.error ? [parallelToolCalls.error] : []
  };
}

function parseLocalProviderDaemonContext(
  options: LocalProviderDaemonOptions
): LocalProviderDaemonContext {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const environ = options.environ ?? process.env;
  const provider = optionalEnv(environ, "GOD_CODE_PROVIDER") ?? "fake";
  const configuredBaseUrl = optionalEnv(environ, "GOD_CODE_BASE_URL");
  const baseUrl = provider === "local-openai-compatible"
    ? effectiveBaseUrl(provider, configuredBaseUrl)
    : configuredBaseUrl;
  const enabled = parseBooleanEnv(environ, "GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED");
  const args = parseStringArrayJsonEnv(environ, "GOD_CODE_LOCAL_PROVIDER_DAEMON_ARGS");
  const readyTimeoutMs = parsePositiveIntegerEnv(
    environ,
    "GOD_CODE_LOCAL_PROVIDER_DAEMON_READY_TIMEOUT_MS"
  );
  const envAllowlist = parseStringListEnv(environ, "GOD_CODE_LOCAL_PROVIDER_DAEMON_ENV_ALLOWLIST");
  const errors = [
    enabled.error,
    args.error,
    readyTimeoutMs.error,
    envAllowlist.error
  ].filter((error): error is string => error !== undefined);
  const daemonEnabled = enabled.value ?? false;
  const command = optionalEnv(environ, "GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND");
  const daemonCwd = optionalPathEnv(environ, "GOD_CODE_LOCAL_PROVIDER_DAEMON_CWD", cwd);
  const readyUrl = optionalEnv(environ, "GOD_CODE_LOCAL_PROVIDER_DAEMON_READY_URL") ??
    deriveLocalReadyUrl(baseUrl);
  const pidFile = optionalPathEnv(
    environ,
    "GOD_CODE_LOCAL_PROVIDER_DAEMON_PID_FILE",
    cwd,
    ".god-code/local-provider-daemon.json"
  ) ?? path.resolve(cwd, ".god-code/local-provider-daemon.json");
  const logFile = optionalPathEnv(
    environ,
    "GOD_CODE_LOCAL_PROVIDER_DAEMON_LOG_FILE",
    cwd,
    ".god-code/local-provider-daemon.log"
  ) ?? path.resolve(cwd, ".god-code/local-provider-daemon.log");

  if (daemonEnabled) {
    if (provider !== "local-openai-compatible") {
      errors.push("local provider daemon lifecycle requires GOD_CODE_PROVIDER=local-openai-compatible");
    }
    if (command === undefined) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND is required when local daemon lifecycle is enabled");
    }
    if (daemonCwd !== undefined && !isPathInside(cwd, daemonCwd)) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_DAEMON_CWD must resolve inside the current workspace");
    }
    if (!isPathInside(cwd, pidFile)) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_DAEMON_PID_FILE must resolve inside the current workspace");
    }
    if (!isPathInside(cwd, logFile)) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_DAEMON_LOG_FILE must resolve inside the current workspace");
    }
    if (readyUrl !== undefined && !isLoopbackHttpUrl(readyUrl)) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_DAEMON_READY_URL must be an HTTP(S) loopback URL");
    }
  }

  const config: LocalProviderDaemonConfig = {
    enabled: daemonEnabled,
    provider,
    baseUrl,
    command,
    args: args.value ?? [],
    daemonCwd,
    readyUrl,
    readyTimeoutMs: readyTimeoutMs.value ?? DEFAULT_LOCAL_DAEMON_READY_TIMEOUT_MS,
    pidFile,
    logFile,
    envAllowlist: envAllowlist.value
  };
  return {
    cwd,
    config,
    commandHash: localDaemonCommandHash(config),
    errors
  };
}

function localProviderDaemonReport(
  context: LocalProviderDaemonContext,
  action: string,
  override?: {
    status: ProviderDiagnosticStatus;
    message: string;
    marker?: LocalProviderDaemonMarker;
    markerLive?: boolean;
  }
): ProviderDiagnosticReport {
  const markerPresent = override?.marker !== undefined || fs.existsSync(context.config.pidFile);
  const status: ProviderDiagnosticStatus = override?.status ??
    (context.errors.length > 0 ? "error" : "ok");
  const message = override?.message ??
    (context.errors.length > 0
      ? context.errors.join("; ")
      : context.config.enabled
        ? "local daemon config is valid"
        : "local daemon lifecycle disabled");
  return {
    ok: status !== "error",
    checks: [
      {
        name: "local_provider_daemon",
        status,
        message,
        details: compactDetails({
          action,
          enabled: context.config.enabled,
          provider: context.config.provider,
          base_url: context.config.baseUrl,
          command_configured: context.config.command !== undefined,
          command_basename: context.config.command ? path.basename(context.config.command) : undefined,
          args_count: context.config.args.length,
          daemon_cwd: context.config.daemonCwd ? displayPath(context.cwd, context.config.daemonCwd) : undefined,
          pid_file: displayPath(context.cwd, context.config.pidFile),
          log_file: displayPath(context.cwd, context.config.logFile),
          marker_present: markerPresent,
          marker_pid: override?.marker?.pid,
          marker_live: override?.markerLive,
          ready_url: context.config.readyUrl,
          ready_timeout_ms: context.config.readyTimeoutMs,
          env_allowlist_count: context.config.envAllowlist?.length
        })
      }
    ]
  };
}

function parseLocalProviderModelsContext(
  options: LocalProviderModelsOptions
): LocalProviderModelsContext {
  const environ = options.environ ?? process.env;
  const provider = optionalEnv(environ, "GOD_CODE_PROVIDER") ?? "fake";
  const model = optionalEnv(environ, "GOD_CODE_MODEL");
  const configuredBaseUrl = optionalEnv(environ, "GOD_CODE_BASE_URL");
  const baseUrl = provider === "local-openai-compatible"
    ? effectiveBaseUrl(provider, configuredBaseUrl)
    : configuredBaseUrl;
  const explicitModelsUrl = optionalEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODELS_URL");
  const modelsUrl = explicitModelsUrl ?? deriveLocalModelsUrl(baseUrl);
  const localModelsTimeout = optionalEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODELS_TIMEOUT_S");
  const providerTimeout = optionalEnv(environ, "GOD_CODE_PROVIDER_TIMEOUT_S");
  const timeout = parseProviderTimeout(localModelsTimeout ?? providerTimeout);
  const maxResults = parseBoundedPositiveIntegerEnv(
    environ,
    "GOD_CODE_LOCAL_PROVIDER_MODELS_MAX_RESULTS",
    MAX_LOCAL_MODELS_MAX_RESULTS
  );
  const apiKeyEnv = optionalEnv(environ, "GOD_CODE_API_KEY_ENV");
  const apiKey = apiKeyEnv ? optionalEnv(environ, apiKeyEnv) : undefined;
  const errors: string[] = [];

  if (provider !== "local-openai-compatible") {
    errors.push("local model discovery requires GOD_CODE_PROVIDER=local-openai-compatible");
  }
  if (modelsUrl === undefined) {
    errors.push("unable to derive GOD_CODE_LOCAL_PROVIDER_MODELS_URL from GOD_CODE_BASE_URL");
  } else if (!isLoopbackHttpUrl(modelsUrl)) {
    errors.push("GOD_CODE_LOCAL_PROVIDER_MODELS_URL must be an HTTP(S) loopback URL");
  }
  if ((localModelsTimeout ?? providerTimeout) !== undefined && timeout === undefined) {
    errors.push(
      localModelsTimeout !== undefined
        ? "GOD_CODE_LOCAL_PROVIDER_MODELS_TIMEOUT_S must be a positive number"
        : "GOD_CODE_PROVIDER_TIMEOUT_S must be a positive number"
    );
  }
  if (maxResults.error !== undefined) {
    errors.push(maxResults.error);
  }
  if (apiKeyEnv !== undefined && apiKey === undefined) {
    errors.push(`missing provider API key environment variable: ${apiKeyEnv}`);
  }

  return {
    config: {
      provider,
      model,
      baseUrl,
      modelsUrl,
      timeoutS: timeout ?? 30,
      maxResults: maxResults.value ?? DEFAULT_LOCAL_MODELS_MAX_RESULTS,
      apiKeyEnv,
      apiKeyPresent: apiKey !== undefined,
      apiKey
    },
    errors
  };
}

function localProviderModelsReport(
  context: LocalProviderModelsContext,
  result: {
    status: ProviderDiagnosticStatus;
    message: string;
    models?: LocalProviderModelInfo[];
    truncated?: boolean;
    configuredModelPresent?: boolean;
    httpStatus?: number;
    responseBytes?: number;
  }
): ProviderDiagnosticReport {
  return {
    ok: result.status !== "error",
    checks: [
      {
        name: "local_provider_models",
        status: result.status,
        message: result.message,
        details: compactDetails({
          provider: context.config.provider,
          base_url: context.config.baseUrl,
          models_url: context.config.modelsUrl,
          configured_model: context.config.model,
          configured_model_present: result.configuredModelPresent,
          model_count: result.models?.length,
          truncated: result.truncated,
          timeout_s: context.config.timeoutS,
          max_results: context.config.maxResults,
          api_key_env: context.config.apiKeyEnv,
          api_key_present: context.config.apiKeyPresent,
          http_status: result.httpStatus,
          response_bytes: result.responseBytes,
          models: result.models
        })
      }
    ]
  };
}

function deriveLocalModelsUrl(baseUrl: string | undefined): string | undefined {
  if (baseUrl === undefined) {
    return undefined;
  }
  try {
    const parsed = new URL(baseUrl);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    parsed.pathname = `${normalizedPath}/models`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function localProviderModelsHttpErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return `local provider models request failed with HTTP ${status}: authentication failed`;
  }
  if (status === 404) {
    return "local provider did not expose an OpenAI-compatible /models endpoint";
  }
  if (status >= 300 && status < 400) {
    return `local provider models request returned redirect HTTP ${status}`;
  }
  return `local provider models request failed with HTTP ${status}`;
}

function parseLocalProviderModelsResponse(
  body: string,
  maxResults: number
): { models: LocalProviderModelInfo[]; modelIds: string[]; truncated: boolean; error?: string } {
  let decoded: unknown;
  try {
    decoded = JSON.parse(body) as unknown;
  } catch {
    return {
      models: [],
      modelIds: [],
      truncated: false,
      error: "local provider models response was not valid JSON"
    };
  }

  if (!isRecord(decoded) || !Array.isArray(decoded.data)) {
    return {
      models: [],
      modelIds: [],
      truncated: false,
      error: "local provider models response must be an object with data[]"
    };
  }

  const models: LocalProviderModelInfo[] = [];
  const modelIds: string[] = [];
  const seen = new Set<string>();
  let validCount = 0;
  for (const item of decoded.data) {
    if (!isRecord(item) || typeof item.id !== "string" || item.id.trim().length === 0) {
      return {
        models: [],
        modelIds: [],
        truncated: false,
        error: "local provider models response data entries must include non-empty string id"
      };
    }
    const id = item.id.trim();
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    modelIds.push(id);
    validCount += 1;
    if (models.length >= maxResults) {
      continue;
    }
    models.push(
      compactDetails({
        id: sanitizeDiagnosticString(id, 512),
        object: typeof item.object === "string" ? sanitizeDiagnosticString(item.object, 80) : undefined,
        created: typeof item.created === "number" && Number.isFinite(item.created)
          ? item.created
          : undefined,
        owned_by: typeof item.owned_by === "string"
          ? sanitizeDiagnosticString(item.owned_by, 120)
          : undefined
      }) as unknown as LocalProviderModelInfo
    );
  }

  return {
    models,
    modelIds,
    truncated: validCount > models.length
  };
}

function parseLocalProviderModelPullContext(
  model: string,
  options: LocalProviderModelPullOptions
): LocalProviderModelPullContext {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const environ = options.environ ?? process.env;
  const provider = optionalEnv(environ, "GOD_CODE_PROVIDER") ?? "fake";
  const enabled = parseBooleanEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED");
  const pullEnabled = enabled.value ?? false;
  const command = optionalEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND");
  const argsTemplate = pullEnabled
    ? parseStringArrayJsonEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE")
    : {};
  const pullCwd = optionalPathEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_CWD", cwd);
  const timeout = parseBoundedPositiveIntegerEnv(
    environ,
    "GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_TIMEOUT_MS",
    MAX_LOCAL_MODEL_PULL_TIMEOUT_MS
  );
  const logFile = optionalPathEnv(
    environ,
    "GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_LOG_FILE",
    cwd,
    ".god-code/local-provider-model-pull.log"
  ) ?? path.resolve(cwd, ".god-code/local-provider-model-pull.log");
  const envAllowlist = pullEnabled
    ? parseStringListEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENV_ALLOWLIST")
    : {};
  const modelValidationError = validateLocalModelPullName(model);
  const errors = [enabled.error, argsTemplate.error, timeout.error, envAllowlist.error].filter(
    (error): error is string => error !== undefined
  );

  if (provider !== "local-openai-compatible") {
    errors.push("local model pull requires GOD_CODE_PROVIDER=local-openai-compatible");
  }
  if (modelValidationError !== undefined) {
    errors.push(modelValidationError);
  }

  const template = argsTemplate.value ?? [];
  if (pullEnabled) {
    if (command === undefined) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND is required when local model pull is enabled");
    }
    if (argsTemplate.value === undefined && argsTemplate.error === undefined) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE is required when local model pull is enabled");
    } else if (template.length > 0 && !template.some((value) => value.includes("{model}"))) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE must include {model}");
    }
    if (pullCwd !== undefined && !isPathInside(cwd, pullCwd)) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_CWD must resolve inside the current workspace");
    }
    if (!isPathInside(cwd, logFile)) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_LOG_FILE must resolve inside the current workspace");
    }
  }

  return {
    cwd,
    config: {
      enabled: pullEnabled,
      provider,
      model: sanitizeDiagnosticString(model.trim(), MAX_LOCAL_MODEL_NAME_LENGTH),
      command,
      argsTemplate: template,
      args: template.map((value) => value.replaceAll("{model}", model.trim())),
      pullCwd,
      timeoutMs: timeout.value ?? DEFAULT_LOCAL_MODEL_PULL_TIMEOUT_MS,
      logFile,
      envAllowlist: envAllowlist.value
    },
    errors
  };
}

function localProviderModelPullReport(
  context: LocalProviderModelPullContext,
  result: {
    status: ProviderDiagnosticStatus;
    message: string;
    exitCode?: number;
    signal?: string;
    durationMs?: number;
    timedOut?: boolean;
  }
): ProviderDiagnosticReport {
  return {
    ok: result.status !== "error",
    checks: [
      {
        name: "local_provider_model_pull",
        status: result.status,
        message: result.message,
        details: compactDetails({
          enabled: context.config.enabled,
          provider: context.config.provider,
          model: context.config.model,
          command_configured: context.config.command !== undefined,
          command_basename: context.config.command ? path.basename(context.config.command) : undefined,
          args_count: context.config.args.length,
          pull_cwd: context.config.pullCwd ? displayPath(context.cwd, context.config.pullCwd) : undefined,
          log_file: displayPath(context.cwd, context.config.logFile),
          timeout_ms: context.config.timeoutMs,
          env_allowlist_count: context.config.envAllowlist?.length,
          exit_code: result.exitCode,
          signal: result.signal,
          duration_ms: result.durationMs,
          timed_out: result.timedOut
        })
      }
    ]
  };
}

function waitForLocalModelPullProcess(
  context: LocalProviderModelPullContext,
  child: ChildProcess,
  logFd: number,
  startedAt: number
): Promise<ProviderDiagnosticReport> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const finish = (
      status: ProviderDiagnosticStatus,
      message: string,
      exitCode?: number,
      signal?: NodeJS.Signals | null
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutTimer);
      if (forceKillTimer !== undefined) {
        clearTimeout(forceKillTimer);
      }
      resolve(
        finalizeLocalProviderLogReport(
          localProviderModelPullReport(context, {
            status,
            message,
            exitCode,
            signal: signal ?? undefined,
            durationMs: Date.now() - startedAt,
            timedOut
          }),
          logFd
        )
      );
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 2_000);
    }, context.config.timeoutMs);

    child.on("error", (error) => {
      finish(
        "error",
        sanitizeDiagnosticString(`local provider model pull failed to start: ${error.message}`, 240)
      );
    });
    child.on("close", (code, signal) => {
      if (timedOut) {
        finish(
          "error",
          `local provider model pull timed out after ${context.config.timeoutMs}ms`,
          code ?? undefined,
          signal
        );
        return;
      }
      if (code === 0) {
        finish("ok", "local provider model pull completed", code, signal);
        return;
      }
      finish(
        "error",
        `local provider model pull failed with exit code ${code ?? "unknown"}`,
        code ?? undefined,
        signal
      );
    });
  });
}

function validateLocalModelPullName(model: string): string | undefined {
  const trimmed = model.trim();
  if (trimmed.length === 0) {
    return "local provider model pull requires a non-empty model name";
  }
  if (trimmed.length > MAX_LOCAL_MODEL_NAME_LENGTH) {
    return `local provider model name must be at most ${MAX_LOCAL_MODEL_NAME_LENGTH} characters`;
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return "local provider model name must not contain control characters";
  }
  return undefined;
}

function parseLocalProviderModelRemoveContext(
  model: string,
  options: LocalProviderModelRemoveOptions
): LocalProviderModelRemoveContext {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const environ = options.environ ?? process.env;
  const provider = optionalEnv(environ, "GOD_CODE_PROVIDER") ?? "fake";
  const enabled = parseBooleanEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED");
  const removeEnabled = enabled.value ?? false;
  const command = optionalEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND");
  const argsTemplate = removeEnabled
    ? parseStringArrayJsonEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE")
    : {};
  const removeCwd = optionalPathEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_CWD", cwd);
  const timeout = parseBoundedPositiveIntegerEnv(
    environ,
    "GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_TIMEOUT_MS",
    MAX_LOCAL_MODEL_REMOVE_TIMEOUT_MS
  );
  const logFile = optionalPathEnv(
    environ,
    "GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_LOG_FILE",
    cwd,
    ".god-code/local-provider-model-remove.log"
  ) ?? path.resolve(cwd, ".god-code/local-provider-model-remove.log");
  const envAllowlist = removeEnabled
    ? parseStringListEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENV_ALLOWLIST")
    : {};
  const modelValidationError = validateLocalModelRemoveName(model);
  const errors = [enabled.error, argsTemplate.error, timeout.error, envAllowlist.error].filter(
    (error): error is string => error !== undefined
  );

  if (provider !== "local-openai-compatible") {
    errors.push("local model remove requires GOD_CODE_PROVIDER=local-openai-compatible");
  }
  if (modelValidationError !== undefined) {
    errors.push(modelValidationError);
  }

  const template = argsTemplate.value ?? [];
  if (removeEnabled) {
    if (command === undefined) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND is required when local model remove is enabled");
    }
    if (argsTemplate.value === undefined && argsTemplate.error === undefined) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE is required when local model remove is enabled");
    } else if (template.length > 0 && !template.some((value) => value.includes("{model}"))) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE must include {model}");
    }
    if (removeCwd !== undefined && !isPathInside(cwd, removeCwd)) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_CWD must resolve inside the current workspace");
    }
    if (!isPathInside(cwd, logFile)) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_LOG_FILE must resolve inside the current workspace");
    }
  }

  return {
    cwd,
    config: {
      enabled: removeEnabled,
      provider,
      model: sanitizeDiagnosticString(model.trim(), MAX_LOCAL_MODEL_NAME_LENGTH),
      command,
      argsTemplate: template,
      args: template.map((value) => value.replaceAll("{model}", model.trim())),
      removeCwd,
      timeoutMs: timeout.value ?? DEFAULT_LOCAL_MODEL_REMOVE_TIMEOUT_MS,
      logFile,
      envAllowlist: envAllowlist.value
    },
    errors
  };
}

function localProviderModelRemoveReport(
  context: LocalProviderModelRemoveContext,
  result: {
    status: ProviderDiagnosticStatus;
    message: string;
    exitCode?: number;
    signal?: string;
    durationMs?: number;
    timedOut?: boolean;
  }
): ProviderDiagnosticReport {
  return {
    ok: result.status !== "error",
    checks: [
      {
        name: "local_provider_model_remove",
        status: result.status,
        message: result.message,
        details: compactDetails({
          enabled: context.config.enabled,
          provider: context.config.provider,
          model: context.config.model,
          command_configured: context.config.command !== undefined,
          command_basename: context.config.command ? path.basename(context.config.command) : undefined,
          args_count: context.config.args.length,
          remove_cwd: context.config.removeCwd ? displayPath(context.cwd, context.config.removeCwd) : undefined,
          log_file: displayPath(context.cwd, context.config.logFile),
          timeout_ms: context.config.timeoutMs,
          env_allowlist_count: context.config.envAllowlist?.length,
          exit_code: result.exitCode,
          signal: result.signal,
          duration_ms: result.durationMs,
          timed_out: result.timedOut
        })
      }
    ]
  };
}

function waitForLocalModelRemoveProcess(
  context: LocalProviderModelRemoveContext,
  child: ChildProcess,
  logFd: number,
  startedAt: number
): Promise<ProviderDiagnosticReport> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const finish = (
      status: ProviderDiagnosticStatus,
      message: string,
      exitCode?: number,
      signal?: NodeJS.Signals | null
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutTimer);
      if (forceKillTimer !== undefined) {
        clearTimeout(forceKillTimer);
      }
      resolve(
        finalizeLocalProviderLogReport(
          localProviderModelRemoveReport(context, {
            status,
            message,
            exitCode,
            signal: signal ?? undefined,
            durationMs: Date.now() - startedAt,
            timedOut
          }),
          logFd
        )
      );
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 2_000);
    }, context.config.timeoutMs);

    child.on("error", (error) => {
      finish(
        "error",
        sanitizeDiagnosticString(`local provider model remove failed to start: ${error.message}`, 240)
      );
    });
    child.on("close", (code, signal) => {
      if (timedOut) {
        finish(
          "error",
          `local provider model remove timed out after ${context.config.timeoutMs}ms`,
          code ?? undefined,
          signal
        );
        return;
      }
      if (code === 0) {
        finish("ok", "local provider model remove completed", code, signal);
        return;
      }
      finish(
        "error",
        `local provider model remove failed with exit code ${code ?? "unknown"}`,
        code ?? undefined,
        signal
      );
    });
  });
}

function validateLocalModelRemoveName(model: string): string | undefined {
  const trimmed = model.trim();
  if (trimmed.length === 0) {
    return "local provider model remove requires a non-empty model name";
  }
  if (trimmed.length > MAX_LOCAL_MODEL_NAME_LENGTH) {
    return `local provider model name must be at most ${MAX_LOCAL_MODEL_NAME_LENGTH} characters`;
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return "local provider model name must not contain control characters";
  }
  return undefined;
}

function parseLocalProviderModelPruneContext(
  target: string,
  options: LocalProviderModelPruneOptions
): LocalProviderModelPruneContext {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const environ = options.environ ?? process.env;
  const provider = optionalEnv(environ, "GOD_CODE_PROVIDER") ?? "fake";
  const enabled = parseBooleanEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED");
  const pruneEnabled = enabled.value ?? false;
  const command = optionalEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND");
  const argsTemplate = pruneEnabled
    ? parseStringArrayJsonEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE")
    : {};
  const pruneCwd = optionalPathEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_CWD", cwd);
  const timeout = parseBoundedPositiveIntegerEnv(
    environ,
    "GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_TIMEOUT_MS",
    MAX_LOCAL_MODEL_PRUNE_TIMEOUT_MS
  );
  const logFile = optionalPathEnv(
    environ,
    "GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_LOG_FILE",
    cwd,
    ".god-code/local-provider-model-prune.log"
  ) ?? path.resolve(cwd, ".god-code/local-provider-model-prune.log");
  const envAllowlist = pruneEnabled
    ? parseStringListEnv(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENV_ALLOWLIST")
    : {};
  const allowedTargets = pruneEnabled
    ? parseLocalModelPruneAllowedTargets(environ, "GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS")
    : {};
  const targetValidationError = validateLocalModelPruneTarget(target);
  const normalizedTarget = target.trim();
  const targetAllowed = allowedTargets.value?.includes(normalizedTarget) ?? false;
  const errors = [
    enabled.error,
    argsTemplate.error,
    timeout.error,
    envAllowlist.error,
    allowedTargets.error
  ].filter((error): error is string => error !== undefined);

  if (provider !== "local-openai-compatible") {
    errors.push("local model prune requires GOD_CODE_PROVIDER=local-openai-compatible");
  }
  if (targetValidationError !== undefined) {
    errors.push(targetValidationError);
  }

  const template = argsTemplate.value ?? [];
  if (pruneEnabled) {
    if (command === undefined) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND is required when local model prune is enabled");
    }
    if (argsTemplate.value === undefined && argsTemplate.error === undefined) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE is required when local model prune is enabled");
    } else if (template.length > 0 && !template.some((value) => value.includes("{target}"))) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE must include {target}");
    }
    if (pruneCwd !== undefined && !isPathInside(cwd, pruneCwd)) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_CWD must resolve inside the current workspace");
    }
    if (!isPathInside(cwd, logFile)) {
      errors.push("GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_LOG_FILE must resolve inside the current workspace");
    }
  }

  return {
    cwd,
    config: {
      enabled: pruneEnabled,
      provider,
      target: sanitizeDiagnosticString(normalizedTarget, MAX_LOCAL_MODEL_PRUNE_TARGET_LENGTH),
      targetAllowed,
      allowedTargets: allowedTargets.value,
      command,
      argsTemplate: template,
      args: template.map((value) => value.replaceAll("{target}", normalizedTarget)),
      pruneCwd,
      timeoutMs: timeout.value ?? DEFAULT_LOCAL_MODEL_PRUNE_TIMEOUT_MS,
      logFile,
      envAllowlist: envAllowlist.value
    },
    errors
  };
}

function localProviderModelPruneReport(
  context: LocalProviderModelPruneContext,
  result: {
    status: ProviderDiagnosticStatus;
    message: string;
    exitCode?: number;
    signal?: string;
    durationMs?: number;
    timedOut?: boolean;
  }
): ProviderDiagnosticReport {
  return {
    ok: result.status !== "error",
    checks: [
      {
        name: "local_provider_model_prune",
        status: result.status,
        message: result.message,
        details: compactDetails({
          enabled: context.config.enabled,
          provider: context.config.provider,
          target: context.config.target,
          target_allowed: context.config.targetAllowed,
          allowed_target_count: context.config.allowedTargets?.length,
          command_configured: context.config.command !== undefined,
          command_basename: context.config.command ? path.basename(context.config.command) : undefined,
          args_count: context.config.args.length,
          prune_cwd: context.config.pruneCwd ? displayPath(context.cwd, context.config.pruneCwd) : undefined,
          log_file: displayPath(context.cwd, context.config.logFile),
          timeout_ms: context.config.timeoutMs,
          env_allowlist_count: context.config.envAllowlist?.length,
          exit_code: result.exitCode,
          signal: result.signal,
          duration_ms: result.durationMs,
          timed_out: result.timedOut
        })
      }
    ]
  };
}

function waitForLocalModelPruneProcess(
  context: LocalProviderModelPruneContext,
  child: ChildProcess,
  logFd: number,
  startedAt: number
): Promise<ProviderDiagnosticReport> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const finish = (
      status: ProviderDiagnosticStatus,
      message: string,
      exitCode?: number,
      signal?: NodeJS.Signals | null
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutTimer);
      if (forceKillTimer !== undefined) {
        clearTimeout(forceKillTimer);
      }
      resolve(
        finalizeLocalProviderLogReport(
          localProviderModelPruneReport(context, {
            status,
            message,
            exitCode,
            signal: signal ?? undefined,
            durationMs: Date.now() - startedAt,
            timedOut
          }),
          logFd
        )
      );
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 2_000);
    }, context.config.timeoutMs);

    child.on("error", (error) => {
      finish(
        "error",
        sanitizeDiagnosticString(`local provider model prune failed to start: ${error.message}`, 240)
      );
    });
    child.on("close", (code, signal) => {
      if (timedOut) {
        finish(
          "error",
          `local provider model prune timed out after ${context.config.timeoutMs}ms`,
          code ?? undefined,
          signal
        );
        return;
      }
      if (code === 0) {
        finish("ok", "local provider model prune completed", code, signal);
        return;
      }
      finish(
        "error",
        `local provider model prune failed with exit code ${code ?? "unknown"}`,
        code ?? undefined,
        signal
      );
    });
  });
}

function finalizeLocalProviderLogReport(
  operationReport: ProviderDiagnosticReport,
  logFd: number
): ProviderDiagnosticReport {
  const cleanupSucceeded = invokeLocalProviderLogDescriptorFinalizer(logFd);
  if (cleanupSucceeded || !operationReport.ok) {
    return operationReport;
  }

  const ownerCheck = operationReport.checks[0];
  if (ownerCheck === undefined) {
    return operationReport;
  }
  return {
    ok: false,
    checks: [
      {
        ...ownerCheck,
        status: "error",
        message: LOCAL_PROVIDER_LOG_CLEANUP_FAILURE_MESSAGE
      },
      ...operationReport.checks.slice(1)
    ]
  };
}

function invokeLocalProviderLogDescriptorFinalizer(logFd: number): boolean {
  try {
    fs.closeSync(logFd);
    return true;
  } catch {
    return false;
  }
}

function validateLocalModelPruneTarget(target: string): string | undefined {
  const trimmed = target.trim();
  if (trimmed.length === 0) {
    return "local provider model prune requires a non-empty target";
  }
  if (trimmed.length > MAX_LOCAL_MODEL_PRUNE_TARGET_LENGTH) {
    return `local provider model prune target must be at most ${MAX_LOCAL_MODEL_PRUNE_TARGET_LENGTH} characters`;
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return "local provider model prune target must not contain control characters";
  }
  if (trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\")) {
    return "local provider model prune target must not be a path";
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) {
    return "local provider model prune target must use letters, numbers, dot, underscore, or dash";
  }
  return undefined;
}

function parseLocalModelPruneAllowedTargets(
  environ: Record<string, string | undefined>,
  key: string
): { value?: string[]; error?: string } {
  const raw = optionalEnv(environ, key);
  if (raw === undefined) {
    return {};
  }
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const validationError = validateLocalModelPruneTarget(value);
    if (validationError !== undefined) {
      return { error: `${key} contains an invalid target` };
    }
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }
  return { value: unique };
}

function parseStringArrayJsonEnv(
  environ: Record<string, string | undefined>,
  key: string
): { value?: string[]; error?: string } {
  const raw = optionalEnv(environ, key);
  if (raw === undefined) {
    return {};
  }
  try {
    const decoded = JSON.parse(raw) as unknown;
    if (!Array.isArray(decoded) || decoded.some((value) => typeof value !== "string")) {
      return { error: `${key} must be a JSON array of strings` };
    }
    return { value: decoded };
  } catch {
    return { error: `${key} must be a JSON array of strings` };
  }
}

function parseStringListEnv(
  environ: Record<string, string | undefined>,
  key: string
): { value?: string[]; error?: string } {
  const raw = optionalEnv(environ, key);
  if (raw === undefined) {
    return {};
  }
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
  if (values.some((value) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))) {
    return { error: `${key} must be a comma-separated list of environment variable names` };
  }
  return { value: values };
}

function optionalPathEnv(
  environ: Record<string, string | undefined>,
  key: string,
  cwd: string,
  defaultRelativePath?: string
): string | undefined {
  const raw = optionalEnv(environ, key) ?? defaultRelativePath;
  return raw === undefined ? undefined : path.resolve(cwd, raw);
}

function deriveLocalReadyUrl(baseUrl: string | undefined): string | undefined {
  if (baseUrl === undefined) {
    return undefined;
  }
  try {
    const parsed = new URL(baseUrl);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    parsed.pathname = `${normalizedPath}/models`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function isLoopbackHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function displayPath(root: string, target: string): string {
  const relative = path.relative(root, target);
  return relative === "" || relative.startsWith("..") || path.isAbsolute(relative)
    ? target
    : relative;
}

function localDaemonCommandHash(config: LocalProviderDaemonConfig): string {
  const payload = JSON.stringify({
    command: config.command,
    args: config.args,
    cwd: config.daemonCwd,
    base_url: config.baseUrl
  });
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

async function readLocalDaemonMarker(filePath: string): Promise<LocalProviderDaemonMarker | undefined> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const decoded = JSON.parse(raw) as unknown;
    if (!isRecord(decoded)) {
      return undefined;
    }
    if (
      decoded.schema_version !== 1 ||
      decoded.provider !== "local-openai-compatible" ||
      typeof decoded.pid !== "number" ||
      !Number.isInteger(decoded.pid) ||
      decoded.pid <= 0 ||
      typeof decoded.command_hash !== "string" ||
      typeof decoded.started_at !== "string"
    ) {
      return undefined;
    }
    return {
      schema_version: 1,
      provider: "local-openai-compatible",
      pid: decoded.pid,
      command_hash: decoded.command_hash,
      base_url: typeof decoded.base_url === "string" ? decoded.base_url : undefined,
      started_at: decoded.started_at
    };
  } catch {
    return undefined;
  }
}

function isPidLive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function buildLocalDaemonEnv(allowlist: string[] | undefined): NodeJS.ProcessEnv {
  return buildLocalProcessEnv(allowlist);
}

function buildLocalProcessEnv(allowlist: string[] | undefined): NodeJS.ProcessEnv {
  if (allowlist === undefined) {
    return { ...process.env };
  }
  const env: NodeJS.ProcessEnv = {};
  for (const key of allowlist) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  if (process.env.PATH !== undefined && env.PATH === undefined) {
    env.PATH = process.env.PATH;
  }
  return env;
}

function parseProviderFallbacks(
  environ: Record<string, string | undefined>,
  primary: {
    provider: string;
    model: string | undefined;
    configuredBaseUrl: string | undefined;
  }
): { details: Record<string, unknown>[]; errors: string[] } {
  const raw = optionalEnv(environ, "GOD_CODE_PROVIDER_FALLBACKS");
  if (raw === undefined) {
    return { details: [], errors: [] };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw) as unknown;
  } catch {
    return {
      details: [],
      errors: ["GOD_CODE_PROVIDER_FALLBACKS must be valid JSON"]
    };
  }

  if (!Array.isArray(decoded)) {
    return {
      details: [],
      errors: ["GOD_CODE_PROVIDER_FALLBACKS must be a JSON array"]
    };
  }

  const details: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  if (primary.model !== undefined) {
    seen.add(providerIdentity(primary.provider, primary.model, primary.configuredBaseUrl));
  }

  for (const [index, value] of decoded.entries()) {
    if (!isRecord(value)) {
      errors.push(`GOD_CODE_PROVIDER_FALLBACKS entry at index ${index} must be an object`);
      continue;
    }

    const provider = readRequiredFallbackString(value, "provider", index, errors);
    const model = readRequiredFallbackString(value, "model", index, errors);
    const apiKeyEnv = provider
      ? readFallbackApiKeyEnv(value, provider, index, errors)
      : readRequiredFallbackString(value, "api_key_env", index, errors);
    const configuredBaseUrl = readOptionalFallbackString(value, "base_url", index, errors);
    const timeoutS = parseFallbackTimeout(value, index, errors);
    const retry = parseFallbackRetryPolicy(value, index, errors);
    const apiKeyPresent = apiKeyEnv ? optionalEnv(environ, apiKeyEnv) !== undefined : false;

    if (apiKeyEnv && !apiKeyPresent) {
      errors.push(
        `GOD_CODE_PROVIDER_FALLBACKS entry at index ${index} references unset API key environment variable: ${apiKeyEnv}`
      );
    }
    if (provider && model) {
      const identity = providerIdentity(provider, model, configuredBaseUrl);
      if (seen.has(identity)) {
        errors.push(
          `GOD_CODE_PROVIDER_FALLBACKS entry at index ${index} duplicates a provider/model/base_url entry`
        );
      }
      seen.add(identity);
    }

    details.push(
      compactDetails({
        provider,
        model,
        api_key_env: apiKeyEnv,
        api_key_present: apiKeyEnv ? apiKeyPresent : false,
        api_key_required: provider ? providerApiKeyRequired(provider) : undefined,
        configured_base_url: configuredBaseUrl,
        effective_base_url: provider ? effectiveBaseUrl(provider, configuredBaseUrl) : undefined,
        timeout_s: timeoutS,
        retry: retry.details,
        known_family: provider ? KNOWN_PROVIDER_FAMILIES.has(provider) : undefined
      })
    );
  }

  return { details, errors };
}

function readRequiredFallbackString(
  value: Record<string, unknown>,
  key: string,
  index: number,
  errors: string[]
): string | undefined {
  const field = value[key];
  if (typeof field !== "string" || field.trim().length === 0) {
    errors.push(
      `GOD_CODE_PROVIDER_FALLBACKS entry at index ${index} requires non-empty string field: ${key}`
    );
    return undefined;
  }
  return field.trim();
}

function providerApiKeyRequired(provider: string): boolean {
  return provider !== "local-openai-compatible";
}

function readFallbackApiKeyEnv(
  value: Record<string, unknown>,
  provider: string,
  index: number,
  errors: string[]
): string | undefined {
  if (providerApiKeyRequired(provider)) {
    return readRequiredFallbackString(value, "api_key_env", index, errors);
  }
  return readOptionalFallbackString(value, "api_key_env", index, errors);
}

function readOptionalFallbackString(
  value: Record<string, unknown>,
  key: string,
  index: number,
  errors: string[]
): string | undefined {
  const field = value[key];
  if (field === undefined) {
    return undefined;
  }
  if (typeof field !== "string") {
    errors.push(`GOD_CODE_PROVIDER_FALLBACKS entry at index ${index} field ${key} must be a string`);
    return undefined;
  }
  const trimmed = field.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseFallbackTimeout(
  value: Record<string, unknown>,
  index: number,
  errors: string[]
): number | undefined {
  const field = value.timeout_s;
  if (field === undefined) {
    return 30;
  }
  if (typeof field !== "number" || !Number.isFinite(field) || field <= 0) {
    errors.push(
      `GOD_CODE_PROVIDER_FALLBACKS entry at index ${index} field timeout_s must be a positive number`
    );
    return undefined;
  }
  return field;
}

function parseFallbackRetryPolicy(
  value: Record<string, unknown>,
  index: number,
  errors: string[]
): { details: Record<string, number> } {
  const maxRetries = parseNonNegativeIntegerField(value, "max_retries", index);
  const baseDelayMs = parseNonNegativeIntegerField(value, "retry_base_delay_ms", index);
  const maxDelayMs = parseNonNegativeIntegerField(value, "retry_max_delay_ms", index);

  for (const parsed of [maxRetries, baseDelayMs, maxDelayMs]) {
    if (parsed.error) {
      errors.push(parsed.error);
    }
  }

  const details = {
    max_retries: maxRetries.value ?? DEFAULT_PROVIDER_RETRY_POLICY.max_retries,
    base_delay_ms: baseDelayMs.value ?? DEFAULT_PROVIDER_RETRY_POLICY.base_delay_ms,
    max_delay_ms: maxDelayMs.value ?? DEFAULT_PROVIDER_RETRY_POLICY.max_delay_ms
  };
  if (details.max_delay_ms < details.base_delay_ms) {
    errors.push(
      `GOD_CODE_PROVIDER_FALLBACKS entry at index ${index} field retry_max_delay_ms must be greater than or equal to retry_base_delay_ms`
    );
  }
  return { details };
}

function parseNonNegativeIntegerField(
  value: Record<string, unknown>,
  key: string,
  index: number
): { value?: number; error?: string } {
  const field = value[key];
  if (field === undefined) {
    return {};
  }
  if (typeof field !== "number" || !Number.isInteger(field) || field < 0) {
    return {
      error: `GOD_CODE_PROVIDER_FALLBACKS entry at index ${index} field ${key} must be a non-negative integer`
    };
  }
  return { value: field };
}

function parseNonNegativeIntegerEnv(
  environ: Record<string, string | undefined>,
  key: string
): { value?: number; error?: string } {
  const raw = optionalEnv(environ, key);
  if (raw === undefined) {
    return {};
  }
  if (!/^\d+$/.test(raw)) {
    return { error: `${key} must be a non-negative integer` };
  }
  return { value: Number(raw) };
}

function parsePositiveIntegerEnv(
  environ: Record<string, string | undefined>,
  key: string
): { value?: number; error?: string } {
  const raw = optionalEnv(environ, key);
  if (raw === undefined) {
    return {};
  }
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    return { error: `${key} must be a positive integer` };
  }
  return { value: Number(raw) };
}

function parseBoundedPositiveIntegerEnv(
  environ: Record<string, string | undefined>,
  key: string,
  maxValue: number
): { value?: number; error?: string } {
  const parsed = parsePositiveIntegerEnv(environ, key);
  if (parsed.error !== undefined || parsed.value === undefined) {
    return parsed;
  }
  if (parsed.value > maxValue) {
    return { error: `${key} must be less than or equal to ${maxValue}` };
  }
  return parsed;
}

function parseBooleanEnv(
  environ: Record<string, string | undefined>,
  key: string
): { value?: boolean; error?: string } {
  const raw = optionalEnv(environ, key);
  if (raw === undefined) {
    return {};
  }
  const normalized = raw.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return { value: true };
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return { value: false };
  }
  return { error: `${key} must be a boolean` };
}

function effectiveBaseUrl(provider: string, configuredBaseUrl: string | undefined): string | undefined {
  return configuredBaseUrl ?? DEFAULT_PROVIDER_BASE_URLS.get(provider);
}

function providerIdentity(
  provider: string,
  model: string,
  configuredBaseUrl: string | undefined
): string {
  return `${provider}\u0000${model}\u0000${configuredBaseUrl ?? ""}`;
}

function compactDetails(details: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(details).filter((entry) => entry[1] !== undefined));
}

function sanitizeDiagnosticString(value: string, maxLength: number): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "?");
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}
