import { buildTuiDebugLines } from "./tuiDebug.js";
import { buildTuiHelpLines } from "./tuiHelp.js";
import {
  liveSessionCommandGroupNeighborLabel,
  liveSessionCommandGroupNeighbors,
  liveSessionCommandGroups,
  liveSessionCommandGroupKey
} from "./tuiCommandCatalog.js";
import {
  rankedLiveSessionCommandUsage,
  visibleLiveSessionCommands
} from "./tuiCommandSelectors.js";
import {
  liveSessionCommandNeighborAdaptiveThresholdDistance,
  liveSessionCommandNeighborAdaptiveThresholdProgress,
  liveSessionCommandNeighborAdaptiveThresholdProgressBucket,
  liveSessionCommandNeighborAdaptiveThresholdTarget,
  liveSessionCommandNeighborAdaptiveThresholds,
  resolveLiveSessionCommandNeighborVisibilityProfile
} from "./tuiNeighborAdaptive.js";
import {
  type TuiEvent,
  type TuiState
} from "./tuiTypes.js";

const LIVE_SESSION_QUICK_ACTIONS = "Quick actions: 1 activate | 2 pin | 3 close | 4 sort | 5 filter | 0 unfilter";
const LIVE_SESSION_BULK_ACTIONS = "Bulk actions: x close inactive | P unpin all | A mark read";

export interface TuiDimensions {
  columns: number;
  rows: number;
}

export function renderTuiFrame(state: TuiState, dimensions: TuiDimensions): string {
  const columns = Math.max(40, dimensions.columns);
  const rows = Math.max(12, dimensions.rows);
  const width = columns - 2;
  if (rows <= 18) {
    return renderCompactTuiFrame(state, { columns, rows });
  }

  const lines: string[] = [];

  lines.push(border("GOD-code", width));
  lines.push(line(`Live: ${liveSessionTitle(state)}  View: ${state.viewedSessionId ?? "-"}  Status: ${state.status}  Pane: ${state.activePane}`, width));
  lines.push(separator(paneTitle(state, "prompt", "Prompt"), width));
  lines.push(line(`> ${state.promptBuffer}`, width));
  lines.push(separator(paneTitle(state, "live", liveSessionSectionTitle(state)), width));
  for (const liveLine of renderLiveSessionRows(state, 5, width)) {
    lines.push(line(liveLine, width));
  }
  lines.push(separator(paneTitle(state, "events", "Events"), width));

  const reservedRows = state.helpVisible ? 10 : 7;
  const eventRows = Math.max(2, rows - reservedRows - Math.min(5, state.history.length) - Math.min(5, state.liveSessions.length));
  for (const eventLine of renderEvents(state.events, eventRows, state.eventScrollOffset)) {
    lines.push(line(eventLine, width));
  }

  lines.push(separator(paneTitle(state, "history", scrollTitle("History", state.historyScrollOffset, state.history.length)), width));
  if (state.history.length === 0) {
    lines.push(line("No transcript history found.", width));
  } else {
    const historyRows = state.history.slice(state.historyScrollOffset, state.historyScrollOffset + 5);
    for (const [relativeIndex, item] of historyRows.entries()) {
      const absoluteIndex = state.historyScrollOffset + relativeIndex;
      lines.push(line(renderHistoryRow(state, item, absoluteIndex), width));
    }
  }

  const timelineEntryCount = state.selectedTimeline?.entries.length ?? 0;
  lines.push(separator(paneTitle(state, "timeline", scrollTitle("Timeline", state.timelineScrollOffset, timelineEntryCount)), width));
  if (state.historyLoading) {
    lines.push(line("Loading selected session timeline...", width));
  } else if (!state.selectedTimeline) {
    lines.push(line("No selected timeline.", width));
  } else {
    lines.push(
      line(
        `${state.selectedTimeline.sessionId} ${state.selectedTimeline.turnCount} turn(s), ${state.selectedTimeline.entryCount} entries`,
        width
      )
    );
    for (const entry of state.selectedTimeline.entries.slice(state.timelineScrollOffset, state.timelineScrollOffset + 4)) {
      const detail = [entry.type, entry.status, entry.toolName, entry.preview].filter(Boolean).join(" ");
      lines.push(line(`#${entry.index} ${detail}`, width));
    }
  }

  if (state.helpVisible || state.activePane === "help") {
    const help = visibleHelpSection(state, width, 6);
    lines.push(separator(paneTitle(state, "help", help.title), width));
    for (const helpLine of help.rows) {
      lines.push(line(helpLine, width));
    }
  }

  if (state.lastError) {
    lines.push(separator("Error", width));
    lines.push(line(state.lastError, width));
  }

  if (state.approvalModal) {
    lines.push(separator("Approval", width));
    lines.push(line(`Tool: ${state.approvalModal.toolName}`, width));
    lines.push(line(`Reason: ${state.approvalModal.reason}`, width));
    lines.push(line(`CWD: ${state.approvalModal.cwd}`, width));
    for (const inputLine of state.approvalModal.inputLines.slice(0, 4)) {
      lines.push(line(`${inputLine.label}: ${inputLine.value}`, width));
    }
    if (state.approvalModal.truncated || state.approvalModal.redacted) {
      const flags = [
        state.approvalModal.truncated ? "truncated" : undefined,
        state.approvalModal.redacted ? "redacted" : undefined
      ].filter(Boolean).join(", ");
      lines.push(line(`Input summary: ${flags}`, width));
    }
    lines.push(line("Press y to allow, n or Esc to deny.", width));
  }

  if (state.debugVisible) {
    lines.push(separator("Debug", width));
    for (const debugLine of buildTuiDebugLines(state, { maxWidth: width }).slice(0, 8)) {
      lines.push(line(debugLine, width));
    }
  }

  lines.push(separator("", width));
  lines.push(line("Tab pane | Enter switch/submit | Ctrl-N new | 1-5 live | x/P/A bulk | ? help | Ctrl-C quit", width));
  lines.push(bottom(width));

  return `${lines.slice(0, rows).join("\n")}\n`;
}

function renderCompactTuiFrame(state: TuiState, dimensions: TuiDimensions): string {
  const width = dimensions.columns - 2;
  const lines: string[] = [];
  const bodyRows = Math.max(2, dimensions.rows - 7);

  lines.push(border("GOD-code", width));
  lines.push(line(`Live: ${liveSessionTitle(state)}  View: ${state.viewedSessionId ?? "-"}  Status: ${state.status}  Pane: ${state.activePane}`, width));
  lines.push(separator(paneTitle(state, "prompt", "Prompt"), width));
  lines.push(line(`> ${state.promptBuffer}`, width));

  if (state.approvalModal) {
    appendBoundedSection(lines, "Approval", renderApprovalLines(state), width, bodyRows);
  } else if (state.debugVisible) {
    appendBoundedSection(lines, "Debug", buildTuiDebugLines(state, { maxWidth: width }), width, bodyRows);
  } else if (state.helpVisible || state.activePane === "help") {
    const help = visibleHelpSection(state, width, bodyRows);
    appendBoundedSection(
      lines,
      paneTitle(state, "help", help.title),
      help.rows,
      width,
      bodyRows
    );
  } else {
    const section = compactActiveSection(state, bodyRows, width);
    appendBoundedSection(lines, section.title, section.rows, width, bodyRows);
  }

  if (state.lastError && lines.length < dimensions.rows - 2) {
    lines.push(separator("Error", width));
    lines.push(line(state.lastError, width));
  }

  lines.push(separator("", width));
  lines.push(line("Tab pane | Enter switch/submit | Ctrl-N new | 1-5 live | x/P/A bulk | ? help | Ctrl-C quit", width));
  lines.push(bottom(width));
  return `${lines.slice(0, dimensions.rows).join("\n")}\n`;
}

function liveSessionTitle(state: TuiState): string {
  const sessionId = state.sessionId ?? "-";
  if (state.liveSessions.length === 0) {
    return sessionId;
  }
  return `${sessionId} (${state.activeLiveSessionIndex + 1}/${state.liveSessions.length})`;
}

function compactActiveSection(state: TuiState, maxRows: number, maxWidth: number): { title: string; rows: string[] } {
  if (state.activePane === "history") {
    return {
      title: paneTitle(state, "history", scrollTitle("History", state.historyScrollOffset, state.history.length)),
      rows: renderHistoryRows(state, Math.max(1, maxRows))
    };
  }
  if (state.activePane === "live") {
    return {
      title: paneTitle(state, "live", liveSessionSectionTitle(state)),
      rows: renderLiveSessionRows(state, Math.max(1, maxRows), maxWidth)
    };
  }
  if (state.activePane === "timeline") {
    return {
      title: paneTitle(
        state,
        "timeline",
        scrollTitle("Timeline", state.timelineScrollOffset, state.selectedTimeline?.entries.length ?? 0)
      ),
      rows: renderTimelineRows(state, Math.max(1, maxRows))
    };
  }
  if (state.activePane === "help") {
    const help = visibleHelpSection(state, maxWidth, Math.max(1, maxRows));
    return {
      title: paneTitle(state, "help", help.title),
      rows: help.rows
    };
  }
  return {
    title: paneTitle(state, "events", "Events"),
    rows: renderEvents(state.events, Math.max(1, maxRows), state.eventScrollOffset)
  };
}

function visibleHelpSection(
  state: TuiState,
  maxWidth: number,
  maxRows: number
): { title: string; rows: string[] } {
  const helpLines = buildTuiHelpLines(state, { maxWidth });
  const rowCount = Math.max(1, maxRows);
  const maxOffset = Math.max(0, helpLines.length - rowCount);
  const offset = Math.min(state.helpScrollOffset, maxOffset);
  const rows = helpLines.slice(offset, offset + rowCount);
  const start = helpLines.length === 0 ? 0 : offset + 1;
  const end = Math.min(helpLines.length, offset + rows.length);
  return {
    title: `Help [${start}-${end}/${helpLines.length}]`,
    rows
  };
}

function paneTitle(state: TuiState, pane: TuiState["activePane"], title: string): string {
  return state.activePane === pane ? `* ${title}` : title;
}

function renderLiveSessionRows(state: TuiState, maxRows: number, maxWidth: number): string[] {
  if (state.liveSessions.length === 0) {
    return ["No live sessions."];
  }
  if (state.liveSessionCommandPaletteVisible) {
    return renderLiveSessionCommandPalette(state, maxRows, maxWidth);
  }
  const visibleRows = visibleLiveSessions(state);
  if (visibleRows.length === 0) {
    return [LIVE_SESSION_QUICK_ACTIONS, LIVE_SESSION_BULK_ACTIONS, `No live sessions match filter: ${state.liveSessionFilter}`].slice(0, maxRows);
  }
  const sessionRows = visibleRows
    .slice(state.liveSessionScrollOffset, state.liveSessionScrollOffset + maxRows)
    .map(({ session, index }) => {
      const absoluteIndex = index;
      const selector = absoluteIndex === state.selectedLiveSessionIndex ? ">" : " ";
      const active = absoluteIndex === state.activeLiveSessionIndex ? "*" : " ";
      const pinned = session.pinned ? " pinned" : "";
      const unread = session.unreadCount > 0 ? ` unread:${session.unreadCount}` : "";
      return `${selector}${active} [${session.status}]${pinned}${unread} ${liveSessionLabel(session)}`;
    });
  return [LIVE_SESSION_QUICK_ACTIONS, LIVE_SESSION_BULK_ACTIONS, ...sessionRows].slice(0, maxRows);
}

function renderLiveSessionCommandPalette(state: TuiState, maxRows: number, maxWidth: number): string[] {
  const visibleCommands = visibleLiveSessionCommands(state);
  const category = `cat:${state.liveSessionCommandCategory}`;
  const sort = `sort:${state.liveSessionCommandSortMode}`;
  const ranking = `ranking:${state.liveSessionCommandUsageRankingVisible ? "on" : "off"}/${state.liveSessionCommandUsageRankingLimit}/${state.liveSessionCommandUsageRankingLayout}/${state.liveSessionCommandUsageRankingLineLimit}`;
  const summary = `summary:${state.liveSessionCommandSummaryPriority}`;
  const profile = `profile:${state.liveSessionCommandSummaryVisibilityProfile}`;
  const selectedCommandPosition = visibleCommands.findIndex(({ index }) => index === state.selectedLiveSessionCommandIndex);
  const commandPosition = `command:${selectedCommandPosition >= 0 ? selectedCommandPosition + 1 : 0}/${visibleCommands.length}`;
  const groups = liveSessionCommandGroups(visibleCommands);
  let selectedGroupIndex = 0;
  for (const [groupIndex, group] of groups.entries()) {
    if (group.startPosition > Math.max(0, selectedCommandPosition)) {
      break;
    }
    selectedGroupIndex = groupIndex;
  }
  const selectedGroup = groups[selectedGroupIndex];
  const selectedGroupCommandPosition = selectedGroup && selectedCommandPosition >= 0
    ? selectedCommandPosition - selectedGroup.startPosition + 1
    : 0;
  const groupPosition = groups.length > 0
    ? `group:${selectedGroupIndex + 1}/${groups.length}:${selectedGroup?.key ?? "-"}(${selectedGroupCommandPosition}/${selectedGroup?.size ?? 0})`
    : "group:0/0:-(0/0)";
  const groupNeighbors = liveSessionCommandGroupNeighbors(
    groups,
    selectedGroupIndex,
    state.liveSessionCommandSelectionWrap
  );
  const preferredNeighborProfile = state.liveSessionCommandNeighborVisibilityProfile;
  const neighborProfile = resolveLiveSessionCommandNeighborVisibilityProfile(
    preferredNeighborProfile,
    maxWidth,
    state.liveSessionCommandNeighborAdaptiveThresholdProfile
  );
  const previousGroup = liveSessionCommandGroupNeighborLabel(groupNeighbors.previous, neighborProfile);
  const nextGroup = liveSessionCommandGroupNeighborLabel(groupNeighbors.next, neighborProfile);
  const neighborThresholdDistance = preferredNeighborProfile === neighborProfile
    ? null
    : liveSessionCommandNeighborAdaptiveThresholdDistance(
        neighborProfile,
        maxWidth,
        state.liveSessionCommandNeighborAdaptiveThresholdProfile
      );
  const neighborThresholdTarget = preferredNeighborProfile === neighborProfile
    ? null
    : liveSessionCommandNeighborAdaptiveThresholdTarget(
        neighborProfile,
        maxWidth,
        state.liveSessionCommandNeighborAdaptiveThresholdProfile
      );
  const neighborThresholdProgress = preferredNeighborProfile === neighborProfile
    ? null
    : liveSessionCommandNeighborAdaptiveThresholdProgress(
        neighborProfile,
        maxWidth,
        state.liveSessionCommandNeighborAdaptiveThresholdProfile
      );
  const neighborThresholdIndicator = neighborThresholdDistance === null
    || neighborThresholdTarget === null
    || neighborThresholdProgress === null
    ? ""
    : `+${neighborThresholdTarget === "standard" ? "S" : "F"}${neighborThresholdDistance}/${neighborThresholdProgress}%${liveSessionCommandNeighborAdaptiveThresholdProgressBucket(neighborThresholdProgress)}`;
  const neighborVisibilityLabel = preferredNeighborProfile === neighborProfile
    ? neighborProfile
    : `${preferredNeighborProfile}>${neighborProfile}${neighborThresholdIndicator}`;
  const neighborThresholds = liveSessionCommandNeighborAdaptiveThresholds(
    state.liveSessionCommandNeighborAdaptiveThresholdProfile
  );
  const neighborProfileLabel = state.liveSessionCommandNeighborAdaptiveThresholdProfile === "balanced"
    ? neighborVisibilityLabel
    : `${neighborVisibilityLabel}@${neighborThresholds.standard}/${neighborThresholds.full}`;
  const neighborPosition = `neighbors(${neighborProfileLabel}):${previousGroup}/${nextGroup}`;
  const pageSize = `page:${state.liveSessionCommandPageSize}`;
  const selectionWrap = `wrap:${state.liveSessionCommandSelectionWrap ? "on" : "off"}`;
  if (visibleCommands.length === 0) {
    const header = renderLiveSessionCommandPaletteHeader(
      state,
      commandPosition,
      groupPosition,
      neighborPosition,
      "scroll:0-0/0",
      pageSize,
      selectionWrap,
      category,
      sort,
      ranking,
      summary,
      profile
    );
    return [header, "No commands match search."].slice(0, maxRows);
  }
  const commandRows: string[] = [];
  const historySummaryRows: string[] = [];
  const pinnedCommands = state.liveSessionPinnedCommandHistory
    .map((id) => visibleCommands.find(({ command }) => command.id === id)?.command)
    .filter((command): command is (typeof visibleCommands)[number]["command"] => Boolean(command));
  if (pinnedCommands.length > 0) {
    historySummaryRows.push(`Pinned commands: ${pinnedCommands.map((command) => `${command.key} ${command.label}`).join(" | ")}`);
  }
  const recentCommands = state.liveSessionCommandHistory
    .map((id) => visibleCommands.find(({ command }) => command.id === id)?.command)
    .filter((command): command is (typeof visibleCommands)[number]["command"] => Boolean(command));
  if (recentCommands.length > 0) {
    historySummaryRows.push(`Recent commands: ${recentCommands.map((command) => `${command.key} ${command.label}`).join(" | ")}`);
  }
  const reservedCommandRows = 2;
  const summaryRowBudget = Math.max(0, maxRows - 1 - reservedCommandRows);
  const historySummariesVisible = state.liveSessionCommandSummaryVisibilityProfile === "all"
    || state.liveSessionCommandSummaryVisibilityProfile === "history";
  const rankingSummaryVisible = state.liveSessionCommandUsageRankingVisible
    && (state.liveSessionCommandSummaryVisibilityProfile === "all"
      || state.liveSessionCommandSummaryVisibilityProfile === "ranking");
  const visibleHistorySummaryRows = historySummariesVisible ? historySummaryRows : [];
  if (state.liveSessionCommandSummaryPriority === "ranking") {
    const usageRankingLines = rankingSummaryVisible
      ? fittingLiveSessionCommandUsageRankingLines(state, maxWidth, summaryRowBudget)
      : [];
    commandRows.push(...usageRankingLines);
    commandRows.push(...visibleHistorySummaryRows.slice(0, Math.max(0, summaryRowBudget - usageRankingLines.length)));
  } else {
    const fittingHistorySummaryRows = visibleHistorySummaryRows.slice(0, summaryRowBudget);
    commandRows.push(...fittingHistorySummaryRows);
    const usageRankingRowBudget = Math.max(0, summaryRowBudget - fittingHistorySummaryRows.length);
    if (rankingSummaryVisible) {
      commandRows.push(...fittingLiveSessionCommandUsageRankingLines(state, maxWidth, usageRankingRowBudget));
    }
  }
  const commandBlocks = visibleCommands.map(({ command, index }, position) => {
    const group = liveSessionCommandGroupKey(command);
    const selector = index === state.selectedLiveSessionCommandIndex ? ">" : " ";
    const usageCount = state.liveSessionCommandUsageCounts[command.id] ?? 0;
    const usage = usageCount > 0 ? ` uses:${usageCount}` : "";
    return {
      position,
      group,
      heading: command.favorite ? "-- favorite commands --" : `-- ${command.category} commands --`,
      row: `${selector} ${command.key} [${command.category}] ${command.label}${usage}`
    };
  });
  const commandRowBudget = Math.max(0, maxRows - 1 - commandRows.length);
  const commandWindow = renderLiveSessionCommandWindow(
    commandBlocks,
    state.liveSessionCommandScrollOffset,
    selectedCommandPosition,
    commandRowBudget
  );
  commandRows.push(...commandWindow.rows);
  const scrollIndicator = formatLiveSessionCommandScrollIndicator(
    commandBlocks.length,
    commandWindow.startPosition,
    commandWindow.endPosition
  );
  const header = renderLiveSessionCommandPaletteHeader(
    state,
    commandPosition,
    groupPosition,
    neighborPosition,
    scrollIndicator,
    pageSize,
    selectionWrap,
    category,
    sort,
    ranking,
    summary,
    profile
  );
  return [header, ...commandRows].slice(0, maxRows);
}

function renderLiveSessionCommandPaletteHeader(
  state: TuiState,
  commandPosition: string,
  groupPosition: string,
  neighborPosition: string,
  scrollIndicator: string,
  pageSize: string,
  selectionWrap: string,
  category: string,
  sort: string,
  ranking: string,
  summary: string,
  profile: string
): string {
  return state.liveSessionCommandSearch
    ? `Command palette ${commandPosition} ${groupPosition} ${neighborPosition} ${scrollIndicator} ${pageSize} ${selectionWrap} ${category} ${sort} ${ranking} ${summary} ${profile} search:${state.liveSessionCommandSearch} | Enter run | / clear | Esc close`
    : `Command palette ${commandPosition} ${groupPosition} ${neighborPosition} ${scrollIndicator} ${pageSize} ${selectionWrap} ${category} ${sort} ${ranking} ${summary} ${profile}: type search | Tab category | Up/Down select | PageUp/PageDown page | Enter run | Esc close`;
}

function formatLiveSessionCommandScrollIndicator(
  totalCommands: number,
  startPosition: number,
  endPosition: number
): string {
  if (totalCommands <= 0 || startPosition < 0 || endPosition < 0) {
    return "scroll:0-0/0";
  }
  const hasCommandsAbove = startPosition > 0;
  const hasCommandsBelow = endPosition < totalCommands - 1;
  return `scroll:${hasCommandsAbove ? "<" : ""}${startPosition + 1}-${endPosition + 1}/${totalCommands}${hasCommandsBelow ? ">" : ""}`;
}

function renderLiveSessionCommandWindow(
  blocks: Array<{ position: number; group: string; heading: string; row: string }>,
  requestedStart: number,
  selectedPosition: number,
  maxRows: number
): { rows: string[]; startPosition: number; endPosition: number } {
  if (blocks.length === 0 || maxRows <= 0) {
    return { rows: [], startPosition: -1, endPosition: -1 };
  }
  let start = Math.min(Math.max(requestedStart, 0), blocks.length - 1);
  if (selectedPosition >= 0 && selectedPosition < start) {
    start = selectedPosition;
  }

  let window = renderLiveSessionCommandWindowFrom(blocks, start, maxRows);
  while (
    selectedPosition >= 0
    && !window.positions.includes(selectedPosition)
    && start < selectedPosition
  ) {
    start += 1;
    window = renderLiveSessionCommandWindowFrom(blocks, start, maxRows);
  }
  return {
    rows: window.rows,
    startPosition: window.positions[0] ?? -1,
    endPosition: window.positions.at(-1) ?? -1
  };
}

function renderLiveSessionCommandWindowFrom(
  blocks: Array<{ position: number; group: string; heading: string; row: string }>,
  start: number,
  maxRows: number
): { rows: string[]; positions: number[] } {
  const rows: string[] = [];
  const positions: number[] = [];
  let previousGroup: string | undefined;
  for (const block of blocks.slice(start)) {
    const needsHeading = block.group !== previousGroup;
    const requiredRows = needsHeading ? 2 : 1;
    if (rows.length + requiredRows > maxRows) {
      break;
    }
    if (needsHeading) {
      rows.push(block.heading);
    }
    rows.push(block.row);
    positions.push(block.position);
    previousGroup = block.group;
  }
  return { rows, positions };
}

function fittingLiveSessionCommandUsageRankingLines(
  state: TuiState,
  maxWidth: number,
  maxRowBudget: number
): string[] {
  if (maxRowBudget <= 0) {
    return [];
  }
  const configuredRanking = rankedLiveSessionCommandUsage(state, state.liveSessionCommandUsageRankingLimit);
  const configuredMaxLines = state.liveSessionCommandUsageRankingLayout === "multi"
    ? state.liveSessionCommandUsageRankingLineLimit
    : 1;
  const maxLines = Math.min(configuredMaxLines, maxRowBudget);
  for (let size = configuredRanking.length; size >= 1; size -= 1) {
    const ranking = configuredRanking.slice(0, size);
    const hiddenCount = configuredRanking.length - size;
    const lines = wrapLiveSessionCommandUsageRanking(ranking, hiddenCount, maxWidth, maxLines);
    if (lines) {
      return lines;
    }
  }
  const firstEntry = configuredRanking.slice(0, 1);
  return firstEntry.length > 0 ? [formatLiveSessionCommandUsageRanking(firstEntry)] : [];
}

function wrapLiveSessionCommandUsageRanking(
  ranking: ReturnType<typeof rankedLiveSessionCommandUsage>,
  hiddenCount: number,
  maxWidth: number,
  maxLines: number
): string[] | undefined {
  const tokens = ranking.map(({ command, usageCount }) => `${command.key} ${command.label} uses:${usageCount}`);
  if (hiddenCount > 0) {
    tokens.push(`+${hiddenCount} more`);
  }
  const lines: string[] = [];
  const firstPrefix = "Usage ranking: ";
  const continuationPrefix = "  ";
  let current = firstPrefix;
  for (const token of tokens) {
    const separator = current === firstPrefix || current === continuationPrefix ? "" : " | ";
    const candidate = `${current}${separator}${token}`;
    if (candidate.length <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current === firstPrefix || current === continuationPrefix || lines.length + 1 >= maxLines) {
      return undefined;
    }
    lines.push(current);
    current = `${continuationPrefix}${token}`;
    if (current.length > maxWidth) {
      return undefined;
    }
  }
  lines.push(current);
  return lines;
}

function formatLiveSessionCommandUsageRanking(
  ranking: ReturnType<typeof rankedLiveSessionCommandUsage>,
  hiddenCount = 0
): string {
  const entries = ranking.map(({ command, usageCount }) => (
    `${command.key} ${command.label} uses:${usageCount}`
  )).join(" | ");
  const overflow = hiddenCount > 0 ? ` | +${hiddenCount} more` : "";
  return `Usage ranking: ${entries}${overflow}`;
}

function liveSessionLabel(session: { sessionId: string; displayName?: string }): string {
  return session.displayName ? `${session.displayName} (${session.sessionId})` : session.sessionId;
}

function liveSessionSectionTitle(state: TuiState): string {
  const visibleCount = visibleLiveSessions(state).length;
  const base = scrollTitle("Live Sessions", state.liveSessionScrollOffset, visibleCount);
  const sort = state.liveSessionSortMode === "manual" ? undefined : `sort:${state.liveSessionSortMode}`;
  const filter = state.liveSessionFilter ? `filter:${state.liveSessionFilter}` : undefined;
  return [base, sort, filter].filter(Boolean).join(" ");
}

function visibleLiveSessions(state: TuiState): Array<{ session: TuiState["liveSessions"][number]; index: number }> {
  const filter = state.liveSessionFilter.toLowerCase();
  return sortLiveSessionRows(
    state.liveSessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => {
      if (!filter) {
        return true;
      }
      return [
        session.sessionId,
        session.displayName ?? "",
        session.status,
        session.pinned ? "pinned" : "unpinned",
        session.unreadCount > 0 ? "unread" : ""
      ].some((value) => value.toLowerCase().includes(filter));
    }),
    state.liveSessionSortMode
  );
}

function sortLiveSessionRows(
  rows: Array<{ session: TuiState["liveSessions"][number]; index: number }>,
  sortMode: TuiState["liveSessionSortMode"]
): Array<{ session: TuiState["liveSessions"][number]; index: number }> {
  return [...rows].sort((left, right) => {
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

function liveSessionSortLabel(session: TuiState["liveSessions"][number]): string {
  return (session.displayName ?? session.sessionId).toLowerCase();
}

function statusSortWeight(status: TuiState["status"]): number {
  switch (status) {
    case "running":
      return 0;
    case "stopping":
      return 1;
    case "error":
      return 2;
    case "idle":
      return 3;
    case "starting":
      return 4;
    case "stopped":
      return 5;
  }
}

function appendBoundedSection(
  lines: string[],
  title: string,
  rows: string[],
  width: number,
  maxRows: number
): void {
  lines.push(separator(title, width));
  for (const row of rows.slice(0, maxRows)) {
    lines.push(line(row, width));
  }
}

function renderEvents(events: TuiEvent[], maxRows: number, scrollOffset: number): string[] {
  const end = Math.max(maxRows, events.length - scrollOffset);
  const start = Math.max(0, end - maxRows);
  const recent = events.slice(start, end);
  return recent.map((event) => `[${event.kind}] ${event.text}`);
}

function renderHistoryRows(state: TuiState, maxRows: number): string[] {
  if (state.history.length === 0) {
    return ["No transcript history found."];
  }
  return state.history
    .slice(state.historyScrollOffset, state.historyScrollOffset + maxRows)
    .map((item, relativeIndex) => {
      const absoluteIndex = state.historyScrollOffset + relativeIndex;
      return renderHistoryRow(state, item, absoluteIndex);
    });
}

function renderHistoryRow(state: TuiState, item: { sessionId: string; turnCount: number; firstPrompt: string }, absoluteIndex: number): string {
  const selector = absoluteIndex === state.selectedHistoryIndex ? ">" : " ";
  const active = item.sessionId === state.viewedSessionId ? "*" : " ";
  return `${selector}${active} ${item.sessionId} ${item.turnCount} turn(s) ${item.firstPrompt}`;
}

function renderTimelineRows(state: TuiState, maxRows: number): string[] {
  if (state.historyLoading) {
    return ["Loading selected session timeline..."];
  }
  if (!state.selectedTimeline) {
    return ["No selected timeline."];
  }
  const rows = [
    `${state.selectedTimeline.sessionId} ${state.selectedTimeline.turnCount} turn(s), ${state.selectedTimeline.entryCount} entries`
  ];
  for (const entry of state.selectedTimeline.entries.slice(state.timelineScrollOffset, state.timelineScrollOffset + Math.max(0, maxRows - 1))) {
    const detail = [entry.type, entry.status, entry.toolName, entry.preview].filter(Boolean).join(" ");
    rows.push(`#${entry.index} ${detail}`);
  }
  return rows;
}

function renderApprovalLines(state: TuiState): string[] {
  if (!state.approvalModal) {
    return [];
  }
  const rows = [
    `Tool: ${state.approvalModal.toolName}`,
    `Reason: ${state.approvalModal.reason}`,
    `CWD: ${state.approvalModal.cwd}`,
    ...state.approvalModal.inputLines.slice(0, 4).map((inputLine) => `${inputLine.label}: ${inputLine.value}`)
  ];
  if (state.approvalModal.truncated || state.approvalModal.redacted) {
    const flags = [
      state.approvalModal.truncated ? "truncated" : undefined,
      state.approvalModal.redacted ? "redacted" : undefined
    ].filter(Boolean).join(", ");
    rows.push(`Input summary: ${flags}`);
  }
  rows.push("Press y to allow, n or Esc to deny.");
  return rows;
}

function scrollTitle(title: string, offset: number, total: number): string {
  if (offset <= 0 || total <= 0) {
    return title;
  }
  return `${title} offset ${offset}/${Math.max(0, total - 1)}`;
}

function border(title: string, width: number): string {
  const label = ` ${title} `;
  const remaining = Math.max(0, width - label.length);
  return `+${label}${"-".repeat(remaining)}+`;
}

function separator(title: string, width: number): string {
  if (title.length === 0) {
    return `+${"-".repeat(width)}+`;
  }
  const label = ` ${title} `;
  const remaining = Math.max(0, width - label.length);
  return `+${label}${"-".repeat(remaining)}+`;
}

function bottom(width: number): string {
  return `+${"-".repeat(width)}+`;
}

function line(text: string, width: number): string {
  const value = visibleSlice(text.replace(/\s+/g, " "), width);
  return `|${value}${" ".repeat(Math.max(0, width - value.length))}|`;
}

function visibleSlice(text: string, width: number): string {
  if (text.length <= width) {
    return text;
  }
  if (width <= 1) {
    return text.slice(0, width);
  }
  return `${text.slice(0, width - 1)}...`;
}
