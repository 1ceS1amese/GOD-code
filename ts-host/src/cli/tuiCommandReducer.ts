import {
  liveSessionCommandGroups,
  TUI_LIVE_SESSION_COMMANDS
} from "./tuiCommandCatalog.js";
import {
  normalizeLiveSessionCommandSearch,
  visibleLiveSessionCommands
} from "./tuiCommandSelectors.js";
import { toggleLiveSessionPinnedCommandHistory } from "./tuiCommandActions.js";
import type { TuiAction, TuiState } from "./tuiTypes.js";

export function reduceTuiCommandPaletteState(state: TuiState, action: TuiAction): TuiState | undefined {
  switch (action.type) {
      case "open_live_session_command_palette":
        return {
          ...state,
          activePane: "live",
          liveSessionCommandPaletteVisible: true,
          liveSessionCommandSearch: "",
          liveSessionCommandCategory: "all",
          liveSessionCommandScrollOffset: 0,
          selectedLiveSessionCommandIndex: clamp(
            state.selectedLiveSessionCommandIndex,
            0,
            TUI_LIVE_SESSION_COMMANDS.length - 1
          ),
          helpVisible: false
        };
      case "close_live_session_command_palette":
        return {
          ...state,
          liveSessionCommandPaletteVisible: false,
          liveSessionCommandSearch: "",
          helpVisible: false
        };
      case "select_live_session_command": {
        if (!state.liveSessionCommandPaletteVisible) {
          return state;
        }
        const visibleCommands = visibleLiveSessionCommands(state);
        if (visibleCommands.length === 0) {
          return state;
        }
        const currentVisibleIndex = visibleCommands.findIndex(({ index }) => index === state.selectedLiveSessionCommandIndex);
        const nextVisibleIndex = currentVisibleIndex === -1
          ? (action.direction === 1 ? 0 : visibleCommands.length - 1)
          : state.liveSessionCommandSelectionWrap
            ? (currentVisibleIndex + action.direction + visibleCommands.length) % visibleCommands.length
            : clamp(currentVisibleIndex + action.direction, 0, visibleCommands.length - 1);
        const wrapped = state.liveSessionCommandSelectionWrap
          && currentVisibleIndex !== -1
          && ((action.direction === -1 && currentVisibleIndex === 0)
            || (action.direction === 1 && currentVisibleIndex === visibleCommands.length - 1));
        return {
          ...state,
          selectedLiveSessionCommandIndex: visibleCommands[nextVisibleIndex]?.index ?? state.selectedLiveSessionCommandIndex,
          liveSessionCommandScrollOffset: wrapped
            ? nextVisibleIndex
            : nextVisibleIndex < state.liveSessionCommandScrollOffset
              ? nextVisibleIndex
              : state.liveSessionCommandScrollOffset,
          helpVisible: false
        };
      }
      case "scroll_live_session_command_palette": {
        if (!state.liveSessionCommandPaletteVisible) {
          return state;
        }
        const visibleCommands = visibleLiveSessionCommands(state);
        if (visibleCommands.length === 0) {
          return state;
        }
        const currentVisibleIndex = visibleCommands.findIndex(({ index }) => index === state.selectedLiveSessionCommandIndex);
        const amount = Math.max(1, action.amount ?? state.liveSessionCommandPageSize);
        const nextVisibleIndex = clamp(
          (currentVisibleIndex === -1 ? 0 : currentVisibleIndex) + action.direction * amount,
          0,
          visibleCommands.length - 1
        );
        return {
          ...state,
          selectedLiveSessionCommandIndex: visibleCommands[nextVisibleIndex]?.index ?? state.selectedLiveSessionCommandIndex,
          liveSessionCommandScrollOffset: nextVisibleIndex,
          helpVisible: false
        };
      }
      case "jump_live_session_command_palette": {
        if (!state.liveSessionCommandPaletteVisible) {
          return state;
        }
        const visibleCommands = visibleLiveSessionCommands(state);
        if (visibleCommands.length === 0) {
          return state;
        }
        const targetPosition = action.target === "first" ? 0 : visibleCommands.length - 1;
        return {
          ...state,
          selectedLiveSessionCommandIndex: visibleCommands[targetPosition]?.index ?? state.selectedLiveSessionCommandIndex,
          liveSessionCommandScrollOffset: targetPosition,
          helpVisible: false
        };
      }
      case "toggle_live_session_command_selection_wrap":
        if (!state.liveSessionCommandPaletteVisible) {
          return state;
        }
        return {
          ...state,
          liveSessionCommandSelectionWrap: !state.liveSessionCommandSelectionWrap,
          helpVisible: false
        };
      case "jump_live_session_command_group": {
        if (!state.liveSessionCommandPaletteVisible) {
          return state;
        }
        const visibleCommands = visibleLiveSessionCommands(state);
        if (visibleCommands.length === 0) {
          return state;
        }
        const groups = liveSessionCommandGroups(visibleCommands);
        const currentVisiblePosition = visibleCommands.findIndex(({ index }) => index === state.selectedLiveSessionCommandIndex);
        let currentGroupIndex = 0;
        for (const [groupIndex, group] of groups.entries()) {
          if (group.startPosition > Math.max(0, currentVisiblePosition)) {
            break;
          }
          currentGroupIndex = groupIndex;
        }
        const requestedGroupIndex = currentGroupIndex + action.direction;
        const targetGroupIndex = state.liveSessionCommandSelectionWrap
          ? (requestedGroupIndex + groups.length) % groups.length
          : clamp(requestedGroupIndex, 0, groups.length - 1);
        if (targetGroupIndex === currentGroupIndex) {
          return state;
        }
        const targetPosition = groups[targetGroupIndex]?.startPosition ?? 0;
        return {
          ...state,
          selectedLiveSessionCommandIndex: visibleCommands[targetPosition]?.index ?? state.selectedLiveSessionCommandIndex,
          liveSessionCommandScrollOffset: targetPosition,
          helpVisible: false
        };
      }
      case "append_live_session_command_search": {
        if (!state.liveSessionCommandPaletteVisible || !action.text) {
          return state;
        }
        const liveSessionCommandSearch = normalizeLiveSessionCommandSearch(state.liveSessionCommandSearch + action.text);
        const visibleCommands = visibleLiveSessionCommands({ ...state, liveSessionCommandSearch });
        return {
          ...state,
          liveSessionCommandSearch,
          selectedLiveSessionCommandIndex: visibleCommands[0]?.index ?? state.selectedLiveSessionCommandIndex,
          liveSessionCommandScrollOffset: 0,
          helpVisible: false
        };
      }
      case "backspace_live_session_command_search": {
        if (!state.liveSessionCommandPaletteVisible || state.liveSessionCommandSearch.length === 0) {
          return state;
        }
        const liveSessionCommandSearch = state.liveSessionCommandSearch.slice(0, -1);
        const visibleCommands = visibleLiveSessionCommands({ ...state, liveSessionCommandSearch });
        return {
          ...state,
          liveSessionCommandSearch,
          selectedLiveSessionCommandIndex: visibleCommands[0]?.index ?? state.selectedLiveSessionCommandIndex,
          liveSessionCommandScrollOffset: 0,
          helpVisible: false
        };
      }
      case "clear_live_session_command_search": {
        if (!state.liveSessionCommandPaletteVisible || state.liveSessionCommandSearch.length === 0) {
          return state;
        }
        const visibleCommands = visibleLiveSessionCommands({ ...state, liveSessionCommandSearch: "" });
        return {
          ...state,
          liveSessionCommandSearch: "",
          selectedLiveSessionCommandIndex: visibleCommands[0]?.index ?? state.selectedLiveSessionCommandIndex,
          liveSessionCommandScrollOffset: 0,
          helpVisible: false
        };
      }
      case "toggle_live_session_command_usage_ranking":
        if (!state.liveSessionCommandPaletteVisible) {
          return state;
        }
        return {
          ...state,
          liveSessionCommandUsageRankingVisible: !state.liveSessionCommandUsageRankingVisible,
          helpVisible: false
        };
      case "toggle_live_session_command_usage_ranking_layout":
        if (!state.liveSessionCommandPaletteVisible) {
          return state;
        }
        return {
          ...state,
          liveSessionCommandUsageRankingLayout: state.liveSessionCommandUsageRankingLayout === "single"
            ? "multi"
            : "single",
          helpVisible: false
        };
      case "toggle_live_session_command_summary_priority":
        if (!state.liveSessionCommandPaletteVisible) {
          return state;
        }
        return {
          ...state,
          liveSessionCommandSummaryPriority: state.liveSessionCommandSummaryPriority === "history"
            ? "ranking"
            : "history",
          helpVisible: false
        };
      case "toggle_live_session_command_neighbor_progress_bucket_help": {
        if (!state.liveSessionCommandPaletteVisible) {
          return state;
        }
        return {
          ...state,
          liveSessionCommandNeighborProgressBucketHelpVisible:
            !state.liveSessionCommandNeighborProgressBucketHelpVisible,
          helpVisible: false
        };
      }
      case "toggle_live_session_command_history_pin": {
        if (!state.liveSessionCommandPaletteVisible) {
          return state;
        }
        const visibleCommands = visibleLiveSessionCommands(state);
        const selectedCommand = visibleCommands.find(({ index }) => index === state.selectedLiveSessionCommandIndex)
          ?? visibleCommands[0];
        if (!selectedCommand) {
          return state;
        }
        return {
          ...state,
          liveSessionPinnedCommandHistory: toggleLiveSessionPinnedCommandHistory(
            state.liveSessionPinnedCommandHistory,
            selectedCommand.command.id
          ),
          helpVisible: false
        };
      }
      case "clear_live_session_command_history": {
        if (!state.liveSessionCommandPaletteVisible) {
          return state;
        }
        if (
          state.liveSessionCommandHistory.length === 0
          && state.liveSessionPinnedCommandHistory.length === 0
          && Object.keys(state.liveSessionCommandUsageCounts).length === 0
        ) {
          return state;
        }
        return {
          ...state,
          liveSessionCommandHistory: [],
          liveSessionPinnedCommandHistory: [],
          liveSessionCommandUsageCounts: {},
          helpVisible: false
        };
      }
    default:
      return undefined;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
