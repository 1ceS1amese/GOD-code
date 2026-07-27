import type { ToolCatalogEntry } from "../types/godCodeProtocol.js";
import { isStdioMcpServerConfig, loadMcpServerConfigs, type McpServerConfig } from "../mcp/config.js";
import { buildMcpContextMessages, loadMcpContextBuildOptions, loadMcpContextConfig } from "../mcp/context.js";
import { McpRuntimeDiagnosticError, SdkMcpStdioRuntime } from "../mcp/runtime.js";

export type McpDiagnosticStatus = "ok" | "warn" | "error";

export interface McpDiagnosticCheck {
  name: string;
  status: McpDiagnosticStatus;
  message: string;
  details?: unknown;
}

export interface McpDiagnosticReport {
  ok: boolean;
  checks: McpDiagnosticCheck[];
}

type McpDiagnosticRuntimeFinalizationOutcome =
  | { ok: true }
  | { ok: false };

const MCP_RUNTIME_CLEANUP_FAILURE_MESSAGE =
  "MCP runtime cleanup failed";

export interface InspectMcpConfigOptions {
  connect?: boolean;
  resources?: boolean;
  resourceTemplates?: boolean;
  prompts?: boolean;
  environ?: Record<string, string | undefined>;
  cwd?: string;
}

export interface InspectMcpContextOptions {
  environ?: Record<string, string | undefined>;
  cwd?: string;
}

export interface ReadMcpResourceOptions {
  uri: string;
  serverId?: string;
  environ?: Record<string, string | undefined>;
  cwd?: string;
}

export interface McpResourceSubscriptionOptions {
  uri: string;
  serverId?: string;
  environ?: Record<string, string | undefined>;
  cwd?: string;
}

export interface WaitMcpResourceUpdateOptions {
  uri: string;
  serverId?: string;
  timeoutMs?: number;
  environ?: Record<string, string | undefined>;
  cwd?: string;
}

export interface WatchMcpResourceUpdatesOptions {
  uri: string;
  serverId?: string;
  timeoutMs?: number;
  maxEvents?: number;
  environ?: Record<string, string | undefined>;
  cwd?: string;
}

export interface LoopMcpResourceUpdatesOptions {
  uris: string[];
  serverId?: string;
  timeoutMs?: number;
  maxEvents?: number;
  environ?: Record<string, string | undefined>;
  cwd?: string;
}

export interface GetMcpPromptOptions {
  name: string;
  arguments?: Record<string, string>;
  serverId?: string;
  environ?: Record<string, string | undefined>;
  cwd?: string;
}

export interface CompleteMcpPromptOptions {
  name: string;
  argument: { name: string; value: string };
  context?: Record<string, string>;
  serverId?: string;
  environ?: Record<string, string | undefined>;
  cwd?: string;
}

export interface CompleteMcpResourceTemplateOptions {
  uriTemplate: string;
  argument: { name: string; value: string };
  context?: Record<string, string>;
  serverId?: string;
  environ?: Record<string, string | undefined>;
  cwd?: string;
}

interface SanitizedMcpServerConfig {
  id: string;
  transport: "stdio" | "streamable-http" | "sse";
  command?: string;
  args_count?: number;
  cwd?: string;
  env_keys?: string[];
  url?: string;
  header_keys?: string[];
  header_env_keys?: string[];
  bearer_token_env?: string;
}

export async function inspectMcpConfig(
  options: InspectMcpConfigOptions = {}
): Promise<McpDiagnosticReport> {
  const checks: McpDiagnosticCheck[] = [];
  let configs: McpServerConfig[];
  let source = "none";
  let configFile: string | undefined;

  try {
    const loaded = await loadMcpServerConfigs({
      environ: options.environ,
      cwd: options.cwd
    });
    configs = loaded.configs;
    source = loaded.source;
    configFile = loaded.filePath;
  } catch (error) {
    checks.push({
      name: "mcp_config",
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    });
    return report(checks);
  }

  checks.push({
    name: "mcp_config",
    status: "ok",
    message: configs.length === 0
      ? "no MCP servers configured"
      : `${configs.length} MCP server(s) configured from ${source}`,
    details: {
      source,
      ...(configFile ? { config_file: configFile } : {}),
      servers: configs.map(sanitizeConfig)
    }
  });

  if (options.connect) {
    await checkMcpConnection(checks, configs, {
      resources: options.resources === true,
      resourceTemplates: options.resourceTemplates === true,
      prompts: options.prompts === true
    });
  }

  return report(checks);
}

export async function inspectMcpContext(options: InspectMcpContextOptions = {}): Promise<McpDiagnosticReport> {
  const checks: McpDiagnosticCheck[] = [];
  let contextConfig: Awaited<ReturnType<typeof loadMcpContextConfig>>;
  let contextBuildOptions: ReturnType<typeof loadMcpContextBuildOptions>;

  try {
    contextConfig = await loadMcpContextConfig({
      environ: options.environ,
      cwd: options.cwd
    });
    contextBuildOptions = loadMcpContextBuildOptions({
      environ: options.environ
    });
  } catch (error) {
    checks.push({
      name: "mcp_context_config",
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    });
    return report(checks);
  }

  checks.push({
    name: "mcp_context_config",
    status: "ok",
    message: contextConfig.entries.length === 0
      ? "no MCP context entries configured"
      : `${contextConfig.entries.length} MCP context entr${contextConfig.entries.length === 1 ? "y" : "ies"} configured from ${contextConfig.source}`,
    details: {
      source: contextConfig.source,
      ...(contextConfig.filePath ? { config_file: contextConfig.filePath } : {}),
      entries: contextConfig.entries.map(sanitizeContextEntry),
      limits: sanitizeContextLimits(contextBuildOptions)
    }
  });

  if (contextConfig.entries.length === 0) {
    return report(checks);
  }

  let serverConfigs: McpServerConfig[];
  try {
    const loaded = await loadMcpServerConfigs({
      environ: options.environ,
      cwd: options.cwd
    });
    serverConfigs = loaded.configs;
  } catch (error) {
    checks.push({
      name: "mcp_config",
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    });
    return report(checks);
  }

  if (serverConfigs.length === 0) {
    checks.push({
      name: "mcp_context",
      status: "error",
      message: "MCP context entries require at least one configured MCP server"
    });
    return report(checks);
  }

  const runtime = new SdkMcpStdioRuntime(serverConfigs);
  const runtimeChecks: McpDiagnosticCheck[] = [];
  let connected = false;
  try {
    await runtime.connect();
    connected = true;
    runtimeChecks.push({
      name: "mcp_connect",
      status: "ok",
      message: `${serverConfigs.length} MCP server(s) connected`
    });
    const context = await buildMcpContextMessages(runtime, contextConfig.entries, contextBuildOptions);
    runtimeChecks.push({
      name: "mcp_context",
      status: "ok",
      message: `${context.messages.length} MCP context message(s) built`,
      details: {
        requested_entry_count: context.stats.requestedEntryCount,
        entry_count: context.entries.length,
        message_count: context.messages.length,
        skipped_duplicate_count: context.stats.skippedDuplicateCount,
        skipped_message_count: context.stats.skippedMessageCount,
        truncated_message_count: context.stats.truncatedMessageCount,
        content_chars: context.stats.contentChars,
        limits: sanitizeContextLimits(context.stats.limits),
        entries: context.entries.map(sanitizeContextEntry),
        messages: context.messages.map((message, index) => ({
          index,
          kind: message.kind,
          role: "role" in message ? message.role : undefined,
          content: "content" in message ? message.content : undefined,
          content_chars: context.messageStats[index]?.contentChars,
          truncated: context.messageStats[index]?.truncated,
          truncated_by: context.messageStats[index]?.truncatedBy
        }))
      }
    });
  } catch (error) {
    runtimeChecks.push({
      name: connected ? "mcp_context" : "mcp_connect",
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      details: connected ? undefined : mcpConnectErrorDetails(error, serverConfigs)
    });
  }

  const finalization = await finalizeMcpDiagnosticRuntime(runtime);
  applyMcpDiagnosticRuntimeCleanup(
    runtimeChecks,
    "mcp_context",
    finalization
  );
  checks.push(...runtimeChecks);

  return report(checks);
}

export function renderMcpDiagnosticReport(reportValue: McpDiagnosticReport): string {
  const lines = ["GOD-code MCP diagnostics:"];
  for (const check of reportValue.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    renderMcpDetails(lines, check.details);
  }
  return lines.join("\n");
}

export function renderMcpDiagnosticReportJson(reportValue: McpDiagnosticReport): string {
  return JSON.stringify(reportValue, null, 2);
}

export function renderMcpCompletionValues(reportValue: McpDiagnosticReport): string {
  const completion = findMcpCompletionDetails(reportValue);
  if (!completion || !Array.isArray(completion.values)) {
    return "";
  }
  return completion.values.filter((value): value is string => typeof value === "string").join("\n");
}

export function renderMcpCompletionJsonl(reportValue: McpDiagnosticReport): string {
  const completion = findMcpCompletionDetails(reportValue);
  if (!completion || !Array.isArray(completion.values)) {
    return "";
  }
  return completion.values
    .filter((value): value is string => typeof value === "string")
    .map((value, index) => JSON.stringify({
      value,
      index,
      server_id: stringValue(completion.server_id),
      ref_type: stringValue(completion.ref_type),
      ref: stringValue(completion.ref),
      argument: isRecord(completion.argument) ? { ...completion.argument } : undefined
    }))
    .join("\n");
}

export async function readMcpResource(options: ReadMcpResourceOptions): Promise<McpDiagnosticReport> {
  return runMcpRuntimeDiagnostic(
    {
      environ: options.environ,
      cwd: options.cwd
    },
    "mcp_read_resource",
    async (runtime) => {
      const resource = await runtime.readResource(options.uri, { serverId: options.serverId });
      return {
        status: "ok",
        message: `read MCP resource ${options.uri}`,
        details: resource
      };
    }
  );
}

export async function subscribeMcpResource(options: McpResourceSubscriptionOptions): Promise<McpDiagnosticReport> {
  return runMcpRuntimeDiagnostic(
    {
      environ: options.environ,
      cwd: options.cwd
    },
    "mcp_subscribe_resource",
    async (runtime) => {
      const subscription = await runtime.subscribeResource(options.uri, { serverId: options.serverId });
      return {
        status: "ok",
        message: `subscribed MCP resource ${options.uri}`,
        details: subscription
      };
    }
  );
}

export async function unsubscribeMcpResource(options: McpResourceSubscriptionOptions): Promise<McpDiagnosticReport> {
  return runMcpRuntimeDiagnostic(
    {
      environ: options.environ,
      cwd: options.cwd
    },
    "mcp_unsubscribe_resource",
    async (runtime) => {
      const subscription = await runtime.unsubscribeResource(options.uri, { serverId: options.serverId });
      return {
        status: "ok",
        message: `unsubscribed MCP resource ${options.uri}`,
        details: subscription
      };
    }
  );
}

export async function waitMcpResourceUpdate(options: WaitMcpResourceUpdateOptions): Promise<McpDiagnosticReport> {
  return runMcpRuntimeDiagnostic(
    {
      environ: options.environ,
      cwd: options.cwd
    },
    "mcp_resource_update",
    async (runtime) => {
      const update = await runtime.waitForResourceUpdate(options.uri, {
        serverId: options.serverId,
        timeoutMs: options.timeoutMs
      });
      return {
        status: update.timed_out ? "warn" : "ok",
        message: update.timed_out
          ? `timed out waiting for MCP resource update ${options.uri}`
          : `observed MCP resource update ${options.uri}`,
        details: update
      };
    }
  );
}

export async function watchMcpResourceUpdates(options: WatchMcpResourceUpdatesOptions): Promise<McpDiagnosticReport> {
  return runMcpRuntimeDiagnostic(
    {
      environ: options.environ,
      cwd: options.cwd
    },
    "mcp_resource_update_watch",
    async (runtime) => {
      const watch = await runtime.watchResourceUpdates(options.uri, {
        serverId: options.serverId,
        timeoutMs: options.timeoutMs,
        maxEvents: options.maxEvents
      });
      return {
        status: watch.timed_out ? "warn" : "ok",
        message: watch.timed_out
          ? `timed out after ${watch.event_count} MCP resource update(s) for ${options.uri}`
          : `observed ${watch.event_count} MCP resource update(s) for ${options.uri}`,
        details: watch
      };
    }
  );
}

export async function loopMcpResourceUpdates(options: LoopMcpResourceUpdatesOptions): Promise<McpDiagnosticReport> {
  return runMcpRuntimeDiagnostic(
    {
      environ: options.environ,
      cwd: options.cwd
    },
    "mcp_resource_update_loop",
    async (runtime) => {
      const loop = await runtime.loopResourceUpdates(options.uris, {
        serverId: options.serverId,
        timeoutMs: options.timeoutMs,
        maxEvents: options.maxEvents
      });
      return {
        status: loop.timed_out ? "warn" : "ok",
        message: loop.timed_out
          ? `resource update loop timed out after ${loop.event_count} event(s)`
          : `resource update loop observed ${loop.event_count} event(s)`,
        details: loop
      };
    }
  );
}

export async function getMcpPrompt(options: GetMcpPromptOptions): Promise<McpDiagnosticReport> {
  return runMcpRuntimeDiagnostic(
    {
      environ: options.environ,
      cwd: options.cwd
    },
    "mcp_get_prompt",
    async (runtime) => {
      const prompt = await runtime.getPrompt(options.name, options.arguments, {
        serverId: options.serverId
      });
      return {
        status: "ok",
        message: `got MCP prompt ${options.name}`,
        details: prompt
      };
    }
  );
}

export async function completeMcpPrompt(options: CompleteMcpPromptOptions): Promise<McpDiagnosticReport> {
  return runMcpRuntimeDiagnostic(
    {
      environ: options.environ,
      cwd: options.cwd
    },
    "mcp_complete_prompt",
    async (runtime) => {
      const completion = await runtime.completePrompt(options.name, options.argument, {
        context: options.context,
        serverId: options.serverId
      });
      return {
        status: "ok",
        message: `completed MCP prompt ${options.name}`,
        details: completion
      };
    }
  );
}

export async function completeMcpResourceTemplate(
  options: CompleteMcpResourceTemplateOptions
): Promise<McpDiagnosticReport> {
  return runMcpRuntimeDiagnostic(
    {
      environ: options.environ,
      cwd: options.cwd
    },
    "mcp_complete_resource_template",
    async (runtime) => {
      const completion = await runtime.completeResourceTemplate(options.uriTemplate, options.argument, {
        context: options.context,
        serverId: options.serverId
      });
      return {
        status: "ok",
        message: `completed MCP resource template ${options.uriTemplate}`,
        details: completion
      };
    }
  );
}

async function checkMcpConnection(
  checks: McpDiagnosticCheck[],
  configs: McpServerConfig[],
  options: { resources: boolean; resourceTemplates: boolean; prompts: boolean }
): Promise<void> {
  if (configs.length === 0) {
    checks.push({
      name: "mcp_connect",
      status: "ok",
      message: "no MCP servers to connect"
    });
    return;
  }

  const runtime = new SdkMcpStdioRuntime(configs);
  const runtimeChecks: McpDiagnosticCheck[] = [];
  try {
    await runtime.connect();
    const tools = await runtime.listTools();
    runtimeChecks.push({
      name: "mcp_connect",
      status: "ok",
      message: `${tools.length} MCP tool(s) loaded`,
      details: {
        tool_count: tools.length,
        tools: tools.map(sanitizeTool)
      }
    });
    if (options.resources) {
      try {
        const resources = await runtime.listResources();
        runtimeChecks.push({
          name: "mcp_resources",
          status: "ok",
          message: `${resources.length} MCP resource(s) loaded`,
          details: {
            resource_count: resources.length,
            resources
          }
        });
      } catch (error) {
        runtimeChecks.push({
          name: "mcp_resources",
          status: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    if (options.resourceTemplates) {
      try {
        const resourceTemplates = await runtime.listResourceTemplates();
        runtimeChecks.push({
          name: "mcp_resource_templates",
          status: "ok",
          message: `${resourceTemplates.length} MCP resource template(s) loaded`,
          details: {
            resource_template_count: resourceTemplates.length,
            resource_templates: resourceTemplates
          }
        });
      } catch (error) {
        runtimeChecks.push({
          name: "mcp_resource_templates",
          status: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    if (options.prompts) {
      try {
        const prompts = await runtime.listPrompts();
        runtimeChecks.push({
          name: "mcp_prompts",
          status: "ok",
          message: `${prompts.length} MCP prompt(s) loaded`,
          details: {
            prompt_count: prompts.length,
            prompts
          }
        });
      } catch (error) {
        runtimeChecks.push({
          name: "mcp_prompts",
          status: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } catch (error) {
    runtimeChecks.push({
      name: "mcp_connect",
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      details: mcpConnectErrorDetails(error, configs)
    });
  }

  const finalization = await finalizeMcpDiagnosticRuntime(runtime);
  applyMcpDiagnosticRuntimeCleanup(
    runtimeChecks,
    "mcp_connect",
    finalization
  );
  checks.push(...runtimeChecks);
}

async function runMcpRuntimeDiagnostic(
  options: Pick<InspectMcpConfigOptions, "environ" | "cwd">,
  operationName: string,
  operation: (runtime: SdkMcpStdioRuntime) => Promise<Omit<McpDiagnosticCheck, "name">>
): Promise<McpDiagnosticReport> {
  const checks: McpDiagnosticCheck[] = [];
  let configs: McpServerConfig[];
  let source = "none";
  let configFile: string | undefined;

  try {
    const loaded = await loadMcpServerConfigs({
      environ: options.environ,
      cwd: options.cwd
    });
    configs = loaded.configs;
    source = loaded.source;
    configFile = loaded.filePath;
  } catch (error) {
    checks.push({
      name: "mcp_config",
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    });
    return report(checks);
  }

  checks.push({
    name: "mcp_config",
    status: "ok",
    message: configs.length === 0
      ? "no MCP servers configured"
      : `${configs.length} MCP server(s) configured from ${source}`,
    details: {
      source,
      ...(configFile ? { config_file: configFile } : {}),
      servers: configs.map(sanitizeConfig)
    }
  });

  if (configs.length === 0) {
    checks.push({
      name: operationName,
      status: "error",
      message: "no MCP servers configured"
    });
    return report(checks);
  }

  const runtime = new SdkMcpStdioRuntime(configs);
  const runtimeChecks: McpDiagnosticCheck[] = [];
  let connected = false;
  try {
    await runtime.connect();
    connected = true;
    runtimeChecks.push({
      name: "mcp_connect",
      status: "ok",
      message: `${configs.length} MCP server(s) connected`
    });
    runtimeChecks.push({
      name: operationName,
      ...(await operation(runtime))
    });
  } catch (error) {
    runtimeChecks.push({
      name: connected ? operationName : "mcp_connect",
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      details: connected ? undefined : mcpConnectErrorDetails(error, configs)
    });
  }

  const finalization = await finalizeMcpDiagnosticRuntime(runtime);
  applyMcpDiagnosticRuntimeCleanup(
    runtimeChecks,
    operationName,
    finalization
  );
  checks.push(...runtimeChecks);

  return report(checks);
}

function report(checks: McpDiagnosticCheck[]): McpDiagnosticReport {
  return {
    ok: checks.every((check) => check.status !== "error"),
    checks
  };
}

async function finalizeMcpDiagnosticRuntime(
  runtime: SdkMcpStdioRuntime
): Promise<McpDiagnosticRuntimeFinalizationOutcome> {
  const [settlement] = await Promise.allSettled([
    invokeMcpDiagnosticFinalizer(() => runtime.close())
  ]);
  return settlement.status === "rejected" ? { ok: false } : { ok: true };
}

function applyMcpDiagnosticRuntimeCleanup(
  checks: McpDiagnosticCheck[],
  ownerName: string,
  finalization: McpDiagnosticRuntimeFinalizationOutcome
): void {
  if (finalization.ok || checks.some((check) => check.status === "error")) {
    return;
  }
  const ownerIndex = checks.findIndex((check) => check.name === ownerName);
  const cleanupDiagnostic: McpDiagnosticCheck = {
    name: ownerName,
    status: "error",
    message: MCP_RUNTIME_CLEANUP_FAILURE_MESSAGE
  };
  if (ownerIndex === -1) {
    checks.push(cleanupDiagnostic);
    return;
  }
  checks[ownerIndex] = cleanupDiagnostic;
}

function invokeMcpDiagnosticFinalizer(
  finalizer: () => void | Promise<void>
): Promise<void> {
  try {
    return Promise.resolve(finalizer());
  } catch (error) {
    return Promise.reject(error);
  }
}

function sanitizeConfig(config: McpServerConfig): SanitizedMcpServerConfig {
  if (!isStdioMcpServerConfig(config)) {
    return {
      id: config.id,
      transport: config.transport,
      url: config.url,
      header_keys: Object.keys(config.headers ?? {}).sort(),
      header_env_keys: Object.keys(config.headerEnv ?? {}).sort(),
      bearer_token_env: config.bearerTokenEnv
    };
  }

  return {
    id: config.id,
    transport: "stdio",
    command: config.command,
    args_count: config.args?.length ?? 0,
    cwd: config.cwd,
    env_keys: Object.keys(config.env ?? {}).sort()
  };
}

function sanitizeContextEntry(entry: {
  type: "resource" | "prompt";
  uri?: string;
  name?: string;
  arguments?: Record<string, string>;
  serverId?: string;
}): Record<string, unknown> {
  return {
    type: entry.type,
    ...(entry.uri ? { uri: entry.uri } : {}),
    ...(entry.name ? { name: entry.name } : {}),
    ...(entry.serverId ? { server_id: entry.serverId } : {}),
    ...(entry.arguments ? { argument_keys: Object.keys(entry.arguments).sort() } : {})
  };
}

function sanitizeContextLimits(limits: {
  maxEntryChars?: number;
  maxTotalChars?: number;
  dedupe?: boolean;
}): Record<string, unknown> {
  return {
    dedupe: limits.dedupe !== false,
    ...(limits.maxEntryChars !== undefined ? { max_entry_chars: limits.maxEntryChars } : {}),
    ...(limits.maxTotalChars !== undefined ? { max_total_chars: limits.maxTotalChars } : {})
  };
}

function sanitizeTool(tool: ToolCatalogEntry): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema
  };
}

function mcpConnectErrorDetails(
  error: unknown,
  configs: McpServerConfig[]
): Record<string, unknown> | undefined {
  if (!(error instanceof McpRuntimeDiagnosticError)) {
    return undefined;
  }

  const matchedConfig = configs.find((config) => config.id === error.details.server_id);
  return {
    error_code: error.details.code,
    server_id: error.details.server_id,
    ...(error.details.cause_message ? { cause_message: error.details.cause_message } : {}),
    ...(error.details.tool_name ? { tool_name: error.details.tool_name } : {}),
    ...(error.details.original_tool_name ? { original_tool_name: error.details.original_tool_name } : {}),
    ...(matchedConfig ? { server: sanitizeConfig(matchedConfig) } : {})
  };
}

function renderMcpDetails(lines: string[], details: unknown): void {
  if (!isRecord(details)) {
    return;
  }
  const errorCode = stringValue(details.error_code);
  if (errorCode) {
    lines.push(
      [
        `  error_code=${errorCode}`,
        `server=${stringValue(details.server_id) || "-"}`,
        `tool=${stringValue(details.tool_name) || "-"}`,
        `cause="${stringValue(details.cause_message)}"`
      ].join("  ")
    );
  }
  const source = stringValue(details.source);
  const configFile = stringValue(details.config_file);
  if (source) {
    lines.push(`  source=${source}${configFile ? `  config_file=${configFile}` : ""}`);
  }
  const servers = details.servers;
  if (Array.isArray(servers)) {
    for (const server of servers) {
      if (!isRecord(server)) {
        continue;
      }
      lines.push(
        [
          `  - server=${stringValue(server.id)}`,
          `transport=${stringValue(server.transport) || "stdio"}`,
          ...renderSanitizedServerParts(server)
        ].join("  ")
      );
    }
  }

  const contextEntries = details.entries;
  if (Array.isArray(contextEntries) && typeof details.entry_count === "number") {
    lines.push(
      [
        `  context_entries=${numberValue(details.entry_count)}`,
        `messages=${numberValue(details.message_count)}`,
        `requested_entries=${numberValue(details.requested_entry_count)}`,
        `skipped_duplicates=${numberValue(details.skipped_duplicate_count)}`,
        `truncated_messages=${numberValue(details.truncated_message_count)}`,
        `skipped_messages=${numberValue(details.skipped_message_count)}`,
        `content_chars=${numberValue(details.content_chars)}`
      ].join("  ")
    );
  }
  const contextLimits = details.limits;
  if (isRecord(contextLimits)) {
    lines.push(
      [
        `  context_limits_dedupe=${booleanValue(contextLimits.dedupe)}`,
        `max_entry_chars=${numberValue(contextLimits.max_entry_chars) || "-"}`,
        `max_total_chars=${numberValue(contextLimits.max_total_chars) || "-"}`
      ].join("  ")
    );
  }
  if (Array.isArray(contextEntries)) {
    for (const entry of contextEntries) {
      if (isRecord(entry) && typeof entry.type === "string") {
        lines.push(
          [
            `  - context=${stringValue(entry.type)}`,
            `server=${stringValue(entry.server_id) || "-"}`,
            `uri=${stringValue(entry.uri) || "-"}`,
            `name=${stringValue(entry.name) || "-"}`,
            `argument_keys=${arrayLength(entry.argument_keys)}`
          ].join("  ")
        );
      }
    }
  }
  const contextMessages = details.messages;
  if (Array.isArray(contextMessages)) {
    for (const message of contextMessages) {
      if (isRecord(message)) {
        lines.push(
          [
            `  - context_message=${numberValue(message.index)}`,
            `kind=${stringValue(message.kind) || "-"}`,
            `role=${stringValue(message.role) || "-"}`,
            `chars=${numberValue(message.content_chars)}`,
            `truncated=${booleanValue(message.truncated)}`,
            `truncated_by=${stringValue(message.truncated_by) || "-"}`
          ].join("  ")
        );
        const content = stringValue(message.content);
        if (content) {
          lines.push(`    content="${previewText(content)}"`);
        }
      }
    }
  }

  const server = details.server;
  if (isRecord(server)) {
    lines.push(
      [
        `  failed_server=${stringValue(server.id)}`,
        `transport=${stringValue(server.transport) || "stdio"}`,
        ...renderSanitizedServerParts(server)
      ].join("  ")
    );
  }

  const tools = details.tools;
  if (Array.isArray(tools)) {
    for (const tool of tools) {
      if (isRecord(tool)) {
        lines.push(
          [
            `  - tool=${stringValue(tool.name)}`,
            `description="${stringValue(tool.description)}"`,
            `schema=${describeToolInputSchema(tool.input_schema)}`
          ].join("  ")
        );
      }
    }
  }

  const resources = details.resources;
  if (Array.isArray(resources)) {
    for (const resource of resources) {
      if (isRecord(resource)) {
        lines.push(
          [
            `  - resource=${stringValue(resource.uri)}`,
            `server=${stringValue(resource.server_id)}`,
            `name="${stringValue(resource.name)}"`,
            `mime_type=${stringValue(resource.mime_type) || "-"}`
          ].join("  ")
        );
      }
    }
  }

  const prompts = details.prompts;
  if (Array.isArray(prompts)) {
    for (const prompt of prompts) {
      if (isRecord(prompt)) {
        lines.push(
          [
            `  - prompt=${stringValue(prompt.name)}`,
            `server=${stringValue(prompt.server_id)}`,
            `description="${stringValue(prompt.description)}"`,
            `arguments=${arrayLength(prompt.arguments)}`
          ].join("  ")
        );
      }
    }
  }

  const resourceTemplates = details.resource_templates;
  if (Array.isArray(resourceTemplates)) {
    for (const resourceTemplate of resourceTemplates) {
      if (isRecord(resourceTemplate)) {
        lines.push(
          [
            `  - resource_template=${stringValue(resourceTemplate.uri_template)}`,
            `server=${stringValue(resourceTemplate.server_id)}`,
            `name="${stringValue(resourceTemplate.name)}"`,
            `mime_type=${stringValue(resourceTemplate.mime_type) || "-"}`
          ].join("  ")
        );
      }
    }
  }

  const contents = details.contents;
  if (Array.isArray(contents)) {
    for (const content of contents) {
      if (isRecord(content)) {
        lines.push(
          [
            `  - content=${stringValue(content.uri)}`,
            `mime_type=${stringValue(content.mime_type) || "-"}`,
            `type=${contentKind(content)}`,
            `chars=${stringLength(content.text)}`,
            `blob_chars=${stringLength(content.blob)}`
          ].join("  ")
        );
        const text = stringValue(content.text);
        if (text) {
          lines.push(`    text="${previewText(text)}"`);
        }
      }
    }
  }

  const subscribed = details.subscribed;
  const uri = stringValue(details.uri);
  const serverId = stringValue(details.server_id);
  if (typeof subscribed === "boolean" && uri) {
    lines.push(`  resource=${uri}  server=${serverId || "-"}  subscribed=${subscribed}`);
  }

  const updated = details.updated;
  const timedOut = details.timed_out;
  if (typeof updated === "boolean" && typeof timedOut === "boolean" && uri) {
    lines.push(
      [
        `  resource_update=${uri}`,
        `server=${serverId || "-"}`,
        `updated=${updated}`,
        `timed_out=${timedOut}`,
        `timeout_ms=${numberValue(details.timeout_ms)}`,
        `notification_uri=${stringValue(details.notification_uri) || "-"}`
      ].join("  ")
    );
  }

  const updates = details.updates;
  const subscriptions = details.subscriptions;
  const loopUris = details.uris;
  const renderedLoop = Array.isArray(updates) && Array.isArray(subscriptions) && Array.isArray(loopUris);
  if (renderedLoop) {
    lines.push(
      [
        `  resource_update_loop=${loopUris.filter((value): value is string => typeof value === "string").join(",") || "-"}`,
        `servers=${arrayLength(details.server_ids)}`,
        `subscriptions=${numberValue(details.subscription_count)}`,
        `events=${numberValue(details.event_count)}`,
        `max_events=${numberValue(details.max_events)}`,
        `timed_out=${booleanValue(details.timed_out)}`,
        `timeout_ms=${numberValue(details.timeout_ms)}`
      ].join("  ")
    );
    for (const subscription of subscriptions) {
      if (isRecord(subscription)) {
        lines.push(
          [
            `    - subscription_uri=${stringValue(subscription.uri) || "-"}`,
            `server=${stringValue(subscription.server_id) || "-"}`,
            `subscribed=${booleanValue(subscription.subscribed)}`
          ].join("  ")
        );
      }
    }
    for (const update of updates) {
      if (isRecord(update)) {
        lines.push(
          [
            `    - notification_uri=${stringValue(update.uri) || "-"}`,
            `server=${stringValue(update.server_id) || "-"}`,
            `index=${numberValue(update.index)}`
          ].join("  ")
        );
      }
    }
  }
  if (Array.isArray(updates) && !renderedLoop) {
    lines.push(
      [
        `  resource_update_watch=${uri || "-"}`,
        `server=${serverId || "-"}`,
        `events=${numberValue(details.event_count)}`,
        `max_events=${numberValue(details.max_events)}`,
        `timed_out=${booleanValue(details.timed_out)}`,
        `timeout_ms=${numberValue(details.timeout_ms)}`
      ].join("  ")
    );
    for (const update of updates) {
      if (isRecord(update)) {
        lines.push(`    - notification_uri=${stringValue(update.uri) || "-"}`);
      }
    }
  }

  const values = details.values;
  if (Array.isArray(values)) {
    lines.push(
      [
        `  completion_ref=${stringValue(details.ref)}`,
        `type=${stringValue(details.ref_type) || "-"}`,
        `server=${stringValue(details.server_id) || "-"}`,
        `values=${values.length}`,
        `total=${numberValue(details.total)}`,
        `has_more=${booleanValue(details.has_more)}`
      ].join("  ")
    );
    for (const value of values) {
      if (typeof value === "string") {
        lines.push(`    - ${value}`);
      }
    }
  }

  const messages = details.messages;
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (!isRecord(message) || !isRecord(message.content)) {
        continue;
      }
      const content = message.content;
      lines.push(
        [
          `  - message role=${stringValue(message.role)}`,
          `type=${stringValue(content.type) || "unknown"}`,
          `mime_type=${stringValue(content.mime_type) || "-"}`
        ].join("  ")
      );
      const text = stringValue(content.text);
      if (text) {
        lines.push(`    text="${previewText(text)}"`);
      }
    }
  }
}

function findMcpCompletionDetails(reportValue: McpDiagnosticReport): Record<string, unknown> | undefined {
  for (const check of reportValue.checks) {
    if (
      (check.name === "mcp_complete_prompt" || check.name === "mcp_complete_resource_template") &&
      isRecord(check.details)
    ) {
      return check.details;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringLength(value: unknown): number {
  return typeof value === "string" ? value.length : 0;
}

function contentKind(content: Record<string, unknown>): string {
  if (typeof content.text === "string") {
    return "text";
  }
  if (typeof content.blob === "string") {
    return "blob";
  }
  return "unknown";
}

function previewText(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function renderSanitizedServerParts(server: Record<string, unknown>): string[] {
  if (stringValue(server.transport) === "streamable-http" || stringValue(server.transport) === "sse") {
    return [
      `url=${stringValue(server.url)}`,
      `header_keys=${arrayLength(server.header_keys)}`,
      `header_env_keys=${arrayLength(server.header_env_keys)}`,
      `bearer_token_env=${stringValue(server.bearer_token_env) || "-"}`
    ];
  }
  return [
    `command=${stringValue(server.command)}`,
    `args=${numberValue(server.args_count)}`,
    `cwd=${stringValue(server.cwd) || "-"}`,
    `env_keys=${arrayLength(server.env_keys)}`
  ];
}

function describeToolInputSchema(value: unknown): string {
  if (!isRecord(value)) {
    return "<not declared>";
  }

  const type = stringValue(value.type) || "unknown";
  const properties = isRecord(value.properties) ? Object.keys(value.properties).sort() : [];
  const required = Array.isArray(value.required)
    ? value.required.filter((item): item is string => typeof item === "string").sort()
    : [];

  return [
    `type=${type}`,
    `required=${required.length > 0 ? required.join(",") : "-"}`,
    `properties=${properties.length > 0 ? properties.join(",") : "-"}`
  ].join(" ");
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function booleanValue(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}
