import { describe, expect, it } from "vitest";
import { reduceTuiShellState } from "../src/cli/tuiShellReducer.js";
import {
  createInitialTuiState,
  reduceTuiShellState as legacyReduceTuiShellState,
  reduceTuiState
} from "../src/cli/tuiState.js";
import type { TuiAction, TuiApprovalModal, TuiState } from "../src/cli/tuiTypes.js";

const modal: TuiApprovalModal = {
  toolName: "Write",
  reason: "test",
  cwd: "/tmp",
  sessionId: "session",
  turnId: "turn",
  toolCallId: "call",
  inputLines: [{ label: "path", value: "file.txt" }],
  truncated: false,
  redacted: false
};

function shellState(): TuiState {
  return {
    ...createInitialTuiState(),
    liveSessions: [
      { sessionId: "one", status: "idle", unreadCount: 0, pinned: false },
      { sessionId: "two", status: "idle", unreadCount: 0, pinned: false }
    ],
    events: [
      { kind: "system", text: "one", timestamp: "1" },
      { kind: "system", text: "two", timestamp: "2" }
    ]
  };
}

describe("TUI shell reducer", () => {
  it("leaves history and timeline scrolling to the history reducer", () => {
    const state = shellState();

    expect(reduceTuiShellState(state, { type: "scroll_pane", pane: "history", direction: 1 }))
      .toBeUndefined();
    expect(reduceTuiShellState(state, { type: "scroll_pane", pane: "timeline", direction: 1 }))
      .toBeUndefined();
    expect(reduceTuiShellState(state, { type: "append_prompt", text: "x" })).toBeUndefined();
  });

  it("matches the main reducer across shell, scroll, overlay, and redraw actions", () => {
    const actions: TuiAction[] = [
      { type: "switch_pane" },
      { type: "scroll_pane", pane: "live", direction: 1 },
      { type: "scroll_pane", pane: "events", direction: -1 },
      { type: "scroll_pane", pane: "help", direction: 1, amount: 3 },
      { type: "toggle_help" },
      { type: "toggle_debug" },
      { type: "force_redraw" },
      { type: "show_approval_modal", modal },
      { type: "hide_approval_modal" }
    ];
    let direct = shellState();
    let integrated = shellState();

    for (const action of actions) {
      const next = reduceTuiShellState(direct, action);
      expect(next, action.type).toBeDefined();
      direct = next!;
      integrated = reduceTuiState(integrated, action);
      expect(direct, action.type).toEqual(integrated);
    }
  });

  it("treats prompt scrolling as a handled no-op", () => {
    const state = shellState();
    expect(reduceTuiShellState(state, { type: "scroll_pane", pane: "prompt", direction: 1 }))
      .toBe(state);
  });

  it("preserves the tuiState compatibility export", () => {
    expect(legacyReduceTuiShellState).toBe(reduceTuiShellState);
  });
});
