import { describe, expect, it } from "vitest";
import {
  normalizeLiveSessionCommandSearch,
  rankedLiveSessionCommandUsage,
  selectedLiveSessionCommand,
  visibleLiveSessionCommands
} from "../src/cli/tuiCommandSelectors.js";
import {
  createInitialTuiState,
  normalizeLiveSessionCommandSearch as legacyNormalizeLiveSessionCommandSearch,
  rankedLiveSessionCommandUsage as legacyRankedLiveSessionCommandUsage,
  selectedLiveSessionCommand as legacySelectedLiveSessionCommand,
  visibleLiveSessionCommands as legacyVisibleLiveSessionCommands
} from "../src/cli/tuiState.js";

describe("TUI command selectors", () => {
  it("normalizes command searches with the established length limit", () => {
    expect(normalizeLiveSessionCommandSearch("  PIN   Selected ")).toBe("pin selected ");
    expect(normalizeLiveSessionCommandSearch("x".repeat(40))).toBe("x".repeat(32));
  });

  it("filters by category and query while preserving catalog indexes", () => {
    const state = {
      ...createInitialTuiState(),
      liveSessionCommandCategory: "view" as const,
      liveSessionCommandSearch: "session",
      liveSessionCommandSortMode: "catalog" as const
    };

    expect(visibleLiveSessionCommands(state).map(({ command, index }) => [command.id, index]))
      .toEqual([
        ["filter", 4],
        ["clear_filter", 5]
      ]);
  });

  it("sorts within command groups and ranks positive usage", () => {
    const state = {
      ...createInitialTuiState(),
      liveSessionCommandSortMode: "usage" as const,
      liveSessionCommandUsageCounts: { activate: 1, pin: 2, close: 5, filter: 3 }
    };

    expect(visibleLiveSessionCommands(state).slice(0, 4).map(({ command }) => command.id))
      .toEqual(["activate", "close", "pin", "filter"]);
    expect(rankedLiveSessionCommandUsage(state, 3).map(({ command, usageCount }) => [command.id, usageCount]))
      .toEqual([
        ["close", 5],
        ["filter", 3],
        ["pin", 2]
      ]);
    expect(selectedLiveSessionCommand({ ...state, selectedLiveSessionCommandIndex: 2 })).toBe("close");
  });

  it("preserves all tuiState compatibility exports by reference", () => {
    expect(legacyNormalizeLiveSessionCommandSearch).toBe(normalizeLiveSessionCommandSearch);
    expect(legacyVisibleLiveSessionCommands).toBe(visibleLiveSessionCommands);
    expect(legacyRankedLiveSessionCommandUsage).toBe(rankedLiveSessionCommandUsage);
    expect(legacySelectedLiveSessionCommand).toBe(selectedLiveSessionCommand);
  });
});
