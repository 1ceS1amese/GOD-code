import { afterEach, describe, expect, it, vi } from "vitest";
import { reduceTuiPromptState } from "../src/cli/tuiPromptReducer.js";
import {
  createInitialTuiState,
  reduceTuiPromptState as legacyReduceTuiPromptState,
  reduceTuiState
} from "../src/cli/tuiState.js";
import type { TuiAction, TuiState } from "../src/cli/tuiTypes.js";

function promptState(): TuiState {
  return {
    ...createInitialTuiState(),
    sessionId: "session",
    status: "idle",
    liveSessions: [
      { sessionId: "session", status: "idle", unreadCount: 0, pinned: false }
    ]
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("TUI prompt reducer", () => {
  it("distinguishes unrelated actions from disabled prompt edits", () => {
    const state = promptState();
    const blocked = { ...state, status: "running" as const };

    expect(reduceTuiPromptState(state, { type: "toggle_help" })).toBeUndefined();
    expect(reduceTuiPromptState(blocked, { type: "append_prompt", text: "x" })).toBe(blocked);
  });

  it("matches the main reducer across editing and a cancelled turn lifecycle", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T00:00:00.000Z"));
    const actions: TuiAction[] = [
      { type: "set_status", status: "idle" },
      { type: "append_prompt", text: "hello" },
      { type: "append_prompt", text: " world" },
      { type: "backspace_prompt" },
      { type: "append_prompt", text: "d" },
      { type: "submit_prompt" },
      { type: "request_cancel" },
      { type: "turn_finished", status: "cancelled" },
      { type: "clear_prompt" },
      { type: "request_exit" }
    ];
    let direct = promptState();
    let integrated = promptState();

    for (const action of actions) {
      const next = reduceTuiPromptState(direct, action);
      expect(next, action.type).toBeDefined();
      direct = next!;
      integrated = reduceTuiState(integrated, action);
      expect(direct, action.type).toEqual(integrated);
    }
  });

  it("preserves error completion and idle cancel semantics", () => {
    const running = {
      ...promptState(),
      status: "running" as const,
      submitRequested: "prompt"
    };
    const failed = reduceTuiPromptState(running, {
      type: "turn_finished",
      status: "error",
      error: "failed"
    });
    expect(failed).toMatchObject({ status: "idle", lastError: "failed", submitRequested: undefined });
    expect(failed?.liveSessions[0]?.status).toBe("error");

    expect(reduceTuiPromptState(promptState(), { type: "request_cancel" })?.exitRequested).toBe(true);
  });

  it("preserves the tuiState compatibility export", () => {
    expect(legacyReduceTuiPromptState).toBe(reduceTuiPromptState);
  });
});
