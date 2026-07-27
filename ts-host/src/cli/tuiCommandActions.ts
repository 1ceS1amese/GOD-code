import type {
  TuiAction,
  TuiLiveSessionCommandId,
  TuiLiveSessionCommandSource
} from "./tuiTypes.js";

const MAX_LIVE_SESSION_COMMAND_HISTORY = 5;
const MAX_LIVE_SESSION_PINNED_COMMAND_HISTORY = 5;

export function tuiActionForLiveSessionCommand(
  commandId: TuiLiveSessionCommandId,
  source?: TuiLiveSessionCommandSource
): TuiAction {
  switch (commandId) {
    case "activate":
      return { type: "activate_live_session", source };
    case "pin":
      return { type: "toggle_live_session_pin", source };
    case "close":
      return { type: "close_live_session", source };
    case "sort":
      return { type: "cycle_live_session_sort_mode", source };
    case "filter":
      return { type: "set_live_session_filter", source };
    case "clear_filter":
      return { type: "clear_live_session_filter", source };
    case "close_inactive":
      return { type: "close_inactive_live_sessions", source };
    case "unpin_all":
      return { type: "unpin_all_live_sessions", source };
    case "mark_read":
      return { type: "clear_all_live_session_unread", source };
  }
}

export function liveSessionCommandIdForPaletteAction(action: TuiAction): TuiLiveSessionCommandId | undefined {
  if (!("source" in action) || action.source !== "command_palette") {
    return undefined;
  }
  switch (action.type) {
    case "activate_live_session":
      return "activate";
    case "toggle_live_session_pin":
      return "pin";
    case "close_live_session":
      return "close";
    case "cycle_live_session_sort_mode":
      return "sort";
    case "set_live_session_filter":
      return "filter";
    case "clear_live_session_filter":
      return "clear_filter";
    case "close_inactive_live_sessions":
      return "close_inactive";
    case "unpin_all_live_sessions":
      return "unpin_all";
    case "clear_all_live_session_unread":
      return "mark_read";
  }
}

export function recordLiveSessionCommandHistory(
  history: TuiLiveSessionCommandId[],
  commandId: TuiLiveSessionCommandId
): TuiLiveSessionCommandId[] {
  return [commandId, ...history.filter((id) => id !== commandId)].slice(0, MAX_LIVE_SESSION_COMMAND_HISTORY);
}

export function incrementLiveSessionCommandUsage(
  usageCounts: Partial<Record<TuiLiveSessionCommandId, number>>,
  commandId: TuiLiveSessionCommandId
): Partial<Record<TuiLiveSessionCommandId, number>> {
  return {
    ...usageCounts,
    [commandId]: (usageCounts[commandId] ?? 0) + 1
  };
}

export function toggleLiveSessionPinnedCommandHistory(
  pinnedHistory: TuiLiveSessionCommandId[],
  commandId: TuiLiveSessionCommandId
): TuiLiveSessionCommandId[] {
  if (pinnedHistory.includes(commandId)) {
    return pinnedHistory.filter((id) => id !== commandId);
  }
  return [commandId, ...pinnedHistory].slice(0, MAX_LIVE_SESSION_PINNED_COMMAND_HISTORY);
}
