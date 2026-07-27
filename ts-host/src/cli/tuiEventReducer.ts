import {
  clearLiveSessionUnread,
  currentSessionKey,
  eventsForSession,
  incrementLiveSessionUnread,
  scrollSelectionIntoView,
  updateActiveLiveSessionStatus,
  upsertLiveSession
} from "./tuiLiveSessionState.js";
import type { TuiAction, TuiEvent, TuiState } from "./tuiTypes.js";

const MAX_EVENTS = 200;

export function reduceTuiEventState(state: TuiState, action: TuiAction): TuiState | undefined {
  switch (action.type) {
    case "session_started": {
      const sessionId = action.sessionId ?? state.sessionId;
      const liveSessions = sessionId ? upsertLiveSession(state.liveSessions, sessionId, "idle") : state.liveSessions;
      const activeLiveSessionIndex = sessionId
        ? Math.max(0, liveSessions.findIndex((session) => session.sessionId === sessionId))
        : state.activeLiveSessionIndex;
      const sessionEvents = sessionId
        ? state.eventsBySessionId[sessionId] ?? (state.liveSessions.length === 0 ? state.events : [])
        : state.events;
      return {
        ...state,
        sessionId,
        liveSessions: clearLiveSessionUnread(liveSessions, activeLiveSessionIndex),
        activeLiveSessionIndex,
        selectedLiveSessionIndex: activeLiveSessionIndex,
        liveSessionScrollOffset: scrollSelectionIntoView(activeLiveSessionIndex, state.liveSessionScrollOffset, 5),
        liveSessionCommandPaletteVisible: false,
        events: sessionEvents,
        eventsBySessionId: sessionId
          ? { ...state.eventsBySessionId, [sessionId]: sessionEvents }
          : state.eventsBySessionId,
        eventScrollOffset: 0,
        status: "idle",
        cancelRequested: false,
        redrawRequested: false,
        lastError: undefined
      };
    }
    case "append_event": {
      const sessionId = action.sessionId ?? currentSessionKey(state);
      return setEventsForSession(
        state,
        sessionId,
        [...eventsForSession(state, sessionId), action.event].slice(-MAX_EVENTS),
        true
      );
    }
    case "append_assistant_delta":
      return appendAssistantDelta(state, action.event, action.sessionId ?? currentSessionKey(state));
    case "finalize_assistant_message":
      return finalizeAssistantMessage(state, action.event, action.sessionId ?? currentSessionKey(state));
    case "set_error":
      return setEventsForSession({
        ...state,
        liveSessions: updateActiveLiveSessionStatus(state, "error"),
        status: "error",
        lastError: action.error
      }, currentSessionKey(state), [
        ...eventsForSession(state, currentSessionKey(state)),
        { kind: "error" as const, text: action.error, timestamp: defaultNow() }
      ].slice(-MAX_EVENTS), true);
    default:
      return undefined;
  }
}

export function appendAssistantDelta(state: TuiState, event: TuiEvent, sessionId: string): TuiState {
  if (event.text.length === 0) {
    return state;
  }
  const events = eventsForSession(state, sessionId);
  const last = events[events.length - 1];
  if (last?.kind === "assistant" && last.streaming) {
    return setEventsForSession(
      state,
      sessionId,
      [...events.slice(0, -1), { ...last, text: last.text + event.text, timestamp: event.timestamp, streaming: true }],
      false
    );
  }
  return setEventsForSession(
    state,
    sessionId,
    [...events, { ...event, kind: "assistant" as const, streaming: true }].slice(-MAX_EVENTS),
    true
  );
}

export function finalizeAssistantMessage(state: TuiState, event: TuiEvent, sessionId: string): TuiState {
  const events = eventsForSession(state, sessionId);
  const last = events[events.length - 1];
  if (last?.kind === "assistant" && last.streaming) {
    const text = event.text.startsWith(last.text) || last.text.startsWith(event.text)
      ? longestText(last.text, event.text)
      : event.text;
    return setEventsForSession(
      state,
      sessionId,
      [...events.slice(0, -1), { ...last, text, timestamp: event.timestamp, streaming: false }],
      false
    );
  }
  if (event.text.length === 0) {
    return state;
  }
  return setEventsForSession(
    state,
    sessionId,
    [...events, { ...event, kind: "assistant" as const, streaming: false }].slice(-MAX_EVENTS),
    true
  );
}

export function setEventsForSession(
  state: TuiState,
  sessionId: string,
  events: TuiEvent[],
  incrementScrollOffset: boolean
): TuiState {
  const active = sessionId === currentSessionKey(state);
  return {
    ...state,
    liveSessions: !active && incrementScrollOffset
      ? incrementLiveSessionUnread(state.liveSessions, sessionId)
      : state.liveSessions,
    eventsBySessionId: { ...state.eventsBySessionId, [sessionId]: events },
    events: active ? events : state.events,
    eventScrollOffset: active && incrementScrollOffset && state.eventScrollOffset !== 0
      ? state.eventScrollOffset + 1
      : state.eventScrollOffset
  };
}

export function defaultNow(): string {
  return new Date().toISOString();
}

function longestText(left: string, right: string): string {
  return left.length >= right.length ? left : right;
}
