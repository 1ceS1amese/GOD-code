import { clamp, visibleLiveSessionIndexes } from "./tuiLiveSessionState.js";
import type { TuiAction, TuiPane, TuiState } from "./tuiTypes.js";

const PANE_ORDER: TuiPane[] = ["prompt", "live", "events", "history", "timeline", "help"];
const DEFAULT_SCROLL_AMOUNT = 1;

export function reduceTuiShellState(state: TuiState, action: TuiAction): TuiState | undefined {
  switch (action.type) {
    case "switch_pane": {
      const current = PANE_ORDER.indexOf(state.activePane);
      const next = PANE_ORDER[(current + 1) % PANE_ORDER.length] ?? "prompt";
      return {
        ...state,
        activePane: next,
        liveSessionCommandPaletteVisible: false
      };
    }
    case "scroll_pane": {
      const amount = action.amount ?? DEFAULT_SCROLL_AMOUNT;
      const pane = action.pane ?? state.activePane;
      if (pane === "history" || pane === "timeline") {
        return undefined;
      }
      if (pane === "events") {
        return {
          ...state,
          eventScrollOffset: clamp(
            state.eventScrollOffset - action.direction * amount,
            0,
            Math.max(0, state.events.length - 1)
          )
        };
      }
      if (pane === "live") {
        const visibleCount = visibleLiveSessionIndexes(state).length;
        return {
          ...state,
          liveSessionScrollOffset: clamp(
            state.liveSessionScrollOffset + action.direction * amount,
            0,
            Math.max(0, visibleCount - 1)
          )
        };
      }
      if (pane === "help") {
        return {
          ...state,
          helpScrollOffset: Math.max(0, state.helpScrollOffset + action.direction * amount)
        };
      }
      return state;
    }
    case "toggle_help":
      return {
        ...state,
        activePane: state.helpVisible ? state.activePane : "help",
        helpVisible: !state.helpVisible
      };
    case "toggle_debug":
      return {
        ...state,
        debugVisible: !state.debugVisible
      };
    case "force_redraw":
      return {
        ...state,
        redrawRequested: true
      };
    case "show_approval_modal":
      return {
        ...state,
        approvalModal: action.modal
      };
    case "hide_approval_modal":
      return {
        ...state,
        approvalModal: undefined
      };
    default:
      return undefined;
  }
}
