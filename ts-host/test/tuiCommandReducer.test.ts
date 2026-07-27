import { describe, expect, it } from "vitest";
import { reduceTuiCommandPaletteState } from "../src/cli/tuiCommandReducer.js";
import {
  createInitialTuiState,
  reduceTuiCommandPaletteState as legacyReduceTuiCommandPaletteState,
  reduceTuiState
} from "../src/cli/tuiState.js";
import type { TuiAction } from "../src/cli/tuiTypes.js";

describe("TUI command palette reducer", () => {
  it("returns undefined for actions owned by other reducers", () => {
    const state = createInitialTuiState();

    expect(reduceTuiCommandPaletteState(state, { type: "toggle_help" })).toBeUndefined();
    expect(reduceTuiCommandPaletteState(state, { type: "cycle_live_session_command_category" }))
      .toBeUndefined();
  });

  it("returns the same state for handled actions disabled by a closed palette", () => {
    const state = createInitialTuiState();

    expect(reduceTuiCommandPaletteState(state, { type: "select_live_session_command", direction: 1 }))
      .toBe(state);
  });

  it("matches the main reducer for the complete non-registry palette transition sequence", () => {
    const actions: TuiAction[] = [
      { type: "open_live_session_command_palette" },
      { type: "select_live_session_command", direction: 1 },
      { type: "scroll_live_session_command_palette", direction: 1, amount: 2 },
      { type: "jump_live_session_command_palette", target: "last" },
      { type: "toggle_live_session_command_selection_wrap" },
      { type: "jump_live_session_command_group", direction: 1 },
      { type: "append_live_session_command_search", text: "session" },
      { type: "backspace_live_session_command_search" },
      { type: "clear_live_session_command_search" },
      { type: "toggle_live_session_command_usage_ranking" },
      { type: "toggle_live_session_command_usage_ranking_layout" },
      { type: "toggle_live_session_command_summary_priority" },
      { type: "toggle_live_session_command_neighbor_progress_bucket_help" },
      { type: "toggle_live_session_command_history_pin" },
      { type: "clear_live_session_command_history" },
      { type: "close_live_session_command_palette" }
    ];
    const now = () => "2026-07-26T00:00:00.000Z";
    let direct = createInitialTuiState(now);
    let integrated = createInitialTuiState(now);

    for (const action of actions) {
      const next = reduceTuiCommandPaletteState(direct, action);
      expect(next, action.type).toBeDefined();
      direct = next!;
      integrated = reduceTuiState(integrated, action);
      expect(direct, action.type).toEqual(integrated);
    }
  });

  it("preserves the tuiState compatibility export by reference", () => {
    expect(legacyReduceTuiCommandPaletteState).toBe(reduceTuiCommandPaletteState);
  });
});
