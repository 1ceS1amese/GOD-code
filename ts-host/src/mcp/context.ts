import { promises as fs } from "node:fs";
import path from "node:path";
import type { ModelHistoryMessage } from "../types/godCodeProtocol.js";
import { isRecord } from "../types/godCodeProtocol.js";
import type {
  McpRuntimePromptContent,
  McpRuntimeResourceContent,
  SdkMcpStdioRuntime
} from "./runtime.js";

export type McpContextConfigSource = "none" | "env" | "file";

export type McpContextEntry =
  | {
      type: "resource";
      uri: string;
      serverId?: string;
    }
  | {
      type: "prompt";
      name: string;
      arguments?: Record<string, string>;
      serverId?: string;
    };

export interface McpContextLoadOptions {
  environ?: Record<string, string | undefined>;
  cwd?: string;
}

export interface McpContextLoadResult {
  entries: McpContextEntry[];
  source: McpContextConfigSource;
  filePath?: string;
}

export interface McpContextBuildResult {
  entries: McpContextEntry[];
  messages: ModelHistoryMessage[];
  messageStats: McpContextMessageStats[];
  stats: McpContextBuildStats;
}

export interface McpContextBuildOptions {
  maxEntryChars?: number;
  maxTotalChars?: number;
  dedupe?: boolean;
}

export interface McpContextResolvedBuildOptions {
  maxEntryChars?: number;
  maxTotalChars?: number;
  dedupe: boolean;
}

export interface McpContextMessageStats {
  index: number;
  contentChars: number;
  truncated: boolean;
  truncatedBy?: "entry" | "total";
}

export interface McpContextBuildStats {
  requestedEntryCount: number;
  effectiveEntryCount: number;
  skippedDuplicateCount: number;
  skippedMessageCount: number;
  truncatedMessageCount: number;
  contentChars: number;
  limits: McpContextResolvedBuildOptions;
}

export class McpContextConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "McpContextConfigError";
  }
}

export async function loadMcpContextConfig(
  options: McpContextLoadOptions = {}
): Promise<McpContextLoadResult> {
  const environ = options.environ ?? process.env;
  const rawEnv = environ.GOD_CODE_MCP_CONTEXT;
  if (rawEnv !== undefined && rawEnv.trim().length > 0) {
    return {
      entries: parseMcpContextJson(rawEnv, "GOD_CODE_MCP_CONTEXT"),
      source: "env"
    };
  }

  const configuredFile = environ.GOD_CODE_MCP_CONTEXT_FILE;
  if (configuredFile === undefined || configuredFile.trim().length === 0) {
    return {
      entries: [],
      source: "none"
    };
  }

  const cwd = options.cwd ?? process.cwd();
  const filePath = path.resolve(cwd, configuredFile);
  let rawFile: string;
  try {
    rawFile = await fs.readFile(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new McpContextConfigError(`GOD_CODE_MCP_CONTEXT_FILE could not be read: ${filePath}: ${message}`);
  }

  return {
    entries: parseMcpContextJson(rawFile, "MCP context file"),
    source: "file",
    filePath
  };
}

export function loadMcpContextBuildOptions(
  options: { environ?: Record<string, string | undefined> } = {}
): McpContextBuildOptions {
  const environ = options.environ ?? process.env;
  return {
    maxEntryChars: optionalPositiveInteger(
      environ.GOD_CODE_MCP_CONTEXT_MAX_ENTRY_CHARS,
      "GOD_CODE_MCP_CONTEXT_MAX_ENTRY_CHARS"
    ),
    maxTotalChars: optionalPositiveInteger(
      environ.GOD_CODE_MCP_CONTEXT_MAX_TOTAL_CHARS,
      "GOD_CODE_MCP_CONTEXT_MAX_TOTAL_CHARS"
    ),
    dedupe: optionalBoolean(environ.GOD_CODE_MCP_CONTEXT_DEDUP, "GOD_CODE_MCP_CONTEXT_DEDUP") ?? true
  };
}

export async function buildMcpContextMessages(
  runtime: SdkMcpStdioRuntime,
  entries: McpContextEntry[],
  options: McpContextBuildOptions = {}
): Promise<McpContextBuildResult> {
  const limits = normalizeBuildOptions(options);
  const dedupedEntries = limits.dedupe ? dedupeMcpContextEntries(entries) : entries.map(cloneMcpContextEntry);
  const messages: ModelHistoryMessage[] = [];
  const messageStats: McpContextMessageStats[] = [];
  let contentChars = 0;
  let skippedMessageCount = 0;
  let truncatedMessageCount = 0;

  for (const entry of dedupedEntries) {
    if (entry.type === "resource") {
      const resource = await runtime.readResource(entry.uri, { serverId: entry.serverId });
      const limited = limitContextContent(
        renderResourceContextMessage(resource.server_id, resource.uri, resource.contents),
        limits,
        contentChars
      );
      if (limited.skipped) {
        skippedMessageCount += 1;
      } else {
        messages.push({
          kind: "user",
          role: "user",
          content: limited.content
        });
        contentChars += limited.content.length;
        if (limited.truncated) {
          truncatedMessageCount += 1;
        }
        messageStats.push({
          index: messageStats.length,
          contentChars: limited.content.length,
          truncated: limited.truncated,
          ...(limited.truncatedBy ? { truncatedBy: limited.truncatedBy } : {})
        });
      }
      if (limits.maxTotalChars !== undefined && contentChars >= limits.maxTotalChars) {
        break;
      }
      continue;
    }

    const prompt = await runtime.getPrompt(entry.name, entry.arguments, { serverId: entry.serverId });
    for (const message of prompt.messages) {
      const limited = limitContextContent(
        renderPromptContextMessage(
          prompt.server_id,
          prompt.name,
          message.role,
          promptContentToText(message.content)
        ),
        limits,
        contentChars
      );
      if (limited.skipped) {
        skippedMessageCount += 1;
        continue;
      }
      if (message.role === "assistant") {
        messages.push({
          kind: "assistant",
          role: "assistant",
          content: limited.content
        });
      } else {
        messages.push({
          kind: "user",
          role: "user",
          content: limited.content
        });
      }
      contentChars += limited.content.length;
      if (limited.truncated) {
        truncatedMessageCount += 1;
      }
      messageStats.push({
        index: messageStats.length,
        contentChars: limited.content.length,
        truncated: limited.truncated,
        ...(limited.truncatedBy ? { truncatedBy: limited.truncatedBy } : {})
      });
      if (limits.maxTotalChars !== undefined && contentChars >= limits.maxTotalChars) {
        break;
      }
    }
    if (limits.maxTotalChars !== undefined && contentChars >= limits.maxTotalChars) {
      break;
    }
  }

  return {
    entries: dedupedEntries,
    messages,
    messageStats,
    stats: {
      requestedEntryCount: entries.length,
      effectiveEntryCount: dedupedEntries.length,
      skippedDuplicateCount: entries.length - dedupedEntries.length,
      skippedMessageCount,
      truncatedMessageCount,
      contentChars,
      limits
    }
  };
}

function parseMcpContextJson(raw: string, sourceName: string): McpContextEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new McpContextConfigError(`${sourceName} must be valid JSON: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new McpContextConfigError(`${sourceName} must be a JSON array.`);
  }

  return parsed.map(parseMcpContextEntry);
}

function parseMcpContextEntry(value: unknown, index: number): McpContextEntry {
  if (!isRecord(value)) {
    throw new McpContextConfigError(`MCP context entry at index ${index} must be an object.`);
  }
  const type = requiredString(value, "type", index);
  const serverId = optionalString(value, "server_id", index) ?? optionalString(value, "serverId", index);

  if (type === "resource") {
    return {
      type,
      uri: requiredString(value, "uri", index),
      ...(serverId ? { serverId } : {})
    };
  }

  if (type === "prompt") {
    return {
      type,
      name: requiredString(value, "name", index),
      ...(value.arguments !== undefined ? { arguments: stringRecord(value.arguments, "arguments", index) } : {}),
      ...(serverId ? { serverId } : {})
    };
  }

  throw new McpContextConfigError(`MCP context entry at index ${index} field type must be "resource" or "prompt".`);
}

function renderResourceContextMessage(
  serverId: string,
  uri: string,
  contents: McpRuntimeResourceContent[]
): string {
  return [
    "GOD-code MCP resource context",
    `server_id: ${serverId}`,
    `uri: ${uri}`,
    "contents:",
    contents.map(resourceContentToText).join("\n\n")
  ].join("\n");
}

function renderPromptContextMessage(
  serverId: string,
  name: string,
  role: "user" | "assistant",
  content: string
): string {
  return [
    "GOD-code MCP prompt context",
    `server_id: ${serverId}`,
    `prompt: ${name}`,
    `role: ${role}`,
    "content:",
    content
  ].join("\n");
}

function resourceContentToText(content: McpRuntimeResourceContent): string {
  const header = [
    `resource_uri: ${content.uri}`,
    `mime_type: ${content.mime_type ?? "-"}`
  ].join("\n");
  if (content.text !== undefined) {
    return `${header}\ntext:\n${content.text}`;
  }
  if (content.blob !== undefined) {
    return `${header}\nblob_base64:\n${content.blob}`;
  }
  return `${header}\n<empty resource content>`;
}

function promptContentToText(content: McpRuntimePromptContent): string {
  if (content.text !== undefined) {
    return content.text;
  }
  if (content.resource) {
    return resourceContentToText(content.resource);
  }
  if (content.data !== undefined) {
    return content.data;
  }
  if (content.uri !== undefined) {
    return content.uri;
  }
  return JSON.stringify(content);
}

function cloneMcpContextEntry(entry: McpContextEntry): McpContextEntry {
  if (entry.type === "resource") {
    return { ...entry };
  }
  return {
    ...entry,
    ...(entry.arguments ? { arguments: { ...entry.arguments } } : {})
  };
}

function dedupeMcpContextEntries(entries: McpContextEntry[]): McpContextEntry[] {
  const seen = new Set<string>();
  const result: McpContextEntry[] = [];
  for (const entry of entries) {
    const key = contextEntryKey(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(cloneMcpContextEntry(entry));
  }
  return result;
}

function contextEntryKey(entry: McpContextEntry): string {
  if (entry.type === "resource") {
    return ["resource", entry.serverId ?? "", entry.uri].join("\u0000");
  }
  return [
    "prompt",
    entry.serverId ?? "",
    entry.name,
    stableStringRecord(entry.arguments ?? {})
  ].join("\u0000");
}

function stableStringRecord(value: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

function normalizeBuildOptions(options: McpContextBuildOptions): McpContextResolvedBuildOptions {
  return {
    maxEntryChars: options.maxEntryChars,
    maxTotalChars: options.maxTotalChars,
    dedupe: options.dedupe ?? true
  };
}

function limitContextContent(
  content: string,
  limits: McpContextResolvedBuildOptions,
  currentTotalChars: number
): {
  content: string;
  skipped: boolean;
  truncated: boolean;
  truncatedBy?: "entry" | "total";
} {
  let result = content;
  let truncated = false;
  let truncatedBy: "entry" | "total" | undefined;

  if (limits.maxEntryChars !== undefined && result.length > limits.maxEntryChars) {
    result = truncateWithMarker(result, limits.maxEntryChars, "\n...[truncated by GOD_CODE_MCP_CONTEXT_MAX_ENTRY_CHARS]");
    truncated = true;
    truncatedBy = "entry";
  }

  if (limits.maxTotalChars !== undefined) {
    const remaining = limits.maxTotalChars - currentTotalChars;
    if (remaining <= 0) {
      return {
        content: "",
        skipped: true,
        truncated: false
      };
    }
    if (result.length > remaining) {
      result = truncateWithMarker(result, remaining, "\n...[truncated by GOD_CODE_MCP_CONTEXT_MAX_TOTAL_CHARS]");
      truncated = true;
      truncatedBy = "total";
    }
  }

  return {
    content: result,
    skipped: false,
    truncated,
    ...(truncatedBy ? { truncatedBy } : {})
  };
}

function truncateWithMarker(value: string, maxChars: number, marker: string): string {
  if (value.length <= maxChars) {
    return value;
  }
  if (maxChars <= marker.length) {
    return marker.slice(0, maxChars);
  }
  return `${value.slice(0, maxChars - marker.length)}${marker}`;
}

function optionalPositiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  if (!/^[1-9]\d*$/u.test(value.trim())) {
    throw new McpContextConfigError(`${name} must be a positive integer.`);
  }
  return Number(value.trim());
}

function optionalBoolean(value: string | undefined, name: string): boolean | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new McpContextConfigError(`${name} must be true/false, yes/no, on/off, or 1/0.`);
}

function requiredString(value: Record<string, unknown>, key: string, index: number): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new McpContextConfigError(`MCP context entry at index ${index} requires non-empty string field: ${key}`);
  }
  return field;
}

function optionalString(value: Record<string, unknown>, key: string, index: number): string | undefined {
  const field = value[key];
  if (field === undefined) {
    return undefined;
  }
  if (typeof field !== "string" || field.length === 0) {
    throw new McpContextConfigError(`MCP context entry at index ${index} field ${key} must be a non-empty string.`);
  }
  return field;
}

function stringRecord(value: unknown, key: string, index: number): Record<string, string> {
  if (!isRecord(value)) {
    throw new McpContextConfigError(`MCP context entry at index ${index} field ${key} must be an object.`);
  }
  const result: Record<string, string> = {};
  for (const [name, field] of Object.entries(value)) {
    if (typeof field !== "string") {
      throw new McpContextConfigError(
        `MCP context entry at index ${index} field ${key}.${name} must be a string.`
      );
    }
    result[name] = field;
  }
  return result;
}
