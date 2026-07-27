import {
  incrementLiveSessionCommandUsage,
  liveSessionCommandIdForPaletteAction,
  recordLiveSessionCommandHistory
} from "./tuiCommandActions.js";
import { reduceTuiCommandPaletteState } from "./tuiCommandReducer.js";
import { reduceTuiEventState } from "./tuiEventReducer.js";
import { reduceTuiHistoryState } from "./tuiHistoryReducer.js";
import { reduceTuiLiveSessionState } from "./tuiLiveSessionReducer.js";
import { reduceTuiPromptState } from "./tuiPromptReducer.js";
import { cycleTuiValueFromRegistry, type TuiCycleRegistry } from "./tuiProfileRegistry.js";
import { reduceTuiShellState } from "./tuiShellReducer.js";
import { visibleLiveSessionCommands } from "./tuiCommandSelectors.js";
import type { TuiAction, TuiState } from "./tuiTypes.js";

export type TuiReducer = (state: TuiState, action: TuiAction) => TuiState;

export function createTuiReducer(cycleRegistry: TuiCycleRegistry): TuiReducer {
  const reduceTuiState: TuiReducer = (state, action) => {
    const paletteCommandId = liveSessionCommandIdForPaletteAction(action);
    if (paletteCommandId) {
      const actionWithoutSource = { ...action, source: undefined } as TuiAction;
      return reduceTuiState(
        {
          ...state,
          liveSessionCommandHistory: recordLiveSessionCommandHistory(
            state.liveSessionCommandHistory,
            paletteCommandId
          ),
          liveSessionCommandUsageCounts: incrementLiveSessionCommandUsage(
            state.liveSessionCommandUsageCounts,
            paletteCommandId
          )
        },
        actionWithoutSource
      );
    }

    const cycleState = cycleTuiValueFromRegistry(state, action.type, cycleRegistry, {
      enabled: state.liveSessionCommandPaletteVisible,
      patch: { helpVisible: false }
    });
    if (cycleState) {
      if (
        state.liveSessionCommandPaletteVisible
        && (action.type === "cycle_live_session_command_category"
          || action.type === "cycle_live_session_command_sort_mode")
      ) {
        const visibleCommands = visibleLiveSessionCommands(cycleState);
        return {
          ...cycleState,
          selectedLiveSessionCommandIndex: visibleCommands[0]?.index ?? cycleState.selectedLiveSessionCommandIndex,
          liveSessionCommandScrollOffset: 0
        };
      }
      return cycleState;
    }

    return reduceTuiCommandPaletteState(state, action)
      ?? reduceTuiLiveSessionState(state, action)
      ?? reduceTuiHistoryState(state, action)
      ?? reduceTuiShellState(state, action)
      ?? reduceTuiPromptState(state, action)
      ?? reduceTuiEventState(state, action)
      ?? state;
  };

  return reduceTuiState;
}
