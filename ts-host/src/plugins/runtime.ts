import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { HostToolHandler, HostToolRegistry } from "../host_tools/registry.js";
import {
  BUILT_IN_TOOL_NAMES,
  type ToolCatalogEntry,
  type ToolName
} from "../types/godCodeProtocol.js";
import { loadPluginManifestFile } from "./loader.js";
import type { PluginManifest } from "./manifest.js";
import { PluginRegistry } from "./registry.js";
import { createPluginSandboxToolHandler } from "./sandboxRuntime.js";

export interface PluginRuntimeConfig {
  pluginDirs: string[];
  enabledPluginIds?: string[];
  toolHandlers?: ReadonlyMap<string, HostToolHandler>;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  rootDir: string;
}

export class PluginRuntimeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PluginRuntimeError";
  }
}

export class PluginSkillRuntime {
  private readonly config: PluginRuntimeConfig;
  private readonly toolHandlers = new Map<ToolName, HostToolHandler>();
  private registry = new PluginRegistry();
  private loadedPlugins: LoadedPlugin[] = [];
  private executableTools = new Map<ToolName, ToolCatalogEntry>();
  private promptFragmentList: string[] = [];

  public constructor(config: PluginRuntimeConfig) {
    this.config = {
      pluginDirs: [...config.pluginDirs],
      enabledPluginIds: config.enabledPluginIds ? [...config.enabledPluginIds] : undefined,
      toolHandlers: config.toolHandlers
    };
    for (const [toolName, handler] of config.toolHandlers ?? []) {
      this.toolHandlers.set(toolName, handler);
    }
  }

  public registerToolHandler(toolName: ToolName, handler: HostToolHandler): void {
    this.toolHandlers.set(toolName, handler);
  }

  public async load(): Promise<void> {
    const registry = new PluginRegistry();
    const loadedPlugins: LoadedPlugin[] = [];
    const executableTools = new Map<ToolName, ToolCatalogEntry>();
    const promptFragments: string[] = [];
    const seenPluginIds = new Set<string>();
    const seenToolNames = new Set<ToolName>();
    const enabledPluginIds = this.config.enabledPluginIds
      ? new Set(this.config.enabledPluginIds)
      : undefined;
    const loadedEnabledIds = new Set<string>();

    for (const pluginDir of this.config.pluginDirs) {
      const rootDir = resolve(pluginDir);
      const manifestPath = await findManifestPath(rootDir);
      const manifest = await loadPluginManifestFile(manifestPath);

      if (enabledPluginIds && !enabledPluginIds.has(manifest.id)) {
        continue;
      }
      loadedEnabledIds.add(manifest.id);

      if (seenPluginIds.has(manifest.id)) {
        throw new PluginRuntimeError(`Duplicate plugin id: ${manifest.id}`);
      }
      seenPluginIds.add(manifest.id);

      for (const tool of manifest.tools ?? []) {
        if (isBuiltInToolName(tool.name)) {
          throw new PluginRuntimeError(`Plugin tool cannot override built-in tool: ${tool.name}`);
        }
        if (seenToolNames.has(tool.name)) {
          throw new PluginRuntimeError(`Duplicate plugin tool name: ${tool.name}`);
        }
        seenToolNames.add(tool.name);
      }

      const loadedPlugin: LoadedPlugin = {
        manifest: copyManifest(manifest),
        rootDir
      };
      loadedPlugins.push(loadedPlugin);
      registry.registerManifest(manifest);
      promptFragments.push(...(manifest.promptFragments ?? []));

      for (const tool of manifest.tools ?? []) {
        const handler =
          this.toolHandlers.get(tool.name) ??
          (manifest.runtime
            ? createPluginSandboxToolHandler({
                manifest,
                rootDir,
                toolName: tool.name
              })
            : undefined);
        if (!handler) {
          continue;
        }
        const entry = { ...tool };
        executableTools.set(tool.name, entry);
        registry.registerTool(manifest.id, entry, handler);
      }
    }

    for (const pluginId of enabledPluginIds ?? []) {
      if (!loadedEnabledIds.has(pluginId)) {
        throw new PluginRuntimeError(`Enabled plugin was not loaded: ${pluginId}`);
      }
    }

    this.registry = registry;
    this.loadedPlugins = loadedPlugins;
    this.executableTools = executableTools;
    this.promptFragmentList = promptFragments;
  }

  public listLoadedPlugins(): LoadedPlugin[] {
    return this.loadedPlugins.map((plugin) => ({
      manifest: copyManifest(plugin.manifest),
      rootDir: plugin.rootDir
    }));
  }

  public listTools(): ToolCatalogEntry[] {
    return [...this.executableTools.values()].map((tool) => ({ ...tool }));
  }

  public promptFragments(): string[] {
    return [...this.promptFragmentList];
  }

  public registerToolsWithHostRegistry(hostRegistry: HostToolRegistry): void {
    this.registry.registerToolsWithHostRegistry(hostRegistry);
  }

  public async close(): Promise<void> {
    this.registry = new PluginRegistry();
    this.loadedPlugins = [];
    this.executableTools = new Map<ToolName, ToolCatalogEntry>();
    this.promptFragmentList = [];
  }
}

const MANIFEST_FILE_NAMES = ["plugin.json", "skill.json"] as const;

async function findManifestPath(rootDir: string): Promise<string> {
  const found: string[] = [];
  for (const fileName of MANIFEST_FILE_NAMES) {
    const manifestPath = join(rootDir, fileName);
    try {
      await access(manifestPath);
      found.push(manifestPath);
    } catch {
      // Missing manifest candidates are handled after all names are checked.
    }
  }

  if (found.length === 0) {
    throw new PluginRuntimeError(`Plugin directory does not contain plugin.json or skill.json: ${rootDir}`);
  }
  if (found.length > 1) {
    throw new PluginRuntimeError(`Plugin directory contains both plugin.json and skill.json: ${rootDir}`);
  }
  return found[0] ?? "";
}

function isBuiltInToolName(toolName: ToolName): boolean {
  return (BUILT_IN_TOOL_NAMES as readonly string[]).includes(toolName);
}

function copyManifest(manifest: PluginManifest): PluginManifest {
  const copy: PluginManifest = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version
  };
  if (manifest.tools) {
    copy.tools = manifest.tools.map((tool) => ({
      ...tool,
      input_schema: tool.input_schema ? { ...tool.input_schema } : undefined
    }));
  }
  if (manifest.runtime) {
    copy.runtime = {
      ...manifest.runtime,
      env_keys: manifest.runtime.env_keys ? [...manifest.runtime.env_keys] : undefined
    };
  }
  if (manifest.permissions) {
    copy.permissions = [...manifest.permissions];
  }
  if (manifest.promptFragments) {
    copy.promptFragments = [...manifest.promptFragments];
  }
  return copy;
}
