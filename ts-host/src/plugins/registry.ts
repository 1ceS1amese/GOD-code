import type { HostToolHandler, HostToolRegistry } from "../host_tools/registry.js";
import type { ToolCatalogEntry } from "../types/godCodeProtocol.js";
import { type PluginManifest, parsePluginManifest } from "./manifest.js";

interface PluginToolRecord {
  pluginId: string;
  tool: ToolCatalogEntry;
  handler: HostToolHandler;
}

export class PluginRegistry {
  private readonly manifests = new Map<string, PluginManifest>();
  private readonly toolHandlers = new Map<string, PluginToolRecord>();

  public registerManifest(value: unknown): PluginManifest {
    const manifest = parsePluginManifest(value);
    this.manifests.set(manifest.id, manifest);
    return manifest;
  }

  public registerTool(pluginId: string, tool: ToolCatalogEntry, handler: HostToolHandler): void {
    this.toolHandlers.set(tool.name, { pluginId, tool, handler });
  }

  public listManifests(): PluginManifest[] {
    return [...this.manifests.values()].map((manifest) => ({
      ...manifest,
      runtime: manifest.runtime
        ? {
            ...manifest.runtime,
            env_keys: manifest.runtime.env_keys ? [...manifest.runtime.env_keys] : undefined
          }
        : undefined,
      tools: manifest.tools?.map((tool) => ({ ...tool })),
      permissions: manifest.permissions ? [...manifest.permissions] : undefined,
      promptFragments: manifest.promptFragments ? [...manifest.promptFragments] : undefined
    }));
  }

  public listTools(): ToolCatalogEntry[] {
    const toolsFromManifests = [...this.manifests.values()].flatMap((manifest) => manifest.tools ?? []);
    const toolsFromHandlers = [...this.toolHandlers.values()].map((record) => record.tool);
    const tools = new Map<string, ToolCatalogEntry>();
    for (const tool of [...toolsFromManifests, ...toolsFromHandlers]) {
      tools.set(tool.name, { ...tool });
    }
    return [...tools.values()];
  }

  public registerToolsWithHostRegistry(hostRegistry: HostToolRegistry): void {
    for (const record of this.toolHandlers.values()) {
      hostRegistry.register(record.tool.name, record.handler);
    }
  }
}
