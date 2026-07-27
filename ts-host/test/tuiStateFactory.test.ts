import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInitialTuiState,
  createTuiEvent
} from "../src/cli/tuiStateFactory.js";
import {
  createInitialTuiState as legacyCreateInitialTuiState,
  createTuiEvent as legacyCreateTuiEvent
} from "../src/cli/tuiState.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("TUI state factory", () => {
  it("creates the complete initial state with an injectable timestamp", () => {
    const now = vi.fn(() => "2026-07-12T00:00:00.000Z");
    const state = createInitialTuiState(now);

    expect(Object.keys(state)).toHaveLength(70);
    expect(state).toMatchObject({
      status: "starting",
      activePane: "prompt",
      liveSessionCommandPageSize: 5,
      liveSessionCommandCategory: "all",
      liveSessionCommandSortMode: "catalog",
      liveSessionCommandNeighborProgressBucketHelpLegendProfile: "compact",
      liveSessionCommandLatestWidthBucketLabelVisibilityProfile: "shown"
    });
    expect(state.events).toEqual([{
      kind: "system",
      text: "Starting GOD-code TUI.",
      timestamp: "2026-07-12T00:00:00.000Z"
    }]);
    expect(now).toHaveBeenCalledTimes(1);
  });

  it("returns fresh mutable collections for every state", () => {
    const first = createInitialTuiState(() => "1");
    const second = createInitialTuiState(() => "2");

    expect(first).not.toBe(second);
    expect(first.events).not.toBe(second.events);
    expect(first.liveSessions).not.toBe(second.liveSessions);
    expect(first.liveSessionCommandUsageCounts).not.toBe(second.liveSessionCommandUsageCounts);
    first.liveSessionCommandHistory.push("create" as never);
    expect(second.liveSessionCommandHistory).toEqual([]);
  });

  it("creates standalone events with injected and default clocks", () => {
    expect(createTuiEvent("assistant", "done", () => "custom-time")).toEqual({
      kind: "assistant",
      text: "done",
      timestamp: "custom-time"
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T01:02:03.004Z"));
    expect(createTuiEvent("system", "ready").timestamp).toBe("2026-07-12T01:02:03.004Z");
  });

  it("preserves tuiState compatibility exports", () => {
    expect(legacyCreateInitialTuiState).toBe(createInitialTuiState);
    expect(legacyCreateTuiEvent).toBe(createTuiEvent);
  });
});
