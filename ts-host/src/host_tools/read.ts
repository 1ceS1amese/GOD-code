import { promises as fs } from "node:fs";
import { TextDecoder } from "node:util";
import type { ToolExecutionResult } from "../types/godCodeProtocol.js";
import { expectString, resolveToolPath, toolCancelled, toolError, type HostToolContext } from "./common.js";

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export async function executeRead(
  input: Record<string, unknown>,
  context: HostToolContext
): Promise<ToolExecutionResult> {
  let filePath: string;
  try {
    filePath = expectString(input, "path");
  } catch (error) {
    return toolError("invalid_input", error instanceof Error ? error.message : String(error));
  }

  const resolvedPath = resolveToolPath(context.cwd, filePath);
  if (context.abortSignal?.aborted) {
    return toolCancelled(`Read was cancelled before execution: ${resolvedPath}`, {
      path: resolvedPath
    });
  }

  try {
    const buffer = await fs.readFile(resolvedPath);
    if (buffer.includes(0)) {
      return toolError("non_text_file", "Refusing to read binary content as UTF-8 text.", {
        path: resolvedPath
      });
    }
    const content = utf8Decoder.decode(buffer);
    if (context.abortSignal?.aborted) {
      return toolCancelled(`Read was cancelled after reading: ${resolvedPath}`, {
        path: resolvedPath
      });
    }
    return {
      ok: true,
      output: {
        path: resolvedPath,
        content
      }
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return toolError("file_not_found", `File not found: ${resolvedPath}`, {
        path: resolvedPath
      });
    }
    if (error instanceof TypeError) {
      return toolError("decode_error", `Failed to decode file as UTF-8: ${resolvedPath}`, {
        path: resolvedPath
      });
    }
    return toolError("read_failed", error instanceof Error ? error.message : String(error), {
      path: resolvedPath
    });
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
