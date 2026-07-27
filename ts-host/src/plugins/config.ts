import { promises as fs } from "node:fs";
import path from "node:path";
import { isRecord } from "../types/godCodeProtocol.js";
import type { PluginRuntimeConfig } from "./runtime.js";

export type PluginConfigSource = "none" | "env" | "file" | "registry";
export type LocalPluginRegistrySource = "none" | "file";

export interface PluginConfigLoadOptions {
  environ?: Record<string, string | undefined>;
  cwd?: string;
}

export interface PluginConfigLoadResult {
  config: PluginRuntimeConfig;
  source: PluginConfigSource;
  filePath?: string;
}

export interface LocalPluginRegistryEntry {
  id: string;
  path: string;
  enabled: boolean;
  tags?: string[];
}

export interface LocalPluginRegistryLoadResult {
  entries: LocalPluginRegistryEntry[];
  source: LocalPluginRegistrySource;
  filePath?: string;
}

export class PluginConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PluginConfigError";
  }
}

export async function loadPluginRuntimeConfig(
  options: PluginConfigLoadOptions = {}
): Promise<PluginConfigLoadResult> {
  const environ = options.environ ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const rawDirs = environ.GOD_CODE_PLUGIN_DIRS;

  if (rawDirs !== undefined && rawDirs.trim().length > 0) {
    return {
      config: {
        pluginDirs: resolvePluginDirs(parseStringArrayJson(rawDirs, "GOD_CODE_PLUGIN_DIRS"), cwd),
        enabledPluginIds: parseOptionalStringArrayJson(
          environ.GOD_CODE_PLUGIN_ENABLED_IDS,
          "GOD_CODE_PLUGIN_ENABLED_IDS"
        )
      },
      source: "env"
    };
  }

  const rawEnabled = environ.GOD_CODE_PLUGIN_ENABLED_IDS;
  if (rawEnabled !== undefined && rawEnabled.trim().length > 0) {
    throw new PluginConfigError("GOD_CODE_PLUGIN_ENABLED_IDS requires GOD_CODE_PLUGIN_DIRS.");
  }

  const configuredFile = environ.GOD_CODE_PLUGIN_CONFIG_FILE;
  if (configuredFile !== undefined && configuredFile.trim().length > 0) {
    const filePath = path.resolve(cwd, configuredFile);
    let rawFile: string;
    try {
      rawFile = await fs.readFile(filePath, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new PluginConfigError(`GOD_CODE_PLUGIN_CONFIG_FILE could not be read: ${filePath}: ${message}`);
    }

    return {
      config: parsePluginConfigFile(rawFile, path.dirname(filePath)),
      source: "file",
      filePath
    };
  }

  const registry = await loadLocalPluginRegistry(options);
  if (registry.entries.length > 0) {
    const enabledEntries = registry.entries.filter((entry) => entry.enabled);
    return {
      config: {
        pluginDirs: enabledEntries.map((entry) => entry.path),
        enabledPluginIds: enabledEntries.map((entry) => entry.id)
      },
      source: "registry",
      filePath: registry.filePath
    };
  }

  return {
    config: {
      pluginDirs: []
    },
    source: "none"
  };
}

export async function loadLocalPluginRegistry(
  options: PluginConfigLoadOptions = {}
): Promise<LocalPluginRegistryLoadResult> {
  const environ = options.environ ?? process.env;
  const configuredFile = environ.GOD_CODE_PLUGIN_REGISTRY_FILE;
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
    throw new PluginConfigError(`GOD_CODE_PLUGIN_REGISTRY_FILE could not be read: ${filePath}: ${message}`);
  }

  return {
    entries: parseLocalPluginRegistryFile(rawFile, path.dirname(filePath)),
    source: "file",
    filePath
  };
}

function parsePluginConfigFile(raw: string, baseDir: string): PluginRuntimeConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PluginConfigError(`Plugin config file must be valid JSON: ${message}`);
  }

  if (Array.isArray(parsed)) {
    return {
      pluginDirs: resolvePluginDirs(parseStringArray(parsed, "plugin config file"), baseDir)
    };
  }

  if (!isRecord(parsed)) {
    throw new PluginConfigError("Plugin config file must be a JSON object or string array.");
  }

  const pluginDirsValue = parsed.plugin_dirs ?? parsed.pluginDirs;
  if (pluginDirsValue === undefined) {
    throw new PluginConfigError("Plugin config file requires plugin_dirs.");
  }

  const config: PluginRuntimeConfig = {
    pluginDirs: resolvePluginDirs(parseStringArray(pluginDirsValue, "plugin_dirs"), baseDir)
  };

  const enabledValue = parsed.enabled_plugin_ids ?? parsed.enabledPluginIds;
  if (enabledValue !== undefined) {
    config.enabledPluginIds = parseStringArray(enabledValue, "enabled_plugin_ids");
  }

  return config;
}

function parseLocalPluginRegistryFile(raw: string, baseDir: string): LocalPluginRegistryEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PluginConfigError(`Plugin registry file must be valid JSON: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new PluginConfigError("Plugin registry file must be a JSON object.");
  }

  if (!Array.isArray(parsed.plugins)) {
    throw new PluginConfigError("Plugin registry file requires plugins array.");
  }

  const seenIds = new Set<string>();
  return parsed.plugins.map((value, index) => {
    if (!isRecord(value)) {
      throw new PluginConfigError(`Plugin registry entry at index ${index} must be an object.`);
    }

    const id = requiredString(value, "id", `Plugin registry entry at index ${index}`);
    if (seenIds.has(id)) {
      throw new PluginConfigError(`Duplicate plugin registry id: ${id}`);
    }
    seenIds.add(id);

    const entry: LocalPluginRegistryEntry = {
      id,
      path: path.resolve(baseDir, requiredString(value, "path", `Plugin registry entry at index ${index}`)),
      enabled: value.enabled === undefined ? true : booleanField(value.enabled, "enabled", index)
    };
    if (value.tags !== undefined) {
      entry.tags = parseStringArray(value.tags, `plugins[${index}].tags`);
    }
    return entry;
  });
}

function parseStringArrayJson(raw: string, sourceName: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PluginConfigError(`${sourceName} must be valid JSON: ${message}`);
  }
  return parseStringArray(parsed, sourceName);
}

function parseOptionalStringArrayJson(raw: string | undefined, sourceName: string): string[] | undefined {
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }
  return parseStringArrayJson(raw, sourceName);
}

function parseStringArray(value: unknown, sourceName: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.length > 0)) {
    throw new PluginConfigError(`${sourceName} must be a non-empty string array.`);
  }
  return [...value];
}

function resolvePluginDirs(pluginDirs: string[], baseDir: string): string[] {
  return pluginDirs.map((pluginDir) => path.resolve(baseDir, pluginDir));
}

function requiredString(value: Record<string, unknown>, key: string, sourceName: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new PluginConfigError(`${sourceName} requires non-empty string field: ${key}`);
  }
  return field;
}

function booleanField(value: unknown, key: string, index: number): boolean {
  if (typeof value !== "boolean") {
    throw new PluginConfigError(`Plugin registry entry at index ${index} field ${key} must be a boolean.`);
  }
  return value;
}
