import type { ToolCatalogEntry } from "../types/godCodeProtocol.js";
import { isRecord } from "../types/godCodeProtocol.js";

export type PluginRuntimeKind = "node-subprocess";

export interface PluginRuntimeSpec {
  kind: PluginRuntimeKind;
  entry: string;
  timeout_ms?: number;
  env_keys?: string[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  runtime?: PluginRuntimeSpec;
  tools?: ToolCatalogEntry[];
  permissions?: string[];
  promptFragments?: string[];
}

const PLUGIN_MANIFEST_JSON_SCHEMA: Record<string, unknown> = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "GOD-code Plugin / Skill Manifest",
  description: "Declarative manifest for GOD-code local plugin.json and skill.json files.",
  type: "object",
  required: ["id", "name", "version"],
  additionalProperties: true,
  properties: {
    id: {
      type: "string",
      minLength: 1,
      description: "Stable plugin or skill identifier."
    },
    name: {
      type: "string",
      minLength: 1,
      description: "Human-readable plugin or skill name."
    },
    version: {
      type: "string",
      minLength: 1,
      description: "Manifest version string."
    },
    tools: {
      type: "array",
      description: "Optional declarative tool catalog entries.",
      items: {
        type: "object",
        required: ["name", "description"],
        additionalProperties: true,
        properties: {
          name: {
            type: "string",
            minLength: 1
          },
          description: {
            type: "string",
            minLength: 1
          },
          input_schema: {
            type: "object",
            description: "Optional JSON schema-like input shape passed through as ToolCatalogEntry.input_schema."
          }
        }
      }
    },
    runtime: {
      type: "object",
      description: "Optional runtime for plugin-owned executable tool handlers.",
      required: ["kind", "entry"],
      additionalProperties: true,
      properties: {
        kind: {
          type: "string",
          enum: ["node-subprocess"],
          description: "Runtime kind. Phase35 supports node-subprocess only."
        },
        entry: {
          type: "string",
          minLength: 1,
          description: "Relative path inside the plugin root to the Node.js runtime entry file."
        },
        timeout_ms: {
          type: "integer",
          minimum: 1,
          description: "Optional per-tool-call timeout in milliseconds."
        },
        env_keys: {
          type: "array",
          description: "Optional host environment variable names forwarded to the runtime.",
          items: {
            type: "string",
            minLength: 1
          }
        }
      }
    },
    permissions: {
      type: "array",
      description: "Optional permission declarations. They do not bypass host policy.",
      items: {
        type: "string"
      }
    },
    promptFragments: {
      type: "array",
      description: "Optional prompt fragments loaded by the host plugin runtime.",
      items: {
        type: "string"
      }
    }
  }
};

export class PluginManifestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PluginManifestError";
  }
}

export function parsePluginManifest(value: unknown): PluginManifest {
  if (!isRecord(value)) {
    throw new PluginManifestError("Plugin manifest must be an object.");
  }

  const id = requiredString(value, "id");
  const name = requiredString(value, "name");
  const version = requiredString(value, "version");
  const manifest: PluginManifest = { id, name, version };

  if (value.runtime !== undefined) {
    manifest.runtime = parseRuntime(value.runtime);
  }
  if (value.tools !== undefined) {
    manifest.tools = parseTools(value.tools);
  }
  if (value.permissions !== undefined) {
    manifest.permissions = parseStringList(value.permissions, "permissions");
  }
  if (value.promptFragments !== undefined) {
    manifest.promptFragments = parseStringList(value.promptFragments, "promptFragments");
  }

  return manifest;
}

export function pluginManifestJsonSchema(): Record<string, unknown> {
  return structuredClone(PLUGIN_MANIFEST_JSON_SCHEMA);
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new PluginManifestError(`Plugin manifest requires non-empty string field: ${key}`);
  }
  return field;
}

function parseTools(value: unknown): ToolCatalogEntry[] {
  if (!Array.isArray(value)) {
    throw new PluginManifestError("Plugin manifest tools must be an array.");
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new PluginManifestError("Plugin tool entry must be an object.");
    }
    const entry: ToolCatalogEntry = {
      name: requiredString(item, "name"),
      description: requiredString(item, "description")
    };
    if (item.input_schema !== undefined) {
      if (!isRecord(item.input_schema)) {
        throw new PluginManifestError("Plugin tool input_schema must be an object.");
      }
      entry.input_schema = { ...item.input_schema };
    }
    return entry;
  });
}

function parseRuntime(value: unknown): PluginRuntimeSpec {
  if (!isRecord(value)) {
    throw new PluginManifestError("Plugin manifest runtime must be an object.");
  }
  const kind = requiredString(value, "kind");
  if (kind !== "node-subprocess") {
    throw new PluginManifestError('Plugin manifest runtime.kind must be "node-subprocess".');
  }
  const entry = requiredString(value, "entry");
  validateRuntimeEntry(entry);

  const runtime: PluginRuntimeSpec = {
    kind,
    entry
  };
  if (value.timeout_ms !== undefined) {
    runtime.timeout_ms = parsePositiveInteger(value.timeout_ms, "runtime.timeout_ms");
  }
  if (value.env_keys !== undefined) {
    runtime.env_keys = parseStringList(value.env_keys, "runtime.env_keys");
    for (const envKey of runtime.env_keys) {
      if (envKey.length === 0) {
        throw new PluginManifestError("Plugin manifest runtime.env_keys must not contain empty strings.");
      }
    }
  }
  return runtime;
}

function parseStringList(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new PluginManifestError(`Plugin manifest ${key} must be a string array.`);
  }
  return [...value];
}

function parsePositiveInteger(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new PluginManifestError(`Plugin manifest ${key} must be a positive integer.`);
  }
  return value;
}

function validateRuntimeEntry(entry: string): void {
  if (entry.startsWith("/") || entry.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(entry)) {
    throw new PluginManifestError("Plugin manifest runtime.entry must be a relative path inside the plugin root.");
  }
  const segments = entry.split(/[\\/]+/);
  if (segments.some((segment) => segment === "..")) {
    throw new PluginManifestError("Plugin manifest runtime.entry must not contain .. path segments.");
  }
  if (segments.filter((segment) => segment !== "" && segment !== ".").length === 0) {
    throw new PluginManifestError("Plugin manifest runtime.entry must point to a file inside the plugin root.");
  }
}
