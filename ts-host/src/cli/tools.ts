import {
  prepareGodCodeHost,
  type PreparedGodCodeHost
} from "../headless/godCodeHostSetup.js";
import type { ToolCatalogEntry } from "../types/godCodeProtocol.js";

type HostToolCatalogOperationOutcome =
  | { ok: true; tools: ToolCatalogEntry[] }
  | { ok: false; reason: unknown };

type HostToolCatalogFinalizationOutcome =
  | { ok: true }
  | { ok: false };

const HOST_TOOL_CATALOG_CLEANUP_FAILURE_MESSAGE =
  "tool catalog loaded but host cleanup failed";

export async function listHostTools(): Promise<ToolCatalogEntry[]> {
  const host = await prepareGodCodeHost();
  let operation: HostToolCatalogOperationOutcome;
  try {
    operation = { ok: true, tools: host.toolCatalog };
  } catch (error) {
    operation = { ok: false, reason: error };
  }

  const finalization = await finalizeHostToolCatalog(host);
  if (!operation.ok) {
    throw operation.reason;
  }
  if (!finalization.ok) {
    throw new Error(HOST_TOOL_CATALOG_CLEANUP_FAILURE_MESSAGE);
  }
  return operation.tools;
}

export async function getHostTool(name: string): Promise<ToolCatalogEntry | undefined> {
  const tools = await listHostTools();
  return tools.find((tool) => tool.name === name);
}

export function renderToolList(tools: ToolCatalogEntry[]): string {
  if (tools.length === 0) {
    return "No tools are available.";
  }

  return tools.map((tool) => `${tool.name} - ${tool.description}`).join("\n");
}

export function renderToolListJson(tools: ToolCatalogEntry[]): string {
  return JSON.stringify(tools, null, 2);
}

export function renderToolInspect(tool: ToolCatalogEntry): string {
  const lines = [`Tool: ${tool.name}`, `Description: ${tool.description}`];
  if (tool.input_schema) {
    lines.push("Input schema:");
    lines.push(JSON.stringify(tool.input_schema, null, 2));
  } else {
    lines.push("Input schema: <not declared>");
  }
  return lines.join("\n");
}

export function renderToolInspectJson(tool: ToolCatalogEntry): string {
  return JSON.stringify(tool, null, 2);
}

async function finalizeHostToolCatalog(
  host: PreparedGodCodeHost
): Promise<HostToolCatalogFinalizationOutcome> {
  const [settlement] = await Promise.allSettled([
    invokeHostToolCatalogFinalizer(() => host.close())
  ]);
  return settlement.status === "rejected" ? { ok: false } : { ok: true };
}

function invokeHostToolCatalogFinalizer(
  finalizer: () => void | Promise<void>
): Promise<void> {
  try {
    return Promise.resolve(finalizer());
  } catch (error) {
    return Promise.reject(error);
  }
}
