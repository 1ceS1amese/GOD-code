import { describe, expect, it } from "vitest";
import * as cycleRegistries from "../src/cli/tuiCycleRegistries.js";
import {
  createInitialTuiState,
  reduceTuiState,
  type TuiAction
} from "../src/cli/tuiState.js";
import * as legacyTuiState from "../src/cli/tuiState.js";

describe("TUI cycle registries module", () => {
  it("owns the complete runtime export surface", () => {
    expect(Object.keys(cycleRegistries)).toHaveLength(31);
    expect(cycleRegistries.LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_PROFILES)
      .toEqual(["compact", "full", "adaptive"]);
    expect(cycleRegistries.LIVE_SESSION_COMMAND_LATEST_WIDTH_BUCKET_LABEL_VISIBILITY_PROFILES)
      .toEqual(["shown", "hidden", "adaptive"]);
  });

  it("combines the three profile families and enum actions without losing entries", () => {
    const profileKeys = Object.keys(cycleRegistries.LIVE_SESSION_COMMAND_PROFILE_CYCLE_REGISTRY);
    const enumKeys = Object.keys(cycleRegistries.LIVE_SESSION_COMMAND_ENUM_CYCLE_REGISTRY);
    const combinedKeys = Object.keys(cycleRegistries.LIVE_SESSION_COMMAND_CYCLE_REGISTRY);

    expect(Object.keys(cycleRegistries.LIVE_SESSION_COMMAND_LATEST_PROFILE_CYCLE_REGISTRY)).toHaveLength(10);
    expect(Object.keys(cycleRegistries.LIVE_SESSION_COMMAND_NEIGHBOR_LEGEND_PROFILE_CYCLE_REGISTRY)).toHaveLength(9);
    expect(Object.keys(cycleRegistries.LIVE_SESSION_COMMAND_DEEPEST_NESTED_PROFILE_CYCLE_REGISTRY)).toHaveLength(7);
    expect(profileKeys).toHaveLength(26);
    expect(enumKeys).toHaveLength(8);
    expect(combinedKeys).toHaveLength(34);
    expect(new Set(combinedKeys)).toEqual(new Set([...profileKeys, ...enumKeys]));
  });

  it("preserves every compatibility export through tuiState", () => {
    for (const [exportName, value] of Object.entries(cycleRegistries)) {
      expect(legacyTuiState[exportName as keyof typeof legacyTuiState], exportName).toBe(value);
    }
  });

  it("drives the integrated reducer through the extracted registry", () => {
    const openState = {
      ...createInitialTuiState(),
      liveSessionCommandPaletteVisible: true,
      helpVisible: true
    };
    const categoryAction = { type: "cycle_live_session_command_category" } as TuiAction;
    const profileAction = {
      type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_profile"
    } as TuiAction;

    const categorized = reduceTuiState(openState, categoryAction);
    expect(categorized.liveSessionCommandCategory).toBe("session");
    expect(categorized.helpVisible).toBe(false);

    const profiled = reduceTuiState(categorized, profileAction);
    expect(profiled.liveSessionCommandNeighborProgressBucketHelpLegendProfile).toBe("full");
  });
});
