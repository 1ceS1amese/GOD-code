import { promises as fs, watch } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { isRecord } from "../types/godCodeProtocol.js";
import type { FSWatcher } from "node:fs";
import type { ModelHistoryMessage } from "../types/godCodeProtocol.js";

export interface TranscriptJsonlEntry {
  session_id: string;
  turn_id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface TranscriptSessionSummary {
  sessionId: string;
  entryCount: number;
  turnCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  firstPrompt: string;
  filePath: string;
}

export interface TranscriptSearchResult {
  summary: TranscriptSessionSummary;
  matchedEntryCount: number;
  matchedTypes: string[];
}

export interface TranscriptGlobalSearchRootResult {
  root: string;
  rootLabel: string;
  ok: boolean;
  error?: string;
  activeMatches: TranscriptSearchResult[];
  archiveMatches: TranscriptSearchResult[];
}

export interface TranscriptGlobalSearchDiscoverySummary {
  searchRoots: TranscriptRootDiscoverySearchRoot[];
  discoveredRoots: TranscriptRootDiscoveryCandidate[];
  maxDepth: number;
  limit: number;
  truncated: boolean;
}

export interface TranscriptGlobalSearchResult {
  type: "transcript_global_search";
  query: string;
  includeArchive: boolean;
  maxResults: number | null;
  discovery: TranscriptGlobalSearchDiscoverySummary | null;
  roots: TranscriptGlobalSearchRootResult[];
  totalMatches: number;
  truncated: boolean;
}

export interface TranscriptRootDiscoveryCandidate {
  root: string;
  rootLabel: string;
  searchRoot: string;
  activeFileCount: number;
  archiveFileCount: number;
  hasSearchIndex: boolean;
}

export interface TranscriptRootDiscoverySearchRoot {
  searchRoot: string;
  ok: boolean;
  error?: string;
  discoveredCount: number;
}

export interface TranscriptRootDiscoveryResult {
  type: "transcript_root_discovery";
  maxDepth: number;
  limit: number;
  includeEmpty: boolean;
  searchRoots: TranscriptRootDiscoverySearchRoot[];
  roots: TranscriptRootDiscoveryCandidate[];
  truncated: boolean;
}

export type TranscriptWatchScope = "active" | "archive";
export type TranscriptWatchEventKind = "created" | "modified" | "deleted" | "renamed" | "unknown";

export interface TranscriptWatchEvent {
  root: string;
  rootLabel: string;
  scope: TranscriptWatchScope;
  kind: TranscriptWatchEventKind;
  file: string;
  path: string;
  timestamp: string;
  sizeBytes?: number;
  mtimeMs?: number;
}

export interface TranscriptWatchRootResult {
  root: string;
  rootLabel: string;
  ok: boolean;
  error?: string;
  watchedScopes: TranscriptWatchScope[];
}

export interface TranscriptWatchDiscoverySummary {
  searchRoots: TranscriptRootDiscoverySearchRoot[];
  discoveredRoots: TranscriptRootDiscoveryCandidate[];
  maxDepth: number;
  limit: number;
  truncated: boolean;
}

export interface TranscriptWatchResult {
  type: "transcript_watch";
  includeArchive: boolean;
  maxEvents: number;
  timeoutMs: number;
  eventCount: number;
  timedOut: boolean;
  discovery: TranscriptWatchDiscoverySummary | null;
  roots: TranscriptWatchRootResult[];
  events: TranscriptWatchEvent[];
}

interface TranscriptWatcherOwnership {
  watcher: FSWatcher;
  root: TranscriptWatchRootResult;
}

const TRANSCRIPT_WATCHER_CLEANUP_FAILURE_MESSAGE =
  "transcript watcher cleanup failed";

export type TranscriptIndexWatchRefreshDiscoverySummary = TranscriptWatchDiscoverySummary;

export interface TranscriptIndexWatchRefreshRootResult {
  root: string;
  rootLabel: string;
  ok: boolean;
  error?: string;
  watchedScopes: TranscriptWatchScope[];
  eventCount: number;
  refreshCount: number;
  lastRefresh?: TranscriptSearchIndexRefreshResult;
}

export interface TranscriptIndexWatchRefreshResult {
  type: "transcript_index_watch_refresh";
  includeArchive: boolean;
  maxEvents: number;
  timeoutMs: number;
  debounceMs: number;
  refreshOnTimeout: boolean;
  eventCount: number;
  refreshCount: number;
  timedOut: boolean;
  discovery: TranscriptIndexWatchRefreshDiscoverySummary | null;
  roots: TranscriptIndexWatchRefreshRootResult[];
  events: TranscriptWatchEvent[];
}

export type TranscriptTimelineScope = "active" | "archive";

export interface TranscriptTimelineEntry {
  index: number;
  timestamp: string;
  turnId: string;
  type: string;
  payloadBytes: number;
  role?: string;
  toolName?: string;
  toolCallId?: string;
  status?: string;
  preview?: string;
}

export interface TranscriptTimeline {
  sessionId: string;
  scope: TranscriptTimelineScope;
  filePath: string;
  entryCount: number;
  turnCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  durationMs: number;
  typeCounts: Record<string, number>;
  toolEventCount: number;
  errorLikeCount: number;
  previewChars: number;
  entries: TranscriptTimelineEntry[];
}

export type TranscriptSearchIndexScope = "active" | "archive";

export interface TranscriptSearchIndexEntry {
  type: string;
  searchableText: string;
}

export interface TranscriptSearchIndexSession {
  scope: TranscriptSearchIndexScope;
  summary: TranscriptSessionSummary;
  summarySearchText: string;
  entries: TranscriptSearchIndexEntry[];
  sourceMtimeMs: number;
  sourceSizeBytes: number;
}

export interface TranscriptSearchIndex {
  schemaVersion: 1;
  generatedAt: string;
  transcriptDir: string;
  includeArchive: boolean;
  sessionCount: number;
  sessions: TranscriptSearchIndexSession[];
}

export interface TranscriptSearchIndexBuildResult {
  indexPath: string;
  index: TranscriptSearchIndex;
}

export interface TranscriptSearchIndexRefreshResult {
  indexPath: string;
  index: TranscriptSearchIndex;
  created: boolean;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  unchangedCount: number;
}

export interface TranscriptIndexedSearchResult extends TranscriptSearchResult {
  scope: TranscriptSearchIndexScope;
  indexGeneratedAt: string;
  indexedFilePath: string;
  sourceMtimeMs: number;
  sourceSizeBytes: number;
}

export interface TranscriptSearchIndexQueryResult {
  indexPath: string;
  indexGeneratedAt: string;
  results: TranscriptIndexedSearchResult[];
}

export interface TranscriptDeleteResult {
  sessionId: string;
  deleted: boolean;
  filePath: string;
}

export interface TranscriptArchiveRestoreResult {
  sessionId: string;
  restored: boolean;
  sourcePath: string;
  restoredPath: string;
}

export interface TranscriptArchiveCompressResult {
  sessionId: string;
  compressed: boolean;
  sourcePath: string;
  compressedPath: string;
  originalBytes: number;
  compressedBytes: number;
}

export type TranscriptCleanupAction = "dry-run" | "archive" | "delete";

export interface TranscriptCleanupOptions {
  olderThanDays: number;
  action?: TranscriptCleanupAction;
  now?: Date;
  archiveDir?: string;
}

export interface TranscriptCleanupSessionResult {
  sessionId: string;
  entryCount: number;
  turnCount: number;
  lastTimestamp: string;
  sourcePath: string;
  archivePath?: string;
}

export interface TranscriptCleanupResult {
  action: TranscriptCleanupAction;
  cutoffTimestamp: string;
  matchedCount: number;
  affectedCount: number;
  sessions: TranscriptCleanupSessionResult[];
}

export type TranscriptRecoveryStrategy = "strict" | "best-effort" | "compact";
export type TranscriptRecoverySourceMode = "active" | "archive" | "include-archived";
export type TranscriptRecoverySourceKind = "active" | "archive";

export interface TranscriptRecoverySource {
  kind: TranscriptRecoverySourceKind;
  path: string;
  compressed: boolean;
}

export interface TranscriptRecoveryWarning {
  entryIndex?: number;
  entryType?: string;
  code: string;
  message: string;
}

export interface TranscriptRecoveryPreviewEntry {
  kind: string;
  contentPreview?: string;
  toolName?: string;
  toolCallId?: string;
}

export interface TranscriptRecoveryPlan {
  type: "transcript_recovery";
  sessionId: string;
  source: TranscriptRecoverySource;
  strategy: TranscriptRecoveryStrategy;
  recoverable: boolean;
  entryCount: number;
  restoredMessageCount: number;
  skippedEntryCount: number;
  warnings: TranscriptRecoveryWarning[];
  preview: TranscriptRecoveryPreviewEntry[];
  initialMessages: ModelHistoryMessage[];
}

export interface TranscriptRecoveryOptions {
  strategy?: TranscriptRecoveryStrategy;
  sourceMode?: TranscriptRecoverySourceMode;
  maxRestoredMessages?: number;
  noToolResults?: boolean;
  previewChars?: number;
}

interface TranscriptSearchIndexSourceRef {
  scope: TranscriptSearchIndexScope;
  filePath: string;
  sourceMtimeMs: number;
  sourceSizeBytes: number;
}

export function resolveTranscriptDir(
  cwd: string,
  environ: NodeJS.ProcessEnv = process.env
): string {
  const configured = environ.GOD_CODE_TRANSCRIPT_DIR;
  if (configured && configured.trim().length > 0) {
    return path.resolve(cwd, configured);
  }
  return path.join(cwd, ".god-code", "transcripts");
}

export function transcriptEnvForCwd(cwd: string): Record<string, string> {
  return {
    GOD_CODE_TRANSCRIPT_DIR: resolveTranscriptDir(cwd)
  };
}

export function resolveTranscriptArchiveDir(transcriptDir: string): string {
  return path.join(transcriptDir, "archive");
}

export function resolveTranscriptSearchIndexPath(transcriptDir: string): string {
  return path.join(transcriptDir, "search-index.json");
}

export async function listTranscriptSessions(
  transcriptDir: string,
  options: { includeGzip?: boolean } = {}
): Promise<TranscriptSessionSummary[]> {
  const filePaths = await listTranscriptFiles(transcriptDir, options);
  const summaries: TranscriptSessionSummary[] = [];

  for (const filePath of filePaths) {
    const entries = await readTranscriptEntries(filePath);
    if (entries.length === 0) {
      continue;
    }
    summaries.push(summarizeTranscriptSession(filePath, entries));
  }

  return summaries.sort((left, right) => right.lastTimestamp.localeCompare(left.lastTimestamp));
}

export async function listArchivedTranscriptSessions(
  transcriptDir: string
): Promise<TranscriptSessionSummary[]> {
  return await listTranscriptSessions(resolveTranscriptArchiveDir(transcriptDir), {
    includeGzip: true
  });
}

export async function readTranscriptEntriesForSession(
  transcriptDir: string,
  sessionId: string
): Promise<TranscriptJsonlEntry[]> {
  const filePath = transcriptFileForSession(transcriptDir, sessionId);
  try {
    return await readTranscriptEntries(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Transcript session not found: ${sessionId}`);
    }
    throw error;
  }
}

export async function readArchivedTranscriptEntriesForSession(
  transcriptDir: string,
  sessionId: string
): Promise<TranscriptJsonlEntry[]> {
  const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
  let filePath: string;
  try {
    filePath = await archivedTranscriptFileForSession(archiveDir, sessionId);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Archived transcript session not found: ${sessionId}`);
    }
    throw error;
  }
  try {
    return await readTranscriptEntries(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Archived transcript session not found: ${sessionId}`);
    }
    throw error;
  }
}

export async function buildTranscriptRecoveryPlan(
  transcriptDir: string,
  sessionId: string,
  options: TranscriptRecoveryOptions = {}
): Promise<TranscriptRecoveryPlan> {
  const strategy = options.strategy ?? "strict";
  const source = await resolveTranscriptRecoverySource(
    transcriptDir,
    sessionId,
    options.sourceMode ?? "active"
  );
  const entries = await readTranscriptEntries(source.path);
  const { messages, warnings, skippedEntryCount } = buildRecoveryMessages(entries, {
    sessionId,
    strategy,
    noToolResults: options.noToolResults === true
  });
  const initialMessages =
    strategy === "compact"
      ? compactRecoveryMessages(messages, options.maxRestoredMessages)
      : limitRecoveryMessages(messages, options.maxRestoredMessages);
  const previewChars = options.previewChars ?? 160;

  return {
    type: "transcript_recovery",
    sessionId,
    source,
    strategy,
    recoverable: initialMessages.length > 0 && !hasStrictRecoveryFailure(strategy, warnings),
    entryCount: entries.length,
    restoredMessageCount: initialMessages.length,
    skippedEntryCount,
    warnings,
    preview: buildRecoveryPreview(initialMessages, previewChars),
    initialMessages
  };
}

export async function readTranscriptEntries(filePath: string): Promise<TranscriptJsonlEntry[]> {
  const raw = await readTranscriptFileText(filePath);
  const entries: TranscriptJsonlEntry[] = [];
  const lines = raw.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) {
      continue;
    }
    const parsed = parseJsonLine(filePath, index + 1, line);
    entries.push(asTranscriptJsonlEntry(parsed, filePath, index + 1));
  }

  return entries;
}

export async function searchTranscriptSessions(
  transcriptDir: string,
  query: string,
  options: { includeGzip?: boolean } = {}
): Promise<TranscriptSearchResult[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const filePaths = await listTranscriptFiles(transcriptDir, options);
  const results: TranscriptSearchResult[] = [];

  for (const filePath of filePaths) {
    const entries = await readTranscriptEntries(filePath);
    if (entries.length === 0) {
      continue;
    }

    const summary = summarizeTranscriptSession(filePath, entries);
    const matchedEntries = entries.filter((entry) => transcriptEntryMatches(entry, normalizedQuery));
    const summaryMatches = summaryMatchesQuery(summary, normalizedQuery);
    if (matchedEntries.length === 0 && !summaryMatches) {
      continue;
    }

    results.push({
      summary,
      matchedEntryCount: matchedEntries.length > 0 ? matchedEntries.length : 1,
      matchedTypes: uniqueSorted(matchedEntries.map((entry) => entry.type))
    });
  }

  return results.sort((left, right) =>
    right.summary.lastTimestamp.localeCompare(left.summary.lastTimestamp)
  );
}

export async function searchArchivedTranscriptSessions(
  transcriptDir: string,
  query: string
): Promise<TranscriptSearchResult[]> {
  return await searchTranscriptSessions(resolveTranscriptArchiveDir(transcriptDir), query, {
    includeGzip: true
  });
}

export async function searchGlobalTranscriptSessions(options: {
  query: string;
  roots: string[];
  cwd?: string;
  includeArchive?: boolean;
  maxResults?: number | null;
  discovery?: TranscriptGlobalSearchDiscoverySummary | null;
}): Promise<TranscriptGlobalSearchResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const query = options.query.trim();
  const includeArchive = options.includeArchive === true;
  const maxResults = options.maxResults ?? null;
  if (maxResults !== null && (!Number.isInteger(maxResults) || maxResults <= 0)) {
    throw new Error("Transcript global search maxResults must be a positive integer.");
  }

  const roots: TranscriptGlobalSearchRootResult[] = [];
  for (const root of options.roots) {
    const resolvedRoot = path.resolve(cwd, root);
    const rootLabel = formatTranscriptRootForOutput(resolvedRoot, cwd);
    const rootError = await validateTranscriptRoot(resolvedRoot);
    if (rootError) {
      roots.push({
        root: rootLabel,
        rootLabel,
        ok: false,
        error: rootError,
        activeMatches: [],
        archiveMatches: []
      });
      continue;
    }

    try {
      roots.push({
        root: rootLabel,
        rootLabel,
        ok: true,
        activeMatches: await searchTranscriptSessions(resolvedRoot, query),
        archiveMatches: includeArchive ? await searchArchivedTranscriptSessions(resolvedRoot, query) : []
      });
    } catch (error) {
      roots.push({
        root: rootLabel,
        rootLabel,
        ok: false,
        error: sanitizeTranscriptSearchError(error),
        activeMatches: [],
        archiveMatches: []
      });
    }
  }

  const { totalMatches, truncated } = applyGlobalSearchLimit(roots, maxResults);
  return {
    type: "transcript_global_search",
    query,
    includeArchive,
    maxResults,
    discovery: options.discovery ?? null,
    roots,
    totalMatches,
    truncated
  };
}

export async function discoverTranscriptRoots(options: {
  searchRoots: string[];
  cwd?: string;
  maxDepth?: number;
  limit?: number;
  includeEmpty?: boolean;
}): Promise<TranscriptRootDiscoveryResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const maxDepth = options.maxDepth ?? 3;
  const limit = options.limit ?? 100;
  const includeEmpty = options.includeEmpty === true;
  if (!Number.isInteger(maxDepth) || maxDepth <= 0) {
    throw new Error("Transcript root discovery maxDepth must be a positive integer.");
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Transcript root discovery limit must be a positive integer.");
  }

  const searchRoots: TranscriptRootDiscoverySearchRoot[] = [];
  const roots: TranscriptRootDiscoveryCandidate[] = [];
  const seenCandidates = new Set<string>();
  let truncated = false;

  for (const rawSearchRoot of options.searchRoots) {
    const resolvedSearchRoot = path.resolve(cwd, rawSearchRoot);
    const searchRootLabel = formatTranscriptRootForOutput(resolvedSearchRoot, cwd);
    const rootResult: TranscriptRootDiscoverySearchRoot = {
      searchRoot: searchRootLabel,
      ok: true,
      discoveredCount: 0
    };
    searchRoots.push(rootResult);

    const rootError = await validateTranscriptRootSearchDirectory(resolvedSearchRoot);
    if (rootError) {
      rootResult.ok = false;
      rootResult.error = rootError;
      continue;
    }

    try {
      const candidates = await discoverTranscriptRootCandidates(resolvedSearchRoot, {
        cwd,
        searchRootLabel,
        maxDepth,
        includeEmpty
      });
      for (const candidate of candidates) {
        const candidateKey = path.normalize(path.resolve(cwd, candidate.root));
        if (seenCandidates.has(candidateKey)) {
          continue;
        }
        seenCandidates.add(candidateKey);
        if (roots.length >= limit) {
          truncated = true;
          continue;
        }
        roots.push(candidate);
        rootResult.discoveredCount += 1;
      }
    } catch (error) {
      rootResult.ok = false;
      rootResult.error = sanitizeTranscriptSearchError(error);
      rootResult.discoveredCount = 0;
    }
  }

  return {
    type: "transcript_root_discovery",
    maxDepth,
    limit,
    includeEmpty,
    searchRoots,
    roots,
    truncated
  };
}

export async function watchTranscriptSessions(options: {
  roots: string[];
  cwd?: string;
  includeArchive?: boolean;
  maxEvents?: number;
  timeoutMs?: number;
  discovery?: TranscriptWatchDiscoverySummary | null;
}): Promise<TranscriptWatchResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const includeArchive = options.includeArchive === true;
  const maxEvents = options.maxEvents ?? 20;
  const timeoutMs = options.timeoutMs ?? 30000;
  if (!Number.isInteger(maxEvents) || maxEvents <= 0) {
    throw new Error("Transcript watch maxEvents must be a positive integer.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Transcript watch timeoutMs must be a positive integer.");
  }

  const roots: TranscriptWatchRootResult[] = [];
  const events: TranscriptWatchEvent[] = [];
  const watchers: TranscriptWatcherOwnership[] = [];
  const pendingEvents = new Set<Promise<void>>();

  for (const rawRoot of options.roots) {
    const resolvedRoot = path.resolve(cwd, rawRoot);
    const rootLabel = formatTranscriptRootForOutput(resolvedRoot, cwd);
    const rootResult: TranscriptWatchRootResult = {
      root: rootLabel,
      rootLabel,
      ok: true,
      watchedScopes: []
    };
    roots.push(rootResult);

    const rootError = await validateTranscriptWatchDirectory(resolvedRoot, "Transcript root");
    if (rootError) {
      rootResult.ok = false;
      rootResult.error = rootError;
      continue;
    }

    try {
      const watcher = createTranscriptScopeWatcher({
        directory: resolvedRoot,
        rootLabel,
        cwd,
        scope: "active",
        events,
        maxEvents,
        pendingEvents
      });
      watchers.push({ watcher, root: rootResult });
      rootResult.watchedScopes.push("active");
    } catch (error) {
      rootResult.ok = false;
      rootResult.error = sanitizeTranscriptSearchError(error);
      continue;
    }

    if (includeArchive) {
      const archiveDir = resolveTranscriptArchiveDir(resolvedRoot);
      const archiveExists = await pathExists(archiveDir);
      if (!archiveExists) {
        continue;
      }
      const archiveError = await validateTranscriptWatchDirectory(archiveDir, "Transcript archive root");
      if (archiveError) {
        rootResult.ok = false;
        rootResult.error = archiveError;
        continue;
      }
      try {
        const watcher = createTranscriptScopeWatcher({
          directory: archiveDir,
          rootLabel,
          cwd,
          scope: "archive",
          events,
          maxEvents,
          pendingEvents
        });
        watchers.push({ watcher, root: rootResult });
        rootResult.watchedScopes.push("archive");
      } catch (error) {
        rootResult.ok = false;
        rootResult.error = sanitizeTranscriptSearchError(error);
      }
    }
  }

  let timedOut = false;
  if (watchers.length > 0) {
    await new Promise<void>((resolve) => {
      let finished = false;
      let timer: ReturnType<typeof setTimeout>;
      let interval: ReturnType<typeof setInterval> | undefined;
      const closeAndResolve = (): void => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        if (interval) {
          clearInterval(interval);
        }
        for (const ownership of watchers) {
          if (!invokeTranscriptWatcherFinalizer(() => ownership.watcher.close()) && ownership.root.ok) {
            ownership.root.ok = false;
            ownership.root.error = TRANSCRIPT_WATCHER_CLEANUP_FAILURE_MESSAGE;
          }
        }
        void Promise.allSettled([...pendingEvents]).then(() => {
          if (events.length > maxEvents) {
            events.splice(maxEvents);
          }
          resolve();
        });
      };
      timer = setTimeout(() => {
        timedOut = events.length < maxEvents;
        closeAndResolve();
      }, timeoutMs);
      interval = setInterval(() => {
        if (events.length >= maxEvents) {
          closeAndResolve();
        }
      }, 10);
    });
  }

  return {
    type: "transcript_watch",
    includeArchive,
    maxEvents,
    timeoutMs,
    eventCount: events.length,
    timedOut,
    discovery: options.discovery ?? null,
    roots,
    events
  };
}

export async function watchRefreshTranscriptSearchIndex(options: {
  roots: string[];
  cwd?: string;
  includeArchive?: boolean;
  maxEvents?: number;
  timeoutMs?: number;
  debounceMs?: number;
  refreshOnTimeout?: boolean;
  discovery?: TranscriptIndexWatchRefreshDiscoverySummary | null;
}): Promise<TranscriptIndexWatchRefreshResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const includeArchive = options.includeArchive === true;
  const maxEvents = options.maxEvents ?? 20;
  const timeoutMs = options.timeoutMs ?? 30000;
  const debounceMs = options.debounceMs ?? 250;
  const refreshOnTimeout = options.refreshOnTimeout === true;
  if (!Number.isInteger(maxEvents) || maxEvents <= 0) {
    throw new Error("Transcript index watch-refresh maxEvents must be a positive integer.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Transcript index watch-refresh timeoutMs must be a positive integer.");
  }
  if (!Number.isInteger(debounceMs) || debounceMs <= 0) {
    throw new Error("Transcript index watch-refresh debounceMs must be a positive integer.");
  }

  const watchResult = await watchTranscriptSessions({
    roots: options.roots,
    cwd,
    includeArchive,
    maxEvents,
    timeoutMs,
    discovery: options.discovery ?? null
  });

  const eventsByRoot = new Map<string, TranscriptWatchEvent[]>();
  for (const event of watchResult.events) {
    const existing = eventsByRoot.get(event.root) ?? [];
    existing.push(event);
    eventsByRoot.set(event.root, existing);
  }

  if (watchResult.events.length > 0) {
    await sleepTranscriptWatchRefresh(debounceMs);
  }

  const roots: TranscriptIndexWatchRefreshRootResult[] = [];
  let refreshCount = 0;
  for (const watchRoot of watchResult.roots) {
    const rootEvents = eventsByRoot.get(watchRoot.root) ?? [];
    const rootResult: TranscriptIndexWatchRefreshRootResult = {
      root: watchRoot.root,
      rootLabel: watchRoot.rootLabel,
      ok: watchRoot.ok,
      ...(watchRoot.error ? { error: watchRoot.error } : {}),
      watchedScopes: watchRoot.watchedScopes,
      eventCount: rootEvents.length,
      refreshCount: 0
    };
    roots.push(rootResult);
    if (!watchRoot.ok) {
      continue;
    }

    const shouldRefresh = rootEvents.length > 0 || (refreshOnTimeout && watchResult.timedOut);
    if (!shouldRefresh) {
      continue;
    }

    try {
      rootResult.lastRefresh = await refreshTranscriptSearchIndex(path.resolve(cwd, watchRoot.root), {
        includeArchive
      });
      rootResult.refreshCount = 1;
      refreshCount += 1;
    } catch (error) {
      rootResult.ok = false;
      rootResult.error = sanitizeTranscriptSearchError(error);
    }
  }

  return {
    type: "transcript_index_watch_refresh",
    includeArchive,
    maxEvents,
    timeoutMs,
    debounceMs,
    refreshOnTimeout,
    eventCount: watchResult.eventCount,
    refreshCount,
    timedOut: watchResult.timedOut,
    discovery: options.discovery ?? null,
    roots,
    events: watchResult.events
  };
}

export async function readTranscriptTimelineForSession(
  transcriptDir: string,
  sessionId: string,
  options: { previewChars?: number; includePreview?: boolean } = {}
): Promise<TranscriptTimeline> {
  const filePath = transcriptFileForSession(transcriptDir, sessionId);
  const entries = await readTranscriptEntriesForSession(transcriptDir, sessionId);
  return buildTranscriptTimeline(entries, {
    scope: "active",
    filePath,
    previewChars: options.previewChars,
    includePreview: options.includePreview
  });
}

export async function readArchivedTranscriptTimelineForSession(
  transcriptDir: string,
  sessionId: string,
  options: { previewChars?: number; includePreview?: boolean } = {}
): Promise<TranscriptTimeline> {
  const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
  let filePath: string;
  try {
    filePath = await archivedTranscriptFileForSession(archiveDir, sessionId);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Archived transcript session not found: ${sessionId}`);
    }
    throw error;
  }
  const entries = await readArchivedTranscriptEntriesForSession(transcriptDir, sessionId);
  return buildTranscriptTimeline(entries, {
    scope: "archive",
    filePath,
    previewChars: options.previewChars,
    includePreview: options.includePreview
  });
}

export async function buildTranscriptSearchIndex(
  transcriptDir: string,
  options: { includeArchive?: boolean; now?: Date; indexPath?: string } = {}
): Promise<TranscriptSearchIndexBuildResult> {
  const indexPath = options.indexPath ?? resolveTranscriptSearchIndexPath(transcriptDir);
  const sessions: TranscriptSearchIndexSession[] = [];

  sessions.push(...(await buildTranscriptSearchIndexSessions(transcriptDir, "active")));
  if (options.includeArchive === true) {
    sessions.push(
      ...(await buildTranscriptSearchIndexSessions(resolveTranscriptArchiveDir(transcriptDir), "archive", {
        includeGzip: true
      }))
    );
  }

  sessions.sort((left, right) => right.summary.lastTimestamp.localeCompare(left.summary.lastTimestamp));

  const index: TranscriptSearchIndex = {
    schemaVersion: 1,
    generatedAt: (options.now ?? new Date()).toISOString(),
    transcriptDir,
    includeArchive: options.includeArchive === true,
    sessionCount: sessions.length,
    sessions
  };

  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

  return { indexPath, index };
}

export async function readTranscriptSearchIndex(
  transcriptDir: string,
  options: { indexPath?: string } = {}
): Promise<TranscriptSearchIndexBuildResult> {
  const indexPath = options.indexPath ?? resolveTranscriptSearchIndexPath(transcriptDir);
  let raw: string;
  try {
    raw = await fs.readFile(indexPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Transcript search index not found: ${indexPath}`);
    }
    throw error;
  }

  const parsed = JSON.parse(raw) as unknown;
  return { indexPath, index: asTranscriptSearchIndex(parsed, indexPath) };
}

export async function refreshTranscriptSearchIndex(
  transcriptDir: string,
  options: { includeArchive?: boolean; now?: Date; indexPath?: string } = {}
): Promise<TranscriptSearchIndexRefreshResult> {
  const indexPath = options.indexPath ?? resolveTranscriptSearchIndexPath(transcriptDir);
  let existingIndex: TranscriptSearchIndex | undefined;
  let created = false;
  try {
    existingIndex = (await readTranscriptSearchIndex(transcriptDir, { indexPath })).index;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Transcript search index not found:")) {
      created = true;
    } else {
      throw error;
    }
  }

  const sources = await listTranscriptSearchIndexSources(transcriptDir, {
    includeArchive: options.includeArchive === true
  });
  const existingByKey = new Map<string, TranscriptSearchIndexSession>();
  for (const session of existingIndex?.sessions ?? []) {
    existingByKey.set(transcriptSearchIndexSourceKey(session.scope, session.summary.filePath), session);
  }

  const sessions: TranscriptSearchIndexSession[] = [];
  const seenKeys = new Set<string>();
  let addedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const source of sources) {
    const key = transcriptSearchIndexSourceKey(source.scope, source.filePath);
    seenKeys.add(key);
    const existing = existingByKey.get(key);
    if (
      existing &&
      existing.sourceMtimeMs === source.sourceMtimeMs &&
      existing.sourceSizeBytes === source.sourceSizeBytes
    ) {
      sessions.push(existing);
      unchangedCount += 1;
      continue;
    }

    sessions.push(await buildTranscriptSearchIndexSessionFromSource(source));
    if (existing) {
      updatedCount += 1;
    } else {
      addedCount += 1;
    }
  }

  const removedCount = [...existingByKey.keys()].filter((key) => !seenKeys.has(key)).length;
  sessions.sort((left, right) => right.summary.lastTimestamp.localeCompare(left.summary.lastTimestamp));

  const index: TranscriptSearchIndex = {
    schemaVersion: 1,
    generatedAt: (options.now ?? new Date()).toISOString(),
    transcriptDir,
    includeArchive: options.includeArchive === true,
    sessionCount: sessions.length,
    sessions
  };

  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

  return {
    indexPath,
    index,
    created,
    addedCount,
    updatedCount,
    removedCount,
    unchangedCount
  };
}

export async function searchTranscriptIndex(
  transcriptDir: string,
  query: string,
  options: { indexPath?: string } = {}
): Promise<TranscriptSearchIndexQueryResult> {
  const normalizedQuery = query.trim().toLowerCase();
  const { indexPath, index } = await readTranscriptSearchIndex(transcriptDir, options);
  if (!normalizedQuery) {
    return {
      indexPath,
      indexGeneratedAt: index.generatedAt,
      results: []
    };
  }

  const results: TranscriptIndexedSearchResult[] = [];
  for (const session of index.sessions) {
    const matchedEntries = session.entries.filter((entry) =>
      entry.searchableText.toLowerCase().includes(normalizedQuery)
    );
    const summaryMatches = session.summarySearchText.toLowerCase().includes(normalizedQuery);
    if (matchedEntries.length === 0 && !summaryMatches) {
      continue;
    }

    results.push({
      scope: session.scope,
      summary: session.summary,
      matchedEntryCount: matchedEntries.length > 0 ? matchedEntries.length : 1,
      matchedTypes: uniqueSorted(matchedEntries.map((entry) => entry.type)),
      indexGeneratedAt: index.generatedAt,
      indexedFilePath: indexPath,
      sourceMtimeMs: session.sourceMtimeMs,
      sourceSizeBytes: session.sourceSizeBytes
    });
  }

  return {
    indexPath,
    indexGeneratedAt: index.generatedAt,
    results: results.sort((left, right) =>
      right.summary.lastTimestamp.localeCompare(left.summary.lastTimestamp)
    )
  };
}

export async function deleteTranscriptSession(
  transcriptDir: string,
  sessionId: string
): Promise<TranscriptDeleteResult> {
  const filePath = transcriptFileForSession(transcriptDir, sessionId);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Transcript session not found: ${sessionId}`);
    }
    throw error;
  }

  return {
    sessionId,
    deleted: true,
    filePath
  };
}

export async function deleteArchivedTranscriptSession(
  transcriptDir: string,
  sessionId: string
): Promise<TranscriptDeleteResult> {
  let filePath: string;
  try {
    filePath = await archivedTranscriptFileForSession(resolveTranscriptArchiveDir(transcriptDir), sessionId);
    await fs.unlink(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Archived transcript session not found: ${sessionId}`);
    }
    throw error;
  }

  return {
    sessionId,
    deleted: true,
    filePath
  };
}

export async function restoreArchivedTranscriptSession(
  transcriptDir: string,
  sessionId: string
): Promise<TranscriptArchiveRestoreResult> {
  const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
  let sourcePath: string;
  try {
    sourcePath = await archivedTranscriptFileForSession(archiveDir, sessionId);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Archived transcript session not found: ${sessionId}`);
    }
    throw error;
  }
  const restoredPath = transcriptFileForSession(transcriptDir, sessionId);

  try {
    await fs.access(restoredPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      if (isGzipTranscriptPath(sourcePath)) {
        const compressed = await fs.readFile(sourcePath);
        await fs.writeFile(restoredPath, gunzipSync(compressed));
        await fs.unlink(sourcePath);
      } else {
        await fs.rename(sourcePath, restoredPath);
      }
      return {
        sessionId,
        restored: true,
        sourcePath,
        restoredPath
      };
    }
    throw error;
  }

  throw new Error(`Active transcript session already exists: ${sessionId}`);
}

export async function compressArchivedTranscriptSession(
  transcriptDir: string,
  sessionId: string
): Promise<TranscriptArchiveCompressResult> {
  const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
  const sourcePath = transcriptFileForSession(archiveDir, sessionId);
  const compressedPath = compressedTranscriptFileForSession(archiveDir, sessionId);

  try {
    await fs.access(sourcePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      try {
        await fs.access(compressedPath);
      } catch (compressedError) {
        if (isNodeError(compressedError) && compressedError.code === "ENOENT") {
          throw new Error(`Archived transcript session not found: ${sessionId}`);
        }
        throw compressedError;
      }
      throw new Error(`Archived transcript session is already compressed: ${sessionId}`);
    }
    throw error;
  }

  try {
    await fs.access(compressedPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      const raw = await fs.readFile(sourcePath);
      const compressed = gzipSync(raw);
      await fs.writeFile(compressedPath, compressed);
      await fs.unlink(sourcePath);
      return {
        sessionId,
        compressed: true,
        sourcePath,
        compressedPath,
        originalBytes: raw.byteLength,
        compressedBytes: compressed.byteLength
      };
    }
    throw error;
  }

  throw new Error(`Compressed archived transcript already exists: ${sessionId}`);
}

export async function cleanupTranscriptSessions(
  transcriptDir: string,
  options: TranscriptCleanupOptions
): Promise<TranscriptCleanupResult> {
  if (!Number.isInteger(options.olderThanDays) || options.olderThanDays <= 0) {
    throw new Error("olderThanDays must be a positive integer.");
  }

  const action = options.action ?? "dry-run";
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - options.olderThanDays * 24 * 60 * 60 * 1000);
  const cutoffTimestamp = cutoff.toISOString();
  const summaries = await listTranscriptSessions(transcriptDir);
  const matched = summaries.filter((summary) => transcriptSummaryIsOlderThan(summary, cutoff));
  const archiveDir = options.archiveDir ?? path.join(transcriptDir, "archive");
  const sessions = matched.map((summary) => {
    const result: TranscriptCleanupSessionResult = {
      sessionId: summary.sessionId,
      entryCount: summary.entryCount,
      turnCount: summary.turnCount,
      lastTimestamp: summary.lastTimestamp,
      sourcePath: summary.filePath
    };
    if (action === "archive") {
      result.archivePath = path.join(archiveDir, path.basename(summary.filePath));
    }
    return result;
  });

  if (action === "dry-run") {
    return {
      action,
      cutoffTimestamp,
      matchedCount: sessions.length,
      affectedCount: 0,
      sessions
    };
  }

  if (sessions.length === 0) {
    return {
      action,
      cutoffTimestamp,
      matchedCount: 0,
      affectedCount: 0,
      sessions
    };
  }

  if (action === "archive") {
    await assertArchiveTargetsDoNotExist(sessions);
    await fs.mkdir(archiveDir, { recursive: true });
    for (const session of sessions) {
      await fs.rename(session.sourcePath, session.archivePath as string);
    }
    return {
      action,
      cutoffTimestamp,
      matchedCount: sessions.length,
      affectedCount: sessions.length,
      sessions
    };
  }

  if (action === "delete") {
    for (const session of sessions) {
      await fs.unlink(session.sourcePath);
    }
    return {
      action,
      cutoffTimestamp,
      matchedCount: sessions.length,
      affectedCount: sessions.length,
      sessions
    };
  }

  throw new Error("Unsupported transcript cleanup action.");
}

export function renderSessionList(
  transcriptDir: string,
  summaries: TranscriptSessionSummary[]
): string {
  if (summaries.length === 0) {
    return `No sessions found in ${transcriptDir}.`;
  }

  const lines = [`Sessions in ${transcriptDir}:`];
  for (const summary of summaries) {
    lines.push(
      [
        summary.sessionId,
        `entries=${summary.entryCount}`,
        `turns=${summary.turnCount}`,
        `first=${summary.firstTimestamp || "-"}`,
        `last=${summary.lastTimestamp || "-"}`,
        `prompt="${truncate(summary.firstPrompt, 80)}"`
      ].join("  ")
    );
  }
  return lines.join("\n");
}

export function renderTranscriptSearch(
  transcriptDir: string,
  query: string,
  results: TranscriptSearchResult[]
): string {
  if (results.length === 0) {
    return `No sessions matched "${query}" in ${transcriptDir}.`;
  }

  const lines = [`Search results in ${transcriptDir} for "${query}":`];
  for (const result of results) {
    const summary = result.summary;
    const matchedTypes = result.matchedTypes.length > 0 ? result.matchedTypes.join(",") : "-";
    lines.push(
      [
        summary.sessionId,
        `matches=${result.matchedEntryCount}`,
        `types=${matchedTypes}`,
        `entries=${summary.entryCount}`,
        `turns=${summary.turnCount}`,
        `last=${summary.lastTimestamp || "-"}`,
        `prompt="${truncate(summary.firstPrompt, 80)}"`
      ].join("  ")
    );
  }
  return lines.join("\n");
}

export function renderTranscriptSearchJson(results: TranscriptSearchResult[]): string {
  return JSON.stringify(
    results.map((result) => transcriptSearchResultJson(result)),
    null,
    2
  );
}

export function renderTranscriptGlobalSearch(result: TranscriptGlobalSearchResult): string {
  const lines = [
    "GOD-code global transcript search:",
    `query: ${result.query}`,
    `roots: ${result.roots.length}`,
    `include_archive: ${String(result.includeArchive)}`,
    `max_results: ${result.maxResults === null ? "" : String(result.maxResults)}`,
    `total_matches: ${result.totalMatches}`,
    `truncated: ${String(result.truncated)}`
  ];

  if (result.discovery) {
    lines.push(
      "",
      "Discovery:",
      `  search_roots: ${result.discovery.searchRoots.length}`,
      `  discovered: ${result.discovery.discoveredRoots.length}`,
      `  max_depth: ${result.discovery.maxDepth}`,
      `  limit: ${result.discovery.limit}`,
      `  truncated: ${String(result.discovery.truncated)}`
    );
    for (const searchRoot of result.discovery.searchRoots) {
      const status = searchRoot.ok ? "ok" : `error: ${searchRoot.error ?? "unknown error"}`;
      lines.push(`  - ${searchRoot.searchRoot}: ${status}, discovered=${searchRoot.discoveredCount}`);
    }
  }

  result.roots.forEach((root, index) => {
    lines.push("", `[${index + 1}] ${root.rootLabel}`);
    if (!root.ok) {
      lines.push(`  error: ${root.error ?? "unknown error"}`);
      return;
    }
    renderGlobalSearchScope(lines, "active", root.activeMatches);
    if (result.includeArchive) {
      renderGlobalSearchScope(lines, "archive", root.archiveMatches);
    }
  });

  return lines.join("\n");
}

export function renderTranscriptGlobalSearchJson(result: TranscriptGlobalSearchResult): string {
  return JSON.stringify(
    {
      type: result.type,
      query: result.query,
      include_archive: result.includeArchive,
      max_results: result.maxResults,
      discovery: result.discovery
        ? {
            max_depth: result.discovery.maxDepth,
            limit: result.discovery.limit,
            truncated: result.discovery.truncated,
            search_roots: result.discovery.searchRoots.map((searchRoot) => ({
              search_root: searchRoot.searchRoot,
              ok: searchRoot.ok,
              ...(searchRoot.error ? { error: searchRoot.error } : {}),
              discovered_count: searchRoot.discoveredCount
            })),
            discovered_roots: result.discovery.discoveredRoots.map((root) => ({
              root: root.root,
              root_label: root.rootLabel,
              search_root: root.searchRoot,
              active_file_count: root.activeFileCount,
              archive_file_count: root.archiveFileCount,
              has_search_index: root.hasSearchIndex
            }))
          }
        : null,
      roots: result.roots.map((root) => ({
        root: root.root,
        root_label: root.rootLabel,
        ok: root.ok,
        ...(root.error ? { error: root.error } : {}),
        active_matches: root.activeMatches.map((match) => transcriptSearchResultJson(match)),
        archive_matches: root.archiveMatches.map((match) => transcriptSearchResultJson(match))
      })),
      total_matches: result.totalMatches,
      truncated: result.truncated
    },
    null,
    2
  );
}

export function renderTranscriptRootDiscovery(result: TranscriptRootDiscoveryResult): string {
  const lines = [
    "GOD-code transcript roots:",
    `search_roots: ${result.searchRoots.length}`,
    `max_depth: ${result.maxDepth}`,
    `limit: ${result.limit}`,
    `include_empty: ${String(result.includeEmpty)}`,
    `discovered: ${result.roots.length}`,
    `truncated: ${String(result.truncated)}`
  ];

  result.roots.forEach((root, index) => {
    lines.push(
      "",
      `[${index + 1}] ${root.rootLabel}`,
      `  search_root: ${root.searchRoot}`,
      `  active_files: ${root.activeFileCount}`,
      `  archive_files: ${root.archiveFileCount}`,
      `  search_index: ${String(root.hasSearchIndex)}`
    );
  });

  const errors = result.searchRoots.filter((searchRoot) => !searchRoot.ok);
  if (errors.length > 0) {
    lines.push("", "Search root diagnostics:");
    for (const searchRoot of errors) {
      lines.push(`  ${searchRoot.searchRoot}: ${searchRoot.error ?? "unknown error"}`);
    }
  }

  return lines.join("\n");
}

export function renderTranscriptRootDiscoveryJson(result: TranscriptRootDiscoveryResult): string {
  return JSON.stringify(
    {
      type: result.type,
      max_depth: result.maxDepth,
      limit: result.limit,
      include_empty: result.includeEmpty,
      search_roots: result.searchRoots.map((searchRoot) => ({
        search_root: searchRoot.searchRoot,
        ok: searchRoot.ok,
        ...(searchRoot.error ? { error: searchRoot.error } : {}),
        discovered_count: searchRoot.discoveredCount
      })),
      roots: result.roots.map((root) => ({
        root: root.root,
        root_label: root.rootLabel,
        search_root: root.searchRoot,
        active_file_count: root.activeFileCount,
        archive_file_count: root.archiveFileCount,
        has_search_index: root.hasSearchIndex
      })),
      truncated: result.truncated
    },
    null,
    2
  );
}

export function renderTranscriptWatch(result: TranscriptWatchResult): string {
  const lines = [
    "GOD-code transcript watch:",
    `roots: ${result.roots.length}`,
    `include_archive: ${String(result.includeArchive)}`,
    `max_events: ${result.maxEvents}`,
    `timeout_ms: ${result.timeoutMs}`,
    `events: ${result.eventCount}`,
    `timed_out: ${String(result.timedOut)}`
  ];

  if (result.discovery) {
    lines.push(
      "",
      "Discovery:",
      `  search_roots: ${result.discovery.searchRoots.length}`,
      `  discovered: ${result.discovery.discoveredRoots.length}`,
      `  max_depth: ${result.discovery.maxDepth}`,
      `  limit: ${result.discovery.limit}`,
      `  truncated: ${String(result.discovery.truncated)}`
    );
    for (const searchRoot of result.discovery.searchRoots) {
      const status = searchRoot.ok ? "ok" : `error: ${searchRoot.error ?? "unknown error"}`;
      lines.push(`  - ${searchRoot.searchRoot}: ${status}, discovered=${searchRoot.discoveredCount}`);
    }
  }

  result.roots.forEach((root, index) => {
    lines.push("", `[${index + 1}] ${root.rootLabel}`);
    if (!root.ok) {
      lines.push(`  error: ${root.error ?? "unknown error"}`);
      return;
    }
    lines.push(`  scopes: ${root.watchedScopes.length > 0 ? root.watchedScopes.join(", ") : "-"}`);
  });

  lines.push("", "Events:");
  if (result.events.length === 0) {
    lines.push("  (none)");
  } else {
    for (const event of result.events) {
      lines.push(`  - ${event.scope} ${event.kind} ${event.path}`);
    }
  }

  return lines.join("\n");
}

export function renderTranscriptWatchJson(result: TranscriptWatchResult): string {
  return JSON.stringify(
    {
      type: result.type,
      include_archive: result.includeArchive,
      max_events: result.maxEvents,
      timeout_ms: result.timeoutMs,
      event_count: result.eventCount,
      timed_out: result.timedOut,
      discovery: result.discovery
        ? {
            max_depth: result.discovery.maxDepth,
            limit: result.discovery.limit,
            truncated: result.discovery.truncated,
            search_roots: result.discovery.searchRoots.map((searchRoot) => ({
              search_root: searchRoot.searchRoot,
              ok: searchRoot.ok,
              ...(searchRoot.error ? { error: searchRoot.error } : {}),
              discovered_count: searchRoot.discoveredCount
            })),
            discovered_roots: result.discovery.discoveredRoots.map((root) => ({
              root: root.root,
              root_label: root.rootLabel,
              search_root: root.searchRoot,
              active_file_count: root.activeFileCount,
              archive_file_count: root.archiveFileCount,
              has_search_index: root.hasSearchIndex
            }))
          }
        : null,
      roots: result.roots.map((root) => ({
        root: root.root,
        root_label: root.rootLabel,
        ok: root.ok,
        ...(root.error ? { error: root.error } : {}),
        watched_scopes: root.watchedScopes
      })),
      events: result.events.map((event) => ({
        root: event.root,
        root_label: event.rootLabel,
        scope: event.scope,
        kind: event.kind,
        file: event.file,
        path: event.path,
        timestamp: event.timestamp,
        ...(event.sizeBytes !== undefined ? { size_bytes: event.sizeBytes } : {}),
        ...(event.mtimeMs !== undefined ? { mtime_ms: event.mtimeMs } : {})
      }))
    },
    null,
    2
  );
}

export function renderTranscriptIndexWatchRefresh(result: TranscriptIndexWatchRefreshResult): string {
  const lines = [
    "GOD-code transcript index watch-refresh:",
    `roots: ${result.roots.length}`,
    `include_archive: ${String(result.includeArchive)}`,
    `max_events: ${result.maxEvents}`,
    `timeout_ms: ${result.timeoutMs}`,
    `debounce_ms: ${result.debounceMs}`,
    `refresh_on_timeout: ${String(result.refreshOnTimeout)}`,
    `events: ${result.eventCount}`,
    `refreshes: ${result.refreshCount}`,
    `timed_out: ${String(result.timedOut)}`
  ];

  if (result.discovery) {
    lines.push(
      "",
      "Discovery:",
      `  search_roots: ${result.discovery.searchRoots.length}`,
      `  discovered: ${result.discovery.discoveredRoots.length}`,
      `  max_depth: ${result.discovery.maxDepth}`,
      `  limit: ${result.discovery.limit}`,
      `  truncated: ${String(result.discovery.truncated)}`
    );
    for (const searchRoot of result.discovery.searchRoots) {
      const status = searchRoot.ok ? "ok" : `error: ${searchRoot.error ?? "unknown error"}`;
      lines.push(`  - ${searchRoot.searchRoot}: ${status}, discovered=${searchRoot.discoveredCount}`);
    }
  }

  result.roots.forEach((root, index) => {
    lines.push("", `[${index + 1}] ${root.rootLabel}`);
    if (!root.ok) {
      lines.push(`  error: ${root.error ?? "unknown error"}`);
      return;
    }
    lines.push(
      `  scopes: ${root.watchedScopes.length > 0 ? root.watchedScopes.join(", ") : "-"}`,
      `  events: ${root.eventCount}`,
      `  refreshes: ${root.refreshCount}`
    );
    if (root.lastRefresh) {
      lines.push(
        [
          "  last_refresh:",
          `added=${root.lastRefresh.addedCount}`,
          `updated=${root.lastRefresh.updatedCount}`,
          `removed=${root.lastRefresh.removedCount}`,
          `unchanged=${root.lastRefresh.unchangedCount}`
        ].join(" ")
      );
    }
  });

  return lines.join("\n");
}

export function renderTranscriptIndexWatchRefreshJson(result: TranscriptIndexWatchRefreshResult): string {
  return JSON.stringify(
    {
      type: result.type,
      include_archive: result.includeArchive,
      max_events: result.maxEvents,
      timeout_ms: result.timeoutMs,
      debounce_ms: result.debounceMs,
      refresh_on_timeout: result.refreshOnTimeout,
      event_count: result.eventCount,
      refresh_count: result.refreshCount,
      timed_out: result.timedOut,
      discovery: result.discovery
        ? {
            max_depth: result.discovery.maxDepth,
            limit: result.discovery.limit,
            truncated: result.discovery.truncated,
            search_roots: result.discovery.searchRoots.map((searchRoot) => ({
              search_root: searchRoot.searchRoot,
              ok: searchRoot.ok,
              ...(searchRoot.error ? { error: searchRoot.error } : {}),
              discovered_count: searchRoot.discoveredCount
            })),
            discovered_roots: result.discovery.discoveredRoots.map((root) => ({
              root: root.root,
              root_label: root.rootLabel,
              search_root: root.searchRoot,
              active_file_count: root.activeFileCount,
              archive_file_count: root.archiveFileCount,
              has_search_index: root.hasSearchIndex
            }))
          }
        : null,
      roots: result.roots.map((root) => ({
        root: root.root,
        root_label: root.rootLabel,
        ok: root.ok,
        ...(root.error ? { error: root.error } : {}),
        watched_scopes: root.watchedScopes,
        event_count: root.eventCount,
        refresh_count: root.refreshCount,
        ...(root.lastRefresh ? { last_refresh: transcriptSearchIndexRefreshResultJson(root.lastRefresh) } : {})
      })),
      events: result.events.map((event) => ({
        root: event.root,
        root_label: event.rootLabel,
        scope: event.scope,
        kind: event.kind,
        file: event.file,
        path: event.path,
        timestamp: event.timestamp,
        ...(event.sizeBytes !== undefined ? { size_bytes: event.sizeBytes } : {}),
        ...(event.mtimeMs !== undefined ? { mtime_ms: event.mtimeMs } : {})
      }))
    },
    null,
    2
  );
}

export function renderTranscriptSearchIndexBuild(
  result: TranscriptSearchIndexBuildResult
): string {
  return [
    `Transcript search index built: ${result.indexPath}`,
    [
      `generated=${result.index.generatedAt}`,
      `sessions=${result.index.sessionCount}`,
      `include_archive=${result.index.includeArchive}`
    ].join("  ")
  ].join("\n");
}

export function renderTranscriptSearchIndexBuildJson(
  result: TranscriptSearchIndexBuildResult
): string {
  return JSON.stringify(
    {
      index_path: result.indexPath,
      schema_version: result.index.schemaVersion,
      generated_at: result.index.generatedAt,
      transcript_dir: result.index.transcriptDir,
      include_archive: result.index.includeArchive,
      session_count: result.index.sessionCount,
      sessions: result.index.sessions.map((session) => ({
        scope: session.scope,
        summary: session.summary,
        source_mtime_ms: session.sourceMtimeMs,
        source_size_bytes: session.sourceSizeBytes
      }))
    },
    null,
    2
  );
}

export function renderTranscriptSearchIndexRefresh(
  result: TranscriptSearchIndexRefreshResult
): string {
  return [
    `Transcript search index refreshed: ${result.indexPath}`,
    [
      `generated=${result.index.generatedAt}`,
      `sessions=${result.index.sessionCount}`,
      `include_archive=${result.index.includeArchive}`,
      `created=${result.created}`,
      `added=${result.addedCount}`,
      `updated=${result.updatedCount}`,
      `removed=${result.removedCount}`,
      `unchanged=${result.unchangedCount}`
    ].join("  ")
  ].join("\n");
}

export function renderTranscriptSearchIndexRefreshJson(
  result: TranscriptSearchIndexRefreshResult
): string {
  return JSON.stringify(transcriptSearchIndexRefreshResultJson(result), null, 2);
}

export function renderTranscriptIndexSearch(
  query: string,
  result: TranscriptSearchIndexQueryResult
): string {
  if (result.results.length === 0) {
    return `No indexed sessions matched "${query}" in ${result.indexPath}.`;
  }

  const lines = [
    `Indexed search results in ${result.indexPath} for "${query}" generated=${result.indexGeneratedAt}:`
  ];
  for (const searchResult of result.results) {
    const summary = searchResult.summary;
    const matchedTypes =
      searchResult.matchedTypes.length > 0 ? searchResult.matchedTypes.join(",") : "-";
    lines.push(
      [
        `scope=${searchResult.scope}`,
        summary.sessionId,
        `matches=${searchResult.matchedEntryCount}`,
        `types=${matchedTypes}`,
        `entries=${summary.entryCount}`,
        `turns=${summary.turnCount}`,
        `last=${summary.lastTimestamp || "-"}`,
        `prompt="${truncate(summary.firstPrompt, 80)}"`
      ].join("  ")
    );
  }
  return lines.join("\n");
}

export function renderTranscriptIndexSearchJson(
  result: TranscriptSearchIndexQueryResult
): string {
  return JSON.stringify(
    {
      index_path: result.indexPath,
      index_generated_at: result.indexGeneratedAt,
      results: result.results.map((searchResult) => ({
        scope: searchResult.scope,
        summary: searchResult.summary,
        matched_entry_count: searchResult.matchedEntryCount,
        matched_types: searchResult.matchedTypes,
        indexed_file_path: searchResult.indexedFilePath,
        source_mtime_ms: searchResult.sourceMtimeMs,
        source_size_bytes: searchResult.sourceSizeBytes
      }))
    },
    null,
    2
  );
}

export function renderTranscriptReplay(entries: TranscriptJsonlEntry[]): string {
  if (entries.length === 0) {
    return "Transcript is empty.";
  }

  const sessionId = entries[0]?.session_id ?? "unknown";
  const lines = [`Session: ${sessionId}`, `Entries: ${entries.length}`, ""];

  for (const entry of entries) {
    const label = `[${entry.timestamp || "-"}] turn=${entry.turn_id || "-"} type=${entry.type || "unknown"}`;
    lines.push(label);
    lines.push(renderTranscriptPayload(entry));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function renderTranscriptReplayJson(entries: TranscriptJsonlEntry[]): string {
  return JSON.stringify(
    {
      session_id: entries[0]?.session_id ?? "",
      entry_count: entries.length,
      entries
    },
    null,
    2
  );
}

export function renderTranscriptTimeline(timeline: TranscriptTimeline): string {
  if (timeline.entryCount === 0) {
    return `GOD-code session timeline:\nsession: ${timeline.sessionId}\nscope: ${timeline.scope}\nentries: 0`;
  }

  const typeCounts = Object.entries(timeline.typeCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${type}=${count}`)
    .join(" ");
  const lines = [
    "GOD-code session timeline:",
    `session: ${timeline.sessionId}`,
    `scope: ${timeline.scope}`,
    `file: ${timeline.filePath}`,
    `entries: ${timeline.entryCount}`,
    `turns: ${timeline.turnCount}`,
    `first: ${timeline.firstTimestamp || "-"}`,
    `last: ${timeline.lastTimestamp || "-"}`,
    `duration_ms: ${timeline.durationMs}`,
    `types: ${typeCounts || "-"}`,
    `tool_events: ${timeline.toolEventCount}`,
    `error_like: ${timeline.errorLikeCount}`,
    ""
  ];

  for (const entry of timeline.entries) {
    const parts = [
      `  #${entry.index}`,
      entry.timestamp || "-",
      `turn=${entry.turnId || "-"}`,
      `type=${entry.type || "unknown"}`
    ];
    if (entry.role) {
      parts.push(`role=${entry.role}`);
    }
    if (entry.toolName) {
      parts.push(`tool=${entry.toolName}`);
    }
    if (entry.toolCallId) {
      parts.push(`tool_call_id=${entry.toolCallId}`);
    }
    if (entry.status) {
      parts.push(`status=${entry.status}`);
    }
    parts.push(`payload_bytes=${entry.payloadBytes}`);
    if (entry.preview !== undefined) {
      parts.push(`preview=${JSON.stringify(entry.preview)}`);
    }
    lines.push(parts.join(" "));
  }

  return lines.join("\n");
}

export function renderTranscriptTimelineJson(timeline: TranscriptTimeline): string {
  return JSON.stringify(
    {
      session_id: timeline.sessionId,
      scope: timeline.scope,
      file_path: timeline.filePath,
      entry_count: timeline.entryCount,
      turn_count: timeline.turnCount,
      first_timestamp: timeline.firstTimestamp,
      last_timestamp: timeline.lastTimestamp,
      duration_ms: timeline.durationMs,
      type_counts: timeline.typeCounts,
      tool_event_count: timeline.toolEventCount,
      error_like_count: timeline.errorLikeCount,
      preview_chars: timeline.previewChars,
      entries: timeline.entries.map((entry) => ({
        index: entry.index,
        timestamp: entry.timestamp,
        turn_id: entry.turnId,
        type: entry.type,
        payload_bytes: entry.payloadBytes,
        ...(entry.role ? { role: entry.role } : {}),
        ...(entry.toolName ? { tool_name: entry.toolName } : {}),
        ...(entry.toolCallId ? { tool_call_id: entry.toolCallId } : {}),
        ...(entry.status ? { status: entry.status } : {}),
        ...(entry.preview !== undefined ? { preview: entry.preview } : {})
      }))
    },
    null,
    2
  );
}

export function renderTranscriptDeleteJson(result: TranscriptDeleteResult): string {
  return JSON.stringify(
    {
      session_id: result.sessionId,
      deleted: result.deleted,
      file_path: result.filePath
    },
    null,
    2
  );
}

export function renderTranscriptArchiveRestoreJson(
  result: TranscriptArchiveRestoreResult
): string {
  return JSON.stringify(
    {
      session_id: result.sessionId,
      restored: result.restored,
      source_path: result.sourcePath,
      restored_path: result.restoredPath
    },
    null,
    2
  );
}

export function renderTranscriptArchiveCompressJson(
  result: TranscriptArchiveCompressResult
): string {
  return JSON.stringify(
    {
      session_id: result.sessionId,
      compressed: result.compressed,
      source_path: result.sourcePath,
      compressed_path: result.compressedPath,
      original_bytes: result.originalBytes,
      compressed_bytes: result.compressedBytes
    },
    null,
    2
  );
}

export function renderTranscriptCleanup(result: TranscriptCleanupResult): string {
  const lines = [
    [
      `Transcript cleanup action=${result.action}`,
      `cutoff=${result.cutoffTimestamp}`,
      `matched=${result.matchedCount}`,
      `affected=${result.affectedCount}`
    ].join("  ")
  ];

  if (result.sessions.length === 0) {
    lines.push("No transcript sessions matched the cleanup cutoff.");
    return lines.join("\n");
  }

  for (const session of result.sessions) {
    const parts = [
      session.sessionId,
      `entries=${session.entryCount}`,
      `turns=${session.turnCount}`,
      `last=${session.lastTimestamp}`,
      `source=${session.sourcePath}`
    ];
    if (session.archivePath) {
      parts.push(`archive=${session.archivePath}`);
    }
    lines.push(parts.join("  "));
  }

  if (result.action === "dry-run") {
    lines.push("Dry-run only. Re-run with --archive --yes or --delete --yes to apply changes.");
  }

  return lines.join("\n");
}

export function renderTranscriptCleanupJson(result: TranscriptCleanupResult): string {
  return JSON.stringify(
    {
      action: result.action,
      cutoff_timestamp: result.cutoffTimestamp,
      matched_count: result.matchedCount,
      affected_count: result.affectedCount,
      sessions: result.sessions.map((session) => ({
        session_id: session.sessionId,
        entry_count: session.entryCount,
        turn_count: session.turnCount,
        last_timestamp: session.lastTimestamp,
        source_path: session.sourcePath,
        ...(session.archivePath ? { archive_path: session.archivePath } : {})
      }))
    },
    null,
    2
  );
}

export function buildTranscriptResumeMessages(
  entries: TranscriptJsonlEntry[]
): ModelHistoryMessage[] {
  const messages: ModelHistoryMessage[] = [];

  for (const entry of entries) {
    const payload = entry.payload;

    if (entry.type === "user") {
      const message = isRecord(payload.message) ? payload.message : undefined;
      const content = message ? stringValue(message.content) : "";
      if (content) {
        messages.push({ kind: "user", role: "user", content });
      }
      continue;
    }

    if (entry.type === "assistant") {
      const message = isRecord(payload.message) ? payload.message : undefined;
      const content = message ? stringValue(message.content) : "";
      if (content) {
        messages.push({ kind: "assistant", role: "assistant", content });
      }
      continue;
    }

    if (entry.type === "tool_call") {
      const toolCall = isRecord(payload.tool_call) ? payload.tool_call : undefined;
      if (toolCall) {
        messages.push({ kind: "tool_call", tool_call: { ...toolCall } });
      }
      continue;
    }

    if (entry.type === "tool_result") {
      const result = isRecord(payload.result) ? payload.result : {};
      const toolName = stringValue(payload.tool_name) || "unknown";
      const toolCallId = stringValue(payload.tool_call_id);
      const resumeMessage: ModelHistoryMessage = {
        kind: "tool_result",
        tool_name: toolName,
        result: { ...result }
      };
      if (toolCallId) {
        resumeMessage.tool_call_id = toolCallId;
      }
      messages.push(resumeMessage);
    }
  }

  return messages;
}

interface BuildRecoveryMessagesOptions {
  sessionId: string;
  strategy: TranscriptRecoveryStrategy;
  noToolResults: boolean;
}

interface BuildRecoveryMessagesResult {
  messages: ModelHistoryMessage[];
  warnings: TranscriptRecoveryWarning[];
  skippedEntryCount: number;
}

function buildRecoveryMessages(
  entries: TranscriptJsonlEntry[],
  options: BuildRecoveryMessagesOptions
): BuildRecoveryMessagesResult {
  const messages: ModelHistoryMessage[] = [];
  const warnings: TranscriptRecoveryWarning[] = [];
  const knownToolCallIds = new Set<string>();
  let skippedEntryCount = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const warningBase = { entryIndex: index, entryType: entry.type };

    if (entry.session_id && entry.session_id !== options.sessionId) {
      warnings.push({
        ...warningBase,
        code: "conflicting_session_id",
        message: `Entry session id ${entry.session_id} does not match requested session ${options.sessionId}.`
      });
      if (options.strategy === "strict") {
        skippedEntryCount += 1;
        continue;
      }
    }

    if (entry.type === "user" || entry.type === "assistant") {
      const message = isRecord(entry.payload.message) ? entry.payload.message : undefined;
      const content = message ? stringValue(message.content) : "";
      if (!content) {
        warnings.push({
          ...warningBase,
          code: `malformed_${entry.type}`,
          message: `Transcript ${entry.type} entry does not contain message.content.`
        });
        skippedEntryCount += 1;
        continue;
      }
      messages.push(
        entry.type === "user"
          ? { kind: "user", role: "user", content }
          : { kind: "assistant", role: "assistant", content }
      );
      continue;
    }

    if (entry.type === "tool_call") {
      const toolCall = isRecord(entry.payload.tool_call) ? entry.payload.tool_call : undefined;
      const toolCallId = toolCall ? stringValue(toolCall.tool_call_id) : "";
      const toolName = toolCall ? stringValue(toolCall.tool_name) : "";
      const input = toolCall && isRecord(toolCall.input) ? toolCall.input : undefined;
      if (!toolCall || !toolCallId || !toolName || !input) {
        warnings.push({
          ...warningBase,
          code: "malformed_tool_call",
          message: "Transcript tool_call entry does not contain tool_call_id, tool_name, and input."
        });
        skippedEntryCount += 1;
        continue;
      }
      knownToolCallIds.add(toolCallId);
      messages.push({ kind: "tool_call", tool_call: { ...toolCall } });
      continue;
    }

    if (entry.type === "tool_result") {
      if (options.noToolResults) {
        skippedEntryCount += 1;
        continue;
      }
      const result = isRecord(entry.payload.result) ? entry.payload.result : undefined;
      const toolName = stringValue(entry.payload.tool_name);
      const toolCallId = stringValue(entry.payload.tool_call_id);
      if (!result || !toolName || !toolCallId) {
        warnings.push({
          ...warningBase,
          code: "malformed_tool_result",
          message: "Transcript tool_result entry does not contain tool_call_id, tool_name, and result."
        });
        skippedEntryCount += 1;
        continue;
      }
      if (!knownToolCallIds.has(toolCallId)) {
        warnings.push({
          ...warningBase,
          code: "orphan_tool_result",
          message: `Transcript tool_result references unknown tool_call_id: ${toolCallId}.`
        });
        skippedEntryCount += 1;
        continue;
      }
      messages.push({
        kind: "tool_result",
        tool_call_id: toolCallId,
        tool_name: toolName,
        result: { ...result }
      });
      continue;
    }
  }

  if (messages.length === 0) {
    warnings.push({
      code: "no_replayable_messages",
      message: "Transcript session has no replayable messages."
    });
  }

  return {
    messages,
    warnings,
    skippedEntryCount
  };
}

function hasStrictRecoveryFailure(
  strategy: TranscriptRecoveryStrategy,
  warnings: TranscriptRecoveryWarning[]
): boolean {
  return strategy === "strict" && warnings.length > 0;
}

function limitRecoveryMessages(
  messages: ModelHistoryMessage[],
  maxRestoredMessages: number | undefined
): ModelHistoryMessage[] {
  if (maxRestoredMessages === undefined || messages.length <= maxRestoredMessages) {
    return messages;
  }
  return messages.slice(messages.length - maxRestoredMessages);
}

function compactRecoveryMessages(
  messages: ModelHistoryMessage[],
  maxRestoredMessages: number | undefined
): ModelHistoryMessage[] {
  const targetCount = maxRestoredMessages ?? 20;
  if (messages.length <= targetCount) {
    return messages;
  }
  const recentCount = Math.max(1, targetCount - 1);
  const older = messages.slice(0, Math.max(0, messages.length - recentCount));
  const recent = messages.slice(messages.length - recentCount);
  return [buildRecoverySummaryMessage(older), ...recent];
}

function buildRecoverySummaryMessage(messages: ModelHistoryMessage[]): ModelHistoryMessage {
  const counts: Record<string, number> = {};
  for (const message of messages) {
    counts[message.kind] = (counts[message.kind] ?? 0) + 1;
  }

  const highlights: string[] = [];
  for (const message of messages) {
    if (highlights.length >= 8) {
      break;
    }
    if (message.kind === "user" || message.kind === "assistant") {
      highlights.push(`- ${message.kind}: ${truncateForPreview(message.content, 120)}`);
      continue;
    }
    if (message.kind === "tool_call") {
      const toolName = stringValue(message.tool_call.tool_name) || "unknown";
      const toolCallId = stringValue(message.tool_call.tool_call_id) || "unknown";
      highlights.push(`- tool_call: name=${toolName} id=${toolCallId}`);
      continue;
    }
    if (message.kind === "tool_result") {
      const status = isRecord(message.result) && message.result.ok === false ? "error" : "ok";
      highlights.push(`- tool_result: name=${message.tool_name} id=${message.tool_call_id ?? "unknown"} status=${status}`);
    }
  }

  const content = [
    "[GOD-code recovery summary]",
    `Recovered older ${messages.length} message(s): user=${counts.user ?? 0}, assistant=${counts.assistant ?? 0}, tool_call=${counts.tool_call ?? 0}, tool_result=${counts.tool_result ?? 0}`,
    "Highlights:",
    ...(highlights.length > 0 ? highlights : ["- No highlightable messages."])
  ].join("\n");

  return {
    kind: "user",
    role: "user",
    content
  };
}

function buildRecoveryPreview(
  messages: ModelHistoryMessage[],
  previewChars: number
): TranscriptRecoveryPreviewEntry[] {
  return messages.slice(0, 8).map((message) => {
    if (message.kind === "user" || message.kind === "assistant") {
      return {
        kind: message.kind,
        contentPreview: truncateForPreview(message.content, previewChars)
      };
    }
    if (message.kind === "tool_call") {
      return {
        kind: "tool_call",
        toolName: stringValue(message.tool_call.tool_name) || undefined,
        toolCallId: stringValue(message.tool_call.tool_call_id) || undefined
      };
    }
    return {
      kind: "tool_result",
      toolName: message.tool_name,
      toolCallId: message.tool_call_id
    };
  });
}

export function renderTranscriptRecoveryPlan(plan: TranscriptRecoveryPlan): string {
  const lines = [
    `Recovery plan for ${plan.sessionId}`,
    `Source: ${plan.source.kind} ${plan.source.path}${plan.source.compressed ? " (gzip)" : ""}`,
    `Strategy: ${plan.strategy}`,
    `Recoverable: ${plan.recoverable ? "yes" : "no"}`,
    `Entries: ${plan.entryCount}`,
    `Restored messages: ${plan.restoredMessageCount}`,
    `Skipped entries: ${plan.skippedEntryCount}`
  ];

  if (plan.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of plan.warnings) {
      const location = warning.entryIndex === undefined ? "" : ` entry=${warning.entryIndex}`;
      lines.push(`- ${warning.code}${location}: ${warning.message}`);
    }
  }

  if (plan.preview.length > 0) {
    lines.push("Preview:");
    for (const entry of plan.preview) {
      if (entry.contentPreview !== undefined) {
        lines.push(`- ${entry.kind}: ${entry.contentPreview}`);
      } else {
        lines.push(`- ${entry.kind}: ${entry.toolName ?? "unknown"} ${entry.toolCallId ?? ""}`.trimEnd());
      }
    }
  }

  return lines.join("\n");
}

export function renderTranscriptRecoveryPlanJson(plan: TranscriptRecoveryPlan): string {
  return JSON.stringify(transcriptRecoveryPlanToJson(plan), null, 2);
}

export function transcriptRecoveryPlanToJson(plan: TranscriptRecoveryPlan): Record<string, unknown> {
  return {
    type: plan.type,
    session_id: plan.sessionId,
    source: {
      kind: plan.source.kind,
      path: plan.source.path,
      compressed: plan.source.compressed
    },
    strategy: plan.strategy,
    recoverable: plan.recoverable,
    entry_count: plan.entryCount,
    restored_message_count: plan.restoredMessageCount,
    skipped_entry_count: plan.skippedEntryCount,
    warnings: plan.warnings.map((warning) => ({
      ...(warning.entryIndex !== undefined ? { entry_index: warning.entryIndex } : {}),
      ...(warning.entryType !== undefined ? { entry_type: warning.entryType } : {}),
      code: warning.code,
      message: warning.message
    })),
    preview: plan.preview.map((entry) => ({
      kind: entry.kind,
      ...(entry.contentPreview !== undefined ? { content_preview: entry.contentPreview } : {}),
      ...(entry.toolName !== undefined ? { tool_name: entry.toolName } : {}),
      ...(entry.toolCallId !== undefined ? { tool_call_id: entry.toolCallId } : {})
    }))
  };
}

function summarizeTranscriptSession(
  filePath: string,
  entries: TranscriptJsonlEntry[]
): TranscriptSessionSummary {
  const turns = new Set<string>();
  for (const entry of entries) {
    if (entry.turn_id) {
      turns.add(entry.turn_id);
    }
  }

  return {
    sessionId: entries[0]?.session_id || path.basename(filePath, ".jsonl"),
    entryCount: entries.length,
    turnCount: turns.size,
    firstTimestamp: entries[0]?.timestamp ?? "",
    lastTimestamp: entries[entries.length - 1]?.timestamp ?? "",
    firstPrompt: findFirstUserPrompt(entries),
    filePath
  };
}

const DEFAULT_TRANSCRIPT_TIMELINE_PREVIEW_CHARS = 120;

function buildTranscriptTimeline(
  entries: TranscriptJsonlEntry[],
  options: {
    scope: TranscriptTimelineScope;
    filePath: string;
    previewChars?: number;
    includePreview?: boolean;
  }
): TranscriptTimeline {
  const previewChars = options.previewChars ?? DEFAULT_TRANSCRIPT_TIMELINE_PREVIEW_CHARS;
  const includePreview = options.includePreview !== false;
  const summary = summarizeTranscriptSession(options.filePath, entries);
  const timelineEntries = entries.map((entry, index) =>
    buildTranscriptTimelineEntry(entry, index, {
      previewChars,
      includePreview
    })
  );
  const typeCounts: Record<string, number> = {};
  for (const entry of timelineEntries) {
    const type = entry.type || "unknown";
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  }

  return {
    sessionId: summary.sessionId,
    scope: options.scope,
    filePath: options.filePath,
    entryCount: summary.entryCount,
    turnCount: summary.turnCount,
    firstTimestamp: summary.firstTimestamp,
    lastTimestamp: summary.lastTimestamp,
    durationMs: transcriptTimelineDurationMs(summary.firstTimestamp, summary.lastTimestamp),
    typeCounts,
    toolEventCount: timelineEntries.filter((entry) => isTranscriptTimelineToolEvent(entry)).length,
    errorLikeCount: timelineEntries.filter((entry) => isTranscriptTimelineErrorLike(entry)).length,
    previewChars,
    entries: timelineEntries
  };
}

function buildTranscriptTimelineEntry(
  entry: TranscriptJsonlEntry,
  index: number,
  options: { previewChars: number; includePreview: boolean }
): TranscriptTimelineEntry {
  const payloadText = JSON.stringify(entry.payload);
  const metadata = transcriptTimelinePayloadMetadata(entry);
  return {
    index,
    timestamp: entry.timestamp,
    turnId: entry.turn_id,
    type: entry.type,
    payloadBytes: Buffer.byteLength(payloadText, "utf8"),
    ...(metadata.role ? { role: metadata.role } : {}),
    ...(metadata.toolName ? { toolName: metadata.toolName } : {}),
    ...(metadata.toolCallId ? { toolCallId: metadata.toolCallId } : {}),
    ...(metadata.status ? { status: metadata.status } : {}),
    ...(options.includePreview
      ? { preview: transcriptTimelinePreview(entry, payloadText, options.previewChars) }
      : {})
  };
}

function transcriptTimelinePayloadMetadata(entry: TranscriptJsonlEntry): {
  role?: string;
  toolName?: string;
  toolCallId?: string;
  status?: string;
} {
  const payload = entry.payload;
  const message = isRecord(payload.message) ? payload.message : {};
  const toolCall = isRecord(payload.tool_call) ? payload.tool_call : {};
  const result = isRecord(payload.result) ? payload.result : {};
  const role = stringValue(message.role) || stringValue(payload.role);
  const toolName =
    stringValue(payload.tool_name) ||
    stringValue(toolCall.tool_name) ||
    stringValue(toolCall.name);
  const toolCallId =
    stringValue(payload.tool_call_id) ||
    stringValue(toolCall.tool_call_id) ||
    stringValue(toolCall.id);
  const explicitStatus = stringValue(payload.status) || stringValue(result.status);
  const status = explicitStatus ||
    (payload.error !== undefined || result.error !== undefined ? "error" : undefined) ||
    (typeof result.ok === "boolean" ? (result.ok ? "ok" : "error") : undefined);

  return {
    ...(role ? { role } : {}),
    ...(toolName ? { toolName } : {}),
    ...(toolCallId ? { toolCallId } : {}),
    ...(status ? { status } : {})
  };
}

function transcriptTimelinePreview(
  entry: TranscriptJsonlEntry,
  payloadText: string,
  previewChars: number
): string {
  const payload = entry.payload;
  const candidates = [
    nestedStringValue(payload, ["message", "content"]),
    nestedStringValue(payload, ["content"]),
    nestedStringValue(payload, ["text"]),
    nestedStringValue(payload, ["message"]),
    nestedStringValue(payload, ["prompt"]),
    nestedStringValue(payload, ["error", "message"]),
    nestedStringValue(payload, ["result", "error", "message"]),
    nestedStringValue(payload, ["result", "error"]),
    nestedStringValue(payload, ["result", "output", "stdout"]),
    nestedStringValue(payload, ["result", "output", "stderr"]),
    nestedStringValue(payload, ["result", "message"]),
    entry.type === "tool_call" ? nestedSerializedValue(payload, ["tool_call", "input"]) : undefined
  ];
  const selected = candidates.find((value) => value !== undefined && value.trim().length > 0) ??
    payloadText;
  return truncate(normalizeTimelinePreview(selected), previewChars);
}

function nestedStringValue(value: unknown, pathParts: string[]): string | undefined {
  let current: unknown = value;
  for (const part of pathParts) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

function nestedSerializedValue(value: unknown, pathParts: string[]): string | undefined {
  let current: unknown = value;
  for (const part of pathParts) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  if (current === undefined) {
    return undefined;
  }
  return typeof current === "string" ? current : JSON.stringify(current);
}

function normalizeTimelinePreview(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function transcriptTimelineDurationMs(firstTimestamp: string, lastTimestamp: string): number {
  const first = Date.parse(firstTimestamp);
  const last = Date.parse(lastTimestamp);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) {
    return 0;
  }
  return last - first;
}

function isTranscriptTimelineToolEvent(entry: TranscriptTimelineEntry): boolean {
  return entry.type === "tool_call" || entry.type === "tool_result" || entry.toolName !== undefined;
}

function isTranscriptTimelineErrorLike(entry: TranscriptTimelineEntry): boolean {
  const status = entry.status?.toLowerCase() ?? "";
  const type = entry.type.toLowerCase();
  return type.includes("error") || status.includes("error") || status.includes("fail");
}

async function listTranscriptFiles(
  transcriptDir: string,
  options: { includeGzip?: boolean } = {}
): Promise<string[]> {
  let dirents;
  try {
    dirents = await fs.readdir(transcriptDir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return dirents
    .filter(
      (dirent) =>
        dirent.isFile() &&
        (dirent.name.endsWith(".jsonl") ||
          (options.includeGzip === true && dirent.name.endsWith(".jsonl.gz")))
    )
    .map((dirent) => path.join(transcriptDir, dirent.name))
    .sort();
}

async function validateTranscriptRoot(root: string): Promise<string | undefined> {
  try {
    const stats = await fs.stat(root);
    if (!stats.isDirectory()) {
      return `Transcript root is not a directory: ${root}`;
    }
    return undefined;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return `Transcript root does not exist: ${root}`;
    }
    return `Transcript root could not be read: ${root}: ${sanitizeTranscriptSearchError(error)}`;
  }
}

async function sleepTranscriptWatchRefresh(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function validateTranscriptWatchDirectory(directory: string, label: string): Promise<string | undefined> {
  try {
    const stats = await fs.lstat(directory);
    if (stats.isSymbolicLink()) {
      return `${label} is a symlink and will not be watched: ${directory}`;
    }
    if (!stats.isDirectory()) {
      return `${label} is not a directory: ${directory}`;
    }
    return undefined;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return `${label} does not exist: ${directory}`;
    }
    return `${label} could not be read: ${directory}: ${sanitizeTranscriptSearchError(error)}`;
  }
}

function createTranscriptScopeWatcher(options: {
  directory: string;
  rootLabel: string;
  cwd: string;
  scope: TranscriptWatchScope;
  events: TranscriptWatchEvent[];
  maxEvents: number;
  pendingEvents: Set<Promise<void>>;
}): FSWatcher {
  return watch(options.directory, { persistent: false }, (eventType, filename) => {
    if (options.events.length >= options.maxEvents) {
      return;
    }
    const eventPromise = buildTranscriptWatchEvent({
      directory: options.directory,
      rootLabel: options.rootLabel,
      cwd: options.cwd,
      scope: options.scope,
      eventType,
      filename
    }).then((event) => {
      if (event && options.events.length < options.maxEvents) {
        options.events.push(event);
      }
    });
    options.pendingEvents.add(eventPromise);
    void eventPromise.then(
      () => {
        options.pendingEvents.delete(eventPromise);
      },
      () => {
        options.pendingEvents.delete(eventPromise);
      }
    );
  });
}

function invokeTranscriptWatcherFinalizer(finalizer: () => void): boolean {
  try {
    finalizer();
    return true;
  } catch {
    return false;
  }
}

async function buildTranscriptWatchEvent(options: {
  directory: string;
  rootLabel: string;
  cwd: string;
  scope: TranscriptWatchScope;
  eventType: string;
  filename: string | Buffer | null;
}): Promise<TranscriptWatchEvent | undefined> {
  const file = normalizeTranscriptWatchFileName(options.filename);
  if (!file || !isTranscriptWatchFileRelevant(file, options.scope)) {
    return undefined;
  }

  const filePath = path.join(options.directory, file);
  const stats = await readTranscriptWatchFileStats(filePath);
  if (stats.exists && stats.stats && !stats.stats.isFile()) {
    return undefined;
  }

  const kind = classifyTranscriptWatchEvent(options.eventType, stats.exists);
  return {
    root: options.rootLabel,
    rootLabel: options.rootLabel,
    scope: options.scope,
    kind,
    file,
    path: formatTranscriptRootForOutput(filePath, options.cwd),
    timestamp: new Date().toISOString(),
    ...(stats.stats
      ? {
          sizeBytes: stats.stats.size,
          mtimeMs: stats.stats.mtimeMs
        }
      : {})
  };
}

function normalizeTranscriptWatchFileName(filename: string | Buffer | null): string | undefined {
  if (filename === null) {
    return undefined;
  }
  const value = Buffer.isBuffer(filename) ? filename.toString("utf8") : filename;
  if (value.trim().length === 0 || value.includes("/") || value.includes(path.sep)) {
    return undefined;
  }
  return value;
}

function isTranscriptWatchFileRelevant(file: string, scope: TranscriptWatchScope): boolean {
  if (file === "search-index.json") {
    return false;
  }
  if (scope === "active") {
    return file.endsWith(".jsonl");
  }
  return file.endsWith(".jsonl") || file.endsWith(".jsonl.gz");
}

async function readTranscriptWatchFileStats(filePath: string): Promise<{
  exists: boolean;
  stats?: import("node:fs").Stats;
}> {
  try {
    return {
      exists: true,
      stats: await fs.stat(filePath)
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { exists: false };
    }
    return { exists: false };
  }
}

function classifyTranscriptWatchEvent(eventType: string, exists: boolean): TranscriptWatchEventKind {
  if (eventType === "change") {
    return exists ? "modified" : "unknown";
  }
  if (eventType === "rename") {
    return exists ? "created" : "deleted";
  }
  return "unknown";
}

function applyGlobalSearchLimit(
  roots: TranscriptGlobalSearchRootResult[],
  maxResults: number | null
): { totalMatches: number; truncated: boolean } {
  let remaining = maxResults;
  let totalMatches = 0;
  let truncated = false;

  for (const root of roots) {
    if (root.ok && remaining !== null) {
      const activeLimit = Math.min(root.activeMatches.length, remaining);
      if (activeLimit < root.activeMatches.length) {
        truncated = true;
      }
      root.activeMatches = root.activeMatches.slice(0, activeLimit);
      remaining -= activeLimit;

      const archiveLimit = Math.min(root.archiveMatches.length, remaining);
      if (archiveLimit < root.archiveMatches.length) {
        truncated = true;
      }
      root.archiveMatches = root.archiveMatches.slice(0, archiveLimit);
      remaining -= archiveLimit;
    }

    totalMatches += root.activeMatches.length + root.archiveMatches.length;
  }

  return { totalMatches, truncated };
}

function formatTranscriptRootForOutput(root: string, cwd: string): string {
  const relative = path.relative(cwd, root);
  if (relative.length === 0) {
    return ".";
  }
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative;
  }
  return root;
}

async function validateTranscriptRootSearchDirectory(searchRoot: string): Promise<string | undefined> {
  try {
    const stats = await fs.lstat(searchRoot);
    if (stats.isSymbolicLink()) {
      return `Transcript root search path is a symlink and will not be followed: ${searchRoot}`;
    }
    if (!stats.isDirectory()) {
      return `Transcript root search path is not a directory: ${searchRoot}`;
    }
    return undefined;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return `Transcript root search path does not exist: ${searchRoot}`;
    }
    return `Transcript root search path could not be read: ${searchRoot}: ${sanitizeTranscriptSearchError(error)}`;
  }
}

async function discoverTranscriptRootCandidates(
  searchRoot: string,
  options: {
    cwd: string;
    searchRootLabel: string;
    maxDepth: number;
    includeEmpty: boolean;
  }
): Promise<TranscriptRootDiscoveryCandidate[]> {
  const discovered = new Map<string, TranscriptRootDiscoveryCandidate>();

  async function maybeAddTranscriptRoot(candidateRoot: string): Promise<void> {
    const resolvedRoot = path.resolve(candidateRoot);
    const key = path.normalize(resolvedRoot);
    if (discovered.has(key)) {
      return;
    }
    if (!(await isDirectoryNoSymlink(resolvedRoot))) {
      return;
    }
    const candidate = await buildTranscriptRootDiscoveryCandidate(resolvedRoot, {
      cwd: options.cwd,
      searchRootLabel: options.searchRootLabel
    });
    if (
      (options.includeEmpty && isLikelyTranscriptRootPath(resolvedRoot)) ||
      candidate.activeFileCount > 0 ||
      candidate.archiveFileCount > 0
    ) {
      discovered.set(key, candidate);
    }
  }

  async function visitDirectory(directory: string, depth: number): Promise<void> {
    if (depth === 0 || isLikelyTranscriptRootPath(directory)) {
      await maybeAddTranscriptRoot(directory);
    }
    if (depth >= options.maxDepth || isLikelyTranscriptRootPath(directory)) {
      return;
    }

    let dirents;
    try {
      dirents = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error) && ["EACCES", "EPERM", "ENOENT", "ENOTDIR"].includes(error.code ?? "")) {
        return;
      }
      throw error;
    }

    for (const dirent of dirents.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!dirent.isDirectory() || dirent.isSymbolicLink() || shouldSkipTranscriptRootDiscoveryDir(dirent.name)) {
        continue;
      }
      const childPath = path.join(directory, dirent.name);
      if (dirent.name === ".god-code" && depth + 2 <= options.maxDepth) {
        await maybeAddTranscriptRoot(path.join(childPath, "transcripts"));
      }
      await visitDirectory(childPath, depth + 1);
    }
  }

  await visitDirectory(searchRoot, 0);
  return [...discovered.values()].sort((left, right) => left.root.localeCompare(right.root));
}

async function buildTranscriptRootDiscoveryCandidate(
  transcriptRoot: string,
  options: { cwd: string; searchRootLabel: string }
): Promise<TranscriptRootDiscoveryCandidate> {
  return {
    root: formatTranscriptRootForOutput(transcriptRoot, options.cwd),
    rootLabel: formatTranscriptRootForOutput(transcriptRoot, options.cwd),
    searchRoot: options.searchRootLabel,
    activeFileCount: await countTranscriptRootActiveFiles(transcriptRoot),
    archiveFileCount: await countTranscriptRootArchiveFiles(transcriptRoot),
    hasSearchIndex: await pathExists(path.join(transcriptRoot, "search-index.json"))
  };
}

function isLikelyTranscriptRootPath(directory: string): boolean {
  return path.basename(directory) === "transcripts" && path.basename(path.dirname(directory)) === ".god-code";
}

function shouldSkipTranscriptRootDiscoveryDir(name: string): boolean {
  return new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__"
  ]).has(name);
}

async function isDirectoryNoSymlink(directory: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(directory);
    return stats.isDirectory() && !stats.isSymbolicLink();
  } catch (error) {
    if (isNodeError(error) && ["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(error.code ?? "")) {
      return false;
    }
    throw error;
  }
}

async function countTranscriptRootActiveFiles(transcriptRoot: string): Promise<number> {
  const dirents = await safeReadDir(transcriptRoot);
  return dirents.filter((dirent) => dirent.isFile() && dirent.name.endsWith(".jsonl")).length;
}

async function countTranscriptRootArchiveFiles(transcriptRoot: string): Promise<number> {
  const dirents = await safeReadDir(resolveTranscriptArchiveDir(transcriptRoot));
  return dirents.filter(
    (dirent) =>
      dirent.isFile() && (dirent.name.endsWith(".jsonl") || dirent.name.endsWith(".jsonl.gz"))
  ).length;
}

async function safeReadDir(directory: string): Promise<import("node:fs").Dirent[]> {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && ["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(error.code ?? "")) {
      return [];
    }
    throw error;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    return false;
  }
}

function renderGlobalSearchScope(
  lines: string[],
  label: "active" | "archive",
  matches: TranscriptSearchResult[]
): void {
  lines.push(`  ${label}:`);
  if (matches.length === 0) {
    lines.push("    no matches");
    return;
  }
  for (const result of matches) {
    const summary = result.summary;
    const matchedTypes = result.matchedTypes.length > 0 ? result.matchedTypes.join(",") : "-";
    lines.push(`    ${[
      summary.sessionId,
      `matches=${result.matchedEntryCount}`,
      `types=${matchedTypes}`,
      `entries=${summary.entryCount}`,
      `turns=${summary.turnCount}`,
      `last=${summary.lastTimestamp || "-"}`,
      `prompt="${truncate(summary.firstPrompt, 80)}"`
    ].join("  ")}`);
  }
}

function transcriptSearchResultJson(result: TranscriptSearchResult): Record<string, unknown> {
  return {
    summary: result.summary,
    matched_entry_count: result.matchedEntryCount,
    matched_types: result.matchedTypes
  };
}

function transcriptSearchIndexRefreshResultJson(result: TranscriptSearchIndexRefreshResult): Record<string, unknown> {
  return {
    index_path: result.indexPath,
    schema_version: result.index.schemaVersion,
    generated_at: result.index.generatedAt,
    transcript_dir: result.index.transcriptDir,
    include_archive: result.index.includeArchive,
    session_count: result.index.sessionCount,
    created: result.created,
    added_count: result.addedCount,
    updated_count: result.updatedCount,
    removed_count: result.removedCount,
    unchanged_count: result.unchangedCount,
    sessions: result.index.sessions.map((session) => ({
      scope: session.scope,
      summary: session.summary,
      source_mtime_ms: session.sourceMtimeMs,
      source_size_bytes: session.sourceSizeBytes
    }))
  };
}

function sanitizeTranscriptSearchError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function buildTranscriptSearchIndexSessions(
  transcriptDir: string,
  scope: TranscriptSearchIndexScope,
  options: { includeGzip?: boolean } = {}
): Promise<TranscriptSearchIndexSession[]> {
  const sources = await listTranscriptFileSources(transcriptDir, scope, options);
  const sessions: TranscriptSearchIndexSession[] = [];

  for (const source of sources) {
    const session = await buildTranscriptSearchIndexSessionFromSource(source);
    if (session.entries.length === 0) {
      continue;
    }
    sessions.push(session);
  }

  return sessions;
}

async function listTranscriptSearchIndexSources(
  transcriptDir: string,
  options: { includeArchive?: boolean } = {}
): Promise<TranscriptSearchIndexSourceRef[]> {
  const sources = await listTranscriptFileSources(transcriptDir, "active");
  if (options.includeArchive === true) {
    sources.push(
      ...(await listTranscriptFileSources(resolveTranscriptArchiveDir(transcriptDir), "archive", {
        includeGzip: true
      }))
    );
  }
  return sources;
}

async function listTranscriptFileSources(
  transcriptDir: string,
  scope: TranscriptSearchIndexScope,
  options: { includeGzip?: boolean } = {}
): Promise<TranscriptSearchIndexSourceRef[]> {
  const filePaths = await listTranscriptFiles(transcriptDir, options);
  const sources: TranscriptSearchIndexSourceRef[] = [];

  for (const filePath of filePaths) {
    const stats = await fs.stat(filePath);
    sources.push({
      scope,
      filePath,
      sourceMtimeMs: stats.mtimeMs,
      sourceSizeBytes: stats.size
    });
  }

  return sources;
}

async function buildTranscriptSearchIndexSessionFromSource(
  source: TranscriptSearchIndexSourceRef
): Promise<TranscriptSearchIndexSession> {
  const entries = await readTranscriptEntries(source.filePath);
  const summary = summarizeTranscriptSession(source.filePath, entries);
  return {
    scope: source.scope,
    summary,
    summarySearchText: searchableSummaryText(summary),
    entries: entries.map((entry) => ({
      type: entry.type,
      searchableText: searchableEntryText(entry)
    })),
    sourceMtimeMs: source.sourceMtimeMs,
    sourceSizeBytes: source.sourceSizeBytes
  };
}

async function readTranscriptFileText(filePath: string): Promise<string> {
  if (isGzipTranscriptPath(filePath)) {
    return gunzipSync(await fs.readFile(filePath)).toString("utf8");
  }
  return await fs.readFile(filePath, "utf8");
}

async function resolveTranscriptRecoverySource(
  transcriptDir: string,
  sessionId: string,
  sourceMode: TranscriptRecoverySourceMode
): Promise<TranscriptRecoverySource> {
  if (sourceMode === "archive") {
    return await resolveArchivedRecoverySource(transcriptDir, sessionId);
  }

  const activePath = transcriptFileForSession(transcriptDir, sessionId);
  try {
    await fs.access(activePath);
    return {
      kind: "active",
      path: activePath,
      compressed: false
    };
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT" || sourceMode !== "include-archived") {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new Error(`Transcript session not found: ${sessionId}`);
      }
      throw error;
    }
  }

  return await resolveArchivedRecoverySource(transcriptDir, sessionId);
}

async function resolveArchivedRecoverySource(
  transcriptDir: string,
  sessionId: string
): Promise<TranscriptRecoverySource> {
  const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
  let archivePath: string;
  try {
    archivePath = await archivedTranscriptFileForSession(archiveDir, sessionId);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Archived transcript session not found: ${sessionId}`);
    }
    throw error;
  }

  return {
    kind: "archive",
    path: archivePath,
    compressed: isGzipTranscriptPath(archivePath)
  };
}

function transcriptFileForSession(transcriptDir: string, sessionId: string): string {
  const safeSessionId = [...sessionId]
    .map((char) => (/^[A-Za-z0-9_-]$/u.test(char) ? char : "_"))
    .join("");
  return path.join(transcriptDir, `${safeSessionId}.jsonl`);
}

function compressedTranscriptFileForSession(transcriptDir: string, sessionId: string): string {
  return `${transcriptFileForSession(transcriptDir, sessionId)}.gz`;
}

async function archivedTranscriptFileForSession(
  archiveDir: string,
  sessionId: string
): Promise<string> {
  const plainPath = transcriptFileForSession(archiveDir, sessionId);
  try {
    await fs.access(plainPath);
    return plainPath;
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  const compressedPath = compressedTranscriptFileForSession(archiveDir, sessionId);
  await fs.access(compressedPath);
  return compressedPath;
}

function isGzipTranscriptPath(filePath: string): boolean {
  return filePath.endsWith(".jsonl.gz");
}

function transcriptSummaryIsOlderThan(summary: TranscriptSessionSummary, cutoff: Date): boolean {
  const lastTimestamp = Date.parse(summary.lastTimestamp);
  if (Number.isNaN(lastTimestamp)) {
    throw new Error(`Transcript session has invalid last timestamp: ${summary.sessionId}`);
  }
  return lastTimestamp < cutoff.getTime();
}

async function assertArchiveTargetsDoNotExist(
  sessions: TranscriptCleanupSessionResult[]
): Promise<void> {
  for (const session of sessions) {
    if (!session.archivePath) {
      continue;
    }
    try {
      await fs.access(session.archivePath);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    throw new Error(`Transcript archive target already exists: ${session.archivePath}`);
  }
}

function transcriptEntryMatches(entry: TranscriptJsonlEntry, normalizedQuery: string): boolean {
  return searchableEntryText(entry).toLowerCase().includes(normalizedQuery);
}

function summaryMatchesQuery(
  summary: TranscriptSessionSummary,
  normalizedQuery: string
): boolean {
  return searchableSummaryText(summary).toLowerCase().includes(normalizedQuery);
}

function searchableSummaryText(summary: TranscriptSessionSummary): string {
  return [summary.sessionId, summary.firstPrompt, summary.firstTimestamp, summary.lastTimestamp]
    .join("\n");
}

function searchableEntryText(entry: TranscriptJsonlEntry): string {
  return [
    entry.session_id,
    entry.turn_id,
    entry.type,
    entry.timestamp,
    JSON.stringify(entry.payload)
  ].join("\n");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function transcriptSearchIndexSourceKey(
  scope: TranscriptSearchIndexScope,
  filePath: string
): string {
  return `${scope}\0${path.resolve(filePath)}`;
}

function asTranscriptSearchIndex(value: unknown, filePath: string): TranscriptSearchIndex {
  if (!isRecord(value)) {
    throw new Error(`Invalid transcript search index: ${filePath}`);
  }
  if (value.schemaVersion !== 1) {
    throw new Error(`Unsupported transcript search index schema version in ${filePath}`);
  }
  if (!Array.isArray(value.sessions)) {
    throw new Error(`Invalid transcript search index sessions in ${filePath}`);
  }

  const sessions = value.sessions.map((session, index) =>
    asTranscriptSearchIndexSession(session, filePath, index)
  );

  return {
    schemaVersion: 1,
    generatedAt: stringValue(value.generatedAt),
    transcriptDir: stringValue(value.transcriptDir),
    includeArchive: value.includeArchive === true,
    sessionCount: numberValue(value.sessionCount),
    sessions
  };
}

function asTranscriptSearchIndexSession(
  value: unknown,
  filePath: string,
  index: number
): TranscriptSearchIndexSession {
  if (!isRecord(value) || !isRecord(value.summary) || !Array.isArray(value.entries)) {
    throw new Error(`Invalid transcript search index session ${index} in ${filePath}`);
  }
  const scope = value.scope === "archive" ? "archive" : "active";
  const summaryValue = value.summary;
  const entries = value.entries.map((entry, entryIndex) => {
    if (!isRecord(entry)) {
      throw new Error(
        `Invalid transcript search index entry ${entryIndex} for session ${index} in ${filePath}`
      );
    }
    return {
      type: stringValue(entry.type),
      searchableText: stringValue(entry.searchableText)
    };
  });

  return {
    scope,
    summary: {
      sessionId: stringValue(summaryValue.sessionId),
      entryCount: numberValue(summaryValue.entryCount),
      turnCount: numberValue(summaryValue.turnCount),
      firstTimestamp: stringValue(summaryValue.firstTimestamp),
      lastTimestamp: stringValue(summaryValue.lastTimestamp),
      firstPrompt: stringValue(summaryValue.firstPrompt),
      filePath: stringValue(summaryValue.filePath)
    },
    summarySearchText: stringValue(value.summarySearchText),
    entries,
    sourceMtimeMs: numberValue(value.sourceMtimeMs),
    sourceSizeBytes: numberValue(value.sourceSizeBytes)
  };
}

function parseJsonLine(filePath: string, lineNumber: number, line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Malformed transcript JSONL at ${filePath}:${lineNumber}: ${reason}`);
  }
}

function asTranscriptJsonlEntry(
  value: unknown,
  filePath: string,
  lineNumber: number
): TranscriptJsonlEntry {
  if (!isRecord(value)) {
    throw new Error(`Invalid transcript entry at ${filePath}:${lineNumber}.`);
  }

  const payload = isRecord(value.payload) ? { ...value.payload } : {};
  const type = stringValue(value.type) || stringValue(payload.type) || "unknown";
  const turnId = stringValue(value.turn_id) || stringValue(payload.turn_id);

  return {
    session_id: stringValue(value.session_id),
    turn_id: turnId,
    type,
    timestamp: stringValue(value.timestamp),
    payload
  };
}

function renderTranscriptPayload(entry: TranscriptJsonlEntry): string {
  const payload = entry.payload;

  if (entry.type === "user") {
    const message = isRecord(payload.message) ? payload.message : {};
    return `user: ${stringValue(message.content)}`;
  }

  if (entry.type === "assistant") {
    const message = isRecord(payload.message) ? payload.message : {};
    return `assistant: ${stringValue(message.content)}`;
  }

  if (entry.type === "tool_call") {
    const toolCall = isRecord(payload.tool_call) ? payload.tool_call : {};
    const toolName = stringValue(toolCall.tool_name) || stringValue(toolCall.name) || "unknown";
    const toolCallId = stringValue(toolCall.tool_call_id);
    const input = isRecord(toolCall.input) ? toolCall.input : {};
    return [`tool_call: ${toolName}${toolCallId ? ` (${toolCallId})` : ""}`, `input: ${formatJson(input)}`].join("\n");
  }

  if (entry.type === "tool_result") {
    const result = isRecord(payload.result) ? payload.result : {};
    const toolName = stringValue(payload.tool_name) || "unknown";
    const toolCallId = stringValue(payload.tool_call_id);
    return [
      `tool_result: ${toolName}${toolCallId ? ` (${toolCallId})` : ""}`,
      `result: ${formatJson(result)}`
    ].join("\n");
  }

  if (entry.type === "provider_context") {
    const context = isRecord(payload.provider_context) ? payload.provider_context : {};
    const providerName = stringValue(context.provider_name) || "unknown";
    const items = Array.isArray(context.items) ? context.items.length : 0;
    const responseId = stringValue(context.response_id);
    return `provider_context: provider=${providerName} response_id=${responseId || "-"} items=${items}`;
  }

  return formatJson(payload);
}

function findFirstUserPrompt(entries: TranscriptJsonlEntry[]): string {
  for (const entry of entries) {
    if (entry.type !== "user") {
      continue;
    }
    const message = isRecord(entry.payload.message) ? entry.payload.message : undefined;
    const content = message ? stringValue(message.content) : "";
    if (content) {
      return content;
    }
  }
  return "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function truncateForPreview(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function formatJson(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
