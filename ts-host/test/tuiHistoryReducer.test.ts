import { describe, expect, it } from "vitest";
import { reduceTuiHistoryState } from "../src/cli/tuiHistoryReducer.js";
import {
  createInitialTuiState,
  reduceTuiHistoryState as legacyReduceTuiHistoryState,
  reduceTuiState
} from "../src/cli/tuiState.js";
import type { TuiAction, TuiHistoryItem, TuiTimelineSummary } from "../src/cli/tuiTypes.js";

const history: TuiHistoryItem[] = [
  { sessionId: "one", firstPrompt: "first", lastTimestamp: "1", entryCount: 2, turnCount: 1 },
  { sessionId: "two", firstPrompt: "second", lastTimestamp: "2", entryCount: 4, turnCount: 2 }
];

const timeline: TuiTimelineSummary = {
  sessionId: "two",
  entryCount: 2,
  turnCount: 1,
  firstTimestamp: "1",
  lastTimestamp: "2",
  entries: [
    { index: 0, timestamp: "1", type: "user", turnId: "turn-1" },
    { index: 1, timestamp: "2", type: "assistant", turnId: "turn-1" }
  ]
};

describe("TUI history reducer", () => {
  it("only claims history and timeline scrolling", () => {
    const state = createInitialTuiState();

    expect(reduceTuiHistoryState(state, { type: "toggle_help" })).toBeUndefined();
    expect(reduceTuiHistoryState(state, { type: "scroll_pane", pane: "events", direction: 1 }))
      .toBeUndefined();
    expect(reduceTuiHistoryState(state, { type: "select_history", direction: 1 })).toBe(state);
  });

  it("matches the main reducer across the history and timeline lifecycle", () => {
    const actions: TuiAction[] = [
      { type: "set_history_loading", loading: true },
      { type: "set_history", history },
      { type: "select_history", direction: 1 },
      { type: "activate_history_session" },
      { type: "set_selected_timeline", timeline },
      { type: "scroll_pane", pane: "timeline", direction: 1 },
      { type: "scroll_pane", pane: "history", direction: 1 },
      { type: "set_history", history: [] }
    ];
    const now = () => "2026-01-01T00:00:00.000Z";
    let direct = createInitialTuiState(now);
    let integrated = createInitialTuiState(now);

    for (const action of actions) {
      const next = reduceTuiHistoryState(direct, action);
      expect(next, action.type).toBeDefined();
      direct = next!;
      integrated = reduceTuiState(integrated, action);
      expect(direct, action.type).toEqual(integrated);
    }
  });

  it("uses the active pane when scroll_pane omits an explicit pane", () => {
    const state = {
      ...createInitialTuiState(),
      activePane: "timeline" as const,
      selectedTimeline: timeline
    };

    expect(reduceTuiHistoryState(state, { type: "scroll_pane", direction: 1 })?.timelineScrollOffset)
      .toBe(1);
  });

  it("preserves the tuiState compatibility export", () => {
    expect(legacyReduceTuiHistoryState).toBe(reduceTuiHistoryState);
  });
});
