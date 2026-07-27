import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const watchFixture = vi.hoisted(() => ({
  watch: vi.fn()
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    watch: watchFixture.watch
  };
});

import {
  renderTranscriptWatchJson,
  resolveTranscriptArchiveDir,
  watchTranscriptSessions,
  type TranscriptWatchResult
} from "../src/transcripts/history.js";

const tempDirs: string[] = [];
const pendingSentinel = Symbol("pending");

class FakeWatcher extends EventEmitter {
  public closeCalls = 0;

  public constructor(private readonly closeHook: () => void = () => undefined) {
    super();
  }

  public close(): void {
    this.closeCalls += 1;
    this.closeHook();
  }
}

beforeEach(() => {
  watchFixture.watch.mockReset();
});

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe("transcript watcher finalization continuity", () => {
  it("closes every watcher and projects cleanup failure onto the existing root", async () => {
    const { cwd, transcriptDir } = await createTranscriptRoot(true);
    const cleanupError = new Error("transcript-watcher-close-secret-phase600");
    const activeWatcher = new FakeWatcher(() => {
      throw cleanupError;
    });
    const archiveWatcher = new FakeWatcher();
    installWatchResults([activeWatcher, archiveWatcher]);

    const outcome = await settleWithin(watchTranscriptSessions({
      cwd,
      roots: [transcriptDir],
      includeArchive: true,
      maxEvents: 1,
      timeoutMs: 10
    }), 150);

    expect(outcome).not.toBe(pendingSentinel);
    const result = outcome as TranscriptWatchResult;
    expect(result.roots[0]).toEqual({
      root: "transcripts",
      rootLabel: "transcripts",
      ok: false,
      error: "transcript watcher cleanup failed",
      watchedScopes: ["active", "archive"]
    });
    expect(activeWatcher.closeCalls).toBe(1);
    expect(archiveWatcher.closeCalls).toBe(1);
    expect(renderTranscriptWatchJson(result)).not.toContain(cleanupError.message);
  });

  it("preserves archive setup primary across active watcher cleanup failure", async () => {
    const { cwd, transcriptDir } = await createTranscriptRoot(true);
    const activeWatcher = new FakeWatcher(() => {
      throw new Error("transcript-active-close-secondary-phase600");
    });
    const setupPrimary = new Error("transcript archive setup primary phase600");
    installWatchResults([activeWatcher, setupPrimary]);

    const outcome = await settleWithin(watchTranscriptSessions({
      cwd,
      roots: [transcriptDir],
      includeArchive: true,
      maxEvents: 1,
      timeoutMs: 10
    }), 150);

    expect(outcome).not.toBe(pendingSentinel);
    const result = outcome as TranscriptWatchResult;
    expect(result.roots[0]?.ok).toBe(false);
    expect(result.roots[0]?.error).toContain(setupPrimary.message);
    expect(result.roots[0]?.error).not.toContain("active-close-secondary");
    expect(activeWatcher.closeCalls).toBe(1);
  });

  it("observes unexpected event rejection without creating an unhandled derivative", async () => {
    const { cwd, transcriptDir } = await createTranscriptRoot(false);
    const watcher = new FakeWatcher();
    const eventPrimary = new Error("transcript-event-primary-phase600");
    watchFixture.watch.mockImplementation((...args: unknown[]) => {
      const listener = args[2] as (eventType: string, filename: unknown) => void;
      setImmediate(() => {
        listener("rename", {
          trim(): never {
            throw eventPrimary;
          }
        });
      });
      return watcher;
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const result = await watchTranscriptSessions({
        cwd,
        roots: [transcriptDir],
        maxEvents: 1,
        timeoutMs: 20
      });
      await delayMs(20);

      expect(result.eventCount).toBe(0);
      expect(result.timedOut).toBe(true);
      expect(watcher.closeCalls).toBe(1);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

function installWatchResults(results: Array<FakeWatcher | Error>): void {
  let index = 0;
  watchFixture.watch.mockImplementation(() => {
    const result = results[index++];
    if (result instanceof Error) {
      throw result;
    }
    if (!result) {
      throw new Error("Unexpected transcript watcher creation.");
    }
    return result;
  });
}

async function createTranscriptRoot(includeArchive: boolean): Promise<{
  cwd: string;
  transcriptDir: string;
}> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-transcript-phase600-"));
  tempDirs.push(cwd);
  const transcriptDir = path.join(cwd, "transcripts");
  await fs.mkdir(transcriptDir, { recursive: true });
  if (includeArchive) {
    await fs.mkdir(resolveTranscriptArchiveDir(transcriptDir), { recursive: true });
  }
  return { cwd, transcriptDir };
}

async function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T | typeof pendingSentinel> {
  return await Promise.race([
    promise,
    delayMs(timeoutMs).then(() => pendingSentinel)
  ]);
}

async function delayMs(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
