import { describe, expect, it } from "vitest";
import {
  liveSessionCommandGroupKey,
  liveSessionCommandGroupNeighborLabel,
  liveSessionCommandGroupNeighbors,
  liveSessionCommandGroups,
  TUI_LIVE_SESSION_COMMANDS
} from "../src/cli/tuiCommandCatalog.js";
import {
  liveSessionCommandGroupKey as legacyLiveSessionCommandGroupKey,
  liveSessionCommandGroupNeighborLabel as legacyLiveSessionCommandGroupNeighborLabel,
  liveSessionCommandGroupNeighbors as legacyLiveSessionCommandGroupNeighbors,
  liveSessionCommandGroups as legacyLiveSessionCommandGroups,
  TUI_LIVE_SESSION_COMMANDS as LEGACY_TUI_LIVE_SESSION_COMMANDS
} from "../src/cli/tuiState.js";

describe("TUI command catalog", () => {
  it("defines the stable command ids, keys, and categories", () => {
    expect(TUI_LIVE_SESSION_COMMANDS.map(({ id }) => id)).toEqual([
      "activate",
      "pin",
      "close",
      "sort",
      "filter",
      "clear_filter",
      "close_inactive",
      "unpin_all",
      "mark_read"
    ]);
    expect(new Set(TUI_LIVE_SESSION_COMMANDS.map(({ key }) => key)).size).toBe(9);
    expect(TUI_LIVE_SESSION_COMMANDS.filter(({ favorite }) => favorite).map(({ id }) => id))
      .toEqual(["activate"]);
  });

  it("groups visible commands and resolves wrapped neighbors", () => {
    const visible = TUI_LIVE_SESSION_COMMANDS.map((command, index) => ({ command, index }));
    const groups = liveSessionCommandGroups(visible);

    expect(groups).toEqual([
      { key: "favorite", startPosition: 0, size: 1, firstCommandKey: "1", firstCommandId: "activate" },
      { key: "session", startPosition: 1, size: 2, firstCommandKey: "2", firstCommandId: "pin" },
      { key: "view", startPosition: 3, size: 3, firstCommandKey: "4", firstCommandId: "sort" },
      { key: "bulk", startPosition: 6, size: 3, firstCommandKey: "x", firstCommandId: "close_inactive" }
    ]);
    expect(liveSessionCommandGroupNeighbors(groups, 0, true)).toEqual({
      previous: groups[3],
      next: groups[1]
    });
    expect(liveSessionCommandGroupNeighborLabel(groups[1]!, "compact")).toBe("session");
    expect(liveSessionCommandGroupNeighborLabel(groups[1]!, "standard")).toBe("session(2)@2");
    expect(liveSessionCommandGroupNeighborLabel(groups[1]!, "full")).toBe("session(2)@2#2:pin");
  });

  it("preserves the complete tuiState runtime export surface", () => {
    expect(LEGACY_TUI_LIVE_SESSION_COMMANDS).toBe(TUI_LIVE_SESSION_COMMANDS);
    expect(legacyLiveSessionCommandGroupKey).toBe(liveSessionCommandGroupKey);
    expect(legacyLiveSessionCommandGroups).toBe(liveSessionCommandGroups);
    expect(legacyLiveSessionCommandGroupNeighbors).toBe(liveSessionCommandGroupNeighbors);
    expect(legacyLiveSessionCommandGroupNeighborLabel).toBe(liveSessionCommandGroupNeighborLabel);
  });
});
