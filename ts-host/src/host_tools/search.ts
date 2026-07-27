import { promises as fs } from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
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

const DEFAULT_MAX_MATCHES = 100;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

interface SearchMatch {
  path: string;
  line_number: number;
  line: string;
}

export async function executeSearch(
  input: Record<string, unknown>,
  context: HostToolContext
): Promise<ToolExecutionResult> {
  let requestedPath: string;
  let pattern: string;
  let recursive: boolean;
  let maxMatches: number;

  try {
    requestedPath = expectString(input, "path");
    pattern = expectString(input, "pattern");
    recursive = expectOptionalBoolean(input, "recursive") ?? true;
    maxMatches = expectPositiveInteger(input, "max_matches", DEFAULT_MAX_MATCHES);
  } catch (error) {
    return toolError("invalid_input", error instanceof Error ? error.message : String(error));
  }

  const resolvedPath = resolveToolPath(context.cwd, requestedPath);
  if (context.abortSignal?.aborted) {
    return toolCancelled(`Search was cancelled before execution: ${resolvedPath}`, {
      path: resolvedPath
    });
  }

  try {
    const matches: SearchMatch[] = [];
    const overflow = await searchPath(resolvedPath, pattern, recursive, maxMatches, matches, context);
    if (context.abortSignal?.aborted) {
      return toolCancelled(`Search was cancelled during execution: ${resolvedPath}`, {
        path: resolvedPath
      });
    }
    if (overflow) {
      return toolError("too_many_matches", `Search exceeded max_matches (${maxMatches}).`, {
        path: resolvedPath,
        pattern,
        max_matches: maxMatches
      });
    }

    return {
      ok: true,
      output: {
        path: resolvedPath,
        pattern,
        recursive,
        matches
      }
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return toolError("file_not_found", `Path not found: ${resolvedPath}`, {
        path: resolvedPath
      });
    }
    return toolError("search_failed", error instanceof Error ? error.message : String(error), {
      path: resolvedPath,
      pattern
    });
  }
}

async function searchPath(
  currentPath: string,
  pattern: string,
  recursive: boolean,
  maxMatches: number,
  matches: SearchMatch[],
  context: HostToolContext
): Promise<boolean> {
  if (context.abortSignal?.aborted) {
    return false;
  }

  const stat = await fs.stat(currentPath);
  if (stat.isDirectory()) {
    const dirents = await fs.readdir(currentPath, { withFileTypes: true });
    dirents.sort((a, b) => a.name.localeCompare(b.name));
    for (const dirent of dirents) {
      const childPath = path.join(currentPath, dirent.name);
      if (dirent.isDirectory() && !recursive) {
        continue;
      }
      const overflow = await searchPath(childPath, pattern, recursive, maxMatches, matches, context);
      if (overflow) {
        return true;
      }
    }
    return false;
  }

  if (!stat.isFile()) {
    return false;
  }

  return await searchFile(currentPath, pattern, maxMatches, matches);
}

async function searchFile(
  filePath: string,
  pattern: string,
  maxMatches: number,
  matches: SearchMatch[]
): Promise<boolean> {
  const buffer = await fs.readFile(filePath);
  if (buffer.includes(0)) {
    return false;
  }

  let content: string;
  try {
    content = utf8Decoder.decode(buffer);
  } catch {
    return false;
  }

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes(pattern)) {
      continue;
    }
    if (matches.length >= maxMatches) {
      return true;
    }
    matches.push({
      path: filePath,
      line_number: index + 1,
      line: lines[index]
    });
  }

  return false;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
