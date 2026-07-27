import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { reduceTuiState } from "../src/cli/tuiConfiguredReducer.js";
import { createInitialTuiState } from "../src/cli/tuiStateFactory.js";
import * as legacyTuiState from "../src/cli/tuiState.js";

const cliDir = path.resolve("src/cli");

describe("TUI compatibility facade", () => {
  it("keeps the configured reducer as the facade reducer reference", () => {
    expect(legacyTuiState.reduceTuiState).toBe(reduceTuiState);
  });

  it("configures the reducer with the formal cycle registry", () => {
    const state = {
      ...createInitialTuiState(() => "time"),
      liveSessionCommandPaletteVisible: true
    };
    const next = reduceTuiState(state, { type: "cycle_live_session_command_page_size" });

    expect(next.liveSessionCommandPageSize).toBe(7);
  });

  it("keeps production modules off the compatibility facade", () => {
    const offenders = fs.readdirSync(cliDir)
      .filter((file) => file.endsWith(".ts") && file !== "tuiState.ts")
      .filter((file) => fs.readFileSync(path.join(cliDir, file), "utf8").includes('from "./tuiState.js"'));

    expect(offenders).toEqual([]);
  });

  it("keeps tuiState as a re-export-only facade", () => {
    const source = fs.readFileSync(path.join(cliDir, "tuiState.ts"), "utf8");

    expect(source).not.toMatch(/^import /m);
    expect(source).not.toMatch(/^export (?:const|function|class) /m);
    expect(source.trim().split("\n")).toHaveLength(19);
  });
});
