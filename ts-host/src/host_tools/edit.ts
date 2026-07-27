import { promises as fs } from "node:fs";
import { TextDecoder } from "node:util";
import type { ToolExecutionResult } from "../types/godCodeProtocol.js";
import { expectString, resolveToolPath, toolCancelled, toolError, type HostToolContext } from "./common.js";

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export async function executeEdit(
  input: Record<string, unknown>,
  context: HostToolContext
): Promise<ToolExecutionResult> {
  let filePath: string;
  let find: string;
  let replace: string;

  try {
    filePath = expectString(input, "path");
    find = expectString(input, "find");
    replace = expectStringOrEmpty(input, "replace");
  } catch (error) {
    return toolError("invalid_input", error instanceof Error ? error.message : String(error));
  }

  if (find.length === 0) {
    return toolError("invalid_input", "Edit requires a non-empty 'find' field.");
  }

  const resolvedPath = resolveToolPath(context.cwd, filePath);
  if (context.abortSignal?.aborted) {
    return toolCancelled(`Edit was cancelled before execution: ${resolvedPath}`, {
      path: resolvedPath
    });
  }

  try {
    const buffer = await fs.readFile(resolvedPath);
    if (buffer.includes(0)) {
      return toolError("non_text_file", "Refusing to edit binary content as UTF-8 text.", {
        path: resolvedPath
      });
    }
    const original = utf8Decoder.decode(buffer);
    const replacements = original.split(find).length - 1;
    if (replacements < 1) {
      return toolError("no_match", `Edit target not found in file: ${resolvedPath}`, {
        path: resolvedPath,
        find
      });
    }
    const updated = original.split(find).join(replace);
    if (context.abortSignal?.aborted) {
      return toolCancelled(`Edit was cancelled before writing: ${resolvedPath}`, {
        path: resolvedPath
      });
    }
    await fs.writeFile(resolvedPath, updated, "utf8");
    if (context.abortSignal?.aborted) {
      return toolCancelled(`Edit was cancelled after writing: ${resolvedPath}`, {
        path: resolvedPath
      });
    }
    return {
      ok: true,
      output: {
        path: resolvedPath,
        applied: true,
        replacements
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
    return toolError("edit_failed", error instanceof Error ? error.message : String(error), {
      path: resolvedPath
    });
  }
}

function expectStringOrEmpty(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string") {
    throw new Error(`Expected string field: ${key}`);
  }
  return value;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
