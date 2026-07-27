import { clamp, scrollSelectionIntoView } from "./tuiLiveSessionState.js";
import type { TuiAction, TuiState } from "./tuiTypes.js";

const DEFAULT_SCROLL_AMOUNT = 1;

export function reduceTuiHistoryState(state: TuiState, action: TuiAction): TuiState | undefined {
  switch (action.type) {
    case "select_history": {
      if (state.history.length === 0) {
        return state;
      }
      const selectedHistoryIndex = clamp(
        state.selectedHistoryIndex + action.direction,
        0,
        state.history.length - 1
      );
      return {
        ...state,
        selectedHistoryIndex,
        historyScrollOffset: scrollSelectionIntoView(selectedHistoryIndex, state.historyScrollOffset, 5),
        timelineScrollOffset: 0
      };
    }
    case "activate_history_session": {
      const selected = state.history[state.selectedHistoryIndex];
      if (!selected) {
        return state;
      }
      return {
        ...state,
        activePane: "timeline",
        viewedSessionId: selected.sessionId,
        timelineScrollOffset: 0,
        helpVisible: false
      };
    }
    case "scroll_pane": {
      const pane = action.pane ?? state.activePane;
      if (pane !== "history" && pane !== "timeline") {
        return undefined;
      }
      const amount = action.amount ?? DEFAULT_SCROLL_AMOUNT;
      if (pane === "history") {
        return {
          ...state,
          historyScrollOffset: clamp(
            state.historyScrollOffset + action.direction * amount,
            0,
            Math.max(0, state.history.length - 1)
          )
        };
      }
      return {
        ...state,
        timelineScrollOffset: clamp(
          state.timelineScrollOffset + action.direction * amount,
          0,
          Math.max(0, (state.selectedTimeline?.entries.length ?? 0) - 1)
        )
      };
    }
    case "set_history":
      return {
        ...state,
        history: action.history,
        selectedHistoryIndex: clamp(state.selectedHistoryIndex, 0, Math.max(0, action.history.length - 1)),
        historyScrollOffset: clamp(state.historyScrollOffset, 0, Math.max(0, action.history.length - 1)),
        viewedSessionId: action.history.some((item) => item.sessionId === state.viewedSessionId)
          ? state.viewedSessionId
          : action.history[0]?.sessionId,
        selectedTimeline: action.history.length === 0 ? undefined : state.selectedTimeline
      };
    case "set_history_loading":
      return {
        ...state,
        historyLoading: action.loading
      };
    case "set_selected_timeline":
      return {
        ...state,
        historyLoading: false,
        selectedTimeline: action.timeline,
        timelineScrollOffset: clamp(
          state.timelineScrollOffset,
          0,
          Math.max(0, (action.timeline?.entries.length ?? 0) - 1)
        )
      };
    default:
      return undefined;
  }
}
