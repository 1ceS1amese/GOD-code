import type {
  TuiLiveSessionCommandCategory,
  TuiLiveSessionCommandId,
  TuiLiveSessionCommandNeighborVisibilityProfile
} from "./tuiTypes.js";

export interface TuiLiveSessionCommand {
  id: TuiLiveSessionCommandId;
  key: string;
  label: string;
  category: Exclude<TuiLiveSessionCommandCategory, "all">;
  favorite: boolean;
}

export interface TuiVisibleLiveSessionCommand {
  command: TuiLiveSessionCommand;
  index: number;
}

export interface TuiLiveSessionCommandGroup {
  key: string;
  startPosition: number;
  size: number;
  firstCommandKey: string;
  firstCommandId: TuiLiveSessionCommandId;
}

export const TUI_LIVE_SESSION_COMMANDS: ReadonlyArray<TuiLiveSessionCommand> = [
  { id: "activate", key: "1", label: "Activate selected session", category: "session", favorite: true },
  { id: "pin", key: "2", label: "Pin or unpin selected session", category: "session", favorite: false },
  { id: "close", key: "3", label: "Close selected idle session", category: "session", favorite: false },
  { id: "sort", key: "4", label: "Cycle sort mode", category: "view", favorite: false },
  { id: "filter", key: "5", label: "Filter sessions from prompt", category: "view", favorite: false },
  { id: "clear_filter", key: "0", label: "Clear session filter", category: "view", favorite: false },
  { id: "close_inactive", key: "x", label: "Close inactive sessions", category: "bulk", favorite: false },
  { id: "unpin_all", key: "P", label: "Unpin all sessions", category: "bulk", favorite: false },
  { id: "mark_read", key: "A", label: "Mark all sessions read", category: "bulk", favorite: false }
];

export function liveSessionCommandGroupKey(command: TuiLiveSessionCommand): string {
  return command.favorite ? "favorite" : command.category;
}

export function liveSessionCommandGroups(
  commands: ReadonlyArray<TuiVisibleLiveSessionCommand>
): TuiLiveSessionCommandGroup[] {
  return commands.reduce<TuiLiveSessionCommandGroup[]>((groups, entry, position) => {
    const key = liveSessionCommandGroupKey(entry.command);
    const currentGroup = groups.at(-1);
    if (currentGroup?.key === key) {
      currentGroup.size += 1;
    } else {
      groups.push({
        key,
        startPosition: position,
        size: 1,
        firstCommandKey: entry.command.key,
        firstCommandId: entry.command.id
      });
    }
    return groups;
  }, []);
}

export function liveSessionCommandGroupNeighbors(
  groups: TuiLiveSessionCommandGroup[],
  selectedGroupIndex: number,
  wrap: boolean
): { previous: TuiLiveSessionCommandGroup | null; next: TuiLiveSessionCommandGroup | null } {
  if (groups.length <= 1) {
    return { previous: null, next: null };
  }
  const currentIndex = Math.min(Math.max(selectedGroupIndex, 0), groups.length - 1);
  const previousIndex = currentIndex > 0 ? currentIndex - 1 : wrap ? groups.length - 1 : -1;
  const nextIndex = currentIndex < groups.length - 1 ? currentIndex + 1 : wrap ? 0 : -1;
  return {
    previous: previousIndex >= 0 ? groups[previousIndex] ?? null : null,
    next: nextIndex >= 0 ? groups[nextIndex] ?? null : null
  };
}

export function liveSessionCommandGroupNeighborLabel(
  group: TuiLiveSessionCommandGroup | null,
  profile: TuiLiveSessionCommandNeighborVisibilityProfile
): string {
  if (!group) {
    return "-";
  }
  if (profile === "compact") {
    return group.key;
  }
  const standard = `${group.key}(${group.size})@${group.firstCommandKey}`;
  if (profile === "standard") {
    return standard;
  }
  return `${standard}#${group.startPosition + 1}:${group.firstCommandId}`;
}
