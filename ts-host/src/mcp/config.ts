import { promises as fs } from "node:fs";
import path from "node:path";
import { isRecord } from "../types/godCodeProtocol.js";

export type McpServerTransportKind = "stdio" | "streamable-http" | "sse";

export interface McpStdioServerConfig {
  id: string;
  transport?: "stdio";
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface McpStreamableHttpServerConfig {
  id: string;
  transport: "streamable-http";
  url: string;
  headers?: Record<string, string>;
  headerEnv?: Record<string, string>;
  bearerTokenEnv?: string;
}

export interface McpSseServerConfig {
  id: string;
  transport: "sse";
  url: string;
  headers?: Record<string, string>;
  headerEnv?: Record<string, string>;
  bearerTokenEnv?: string;
}

export type McpServerConfig = McpStdioServerConfig | McpStreamableHttpServerConfig | McpSseServerConfig;

export class McpConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "McpConfigError";
  }
}

export type McpConfigSource = "none" | "env" | "file";

export interface McpConfigLoadOptions {
  environ?: Record<string, string | undefined>;
  cwd?: string;
}

export interface McpConfigLoadResult {
  configs: McpServerConfig[];
  source: McpConfigSource;
  filePath?: string;
}

export async function loadMcpServerConfigs(
  options: McpConfigLoadOptions = {}
): Promise<McpConfigLoadResult> {
  const environ = options.environ ?? process.env;
  const rawEnv = environ.GOD_CODE_MCP_SERVERS;
  if (rawEnv !== undefined && rawEnv.trim().length > 0) {
    return {
      configs: parseMcpServerConfigsJson(rawEnv, "GOD_CODE_MCP_SERVERS", environ),
      source: "env"
    };
  }

  const configuredFile = environ.GOD_CODE_MCP_CONFIG_FILE;
  if (configuredFile === undefined || configuredFile.trim().length === 0) {
    return {
      configs: [],
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
    throw new McpConfigError(`GOD_CODE_MCP_CONFIG_FILE could not be read: ${filePath}: ${message}`);
  }

  return {
    configs: parseMcpServerConfigsJson(rawFile, "MCP config file", environ),
    source: "file",
    filePath
  };
}

export function loadMcpServerConfigsFromEnv(
  environ: Record<string, string | undefined> = process.env
): McpServerConfig[] {
  const raw = environ.GOD_CODE_MCP_SERVERS;
  if (raw === undefined || raw.trim().length === 0) {
    return [];
  }

  return parseMcpServerConfigsJson(raw, "GOD_CODE_MCP_SERVERS", environ);
}

function parseMcpServerConfigsJson(
  raw: string,
  sourceName: string,
  environ: Record<string, string | undefined>
): McpServerConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new McpConfigError(`${sourceName} must be valid JSON: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new McpConfigError(`${sourceName} must be a JSON array.`);
  }

  const seenIds = new Set<string>();
  return parsed.map((value, index) => {
    const config = parseMcpServerConfig(value, index, environ);
    if (seenIds.has(config.id)) {
      throw new McpConfigError(`Duplicate MCP server id: ${config.id}`);
    }
    seenIds.add(config.id);
    return config;
  });
}

function parseMcpServerConfig(
  value: unknown,
  index: number,
  environ: Record<string, string | undefined>
): McpServerConfig {
  if (!isRecord(value)) {
    throw new McpConfigError(`MCP server config at index ${index} must be an object.`);
  }

  const id = requiredString(value, "id", index);
  const transport = parseTransport(value.transport, index);

  if (transport === "streamable-http" || transport === "sse") {
    const url = requiredString(value, "url", index);
    validateHttpUrl(url, index);
    const config: McpStreamableHttpServerConfig | McpSseServerConfig = { id, transport, url };
    const headers: Record<string, string> = {};
    if (value.headers !== undefined) {
      for (const [name, field] of Object.entries(stringRecord(value.headers, "headers", index))) {
        setHttpHeader(headers, name, field, index, "headers");
      }
    }
    const headerEnv = optionalRecordAlias(value, "headers_env", "headersEnv", index);
    if (headerEnv !== undefined) {
      config.headerEnv = stringRecord(headerEnv, "headers_env", index);
      for (const [name, envName] of Object.entries(config.headerEnv)) {
        setHttpHeader(headers, name, requireEnvValue(environ, envName, index, `headers_env.${name}`), index, "headers_env");
      }
    }
    const bearerTokenEnv = optionalStringAlias(value, "bearer_token_env", "bearerTokenEnv", index);
    if (bearerTokenEnv !== undefined) {
      config.bearerTokenEnv = bearerTokenEnv;
      setHttpHeader(
        headers,
        "Authorization",
        `Bearer ${requireEnvValue(environ, bearerTokenEnv, index, "bearer_token_env")}`,
        index,
        "bearer_token_env"
      );
    }
    if (Object.keys(headers).length > 0) {
      config.headers = headers;
    }
    return config;
  }

  const command = requiredString(value, "command", index);
  const config: McpStdioServerConfig = { id, command };
  if (value.transport === "stdio") {
    config.transport = "stdio";
  }

  if (value.args !== undefined) {
    config.args = stringArray(value.args, "args", index);
  }
  if (value.cwd !== undefined) {
    config.cwd = stringField(value.cwd, "cwd", index);
  }
  if (value.env !== undefined) {
    config.env = stringRecord(value.env, "env", index);
  }

  return config;
}

export function isStdioMcpServerConfig(config: McpServerConfig): config is McpStdioServerConfig {
  return (config.transport ?? "stdio") === "stdio";
}

export function mcpServerTransportKind(config: McpServerConfig): McpServerTransportKind {
  return isStdioMcpServerConfig(config) ? "stdio" : config.transport;
}

function parseTransport(value: unknown, index: number): McpServerTransportKind {
  if (value === undefined) {
    return "stdio";
  }
  if (value === "stdio" || value === "streamable-http" || value === "sse") {
    return value;
  }
  throw new McpConfigError(
    `MCP server config at index ${index} field transport must be "stdio", "streamable-http", or "sse".`
  );
}

function validateHttpUrl(value: string, index: number): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new McpConfigError(`MCP server config at index ${index} field url must be a valid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new McpConfigError(`MCP server config at index ${index} field url must use http or https.`);
  }
}

function requiredString(value: Record<string, unknown>, key: string, index: number): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new McpConfigError(`MCP server config at index ${index} requires non-empty string field: ${key}`);
  }
  return field;
}

function stringField(value: unknown, key: string, index: number): string {
  if (typeof value !== "string") {
    throw new McpConfigError(`MCP server config at index ${index} field ${key} must be a string.`);
  }
  return value;
}

function optionalStringAlias(
  value: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
  index: number
): string | undefined {
  const snakeValue = value[snakeKey];
  const camelValue = value[camelKey];
  if (snakeValue !== undefined && camelValue !== undefined) {
    throw new McpConfigError(
      `MCP server config at index ${index} fields ${snakeKey} and ${camelKey} cannot both be set.`
    );
  }
  const field = snakeValue ?? camelValue;
  if (field === undefined) {
    return undefined;
  }
  if (typeof field !== "string" || field.length === 0) {
    throw new McpConfigError(`MCP server config at index ${index} field ${snakeKey} must be a non-empty string.`);
  }
  return field;
}

function optionalRecordAlias(
  value: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
  index: number
): unknown {
  const snakeValue = value[snakeKey];
  const camelValue = value[camelKey];
  if (snakeValue !== undefined && camelValue !== undefined) {
    throw new McpConfigError(
      `MCP server config at index ${index} fields ${snakeKey} and ${camelKey} cannot both be set.`
    );
  }
  return snakeValue ?? camelValue;
}

function stringArray(value: unknown, key: string, index: number): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new McpConfigError(`MCP server config at index ${index} field ${key} must be a string array.`);
  }
  return [...value];
}

function stringRecord(value: unknown, key: string, index: number): Record<string, string> {
  if (!isRecord(value)) {
    throw new McpConfigError(`MCP server config at index ${index} field ${key} must be an object.`);
  }
  const result: Record<string, string> = {};
  for (const [name, field] of Object.entries(value)) {
    if (typeof field !== "string") {
      throw new McpConfigError(
        `MCP server config at index ${index} field ${key}.${name} must be a string.`
      );
    }
    result[name] = field;
  }
  return result;
}

function requireEnvValue(
  environ: Record<string, string | undefined>,
  envName: string,
  index: number,
  fieldName: string
): string {
  const value = environ[envName];
  if (value === undefined || value.length === 0) {
    throw new McpConfigError(
      `MCP server config at index ${index} field ${fieldName} references unset environment variable: ${envName}`
    );
  }
  return value;
}

function setHttpHeader(
  headers: Record<string, string>,
  name: string,
  value: string,
  index: number,
  sourceField: string
): void {
  const existingName = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  if (existingName !== undefined) {
    throw new McpConfigError(
      `MCP server config at index ${index} defines duplicate HTTP header ${name} via ${sourceField}.`
    );
  }
  headers[name] = value;
}
