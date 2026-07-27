import { afterEach, describe, expect, it, vi } from "vitest";
import { reduceTuiLiveSessionState } from "../src/cli/tuiLiveSessionReducer.js";
import {
  normalizeLiveSessionDisplayName,
  normalizeLiveSessionFilter,
  visibleLiveSessionIndexes
} from "../src/cli/tuiLiveSessionState.js";
import {
  createInitialTuiState,
  reduceTuiLiveSessionState as legacyReduceTuiLiveSessionState,
  reduceTuiState,
  visibleLiveSessionIndexes as legacyVisibleLiveSessionIndexes
} from "../src/cli/tuiState.js";
import type { TuiAction, TuiState } from "../src/cli/tuiTypes.js";

afterEach(() => {
  vi.useRealTimers();
});

function liveState(): TuiState {
  return {
    ...createInitialTuiState(),
    sessionId: "alpha",
    status: "idle",
    liveSessions: [
      { sessionId: "alpha", status: "idle", unreadCount: 2, pinned: false },
      { sessionId: "beta", status: "idle", unreadCount: 1, pinned: false },
      { sessionId: "gamma", status: "stopped", unreadCount: 0, pinned: false }
    ],
    activeLiveSessionIndex: 0,
    selectedLiveSessionIndex: 0,
    eventsBySessionId: {
      alpha: [{ kind: "system", text: "alpha", timestamp: "1" }],
      beta: [{ kind: "system", text: "beta", timestamp: "2" }],
      gamma: [{ kind: "system", text: "gamma", timestamp: "3" }]
    }
  };
}

describe("TUI live session reducer", () => {
  it("distinguishes unhandled actions from handled no-op actions", () => {
    const state = liveState();

    expect(reduceTuiLiveSessionState(state, { type: "toggle_help" })).toBeUndefined();
    expect(reduceTuiLiveSessionState(state, { type: "create_live_session" })).toBe(state);
  });

  it("matches the main reducer across every live session action family", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T00:00:00.000Z"));
    const actions: TuiAction[] = [
      { type: "create_live_session" },
      { type: "select_live_session", direction: 1 },
      { type: "activate_live_session" },
      { type: "switch_live_session", direction: 1 },
      { type: "toggle_live_session_pin" },
      { type: "rename_live_session", label: "  Renamed   Session  " },
      { type: "set_live_session_filter", filter: "idle" },
      { type: "clear_live_session_filter" },
      { type: "cycle_live_session_sort_mode" },
      { type: "clear_all_live_session_unread" },
      { type: "unpin_all_live_sessions" },
      { type: "close_live_session" },
      { type: "close_inactive_live_sessions" }
    ];
    let direct = liveState();
    let integrated = liveState();

    for (const action of actions) {
      const next = reduceTuiLiveSessionState(direct, action);
      expect(next, action.type).toBeDefined();
      direct = next!;
      integrated = reduceTuiState(integrated, action);
      expect(direct, action.type).toEqual(integrated);
    }
  });

  it("keeps normalization and visible-session sorting contracts", () => {
    expect(normalizeLiveSessionDisplayName("  Demo   Name  ")).toBe("Demo Name");
    expect(normalizeLiveSessionFilter("  PINNED   idle  ")).toBe("PINNED idle");

    const state = liveState();
    state.liveSessions[1] = { ...state.liveSessions[1]!, pinned: true };
    expect(visibleLiveSessionIndexes({ ...state, liveSessionSortMode: "manual" })).toEqual([1, 0, 2]);
    expect(visibleLiveSessionIndexes({ ...state, liveSessionFilter: "unread" })).toEqual([1, 0]);
  });

  it("preserves tuiState compatibility exports", () => {
    expect(legacyReduceTuiLiveSessionState).toBe(reduceTuiLiveSessionState);
    expect(legacyVisibleLiveSessionIndexes).toBe(visibleLiveSessionIndexes);
  });
});
