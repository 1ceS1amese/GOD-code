import { describe, expect, it } from "vitest";
import {
  incrementLiveSessionCommandUsage,
  liveSessionCommandIdForPaletteAction,
  recordLiveSessionCommandHistory,
  toggleLiveSessionPinnedCommandHistory,
  tuiActionForLiveSessionCommand
} from "../src/cli/tuiCommandActions.js";
import * as legacyState from "../src/cli/tuiState.js";
import type { TuiLiveSessionCommandId } from "../src/cli/tuiTypes.js";

describe("TUI command actions", () => {
  it("maps every command id to its palette action and back", () => {
    const expected = {
      activate: "activate_live_session",
      pin: "toggle_live_session_pin",
      close: "close_live_session",
      sort: "cycle_live_session_sort_mode",
      filter: "set_live_session_filter",
      clear_filter: "clear_live_session_filter",
      close_inactive: "close_inactive_live_sessions",
      unpin_all: "unpin_all_live_sessions",
      mark_read: "clear_all_live_session_unread"
    } as const satisfies Record<TuiLiveSessionCommandId, string>;

    for (const [commandId, actionType] of Object.entries(expected)) {
      const action = tuiActionForLiveSessionCommand(
        commandId as TuiLiveSessionCommandId,
        "command_palette"
      );
      expect(action).toEqual({ type: actionType, source: "command_palette" });
      expect(liveSessionCommandIdForPaletteAction(action)).toBe(commandId);
    }
  });

  it("does not record equivalent actions from outside the palette", () => {
    expect(liveSessionCommandIdForPaletteAction({ type: "activate_live_session" })).toBeUndefined();
    expect(liveSessionCommandIdForPaletteAction({ type: "toggle_help" })).toBeUndefined();
  });

  it("maintains bounded, deduplicated history and immutable usage counts", () => {
    expect(recordLiveSessionCommandHistory(
      ["pin", "close", "sort", "filter", "clear_filter"],
      "sort"
    )).toEqual(["sort", "pin", "close", "filter", "clear_filter"]);

    expect(toggleLiveSessionPinnedCommandHistory(["pin", "close"], "pin")).toEqual(["close"]);
    expect(toggleLiveSessionPinnedCommandHistory(
      ["pin", "close", "sort", "filter", "clear_filter"],
      "activate"
    )).toEqual(["activate", "pin", "close", "sort", "filter"]);

    const counts = { pin: 2 };
    expect(incrementLiveSessionCommandUsage(counts, "pin")).toEqual({ pin: 3 });
    expect(counts).toEqual({ pin: 2 });
  });

  it("preserves every tuiState compatibility export by reference", () => {
    expect(legacyState.tuiActionForLiveSessionCommand).toBe(tuiActionForLiveSessionCommand);
    expect(legacyState.liveSessionCommandIdForPaletteAction).toBe(liveSessionCommandIdForPaletteAction);
    expect(legacyState.recordLiveSessionCommandHistory).toBe(recordLiveSessionCommandHistory);
    expect(legacyState.incrementLiveSessionCommandUsage).toBe(incrementLiveSessionCommandUsage);
    expect(legacyState.toggleLiveSessionPinnedCommandHistory).toBe(toggleLiveSessionPinnedCommandHistory);
  });
});
