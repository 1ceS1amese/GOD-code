import {
  tuiActionForLiveSessionCommand
} from "./tuiCommandActions.js";
import {
  LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_SHORTCUT,
  LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_SHORTCUT,
  LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_SHORTCUT,
  LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_SHORTCUT,
  LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_LATEST_WIDTH_BUCKET_LABEL_VISIBILITY_SHORTCUT,
  LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_SHORTCUT,
  LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_PROFILE_SHORTCUT,
  LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_SHORTCUT,
  LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_SHORTCUT,
  LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT,
  LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_SHORTCUT,
  LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT
} from "./tuiCommandPaletteConstants.js";
import {
  type TuiAction,
  type TuiLiveSessionCommandId,
  type TuiPane,
  type TuiStatus
} from "./tuiTypes.js";

export interface TuiKeyInfo {
  name?: string;
  ctrl?: boolean;
  sequence?: string;
}

export function mapKeypressToTuiAction(
  text: string | undefined,
  key: TuiKeyInfo | undefined,
  context: {
    status: TuiStatus;
    activePane: TuiPane;
    liveSessionCommandPaletteVisible?: boolean;
    selectedLiveSessionCommand?: TuiLiveSessionCommandId;
  }
): TuiAction | undefined {
  if (key?.ctrl && key.name === "c") {
    return context.status === "running" ? { type: "request_cancel" } : { type: "request_exit" };
  }
  if (key?.ctrl && key.name === "n") {
    return { type: "create_live_session" };
  }
  if (key?.ctrl && key.name === "p") {
    return { type: "switch_live_session", direction: -1 };
  }
  if (key?.ctrl && key.name === "w") {
    return { type: "close_live_session" };
  }
  if (key?.name === "return" || key?.name === "enter") {
    if (context.activePane === "live" && context.liveSessionCommandPaletteVisible) {
      return tuiActionForLiveSessionCommand(context.selectedLiveSessionCommand ?? "activate", "command_palette");
    }
    if (context.activePane === "live") {
      return { type: "activate_live_session" };
    }
    if (context.activePane === "history") {
      return { type: "activate_history_session" };
    }
    return { type: "submit_prompt" };
  }
  if (key?.name === "tab") {
    if (context.activePane === "live" && context.liveSessionCommandPaletteVisible) {
      return { type: "cycle_live_session_command_category" };
    }
    return { type: "switch_pane" };
  }
  if (key?.name === "pageup") {
    if (context.activePane === "live" && context.liveSessionCommandPaletteVisible) {
      return { type: "scroll_live_session_command_palette", direction: -1 };
    }
    return { type: "scroll_pane", direction: -1, amount: 5 };
  }
  if (key?.name === "pagedown") {
    if (context.activePane === "live" && context.liveSessionCommandPaletteVisible) {
      return { type: "scroll_live_session_command_palette", direction: 1 };
    }
    return { type: "scroll_pane", direction: 1, amount: 5 };
  }
  if (key?.name === "home" && context.activePane === "live" && context.liveSessionCommandPaletteVisible) {
    return { type: "jump_live_session_command_palette", target: "first" };
  }
  if (key?.name === "end" && context.activePane === "live" && context.liveSessionCommandPaletteVisible) {
    return { type: "jump_live_session_command_palette", target: "last" };
  }
  if (key?.name === "backspace") {
    if (context.activePane === "live" && context.liveSessionCommandPaletteVisible) {
      return { type: "backspace_live_session_command_search" };
    }
    return { type: "backspace_prompt" };
  }
  if (key?.name === "escape") {
    if (context.activePane === "live" && context.liveSessionCommandPaletteVisible) {
      return { type: "close_live_session_command_palette" };
    }
    return context.status === "running" ? undefined : { type: "switch_pane" };
  }
  if (key?.ctrl && key.name === "l") {
    return { type: "force_redraw" };
  }
  if (key?.ctrl && key.name === "g") {
    return { type: "toggle_debug" };
  }
  if (key?.name === "up" && context.activePane === "live") {
    if (context.liveSessionCommandPaletteVisible) {
      return { type: "select_live_session_command", direction: -1 };
    }
    return { type: "select_live_session", direction: -1 };
  }
  if (key?.name === "up" && context.activePane === "help") {
    return { type: "scroll_pane", direction: -1, amount: 1 };
  }
  if (key?.name === "down" && context.activePane === "live") {
    if (context.liveSessionCommandPaletteVisible) {
      return { type: "select_live_session_command", direction: 1 };
    }
    return { type: "select_live_session", direction: 1 };
  }
  if (key?.name === "down" && context.activePane === "help") {
    return { type: "scroll_pane", direction: 1, amount: 1 };
  }
  if (
    key?.name === LIVE_SESSION_COMMAND_LATEST_WIDTH_BUCKET_LABEL_VISIBILITY_SHORTCUT.toLowerCase()
    && context.activePane === "live"
    && context.liveSessionCommandPaletteVisible
  ) {
    return { type: "cycle_live_session_command_latest_width_bucket_label_visibility_profile" };
  }
  if (context.activePane === "live" && context.liveSessionCommandPaletteVisible && text && isPrintable(text)) {
    if (text === "!") {
      return { type: "toggle_live_session_command_history_pin" };
    }
    if (text === "@") {
      return { type: "clear_live_session_command_history" };
    }
    if (text === "^") {
      return { type: "cycle_live_session_command_sort_mode" };
    }
    if (text === "%") {
      return { type: "toggle_live_session_command_usage_ranking" };
    }
    if (text === "+") {
      return { type: "cycle_live_session_command_usage_ranking_limit" };
    }
    if (text === "=") {
      return { type: "toggle_live_session_command_usage_ranking_layout" };
    }
    if (text === "]") {
      return { type: "cycle_live_session_command_usage_ranking_line_limit" };
    }
    if (text === "[") {
      return { type: "toggle_live_session_command_summary_priority" };
    }
    if (text === "\\") {
      return { type: "cycle_live_session_command_summary_visibility_profile" };
    }
    if (text === "'") {
      return { type: "cycle_live_session_command_neighbor_visibility_profile" };
    }
    if (text === '"') {
      return { type: "cycle_live_session_command_neighbor_adaptive_threshold_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_SHORTCUT) {
      return { type: "toggle_live_session_command_neighbor_progress_bucket_help" };
    }
    if (text === LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_PROFILE_SHORTCUT) {
      return { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_SHORTCUT) {
      return { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_SHORTCUT) {
      return { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_SHORTCUT) {
      return { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_NEIGHBOR_PROGRESS_BUCKET_HELP_LEGEND_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_deepest_nested_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_SHORTCUT) {
      return { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_SHORTCUT) {
      return { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_SHORTCUT) {
      return { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_DEEPEST_NESTED_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_latest_deepest_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_SHORTCUT) {
      return { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === LIVE_SESSION_COMMAND_LATEST_DEEPEST_BUCKET_LABEL_TEXT_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_VISIBILITY_WIDTH_PERCENTAGE_BUCKET_LABEL_SHORTCUT) {
      return { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" };
    }
    if (text === ";") {
      return { type: "cycle_live_session_command_page_size" };
    }
    if (text === "~") {
      return { type: "toggle_live_session_command_selection_wrap" };
    }
    if (text === "{") {
      return { type: "jump_live_session_command_group", direction: -1 };
    }
    if (text === "}") {
      return { type: "jump_live_session_command_group", direction: 1 };
    }
    return text === "/" ? { type: "clear_live_session_command_search" } : { type: "append_live_session_command_search", text };
  }
  if (text === ":" && context.activePane === "live") {
    return { type: "open_live_session_command_palette" };
  }
  if (text === "1" && context.activePane === "live") {
    return { type: "activate_live_session" };
  }
  if (text === "2" && context.activePane === "live") {
    return { type: "toggle_live_session_pin" };
  }
  if (text === "3" && context.activePane === "live") {
    return { type: "close_live_session" };
  }
  if (text === "4" && context.activePane === "live") {
    return { type: "cycle_live_session_sort_mode" };
  }
  if (text === "5" && context.activePane === "live") {
    return { type: "set_live_session_filter" };
  }
  if (text === "0" && context.activePane === "live") {
    return { type: "clear_live_session_filter" };
  }
  if (text === "x" && context.activePane === "live") {
    return { type: "close_inactive_live_sessions" };
  }
  if (text === "P" && context.activePane === "live") {
    return { type: "unpin_all_live_sessions" };
  }
  if (text === "A" && context.activePane === "live") {
    return { type: "clear_all_live_session_unread" };
  }
  if (text === "p" && context.activePane === "live") {
    return { type: "toggle_live_session_pin" };
  }
  if (text === "r" && context.activePane === "live") {
    return { type: "rename_live_session" };
  }
  if (text === "f" && context.activePane === "live") {
    return { type: "set_live_session_filter" };
  }
  if (text === "u" && context.activePane === "live") {
    return { type: "clear_live_session_filter" };
  }
  if (text === "s" && context.activePane === "live") {
    return { type: "cycle_live_session_sort_mode" };
  }
  if (key?.name === "up" && context.activePane === "history") {
    return { type: "select_history", direction: -1 };
  }
  if (key?.name === "down" && context.activePane === "history") {
    return { type: "select_history", direction: 1 };
  }
  if (key?.name === "up" && (context.activePane === "events" || context.activePane === "timeline")) {
    return { type: "scroll_pane", direction: -1 };
  }
  if (key?.name === "down" && (context.activePane === "events" || context.activePane === "timeline")) {
    return { type: "scroll_pane", direction: 1 };
  }
  if (text === "?") {
    return { type: "toggle_help" };
  }
  if (text && isPrintable(text)) {
    return { type: "append_prompt", text };
  }
  return undefined;
}

export function mapLineToTuiAction(line: string): TuiAction[] {
  if (line.trim().length === 0) {
    return [];
  }
  return [
    {
      type: "append_prompt",
      text: line
    },
    {
      type: "submit_prompt"
    }
  ];
}

function isPrintable(text: string): boolean {
  return !/[\u0000-\u001f\u007f]/u.test(text);
}
