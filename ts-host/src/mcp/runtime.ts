import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  ResourceUpdatedNotificationSchema,
  type ContentBlock,
  type Prompt,
  type PromptMessage,
  type Resource,
  type ResourceContents,
  type ResourceTemplate,
  type Tool
} from "@modelcontextprotocol/sdk/types.js";
import type { HostToolContext } from "../host_tools/common.js";
import { toolError } from "../host_tools/common.js";
import type { ToolCatalogEntry, ToolExecutionResult } from "../types/godCodeProtocol.js";
import { isRecord } from "../types/godCodeProtocol.js";
import { isStdioMcpServerConfig, type McpServerConfig } from "./config.js";
import type { McpToolRegistry } from "./registry.js";

const DEFAULT_RESOURCE_UPDATE_TIMEOUT_MS = 1000;
const DEFAULT_RESOURCE_UPDATE_MAX_EVENTS = 3;
const MCP_RUNTIME_CLOSE_SETTLEMENT_TIMEOUT_MS = 5_000;

export interface McpRuntime extends McpToolRegistry {
  connect(): Promise<void>;
  listResources(): Promise<McpRuntimeResource[]>;
  listResourceTemplates(): Promise<McpRuntimeResourceTemplate[]>;
  listPrompts(): Promise<McpRuntimePrompt[]>;
  readResource(uri: string, options?: { serverId?: string }): Promise<McpRuntimeResourceRead>;
  subscribeResource(uri: string, options?: { serverId?: string }): Promise<McpRuntimeResourceSubscription>;
  unsubscribeResource(uri: string, options?: { serverId?: string }): Promise<McpRuntimeResourceSubscription>;
  waitForResourceUpdate(
    uri: string,
    options?: { serverId?: string; timeoutMs?: number }
  ): Promise<McpRuntimeResourceUpdate>;
  watchResourceUpdates(
    uri: string,
    options?: { serverId?: string; timeoutMs?: number; maxEvents?: number }
  ): Promise<McpRuntimeResourceUpdateWatch>;
  loopResourceUpdates(
    uris: string[],
    options?: { serverId?: string; timeoutMs?: number; maxEvents?: number }
  ): Promise<McpRuntimeResourceUpdateLoop>;
  completePrompt(
    name: string,
    argument: McpRuntimeCompletionArgument,
    options?: { context?: Record<string, string>; serverId?: string }
  ): Promise<McpRuntimeCompletion>;
  completeResourceTemplate(
    uriTemplate: string,
    argument: McpRuntimeCompletionArgument,
    options?: { context?: Record<string, string>; serverId?: string }
  ): Promise<McpRuntimeCompletion>;
  getPrompt(
    name: string,
    args?: Record<string, string>,
    options?: { serverId?: string }
  ): Promise<McpRuntimePromptGet>;
  close(): Promise<void>;
}

export interface McpRuntimeResource {
  server_id: string;
  uri: string;
  name: string;
  description?: string;
  mime_type?: string;
  size?: number;
}

export interface McpRuntimeResourceTemplate {
  server_id: string;
  uri_template: string;
  name: string;
  description?: string;
  mime_type?: string;
}

export interface McpRuntimePrompt {
  server_id: string;
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface McpRuntimeResourceRead {
  server_id: string;
  uri: string;
  contents: McpRuntimeResourceContent[];
}

export interface McpRuntimeResourceSubscription {
  server_id: string;
  uri: string;
  subscribed: boolean;
}

export interface McpRuntimeResourceUpdate {
  server_id: string;
  uri: string;
  updated: boolean;
  timed_out: boolean;
  timeout_ms: number;
  notification_uri?: string;
}

export interface McpRuntimeResourceUpdateWatch {
  server_id: string;
  uri: string;
  event_count: number;
  max_events: number;
  timed_out: boolean;
  timeout_ms: number;
  updates: McpRuntimeResourceUpdateEvent[];
}

export interface McpRuntimeResourceUpdateLoop {
  server_ids: string[];
  uris: string[];
  subscription_count: number;
  event_count: number;
  max_events: number;
  timed_out: boolean;
  timeout_ms: number;
  subscriptions: McpRuntimeResourceUpdateLoopSubscription[];
  updates: McpRuntimeResourceUpdateLoopEvent[];
}

export interface McpRuntimeResourceUpdateLoopSubscription {
  server_id: string;
  uri: string;
  subscribed: boolean;
}

export interface McpRuntimeResourceUpdateLoopEvent {
  index: number;
  server_id: string;
  uri: string;
}

export interface McpRuntimeResourceUpdateEvent {
  uri: string;
}

export interface McpRuntimeCompletionArgument {
  name: string;
  value: string;
}

export interface McpRuntimeCompletion {
  server_id: string;
  ref_type: "prompt" | "resource_template";
  ref: string;
  argument: McpRuntimeCompletionArgument;
  values: string[];
  total?: number;
  has_more?: boolean;
}

export interface McpRuntimeResourceContent {
  uri: string;
  mime_type?: string;
  text?: string;
  blob?: string;
}

export interface McpRuntimePromptGet {
  server_id: string;
  name: string;
  description?: string;
  messages: McpRuntimePromptMessage[];
}

export interface McpRuntimePromptMessage {
  role: "user" | "assistant";
  content: McpRuntimePromptContent;
}

export interface McpRuntimePromptContent {
  type: string;
  text?: string;
  data?: string;
  uri?: string;
  name?: string;
  description?: string;
  mime_type?: string;
  resource?: McpRuntimeResourceContent;
}

export type McpRuntimeDiagnosticCode =
  | "connect_failed"
  | "list_tools_failed"
  | "duplicate_tool_name";

export interface McpRuntimeDiagnosticDetails {
  code: McpRuntimeDiagnosticCode;
  server_id: string;
  cause_message?: string;
  tool_name?: string;
  original_tool_name?: string;
}

export class McpRuntimeDiagnosticError extends Error {
  public readonly details: McpRuntimeDiagnosticDetails;

  public constructor(message: string, details: McpRuntimeDiagnosticDetails) {
    super(message);
    this.name = "McpRuntimeDiagnosticError";
    this.details = details;
  }
}

interface ConnectedMcpServer {
  id: string;
  client: Client;
  transport: Transport;
}

interface McpRuntimeClosableResource {
  close(): Promise<void> | void;
}

interface RuntimeMcpTool {
  entry: ToolCatalogEntry;
  server: ConnectedMcpServer;
  originalName: string;
}

export class SdkMcpStdioRuntime implements McpRuntime {
  private readonly configs: McpServerConfig[];
  private readonly servers: ConnectedMcpServer[] = [];
  private readonly tools = new Map<string, RuntimeMcpTool>();
  private closeSettlement?: Promise<void>;

  public constructor(configs: McpServerConfig[]) {
    this.configs = configs.map((config) => {
      if (isStdioMcpServerConfig(config)) {
        return {
          ...config,
          args: config.args ? [...config.args] : undefined,
          env: config.env ? { ...config.env } : undefined
        };
      }
      return {
        ...config,
        headers: config.headers ? { ...config.headers } : undefined,
        headerEnv: config.headerEnv ? { ...config.headerEnv } : undefined,
        bearerTokenEnv: config.bearerTokenEnv
      };
    });
  }

  public async connect(): Promise<void> {
    await this.close();
    try {
      for (const config of this.configs) {
        let server: ConnectedMcpServer;
        try {
          server = await this.connectServer(config);
        } catch (error) {
          throw mcpRuntimeDiagnosticError("connect_failed", config.id, error);
        }
        this.servers.push(server);
        try {
          await this.loadServerTools(server);
        } catch (error) {
          if (error instanceof McpRuntimeDiagnosticError) {
            throw error;
          }
          throw mcpRuntimeDiagnosticError("list_tools_failed", config.id, error);
        }
      }
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  public async listTools(): Promise<ToolCatalogEntry[]> {
    return [...this.tools.values()].map((tool) => ({ ...tool.entry }));
  }

  public async listResources(): Promise<McpRuntimeResource[]> {
    const resources: McpRuntimeResource[] = [];
    for (const server of this.servers) {
      const result = await server.client.listResources();
      for (const resource of result.resources) {
        resources.push(mcpResourceToDiagnostic(server.id, resource));
      }
    }
    return resources;
  }

  public async listResourceTemplates(): Promise<McpRuntimeResourceTemplate[]> {
    const resourceTemplates: McpRuntimeResourceTemplate[] = [];
    for (const server of this.servers) {
      const result = await server.client.listResourceTemplates();
      for (const resourceTemplate of result.resourceTemplates) {
        resourceTemplates.push(mcpResourceTemplateToDiagnostic(server.id, resourceTemplate));
      }
    }
    return resourceTemplates;
  }

  public async listPrompts(): Promise<McpRuntimePrompt[]> {
    const prompts: McpRuntimePrompt[] = [];
    for (const server of this.servers) {
      const result = await server.client.listPrompts();
      for (const prompt of result.prompts) {
        prompts.push(mcpPromptToDiagnostic(server.id, prompt));
      }
    }
    return prompts;
  }

  public async readResource(uri: string, options: { serverId?: string } = {}): Promise<McpRuntimeResourceRead> {
    const server = await this.resolveResourceServer(uri, options.serverId);
    const result = await server.client.readResource({ uri });
    return {
      server_id: server.id,
      uri,
      contents: result.contents.map(mcpResourceContentToDiagnostic)
    };
  }

  public async subscribeResource(
    uri: string,
    options: { serverId?: string } = {}
  ): Promise<McpRuntimeResourceSubscription> {
    const server = await this.resolveResourceServer(uri, options.serverId);
    await server.client.subscribeResource({ uri });
    return {
      server_id: server.id,
      uri,
      subscribed: true
    };
  }

  public async unsubscribeResource(
    uri: string,
    options: { serverId?: string } = {}
  ): Promise<McpRuntimeResourceSubscription> {
    const server = await this.resolveResourceServer(uri, options.serverId);
    await server.client.unsubscribeResource({ uri });
    return {
      server_id: server.id,
      uri,
      subscribed: false
    };
  }

  public async waitForResourceUpdate(
    uri: string,
    options: { serverId?: string; timeoutMs?: number } = {}
  ): Promise<McpRuntimeResourceUpdate> {
    const watch = await this.watchResourceUpdates(uri, {
      serverId: options.serverId,
      timeoutMs: options.timeoutMs,
      maxEvents: 1
    });
    const notificationUri = watch.updates[0]?.uri;
    return {
      server_id: watch.server_id,
      uri: watch.uri,
      updated: notificationUri !== undefined,
      timed_out: watch.timed_out,
      timeout_ms: watch.timeout_ms,
      ...(notificationUri !== undefined ? { notification_uri: notificationUri } : {})
    };
  }

  public async watchResourceUpdates(
    uri: string,
    options: { serverId?: string; timeoutMs?: number; maxEvents?: number } = {}
  ): Promise<McpRuntimeResourceUpdateWatch> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_RESOURCE_UPDATE_TIMEOUT_MS;
    const maxEvents = options.maxEvents ?? DEFAULT_RESOURCE_UPDATE_MAX_EVENTS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error("MCP resource update timeout must be a positive integer in milliseconds");
    }
    if (!Number.isInteger(maxEvents) || maxEvents <= 0) {
      throw new Error("MCP resource update max events must be a positive integer");
    }

    const server = await this.resolveResourceServer(uri, options.serverId);
    const updates: McpRuntimeResourceUpdateEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolveWatch: (timedOut: boolean) => void = () => undefined;
    const watchPromise = new Promise<boolean>((resolve) => {
      resolveWatch = resolve;
    });

    server.client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) => {
      if (notification.params.uri !== uri) {
        return;
      }
      updates.push({ uri: notification.params.uri });
      if (updates.length >= maxEvents) {
        resolveWatch(false);
      }
    });

    try {
      timer = setTimeout(() => resolveWatch(true), timeoutMs);
      await server.client.subscribeResource({ uri });
      const timedOut = await watchPromise;
      return {
        server_id: server.id,
        uri,
        event_count: updates.length,
        max_events: maxEvents,
        timed_out: timedOut,
        timeout_ms: timeoutMs,
        updates: updates.map((update) => ({ ...update }))
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      server.client.removeNotificationHandler("notifications/resources/updated");
      try {
        await server.client.unsubscribeResource({ uri });
      } catch {
        // This diagnostic command owns only a short-lived subscription; cleanup is best effort.
      }
    }
  }

  public async loopResourceUpdates(
    uris: string[],
    options: { serverId?: string; timeoutMs?: number; maxEvents?: number } = {}
  ): Promise<McpRuntimeResourceUpdateLoop> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_RESOURCE_UPDATE_TIMEOUT_MS;
    const maxEvents = options.maxEvents ?? DEFAULT_RESOURCE_UPDATE_MAX_EVENTS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error("MCP resource update loop timeout must be a positive integer in milliseconds");
    }
    if (!Number.isInteger(maxEvents) || maxEvents <= 0) {
      throw new Error("MCP resource update loop max events must be a positive integer");
    }
    const uniqueUris = [...new Set(uris)];
    if (uniqueUris.length === 0) {
      throw new Error("MCP resource update loop requires at least one resource URI");
    }

    const targets = new Map<string, { server: ConnectedMcpServer; uris: Set<string> }>();
    for (const uri of uniqueUris) {
      const server = await this.resolveResourceServer(uri, options.serverId);
      const target = targets.get(server.id) ?? { server, uris: new Set<string>() };
      target.uris.add(uri);
      targets.set(server.id, target);
    }

    const updates: McpRuntimeResourceUpdateLoopEvent[] = [];
    const subscriptions: McpRuntimeResourceUpdateLoopSubscription[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolveLoop: (timedOut: boolean) => void = () => undefined;
    const loopPromise = new Promise<boolean>((resolve) => {
      resolveLoop = resolve;
    });

    for (const target of targets.values()) {
      target.server.client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) => {
        if (!target.uris.has(notification.params.uri)) {
          return;
        }
        updates.push({
          index: updates.length,
          server_id: target.server.id,
          uri: notification.params.uri
        });
        if (updates.length >= maxEvents) {
          resolveLoop(false);
        }
      });
    }

    try {
      timer = setTimeout(() => resolveLoop(true), timeoutMs);
      for (const target of targets.values()) {
        for (const uri of target.uris) {
          await target.server.client.subscribeResource({ uri });
          subscriptions.push({
            server_id: target.server.id,
            uri,
            subscribed: true
          });
        }
      }
      const timedOut = await loopPromise;
      return {
        server_ids: [...targets.keys()],
        uris: uniqueUris,
        subscription_count: subscriptions.length,
        event_count: updates.length,
        max_events: maxEvents,
        timed_out: timedOut,
        timeout_ms: timeoutMs,
        subscriptions: subscriptions.map((subscription) => ({ ...subscription })),
        updates: updates.map((update) => ({ ...update }))
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      for (const target of targets.values()) {
        target.server.client.removeNotificationHandler("notifications/resources/updated");
      }
      for (const subscription of subscriptions) {
        try {
          const server = this.requireServer(subscription.server_id);
          await server.client.unsubscribeResource({ uri: subscription.uri });
        } catch {
          // The diagnostic loop owns only these temporary subscriptions; cleanup is best effort.
        }
      }
    }
  }

  public async completePrompt(
    name: string,
    argument: McpRuntimeCompletionArgument,
    options: { context?: Record<string, string>; serverId?: string } = {}
  ): Promise<McpRuntimeCompletion> {
    const server = await this.resolvePromptServer(name, options.serverId);
    const result = await server.client.complete({
      ref: {
        type: "ref/prompt",
        name
      },
      argument,
      ...(options.context ? { context: { arguments: options.context } } : {})
    });
    return mcpCompletionToDiagnostic(server.id, "prompt", name, argument, result.completion);
  }

  public async completeResourceTemplate(
    uriTemplate: string,
    argument: McpRuntimeCompletionArgument,
    options: { context?: Record<string, string>; serverId?: string } = {}
  ): Promise<McpRuntimeCompletion> {
    const server = await this.resolveResourceTemplateServer(uriTemplate, options.serverId);
    const result = await server.client.complete({
      ref: {
        type: "ref/resource",
        uri: uriTemplate
      },
      argument,
      ...(options.context ? { context: { arguments: options.context } } : {})
    });
    return mcpCompletionToDiagnostic(server.id, "resource_template", uriTemplate, argument, result.completion);
  }

  public async getPrompt(
    name: string,
    args?: Record<string, string>,
    options: { serverId?: string } = {}
  ): Promise<McpRuntimePromptGet> {
    const server = await this.resolvePromptServer(name, options.serverId);
    const result = await server.client.getPrompt({
      name,
      ...(args ? { arguments: args } : {})
    });
    return {
      server_id: server.id,
      name,
      ...(result.description ? { description: result.description } : {}),
      messages: result.messages.map(mcpPromptMessageToDiagnostic)
    };
  }

  public async executeTool(
    name: string,
    input: Record<string, unknown>,
    context: HostToolContext
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return toolError("unknown_mcp_tool", `Unknown MCP tool: ${name}`);
    }

    if (context.abortSignal?.aborted) {
      return toolError("tool_cancelled", `MCP tool was cancelled before execution: ${name}`, {
        tool_name: name
      });
    }

    try {
      const result = await tool.server.client.callTool({
        name: tool.originalName,
        arguments: input
      });
      return mcpResultToToolExecutionResult(name, result);
    } catch (error) {
      return toolError("mcp_tool_error", error instanceof Error ? error.message : String(error), {
        tool_name: name,
        server_id: tool.server.id
      });
    }
  }

  public close(): Promise<void> {
    this.tools.clear();
    if (this.closeSettlement !== undefined) {
      return this.closeSettlement;
    }
    const servers = this.servers.splice(0);
    const settlement = Promise.allSettled(
      servers.map((server) => closeConnectedMcpServer(server))
    ).then(() => undefined);
    let finalization!: Promise<void>;
    finalization = settlement.finally(() => {
      if (this.closeSettlement === finalization) {
        this.closeSettlement = undefined;
      }
    });
    this.closeSettlement = finalization;
    return finalization;
  }

  private async connectServer(config: McpServerConfig): Promise<ConnectedMcpServer> {
    const transport = mcpClientTransportForConfig(config);
    const client = new Client(
      {
        name: "god-code-ts-host",
        version: "0.1.0"
      },
      {
        capabilities: {}
      }
    );
    await client.connect(transport);
    return {
      id: config.id,
      client,
      transport
    };
  }

  private async loadServerTools(server: ConnectedMcpServer): Promise<void> {
    const result = await server.client.listTools();
    for (const tool of result.tools) {
      const entry = mcpToolToCatalogEntry(server.id, tool);
      if (this.tools.has(entry.name)) {
        throw new McpRuntimeDiagnosticError(`Duplicate MCP tool name: ${entry.name}`, {
          code: "duplicate_tool_name",
          server_id: server.id,
          tool_name: entry.name,
          original_tool_name: tool.name
        });
      }
      this.tools.set(entry.name, {
        entry,
        server,
        originalName: tool.name
      });
    }
  }

  private async resolveResourceServer(uri: string, serverId?: string): Promise<ConnectedMcpServer> {
    if (serverId) {
      return this.requireServer(serverId);
    }

    const matches: ConnectedMcpServer[] = [];
    for (const server of this.servers) {
      const result = await server.client.listResources();
      if (result.resources.some((resource) => resource.uri === uri)) {
        matches.push(server);
      }
    }
    if (matches.length === 0) {
      throw new Error(`MCP resource not found: ${uri}`);
    }
    if (matches.length > 1) {
      throw new Error(`MCP resource URI is ambiguous across servers: ${uri}; pass --server <server_id>`);
    }
    return matches[0]!;
  }

  private async resolvePromptServer(name: string, serverId?: string): Promise<ConnectedMcpServer> {
    if (serverId) {
      return this.requireServer(serverId);
    }

    const matches: ConnectedMcpServer[] = [];
    for (const server of this.servers) {
      const result = await server.client.listPrompts();
      if (result.prompts.some((prompt) => prompt.name === name)) {
        matches.push(server);
      }
    }
    if (matches.length === 0) {
      throw new Error(`MCP prompt not found: ${name}`);
    }
    if (matches.length > 1) {
      throw new Error(`MCP prompt name is ambiguous across servers: ${name}; pass --server <server_id>`);
    }
    return matches[0]!;
  }

  private async resolveResourceTemplateServer(uriTemplate: string, serverId?: string): Promise<ConnectedMcpServer> {
    if (serverId) {
      return this.requireServer(serverId);
    }

    const matches: ConnectedMcpServer[] = [];
    for (const server of this.servers) {
      const result = await server.client.listResourceTemplates();
      if (result.resourceTemplates.some((resourceTemplate) => resourceTemplate.uriTemplate === uriTemplate)) {
        matches.push(server);
      }
    }
    if (matches.length === 0) {
      throw new Error(`MCP resource template not found: ${uriTemplate}`);
    }
    if (matches.length > 1) {
      throw new Error(`MCP resource template is ambiguous across servers: ${uriTemplate}; pass --server <server_id>`);
    }
    return matches[0]!;
  }

  private requireServer(serverId: string): ConnectedMcpServer {
    const server = this.servers.find((candidate) => candidate.id === serverId);
    if (!server) {
      throw new Error(`Unknown MCP server: ${serverId}`);
    }
    return server;
  }
}

async function closeConnectedMcpServer(
  server: ConnectedMcpServer
): Promise<void> {
  let clientClosed = false;
  try {
    clientClosed = await settleMcpRuntimeResourceClose(server.client);
  } catch {
    // Cleanup remains best effort even if the settlement wrapper fails.
  }
  if (clientClosed) {
    return;
  }
  try {
    await settleMcpRuntimeResourceClose(server.transport);
  } catch {
    // Transport fallback is best effort during runtime cleanup.
  }
}

async function settleMcpRuntimeResourceClose(
  resource: McpRuntimeClosableResource
): Promise<boolean> {
  const closeSettlement = Promise.resolve()
    .then(() => resource.close())
    .then(
      () => ({ status: "fulfilled" as const }),
      () => ({ status: "failed" as const })
    );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutSettlement = new Promise<{ status: "timed_out" }>(
    (resolve) => {
      timeout = setTimeout(() => {
        resolve({ status: "timed_out" });
      }, MCP_RUNTIME_CLOSE_SETTLEMENT_TIMEOUT_MS);
    }
  );
  try {
    const settlement = await Promise.race([
      closeSettlement,
      timeoutSettlement
    ]);
    return settlement.status === "fulfilled";
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function mcpClientTransportForConfig(config: McpServerConfig): Transport {
  if (isStdioMcpServerConfig(config)) {
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      env: config.env ? { ...getDefaultEnvironment(), ...config.env } : undefined,
      stderr: "pipe"
    });
  }

  if (config.transport === "sse") {
    return new SSEClientTransport(new URL(config.url), {
      requestInit: {
        headers: config.headers
      }
    });
  }

  return new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: {
      headers: config.headers
    }
  });
}

function mcpRuntimeDiagnosticError(
  code: McpRuntimeDiagnosticCode,
  serverId: string,
  cause: unknown
): McpRuntimeDiagnosticError {
  const causeMessage = cause instanceof Error ? cause.message : String(cause);
  const label = code === "connect_failed" ? "connect" : "list tools";
  return new McpRuntimeDiagnosticError(`MCP server ${label} failed for ${serverId}: ${causeMessage}`, {
    code,
    server_id: serverId,
    cause_message: causeMessage
  });
}

function mcpToolToCatalogEntry(serverId: string, tool: Tool): ToolCatalogEntry {
  const entry: ToolCatalogEntry = {
    name: `mcp.${serverId}.${tool.name}`,
    description: tool.description ?? `MCP tool ${tool.name} from ${serverId}`
  };
  if (isRecord(tool.inputSchema)) {
    entry.input_schema = { ...tool.inputSchema };
  }
  return entry;
}

function mcpResourceToDiagnostic(serverId: string, resource: Resource): McpRuntimeResource {
  const diagnostic: McpRuntimeResource = {
    server_id: serverId,
    uri: resource.uri,
    name: resource.name
  };
  if (resource.description !== undefined) {
    diagnostic.description = resource.description;
  }
  if (resource.mimeType !== undefined) {
    diagnostic.mime_type = resource.mimeType;
  }
  if (resource.size !== undefined) {
    diagnostic.size = resource.size;
  }
  return diagnostic;
}

function mcpResourceTemplateToDiagnostic(
  serverId: string,
  resourceTemplate: ResourceTemplate
): McpRuntimeResourceTemplate {
  const diagnostic: McpRuntimeResourceTemplate = {
    server_id: serverId,
    uri_template: resourceTemplate.uriTemplate,
    name: resourceTemplate.name
  };
  if (resourceTemplate.description) {
    diagnostic.description = resourceTemplate.description;
  }
  if (resourceTemplate.mimeType) {
    diagnostic.mime_type = resourceTemplate.mimeType;
  }
  return diagnostic;
}

function mcpResourceContentToDiagnostic(content: ResourceContents): McpRuntimeResourceContent {
  const diagnostic: McpRuntimeResourceContent = {
    uri: content.uri
  };
  if (content.mimeType) {
    diagnostic.mime_type = content.mimeType;
  }
  if ("text" in content && typeof content.text === "string") {
    diagnostic.text = content.text;
  }
  if ("blob" in content && typeof content.blob === "string") {
    diagnostic.blob = content.blob;
  }
  return diagnostic;
}

function mcpPromptToDiagnostic(serverId: string, prompt: Prompt): McpRuntimePrompt {
  const diagnostic: McpRuntimePrompt = {
    server_id: serverId,
    name: prompt.name
  };
  if (prompt.description !== undefined) {
    diagnostic.description = prompt.description;
  }
  if (prompt.arguments !== undefined) {
    diagnostic.arguments = prompt.arguments.map((argument) => ({
      name: argument.name,
      ...(argument.description !== undefined ? { description: argument.description } : {}),
      ...(argument.required !== undefined ? { required: argument.required } : {})
    }));
  }
  return diagnostic;
}

function mcpPromptMessageToDiagnostic(message: PromptMessage): McpRuntimePromptMessage {
  return {
    role: message.role,
    content: mcpPromptContentToDiagnostic(message.content)
  };
}

function mcpPromptContentToDiagnostic(content: ContentBlock): McpRuntimePromptContent {
  if (content.type === "text") {
    return {
      type: "text",
      text: content.text
    };
  }
  if (content.type === "image" || content.type === "audio") {
    return {
      type: content.type,
      data: content.data,
      mime_type: content.mimeType
    };
  }
  if (content.type === "resource") {
    return {
      type: "resource",
      resource: mcpResourceContentToDiagnostic(content.resource),
      uri: content.resource.uri,
      mime_type: content.resource.mimeType
    };
  }
  if (content.type === "resource_link") {
    return {
      type: "resource_link",
      uri: content.uri,
      name: content.name,
      ...(content.description ? { description: content.description } : {}),
      ...(content.mimeType ? { mime_type: content.mimeType } : {})
    };
  }
  return {
    type: "unknown"
  };
}

function mcpCompletionToDiagnostic(
  serverId: string,
  refType: "prompt" | "resource_template",
  ref: string,
  argument: McpRuntimeCompletionArgument,
  completion: { values: string[]; total?: number; hasMore?: boolean }
): McpRuntimeCompletion {
  return {
    server_id: serverId,
    ref_type: refType,
    ref,
    argument: { ...argument },
    values: [...completion.values],
    ...(completion.total !== undefined ? { total: completion.total } : {}),
    ...(completion.hasMore !== undefined ? { has_more: completion.hasMore } : {})
  };
}

function mcpResultToToolExecutionResult(toolName: string, result: unknown): ToolExecutionResult {
  if (isMcpErrorResult(result)) {
    return toolError("mcp_tool_error", extractMcpErrorMessage(result), {
      tool_name: toolName,
      result: copyRecord(result)
    });
  }

  return {
    ok: true,
    output: copyRecord(result)
  };
}

function isMcpErrorResult(result: unknown): result is { isError: true; content: Array<unknown> } {
  return isRecord(result) && result.isError === true && Array.isArray(result.content);
}

function extractMcpErrorMessage(result: { content: Array<unknown> }): string {
  for (const content of result.content) {
    if (isRecord(content) && content.type === "text" && typeof content.text === "string" && content.text.length > 0) {
      return content.text;
    }
  }
  return "MCP tool returned an error.";
}

function copyRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return { value };
  }
  return { ...value };
}
