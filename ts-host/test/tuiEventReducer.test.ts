import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendAssistantDelta,
  finalizeAssistantMessage,
  reduceTuiEventState,
  setEventsForSession
} from "../src/cli/tuiEventReducer.js";
import {
  appendAssistantDelta as legacyAppendAssistantDelta,
  createInitialTuiState,
  finalizeAssistantMessage as legacyFinalizeAssistantMessage,
  reduceTuiEventState as legacyReduceTuiEventState,
  reduceTuiState,
  setEventsForSession as legacySetEventsForSession
} from "../src/cli/tuiState.js";
import type { TuiAction, TuiState } from "../src/cli/tuiTypes.js";

afterEach(() => {
  vi.useRealTimers();
});

function eventState(): TuiState {
  return {
    ...createInitialTuiState(),
    sessionId: "alpha",
    status: "idle",
    liveSessions: [
      { sessionId: "alpha", status: "idle", unreadCount: 0, pinned: false },
      { sessionId: "beta", status: "idle", unreadCount: 0, pinned: false }
    ],
    events: [],
    eventsBySessionId: { alpha: [], beta: [] }
  };
}

describe("TUI event reducer", () => {
  it("returns undefined for actions outside the session/event stream domain", () => {
    expect(reduceTuiEventState(eventState(), { type: "toggle_help" })).toBeUndefined();
  });

  it("matches the main reducer for session start, streaming, inactive events, and errors", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T00:00:00.000Z"));
    const actions: TuiAction[] = [
      { type: "session_started", sessionId: "alpha" },
      { type: "append_event", event: { kind: "tool_call", text: "Read", timestamp: "1" } },
      { type: "append_assistant_delta", event: { kind: "assistant", text: "hel", timestamp: "2" } },
      { type: "append_assistant_delta", event: { kind: "assistant", text: "lo", timestamp: "3" } },
      { type: "finalize_assistant_message", event: { kind: "assistant", text: "hello", timestamp: "4" } },
      { type: "append_event", sessionId: "beta", event: { kind: "tool_result", text: "ok", timestamp: "5" } },
      { type: "set_error", error: "failed" }
    ];
    let direct = eventState();
    let integrated = eventState();

    for (const action of actions) {
      const next = reduceTuiEventState(direct, action);
      expect(next, action.type).toBeDefined();
      direct = next!;
      integrated = reduceTuiState(integrated, action);
      expect(direct, action.type).toEqual(integrated);
    }

    expect(direct.events.some(({ text, streaming }) => text === "hello" && streaming === false)).toBe(true);
    expect(direct.liveSessions[1]?.unreadCount).toBe(1);
    expect(direct.events.at(-1)).toMatchObject({ kind: "error", text: "failed" });
  });

  it("keeps empty deltas and empty standalone final messages as no-ops", () => {
    const state = eventState();
    const empty = { kind: "assistant" as const, text: "", timestamp: "1" };

    expect(appendAssistantDelta(state, empty, "alpha")).toBe(state);
    expect(finalizeAssistantMessage(state, empty, "alpha")).toBe(state);
  });

  it("preserves tuiState compatibility exports", () => {
    expect(legacyReduceTuiEventState).toBe(reduceTuiEventState);
    expect(legacyAppendAssistantDelta).toBe(appendAssistantDelta);
    expect(legacyFinalizeAssistantMessage).toBe(finalizeAssistantMessage);
    expect(legacySetEventsForSession).toBe(setEventsForSession);
  });
});
