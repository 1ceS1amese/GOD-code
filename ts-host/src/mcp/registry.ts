import type { HostToolContext } from "../host_tools/common.js";
import type { HostToolHandler, HostToolRegistry } from "../host_tools/registry.js";
import { toolError } from "../host_tools/common.js";
import type { ToolCatalogEntry, ToolExecutionResult } from "../types/godCodeProtocol.js";

interface McpToolRecord {
  entry: ToolCatalogEntry;
  handler: HostToolHandler;
}

export interface McpToolRegistry {
  listTools(): Promise<ToolCatalogEntry[]>;
  executeTool(
    name: string,
    input: Record<string, unknown>,
    context: HostToolContext
  ): Promise<ToolExecutionResult>;
}

export class InMemoryMcpToolRegistry implements McpToolRegistry {
  private readonly tools = new Map<string, McpToolRecord>();

  public registerTool(entry: ToolCatalogEntry, handler: HostToolHandler): void {
    this.tools.set(entry.name, { entry, handler });
  }

  public async listTools(): Promise<ToolCatalogEntry[]> {
    return [...this.tools.values()].map(({ entry }) => ({ ...entry }));
  }

  public async executeTool(
    name: string,
    input: Record<string, unknown>,
    context: HostToolContext
  ): Promise<ToolExecutionResult> {
    const record = this.tools.get(name);
    if (!record) {
      return toolError("unknown_mcp_tool", `Unknown MCP tool: ${name}`);
    }
    return await record.handler(input, context);
  }
}

export async function registerMcpToolsWithHostRegistry(
  mcpRegistry: McpToolRegistry,
  hostRegistry: HostToolRegistry
): Promise<void> {
  for (const tool of await mcpRegistry.listTools()) {
    hostRegistry.register(tool.name, async (input, context) => {
      return await mcpRegistry.executeTool(tool.name, input, context);
    });
  }
}
