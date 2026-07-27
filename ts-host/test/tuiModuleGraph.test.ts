import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cliDir = path.resolve("src/cli");
const modules = fs.readdirSync(cliDir)
  .filter((file) => /^tui.*\.ts$/.test(file))
  .sort();
const moduleSet = new Set(modules);

function dependencies(file: string): string[] {
  const source = fs.readFileSync(path.join(cliDir, file), "utf8");
  return [...source.matchAll(/(?:from\s+|export\s+\*\s+from\s+)["']\.\/(tui[^"']+)\.js["']/g)]
    .map((match) => `${match[1]}.ts`)
    .filter((dependency, index, values) => values.indexOf(dependency) === index)
    .sort();
}

const graph = new Map(modules.map((file) => [file, dependencies(file)]));

function stronglyConnectedComponents(): string[][] {
  let nextIndex = 0;
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (module: string): void => {
    indexes.set(module, nextIndex);
    lowLinks.set(module, nextIndex);
    nextIndex += 1;
    stack.push(module);
    onStack.add(module);

    for (const dependency of graph.get(module) ?? []) {
      if (!indexes.has(dependency)) {
        visit(dependency);
        lowLinks.set(module, Math.min(lowLinks.get(module)!, lowLinks.get(dependency)!));
      } else if (onStack.has(dependency)) {
        lowLinks.set(module, Math.min(lowLinks.get(module)!, indexes.get(dependency)!));
      }
    }

    if (lowLinks.get(module) !== indexes.get(module)) {
      return;
    }
    const component: string[] = [];
    let current: string;
    do {
      current = stack.pop()!;
      onStack.delete(current);
      component.push(current);
    } while (current !== module);
    components.push(component.sort());
  };

  for (const module of modules) {
    if (!indexes.has(module)) {
      visit(module);
    }
  }
  return components;
}

describe("TUI module dependency graph", () => {
  it("resolves every local TUI dependency to a checked-in module", () => {
    const missing = [...graph].flatMap(([file, deps]) =>
      deps.filter((dependency) => !moduleSet.has(dependency)).map((dependency) => `${file} -> ${dependency}`)
    );
    expect(missing).toEqual([]);
  });

  it("keeps the complete TUI module graph acyclic", () => {
    const cycles = stronglyConnectedComponents().filter((component) => component.length > 1);
    expect(cycles).toEqual([]);
  });

  it("keeps foundation modules independent from higher layers", () => {
    const foundation = [
      "tuiAdaptiveVisibility.ts",
      "tuiCommandPaletteConstants.ts",
      "tuiProfileRegistry.ts",
      "tuiTypes.ts",
      "tuiWidthMetrics.ts"
    ];
    expect(Object.fromEntries(foundation.map((file) => [file, graph.get(file)]))).toEqual({
      "tuiAdaptiveVisibility.ts": [],
      "tuiCommandPaletteConstants.ts": [],
      "tuiProfileRegistry.ts": [],
      "tuiTypes.ts": [],
      "tuiWidthMetrics.ts": []
    });
  });

  it("keeps presentation and reducer layers separated", () => {
    const presentationModules = modules.filter((file) =>
      file.includes("Presentation") || ["tuiDebug.ts", "tuiHelp.ts", "tuiRenderer.ts"].includes(file)
    );
    const reducerModules = modules.filter((file) => file.endsWith("Reducer.ts") && file !== "tuiConfiguredReducer.ts");
    const reducerSet = new Set(reducerModules);
    const presentationSet = new Set(presentationModules);

    const presentationToReducer = presentationModules.flatMap((file) =>
      (graph.get(file) ?? []).filter((dependency) => reducerSet.has(dependency)).map((dependency) => `${file} -> ${dependency}`)
    );
    const reducerToPresentation = reducerModules.flatMap((file) =>
      (graph.get(file) ?? []).filter((dependency) => presentationSet.has(dependency)).map((dependency) => `${file} -> ${dependency}`)
    );

    expect(presentationToReducer).toEqual([]);
    expect(reducerToPresentation).toEqual([]);
  });

  it("keeps formal configuration and facade edges explicit", () => {
    expect(graph.get("tuiConfiguredReducer.ts")).toEqual(["tuiCycleRegistries.ts", "tuiReducer.ts"]);
    expect(modules.filter((file) => file !== "tuiState.ts" && graph.get(file)?.includes("tuiState.ts"))).toEqual([]);
    expect(graph.get("tuiState.ts")).toHaveLength(19);
  });
});
