import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalPluginRegistry, loadPluginRuntimeConfig } from "../plugins/config.js";
import type { LocalPluginRegistryEntry } from "../plugins/config.js";
import { loadPluginManifestFile } from "../plugins/loader.js";
import { pluginManifestJsonSchema } from "../plugins/manifest.js";
import type { PluginManifest } from "../plugins/manifest.js";
import { PluginSkillRuntime } from "../plugins/runtime.js";

export type PluginDiagnosticStatus = "ok" | "warn" | "error";

export interface PluginDiagnosticCheck {
  name: string;
  status: PluginDiagnosticStatus;
  message: string;
  details?: unknown;
}

export interface PluginDiagnosticReport {
  ok: boolean;
  checks: PluginDiagnosticCheck[];
}

type PluginDiagnosticRuntimeFinalizationOutcome =
  | { ok: true }
  | { ok: false };

const PLUGIN_RUNTIME_CLEANUP_FAILURE_MESSAGE =
  "plugin runtime cleanup failed";

export type PluginRegistryInstallAction =
  | "create_registry"
  | "add_entry"
  | "update_entry"
  | "replace_entry"
  | "no_op";

export interface PluginRegistryInstallOptions {
  packageDir: string;
  registryFile?: string;
  cwd?: string;
  environ?: Record<string, string | undefined>;
  dryRun?: boolean;
  yes?: boolean;
  enabled?: boolean;
  tags?: string[];
  replace?: boolean;
}

export interface PluginRegistryInstallResult {
  type: "plugin_local_registry_install";
  registry_file: string;
  package_dir: string;
  manifest_path: string;
  manifest_kind: "plugin" | "skill";
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  tags: string[];
  path_value: string;
  action: PluginRegistryInstallAction;
  changed: boolean;
  dry_run: boolean;
}

export type PluginRegistryUninstallAction = "remove_entry" | "no_op";

export interface PluginRegistryUninstallOptions {
  pluginId: string;
  registryFile?: string;
  cwd?: string;
  environ?: Record<string, string | undefined>;
  dryRun?: boolean;
  yes?: boolean;
  missingOk?: boolean;
}

export interface PluginRegistryUninstallResult {
  type: "plugin_local_registry_uninstall";
  registry_file: string;
  id: string;
  removed_path: string | null;
  enabled: boolean | null;
  tags: string[];
  action: PluginRegistryUninstallAction;
  changed: boolean;
  dry_run: boolean;
}

export type PluginRegistrySetEnabledAction = "enable_entry" | "disable_entry" | "no_op";

export interface PluginRegistrySetEnabledOptions {
  pluginId: string;
  enabled: boolean;
  registryFile?: string;
  cwd?: string;
  environ?: Record<string, string | undefined>;
  dryRun?: boolean;
  yes?: boolean;
}

export interface PluginRegistrySetEnabledResult {
  type: "plugin_local_registry_set_enabled";
  registry_file: string;
  id: string;
  path: string;
  previous_enabled: boolean;
  enabled: boolean;
  tags: string[];
  action: PluginRegistrySetEnabledAction;
  changed: boolean;
  dry_run: boolean;
}

export type PluginRegistryTagsAction = "set_tags" | "add_tags" | "remove_tags" | "clear_tags" | "no_op";

export interface PluginRegistryTagsOptions {
  pluginId: string;
  registryFile?: string;
  cwd?: string;
  environ?: Record<string, string | undefined>;
  dryRun?: boolean;
  yes?: boolean;
  addTags?: string[];
  removeTags?: string[];
  setTags?: string[];
  clear?: boolean;
}

export interface PluginRegistryTagsResult {
  type: "plugin_local_registry_tags";
  registry_file: string;
  id: string;
  path: string;
  previous_tags: string[];
  tags: string[];
  added_tags: string[];
  removed_tags: string[];
  action: PluginRegistryTagsAction;
  changed: boolean;
  dry_run: boolean;
}

export async function validatePluginManifestTarget(targetPath: string): Promise<PluginDiagnosticReport> {
  const checks: PluginDiagnosticCheck[] = [];
  let manifestPath: string;

  try {
    manifestPath = await resolveManifestPath(targetPath);
  } catch (error) {
    checks.push({
      name: "plugin_manifest_path",
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    });
    return report(checks);
  }

  checks.push({
    name: "plugin_manifest_path",
    status: "ok",
    message: manifestPath,
    details: {
      path: manifestPath,
      kind: path.basename(manifestPath, ".json")
    }
  });

  try {
    const manifest = await loadPluginManifestFile(manifestPath);
    checks.push({
      name: "plugin_manifest",
      status: "ok",
      message: `${manifest.id}: ${manifest.name}@${manifest.version}`,
      details: summarizeManifest(manifest)
    });
  } catch (error) {
    checks.push({
      name: "plugin_manifest",
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  }

  return report(checks);
}

export async function inspectPluginConfig(options: {
  environ?: Record<string, string | undefined>;
  cwd?: string;
} = {}): Promise<PluginDiagnosticReport> {
  const checks: PluginDiagnosticCheck[] = [];
  let loadResult: Awaited<ReturnType<typeof loadPluginRuntimeConfig>>;

  try {
    loadResult = await loadPluginRuntimeConfig(options);
  } catch (error) {
    checks.push({
      name: "plugin_config",
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    });
    return report(checks);
  }

  checks.push({
    name: "plugin_config",
    status: "ok",
    message:
      loadResult.config.pluginDirs.length === 0
        ? "no plugins configured"
        : `${loadResult.config.pluginDirs.length} plugin dir(s) configured from ${loadResult.source}`,
    details: {
      source: loadResult.source,
      ...(loadResult.filePath
        ? loadResult.source === "registry"
          ? { registry_file: loadResult.filePath }
          : { config_file: loadResult.filePath }
        : {}),
      plugin_dirs: [...loadResult.config.pluginDirs],
      enabled_plugin_ids: loadResult.config.enabledPluginIds ? [...loadResult.config.enabledPluginIds] : []
    }
  });

  if (loadResult.config.pluginDirs.length === 0) {
    return report(checks);
  }

  const runtime = new PluginSkillRuntime(loadResult.config);
  let runtimeDiagnostic: PluginDiagnosticCheck;
  try {
    await runtime.load();
    const plugins = runtime.listLoadedPlugins();
    const tools = runtime.listTools();
    runtimeDiagnostic = {
      name: "plugin_runtime",
      status: "ok",
      message: `${plugins.length} plugin(s), ${tools.length} executable tool(s) loaded`,
      details: {
        plugin_count: plugins.length,
        tool_count: tools.length,
        plugins: plugins.map((plugin) => ({
          root_dir: plugin.rootDir,
          ...summarizeManifest(plugin.manifest)
        })),
        tools
      }
    };
  } catch (error) {
    runtimeDiagnostic = {
      name: "plugin_runtime",
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    };
  }

  const finalization = await finalizePluginDiagnosticRuntime(runtime);
  if (runtimeDiagnostic.status === "ok" && !finalization.ok) {
    runtimeDiagnostic = {
      name: "plugin_runtime",
      status: "error",
      message: PLUGIN_RUNTIME_CLEANUP_FAILURE_MESSAGE
    };
  }
  checks.push(runtimeDiagnostic);

  return report(checks);
}

export async function listConfiguredPlugins(options: {
  environ?: Record<string, string | undefined>;
  cwd?: string;
} = {}): Promise<PluginDiagnosticReport> {
  const registry = await loadLocalPluginRegistry(options);
  if (registry.entries.length > 0) {
    return await listRegistryPlugins(registry);
  }

  const checks: PluginDiagnosticCheck[] = [];
  let loadResult: Awaited<ReturnType<typeof loadPluginRuntimeConfig>>;
  try {
    loadResult = await loadPluginRuntimeConfig(options);
  } catch (error) {
    checks.push({
      name: "plugin_list",
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    });
    return report(checks);
  }

  if (loadResult.config.pluginDirs.length === 0) {
    checks.push({
      name: "plugin_list",
      status: "ok",
      message: "no plugins configured",
      details: {
        source: loadResult.source,
        plugins: []
      }
    });
    return report(checks);
  }

  const runtime = new PluginSkillRuntime(loadResult.config);
  let listDiagnostic: PluginDiagnosticCheck;
  try {
    await runtime.load();
    const plugins = runtime.listLoadedPlugins();
    listDiagnostic = {
      name: "plugin_list",
      status: "ok",
      message: `${plugins.length} plugin(s) configured from ${loadResult.source}`,
      details: {
        source: loadResult.source,
        ...(loadResult.filePath ? { config_file: loadResult.filePath } : {}),
        plugins: plugins.map((plugin) => ({
          root_dir: plugin.rootDir,
          enabled: true,
          ...summarizeManifest(plugin.manifest)
        }))
      }
    };
  } catch (error) {
    listDiagnostic = {
      name: "plugin_list",
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    };
  }

  const finalization = await finalizePluginDiagnosticRuntime(runtime);
  if (listDiagnostic.status === "ok" && !finalization.ok) {
    listDiagnostic = {
      name: "plugin_list",
      status: "error",
      message: PLUGIN_RUNTIME_CLEANUP_FAILURE_MESSAGE
    };
  }
  checks.push(listDiagnostic);
  return report(checks);
}

export async function inspectConfiguredPlugin(
  pluginId: string,
  options: {
    environ?: Record<string, string | undefined>;
    cwd?: string;
  } = {}
): Promise<PluginDiagnosticReport> {
  const registry = await loadLocalPluginRegistry(options);
  if (registry.entries.length > 0) {
    return await inspectRegistryPlugin(pluginId, registry);
  }

  const listReport = await listConfiguredPlugins(options);
  const listCheck = listReport.checks.find((check) => check.name === "plugin_list");
  if (listCheck?.status === "error") {
    return listReport;
  }
  const details = isRecord(listCheck?.details) ? listCheck.details : {};
  const plugins = Array.isArray(details.plugins) ? details.plugins : [];
  const plugin = plugins.find((candidate) => isRecord(candidate) && candidate.id === pluginId);
  if (!plugin) {
    return report([
      {
        name: "plugin_inspect",
        status: "error",
        message: `Plugin not found: ${pluginId}`
      }
    ]);
  }
  return report([
    {
      name: "plugin_inspect",
      status: "ok",
      message: `${pluginId}`,
      details: {
        source: details.source,
        plugin
      }
    }
  ]);
}

export function renderPluginDiagnosticReport(reportValue: PluginDiagnosticReport): string {
  const lines = ["GOD-code plugin diagnostics:"];
  for (const check of reportValue.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    renderPluginDetails(lines, check.details);
  }
  return lines.join("\n");
}

export function renderPluginDiagnosticReportJson(reportValue: PluginDiagnosticReport): string {
  return JSON.stringify(reportValue, null, 2);
}

export async function installLocalPluginRegistryEntry(
  options: PluginRegistryInstallOptions
): Promise<PluginRegistryInstallResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const environ = options.environ ?? process.env;
  const dryRun = options.dryRun !== false || options.yes !== true;
  const registryFile = resolveRegistryFile(options.registryFile, environ, cwd);
  const registryDir = path.dirname(registryFile);
  const packageDir = path.resolve(cwd, options.packageDir);
  await assertPluginPackageDirectory(packageDir, cwd);
  const manifestPath = await resolveManifestPath(packageDir);
  const manifest = await loadPluginManifestFile(manifestPath);
  const manifestKind = path.basename(manifestPath) === "skill.json" ? "skill" : "plugin";
  const registry = await loadRegistryDocument(registryFile);
  const tags = options.tags !== undefined ? normalizeInstallTags(options.tags) : undefined;
  const pathValue = relativeRegistryPath(registryDir, packageDir);
  const existingIndex = registry.entries.findIndex((entry) => entry.id === manifest.id);

  let action: PluginRegistryInstallAction;
  let changed = true;
  let enabled: boolean;
  let resultTags: string[];

  if (existingIndex >= 0) {
    const existing = registry.entries[existingIndex]!;
    const existingPath = path.resolve(registryDir, existing.path);
    const samePath = path.normalize(existingPath) === path.normalize(packageDir);
    if (!samePath && options.replace !== true) {
      throw new Error(`Plugin registry id already exists with a different path: ${manifest.id}. Use --replace to update it.`);
    }

    enabled = options.enabled ?? (existing.enabled === undefined ? true : existing.enabled);
    resultTags = tags ?? readRegistryTags(existing);
    const nextEntry: RegistryDocumentEntry = {
      ...existing,
      id: manifest.id,
      path: samePath ? existing.path : pathValue,
      enabled,
      tags: resultTags
    };
    changed =
      !samePath ||
      (existing.enabled === undefined ? true : existing.enabled) !== enabled ||
      !stringArraysEqual(readRegistryTags(existing), resultTags);
    action = !changed ? "no_op" : samePath ? "update_entry" : "replace_entry";
    if (changed && !dryRun) {
      registry.entries[existingIndex] = nextEntry;
      registry.document.plugins = registry.entries;
      await writeRegistryDocument(registryFile, registry.document);
    }
  } else {
    enabled = options.enabled ?? true;
    resultTags = tags ?? [];
    action = registry.exists ? "add_entry" : "create_registry";
    const nextEntry: RegistryDocumentEntry = {
      id: manifest.id,
      path: pathValue,
      enabled,
      tags: resultTags
    };
    if (!dryRun) {
      registry.entries.push(nextEntry);
      registry.document.plugins = registry.entries;
      await writeRegistryDocument(registryFile, registry.document);
    }
  }

  return {
    type: "plugin_local_registry_install",
    registry_file: formatPathForOutput(registryFile, cwd),
    package_dir: formatPathForOutput(packageDir, cwd),
    manifest_path: formatPathForOutput(manifestPath, cwd),
    manifest_kind: manifestKind,
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    enabled,
    tags: resultTags,
    path_value: pathValue,
    action,
    changed,
    dry_run: dryRun
  };
}

export function renderPluginRegistryInstallResult(result: PluginRegistryInstallResult): string {
  return [
    "GOD-code plugin registry install:",
    `registry_file: ${result.registry_file}`,
    `package_dir: ${result.package_dir}`,
    `manifest: ${path.basename(result.manifest_path)}`,
    `id: ${result.id}`,
    `name: ${result.name}`,
    `version: ${result.version}`,
    `enabled: ${String(result.enabled)}`,
    `tags: ${result.tags.join(",")}`,
    `path_value: ${result.path_value}`,
    `action: ${result.action}`,
    `dry_run: ${String(result.dry_run)}`,
    `changed: ${String(result.changed)}`
  ].join("\n");
}

export function renderPluginRegistryInstallResultJson(result: PluginRegistryInstallResult): string {
  return JSON.stringify(result, null, 2);
}

export async function uninstallLocalPluginRegistryEntry(
  options: PluginRegistryUninstallOptions
): Promise<PluginRegistryUninstallResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const environ = options.environ ?? process.env;
  const dryRun = options.dryRun !== false || options.yes !== true;
  const registryFile = resolveRegistryFile(options.registryFile, environ, cwd);
  const pluginId = options.pluginId.trim();
  if (pluginId.length === 0) {
    throw new Error("Missing plugin id.");
  }

  const registry = await loadRequiredRegistryDocument(registryFile);
  const existingIndex = registry.entries.findIndex((entry) => entry.id === pluginId);
  if (existingIndex < 0) {
    if (options.missingOk === true) {
      return {
        type: "plugin_local_registry_uninstall",
        registry_file: formatPathForOutput(registryFile, cwd),
        id: pluginId,
        removed_path: null,
        enabled: null,
        tags: [],
        action: "no_op",
        changed: false,
        dry_run: dryRun
      };
    }
    throw new Error(`Plugin registry id not found: ${pluginId}. Use --missing-ok to ignore missing entries.`);
  }

  const existing = registry.entries[existingIndex]!;
  const enabled = existing.enabled === undefined ? true : existing.enabled;
  const tags = readRegistryTags(existing);
  if (!dryRun) {
    registry.entries.splice(existingIndex, 1);
    registry.document.plugins = registry.entries;
    await writeRegistryDocument(registryFile, registry.document);
  }

  return {
    type: "plugin_local_registry_uninstall",
    registry_file: formatPathForOutput(registryFile, cwd),
    id: pluginId,
    removed_path: existing.path,
    enabled,
    tags,
    action: "remove_entry",
    changed: true,
    dry_run: dryRun
  };
}

export function renderPluginRegistryUninstallResult(result: PluginRegistryUninstallResult): string {
  return [
    "GOD-code plugin registry uninstall:",
    `registry_file: ${result.registry_file}`,
    `id: ${result.id}`,
    `removed_path: ${result.removed_path ?? ""}`,
    `enabled: ${result.enabled === null ? "" : String(result.enabled)}`,
    `tags: ${result.tags.join(",")}`,
    `action: ${result.action}`,
    `dry_run: ${String(result.dry_run)}`,
    `changed: ${String(result.changed)}`
  ].join("\n");
}

export function renderPluginRegistryUninstallResultJson(result: PluginRegistryUninstallResult): string {
  return JSON.stringify(result, null, 2);
}

export async function setLocalPluginRegistryEntryEnabled(
  options: PluginRegistrySetEnabledOptions
): Promise<PluginRegistrySetEnabledResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const environ = options.environ ?? process.env;
  const dryRun = options.dryRun !== false || options.yes !== true;
  const registryFile = resolveRegistryFile(options.registryFile, environ, cwd);
  const pluginId = options.pluginId.trim();
  if (pluginId.length === 0) {
    throw new Error("Missing plugin id.");
  }

  const registry = await loadRequiredRegistryDocument(registryFile);
  const existingIndex = registry.entries.findIndex((entry) => entry.id === pluginId);
  if (existingIndex < 0) {
    throw new Error(`Plugin registry id not found: ${pluginId}.`);
  }

  const existing = registry.entries[existingIndex]!;
  const previousEnabled = effectiveRegistryEntryEnabled(existing);
  const changed = previousEnabled !== options.enabled;
  const action: PluginRegistrySetEnabledAction = !changed
    ? "no_op"
    : options.enabled
      ? "enable_entry"
      : "disable_entry";

  if (changed && !dryRun) {
    registry.entries[existingIndex] = {
      ...existing,
      enabled: options.enabled
    };
    registry.document.plugins = registry.entries;
    await writeRegistryDocument(registryFile, registry.document);
  }

  return {
    type: "plugin_local_registry_set_enabled",
    registry_file: formatPathForOutput(registryFile, cwd),
    id: pluginId,
    path: existing.path,
    previous_enabled: previousEnabled,
    enabled: options.enabled,
    tags: readRegistryTags(existing),
    action,
    changed,
    dry_run: dryRun
  };
}

export function renderPluginRegistrySetEnabledResult(result: PluginRegistrySetEnabledResult): string {
  return [
    "GOD-code plugin registry state:",
    `registry_file: ${result.registry_file}`,
    `id: ${result.id}`,
    `path: ${result.path}`,
    `previous_enabled: ${String(result.previous_enabled)}`,
    `enabled: ${String(result.enabled)}`,
    `tags: ${result.tags.join(",")}`,
    `action: ${result.action}`,
    `dry_run: ${String(result.dry_run)}`,
    `changed: ${String(result.changed)}`
  ].join("\n");
}

export function renderPluginRegistrySetEnabledResultJson(result: PluginRegistrySetEnabledResult): string {
  return JSON.stringify(result, null, 2);
}

export async function updateLocalPluginRegistryEntryTags(
  options: PluginRegistryTagsOptions
): Promise<PluginRegistryTagsResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const environ = options.environ ?? process.env;
  const dryRun = options.dryRun !== false || options.yes !== true;
  const registryFile = resolveRegistryFile(options.registryFile, environ, cwd);
  const pluginId = options.pluginId.trim();
  if (pluginId.length === 0) {
    throw new Error("Missing plugin id.");
  }

  const addTags = normalizeInstallTags(options.addTags ?? []);
  const removeTags = normalizeInstallTags(options.removeTags ?? []);
  const hasSetTags = options.setTags !== undefined;
  const setTags = hasSetTags ? normalizeInstallTags(options.setTags ?? []) : undefined;
  const clear = options.clear === true;

  if (clear && hasSetTags) {
    throw new Error("--set and --clear are mutually exclusive.");
  }
  if ((clear || hasSetTags) && (addTags.length > 0 || removeTags.length > 0)) {
    throw new Error("--set/--clear cannot be combined with --add/--remove.");
  }
  if (!clear && !hasSetTags && addTags.length === 0 && removeTags.length === 0) {
    throw new Error("Missing tag operation. Use --add, --remove, --set, or --clear.");
  }

  const registry = await loadRequiredRegistryDocument(registryFile);
  const existingIndex = registry.entries.findIndex((entry) => entry.id === pluginId);
  if (existingIndex < 0) {
    throw new Error(`Plugin registry id not found: ${pluginId}.`);
  }

  const existing = registry.entries[existingIndex]!;
  const previousTags = readRegistryTags(existing);
  assertRegistryTagsValid(previousTags);
  const nextTags = computeUpdatedRegistryTags(previousTags, { addTags, removeTags, setTags, clear });
  const addedTags = nextTags.filter((tag) => !previousTags.includes(tag));
  const removedTags = previousTags.filter((tag) => !nextTags.includes(tag));
  const changed = !stringArraysEqual(previousTags, nextTags);
  const action = resolveRegistryTagsAction({
    changed,
    clear,
    hasSetTags,
    addTags,
    removeTags
  });

  if (changed && !dryRun) {
    registry.entries[existingIndex] = {
      ...existing,
      tags: nextTags
    };
    registry.document.plugins = registry.entries;
    await writeRegistryDocument(registryFile, registry.document);
  }

  return {
    type: "plugin_local_registry_tags",
    registry_file: formatPathForOutput(registryFile, cwd),
    id: pluginId,
    path: existing.path,
    previous_tags: previousTags,
    tags: nextTags,
    added_tags: addedTags,
    removed_tags: removedTags,
    action,
    changed,
    dry_run: dryRun
  };
}

export function renderPluginRegistryTagsResult(result: PluginRegistryTagsResult): string {
  return [
    "GOD-code plugin registry tags:",
    `registry_file: ${result.registry_file}`,
    `id: ${result.id}`,
    `path: ${result.path}`,
    `previous_tags: ${result.previous_tags.join(",")}`,
    `tags: ${result.tags.join(",")}`,
    `added_tags: ${result.added_tags.join(",")}`,
    `removed_tags: ${result.removed_tags.join(",")}`,
    `action: ${result.action}`,
    `dry_run: ${String(result.dry_run)}`,
    `changed: ${String(result.changed)}`
  ].join("\n");
}

export function renderPluginRegistryTagsResultJson(result: PluginRegistryTagsResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderPluginManifestSchema(): string {
  const schema = pluginManifestJsonSchema();
  const required = Array.isArray(schema.required) ? schema.required.join(", ") : "";
  return [
    "GOD-code plugin / skill manifest schema:",
    "Manifest files: plugin.json or skill.json",
    `Required fields: ${required}`,
    "Optional fields: tools, runtime, permissions, promptFragments",
    "Tool fields: name, description, input_schema",
    "Runtime fields: kind=node-subprocess, entry, timeout_ms, env_keys",
    "Notes: unknown fields are preserved by JSON but ignored by the current parser; permissions are declarations and do not bypass host policy."
  ].join("\n");
}

export function renderPluginManifestSchemaJson(): string {
  return JSON.stringify(pluginManifestJsonSchema(), null, 2);
}

async function resolveManifestPath(targetPath: string): Promise<string> {
  const resolved = path.resolve(targetPath);
  const targetStat = await stat(resolved).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Plugin manifest target not found: ${resolved}: ${message}`);
  });

  if (targetStat.isFile()) {
    const fileName = path.basename(resolved);
    if (fileName !== "plugin.json" && fileName !== "skill.json") {
      throw new Error(`Plugin manifest file must be plugin.json or skill.json: ${resolved}`);
    }
    return resolved;
  }

  if (!targetStat.isDirectory()) {
    throw new Error(`Plugin manifest target must be a file or directory: ${resolved}`);
  }

  const pluginPath = path.join(resolved, "plugin.json");
  const skillPath = path.join(resolved, "skill.json");
  const hasPlugin = await exists(pluginPath);
  const hasSkill = await exists(skillPath);

  if (hasPlugin && hasSkill) {
    throw new Error(`Plugin directory contains both plugin.json and skill.json: ${resolved}`);
  }
  if (hasPlugin) {
    return pluginPath;
  }
  if (hasSkill) {
    return skillPath;
  }
  throw new Error(`Plugin directory does not contain plugin.json or skill.json: ${resolved}`);
}

async function assertPluginPackageDirectory(packageDir: string, cwd: string): Promise<void> {
  const targetStat = await stat(packageDir).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Plugin package directory not found: ${formatPathForOutput(packageDir, cwd)}: ${message}`);
  });
  if (!targetStat.isDirectory()) {
    throw new Error(`Plugin install target must be a package directory: ${formatPathForOutput(packageDir, cwd)}`);
  }
  const relative = path.relative(cwd, packageDir);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`Plugin package directory must be inside current workspace: ${formatPathForOutput(packageDir, cwd)}`);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function summarizeManifest(manifest: PluginManifest): Record<string, unknown> {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    tool_count: manifest.tools?.length ?? 0,
    permission_count: manifest.permissions?.length ?? 0,
    prompt_fragment_count: manifest.promptFragments?.length ?? 0,
    runtime: manifest.runtime
      ? {
          kind: manifest.runtime.kind,
          entry: manifest.runtime.entry,
          timeout_ms: manifest.runtime.timeout_ms,
          env_keys: manifest.runtime.env_keys ? [...manifest.runtime.env_keys].sort() : []
        }
      : undefined,
    tools: (manifest.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      has_input_schema: tool.input_schema !== undefined
    }))
  };
}

async function listRegistryPlugins(
  registry: Awaited<ReturnType<typeof loadLocalPluginRegistry>>
): Promise<PluginDiagnosticReport> {
  const checks: PluginDiagnosticCheck[] = [];
  const plugins: Record<string, unknown>[] = [];
  try {
    for (const entry of registry.entries) {
      plugins.push(await summarizeRegistryEntry(entry));
    }
    checks.push({
      name: "plugin_registry",
      status: "ok",
      message: `${plugins.length} registry plugin(s) configured`,
      details: {
        source: "registry",
        ...(registry.filePath ? { registry_file: registry.filePath } : {}),
        plugins
      }
    });
  } catch (error) {
    checks.push({
      name: "plugin_registry",
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
  return report(checks);
}

async function inspectRegistryPlugin(
  pluginId: string,
  registry: Awaited<ReturnType<typeof loadLocalPluginRegistry>>
): Promise<PluginDiagnosticReport> {
  const entry = registry.entries.find((candidate) => candidate.id === pluginId);
  if (!entry) {
    return report([
      {
        name: "plugin_inspect",
        status: "error",
        message: `Plugin not found: ${pluginId}`
      }
    ]);
  }
  try {
    return report([
      {
        name: "plugin_inspect",
        status: "ok",
        message: `${pluginId}`,
        details: {
          source: "registry",
          ...(registry.filePath ? { registry_file: registry.filePath } : {}),
          plugin: await summarizeRegistryEntry(entry)
        }
      }
    ]);
  } catch (error) {
    return report([
      {
        name: "plugin_inspect",
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      }
    ]);
  }
}

async function summarizeRegistryEntry(entry: LocalPluginRegistryEntry): Promise<Record<string, unknown>> {
  const manifestPath = await resolveManifestPath(entry.path);
  const manifest = await loadPluginManifestFile(manifestPath);
  if (manifest.id !== entry.id) {
    throw new Error(`Plugin registry id ${entry.id} does not match manifest id ${manifest.id}.`);
  }
  return {
    ...summarizeManifest(manifest),
    path: entry.path,
    manifest_path: manifestPath,
    enabled: entry.enabled,
    tags: entry.tags ? [...entry.tags] : []
  };
}

function report(checks: PluginDiagnosticCheck[]): PluginDiagnosticReport {
  return {
    ok: checks.every((check) => check.status !== "error"),
    checks
  };
}

async function finalizePluginDiagnosticRuntime(
  runtime: PluginSkillRuntime
): Promise<PluginDiagnosticRuntimeFinalizationOutcome> {
  const [settlement] = await Promise.allSettled([
    invokePluginDiagnosticFinalizer(() => runtime.close())
  ]);
  return settlement.status === "rejected" ? { ok: false } : { ok: true };
}

function invokePluginDiagnosticFinalizer(
  finalizer: () => void | Promise<void>
): Promise<void> {
  try {
    return Promise.resolve(finalizer());
  } catch (error) {
    return Promise.reject(error);
  }
}

interface RegistryDocument {
  document: Record<string, unknown> & { plugins: RegistryDocumentEntry[] };
  entries: RegistryDocumentEntry[];
  exists: boolean;
}

type RegistryDocumentEntry = Record<string, unknown> & {
  id: string;
  path: string;
  enabled?: boolean;
  tags?: string[];
};

async function loadRegistryDocument(registryFile: string): Promise<RegistryDocument> {
  let raw: string;
  try {
    raw = await readFile(registryFile, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      const entries: RegistryDocumentEntry[] = [];
      return {
        document: { plugins: entries },
        entries,
        exists: false
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Plugin registry file could not be read: ${registryFile}: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Plugin registry file must be valid JSON: ${message}`);
  }
  if (!isRecord(parsed)) {
    throw new Error("Plugin registry file must be a JSON object.");
  }
  if (!Array.isArray(parsed.plugins)) {
    throw new Error("Plugin registry file requires plugins array.");
  }

  const seenIds = new Set<string>();
  const entries = parsed.plugins.map((entry, index) => parseRegistryDocumentEntry(entry, index, seenIds));
  return {
    document: {
      ...parsed,
      plugins: entries
    },
    entries,
    exists: true
  };
}

async function loadRequiredRegistryDocument(registryFile: string): Promise<RegistryDocument> {
  const registry = await loadRegistryDocument(registryFile);
  if (!registry.exists) {
    throw new Error(`Plugin registry file does not exist: ${registryFile}`);
  }
  return registry;
}

function parseRegistryDocumentEntry(value: unknown, index: number, seenIds: Set<string>): RegistryDocumentEntry {
  if (!isRecord(value)) {
    throw new Error(`Plugin registry entry at index ${index} must be an object.`);
  }
  const id = requiredRegistryString(value, "id", `Plugin registry entry at index ${index}`);
  if (seenIds.has(id)) {
    throw new Error(`Duplicate plugin registry id: ${id}`);
  }
  seenIds.add(id);
  const entryPath = requiredRegistryString(value, "path", `Plugin registry entry at index ${index}`);
  const parsed: RegistryDocumentEntry = {
    ...value,
    id,
    path: entryPath
  };
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== "boolean") {
      throw new Error(`Plugin registry entry at index ${index} field enabled must be a boolean.`);
    }
    parsed.enabled = value.enabled;
  }
  if (value.tags !== undefined) {
    parsed.tags = parseRegistryTags(value.tags, `plugins[${index}].tags`);
  }
  return parsed;
}

function requiredRegistryString(value: Record<string, unknown>, key: string, sourceName: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`${sourceName} requires non-empty string field: ${key}`);
  }
  return field;
}

function parseRegistryTags(value: unknown, sourceName: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.length > 0)) {
    throw new Error(`${sourceName} must be a non-empty string array.`);
  }
  return [...value];
}

function resolveRegistryFile(
  registryFile: string | undefined,
  environ: Record<string, string | undefined>,
  cwd: string
): string {
  const configuredFile = registryFile ?? environ.GOD_CODE_PLUGIN_REGISTRY_FILE;
  if (configuredFile === undefined || configuredFile.trim().length === 0) {
    throw new Error("Missing plugin registry file. Use --registry-file <path> or set GOD_CODE_PLUGIN_REGISTRY_FILE.");
  }
  return path.resolve(cwd, configuredFile);
}

function normalizeInstallTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    if (!isValidRegistryTag(tag)) {
      throw new Error(`Plugin registry tag must match [A-Za-z0-9][A-Za-z0-9._:-]*: ${tag}`);
    }
    if (!seen.has(tag)) {
      seen.add(tag);
      normalized.push(tag);
    }
  }
  return normalized;
}

function assertRegistryTagsValid(tags: string[]): void {
  for (const tag of tags) {
    if (!isValidRegistryTag(tag)) {
      throw new Error(`Plugin registry tag must match [A-Za-z0-9][A-Za-z0-9._:-]*: ${tag}`);
    }
  }
}

function isValidRegistryTag(tag: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(tag);
}

function readRegistryTags(entry: RegistryDocumentEntry): string[] {
  return entry.tags ? [...entry.tags] : [];
}

function computeUpdatedRegistryTags(
  previousTags: string[],
  operation: {
    addTags: string[];
    removeTags: string[];
    setTags: string[] | undefined;
    clear: boolean;
  }
): string[] {
  if (operation.clear) {
    return [];
  }
  if (operation.setTags !== undefined) {
    return operation.setTags;
  }

  const removeSet = new Set(operation.removeTags);
  const nextTags = previousTags.filter((tag) => !removeSet.has(tag));
  const nextSet = new Set(nextTags);
  for (const tag of operation.addTags) {
    if (!nextSet.has(tag)) {
      nextTags.push(tag);
      nextSet.add(tag);
    }
  }
  return nextTags;
}

function resolveRegistryTagsAction(options: {
  changed: boolean;
  clear: boolean;
  hasSetTags: boolean;
  addTags: string[];
  removeTags: string[];
}): PluginRegistryTagsAction {
  if (!options.changed) {
    return "no_op";
  }
  if (options.clear) {
    return "clear_tags";
  }
  if (options.hasSetTags || (options.addTags.length > 0 && options.removeTags.length > 0)) {
    return "set_tags";
  }
  if (options.addTags.length > 0) {
    return "add_tags";
  }
  return "remove_tags";
}

function effectiveRegistryEntryEnabled(entry: RegistryDocumentEntry): boolean {
  return entry.enabled === undefined ? true : entry.enabled;
}

function stringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function relativeRegistryPath(registryDir: string, packageDir: string): string {
  const relative = path.relative(registryDir, packageDir) || ".";
  return toPortablePath(relative);
}

function formatPathForOutput(targetPath: string, cwd: string): string {
  const relative = path.relative(cwd, targetPath);
  if (relative === "") {
    return ".";
  }
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return toPortablePath(relative);
  }
  return targetPath;
}

function toPortablePath(value: string): string {
  return value.split(path.sep).join("/");
}

async function writeRegistryDocument(
  registryFile: string,
  document: Record<string, unknown> & { plugins: RegistryDocumentEntry[] }
): Promise<void> {
  await mkdir(path.dirname(registryFile), { recursive: true });
  await writeFile(registryFile, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}

function renderPluginDetails(lines: string[], details: unknown): void {
  if (!isRecord(details)) {
    return;
  }
  if (typeof details.source === "string") {
    lines.push(
      [
        `  - source=${details.source}`,
        `plugin_dirs=${Array.isArray(details.plugin_dirs) ? details.plugin_dirs.length : 0}`,
        `enabled_plugin_ids=${Array.isArray(details.enabled_plugin_ids) ? details.enabled_plugin_ids.length : 0}`
      ].join("  ")
    );
  }
  if (typeof details.id === "string") {
    lines.push(
      [
        `  - id=${details.id}`,
        `tools=${numberValue(details.tool_count)}`,
        `permissions=${numberValue(details.permission_count)}`,
        `prompt_fragments=${numberValue(details.prompt_fragment_count)}`
      ].join("  ")
    );
  }
  if (typeof details.plugin_count === "number") {
    lines.push(
      [
        `  - plugins=${details.plugin_count}`,
        `executable_tools=${numberValue(details.tool_count)}`
      ].join("  ")
    );
  }
  if (Array.isArray(details.plugins)) {
    for (const plugin of details.plugins) {
      if (isRecord(plugin)) {
        lines.push(
          [
            `  - plugin=${stringValue(plugin.id)}`,
            `enabled=${plugin.enabled === false ? "false" : "true"}`,
            `path=${stringValue(plugin.root_dir) || stringValue(plugin.path)}`
          ].join("  ")
        );
      }
    }
  }
  if (isRecord(details.plugin)) {
    lines.push(
      [
        `  - plugin=${stringValue(details.plugin.id)}`,
        `enabled=${details.plugin.enabled === false ? "false" : "true"}`,
        `path=${stringValue(details.plugin.root_dir) || stringValue(details.plugin.path)}`
      ].join("  ")
    );
  }
  if (isRecord(details.runtime)) {
    lines.push(
      [
        `  - runtime=${stringValue(details.runtime.kind)}`,
        `entry=${stringValue(details.runtime.entry)}`,
        `timeout_ms=${numberValue(details.runtime.timeout_ms)}`,
        `env_keys=${Array.isArray(details.runtime.env_keys) ? details.runtime.env_keys.length : 0}`
      ].join("  ")
    );
  }
  const tools = details.tools;
  if (Array.isArray(tools)) {
    for (const tool of tools) {
      if (isRecord(tool)) {
        lines.push(`  - tool=${stringValue(tool.name)}  input_schema=${Boolean(tool.has_input_schema)}`);
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
