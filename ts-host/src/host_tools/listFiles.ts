import { promises as fs } from "node:fs";
import path from "node:path";
import type { ToolExecutionResult } from "../types/godCodeProtocol.js";
import {
  expectOptionalBoolean,
  expectPositiveInteger,
  expectString,
  resolveToolPath,
  toolCancelled,
  toolError,
  type HostToolContext
} from "./common.js";

const DEFAULT_MAX_ENTRIES = 200;

interface ListedEntry {
  path: string;
  name: string;
  type: "file" | "directory" | "other";
}

export async function executeListFiles(
  input: Record<string, unknown>,
  context: HostToolContext
): Promise<ToolExecutionResult> {
  let requestedPath: string;
  let recursive: boolean;
  let maxEntries: number;

  try {
    requestedPath = expectString(input, "path");
    recursive = expectOptionalBoolean(input, "recursive") ?? false;
    maxEntries = expectPositiveInteger(input, "max_entries", DEFAULT_MAX_ENTRIES);
  } catch (error) {
    return toolError("invalid_input", error instanceof Error ? error.message : String(error));
  }

  const resolvedPath = resolveToolPath(context.cwd, requestedPath);
  if (context.abortSignal?.aborted) {
    return toolCancelled(`ListFiles was cancelled before execution: ${resolvedPath}`, {
      path: resolvedPath
    });
  }

  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isDirectory()) {
      return toolError("not_directory", `Path is not a directory: ${resolvedPath}`, {
        path: resolvedPath
      });
    }

    const entries: ListedEntry[] = [];
    const overflow = await collectEntries(resolvedPath, recursive, maxEntries, entries, context);
    if (context.abortSignal?.aborted) {
      return toolCancelled(`ListFiles was cancelled during execution: ${resolvedPath}`, {
        path: resolvedPath
      });
    }
    if (overflow) {
      return toolError("too_many_entries", `ListFiles exceeded max_entries (${maxEntries}).`, {
        path: resolvedPath,
        max_entries: maxEntries
      });
    }

    return {
      ok: true,
      output: {
        path: resolvedPath,
        recursive,
        entries
      }
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return toolError("file_not_found", `Path not found: ${resolvedPath}`, {
        path: resolvedPath
      });
    }
    return toolError("list_failed", error instanceof Error ? error.message : String(error), {
      path: resolvedPath
    });
  }
}

async function collectEntries(
  directory: string,
  recursive: boolean,
  maxEntries: number,
  entries: ListedEntry[],
  context: HostToolContext
): Promise<boolean> {
  if (context.abortSignal?.aborted) {
    return false;
  }

  const dirents = await fs.readdir(directory, { withFileTypes: true });
  dirents.sort((a, b) => a.name.localeCompare(b.name));

  for (const dirent of dirents) {
    if (context.abortSignal?.aborted) {
      return false;
    }

    if (entries.length >= maxEntries) {
      return true;
    }

    const entryPath = path.join(directory, dirent.name);
    const entryType = dirent.isFile() ? "file" : dirent.isDirectory() ? "directory" : "other";
    entries.push({
      path: entryPath,
      name: dirent.name,
      type: entryType
    });

    if (recursive && dirent.isDirectory()) {
      const overflow = await collectEntries(entryPath, recursive, maxEntries, entries, context);
      if (overflow) {
        return true;
      }
    }
  }

  return false;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
