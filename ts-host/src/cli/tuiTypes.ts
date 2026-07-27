export type TuiPane = "prompt" | "live" | "events" | "history" | "timeline" | "help";
export type TuiStatus = "starting" | "idle" | "running" | "stopping" | "stopped" | "error";
export type TuiLiveSessionSortMode = "manual" | "name" | "status" | "unread";
export type TuiLiveSessionCommandId =
  | "activate"
  | "pin"
  | "close"
  | "sort"
  | "filter"
  | "clear_filter"
  | "close_inactive"
  | "unpin_all"
  | "mark_read";
export type TuiLiveSessionCommandCategory = "all" | "session" | "view" | "bulk";
export type TuiLiveSessionCommandSortMode = "catalog" | "usage";
export type TuiLiveSessionCommandUsageRankingLimit = 1 | 3 | 5;
export type TuiLiveSessionCommandUsageRankingLayout = "single" | "multi";
export type TuiLiveSessionCommandUsageRankingLineLimit = 2 | 3;
export type TuiLiveSessionCommandSummaryPriority = "history" | "ranking";
export type TuiLiveSessionCommandSummaryVisibilityProfile = "all" | "history" | "ranking" | "minimal";
export type TuiLiveSessionCommandNeighborVisibilityProfile = "compact" | "standard" | "full";
export type TuiLiveSessionCommandNeighborAdaptiveThresholdProfile = "dense" | "balanced" | "spacious";
export type TuiLiveSessionCommandNeighborProgressBucketHelpLegendProfile = "compact" | "full" | "adaptive";
export type TuiLiveSessionCommandDeepestNestedBucketLabelVisibilityProfile = "shown" | "hidden" | "adaptive";
export type TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityProfile = "shown" | "hidden" | "adaptive";
export type TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityProfile = "shown" | "hidden" | "adaptive";
export type TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile =
  | "shown"
  | "hidden"
  | "adaptive";
export type TuiLiveSessionCommandLatestWidthBucketLabelVisibilityProfile = "shown" | "hidden" | "adaptive";
export type TuiLiveSessionCommandPageSize = 3 | 5 | 7;
export type TuiLiveSessionCommandSource = "command_palette";

export type TuiEventKind = "system" | "assistant" | "tool_call" | "tool_result" | "error";

export interface TuiEvent {
  kind: TuiEventKind;
  text: string;
  timestamp: string;
  streaming?: boolean;
}

export interface TuiHistoryItem {
  sessionId: string;
  firstPrompt: string;
  lastTimestamp: string;
  entryCount: number;
  turnCount: number;
}

export interface TuiLiveSessionItem {
  sessionId: string;
  status: TuiStatus;
  unreadCount: number;
  pinned: boolean;
  displayName?: string;
}

export interface TuiTimelineEntrySummary {
  index: number;
  timestamp: string;
  type: string;
  turnId: string;
  status?: string;
  toolName?: string;
  preview?: string;
}

export interface TuiTimelineSummary {
  sessionId: string;
  entryCount: number;
  turnCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  entries: TuiTimelineEntrySummary[];
}

export interface TuiApprovalModal {
  toolName: string;
  reason: string;
  cwd: string;
  sessionId: string;
  turnId: string;
  toolCallId: string;
  inputLines: TuiApprovalInputLine[];
  truncated: boolean;
  redacted: boolean;
}

export interface TuiApprovalInputLine {
  label: string;
  value: string;
}

export interface TuiState {
  sessionId?: string;
  liveSessions: TuiLiveSessionItem[];
  activeLiveSessionIndex: number;
  selectedLiveSessionIndex: number;
  liveSessionFilter: string;
  liveSessionSortMode: TuiLiveSessionSortMode;
  liveSessionCommandPaletteVisible: boolean;
  selectedLiveSessionCommandIndex: number;
  liveSessionCommandScrollOffset: number;
  liveSessionCommandPageSize: TuiLiveSessionCommandPageSize;
  liveSessionCommandSelectionWrap: boolean;
  liveSessionCommandSearch: string;
  liveSessionCommandCategory: TuiLiveSessionCommandCategory;
  liveSessionCommandSortMode: TuiLiveSessionCommandSortMode;
  liveSessionCommandUsageRankingVisible: boolean;
  liveSessionCommandUsageRankingLimit: TuiLiveSessionCommandUsageRankingLimit;
  liveSessionCommandUsageRankingLayout: TuiLiveSessionCommandUsageRankingLayout;
  liveSessionCommandUsageRankingLineLimit: TuiLiveSessionCommandUsageRankingLineLimit;
  liveSessionCommandSummaryPriority: TuiLiveSessionCommandSummaryPriority;
  liveSessionCommandSummaryVisibilityProfile: TuiLiveSessionCommandSummaryVisibilityProfile;
  liveSessionCommandNeighborVisibilityProfile: TuiLiveSessionCommandNeighborVisibilityProfile;
  liveSessionCommandNeighborAdaptiveThresholdProfile: TuiLiveSessionCommandNeighborAdaptiveThresholdProfile;
  liveSessionCommandNeighborProgressBucketHelpVisible: boolean;
  liveSessionCommandNeighborProgressBucketHelpLegendProfile: TuiLiveSessionCommandNeighborProgressBucketHelpLegendProfile;
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandNeighborProgressBucketHelpLegendWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandDeepestNestedBucketLabelVisibilityProfile: TuiLiveSessionCommandDeepestNestedBucketLabelVisibilityProfile;
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityProfile: TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityProfile;
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandDeepestNestedBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityProfile:
    TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityProfile;
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile:
    TuiLiveSessionCommandLatestDeepestBucketLabelTextVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityWidthPercentageBucketLabelVisibilityProfile;
  liveSessionCommandLatestWidthBucketLabelVisibilityProfile: TuiLiveSessionCommandLatestWidthBucketLabelVisibilityProfile;
  liveSessionCommandHistory: TuiLiveSessionCommandId[];
  liveSessionPinnedCommandHistory: TuiLiveSessionCommandId[];
  liveSessionCommandUsageCounts: Partial<Record<TuiLiveSessionCommandId, number>>;
  status: TuiStatus;
  activePane: TuiPane;
  promptBuffer: string;
  events: TuiEvent[];
  eventsBySessionId: Record<string, TuiEvent[]>;
  history: TuiHistoryItem[];
  selectedHistoryIndex: number;
  viewedSessionId?: string;
  historyLoading: boolean;
  selectedTimeline?: TuiTimelineSummary;
  eventScrollOffset: number;
  liveSessionScrollOffset: number;
  historyScrollOffset: number;
  timelineScrollOffset: number;
  helpScrollOffset: number;
  approvalModal?: TuiApprovalModal;
  cancelRequested: boolean;
  exitRequested: boolean;
  redrawRequested: boolean;
  submitRequested?: string;
  helpVisible: boolean;
  debugVisible: boolean;
  lastError?: string;
}

export type TuiAction =
  | { type: "session_started"; sessionId?: string }
  | { type: "set_status"; status: TuiStatus }
  | { type: "append_prompt"; text: string }
  | { type: "backspace_prompt" }
  | { type: "clear_prompt" }
  | { type: "submit_prompt" }
  | { type: "turn_finished"; status?: "success" | "cancelled" | "error"; error?: string }
  | { type: "request_cancel" }
  | { type: "request_exit" }
  | { type: "switch_pane" }
  | { type: "create_live_session" }
  | { type: "switch_live_session"; direction: -1 | 1 }
  | { type: "select_live_session"; direction: -1 | 1 }
  | { type: "activate_live_session"; source?: TuiLiveSessionCommandSource }
  | { type: "close_live_session"; source?: TuiLiveSessionCommandSource }
  | { type: "toggle_live_session_pin"; source?: TuiLiveSessionCommandSource }
  | { type: "rename_live_session"; label?: string }
  | { type: "set_live_session_filter"; filter?: string; source?: TuiLiveSessionCommandSource }
  | { type: "clear_live_session_filter"; source?: TuiLiveSessionCommandSource }
  | { type: "cycle_live_session_sort_mode"; source?: TuiLiveSessionCommandSource }
  | { type: "close_inactive_live_sessions"; source?: TuiLiveSessionCommandSource }
  | { type: "unpin_all_live_sessions"; source?: TuiLiveSessionCommandSource }
  | { type: "clear_all_live_session_unread"; source?: TuiLiveSessionCommandSource }
  | { type: "open_live_session_command_palette" }
  | { type: "close_live_session_command_palette" }
  | { type: "select_live_session_command"; direction: -1 | 1 }
  | { type: "scroll_live_session_command_palette"; direction: -1 | 1; amount?: number }
  | { type: "cycle_live_session_command_page_size" }
  | { type: "jump_live_session_command_palette"; target: "first" | "last" }
  | { type: "toggle_live_session_command_selection_wrap" }
  | { type: "jump_live_session_command_group"; direction: -1 | 1 }
  | { type: "append_live_session_command_search"; text: string }
  | { type: "backspace_live_session_command_search" }
  | { type: "clear_live_session_command_search" }
  | { type: "cycle_live_session_command_category" }
  | { type: "cycle_live_session_command_sort_mode" }
  | { type: "toggle_live_session_command_usage_ranking" }
  | { type: "cycle_live_session_command_usage_ranking_limit" }
  | { type: "toggle_live_session_command_usage_ranking_layout" }
  | { type: "cycle_live_session_command_usage_ranking_line_limit" }
  | { type: "toggle_live_session_command_summary_priority" }
  | { type: "cycle_live_session_command_summary_visibility_profile" }
  | { type: "cycle_live_session_command_neighbor_visibility_profile" }
  | { type: "cycle_live_session_command_neighbor_adaptive_threshold_profile" }
  | { type: "toggle_live_session_command_neighbor_progress_bucket_help" }
  | { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_profile" }
  | { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_neighbor_progress_bucket_help_legend_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_deepest_nested_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_profile" }
  | { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_deepest_nested_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_latest_deepest_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_profile" }
  | { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_latest_deepest_bucket_label_text_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_width_percentage_bucket_label_visibility_profile" }
  | { type: "cycle_live_session_command_latest_width_bucket_label_visibility_profile" }
  | { type: "toggle_live_session_command_history_pin" }
  | { type: "clear_live_session_command_history" }
  | { type: "select_history"; direction: -1 | 1 }
  | { type: "activate_history_session" }
  | { type: "scroll_pane"; pane?: TuiPane; direction: -1 | 1; amount?: number }
  | { type: "toggle_help" }
  | { type: "toggle_debug" }
  | { type: "force_redraw" }
  | { type: "set_history"; history: TuiHistoryItem[] }
  | { type: "set_history_loading"; loading: boolean }
  | { type: "set_selected_timeline"; timeline?: TuiTimelineSummary }
  | { type: "show_approval_modal"; modal: TuiApprovalModal }
  | { type: "hide_approval_modal" }
  | { type: "append_event"; event: TuiEvent; sessionId?: string }
  | { type: "append_assistant_delta"; event: TuiEvent; sessionId?: string }
  | { type: "finalize_assistant_message"; event: TuiEvent; sessionId?: string }
  | { type: "set_error"; error: string };
