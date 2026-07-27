import {
  liveSessionCommandGroupKey,
  TUI_LIVE_SESSION_COMMANDS,
  type TuiLiveSessionCommand,
  type TuiVisibleLiveSessionCommand
} from "./tuiCommandCatalog.js";
import type { TuiLiveSessionCommandId, TuiState } from "./tuiTypes.js";

type TuiCommandSelectorState = Pick<
  TuiState,
  | "liveSessionCommandSearch"
  | "liveSessionCommandCategory"
  | "liveSessionCommandSortMode"
  | "liveSessionCommandUsageCounts"
>;

export function selectedLiveSessionCommand(
  state: TuiCommandSelectorState & Pick<TuiState, "selectedLiveSessionCommandIndex">
): TuiLiveSessionCommandId {
  const visibleCommands = visibleLiveSessionCommands(state);
  return visibleCommands.find(({ index }) => index === state.selectedLiveSessionCommandIndex)?.command.id
    ?? visibleCommands[0]?.command.id
    ?? "activate";
}

export function visibleLiveSessionCommands(state: TuiCommandSelectorState): TuiVisibleLiveSessionCommand[] {
  const query = normalizeLiveSessionCommandSearch(state.liveSessionCommandSearch);
  const category = state.liveSessionCommandCategory;
  const visibleCommands = TUI_LIVE_SESSION_COMMANDS
    .map((command, index) => ({ command, index }))
    .filter(({ command }) => {
      if (category !== "all" && command.category !== category) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [command.id, command.key, command.label]
        .some((value) => value.toLowerCase().includes(query));
    });
  if (state.liveSessionCommandSortMode === "catalog") {
    return visibleCommands;
  }
  return visibleCommands.sort((left, right) => {
    const groupDifference = liveSessionCommandGroupRank(left.command) - liveSessionCommandGroupRank(right.command);
    if (groupDifference !== 0) {
      return groupDifference;
    }
    const usageDifference = (state.liveSessionCommandUsageCounts[right.command.id] ?? 0)
      - (state.liveSessionCommandUsageCounts[left.command.id] ?? 0);
    return usageDifference !== 0 ? usageDifference : left.index - right.index;
  });
}

export function rankedLiveSessionCommandUsage(
  state: TuiCommandSelectorState,
  limit = 3
): Array<TuiVisibleLiveSessionCommand & { usageCount: number }> {
  return visibleLiveSessionCommands(state)
    .map(({ command, index }) => ({
      command,
      index,
      usageCount: state.liveSessionCommandUsageCounts[command.id] ?? 0
    }))
    .filter(({ usageCount }) => usageCount > 0)
    .sort((left, right) => right.usageCount - left.usageCount || left.index - right.index)
    .slice(0, Math.max(0, limit));
}

export function normalizeLiveSessionCommandSearch(search: string): string {
  const normalized = search.replace(/\s+/g, " ").trimStart().toLowerCase();
  return normalized.length > 32 ? normalized.slice(0, 32) : normalized;
}

function liveSessionCommandGroupRank(command: TuiLiveSessionCommand): number {
  const rank = { favorite: 0, session: 1, view: 2, bulk: 3 } as const;
  return rank[liveSessionCommandGroupKey(command) as keyof typeof rank];
}
