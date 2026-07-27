import { readFile } from "node:fs/promises";
import { parsePluginManifest, type PluginManifest } from "./manifest.js";

export function loadPluginManifest(value: unknown): PluginManifest {
  return parsePluginManifest(value);
}

export async function loadPluginManifestFile(path: string): Promise<PluginManifest> {
  const raw = await readFile(path, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse plugin manifest JSON at ${path}: ${message}`);
  }
  return loadPluginManifest(value);
}
