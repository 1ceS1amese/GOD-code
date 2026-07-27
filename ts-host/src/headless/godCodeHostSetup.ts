import type { AuditSink } from "../audit/auditSink.js";
import { createConfiguredAuditSink } from "../audit/config.js";
import type { HostToolRegistry } from "../host_tools/registry.js";
import { createDefaultHostToolRegistry } from "../host_tools/registry.js";
import { loadMcpServerConfigs } from "../mcp/config.js";
import { buildMcpContextMessages, loadMcpContextBuildOptions, loadMcpContextConfig } from "../mcp/context.js";
import { registerMcpToolsWithHostRegistry } from "../mcp/registry.js";
import { SdkMcpStdioRuntime } from "../mcp/runtime.js";
import {
  PromptingPermissionPolicy,
  resolveToolApprovalMode,
  type ToolApprovalMode,
  type ToolApprovalPrompt
} from "../policy/approval.js";
import { DefaultPermissionPolicy } from "../policy/defaultPolicy.js";
import { loadPluginRuntimeConfig } from "../plugins/config.js";
import { PluginSkillRuntime } from "../plugins/runtime.js";
import type {
  AssistantMessage,
  CreateSessionRequest,
  InitializeRequest,
  ModelHistoryMessage,
  ToolCatalogEntry
} from "../types/godCodeProtocol.js";
import { GOD_CODE_PROTOCOL_VERSION } from "../types/godCodeProtocol.js";

export const GOD_CODE_DEFAULT_TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: "Read",
    description: "Read a UTF-8 text file from the host filesystem.",
    input_schema: objectSchema({ path: "string" }, ["path"])
  },
  {
    name: "Edit",
    description: "Apply a literal string replacement to a UTF-8 text file.",
    input_schema: objectSchema(
      { path: "string", find: "string", replace: "string" },
      ["path", "find", "replace"]
    )
  },
  {
    name: "Bash",
    description: "Run a shell command on the host via bash -lc.",
    input_schema: objectSchema(
      { command: "string", cwd: "string", timeout_ms: "integer" },
      ["command"]
    )
  },
  {
    name: "ListFiles",
    description: "List files and directories from the host filesystem.",
    input_schema: objectSchema(
      { path: "string", recursive: "boolean", max_entries: "integer" },
      ["path"]
    )
  },
  {
    name: "Search",
    description: "Search UTF-8 text files with literal string matching.",
    input_schema: objectSchema(
      { path: "string", pattern: "string", recursive: "boolean", max_matches: "integer" },
      ["path", "pattern"]
    )
  },
  {
    name: "Write",
    description: "Write a UTF-8 text file on the host filesystem.",
    input_schema: objectSchema(
      { path: "string", content: "string", overwrite: "boolean" },
      ["path", "content"]
    )
  }
];

export interface PreparedGodCodeHost {
  registry: HostToolRegistry;
  toolCatalog: ToolCatalogEntry[];
  initialMessages: ModelHistoryMessage[];
  close(): Promise<void>;
}

export interface PrepareGodCodeHostOptions {
  approvalMode?: ToolApprovalMode;
  approvalPrompt?: ToolApprovalPrompt;
  auditSink?: AuditSink;
}

export async function prepareGodCodeHost(
  options: PrepareGodCodeHostOptions = {}
): Promise<PreparedGodCodeHost> {
  const approvalMode = resolveToolApprovalMode(options.approvalMode);
  const registry = createDefaultHostToolRegistry({
    auditSink: options.auditSink ?? createConfiguredAuditSink(),
    ...(approvalMode === "prompt"
      ? {
          approvalPrompt: options.approvalPrompt,
          permissionPolicy: new PromptingPermissionPolicy(new DefaultPermissionPolicy())
        }
      : {})
  });
  let mcpRuntime: SdkMcpStdioRuntime | undefined;
  let pluginRuntime: PluginSkillRuntime | undefined;
  try {
    mcpRuntime = await createConfiguredMcpRuntime();
    pluginRuntime = await createConfiguredPluginRuntime();
    const toolCatalog = await prepareHostToolCatalog(registry, mcpRuntime, pluginRuntime);
    const initialMessages = await prepareMcpContextMessages(mcpRuntime);
    let closeSettlement: Promise<void> | undefined;

    return {
      registry,
      toolCatalog,
      initialMessages,
      close(): Promise<void> {
        closeSettlement ??= closePreparedHostRuntimes(pluginRuntime, mcpRuntime);
        return closeSettlement;
      }
    };
  } catch (error) {
    await closePreparedHostRuntimes(pluginRuntime, mcpRuntime);
    throw error;
  }
}

export function buildGodCodeInitializeRequest(mode: string = "headless"): InitializeRequest {
  return {
    protocol_version: GOD_CODE_PROTOCOL_VERSION,
    host_info: {
      name: "god-code-ts-host",
      version: "0.1.0"
    },
    capabilities: {
      mode,
      tools: GOD_CODE_DEFAULT_TOOL_CATALOG.map((tool) => tool.name)
    }
  };
}

export function buildGodCodeCreateSessionRequest(
  sessionId: string,
  cwd: string,
  toolCatalog: ToolCatalogEntry[],
  modelAdapter: string = "fake",
  initialMessages?: ModelHistoryMessage[]
): CreateSessionRequest {
  const request: CreateSessionRequest = {
    session_id: sessionId,
    cwd,
    tool_catalog: toolCatalog,
    model_adapter: modelAdapter
  };
  if (initialMessages && initialMessages.length > 0) {
    request.initial_messages = initialMessages;
  }
  return request;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function asAssistantMessage(value: unknown): AssistantMessage | undefined {
  const record = asRecord(value);
  if (!record || typeof record.role !== "string" || typeof record.content !== "string") {
    return undefined;
  }
  return {
    role: record.role as "assistant",
    content: record.content
  };
}

async function createConfiguredMcpRuntime(): Promise<SdkMcpStdioRuntime | undefined> {
  const { configs } = await loadMcpServerConfigs();
  if (configs.length === 0) {
    return undefined;
  }
  return new SdkMcpStdioRuntime(configs);
}

async function createConfiguredPluginRuntime(): Promise<PluginSkillRuntime | undefined> {
  const { config } = await loadPluginRuntimeConfig();
  if (config.pluginDirs.length === 0) {
    return undefined;
  }
  return new PluginSkillRuntime(config);
}

async function prepareHostToolCatalog(
  registry: HostToolRegistry,
  mcpRuntime: SdkMcpStdioRuntime | undefined,
  pluginRuntime: PluginSkillRuntime | undefined
): Promise<ToolCatalogEntry[]> {
  const catalog = [...GOD_CODE_DEFAULT_TOOL_CATALOG];

  if (mcpRuntime) {
    await mcpRuntime.connect();
    await registerMcpToolsWithHostRegistry(mcpRuntime, registry);
    catalog.push(...(await mcpRuntime.listTools()));
  }

  if (pluginRuntime) {
    await pluginRuntime.load();
    const pluginTools = pluginRuntime.listTools();
    assertUniqueToolNames([...catalog, ...pluginTools]);
    pluginRuntime.registerToolsWithHostRegistry(registry);
    catalog.push(...pluginTools);
  }

  return catalog;
}

async function prepareMcpContextMessages(
  mcpRuntime: SdkMcpStdioRuntime | undefined
): Promise<ModelHistoryMessage[]> {
  const { entries } = await loadMcpContextConfig();
  if (entries.length === 0) {
    return [];
  }
  if (!mcpRuntime) {
    throw new Error("GOD_CODE_MCP_CONTEXT requires at least one configured MCP server.");
  }
  const context = await buildMcpContextMessages(mcpRuntime, entries, loadMcpContextBuildOptions());
  return context.messages;
}

async function closePreparedHostRuntimes(
  pluginRuntime: PluginSkillRuntime | undefined,
  mcpRuntime: SdkMcpStdioRuntime | undefined
): Promise<void> {
  const runtimes = [pluginRuntime, mcpRuntime].filter(
    (runtime): runtime is PluginSkillRuntime | SdkMcpStdioRuntime => runtime !== undefined
  );
  await Promise.allSettled(
    runtimes.map((runtime) => Promise.resolve().then(() => runtime.close()))
  );
}

function objectSchema(properties: Record<string, string>, required: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(properties).map(([name, type]) => [name, { type }])
    ),
    required,
    additionalProperties: false
  };
}

function assertUniqueToolNames(tools: ToolCatalogEntry[]): void {
  const seen = new Set<string>();
  for (const tool of tools) {
    if (seen.has(tool.name)) {
      throw new Error(`Duplicate host tool name: ${tool.name}`);
    }
    seen.add(tool.name);
  }
}
