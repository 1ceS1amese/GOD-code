import {
  clamp,
  clearLiveSessionUnread,
  eventsForSession,
  LIVE_SESSION_SORT_MODES,
  normalizeLiveSessionDisplayName,
  normalizeLiveSessionFilter,
  scrollSelectionIntoView,
  sortPinnedLiveSessions,
  visibleLiveSessionIndexes,
  wrapIndex
} from "./tuiLiveSessionState.js";
import type { TuiAction, TuiState } from "./tuiTypes.js";

export function reduceTuiLiveSessionState(state: TuiState, action: TuiAction): TuiState | undefined {
  switch (action.type) {
      case "create_live_session":
        return state;
      case "switch_live_session": {
        if (state.liveSessions.length <= 1 || state.status === "running" || state.status === "stopping") {
          return state;
        }
        const activeLiveSessionIndex = wrapIndex(
          state.activeLiveSessionIndex + action.direction,
          state.liveSessions.length
        );
        const sessionId = state.liveSessions[activeLiveSessionIndex]?.sessionId ?? state.sessionId;
        return {
          ...state,
          sessionId,
          liveSessions: clearLiveSessionUnread(state.liveSessions, activeLiveSessionIndex),
          activeLiveSessionIndex,
          selectedLiveSessionIndex: activeLiveSessionIndex,
          liveSessionScrollOffset: scrollSelectionIntoView(activeLiveSessionIndex, state.liveSessionScrollOffset, 5),
          liveSessionCommandPaletteVisible: false,
          events: eventsForSession(state, sessionId),
          eventScrollOffset: 0,
          activePane: "prompt",
          promptBuffer: "",
          submitRequested: undefined,
          lastError: undefined,
          helpVisible: false
        };
      }
      case "select_live_session": {
        const visibleIndexes = visibleLiveSessionIndexes(state);
        if (visibleIndexes.length === 0) {
          return state;
        }
        const currentVisibleIndex = visibleIndexes.indexOf(state.selectedLiveSessionIndex);
        const selectedVisibleIndex = clamp(
          currentVisibleIndex === -1
            ? (action.direction === 1 ? 0 : visibleIndexes.length - 1)
            : currentVisibleIndex + action.direction,
          0,
          visibleIndexes.length - 1
        );
        const selectedLiveSessionIndex = visibleIndexes[selectedVisibleIndex] ?? state.selectedLiveSessionIndex;
        return {
          ...state,
          selectedLiveSessionIndex,
          liveSessionScrollOffset: scrollSelectionIntoView(selectedVisibleIndex, state.liveSessionScrollOffset, 5)
        };
      }
      case "activate_live_session": {
        if (state.liveSessions.length === 0 || state.status === "running" || state.status === "stopping") {
          return state;
        }
        const activeLiveSessionIndex = clamp(state.selectedLiveSessionIndex, 0, state.liveSessions.length - 1);
        const sessionId = state.liveSessions[activeLiveSessionIndex]?.sessionId ?? state.sessionId;
        return {
          ...state,
          sessionId,
          liveSessions: clearLiveSessionUnread(state.liveSessions, activeLiveSessionIndex),
          activeLiveSessionIndex,
          selectedLiveSessionIndex: activeLiveSessionIndex,
          liveSessionScrollOffset: scrollSelectionIntoView(activeLiveSessionIndex, state.liveSessionScrollOffset, 5),
          liveSessionCommandPaletteVisible: false,
          events: eventsForSession(state, sessionId),
          eventScrollOffset: 0,
          activePane: "prompt",
          promptBuffer: "",
          submitRequested: undefined,
          lastError: undefined,
          helpVisible: false
        };
      }
      case "close_live_session": {
        if (state.liveSessions.length <= 1 || state.status === "running" || state.status === "stopping") {
          return state;
        }
        const closeIndex = clamp(state.selectedLiveSessionIndex, 0, state.liveSessions.length - 1);
        const closingSession = state.liveSessions[closeIndex];
        if (!closingSession || closingSession.status === "running" || closingSession.status === "stopping") {
          return state;
        }
        const remainingSessions = state.liveSessions.filter((_, index) => index !== closeIndex);
        const activeLiveSessionIndex = closeIndex === state.activeLiveSessionIndex
          ? clamp(closeIndex - 1, 0, remainingSessions.length - 1)
          : closeIndex < state.activeLiveSessionIndex
            ? state.activeLiveSessionIndex - 1
            : state.activeLiveSessionIndex;
        const selectedLiveSessionIndex = clamp(Math.min(closeIndex, remainingSessions.length - 1), 0, remainingSessions.length - 1);
        const sessionId = remainingSessions[activeLiveSessionIndex]?.sessionId;
        const eventsBySessionId = { ...state.eventsBySessionId };
        delete eventsBySessionId[closingSession.sessionId];
        return {
          ...state,
          sessionId,
          liveSessions: clearLiveSessionUnread(remainingSessions, activeLiveSessionIndex),
          activeLiveSessionIndex,
          selectedLiveSessionIndex,
          liveSessionScrollOffset: scrollSelectionIntoView(selectedLiveSessionIndex, state.liveSessionScrollOffset, 5),
          liveSessionCommandPaletteVisible: false,
          events: sessionId ? eventsBySessionId[sessionId] ?? [] : [],
          eventsBySessionId,
          eventScrollOffset: 0,
          activePane: "prompt",
          promptBuffer: "",
          submitRequested: undefined,
          lastError: undefined,
          helpVisible: false,
          status: remainingSessions[activeLiveSessionIndex]?.status ?? "idle"
        };
      }
      case "toggle_live_session_pin": {
        if (state.liveSessions.length === 0) {
          return state;
        }
        const selectedSession = state.liveSessions[clamp(state.selectedLiveSessionIndex, 0, state.liveSessions.length - 1)];
        const activeSessionId = state.liveSessions[state.activeLiveSessionIndex]?.sessionId ?? state.sessionId;
        if (!selectedSession) {
          return state;
        }
        const liveSessions = sortPinnedLiveSessions(state.liveSessions.map((session) =>
          session.sessionId === selectedSession.sessionId
            ? { ...session, pinned: !session.pinned }
            : session
        ));
        const activeLiveSessionIndex = Math.max(0, liveSessions.findIndex((session) => session.sessionId === activeSessionId));
        const selectedLiveSessionIndex = Math.max(0, liveSessions.findIndex((session) => session.sessionId === selectedSession.sessionId));
        const selectedVisibleIndex = visibleLiveSessionIndexes({ ...state, liveSessions }).indexOf(selectedLiveSessionIndex);
        return {
          ...state,
          liveSessions,
          activeLiveSessionIndex,
          selectedLiveSessionIndex,
          liveSessionScrollOffset: selectedVisibleIndex === -1
            ? state.liveSessionScrollOffset
            : scrollSelectionIntoView(selectedVisibleIndex, state.liveSessionScrollOffset, 5),
          liveSessionCommandPaletteVisible: false
        };
      }
      case "rename_live_session": {
        if (state.liveSessions.length === 0) {
          return state;
        }
        const label = normalizeLiveSessionDisplayName(action.label ?? state.promptBuffer);
        if (!label) {
          return state;
        }
        const selectedIndex = clamp(state.selectedLiveSessionIndex, 0, state.liveSessions.length - 1);
        const selectedSession = state.liveSessions[selectedIndex];
        if (!selectedSession) {
          return state;
        }
        return {
          ...state,
          liveSessions: state.liveSessions.map((session) =>
            session.sessionId === selectedSession.sessionId
              ? { ...session, displayName: label }
              : session
          ),
          promptBuffer: action.label === undefined ? "" : state.promptBuffer,
          liveSessionCommandPaletteVisible: false,
          helpVisible: false
        };
      }
      case "set_live_session_filter": {
        const liveSessionFilter = normalizeLiveSessionFilter(action.filter ?? state.promptBuffer);
        if (!liveSessionFilter) {
          return {
            ...state,
            liveSessionFilter: "",
            liveSessionScrollOffset: 0,
            promptBuffer: action.filter === undefined ? "" : state.promptBuffer,
            liveSessionCommandPaletteVisible: false,
            helpVisible: false
          };
        }
        const visibleIndexes = visibleLiveSessionIndexes({ ...state, liveSessionFilter });
        const selectedLiveSessionIndex = visibleIndexes.includes(state.selectedLiveSessionIndex)
          ? state.selectedLiveSessionIndex
          : visibleIndexes[0] ?? state.selectedLiveSessionIndex;
        const selectedVisibleIndex = Math.max(0, visibleIndexes.indexOf(selectedLiveSessionIndex));
        return {
          ...state,
          liveSessionFilter,
          selectedLiveSessionIndex,
          liveSessionScrollOffset: scrollSelectionIntoView(selectedVisibleIndex, 0, 5),
          promptBuffer: action.filter === undefined ? "" : state.promptBuffer,
          liveSessionCommandPaletteVisible: false,
          helpVisible: false
        };
      }
      case "clear_live_session_filter":
        return {
          ...state,
          liveSessionFilter: "",
          liveSessionScrollOffset: scrollSelectionIntoView(state.selectedLiveSessionIndex, 0, 5),
          liveSessionCommandPaletteVisible: false,
          helpVisible: false
        };
      case "cycle_live_session_sort_mode": {
        const current = LIVE_SESSION_SORT_MODES.indexOf(state.liveSessionSortMode);
        const liveSessionSortMode = LIVE_SESSION_SORT_MODES[(current + 1) % LIVE_SESSION_SORT_MODES.length] ?? "manual";
        const visibleIndexes = visibleLiveSessionIndexes({ ...state, liveSessionSortMode });
        const selectedVisibleIndex = Math.max(0, visibleIndexes.indexOf(state.selectedLiveSessionIndex));
        return {
          ...state,
          liveSessionSortMode,
          liveSessionScrollOffset: scrollSelectionIntoView(selectedVisibleIndex, 0, 5),
          liveSessionCommandPaletteVisible: false,
          helpVisible: false
        };
      }
      case "close_inactive_live_sessions": {
        if (state.liveSessions.length <= 1 || state.status === "running" || state.status === "stopping") {
          return state;
        }
        const activeSession = state.liveSessions[state.activeLiveSessionIndex];
        if (!activeSession) {
          return state;
        }
        const remainingSessions = state.liveSessions.filter((session, index) =>
          index === state.activeLiveSessionIndex || session.status === "running" || session.status === "stopping"
        );
        if (remainingSessions.length === state.liveSessions.length) {
          return state;
        }
        const activeLiveSessionIndex = Math.max(0, remainingSessions.findIndex((session) => session.sessionId === activeSession.sessionId));
        const selectedSession = state.liveSessions[state.selectedLiveSessionIndex];
        const selectedLiveSessionIndex = selectedSession
          ? remainingSessions.findIndex((session) => session.sessionId === selectedSession.sessionId)
          : -1;
        const normalizedSelectedLiveSessionIndex = selectedLiveSessionIndex < 0
          ? activeLiveSessionIndex
          : selectedLiveSessionIndex;
        const eventsBySessionId = { ...state.eventsBySessionId };
        for (const session of state.liveSessions) {
          if (!remainingSessions.some((remaining) => remaining.sessionId === session.sessionId)) {
            delete eventsBySessionId[session.sessionId];
          }
        }
        return {
          ...state,
          sessionId: activeSession.sessionId,
          liveSessions: clearLiveSessionUnread(remainingSessions, activeLiveSessionIndex),
          activeLiveSessionIndex,
          selectedLiveSessionIndex: normalizedSelectedLiveSessionIndex,
          liveSessionScrollOffset: scrollSelectionIntoView(normalizedSelectedLiveSessionIndex, 0, 5),
          liveSessionCommandPaletteVisible: false,
          events: eventsBySessionId[activeSession.sessionId] ?? [],
          eventsBySessionId,
          eventScrollOffset: 0,
          promptBuffer: "",
          submitRequested: undefined,
          lastError: undefined,
          helpVisible: false,
          status: remainingSessions[activeLiveSessionIndex]?.status ?? "idle"
        };
      }
      case "unpin_all_live_sessions": {
        if (!state.liveSessions.some((session) => session.pinned)) {
          return state;
        }
        return {
          ...state,
          liveSessions: state.liveSessions.map((session) => ({
            ...session,
            pinned: false
          })),
          liveSessionCommandPaletteVisible: false,
          helpVisible: false
        };
      }
      case "clear_all_live_session_unread": {
        if (!state.liveSessions.some((session) => session.unreadCount > 0)) {
          return state;
        }
        return {
          ...state,
          liveSessions: state.liveSessions.map((session) => ({
            ...session,
            unreadCount: 0
          })),
          liveSessionCommandPaletteVisible: false,
          helpVisible: false
        };
      }
    default:
      return undefined;
  }
}
