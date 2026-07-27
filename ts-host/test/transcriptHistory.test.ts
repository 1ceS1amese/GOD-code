import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GodCodeReplSession } from "../src/cli/repl.js";
import {
  runGodCodeRecoveredSession,
  runGodCodeResumedSession,
  runGodCodeSession
} from "../src/headless/godCodeRunSession.js";
import type { GodCodeEventEnvelope } from "../src/types/godCodeProtocol.js";
import {
  buildTranscriptSearchIndex,
  buildTranscriptRecoveryPlan,
  buildTranscriptResumeMessages,
  compressArchivedTranscriptSession,
  cleanupTranscriptSessions,
  discoverTranscriptRoots,
  deleteArchivedTranscriptSession,
  deleteTranscriptSession,
  listArchivedTranscriptSessions,
  listTranscriptSessions,
  readArchivedTranscriptEntriesForSession,
  readArchivedTranscriptTimelineForSession,
  readTranscriptEntries,
  readTranscriptEntriesForSession,
  readTranscriptTimelineForSession,
  renderTranscriptArchiveCompressJson,
  renderTranscriptArchiveRestoreJson,
  renderTranscriptCleanup,
  renderTranscriptCleanupJson,
  renderTranscriptGlobalSearch,
  renderTranscriptGlobalSearchJson,
  renderTranscriptRootDiscovery,
  renderTranscriptRootDiscoveryJson,
  renderSessionList,
  renderTranscriptDeleteJson,
  renderTranscriptIndexSearchJson,
  renderTranscriptIndexWatchRefresh,
  renderTranscriptIndexWatchRefreshJson,
  renderTranscriptReplay,
  renderTranscriptReplayJson,
  renderTranscriptRecoveryPlan,
  renderTranscriptRecoveryPlanJson,
  renderTranscriptSearch,
  renderTranscriptSearchIndexBuildJson,
  renderTranscriptSearchIndexRefreshJson,
  renderTranscriptSearchJson,
  renderTranscriptTimeline,
  renderTranscriptTimelineJson,
  renderTranscriptWatch,
  renderTranscriptWatchJson,
  resolveTranscriptSearchIndexPath,
  resolveTranscriptArchiveDir,
  resolveTranscriptDir,
  refreshTranscriptSearchIndex,
  restoreArchivedTranscriptSession,
  searchArchivedTranscriptSessions,
  searchGlobalTranscriptSessions,
  searchTranscriptIndex,
  searchTranscriptSessions,
  watchRefreshTranscriptSearchIndex,
  watchTranscriptSessions
} from "../src/transcripts/history.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-history-"));
  tempDirs.push(dir);
  return dir;
}

async function writeJsonl(filePath: string, entries: Array<Record<string, unknown>>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, entries.map((entry) => JSON.stringify(entry)).join("\n"), "utf8");
}

async function delayMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function transcriptEntry(
  sessionId: string,
  timestamp: string,
  content: string
): Record<string, unknown> {
  return {
    session_id: sessionId,
    turn_id: "t1",
    type: "user",
    timestamp,
    payload: {
      type: "user",
      turn_id: "t1",
      message: { role: "user", content }
    }
  };
}

describe("transcript history helpers", () => {
  it("resolves transcript directory from env or project-local default", () => {
    expect(resolveTranscriptDir("/work", {})).toBe(path.join("/work", ".god-code", "transcripts"));
    expect(resolveTranscriptDir("/work", { GOD_CODE_TRANSCRIPT_DIR: "custom/transcripts" })).toBe(
      path.join("/work", "custom", "transcripts")
    );
  });

  it("lists transcript sessions and renders summaries", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await writeJsonl(path.join(transcriptDir, "s1.jsonl"), [
      {
        session_id: "s1",
        turn_id: "t1",
        type: "user",
        timestamp: "2026-01-01T00:00:00Z",
        payload: {
          type: "user",
          turn_id: "t1",
          message: { role: "user", content: "read README.md" }
        }
      },
      {
        session_id: "s1",
        turn_id: "t1",
        type: "assistant",
        timestamp: "2026-01-01T00:00:01Z",
        payload: {
          type: "assistant",
          turn_id: "t1",
          message: { role: "assistant", content: "done" }
        }
      }
    ]);

    const summaries = await listTranscriptSessions(transcriptDir);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      sessionId: "s1",
      entryCount: 2,
      turnCount: 1,
      firstPrompt: "read README.md"
    });
    expect(renderSessionList(transcriptDir, summaries)).toContain("s1  entries=2  turns=1");
  });

  it("renders replay for user, assistant, tool and provider context entries", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await writeJsonl(path.join(transcriptDir, "s1.jsonl"), [
      {
        session_id: "s1",
        turn_id: "t1",
        type: "user",
        timestamp: "2026-01-01T00:00:00Z",
        payload: {
          type: "user",
          turn_id: "t1",
          message: { role: "user", content: "read a.txt" }
        }
      },
      {
        session_id: "s1",
        turn_id: "t1",
        type: "tool_call",
        timestamp: "2026-01-01T00:00:01Z",
        payload: {
          type: "tool_call",
          turn_id: "t1",
          tool_call: {
            tool_call_id: "tc1",
            tool_name: "Read",
            input: { path: "a.txt" }
          }
        }
      },
      {
        session_id: "s1",
        turn_id: "t1",
        type: "tool_result",
        timestamp: "2026-01-01T00:00:02Z",
        payload: {
          type: "tool_result",
          turn_id: "t1",
          tool_call_id: "tc1",
          tool_name: "Read",
          result: { ok: true }
        }
      },
      {
        session_id: "s1",
        turn_id: "t1",
        type: "provider_context",
        timestamp: "2026-01-01T00:00:03Z",
        payload: {
          type: "provider_context",
          turn_id: "t1",
          provider_context: {
            provider_name: "openai-responses",
            response_id: "resp_1",
            items: [{ type: "message" }]
          }
        }
      },
      {
        session_id: "s1",
        turn_id: "t1",
        type: "assistant",
        timestamp: "2026-01-01T00:00:04Z",
        payload: {
          type: "assistant",
          turn_id: "t1",
          message: { role: "assistant", content: "done" }
        }
      }
    ]);

    const replay = renderTranscriptReplay(await readTranscriptEntriesForSession(transcriptDir, "s1"));

    expect(replay).toContain("Session: s1");
    expect(replay).toContain("user: read a.txt");
    expect(replay).toContain("tool_call: Read (tc1)");
    expect(replay).toContain("tool_result: Read (tc1)");
    expect(replay).toContain("provider_context: provider=openai-responses response_id=resp_1 items=1");
    expect(replay).toContain("assistant: done");
  });

  it("renders active transcript timeline text and JSON with bounded previews", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await writeJsonl(path.join(transcriptDir, "timeline-active.jsonl"), [
      {
        session_id: "timeline-active",
        turn_id: "t1",
        type: "user",
        timestamp: "2026-01-01T00:00:00.000Z",
        payload: {
          type: "user",
          turn_id: "t1",
          message: { role: "user", content: "read alpha file with extra words" },
          internal_secret: "do-not-render-raw"
        }
      },
      {
        session_id: "timeline-active",
        turn_id: "t1",
        type: "tool_call",
        timestamp: "2026-01-01T00:00:01.000Z",
        payload: {
          type: "tool_call",
          turn_id: "t1",
          tool_call: {
            tool_call_id: "tc1",
            tool_name: "Read",
            input: { path: "alpha.txt" }
          }
        }
      },
      {
        session_id: "timeline-active",
        turn_id: "t1",
        type: "tool_result",
        timestamp: "2026-01-01T00:00:02.000Z",
        payload: {
          type: "tool_result",
          turn_id: "t1",
          tool_call_id: "tc1",
          tool_name: "Read",
          result: { ok: false, error: { message: "read failed because missing file" } }
        }
      },
      {
        session_id: "timeline-active",
        turn_id: "t1",
        type: "assistant",
        timestamp: "2026-01-01T00:00:03.000Z",
        payload: {
          type: "assistant",
          turn_id: "t1",
          message: { role: "assistant", content: "reported failure" }
        }
      }
    ]);

    const timeline = await readTranscriptTimelineForSession(transcriptDir, "timeline-active", {
      previewChars: 12
    });
    const text = renderTranscriptTimeline(timeline);
    const json = JSON.parse(renderTranscriptTimelineJson(timeline));

    expect(timeline).toMatchObject({
      sessionId: "timeline-active",
      scope: "active",
      entryCount: 4,
      turnCount: 1,
      durationMs: 3000,
      toolEventCount: 2,
      errorLikeCount: 1
    });
    expect(timeline.typeCounts).toMatchObject({
      user: 1,
      assistant: 1,
      tool_call: 1,
      tool_result: 1
    });
    expect(timeline.entries[0]?.preview).toBe("read alpha …");
    expect(timeline.entries[1]).toMatchObject({
      toolName: "Read",
      toolCallId: "tc1"
    });
    expect(timeline.entries[2]).toMatchObject({
      toolName: "Read",
      status: "error"
    });
    expect(text).toContain("GOD-code session timeline:");
    expect(text).toContain("tool=Read");
    expect(text).toContain("status=error");
    expect(text).not.toContain("internal_secret");
    expect(json).toMatchObject({
      session_id: "timeline-active",
      scope: "active",
      entry_count: 4,
      duration_ms: 3000,
      tool_event_count: 2,
      error_like_count: 1,
      preview_chars: 12
    });
    expect(json.entries[0].preview).toBe("read alpha …");
    expect(json.entries[1].tool_name).toBe("Read");
  });

  it("supports timeline output without previews", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await writeJsonl(path.join(transcriptDir, "timeline-no-preview.jsonl"), [
      transcriptEntry(
        "timeline-no-preview",
        "2026-01-01T00:00:00.000Z",
        "hidden preview text"
      )
    ]);

    const timeline = await readTranscriptTimelineForSession(transcriptDir, "timeline-no-preview", {
      includePreview: false
    });
    const json = JSON.parse(renderTranscriptTimelineJson(timeline));
    const text = renderTranscriptTimeline(timeline);

    expect(timeline.entries[0]?.preview).toBeUndefined();
    expect(json.entries[0].preview).toBeUndefined();
    expect(text).not.toContain("preview=");
    expect(text).not.toContain("hidden preview text");
  });

  it("renders archived transcript timelines from JSONL and gzip", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
    await writeJsonl(path.join(archiveDir, "timeline-archive.jsonl"), [
      transcriptEntry(
        "timeline-archive",
        "2026-01-01T00:00:00.000Z",
        "archived timeline prompt"
      )
    ]);

    const jsonlTimeline = await readArchivedTranscriptTimelineForSession(
      transcriptDir,
      "timeline-archive"
    );
    await compressArchivedTranscriptSession(transcriptDir, "timeline-archive");
    const gzipTimeline = await readArchivedTranscriptTimelineForSession(
      transcriptDir,
      "timeline-archive"
    );
    const gzipJson = JSON.parse(renderTranscriptTimelineJson(gzipTimeline));

    expect(jsonlTimeline).toMatchObject({
      sessionId: "timeline-archive",
      scope: "archive",
      entryCount: 1
    });
    expect(jsonlTimeline.filePath).toMatch(/timeline-archive\.jsonl$/u);
    expect(gzipTimeline.filePath).toMatch(/timeline-archive\.jsonl\.gz$/u);
    expect(gzipJson.scope).toBe("archive");
    expect(gzipJson.entries[0].preview).toContain("archived timeline");
  });

  it("builds resume messages from transcript entries and ignores provider context", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await writeJsonl(path.join(transcriptDir, "s1.jsonl"), [
      {
        session_id: "s1",
        turn_id: "t1",
        type: "user",
        timestamp: "2026-01-01T00:00:00Z",
        payload: {
          type: "user",
          turn_id: "t1",
          message: { role: "user", content: "read a.txt" }
        }
      },
      {
        session_id: "s1",
        turn_id: "t1",
        type: "tool_call",
        timestamp: "2026-01-01T00:00:01Z",
        payload: {
          type: "tool_call",
          turn_id: "t1",
          tool_call: {
            tool_call_id: "tc1",
            tool_name: "Read",
            input: { path: "a.txt" }
          }
        }
      },
      {
        session_id: "s1",
        turn_id: "t1",
        type: "tool_result",
        timestamp: "2026-01-01T00:00:02Z",
        payload: {
          type: "tool_result",
          turn_id: "t1",
          tool_call_id: "tc1",
          tool_name: "Read",
          result: { ok: true, output: { content: "hello" } }
        }
      },
      {
        session_id: "s1",
        turn_id: "t1",
        type: "provider_context",
        timestamp: "2026-01-01T00:00:03Z",
        payload: {
          type: "provider_context",
          turn_id: "t1",
          provider_context: { provider_name: "openai-responses" }
        }
      },
      {
        session_id: "s1",
        turn_id: "t1",
        type: "assistant",
        timestamp: "2026-01-01T00:00:04Z",
        payload: {
          type: "assistant",
          turn_id: "t1",
          message: { role: "assistant", content: "done" }
        }
      }
    ]);

    const entries = await readTranscriptEntriesForSession(transcriptDir, "s1");

    expect(buildTranscriptResumeMessages(entries)).toEqual([
      { kind: "user", role: "user", content: "read a.txt" },
      {
        kind: "tool_call",
        tool_call: {
          tool_call_id: "tc1",
          tool_name: "Read",
          input: { path: "a.txt" }
        }
      },
      {
        kind: "tool_result",
        tool_call_id: "tc1",
        tool_name: "Read",
        result: { ok: true, output: { content: "hello" } }
      },
      { kind: "assistant", role: "assistant", content: "done" }
    ]);
  });

  it("returns no resume messages for non-replayable transcript entries", async () => {
    expect(
      buildTranscriptResumeMessages([
        {
          session_id: "s1",
          turn_id: "t1",
          type: "provider_context",
          timestamp: "2026-01-01T00:00:00Z",
          payload: { type: "provider_context" }
        }
      ])
    ).toEqual([]);
  });

  it("builds a strict recovery plan for a valid active transcript", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await writeJsonl(path.join(transcriptDir, "recover-valid.jsonl"), [
      transcriptEntry("recover-valid", "2026-01-01T00:00:00Z", "read a.txt"),
      {
        session_id: "recover-valid",
        turn_id: "t1",
        type: "tool_call",
        timestamp: "2026-01-01T00:00:01Z",
        payload: {
          type: "tool_call",
          turn_id: "t1",
          tool_call: {
            tool_call_id: "tc1",
            tool_name: "Read",
            input: { path: "a.txt" }
          }
        }
      },
      {
        session_id: "recover-valid",
        turn_id: "t1",
        type: "tool_result",
        timestamp: "2026-01-01T00:00:02Z",
        payload: {
          type: "tool_result",
          turn_id: "t1",
          tool_call_id: "tc1",
          tool_name: "Read",
          result: { ok: true, output: { content: "hello" } }
        }
      }
    ]);

    const plan = await buildTranscriptRecoveryPlan(transcriptDir, "recover-valid", {
      previewChars: 8
    });
    const json = JSON.parse(renderTranscriptRecoveryPlanJson(plan));

    expect(plan.recoverable).toBe(true);
    expect(plan.source).toMatchObject({ kind: "active", compressed: false });
    expect(plan.restoredMessageCount).toBe(3);
    expect(plan.skippedEntryCount).toBe(0);
    expect(plan.warnings).toEqual([]);
    expect(renderTranscriptRecoveryPlan(plan)).toContain("Recovery plan for recover-valid");
    expect(json).toMatchObject({
      type: "transcript_recovery",
      session_id: "recover-valid",
      strategy: "strict",
      recoverable: true,
      restored_message_count: 3
    });
    expect(JSON.stringify(json)).not.toContain("initialMessages");
  });

  it("marks strict recovery unrecoverable for orphan tool results", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await writeJsonl(path.join(transcriptDir, "recover-strict.jsonl"), [
      transcriptEntry("recover-strict", "2026-01-01T00:00:00Z", "hello"),
      {
        session_id: "recover-strict",
        turn_id: "t1",
        type: "tool_result",
        timestamp: "2026-01-01T00:00:01Z",
        payload: {
          type: "tool_result",
          turn_id: "t1",
          tool_call_id: "missing",
          tool_name: "Read",
          result: { ok: true }
        }
      }
    ]);

    const plan = await buildTranscriptRecoveryPlan(transcriptDir, "recover-strict");

    expect(plan.recoverable).toBe(false);
    expect(plan.skippedEntryCount).toBe(1);
    expect(plan.warnings[0]).toMatchObject({ code: "orphan_tool_result" });
  });

  it("uses best-effort recovery to skip malformed entries", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await writeJsonl(path.join(transcriptDir, "recover-best.jsonl"), [
      transcriptEntry("recover-best", "2026-01-01T00:00:00Z", "hello"),
      {
        session_id: "recover-best",
        turn_id: "t1",
        type: "tool_result",
        timestamp: "2026-01-01T00:00:01Z",
        payload: {
          type: "tool_result",
          turn_id: "t1",
          tool_call_id: "missing",
          tool_name: "Read",
          result: { ok: true }
        }
      },
      {
        session_id: "recover-best",
        turn_id: "t1",
        type: "assistant",
        timestamp: "2026-01-01T00:00:02Z",
        payload: {
          type: "assistant",
          turn_id: "t1",
          message: { role: "assistant", content: "done" }
        }
      }
    ]);

    const plan = await buildTranscriptRecoveryPlan(transcriptDir, "recover-best", {
      strategy: "best-effort"
    });

    expect(plan.recoverable).toBe(true);
    expect(plan.initialMessages.map((message) => message.kind)).toEqual(["user", "assistant"]);
    expect(plan.skippedEntryCount).toBe(1);
    expect(plan.warnings[0]).toMatchObject({ code: "orphan_tool_result" });
  });

  it("compacts recovery messages into a bounded summary plus recent messages", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await writeJsonl(path.join(transcriptDir, "recover-compact.jsonl"), [
      transcriptEntry("recover-compact", "2026-01-01T00:00:00Z", "old one"),
      transcriptEntry("recover-compact", "2026-01-01T00:00:01Z", "old two"),
      transcriptEntry("recover-compact", "2026-01-01T00:00:02Z", "recent one"),
      transcriptEntry("recover-compact", "2026-01-01T00:00:03Z", "recent two")
    ]);

    const plan = await buildTranscriptRecoveryPlan(transcriptDir, "recover-compact", {
      strategy: "compact",
      maxRestoredMessages: 3
    });

    expect(plan.recoverable).toBe(true);
    expect(plan.initialMessages).toHaveLength(3);
    expect(plan.initialMessages[0]).toMatchObject({
      kind: "user",
      content: expect.stringContaining("[GOD-code recovery summary]")
    });
    expect(plan.initialMessages[1]).toMatchObject({ kind: "user", content: "recent one" });
    expect(plan.initialMessages[2]).toMatchObject({ kind: "user", content: "recent two" });
  });

  it("can recover from compressed archived transcript sources", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
    await writeJsonl(path.join(archiveDir, "recover-archive.jsonl"), [
      transcriptEntry("recover-archive", "2026-01-01T00:00:00Z", "archived prompt")
    ]);
    await compressArchivedTranscriptSession(transcriptDir, "recover-archive");

    const plan = await buildTranscriptRecoveryPlan(transcriptDir, "recover-archive", {
      sourceMode: "archive"
    });

    expect(plan.recoverable).toBe(true);
    expect(plan.source).toMatchObject({ kind: "archive", compressed: true });
    expect(plan.source.path).toMatch(/recover-archive\.jsonl\.gz$/u);
  });

  it("searches transcript sessions and renders text and JSON results", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await writeJsonl(path.join(transcriptDir, "s1.jsonl"), [
      {
        session_id: "s1",
        turn_id: "t1",
        type: "user",
        timestamp: "2026-01-01T00:00:00Z",
        payload: {
          type: "user",
          turn_id: "t1",
          message: { role: "user", content: "bash printf ok" }
        }
      },
      {
        session_id: "s1",
        turn_id: "t1",
        type: "tool_result",
        timestamp: "2026-01-01T00:00:01Z",
        payload: {
          type: "tool_result",
          turn_id: "t1",
          tool_call_id: "tc1",
          tool_name: "Bash",
          result: { ok: true, output: { stdout: "ok" } }
        }
      }
    ]);

    const results = await searchTranscriptSessions(transcriptDir, "stdout");
    const text = renderTranscriptSearch(transcriptDir, "stdout", results);
    const json = JSON.parse(renderTranscriptSearchJson(results));

    expect(results).toHaveLength(1);
    expect(results[0]?.matchedEntryCount).toBe(1);
    expect(results[0]?.matchedTypes).toEqual(["tool_result"]);
    expect(text).toContain("s1  matches=1  types=tool_result");
    expect(json[0].matched_entry_count).toBe(1);
    expect(renderTranscriptSearch(transcriptDir, "missing", [])).toContain("No sessions matched");
  });

  it("searches global transcript roots with archive scope and deterministic truncation", async () => {
    const dir = await createTempDir();
    const rootA = path.join(dir, "root-a");
    const rootB = path.join(dir, "root-b");
    const archiveA = resolveTranscriptArchiveDir(rootA);
    await writeJsonl(path.join(rootA, "active-a.jsonl"), [
      transcriptEntry("active-a", "2026-05-02T00:00:00.000Z", "global needle active a")
    ]);
    await writeJsonl(path.join(archiveA, "archive-a.jsonl"), [
      transcriptEntry("archive-a", "2026-05-01T00:00:00.000Z", "global needle archive a")
    ]);
    await compressArchivedTranscriptSession(rootA, "archive-a");
    await writeJsonl(path.join(rootB, "active-b.jsonl"), [
      transcriptEntry("active-b", "2026-05-03T00:00:00.000Z", "global needle active b")
    ]);

    const result = await searchGlobalTranscriptSessions({
      cwd: dir,
      query: "global needle",
      roots: [rootA, rootB],
      includeArchive: true,
      maxResults: 2
    });
    const text = renderTranscriptGlobalSearch(result);
    const json = JSON.parse(renderTranscriptGlobalSearchJson(result));

    expect(result.type).toBe("transcript_global_search");
    expect(result.discovery).toBeNull();
    expect(result.totalMatches).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.roots[0]).toMatchObject({
      root: "root-a",
      rootLabel: "root-a",
      ok: true
    });
    expect(result.roots[0]?.activeMatches[0]?.summary.sessionId).toBe("active-a");
    expect(result.roots[0]?.archiveMatches[0]?.summary.sessionId).toBe("archive-a");
    expect(result.roots[1]?.activeMatches).toEqual([]);
    expect(text).toContain("GOD-code global transcript search:");
    expect(text).toContain("[1] root-a");
    expect(text).toContain("archive-a");
    expect(json).toMatchObject({
      type: "transcript_global_search",
      query: "global needle",
      include_archive: true,
      max_results: 2,
      total_matches: 2,
      truncated: true
    });
    expect(json.discovery).toBeNull();
    expect(json.roots[0].active_matches[0].summary.sessionId).toBe("active-a");
    expect(json.roots[0].archive_matches[0].summary.sessionId).toBe("archive-a");
  });

  it("reports missing global transcript roots without hiding other matches", async () => {
    const dir = await createTempDir();
    const existingRoot = path.join(dir, "existing-root");
    const missingRoot = path.join(dir, "missing-root");
    await writeJsonl(path.join(existingRoot, "active.jsonl"), [
      transcriptEntry("active", "2026-05-01T00:00:00.000Z", "global missing-root needle")
    ]);

    const result = await searchGlobalTranscriptSessions({
      cwd: dir,
      query: "needle",
      roots: [missingRoot, existingRoot],
      includeArchive: false
    });

    expect(result.totalMatches).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.roots[0]).toMatchObject({
      root: "missing-root",
      ok: false
    });
    expect(result.roots[0]?.error).toContain("does not exist");
    expect(result.roots[1]?.activeMatches[0]?.summary.sessionId).toBe("active");
    await expect(
      searchGlobalTranscriptSessions({
        cwd: dir,
        query: "needle",
        roots: [existingRoot],
        maxResults: 0
      })
    ).rejects.toThrow("positive integer");
  });

  it("attaches discovery diagnostics to global transcript search results", async () => {
    const dir = await createTempDir();
    const workspace = path.join(dir, "workspace");
    const rootA = path.join(workspace, "repo-a", ".god-code", "transcripts");
    const rootB = path.join(workspace, "repo-b", ".god-code", "transcripts");
    await writeJsonl(path.join(rootA, "active-a.jsonl"), [
      transcriptEntry("active-a", "2026-05-02T00:00:00.000Z", "phase77 discovery needle a")
    ]);
    await writeJsonl(path.join(rootB, "active-b.jsonl"), [
      transcriptEntry("active-b", "2026-05-03T00:00:00.000Z", "phase77 discovery needle b")
    ]);

    const discovery = await discoverTranscriptRoots({
      cwd: dir,
      searchRoots: [workspace],
      maxDepth: 4,
      limit: 10
    });
    const result = await searchGlobalTranscriptSessions({
      cwd: dir,
      query: "phase77 discovery needle",
      roots: discovery.roots.map((root) => root.root),
      discovery: {
        searchRoots: discovery.searchRoots,
        discoveredRoots: discovery.roots,
        maxDepth: discovery.maxDepth,
        limit: discovery.limit,
        truncated: discovery.truncated
      }
    });
    const text = renderTranscriptGlobalSearch(result);
    const json = JSON.parse(renderTranscriptGlobalSearchJson(result));

    expect(result.discovery).toMatchObject({
      maxDepth: 4,
      limit: 10,
      truncated: false
    });
    expect(result.roots.map((root) => root.root)).toEqual([
      path.join("workspace", "repo-a", ".god-code", "transcripts"),
      path.join("workspace", "repo-b", ".god-code", "transcripts")
    ]);
    expect(result.totalMatches).toBe(2);
    expect(text).toContain("Discovery:");
    expect(text).toContain("discovered=2");
    expect(json.discovery.search_roots[0]).toMatchObject({
      search_root: "workspace",
      ok: true,
      discovered_count: 2
    });
    expect(json.discovery.discovered_roots).toHaveLength(2);
    expect(json.roots[0].active_matches[0].summary.sessionId).toBe("active-a");
    expect(json.roots[1].active_matches[0].summary.sessionId).toBe("active-b");
  });

  it("discovers transcript roots under explicit search roots without reading payloads", async () => {
    const dir = await createTempDir();
    const workspace = path.join(dir, "workspace");
    const transcriptRoot = path.join(workspace, "repo-a", ".god-code", "transcripts");
    const archiveRoot = resolveTranscriptArchiveDir(transcriptRoot);
    await writeJsonl(path.join(transcriptRoot, "active.jsonl"), [
      transcriptEntry("active", "2026-05-01T00:00:00.000Z", "discovery active")
    ]);
    await writeJsonl(path.join(archiveRoot, "archived.jsonl"), [
      transcriptEntry("archived", "2026-04-01T00:00:00.000Z", "discovery archive")
    ]);
    await fs.writeFile(path.join(transcriptRoot, "search-index.json"), "{}", "utf8");
    await fs.mkdir(path.join(workspace, "repo-a", "node_modules", "nested", ".god-code", "transcripts"), {
      recursive: true
    });

    const result = await discoverTranscriptRoots({
      cwd: dir,
      searchRoots: [workspace],
      maxDepth: 4,
      limit: 10
    });
    const text = renderTranscriptRootDiscovery(result);
    const json = JSON.parse(renderTranscriptRootDiscoveryJson(result));

    expect(result.type).toBe("transcript_root_discovery");
    expect(result.searchRoots).toEqual([
      {
        searchRoot: "workspace",
        ok: true,
        discoveredCount: 1
      }
    ]);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]).toMatchObject({
      root: path.join("workspace", "repo-a", ".god-code", "transcripts"),
      rootLabel: path.join("workspace", "repo-a", ".god-code", "transcripts"),
      searchRoot: "workspace",
      activeFileCount: 1,
      archiveFileCount: 1,
      hasSearchIndex: true
    });
    expect(text).toContain("GOD-code transcript roots:");
    expect(text).toContain("active_files: 1");
    expect(text).not.toContain("discovery active");
    expect(json).toMatchObject({
      type: "transcript_root_discovery",
      max_depth: 4,
      limit: 10,
      include_empty: false,
      truncated: false
    });
    expect(json.roots[0].active_file_count).toBe(1);
    expect(json.roots[0].has_search_index).toBe(true);
  });

  it("discovers direct transcript roots and respects include-empty plus max depth", async () => {
    const dir = await createTempDir();
    const directRoot = path.join(dir, "direct-transcripts");
    const nestedRoot = path.join(dir, "workspace", "repo", ".god-code", "transcripts");
    const emptyRoot = path.join(dir, "empty", ".god-code", "transcripts");
    await writeJsonl(path.join(directRoot, "direct.jsonl"), [
      transcriptEntry("direct", "2026-05-01T00:00:00.000Z", "direct root")
    ]);
    await writeJsonl(path.join(nestedRoot, "nested.jsonl"), [
      transcriptEntry("nested", "2026-05-01T00:00:00.000Z", "nested root")
    ]);
    await fs.mkdir(emptyRoot, { recursive: true });

    const shallow = await discoverTranscriptRoots({
      cwd: dir,
      searchRoots: [path.join(dir, "workspace")],
      maxDepth: 1,
      limit: 10
    });
    const direct = await discoverTranscriptRoots({
      cwd: dir,
      searchRoots: [directRoot],
      maxDepth: 1,
      limit: 10
    });
    const includeEmpty = await discoverTranscriptRoots({
      cwd: dir,
      searchRoots: [path.join(dir, "empty")],
      maxDepth: 3,
      limit: 10,
      includeEmpty: true
    });

    expect(shallow.roots).toEqual([]);
    expect(direct.roots[0]).toMatchObject({
      root: "direct-transcripts",
      activeFileCount: 1
    });
    expect(includeEmpty.roots[0]).toMatchObject({
      root: path.join("empty", ".god-code", "transcripts"),
      activeFileCount: 0,
      archiveFileCount: 0
    });
  });

  it("reports missing transcript root search paths and truncates discovered roots", async () => {
    const dir = await createTempDir();
    const workspace = path.join(dir, "workspace");
    const missing = path.join(dir, "missing");
    await writeJsonl(path.join(workspace, "repo-a", ".god-code", "transcripts", "a.jsonl"), [
      transcriptEntry("a", "2026-05-01T00:00:00.000Z", "a")
    ]);
    await writeJsonl(path.join(workspace, "repo-b", ".god-code", "transcripts", "b.jsonl"), [
      transcriptEntry("b", "2026-05-01T00:00:00.000Z", "b")
    ]);

    const result = await discoverTranscriptRoots({
      cwd: dir,
      searchRoots: [missing, workspace],
      maxDepth: 4,
      limit: 1
    });

    expect(result.truncated).toBe(true);
    expect(result.roots).toHaveLength(1);
    expect(result.searchRoots[0]).toMatchObject({
      searchRoot: "missing",
      ok: false,
      discoveredCount: 0
    });
    expect(result.searchRoots[0]?.error).toContain("does not exist");
    expect(result.searchRoots[1]).toMatchObject({
      searchRoot: "workspace",
      ok: true,
      discoveredCount: 1
    });
    await expect(
      discoverTranscriptRoots({
        cwd: dir,
        searchRoots: [workspace],
        maxDepth: 0,
        limit: 1
      })
    ).rejects.toThrow("positive integer");
  });

  it("watches transcript roots with bounded timeout diagnostics", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await fs.mkdir(transcriptDir, { recursive: true });

    const result = await watchTranscriptSessions({
      cwd: dir,
      roots: [transcriptDir],
      maxEvents: 1,
      timeoutMs: 20
    });
    const text = renderTranscriptWatch(result);
    const json = JSON.parse(renderTranscriptWatchJson(result));

    expect(result.type).toBe("transcript_watch");
    expect(result.timedOut).toBe(true);
    expect(result.eventCount).toBe(0);
    expect(result.roots[0]).toMatchObject({
      root: "transcripts",
      ok: true,
      watchedScopes: ["active"]
    });
    expect(text).toContain("GOD-code transcript watch:");
    expect(text).toContain("timed_out: true");
    expect(json).toMatchObject({
      type: "transcript_watch",
      include_archive: false,
      max_events: 1,
      timeout_ms: 20,
      event_count: 0,
      timed_out: true,
      discovery: null
    });
    await expect(
      watchTranscriptSessions({
        cwd: dir,
        roots: [transcriptDir],
        maxEvents: 0,
        timeoutMs: 20
      })
    ).rejects.toThrow("positive integer");
  });

  it("normalizes transcript watch events and ignores unrelated files", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
    await fs.mkdir(archiveDir, { recursive: true });

    const watchPromise = watchTranscriptSessions({
      cwd: dir,
      roots: [transcriptDir],
      includeArchive: true,
      maxEvents: 1,
      timeoutMs: 3000
    });
    await delayMs(100);
    await fs.writeFile(path.join(transcriptDir, "ignore.txt"), "ignored", "utf8");
    await fs.writeFile(path.join(transcriptDir, "session.jsonl"), "{}\n", "utf8");

    const result = await watchPromise;
    const json = JSON.parse(renderTranscriptWatchJson(result));

    expect(result.timedOut).toBe(false);
    expect(result.eventCount).toBe(1);
    expect(result.roots[0]).toMatchObject({
      root: "transcripts",
      ok: true,
      watchedScopes: ["active", "archive"]
    });
    expect(result.events[0]).toMatchObject({
      root: "transcripts",
      scope: "active",
      file: "session.jsonl"
    });
    expect(["created", "modified", "unknown"]).toContain(result.events[0]?.kind);
    expect(json.events[0].file).toBe("session.jsonl");
    expect(JSON.stringify(json)).not.toContain("ignored");
  });

  it("attaches discovery metadata to transcript watch diagnostics", async () => {
    const dir = await createTempDir();
    const workspace = path.join(dir, "workspace");
    const transcriptDir = path.join(workspace, "repo", ".god-code", "transcripts");
    await writeJsonl(path.join(transcriptDir, "existing.jsonl"), [
      transcriptEntry("existing", "2026-05-01T00:00:00.000Z", "watch discovery")
    ]);

    const discovery = await discoverTranscriptRoots({
      cwd: dir,
      searchRoots: [workspace],
      maxDepth: 4,
      limit: 10
    });
    const result = await watchTranscriptSessions({
      cwd: dir,
      roots: discovery.roots.map((root) => root.root),
      maxEvents: 1,
      timeoutMs: 20,
      discovery: {
        searchRoots: discovery.searchRoots,
        discoveredRoots: discovery.roots,
        maxDepth: discovery.maxDepth,
        limit: discovery.limit,
        truncated: discovery.truncated
      }
    });
    const json = JSON.parse(renderTranscriptWatchJson(result));

    expect(result.discovery).toMatchObject({
      maxDepth: 4,
      limit: 10,
      truncated: false
    });
    expect(result.roots[0]?.root).toBe(path.join("workspace", "repo", ".god-code", "transcripts"));
    expect(json.discovery.search_roots[0]).toMatchObject({
      search_root: "workspace",
      ok: true,
      discovered_count: 1
    });
    expect(json.discovery.discovered_roots).toHaveLength(1);
  });

  it("refreshes the transcript search index on watch timeout when requested", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await writeJsonl(path.join(transcriptDir, "existing.jsonl"), [
      transcriptEntry("existing", "2026-05-01T00:00:00.000Z", "watch refresh timeout needle")
    ]);

    const result = await watchRefreshTranscriptSearchIndex({
      cwd: dir,
      roots: [transcriptDir],
      maxEvents: 1,
      timeoutMs: 20,
      debounceMs: 1,
      refreshOnTimeout: true
    });
    const text = renderTranscriptIndexWatchRefresh(result);
    const json = JSON.parse(renderTranscriptIndexWatchRefreshJson(result));
    const search = await searchTranscriptIndex(transcriptDir, "timeout needle");

    expect(result.type).toBe("transcript_index_watch_refresh");
    expect(result.timedOut).toBe(true);
    expect(result.eventCount).toBe(0);
    expect(result.refreshCount).toBe(1);
    expect(result.roots[0]).toMatchObject({
      root: "transcripts",
      ok: true,
      eventCount: 0,
      refreshCount: 1
    });
    expect(result.roots[0]?.lastRefresh?.created).toBe(true);
    expect(text).toContain("GOD-code transcript index watch-refresh:");
    expect(text).toContain("last_refresh:");
    expect(json).toMatchObject({
      type: "transcript_index_watch_refresh",
      refresh_on_timeout: true,
      refresh_count: 1,
      timed_out: true
    });
    expect(json.roots[0].last_refresh.added_count).toBe(1);
    expect(search.results[0]?.summary.sessionId).toBe("existing");
    await expect(
      watchRefreshTranscriptSearchIndex({
        cwd: dir,
        roots: [transcriptDir],
        maxEvents: 1,
        timeoutMs: 20,
        debounceMs: 0,
        refreshOnTimeout: true
      })
    ).rejects.toThrow("positive integer");
  });

  it("refreshes the transcript search index after a watched transcript event", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await fs.mkdir(transcriptDir, { recursive: true });

    const watchRefreshPromise = watchRefreshTranscriptSearchIndex({
      cwd: dir,
      roots: [transcriptDir],
      maxEvents: 1,
      timeoutMs: 3000,
      debounceMs: 1
    });
    await delayMs(100);
    await fs.writeFile(path.join(transcriptDir, "created.jsonl"), `${JSON.stringify(
      transcriptEntry("created", "2026-05-01T00:00:00.000Z", "watch refresh event needle")
    )}\n`, "utf8");

    const result = await watchRefreshPromise;
    const json = JSON.parse(renderTranscriptIndexWatchRefreshJson(result));
    const search = await searchTranscriptIndex(transcriptDir, "event needle");

    expect(result.timedOut).toBe(false);
    expect(result.eventCount).toBe(1);
    expect(result.refreshCount).toBe(1);
    expect(result.roots[0]?.eventCount).toBe(1);
    expect(result.roots[0]?.refreshCount).toBe(1);
    expect(result.roots[0]?.lastRefresh?.addedCount).toBe(1);
    expect(result.events[0]).toMatchObject({
      root: "transcripts",
      scope: "active",
      file: "created.jsonl"
    });
    expect(json.events[0].file).toBe("created.jsonl");
    expect(json.roots[0].last_refresh.session_count).toBe(1);
    expect(search.results[0]?.summary.sessionId).toBe("created");
  });

  it("attaches discovery metadata to transcript index watch-refresh diagnostics", async () => {
    const dir = await createTempDir();
    const workspace = path.join(dir, "workspace");
    const transcriptDir = path.join(workspace, "repo", ".god-code", "transcripts");
    await writeJsonl(path.join(transcriptDir, "existing.jsonl"), [
      transcriptEntry("existing", "2026-05-01T00:00:00.000Z", "watch refresh discovery")
    ]);

    const discovery = await discoverTranscriptRoots({
      cwd: dir,
      searchRoots: [workspace],
      maxDepth: 4,
      limit: 10
    });
    const result = await watchRefreshTranscriptSearchIndex({
      cwd: dir,
      roots: discovery.roots.map((root) => root.root),
      maxEvents: 1,
      timeoutMs: 20,
      debounceMs: 1,
      refreshOnTimeout: true,
      discovery: {
        searchRoots: discovery.searchRoots,
        discoveredRoots: discovery.roots,
        maxDepth: discovery.maxDepth,
        limit: discovery.limit,
        truncated: discovery.truncated
      }
    });
    const json = JSON.parse(renderTranscriptIndexWatchRefreshJson(result));

    expect(result.discovery).toMatchObject({
      maxDepth: 4,
      limit: 10,
      truncated: false
    });
    expect(result.refreshCount).toBe(1);
    expect(result.roots[0]?.root).toBe(path.join("workspace", "repo", ".god-code", "transcripts"));
    expect(json.discovery.search_roots[0]).toMatchObject({
      search_root: "workspace",
      ok: true,
      discovered_count: 1
    });
    expect(json.discovery.discovered_roots).toHaveLength(1);
  });

  it("builds a transcript search index and searches active plus archived sessions", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
    await writeJsonl(path.join(transcriptDir, "active-index.jsonl"), [
      transcriptEntry("active-index", "2026-05-01T00:00:00.000Z", "active index needle")
    ]);
    await writeJsonl(path.join(archiveDir, "archive-index.jsonl"), [
      transcriptEntry("archive-index", "2026-03-01T00:00:00.000Z", "archived index needle")
    ]);
    await compressArchivedTranscriptSession(transcriptDir, "archive-index");

    const buildResult = await buildTranscriptSearchIndex(transcriptDir, {
      includeArchive: true,
      now: new Date("2026-06-01T00:00:00.000Z")
    });
    const buildJson = JSON.parse(renderTranscriptSearchIndexBuildJson(buildResult));
    const archiveSearch = await searchTranscriptIndex(transcriptDir, "archived index");
    const archiveSearchJson = JSON.parse(renderTranscriptIndexSearchJson(archiveSearch));
    const activeSearch = await searchTranscriptIndex(transcriptDir, "active index");

    expect(buildResult.indexPath).toBe(resolveTranscriptSearchIndexPath(transcriptDir));
    expect(buildJson).toMatchObject({
      generated_at: "2026-06-01T00:00:00.000Z",
      include_archive: true,
      session_count: 2
    });
    expect(buildJson.sessions.map((session: { scope: string }) => session.scope).sort()).toEqual([
      "active",
      "archive"
    ]);
    await expect(fs.stat(buildResult.indexPath)).resolves.toBeTruthy();
    expect(archiveSearch.results).toHaveLength(1);
    expect(archiveSearch.results[0]).toMatchObject({
      scope: "archive",
      matchedEntryCount: 1,
      matchedTypes: ["user"]
    });
    expect(archiveSearch.results[0]?.summary.filePath).toMatch(/archive-index\.jsonl\.gz$/u);
    expect(archiveSearchJson.results[0]).toMatchObject({
      scope: "archive",
      matched_entry_count: 1
    });
    expect(activeSearch.results[0]?.scope).toBe("active");
  });

  it("refreshes a missing transcript search index", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    await writeJsonl(path.join(transcriptDir, "refresh-create.jsonl"), [
      transcriptEntry("refresh-create", "2026-05-01T00:00:00.000Z", "refresh create needle")
    ]);

    const refreshResult = await refreshTranscriptSearchIndex(transcriptDir, {
      now: new Date("2026-06-02T00:00:00.000Z")
    });
    const refreshJson = JSON.parse(renderTranscriptSearchIndexRefreshJson(refreshResult));
    const search = await searchTranscriptIndex(transcriptDir, "create needle");

    expect(refreshJson).toMatchObject({
      generated_at: "2026-06-02T00:00:00.000Z",
      created: true,
      added_count: 1,
      updated_count: 0,
      removed_count: 0,
      unchanged_count: 0
    });
    expect(search.results[0]?.summary.sessionId).toBe("refresh-create");
  });

  it("incrementally refreshes changed transcript search index sources", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
    await writeJsonl(path.join(transcriptDir, "unchanged-index.jsonl"), [
      transcriptEntry("unchanged-index", "2026-05-01T00:00:00.000Z", "unchanged index needle")
    ]);
    await writeJsonl(path.join(transcriptDir, "updated-index.jsonl"), [
      transcriptEntry("updated-index", "2026-05-01T00:00:00.000Z", "old index needle")
    ]);
    await writeJsonl(path.join(archiveDir, "removed-index.jsonl"), [
      transcriptEntry("removed-index", "2026-03-01T00:00:00.000Z", "removed index needle")
    ]);
    await compressArchivedTranscriptSession(transcriptDir, "removed-index");
    await buildTranscriptSearchIndex(transcriptDir, {
      includeArchive: true,
      now: new Date("2026-06-01T00:00:00.000Z")
    });

    await writeJsonl(path.join(transcriptDir, "updated-index.jsonl"), [
      transcriptEntry(
        "updated-index",
        "2026-05-01T00:00:01.000Z",
        "updated index needle with longer refreshed content"
      )
    ]);
    await writeJsonl(path.join(transcriptDir, "added-index.jsonl"), [
      transcriptEntry("added-index", "2026-05-02T00:00:00.000Z", "added index needle")
    ]);
    await fs.unlink(path.join(archiveDir, "removed-index.jsonl.gz"));

    const refreshResult = await refreshTranscriptSearchIndex(transcriptDir, {
      includeArchive: true,
      now: new Date("2026-06-03T00:00:00.000Z")
    });
    const updatedSearch = await searchTranscriptIndex(transcriptDir, "updated index");
    const addedSearch = await searchTranscriptIndex(transcriptDir, "added index");
    const removedSearch = await searchTranscriptIndex(transcriptDir, "removed index");

    expect(refreshResult).toMatchObject({
      created: false,
      addedCount: 1,
      updatedCount: 1,
      removedCount: 1,
      unchangedCount: 1
    });
    expect(updatedSearch.results[0]?.summary.sessionId).toBe("updated-index");
    expect(addedSearch.results[0]?.summary.sessionId).toBe("added-index");
    expect(removedSearch.results).toEqual([]);
  });

  it("reports missing transcript search index before indexed search", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");

    await expect(searchTranscriptIndex(transcriptDir, "needle")).rejects.toThrow(
      "Transcript search index not found"
    );
  });

  it("renders replay JSON and deletes transcript sessions", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const filePath = path.join(transcriptDir, "s1.jsonl");
    await writeJsonl(filePath, [
      {
        session_id: "s1",
        turn_id: "t1",
        type: "user",
        timestamp: "2026-01-01T00:00:00Z",
        payload: {
          type: "user",
          turn_id: "t1",
          message: { role: "user", content: "read a.txt" }
        }
      }
    ]);

    const entries = await readTranscriptEntriesForSession(transcriptDir, "s1");
    const replayJson = JSON.parse(renderTranscriptReplayJson(entries));
    const deleteResult = await deleteTranscriptSession(transcriptDir, "s1");
    const deleteJson = JSON.parse(renderTranscriptDeleteJson(deleteResult));

    expect(replayJson).toMatchObject({
      session_id: "s1",
      entry_count: 1
    });
    expect(deleteResult).toMatchObject({
      sessionId: "s1",
      deleted: true,
      filePath
    });
    expect(deleteJson).toMatchObject({
      session_id: "s1",
      deleted: true,
      file_path: filePath
    });
    await expect(readTranscriptEntriesForSession(transcriptDir, "s1")).rejects.toThrow(
      "Transcript session not found"
    );
  });

  it("reports malformed JSONL with file and line", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "bad.jsonl");
    await fs.writeFile(filePath, "{bad-json}\n", "utf8");

    await expect(readTranscriptEntries(filePath)).rejects.toThrow("Malformed transcript JSONL");
  });

  it("dry-runs transcript cleanup without moving or deleting files", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const oldPath = path.join(transcriptDir, "old.jsonl");
    const newPath = path.join(transcriptDir, "new.jsonl");
    await writeJsonl(oldPath, [
      transcriptEntry("old", "2026-03-01T00:00:00.000Z", "old prompt")
    ]);
    await writeJsonl(newPath, [
      transcriptEntry("new", "2026-05-01T00:00:00.000Z", "new prompt")
    ]);

    const result = await cleanupTranscriptSessions(transcriptDir, {
      olderThanDays: 30,
      now: new Date("2026-05-07T00:00:00.000Z")
    });
    const text = renderTranscriptCleanup(result);
    const json = JSON.parse(renderTranscriptCleanupJson(result));

    expect(result).toMatchObject({
      action: "dry-run",
      matchedCount: 1,
      affectedCount: 0
    });
    expect(result.sessions[0]?.sessionId).toBe("old");
    expect(text).toContain("Dry-run only");
    expect(json.sessions[0].session_id).toBe("old");
    await expect(fs.stat(oldPath)).resolves.toBeTruthy();
    await expect(fs.stat(newPath)).resolves.toBeTruthy();
  });

  it("archives old transcript sessions and removes them from active history", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const oldPath = path.join(transcriptDir, "old.jsonl");
    const newPath = path.join(transcriptDir, "new.jsonl");
    await writeJsonl(oldPath, [
      transcriptEntry("old", "2026-03-01T00:00:00.000Z", "old prompt")
    ]);
    await writeJsonl(newPath, [
      transcriptEntry("new", "2026-05-01T00:00:00.000Z", "new prompt")
    ]);

    const result = await cleanupTranscriptSessions(transcriptDir, {
      olderThanDays: 30,
      action: "archive",
      now: new Date("2026-05-07T00:00:00.000Z")
    });

    expect(result).toMatchObject({
      action: "archive",
      matchedCount: 1,
      affectedCount: 1
    });
    expect(result.sessions[0]?.archivePath).toBe(path.join(transcriptDir, "archive", "old.jsonl"));
    await expect(fs.stat(path.join(transcriptDir, "archive", "old.jsonl"))).resolves.toBeTruthy();
    await expect(fs.stat(oldPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await listTranscriptSessions(transcriptDir)).map((summary) => summary.sessionId)).toEqual(["new"]);
  });

  it("deletes old transcript sessions while preserving newer sessions", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const oldPath = path.join(transcriptDir, "old.jsonl");
    const newPath = path.join(transcriptDir, "new.jsonl");
    await writeJsonl(oldPath, [
      transcriptEntry("old", "2026-03-01T00:00:00.000Z", "old prompt")
    ]);
    await writeJsonl(newPath, [
      transcriptEntry("new", "2026-05-01T00:00:00.000Z", "new prompt")
    ]);

    const result = await cleanupTranscriptSessions(transcriptDir, {
      olderThanDays: 30,
      action: "delete",
      now: new Date("2026-05-07T00:00:00.000Z")
    });

    expect(result).toMatchObject({
      action: "delete",
      matchedCount: 1,
      affectedCount: 1
    });
    await expect(fs.stat(oldPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(newPath)).resolves.toBeTruthy();
  });

  it("fails archive cleanup before moving when an archive target already exists", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const oldPath = path.join(transcriptDir, "old.jsonl");
    await writeJsonl(oldPath, [
      transcriptEntry("old", "2026-03-01T00:00:00.000Z", "old prompt")
    ]);
    await writeJsonl(path.join(transcriptDir, "archive", "old.jsonl"), [
      transcriptEntry("old", "2026-02-01T00:00:00.000Z", "archived")
    ]);

    await expect(
      cleanupTranscriptSessions(transcriptDir, {
        olderThanDays: 30,
        action: "archive",
        now: new Date("2026-05-07T00:00:00.000Z")
      })
    ).rejects.toThrow("archive target already exists");
    await expect(fs.stat(oldPath)).resolves.toBeTruthy();
  });

  it("lists and replays archived transcript sessions separately from active history", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
    await writeJsonl(path.join(transcriptDir, "active.jsonl"), [
      transcriptEntry("active", "2026-05-01T00:00:00.000Z", "active prompt")
    ]);
    await writeJsonl(path.join(archiveDir, "archived.jsonl"), [
      transcriptEntry("archived", "2026-03-01T00:00:00.000Z", "archived prompt")
    ]);

    const active = await listTranscriptSessions(transcriptDir);
    const archived = await listArchivedTranscriptSessions(transcriptDir);
    const archivedReplayJson = JSON.parse(
      renderTranscriptReplayJson(
        await readArchivedTranscriptEntriesForSession(transcriptDir, "archived")
      )
    );

    expect(active.map((summary) => summary.sessionId)).toEqual(["active"]);
    expect(archived.map((summary) => summary.sessionId)).toEqual(["archived"]);
    expect(archivedReplayJson).toMatchObject({
      session_id: "archived",
      entry_count: 1
    });
  });

  it("returns no archived sessions when archive directory does not exist", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");

    expect(await listArchivedTranscriptSessions(transcriptDir)).toEqual([]);
  });

  it("searches and deletes archived transcript sessions without touching active history", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
    const activePath = path.join(transcriptDir, "active.jsonl");
    const archivedPath = path.join(archiveDir, "archived-delete.jsonl");
    await writeJsonl(activePath, [
      transcriptEntry("active", "2026-05-01T00:00:00.000Z", "active prompt")
    ]);
    await writeJsonl(archivedPath, [
      transcriptEntry("archived-delete", "2026-03-01T00:00:00.000Z", "archived only needle")
    ]);

    const archivedResults = await searchArchivedTranscriptSessions(transcriptDir, "needle");
    const activeResults = await searchTranscriptSessions(transcriptDir, "needle");
    const deleteResult = await deleteArchivedTranscriptSession(transcriptDir, "archived-delete");
    const deleteJson = JSON.parse(renderTranscriptDeleteJson(deleteResult));

    expect(archivedResults).toHaveLength(1);
    expect(archivedResults[0]?.summary.sessionId).toBe("archived-delete");
    expect(activeResults).toEqual([]);
    expect(deleteResult).toMatchObject({
      sessionId: "archived-delete",
      deleted: true,
      filePath: archivedPath
    });
    expect(deleteJson).toMatchObject({
      session_id: "archived-delete",
      deleted: true,
      file_path: archivedPath
    });
    await expect(fs.stat(archivedPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(activePath)).resolves.toBeTruthy();
    expect((await listTranscriptSessions(transcriptDir)).map((summary) => summary.sessionId)).toEqual(["active"]);
  });

  it("compresses archived transcript sessions and keeps archive operations working", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
    const archivedPath = path.join(archiveDir, "compressed.jsonl");
    const compressedPath = path.join(archiveDir, "compressed.jsonl.gz");
    await writeJsonl(archivedPath, [
      transcriptEntry("compressed", "2026-03-01T00:00:00.000Z", "gzip needle")
    ]);

    const result = await compressArchivedTranscriptSession(transcriptDir, "compressed");
    const resultJson = JSON.parse(renderTranscriptArchiveCompressJson(result));
    const archived = await listArchivedTranscriptSessions(transcriptDir);
    const replayJson = JSON.parse(
      renderTranscriptReplayJson(
        await readArchivedTranscriptEntriesForSession(transcriptDir, "compressed")
      )
    );
    const searchResults = await searchArchivedTranscriptSessions(transcriptDir, "needle");

    expect(result).toMatchObject({
      sessionId: "compressed",
      compressed: true,
      sourcePath: archivedPath,
      compressedPath
    });
    expect(result.originalBytes).toBeGreaterThan(0);
    expect(result.compressedBytes).toBeGreaterThan(0);
    expect(resultJson).toMatchObject({
      session_id: "compressed",
      compressed: true,
      source_path: archivedPath,
      compressed_path: compressedPath
    });
    await expect(fs.stat(archivedPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(compressedPath)).resolves.toBeTruthy();
    expect(archived.map((summary) => summary.sessionId)).toEqual(["compressed"]);
    expect(archived[0]?.filePath).toBe(compressedPath);
    expect(replayJson).toMatchObject({
      session_id: "compressed",
      entry_count: 1
    });
    expect(searchResults[0]?.summary.sessionId).toBe("compressed");

    const restored = await restoreArchivedTranscriptSession(transcriptDir, "compressed");
    expect(restored.sourcePath).toBe(compressedPath);
    expect(restored.restoredPath).toBe(path.join(transcriptDir, "compressed.jsonl"));
    await expect(fs.stat(compressedPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await listTranscriptSessions(transcriptDir)).map((summary) => summary.sessionId)).toEqual(["compressed"]);
  });

  it("deletes compressed archived transcript sessions", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
    await writeJsonl(path.join(archiveDir, "compressed-delete.jsonl"), [
      transcriptEntry("compressed-delete", "2026-03-01T00:00:00.000Z", "compressed delete")
    ]);
    await compressArchivedTranscriptSession(transcriptDir, "compressed-delete");

    const deleteResult = await deleteArchivedTranscriptSession(transcriptDir, "compressed-delete");

    expect(deleteResult).toMatchObject({
      sessionId: "compressed-delete",
      deleted: true,
      filePath: path.join(archiveDir, "compressed-delete.jsonl.gz")
    });
    await expect(fs.stat(path.join(archiveDir, "compressed-delete.jsonl.gz"))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("restores archived transcript sessions back to active history", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
    const archivedPath = path.join(archiveDir, "archived.jsonl");
    await writeJsonl(archivedPath, [
      transcriptEntry("archived", "2026-03-01T00:00:00.000Z", "archived prompt")
    ]);

    const result = await restoreArchivedTranscriptSession(transcriptDir, "archived");
    const resultJson = JSON.parse(renderTranscriptArchiveRestoreJson(result));

    expect(result).toMatchObject({
      sessionId: "archived",
      restored: true,
      sourcePath: archivedPath,
      restoredPath: path.join(transcriptDir, "archived.jsonl")
    });
    expect(resultJson).toMatchObject({
      session_id: "archived",
      restored: true,
      source_path: archivedPath,
      restored_path: path.join(transcriptDir, "archived.jsonl")
    });
    await expect(fs.stat(archivedPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await listTranscriptSessions(transcriptDir)).map((summary) => summary.sessionId)).toEqual(["archived"]);
    expect(await listArchivedTranscriptSessions(transcriptDir)).toEqual([]);
  });

  it("does not restore archived transcript when active target already exists", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "transcripts");
    const archiveDir = resolveTranscriptArchiveDir(transcriptDir);
    const activePath = path.join(transcriptDir, "same.jsonl");
    const archivedPath = path.join(archiveDir, "same.jsonl");
    await writeJsonl(activePath, [
      transcriptEntry("same", "2026-05-01T00:00:00.000Z", "active prompt")
    ]);
    await writeJsonl(archivedPath, [
      transcriptEntry("same", "2026-03-01T00:00:00.000Z", "archived prompt")
    ]);

    await expect(restoreArchivedTranscriptSession(transcriptDir, "same")).rejects.toThrow(
      "Active transcript session already exists"
    );
    await expect(fs.stat(activePath)).resolves.toBeTruthy();
    await expect(fs.stat(archivedPath)).resolves.toBeTruthy();
  });
});

describe("transcript history integration", () => {
  it("writes a run transcript to the configured transcript directory", async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, "fixture.txt"), "fixture-body", "utf8");
    const transcriptDir = path.join(dir, "history");

    const result = await runGodCodeSession("read fixture.txt", dir, {
      transcriptDir
    });
    const summaries = await listTranscriptSessions(transcriptDir);
    const replay = renderTranscriptReplay(
      await readTranscriptEntriesForSession(transcriptDir, summaries[0]?.sessionId ?? "")
    );

    expect(result.status).toBe("success");
    expect(summaries).toHaveLength(1);
    expect(replay).toContain("user: read fixture.txt");
    expect(replay).toContain("assistant:");
  });

  it("can collect raw run events for JSON diagnostics", async () => {
    const dir = await createTempDir();
    const events: GodCodeEventEnvelope[] = [];

    const result = await runGodCodeSession("bash printf ok", dir, {
      stream: false,
      transcriptDir: path.join(dir, "history"),
      onEvent: (event) => events.push(event)
    });

    expect(result.status).toBe("success");
    expect(events.map((event) => event.event_type)).toContain("tool_call_requested");
    expect(events.map((event) => event.event_type)).toContain("turn_finished");
  });

  it("resumes a run from transcript history into a fresh session", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "history");
    const previous = await runGodCodeSession("bash printf previous", dir, {
      transcriptDir
    });
    const previousSessionId = (await listTranscriptSessions(transcriptDir))[0]?.sessionId ?? "";

    const resumed = await runGodCodeResumedSession(previousSessionId, "bash printf resumed", dir, {
      stream: false,
      transcriptDir
    });
    const summaries = await listTranscriptSessions(transcriptDir);

    expect(previous.status).toBe("success");
    expect(resumed.status).toBe("success");
    expect(resumed.resumed_from_session_id).toBe(previousSessionId);
    expect(resumed.restored_message_count).toBeGreaterThan(0);
    expect(JSON.stringify(resumed)).toContain("resumed");
    expect(summaries).toHaveLength(2);
  });

  it("recovers a run from transcript history into a fresh session", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "history");
    const previous = await runGodCodeSession("bash printf previous", dir, {
      transcriptDir
    });
    const previousSessionId = (await listTranscriptSessions(transcriptDir))[0]?.sessionId ?? "";

    const recovered = await runGodCodeRecoveredSession(
      previousSessionId,
      "bash printf recovered",
      dir,
      { strategy: "strict" },
      {
        stream: false,
        transcriptDir
      }
    );
    const summaries = await listTranscriptSessions(transcriptDir);

    expect(previous.status).toBe("success");
    expect(recovered.status).toBe("success");
    expect(recovered.recovered_from_session_id).toBe(previousSessionId);
    expect(recovered.recovery_strategy).toBe("strict");
    expect(recovered.restored_message_count).toBeGreaterThan(0);
    expect(recovered.skipped_entry_count).toBe(0);
    expect(JSON.stringify(recovered)).toContain("recovered");
    expect(summaries).toHaveLength(2);
  });

  it("rejects resume when transcript has no replayable messages", async () => {
    const dir = await createTempDir();
    const transcriptDir = path.join(dir, "history");
    await writeJsonl(path.join(transcriptDir, "s1.jsonl"), [
      {
        session_id: "s1",
        turn_id: "t1",
        type: "provider_context",
        timestamp: "2026-01-01T00:00:00Z",
        payload: { type: "provider_context" }
      }
    ]);

    await expect(
      runGodCodeResumedSession("s1", "bash printf resumed", dir, {
        transcriptDir
      })
    ).rejects.toThrow("no replayable messages");
  });

  it("writes consecutive REPL turns to one transcript session", async () => {
    const dir = await createTempDir();
    await fs.writeFile(path.join(dir, "fixture.txt"), "fixture-body", "utf8");
    const transcriptDir = path.join(dir, "history");
    const session = new GodCodeReplSession(dir, {
      transcriptDir,
      stream: true
    });

    try {
      await session.start();
      await session.submit("read fixture.txt");
      await session.submit("list .");
    } finally {
      await session.stop();
    }

    const summaries = await listTranscriptSessions(transcriptDir);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.turnCount).toBe(2);
  });
});
