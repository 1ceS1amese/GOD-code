import { promises as fs } from "node:fs";
import type { ToolExecutionResult } from "../types/godCodeProtocol.js";
import {
  expectOptionalBoolean,
  expectString,
  expectStringAllowEmpty,
  resolveToolPath,
  toolCancelled,
  toolError,
  type HostToolContext
} from "./common.js";

export async function executeWrite(
  input: Record<string, unknown>,
  context: HostToolContext
): Promise<ToolExecutionResult> {
  let filePath: string;
  let content: string;
  let overwrite: boolean;

  try {
    filePath = expectString(input, "path");
    content = expectStringAllowEmpty(input, "content");
    overwrite = expectOptionalBoolean(input, "overwrite") ?? false;
  } catch (error) {
    return toolError("invalid_input", error instanceof Error ? error.message : String(error));
  }

  const resolvedPath = resolveToolPath(context.cwd, filePath);
  if (context.abortSignal?.aborted) {
    return toolCancelled(`Write was cancelled before execution: ${resolvedPath}`, {
      path: resolvedPath
    });
  }

  try {
    await fs.writeFile(resolvedPath, content, { encoding: "utf8", flag: overwrite ? "w" : "wx" });
    if (context.abortSignal?.aborted) {
      return toolCancelled(`Write was cancelled after writing: ${resolvedPath}`, {
        path: resolvedPath
      });
    }
    return {
      ok: true,
      output: {
        path: resolvedPath,
        bytes: Buffer.byteLength(content, "utf8"),
        overwritten: overwrite
      }
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      return toolError("file_exists", `File already exists: ${resolvedPath}`, {
        path: resolvedPath
      });
    }
    return toolError("write_failed", error instanceof Error ? error.message : String(error), {
      path: resolvedPath
    });
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
