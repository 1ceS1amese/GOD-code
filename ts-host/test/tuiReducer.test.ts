import { afterEach, describe, expect, it, vi } from "vitest";
import { createTuiReducer } from "../src/cli/tuiReducer.js";
import {
  createInitialTuiState,
  LIVE_SESSION_COMMAND_CYCLE_REGISTRY,
  reduceTuiState
} from "../src/cli/tuiState.js";
import type { TuiAction } from "../src/cli/tuiTypes.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("TUI reducer composition", () => {
  it("injects cycle registries without depending on the tuiState facade", () => {
    const withoutCycles = createTuiReducer({});
    const withCycles = createTuiReducer(LIVE_SESSION_COMMAND_CYCLE_REGISTRY);
    const open = {
      ...createInitialTuiState(),
      liveSessionCommandPaletteVisible: true
    };
    const action: TuiAction = { type: "cycle_live_session_command_category" };

    expect(withoutCycles(open, action)).toBe(open);
    expect(withCycles(open, action).liveSessionCommandCategory).toBe("session");
  });

  it("matches the compatibility reducer across every reducer domain", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T00:00:00.000Z"));
    const direct = createTuiReducer(LIVE_SESSION_COMMAND_CYCLE_REGISTRY);
    const actions: TuiAction[] = [
      { type: "session_started", sessionId: "session" },
      { type: "append_prompt", text: "hello" },
      { type: "open_live_session_command_palette" },
      { type: "cycle_live_session_command_category" },
      { type: "close_live_session_command_palette" },
      { type: "toggle_help" },
      { type: "set_history", history: [] },
      { type: "append_event", event: { kind: "system", text: "event", timestamp: "1" } }
    ];
    let expected = createInitialTuiState();
    let actual = createInitialTuiState();

    for (const action of actions) {
      expected = reduceTuiState(expected, action);
      actual = direct(actual, action);
      expect(actual, action.type).toEqual(expected);
    }
  });

  it("keeps command palette source bookkeeping ahead of domain reducers", () => {
    const reducer = createTuiReducer(LIVE_SESSION_COMMAND_CYCLE_REGISTRY);
    const state = {
      ...createInitialTuiState(),
      liveSessionCommandPaletteVisible: true
    };
    const next = reducer(state, {
      type: "cycle_live_session_sort_mode",
      source: "command_palette"
    });

    expect(next.liveSessionCommandHistory).toEqual(["sort"]);
    expect(next.liveSessionCommandUsageCounts).toEqual({ sort: 1 });
    expect(next.liveSessionSortMode).toBe("name");
  });

  it("returns the original state for an unknown action", () => {
    const reducer = createTuiReducer(LIVE_SESSION_COMMAND_CYCLE_REGISTRY);
    const state = createInitialTuiState();
    expect(reducer(state, { type: "unknown" } as unknown as TuiAction)).toBe(state);
  });
});
