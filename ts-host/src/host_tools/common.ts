import path from "node:path";
import { asToolExecutionError, type ToolExecutionResult } from "../types/godCodeProtocol.js";

export interface HostToolContext {
  cwd: string;
  abortSignal?: AbortSignal;
}

export function toolError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ToolExecutionResult {
  const error = asToolExecutionError(details === undefined
    ? { code, message }
    : { code, message, details });
  return {
    ok: false,
    error
  };
}

export function toolCancelled(message: string, details?: Record<string, unknown>): ToolExecutionResult {
  return toolError("tool_cancelled", message, details);
}

export function expectString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected non-empty string field: ${key}`);
  }
  return value;
}

export function expectOptionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Expected string field: ${key}`);
  }
  return value;
}

export function expectStringAllowEmpty(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string") {
    throw new Error(`Expected string field: ${key}`);
  }
  return value;
}

export function expectOptionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Expected numeric field: ${key}`);
  }
  return value;
}

export function expectOptionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Expected boolean field: ${key}`);
  }
  return value;
}

export function expectPositiveInteger(input: Record<string, unknown>, key: string, fallback: number): number {
  const value = input[key];
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected positive integer field: ${key}`);
  }
  return value;
}

export function resolveToolPath(baseCwd: string, filePath: string): string {
  return path.resolve(baseCwd, filePath);
}

export function isPathInside(baseCwd: string, resolvedPath: string): boolean {
  const relative = path.relative(path.resolve(baseCwd), path.resolve(resolvedPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
