import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { relative, resolve } from "node:path";
import type { HostToolContext } from "../host_tools/common.js";
import { isPathInside, toolCancelled, toolError } from "../host_tools/common.js";
import type { HostToolHandler } from "../host_tools/registry.js";
import type { ToolExecutionError, ToolExecutionResult, ToolName } from "../types/godCodeProtocol.js";
import { isRecord } from "../types/godCodeProtocol.js";
import type { PluginManifest, PluginRuntimeSpec } from "./manifest.js";

export interface PluginSandboxRuntimeOptions {
  manifest: PluginManifest;
  rootDir: string;
  toolName: ToolName;
}

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 30000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const STDERR_EXCERPT_BYTES = 4096;

export function createPluginSandboxToolHandler(options: PluginSandboxRuntimeOptions): HostToolHandler {
  if (!options.manifest.runtime) {
    throw new Error(`Plugin does not declare a runtime: ${options.manifest.id}`);
  }
  const entryPath = resolveRuntimeEntry(options.rootDir, options.manifest.runtime);
  return async (input, context) =>
    executePluginSandboxTool({
      manifest: options.manifest,
      rootDir: options.rootDir,
      entryPath,
      toolName: options.toolName,
      input,
      context
    });
}

interface ExecutePluginSandboxToolOptions {
  manifest: PluginManifest;
  rootDir: string;
  entryPath: string;
  toolName: ToolName;
  input: Record<string, unknown>;
  context: HostToolContext;
}

async function executePluginSandboxTool(
  options: ExecutePluginSandboxToolOptions
): Promise<ToolExecutionResult> {
  const runtime = options.manifest.runtime;
  if (!runtime) {
    return toolError("plugin_runtime_missing", `Plugin runtime is not configured: ${options.manifest.id}`, {
      plugin_id: options.manifest.id,
      tool_name: options.toolName
    });
  }

  if (options.context.abortSignal?.aborted) {
    return toolCancelled(`Plugin tool was cancelled before execution: ${options.toolName}`, {
      plugin_id: options.manifest.id,
      tool_name: options.toolName
    });
  }

  const child = spawn(process.execPath, [options.entryPath], {
    cwd: options.rootDir,
    env: pluginRuntimeEnv(runtime),
    stdio: ["pipe", "pipe", "pipe"]
  });

  return await runPluginChild(child, {
    manifest: options.manifest,
    runtime,
    toolName: options.toolName,
    input: options.input,
    cwd: options.context.cwd,
    abortSignal: options.context.abortSignal
  });
}

interface RunPluginChildOptions {
  manifest: PluginManifest;
  runtime: PluginRuntimeSpec;
  toolName: ToolName;
  input: Record<string, unknown>;
  cwd: string;
  abortSignal?: AbortSignal;
}

async function runPluginChild(
  child: ChildProcessWithoutNullStreams,
  options: RunPluginChildOptions
): Promise<ToolExecutionResult> {
  const timeoutMs = Math.min(options.runtime.timeout_ms ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const request = {
    protocol_version: "god-code-plugin-runtime/1",
    plugin_id: options.manifest.id,
    tool_name: options.toolName,
    input: options.input,
    cwd: options.cwd
  };

  return await new Promise<ToolExecutionResult>((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let settled = false;
    let timedOut = false;
    let outputTooLarge = false;

    const finish = (result: ToolExecutionResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      options.abortSignal?.removeEventListener("abort", onAbort);
      resolvePromise(result);
    };

    const killChild = (): void => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
          }
        }, 250).unref();
      }
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      killChild();
    }, timeoutMs);

    const onAbort = (): void => {
      killChild();
    };
    options.abortSignal?.addEventListener("abort", onAbort, { once: true });

    child.once("error", (error) => {
      finish(pluginRuntimeError("plugin_process_failed", error.message, options, { stderr }));
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        outputTooLarge = true;
        killChild();
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = truncateTail(stderr + chunk.toString("utf8"), STDERR_EXCERPT_BYTES);
    });

    child.once("exit", (code, signal) => {
      if (options.abortSignal?.aborted) {
        finish(
          toolCancelled(`Plugin tool was cancelled during execution: ${options.toolName}`, {
            plugin_id: options.manifest.id,
            tool_name: options.toolName,
            signal
          })
        );
        return;
      }
      if (timedOut) {
        finish(pluginRuntimeError("plugin_timeout", `Plugin tool timed out after ${timeoutMs}ms.`, options, { stderr }));
        return;
      }
      if (outputTooLarge) {
        finish(pluginRuntimeError("plugin_output_too_large", "Plugin stdout exceeded output limit.", options, { stderr }));
        return;
      }
      if (code !== 0) {
        finish(
          pluginRuntimeError("plugin_process_failed", `Plugin process exited with code ${code ?? "null"}.`, options, {
            stderr,
            signal
          })
        );
        return;
      }
      finish(parsePluginResponse(stdout, stderr, options));
    });

    child.stdin.end(`${JSON.stringify(request)}\n`, "utf8");
  });
}

function parsePluginResponse(
  stdout: string,
  stderr: string,
  options: RunPluginChildOptions
): ToolExecutionResult {
  let value: unknown;
  try {
    value = JSON.parse(stdout.trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return pluginRuntimeError("plugin_invalid_response", `Plugin returned invalid JSON: ${message}`, options, {
      stderr
    });
  }

  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return pluginRuntimeError("plugin_invalid_response", "Plugin response must be an object with boolean ok.", options, {
      stderr
    });
  }

  if (value.ok) {
    if (value.output !== undefined && !isRecord(value.output)) {
      return pluginRuntimeError("plugin_invalid_response", "Plugin success response output must be an object.", options, {
        stderr
      });
    }
    return {
      ok: true,
      output: value.output ? { ...value.output } : {}
    };
  }

  if (!isRecord(value.error)) {
    return pluginRuntimeError("plugin_invalid_response", "Plugin error response must include error object.", options, {
      stderr
    });
  }
  const code = typeof value.error.code === "string" ? value.error.code : "plugin_error";
  const message = typeof value.error.message === "string" ? value.error.message : "Plugin runtime returned an error.";
  const details = isRecord(value.error.details) ? { ...value.error.details } : undefined;
  const error: ToolExecutionError = { code, message };
  if (details) {
    error.details = details;
  }
  return { ok: false, error };
}

function pluginRuntimeError(
  code: string,
  message: string,
  options: RunPluginChildOptions,
  details: Record<string, unknown> = {}
): ToolExecutionResult {
  return toolError(code, message, {
    plugin_id: options.manifest.id,
    tool_name: options.toolName,
    runtime_kind: options.runtime.kind,
    ...sanitizeRuntimeDetails(details)
  });
}

function resolveRuntimeEntry(rootDir: string, runtime: PluginRuntimeSpec): string {
  const root = resolve(rootDir);
  const entry = resolve(root, runtime.entry);
  if (!isPathInside(root, entry)) {
    throw new Error(`Plugin runtime entry escapes plugin root: ${runtime.entry}`);
  }
  return entry;
}

function pluginRuntimeEnv(runtime: PluginRuntimeSpec): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of runtime.env_keys ?? []) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  return env;
}

function sanitizeRuntimeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (key === "stderr" && typeof value === "string" && value.length > 0) {
      sanitized.stderr = value;
    } else if (key !== "stderr") {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function truncateTail(value: string, maxBytes: number): string {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.length <= maxBytes) {
    return value;
  }
  return buffer.subarray(buffer.length - maxBytes).toString("utf8");
}

export function pluginRuntimeEntryDisplay(rootDir: string, runtime: PluginRuntimeSpec): string {
  return relative(resolve(rootDir), resolveRuntimeEntry(rootDir, runtime)) || runtime.entry;
}
