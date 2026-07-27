import { spawn } from "node:child_process";
import type { ToolExecutionResult } from "../types/godCodeProtocol.js";
import {
  expectOptionalNumber,
  expectOptionalString,
  expectString,
  isPathInside,
  resolveToolPath,
  toolCancelled,
  toolError,
  type HostToolContext
} from "./common.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export async function executeBash(
  input: Record<string, unknown>,
  context: HostToolContext
): Promise<ToolExecutionResult> {
  let command: string;
  let requestedCwd: string | undefined;
  let timeoutMs: number | undefined;

  try {
    command = expectString(input, "command");
    requestedCwd = expectOptionalString(input, "cwd");
    timeoutMs = expectOptionalNumber(input, "timeout_ms");
  } catch (error) {
    return toolError("invalid_input", error instanceof Error ? error.message : String(error));
  }

  const cwd = requestedCwd ? resolveToolPath(context.cwd, requestedCwd) : context.cwd;
  if (!isPathInside(context.cwd, cwd)) {
    return toolError("permission_denied", "Bash cwd is limited to the session cwd.", {
      cwd
    });
  }

  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (context.abortSignal?.aborted) {
    return toolCancelled(`Bash was cancelled before execution: ${command}`, {
      command,
      cwd
    });
  }

  return await new Promise<ToolExecutionResult>((resolve) => {
    const child = spawn("bash", ["-lc", command], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let finished = false;
    let timedOut = false;
    let cancelled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!finished) {
          child.kill("SIGKILL");
        }
      }, 100);
    }, effectiveTimeoutMs);

    const cancelChild = () => {
      if (finished) {
        return;
      }
      cancelled = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!finished) {
          child.kill("SIGKILL");
        }
      }, 100);
    };

    context.abortSignal?.addEventListener("abort", cancelChild, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      context.abortSignal?.removeEventListener("abort", cancelChild);
      resolve(toolError("spawn_failed", error.message, { command, cwd }));
    });

    child.on("close", (code, signal) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      context.abortSignal?.removeEventListener("abort", cancelChild);

      if (cancelled) {
        resolve(
          toolCancelled(`Bash was cancelled: ${command}`, {
            command,
            cwd,
            stdout,
            stderr,
            signal
          })
        );
        return;
      }

      if (timedOut) {
        resolve(
          toolError("command_timed_out", `Command timed out after ${effectiveTimeoutMs}ms.`, {
            command,
            cwd,
            timeout_ms: effectiveTimeoutMs,
            stdout,
            stderr
          })
        );
        return;
      }

      if (code === 0) {
        resolve({
          ok: true,
          output: {
            command,
            cwd,
            stdout,
            stderr,
            exit_code: 0
          }
        });
        return;
      }

      resolve(
        toolError("command_failed", `Command exited with code ${String(code)}.`, {
          command,
          cwd,
          stdout,
          stderr,
          exit_code: code,
          signal
        })
      );
    });
  });
}
