import type {
  TuiEvent,
  TuiLiveSessionItem,
  TuiLiveSessionSortMode,
  TuiState,
  TuiStatus
} from "./tuiTypes.js";

export const LIVE_SESSION_SORT_MODES: TuiLiveSessionSortMode[] = ["manual", "name", "status", "unread"];

export function currentSessionKey(state: TuiState): string {
  return state.sessionId ?? "__global__";
}

export function eventsForSession(state: TuiState, sessionId: string | undefined): TuiEvent[] {
  if (!sessionId || sessionId === currentSessionKey(state)) {
    return state.eventsBySessionId[sessionId ?? currentSessionKey(state)] ?? state.events;
  }
  return state.eventsBySessionId[sessionId] ?? [];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function upsertLiveSession(
  sessions: TuiLiveSessionItem[],
  sessionId: string,
  status: TuiStatus
): TuiLiveSessionItem[] {
  if (sessions.some((session) => session.sessionId === sessionId)) {
    return sessions.map((session) => session.sessionId === sessionId ? { ...session, status } : session);
  }
  return sortPinnedLiveSessions([...sessions, { sessionId, status, unreadCount: 0, pinned: false }]);
}

export function sortPinnedLiveSessions(sessions: TuiLiveSessionItem[]): TuiLiveSessionItem[] {
  return [...sessions].sort((left, right) => Number(right.pinned) - Number(left.pinned));
}

export function normalizeLiveSessionDisplayName(label: string): string {
  const normalized = label.replace(/\s+/g, " ").trim();
  return normalized.length > 48 ? normalized.slice(0, 48) : normalized;
}

export function normalizeLiveSessionFilter(filter: string): string {
  const normalized = filter.replace(/\s+/g, " ").trim();
  return normalized.length > 48 ? normalized.slice(0, 48) : normalized;
}

export function visibleLiveSessionIndexes(
  state: Pick<TuiState, "liveSessions" | "liveSessionFilter" | "liveSessionSortMode">
): number[] {
  const normalizedFilter = state.liveSessionFilter.toLowerCase();
  return sortLiveSessionEntries(
    state.liveSessions
      .map((session, index) => ({ session, index }))
      .filter(({ session }) => liveSessionMatchesFilter(session, normalizedFilter)),
    state.liveSessionSortMode
  ).map(({ index }) => index);
}

export function updateActiveLiveSessionStatus(state: TuiState, status: TuiStatus): TuiLiveSessionItem[] {
  if (!state.sessionId) {
    return state.liveSessions;
  }
  return state.liveSessions.map((session, index) =>
    index === state.activeLiveSessionIndex || session.sessionId === state.sessionId
      ? { ...session, status }
      : session
  );
}

export function clearLiveSessionUnread(
  sessions: TuiLiveSessionItem[],
  activeIndex: number
): TuiLiveSessionItem[] {
  return sessions.map((session, index) => index === activeIndex ? { ...session, unreadCount: 0 } : session);
}

export function incrementLiveSessionUnread(
  sessions: TuiLiveSessionItem[],
  sessionId: string
): TuiLiveSessionItem[] {
  return sessions.map((session) =>
    session.sessionId === sessionId
      ? { ...session, unreadCount: session.unreadCount + 1 }
      : session
  );
}

export function wrapIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return ((index % length) + length) % length;
}

export function scrollSelectionIntoView(
  selectedIndex: number,
  currentOffset: number,
  visibleRows: number
): number {
  if (selectedIndex < currentOffset) {
    return selectedIndex;
  }
  if (selectedIndex >= currentOffset + visibleRows) {
    return selectedIndex - visibleRows + 1;
  }
  return currentOffset;
}

function sortLiveSessionEntries(
  entries: Array<{ session: TuiLiveSessionItem; index: number }>,
  sortMode: TuiLiveSessionSortMode
): Array<{ session: TuiLiveSessionItem; index: number }> {
  return [...entries].sort((left, right) => {
    const pinned = Number(right.session.pinned) - Number(left.session.pinned);
    if (pinned !== 0) {
      return pinned;
    }
    if (sortMode === "name") {
      const name = liveSessionSortLabel(left.session).localeCompare(liveSessionSortLabel(right.session));
      return name !== 0 ? name : left.index - right.index;
    }
    if (sortMode === "status") {
      const status = statusSortWeight(left.session.status) - statusSortWeight(right.session.status);
      return status !== 0 ? status : left.index - right.index;
    }
    if (sortMode === "unread") {
      const unread = right.session.unreadCount - left.session.unreadCount;
      return unread !== 0 ? unread : left.index - right.index;
    }
    return left.index - right.index;
  });
}

function liveSessionSortLabel(session: TuiLiveSessionItem): string {
  return (session.displayName ?? session.sessionId).toLowerCase();
}

function statusSortWeight(status: TuiStatus): number {
  switch (status) {
    case "running": return 0;
    case "stopping": return 1;
    case "error": return 2;
    case "idle": return 3;
    case "starting": return 4;
    case "stopped": return 5;
  }
}

function liveSessionMatchesFilter(session: TuiLiveSessionItem, normalizedFilter: string): boolean {
  if (!normalizedFilter) {
    return true;
  }
  const fields = [
    session.sessionId,
    session.displayName ?? "",
    session.status,
    session.pinned ? "pinned" : "unpinned",
    session.unreadCount > 0 ? "unread" : ""
  ];
  return fields.some((field) => field.toLowerCase().includes(normalizedFilter));
}
