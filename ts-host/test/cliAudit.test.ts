import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireJsonlAuditFileLock as acquireUntrackedJsonlAuditFileLock,
  getJsonlAuditLockDisposalPath,
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockPath,
  getJsonlAuditLockQuarantinePath,
  getJsonlAuditLockQuarantinePrefix,
  getJsonlAuditRotationStagingPath,
  getJsonlAuditRotationStagingPrefix,
  inspectJsonlAuditFileLock as inspectRuntimeJsonlAuditFileLock,
  inspectJsonlAuditLockDisposal as inspectRuntimeJsonlAuditLockDisposal,
  inspectJsonlAuditLockQuarantine as inspectRuntimeJsonlAuditLockQuarantine,
  MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
  MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES,
  type JsonlAuditFileLock
} from "../src/audit/jsonlAuditSink.js";
import {
  cleanupAuditEmptyLockDisposal,
  cleanupAuditEmptyLockQuarantine,
  cleanupAuditLock,
  cleanupAuditLockDisposal,
  cleanupAuditLockQuarantine,
  inspectAuditConfig,
  inspectAuditLockDisposal,
  inspectAuditLockDisposals,
  inspectAuditLockQuarantine,
  inspectAuditLockQuarantines,
  inspectAuditPath,
  inspectAuditRotationRecovery,
  inspectAuditRotationStaging,
  inspectAuditRotationStagings,
  recoverAuditLockQuarantine,
  recoverAuditRotationStaging,
  renderAuditLockCleanupReport,
  renderAuditLockCleanupReportJson,
  renderAuditEmptyLockDisposalCleanupReport,
  renderAuditEmptyLockDisposalCleanupReportJson,
  renderAuditEmptyLockQuarantineCleanupReport,
  renderAuditEmptyLockQuarantineCleanupReportJson,
  renderAuditLockDisposalReport,
  renderAuditLockDisposalReportJson,
  renderAuditLockDisposalCleanupReport,
  renderAuditLockDisposalCleanupReportJson,
  renderAuditTargetedLockDisposalReport,
  renderAuditTargetedLockDisposalReportJson,
  renderAuditTargetedLockQuarantineReport,
  renderAuditTargetedLockQuarantineReportJson,
  renderAuditLockQuarantineReport,
  renderAuditLockQuarantineReportJson,
  renderAuditLockQuarantineCleanupReport,
  renderAuditLockQuarantineCleanupReportJson,
  renderAuditLockQuarantineRecoveryReport,
  renderAuditLockQuarantineRecoveryReportJson,
  renderAuditConfigReport,
  renderAuditConfigReportJson,
  renderAuditPathReport,
  renderAuditPathReportJson,
  renderAuditRotationRecoveryReport,
  renderAuditRotationRecoveryReportJson,
  renderAuditRotationStagingRecoveryReport,
  renderAuditRotationStagingRecoveryReportJson,
  renderAuditRotationStagingReport,
  renderAuditRotationStagingReportJson,
  renderAuditTargetedRotationStagingReport,
  renderAuditTargetedRotationStagingReportJson
} from "../src/cli/audit.js";

const tempDirs: string[] = [];
const acquiredLocks: JsonlAuditFileLock[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    acquiredLocks.splice(0).map((lock) => lock.abandon())
  );
  await Promise.all(tempDirs.splice(0).map(
    (dir) => fs.rm(dir, { recursive: true, force: true })
  ));
});

async function acquireJsonlAuditFileLock(
  ...args: Parameters<typeof acquireUntrackedJsonlAuditFileLock>
): ReturnType<typeof acquireUntrackedJsonlAuditFileLock> {
  const lock = await acquireUntrackedJsonlAuditFileLock(...args);
  acquiredLocks.push(lock);
  return lock;
}

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-audit-cli-"));
  tempDirs.push(dir);
  return dir;
}

async function observeAuditCliPromiseAfterCloseDeadline<T>(
  operation: Promise<T>,
  closeStarted: Promise<void>
): Promise<{ settled: true; value: T } | { settled: false }> {
  await closeStarted;
  await vi.advanceTimersByTimeAsync(60_000);
  vi.useRealTimers();
  return Promise.race([
    operation.then((value) => ({ settled: true as const, value })),
    new Promise<{ settled: false }>((resolve) => {
      setTimeout(() => resolve({ settled: false }), 500);
    })
  ]);
}

async function requireActiveLockOwnerFingerprint(
  filePath: string
): Promise<string> {
  const fingerprint = (
    await inspectRuntimeJsonlAuditFileLock(filePath)
  ).ownerFingerprint;
  if (fingerprint === undefined) {
    throw new Error("Expected an active lock owner fingerprint.");
  }
  return fingerprint;
}

async function requireQuarantineOwnerFingerprint(
  filePath: string,
  quarantineId: string
): Promise<string> {
  const fingerprint = (
    await inspectRuntimeJsonlAuditLockQuarantine(filePath, quarantineId)
  ).ownerFingerprint;
  if (fingerprint === undefined) {
    throw new Error("Expected a quarantine owner fingerprint.");
  }
  return fingerprint;
}

async function requireDisposalOwnerFingerprint(
  filePath: string,
  quarantineId: string,
  disposalId: string
): Promise<string> {
  const fingerprint = (
    await inspectRuntimeJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId
    )
  ).ownerFingerprint;
  if (fingerprint === undefined) {
    throw new Error("Expected a disposal owner fingerprint.");
  }
  return fingerprint;
}

async function requireQuarantineEmptyDirectoryFingerprint(
  filePath: string,
  quarantineId: string
): Promise<string> {
  const fingerprint = (
    await inspectRuntimeJsonlAuditLockQuarantine(filePath, quarantineId)
  ).emptyDirectoryFingerprint;
  if (fingerprint === undefined) {
    throw new Error("Expected a quarantine empty-directory fingerprint.");
  }
  return fingerprint;
}

async function requireDisposalEmptyDirectoryFingerprint(
  filePath: string,
  quarantineId: string,
  disposalId: string
): Promise<string> {
  const fingerprint = (
    await inspectRuntimeJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId
    )
  ).emptyDirectoryFingerprint;
  if (fingerprint === undefined) {
    throw new Error("Expected a disposal empty-directory fingerprint.");
  }
  return fingerprint;
}

function injectAuditMaintenanceHandleCloseFailure(
  targetPath: string,
  targetOpen: number,
  message: string
): {
  selectedOpenCount: number;
  closeCompletion?: Promise<void>;
} {
  const state: {
    selectedOpenCount: number;
    closeCompletion?: Promise<void>;
  } = { selectedOpenCount: 0 };
  const originalOpen = fs.open.bind(fs);
  vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
    const handle = await originalOpen(target, flags, mode);
    if (path.resolve(String(target)) === path.resolve(targetPath)) {
      state.selectedOpenCount += 1;
      if (state.selectedOpenCount === targetOpen) {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(() => {
          state.closeCompletion = close();
          throw new Error(message);
        });
      }
    }
    return handle;
  });
  return state;
}

function isAuditMaintenanceOpenTarget(
  target: unknown,
  targetPath: string
): boolean {
  const openedPath = String(target);
  return path.resolve(openedPath) === path.resolve(targetPath)
    || (openedPath.startsWith("/proc/self/fd/")
      && path.basename(openedPath) === path.basename(targetPath));
}

function injectAuditHandlePendingClose(
  targetPath: string,
  targetOpen: number,
  observedClosePath?: string,
  statFailureMessage?: string
): {
  selectedOpenCount: number;
  selectedCloseCount: number;
  observedCloseCount: number;
  closeStarted: Promise<void>;
  actualCloseCompletion?: Promise<void>;
  resolveClose(): void;
  rejectClose(reason: unknown): void;
} {
  let resolveCloseStarted!: () => void;
  let resolvePendingClose!: () => void;
  let rejectPendingClose!: (reason: unknown) => void;
  const closeStarted = new Promise<void>((resolve) => {
    resolveCloseStarted = resolve;
  });
  const pendingClose = new Promise<void>((resolve, reject) => {
    resolvePendingClose = resolve;
    rejectPendingClose = reject;
  });
  const state: {
    selectedOpenCount: number;
    selectedCloseCount: number;
    observedCloseCount: number;
    closeStarted: Promise<void>;
    actualCloseCompletion?: Promise<void>;
    resolveClose(): void;
    rejectClose(reason: unknown): void;
  } = {
    selectedOpenCount: 0,
    selectedCloseCount: 0,
    observedCloseCount: 0,
    closeStarted,
    resolveClose: () => resolvePendingClose(),
    rejectClose: (reason) => rejectPendingClose(reason)
  };
  const originalOpen = fs.open.bind(fs);
  vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
    const handle = await originalOpen(target, flags, mode);
    if (isAuditMaintenanceOpenTarget(target, targetPath)) {
      state.selectedOpenCount += 1;
      if (state.selectedOpenCount === targetOpen) {
        if (statFailureMessage !== undefined) {
          vi.spyOn(handle, "stat").mockRejectedValue(
            new Error(statFailureMessage)
          );
        }
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(() => {
          state.selectedCloseCount += 1;
          state.actualCloseCompletion = close();
          resolveCloseStarted();
          return pendingClose;
        });
      }
    } else if (
      observedClosePath !== undefined
      && isAuditMaintenanceOpenTarget(target, observedClosePath)
    ) {
      const close = handle.close.bind(handle);
      vi.spyOn(handle, "close").mockImplementation(async () => {
        state.observedCloseCount += 1;
        await close();
      });
    }
    return handle;
  });
  return state;
}

function injectAuditMaintenanceOpenValidationFailure(
  targetPath: string,
  targetOpen: number,
  primaryMessage: string,
  closeMessage: string
): {
  selectedOpenCount: number;
  selectedCloseCount: number;
  closeCompletion?: Promise<void>;
} {
  const state: {
    selectedOpenCount: number;
    selectedCloseCount: number;
    closeCompletion?: Promise<void>;
  } = { selectedOpenCount: 0, selectedCloseCount: 0 };
  const originalOpen = fs.open.bind(fs);
  vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
    const handle = await originalOpen(target, flags, mode);
    if (isAuditMaintenanceOpenTarget(target, targetPath)) {
      state.selectedOpenCount += 1;
      if (state.selectedOpenCount === targetOpen) {
        vi.spyOn(handle, "stat").mockRejectedValue(
          new Error(primaryMessage)
        );
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(() => {
          state.selectedCloseCount += 1;
          state.closeCompletion = close();
          throw new Error(closeMessage);
        });
      }
    }
    return handle;
  });
  return state;
}

function injectAuditMaintenanceDirectoryStreamFailure(
  targetStream: number,
  closeMessage: string,
  readMessage?: string
): {
  selectedStreamCount: number;
  selectedCloseCount: number;
  closeCompletion?: Promise<void>;
} {
  const state: {
    selectedStreamCount: number;
    selectedCloseCount: number;
    closeCompletion?: Promise<void>;
  } = { selectedStreamCount: 0, selectedCloseCount: 0 };
  const originalOpendir = fs.opendir.bind(fs);
  vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
    const stream = await originalOpendir(target, options);
    state.selectedStreamCount += 1;
    if (state.selectedStreamCount === targetStream) {
      if (readMessage !== undefined) {
        vi.spyOn(stream, "read").mockRejectedValue(new Error(readMessage));
      }
      const close = stream.close.bind(stream);
      vi.spyOn(stream, "close").mockImplementation(() => {
        state.selectedCloseCount += 1;
        state.closeCompletion = close();
        throw new Error(closeMessage);
      });
    }
    return stream;
  });
  return state;
}

function injectAuditMaintenanceDirectoryStreamPendingClose(
  targetStream: number,
  readMessage?: string
): {
  selectedStreamCount: number;
  selectedCloseCount: number;
  closeStarted: Promise<void>;
  actualCloseCompletion?: Promise<void>;
  resolveClose(): void;
  rejectClose(reason: unknown): void;
} {
  let resolveCloseStarted!: () => void;
  let resolvePendingClose!: () => void;
  let rejectPendingClose!: (reason: unknown) => void;
  const closeStarted = new Promise<void>((resolve) => {
    resolveCloseStarted = resolve;
  });
  const pendingClose = new Promise<void>((resolve, reject) => {
    resolvePendingClose = resolve;
    rejectPendingClose = reject;
  });
  const state: {
    selectedStreamCount: number;
    selectedCloseCount: number;
    closeStarted: Promise<void>;
    actualCloseCompletion?: Promise<void>;
    resolveClose(): void;
    rejectClose(reason: unknown): void;
  } = {
    selectedStreamCount: 0,
    selectedCloseCount: 0,
    closeStarted,
    resolveClose: () => resolvePendingClose(),
    rejectClose: (reason) => rejectPendingClose(reason)
  };
  const originalOpendir = fs.opendir.bind(fs);
  vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
    const stream = await originalOpendir(target, options);
    state.selectedStreamCount += 1;
    if (state.selectedStreamCount === targetStream) {
      if (readMessage !== undefined) {
        vi.spyOn(stream, "read").mockRejectedValue(new Error(readMessage));
      }
      const close = stream.close.bind(stream);
      vi.spyOn(stream, "close").mockImplementation(() => {
        state.selectedCloseCount += 1;
        state.actualCloseCompletion = close();
        resolveCloseStarted();
        return pendingClose;
      });
    }
    return stream;
  });
  return state;
}

function injectAuditCommittedRecoveryDirectoryStreamPendingClose(
  stagingPath: string,
  rotatedPath: string,
  selectedCommittedStream = 2
): {
  committedStreamCount: number;
  selectedCloseCount: number;
  closeStarted: Promise<void>;
  actualCloseCompletion?: Promise<void>;
  resolveClose(): void;
  rejectClose(reason: unknown): void;
} {
  const expectedStagingPath = path.resolve(stagingPath);
  let resolveCloseStarted!: () => void;
  let resolvePendingClose!: () => void;
  let rejectPendingClose!: (reason: unknown) => void;
  const closeStarted = new Promise<void>((resolve) => {
    resolveCloseStarted = resolve;
  });
  const pendingClose = new Promise<void>((resolve, reject) => {
    resolvePendingClose = resolve;
    rejectPendingClose = reject;
  });
  const state: {
    committedStreamCount: number;
    selectedCloseCount: number;
    closeStarted: Promise<void>;
    actualCloseCompletion?: Promise<void>;
    resolveClose(): void;
    rejectClose(reason: unknown): void;
  } = {
    committedStreamCount: 0,
    selectedCloseCount: 0,
    closeStarted,
    resolveClose: () => resolvePendingClose(),
    rejectClose: (reason) => rejectPendingClose(reason)
  };
  const originalOpendir = fs.opendir.bind(fs);
  vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
    const stream = await originalOpendir(target, options);
    let resolvedTarget = path.resolve(String(target));
    try {
      resolvedTarget = await fs.realpath(target);
    } catch {
      // Preserve native behavior for a descriptor path that disappeared.
    }
    if (path.resolve(resolvedTarget) !== expectedStagingPath) {
      return stream;
    }
    try {
      const [rotatedStatus, stagingEntries] = await Promise.all([
        fs.lstat(rotatedPath),
        fs.readdir(stagingPath)
      ]);
      if (!rotatedStatus.isFile() || stagingEntries.length !== 0) {
        return stream;
      }
    } catch {
      return stream;
    }
    state.committedStreamCount += 1;
    if (state.committedStreamCount === selectedCommittedStream) {
      const close = stream.close.bind(stream);
      vi.spyOn(stream, "close").mockImplementation(() => {
        state.selectedCloseCount += 1;
        state.actualCloseCompletion = close();
        resolveCloseStarted();
        return pendingClose;
      });
    }
    return stream;
  });
  return state;
}

function rewriteOwnerOnSecondDirectoryScan(
  directoryPath: string,
  ownerPath: string,
  replacementToken: string
): { selectedScans: number; rewritten: boolean } {
  const state = { selectedScans: 0, rewritten: false };
  const originalOpendir = fs.opendir.bind(fs);
  vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
    let resolvedTarget = path.resolve(String(target));
    try {
      resolvedTarget = await fs.realpath(target);
    } catch {
      // Preserve the original open behavior for disappearing paths.
    }
    if (resolvedTarget === path.resolve(directoryPath)) {
      state.selectedScans += 1;
      if (state.selectedScans === 2) {
        const persisted = JSON.parse(
          await fs.readFile(ownerPath, "utf8")
        ) as Record<string, unknown>;
        persisted.owner_token = replacementToken;
        await fs.writeFile(ownerPath, `${JSON.stringify(persisted)}\n`, {
          encoding: "utf8"
        });
        state.rewritten = true;
      }
    }
    return originalOpendir(target, options);
  });
  return state;
}

function createDirectoryOnSecondPathInspection(
  targetPath: string
): { pathReads: number; created: boolean } {
  const state = { pathReads: 0, created: false };
  const originalLstat = fs.lstat.bind(fs);
  vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
    if (path.resolve(String(target)) === path.resolve(targetPath)) {
      state.pathReads += 1;
      if (state.pathReads === 2) {
        await fs.mkdir(targetPath, { mode: 0o700 });
        state.created = true;
      }
    }
    return originalLstat(target, options);
  });
  return state;
}

function rewriteOwnerOnNthPathInspection(
  observedPath: string,
  ownerPath: string,
  replacementToken: string,
  targetRead: number
): { pathReads: number; rewritten: boolean } {
  const state = { pathReads: 0, rewritten: false };
  const originalLstat = fs.lstat.bind(fs);
  vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
    if (path.resolve(String(target)) === path.resolve(observedPath)) {
      state.pathReads += 1;
      if (state.pathReads === targetRead) {
        const persisted = JSON.parse(
          await fs.readFile(ownerPath, "utf8")
        ) as Record<string, unknown>;
        persisted.owner_token = replacementToken;
        await fs.writeFile(ownerPath, `${JSON.stringify(persisted)}\n`, {
          encoding: "utf8"
        });
        state.rewritten = true;
      }
    }
    return originalLstat(target, options);
  });
  return state;
}

async function countPathInspections(
  targetPath: string,
  inspect: () => Promise<unknown>
): Promise<number> {
  const originalLstat = fs.lstat.bind(fs);
  let reads = 0;
  const spy = vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
    if (path.resolve(String(target)) === path.resolve(targetPath)) {
      reads += 1;
    }
    return originalLstat(target, options);
  });
  try {
    await inspect();
  } finally {
    spy.mockRestore();
  }
  return reads;
}

function replaceDirectoryOnNthPathInspection(
  observedPath: string,
  candidatePath: string,
  movedPath: string,
  targetRead: number,
  ownerRelativePath?: string
): { pathReads: number; replaced: boolean } {
  const state = { pathReads: 0, replaced: false };
  const originalLstat = fs.lstat.bind(fs);
  const originalRename = fs.rename.bind(fs);
  const originalMkdir = fs.mkdir.bind(fs);
  const originalCopyFile = fs.copyFile.bind(fs);
  vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
    if (path.resolve(String(target)) === path.resolve(observedPath)) {
      state.pathReads += 1;
      if (state.pathReads === targetRead) {
        await originalRename(candidatePath, movedPath);
        if (ownerRelativePath === undefined) {
          await originalMkdir(candidatePath, { mode: 0o700 });
        } else {
          const replacementOwnerPath = path.join(
            candidatePath,
            ownerRelativePath
          );
          await originalMkdir(path.dirname(replacementOwnerPath), {
            recursive: true,
            mode: 0o700
          });
          await originalCopyFile(
            path.join(movedPath, ownerRelativePath),
            replacementOwnerPath
          );
        }
        state.replaced = true;
      }
    }
    return originalLstat(target, options);
  });
  return state;
}

function moveDirectoryOnNthPathInspection(
  observedPath: string,
  candidatePath: string,
  movedPath: string,
  targetRead: number
): { pathReads: number; moved: boolean } {
  const state = { pathReads: 0, moved: false };
  const originalLstat = fs.lstat.bind(fs);
  const originalRename = fs.rename.bind(fs);
  vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
    if (path.resolve(String(target)) === path.resolve(observedPath)) {
      state.pathReads += 1;
      if (state.pathReads === targetRead) {
        await originalRename(candidatePath, movedPath);
        state.moved = true;
      }
    }
    return originalLstat(target, options);
  });
  return state;
}

function addEntryOnFirstDirectoryRemoval(
  observedPath: string,
  extraPath: string
): { removalCalls: number; injected: boolean } {
  const state = { removalCalls: 0, injected: false };
  const observedName = path.basename(observedPath);
  const originalRmdir = fs.rmdir.bind(fs);
  vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
    if (path.basename(String(target)) === observedName) {
      state.removalCalls += 1;
      if (!state.injected) {
        await fs.writeFile(extraPath, "preserved", { mode: 0o600 });
        state.injected = true;
      }
    }
    return originalRmdir(target, options);
  });
  return state;
}

function replaceDirectoryOnFirstRemoval(
  observedPath: string,
  movedPath: string
): { removalCalls: number; replaced: boolean } {
  const state = { removalCalls: 0, replaced: false };
  const observedName = path.basename(observedPath);
  const originalRmdir = fs.rmdir.bind(fs);
  const originalRename = fs.rename.bind(fs);
  const originalMkdir = fs.mkdir.bind(fs);
  vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
    if (path.basename(String(target)) === observedName) {
      state.removalCalls += 1;
      if (!state.replaced) {
        await originalRename(observedPath, movedPath);
        await originalMkdir(observedPath, { mode: 0o700 });
        await originalRmdir(target, options);
        state.replaced = true;
        return;
      }
    }
    return originalRmdir(target, options);
  });
  return state;
}

describe("CLI audit inspect-config", () => {
  it("reports disabled persistence without touching the filesystem", async () => {
    const dir = await createTempDir();
    const report = inspectAuditConfig({}, dir);

    expect(report).toEqual({
      ok: true,
      checks: [{
        name: "audit_config",
        status: "ok",
        message: "disabled",
        details: {
          enabled: false,
          max_bytes: 10 * 1024 * 1024,
          rotation_generations: 1,
          coordination_scope: "process_and_filesystem",
          coordination_lock_timeout_ms: 5_000,
          coordination_lock_retry_ms: 10,
          durability: "buffered",
          default_redaction_enabled: true,
          custom_redaction_keys: []
        }
      }]
    });
    expect(renderAuditConfigReport(report)).toContain("OK audit_config: disabled");
    expect(JSON.parse(renderAuditConfigReportJson(report))).toEqual(report);
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("warns when auxiliary settings are ignored while persistence is disabled", () => {
    const report = inspectAuditConfig({
      GOD_CODE_AUDIT_MAX_BYTES: "2048",
      GOD_CODE_AUDIT_REDACT_KEYS: "credential",
      GOD_CODE_AUDIT_DURABILITY: "data"
    }, "/workspace");

    expect(report.ok).toBe(true);
    expect(report.checks[0]).toMatchObject({
      status: "warn",
      message: expect.stringContaining("ignored")
    });
  });

  it("renders normalized enabled configuration without creating the target", async () => {
    const dir = await createTempDir();
    const report = inspectAuditConfig({
      GOD_CODE_AUDIT_FILE: "logs/tools.jsonl",
      GOD_CODE_AUDIT_MAX_BYTES: "2048",
      GOD_CODE_AUDIT_DURABILITY: " FULL ",
      GOD_CODE_AUDIT_REDACT_KEYS: " credential, access_key,credential "
    }, dir);
    const check = report.checks[0]!;

    expect(report.ok).toBe(true);
    expect(check.details).toEqual({
      enabled: true,
      file_path: path.join(dir, "logs", "tools.jsonl"),
      max_bytes: 2048,
      rotation_generations: 1,
      coordination_scope: "process_and_filesystem",
      coordination_lock_path: getJsonlAuditLockPath(
        path.join(dir, "logs", "tools.jsonl")
      ),
      coordination_lock_timeout_ms: 5_000,
      coordination_lock_retry_ms: 10,
      durability: "full",
      default_redaction_enabled: true,
      custom_redaction_keys: ["credential", "accesskey"]
    });
    expect(renderAuditConfigReport(report)).toContain(
      "custom_redaction_keys: credential,accesskey"
    );
    expect(renderAuditConfigReport(report)).toContain("durability: full");
    expect(renderAuditConfigReport(report)).toContain(
      `coordination_lock_path: ${getJsonlAuditLockPath(
        path.join(dir, "logs", "tools.jsonl")
      )}`
    );
    await expect(fs.access(path.join(dir, "logs"))).rejects.toThrow();
  });

  it("reports invalid enabled configuration without echoing configured values", () => {
    const report = inspectAuditConfig({
      GOD_CODE_AUDIT_FILE: "audit.jsonl",
      GOD_CODE_AUDIT_MAX_BYTES: "hidden-invalid-capacity",
      GOD_CODE_AUDIT_DURABILITY: "hidden-durability",
      GOD_CODE_AUDIT_REDACT_KEYS: "credential,,hidden-key-name"
    }, "/workspace");
    const text = renderAuditConfigReport(report);
    const json = renderAuditConfigReportJson(report);

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.status).toBe("error");
    expect(text).toContain("Invalid GOD_CODE_AUDIT_MAX_BYTES");
    expect(text).toContain("Invalid GOD_CODE_AUDIT_REDACT_KEYS");
    expect(text).toContain("Invalid JSONL audit durability");
    expect(`${text}\n${json}`).not.toContain("hidden-invalid-capacity");
    expect(`${text}\n${json}`).not.toContain("hidden-key-name");
    expect(`${text}\n${json}`).not.toContain("hidden-durability");
  });

  it("reports disabled path inspection as skipped", async () => {
    const report = await inspectAuditPath({}, "/workspace");

    expect(report).toEqual({
      ok: true,
      checks: [{
        name: "audit_path",
        status: "warn",
        message: "skipped; persistence is disabled",
        details: { enabled: false }
      }]
    });
    expect(renderAuditPathReport(report)).toContain("WARN audit_path: skipped");
    expect(JSON.parse(renderAuditPathReportJson(report))).toEqual(report);
  });

  it("inspects a missing nested target without creating it", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "missing", "nested", "audit.jsonl");
    const report = await inspectAuditPath({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir);
    const details = report.checks[0]!.details;

    expect(report.ok).toBe(true);
    expect(report.checks[0]?.status).toBe("ok");
    expect(details).toMatchObject({
      enabled: true,
      file_path: filePath,
      target_exists: false,
      nearest_existing_directory: dir,
      directory_writable: true,
      max_bytes: 10 * 1024 * 1024,
      current_generation_bytes: 0,
      remaining_capacity_bytes: 10 * 1024 * 1024,
      rotation_expected_on_next_record: false,
      current_generation_over_capacity: false,
      coordination_lock_path: getJsonlAuditLockPath(filePath),
      coordination_lock_exists: false,
      coordination_lock_acquirable: true
    });
    expect(details.missing_components).toEqual([
      path.join(dir, "missing"),
      path.join(dir, "missing", "nested"),
      filePath
    ]);
    await expect(fs.access(path.join(dir, "missing"))).rejects.toThrow();
  });

  it("warns when the coordination lock is currently held", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });

    const report = await inspectAuditPath({ GOD_CODE_AUDIT_FILE: filePath }, dir);

    expect(report.ok).toBe(true);
    expect(report.checks[0]).toMatchObject({
      status: "warn",
      message: expect.stringContaining("coordination lock is currently held"),
      details: {
        coordination_lock_path: lock.lockPath,
        coordination_lock_exists: true,
        coordination_lock_entry_type: "directory",
        coordination_lock_acquirable: false,
        coordination_lock_age_ms: expect.any(Number),
        coordination_lock_entry_count: 1,
        coordination_lock_entry_scan_count: 1,
        coordination_lock_entry_scan_limit:
          MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
        coordination_lock_entry_scan_truncated: false,
        coordination_lock_owner_entry_exclusive: true,
        coordination_lock_owner_metadata_status: "valid",
        coordination_lock_owner_pid: process.pid,
        coordination_lock_acquired_at: "2026-07-22T10:30:00.000Z"
      }
    });
    expect(renderAuditPathReportJson(report)).not.toContain(lock.ownerToken);
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("projects truncated active lock scans without owner authority", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const overflowNames = ["overflow-secret-a", "overflow-secret-b"];
    await Promise.all(overflowNames.map((name) => fs.writeFile(
      path.join(lock.lockPath, name),
      "preserved\n",
      { mode: 0o600 }
    )));

    const report = await inspectAuditPath(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir
    );
    const text = renderAuditPathReport(report);
    const json = renderAuditPathReportJson(report);

    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("child scan was truncated"),
        details: {
          coordination_lock_path: lock.lockPath,
          coordination_lock_exists: true,
          coordination_lock_entry_type: "directory",
          coordination_lock_entry_scan_count:
            MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
          coordination_lock_entry_scan_limit:
            MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
          coordination_lock_entry_scan_truncated: true,
          coordination_lock_owner_entry_exclusive: false
        }
      }]
    });
    const details = report.checks[0]!.details;
    expect(details.coordination_lock_entry_count).toBeUndefined();
    expect(details.coordination_lock_owner_metadata_status).toBeUndefined();
    expect(text).toContain("coordination_lock_entry_scan_count: 2");
    expect(text).toContain("coordination_lock_entry_scan_truncated: true");
    expect(`${text}\n${json}`).not.toContain(lock.ownerToken);
    for (const overflowName of overflowNames) {
      expect(text).not.toContain(overflowName);
      expect(json).not.toContain(overflowName);
    }

    await Promise.all(overflowNames.map(
      (name) => fs.rm(path.join(lock.lockPath, name))
    ));
    await lock.release();
  });

  it("warns when a coordination lock directory has no owner metadata", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    await fs.mkdir(lockPath, { mode: 0o700 });

    const report = await inspectAuditPath({ GOD_CODE_AUDIT_FILE: filePath }, dir);

    expect(report.ok).toBe(true);
    expect(report.checks[0]).toMatchObject({
      status: "warn",
      message: expect.stringContaining("owner metadata is missing"),
      details: {
        coordination_lock_path: lockPath,
        coordination_lock_entry_type: "directory",
        coordination_lock_owner_metadata_status: "missing"
      }
    });
    expect((await fs.readdir(lockPath))).toEqual([]);
    await fs.rmdir(lockPath);
  });

  it("reports target-bound and legacy rotation staging residue", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const otherFilePath = path.join(dir, "other.jsonl");
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "Stage1");
    const otherStagingPath = getJsonlAuditRotationStagingPath(
      otherFilePath,
      "Other1"
    );
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(path.join(stagingPath, "previous"), "old-archive");
    await fs.mkdir(otherStagingPath, { mode: 0o700 });
    await fs.mkdir(path.join(dir, ".god-code-audit-rotation-Legacy"));

    const report = await inspectAuditRotationStagings({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir);
    const text = renderAuditRotationStagingReport(report);
    const json = renderAuditRotationStagingReportJson(report);

    expect(report.ok).toBe(true);
    expect(report.checks[0]).toMatchObject({
      name: "audit_rotation_stagings",
      status: "warn",
      message: expect.stringContaining("legacy unscoped"),
      details: {
        enabled: true,
        file_path: filePath,
        staging_prefix: getJsonlAuditRotationStagingPrefix(filePath),
        matched_entry_count: 1,
        legacy_unscoped_entry_count: 1,
        stagings: [{
          staging_id: "Stage1",
          staging_path: stagingPath,
          exists: true,
          entry_type: "directory",
          layout: "previous_only",
          entry_count: 1,
          previous_entry_type: "regular_file",
          previous_size_bytes: Buffer.byteLength("old-archive")
        }]
      }
    });
    expect(text).toContain("WARN audit_rotation_stagings");
    expect(text).toContain("staging_id: Stage1");
    expect(JSON.parse(json)).toEqual(report);
    expect(json).not.toContain("Other1");
    expect(json).not.toContain(otherStagingPath);
    expect(json).not.toContain("Legacy");
  });

  it("keeps targeted rotation staging reports aligned with list projection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "Direct");
    await fs.mkdir(stagingPath, { mode: 0o700 });
    const environ = { GOD_CODE_AUDIT_FILE: filePath };

    const listed = await inspectAuditRotationStagings(environ, dir);
    const direct = await inspectAuditRotationStaging(environ, dir, "Direct");
    const missing = await inspectAuditRotationStaging(environ, dir, "Absent");
    const invalid = await inspectAuditRotationStaging(environ, dir, "bad");

    expect(direct.ok).toBe(true);
    expect(direct.checks[0]).toMatchObject({
      name: "audit_rotation_staging",
      status: "warn",
      message: expect.stringContaining("manual review")
    });
    const { age_ms: directAge, ...directProjection } =
      direct.checks[0]!.details.staging!;
    const { age_ms: listedAge, ...listedProjection } =
      listed.checks[0]!.details.stagings[0]!;
    expect(directProjection).toEqual(listedProjection);
    expect(Math.abs((directAge ?? 0) - (listedAge ?? 0))).toBeLessThan(100);
    expect(renderAuditTargetedRotationStagingReport(direct))
      .toContain("staging_id: Direct");
    expect(JSON.parse(renderAuditTargetedRotationStagingReportJson(direct)))
      .toEqual(direct);
    expect(missing).toMatchObject({
      ok: true,
      checks: [{
        status: "ok",
        message: "selected rotation staging residue does not exist",
        details: {
          staging_id: "Absent",
          staging: {
            exists: false
          }
        }
      }]
    });
    expect(invalid).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("expected six ASCII alphanumeric characters"),
        details: { staging_id: "bad" }
      }]
    });
  });

  it("bounds rotation staging parent close timeout in CLI diagnostics", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const initialEntries = await fs.readdir(dir);
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(1);
    vi.useFakeTimers();
    const reportPromise = inspectAuditRotationStagings(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir
    );

    try {
      const settlement = await observeAuditCliPromiseAfterCloseDeadline(
        reportPromise,
        injection.closeStarted
      );
      injection.resolveClose();
      await injection.actualCloseCompletion;
      const report = settlement.settled
        ? settlement.value
        : await reportPromise;
      const output = `${renderAuditRotationStagingReport(report)}\n${renderAuditRotationStagingReportJson(report)}`;

      expect(settlement.settled).toBe(true);
      expect(injection.selectedStreamCount).toBe(1);
      expect(injection.selectedCloseCount).toBe(1);
      expect(report).toMatchObject({
        ok: false,
        checks: [{
          name: "audit_rotation_stagings",
          status: "error",
          message: "audit inspection descriptor close timed out after 5000 ms",
          details: {
            scanned_entry_count: 0,
            matched_entry_count: 0,
            legacy_unscoped_entry_count: 0,
            stagings: []
          }
        }]
      });
      expect(output).toContain(
        "ERROR audit_rotation_stagings: audit inspection descriptor close timed out after 5000 ms"
      );
      expect(JSON.parse(renderAuditRotationStagingReportJson(report)))
        .toEqual(report);
      expect(await fs.readdir(dir)).toEqual(initialEntries);
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("skips rotation staging inspection without filesystem access when disabled", async () => {
    const dir = await createTempDir();

    const listed = await inspectAuditRotationStagings({}, dir);
    const direct = await inspectAuditRotationStaging({}, dir, "Stage1");
    const invalid = await inspectAuditRotationStaging({}, dir, "bad");

    expect(listed).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_rotation_stagings",
        status: "warn",
        message: "skipped; persistence is disabled",
        details: {
          enabled: false,
          scanned_entry_count: 0,
          matched_entry_count: 0,
          legacy_unscoped_entry_count: 0,
          stagings: []
        }
      }]
    });
    expect(direct).toEqual({
      ok: true,
      checks: [{
        name: "audit_rotation_staging",
        status: "warn",
        message: "skipped; persistence is disabled",
        details: {
          enabled: false,
          staging_id: "Stage1"
        }
      }]
    });
    expect(invalid).toMatchObject({
      ok: false,
      checks: [{
        name: "audit_rotation_staging",
        status: "error",
        message: expect.stringContaining("expected six ASCII alphanumeric characters")
      }]
    });
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("reports invalid rotation staging inspection configuration", async () => {
    const report = await inspectAuditRotationStagings({
      GOD_CODE_AUDIT_FILE: "audit.jsonl",
      GOD_CODE_AUDIT_MAX_BYTES: "invalid"
    }, "/workspace");

    expect(report).toMatchObject({
      ok: false,
      checks: [{
        name: "audit_rotation_stagings",
        status: "error",
        message: expect.stringContaining("audit configuration is invalid")
      }]
    });
  });

  it("reports fingerprinted archive-restore recovery readiness without mutation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "Ready1");
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );

    const report = await inspectAuditRotationRecovery({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "Ready1");
    const text = renderAuditRotationRecoveryReport(report);
    const json = renderAuditRotationRecoveryReportJson(report);

    expect(report.ok).toBe(true);
    expect(report.checks[0]).toMatchObject({
      name: "audit_rotation_recovery",
      status: "warn",
      message: expect.stringContaining("previous archive restore candidate"),
      details: {
        enabled: true,
        file_path: filePath,
        rotation_path: `${filePath}.1`,
        staging_id: "Ready1",
        staging_path: stagingPath,
        coordination_lock_exists: false,
        coordination_lock_acquirable: true,
        current_generation: {
          entry_path: filePath,
          exists: true,
          entry_type: "regular_file",
          size_bytes: Buffer.byteLength("current-record\n"),
          mode: "0600",
          link_count: 1
        },
        rotated_generation: {
          entry_path: `${filePath}.1`,
          exists: false
        },
        staging: {
          staging_id: "Ready1",
          staging_path: stagingPath,
          layout: "previous_only",
          previous_entry_type: "regular_file"
        },
        assessment: "restore_previous_archive",
        eligible: true,
        recommended_action: "restore_previous_archive",
        recovery_fingerprint: expect.stringMatching(/^[0-9a-f]{32}$/u),
        confirmation_required: true,
        mutation_performed: false
      }
    });
    expect(text).toContain("WARN audit_rotation_recovery");
    expect(text).toContain("recommended_action: restore_previous_archive");
    expect(JSON.parse(json)).toEqual(report);
    expect(json).not.toContain("previous-archive");
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(
      path.join(stagingPath, "previous"),
      "utf8"
    )).toBe("previous-archive\n");
  });

  it("reports exact-empty staging cleanup readiness independently of generations", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "Empty1");
    await fs.mkdir(stagingPath, { mode: 0o700 });

    const report = await inspectAuditRotationRecovery({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "Empty1");

    expect(report).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_rotation_recovery",
        status: "warn",
        message: expect.stringContaining("exact-empty staging cleanup candidate"),
        details: {
          assessment: "cleanup_empty_staging",
          eligible: true,
          recommended_action: "cleanup_empty_staging",
          recovery_fingerprint: expect.stringMatching(/^[0-9a-f]{32}$/u),
          current_generation: { exists: false },
          rotated_generation: { exists: false },
          staging: { layout: "empty" },
          mutation_performed: false
        }
      }]
    });
    expect(await fs.readdir(stagingPath)).toEqual([]);
  });

  it("projects bounded selected staging child scans", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "Bound1");
    const overflowNames = ["overflow-secret-a", "overflow-secret-b"];
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    await Promise.all(overflowNames.map((name) => fs.writeFile(
      path.join(stagingPath, name),
      "overflow\n",
      { mode: 0o600 }
    )));

    const report = await inspectAuditRotationRecovery({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "Bound1");
    const text = renderAuditRotationRecoveryReport(report);
    const json = renderAuditRotationRecoveryReportJson(report);

    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("invalid or uncertain"),
        details: {
          assessment: "invalid_staging_state",
          eligible: false,
          staging: {
            staging_id: "Bound1",
            staging_path: stagingPath,
            layout: "unknown",
            entry_scan_count:
              MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES,
            entry_scan_limit:
              MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES,
            entry_scan_truncated: true
          },
          confirmation_required: true,
          mutation_performed: false
        }
      }]
    });
    expect(report.checks[0]?.details.staging?.entry_count).toBeUndefined();
    expect(report.checks[0]?.details.recommended_action).toBeUndefined();
    expect(report.checks[0]?.details.recovery_fingerprint).toBeUndefined();
    expect(text).toContain("entry_scan_count: 2");
    expect(text).toContain("entry_scan_limit: 2");
    expect(text).toContain("entry_scan_truncated: true");
    for (const overflowName of overflowNames) {
      expect(text).not.toContain(overflowName);
      expect(json).not.toContain(overflowName);
    }
    expect(JSON.parse(json)).toEqual(report);
  });

  it("withholds recovery fingerprints for ambiguous state and active locks", async () => {
    const dir = await createTempDir();
    const ambiguousFile = path.join(dir, "ambiguous.jsonl");
    const ambiguousStaging = getJsonlAuditRotationStagingPath(
      ambiguousFile,
      "Ambig1"
    );
    await fs.writeFile(ambiguousFile, "new-or-partial\n", { mode: 0o600 });
    await fs.writeFile(`${ambiguousFile}.1`, "original-current\n", { mode: 0o600 });
    await fs.mkdir(ambiguousStaging, { mode: 0o700 });
    await fs.writeFile(
      path.join(ambiguousStaging, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const ambiguous = await inspectAuditRotationRecovery({
      GOD_CODE_AUDIT_FILE: ambiguousFile
    }, dir, "Ambig1");
    expect(ambiguous).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        details: {
          assessment: "ambiguous_record_state",
          eligible: false
        }
      }]
    });
    expect(ambiguous.checks[0]?.details.recovery_fingerprint).toBeUndefined();

    const lockedFile = path.join(dir, "locked.jsonl");
    const lockedStaging = getJsonlAuditRotationStagingPath(lockedFile, "Lock01");
    await fs.writeFile(lockedFile, "current-record\n", { mode: 0o600 });
    await fs.mkdir(lockedStaging, { mode: 0o700 });
    await fs.writeFile(
      path.join(lockedStaging, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const lock = await acquireJsonlAuditFileLock(lockedFile);
    const locked = await inspectAuditRotationRecovery({
      GOD_CODE_AUDIT_FILE: lockedFile
    }, dir, "Lock01");
    expect(locked).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        details: {
          coordination_lock_path: lock.lockPath,
          coordination_lock_exists: true,
          coordination_lock_entry_count: 1,
          coordination_lock_entry_scan_count: 1,
          coordination_lock_entry_scan_limit:
            MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
          coordination_lock_entry_scan_truncated: false,
          coordination_lock_owner_entry_exclusive: true,
          assessment: "coordination_lock_present",
          eligible: false
        }
      }]
    });
    expect(locked.checks[0]?.details.recovery_fingerprint).toBeUndefined();
    await lock.release();
  });

  it("handles missing, disabled, invalid-id, and invalid-config recovery diagnostics", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const missing = await inspectAuditRotationRecovery({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "Miss01");
    const disabled = await inspectAuditRotationRecovery({}, dir, "Miss01");
    const invalidId = await inspectAuditRotationRecovery({}, dir, "bad");
    const invalidConfig = await inspectAuditRotationRecovery({
      GOD_CODE_AUDIT_FILE: filePath,
      GOD_CODE_AUDIT_MAX_BYTES: "invalid"
    }, dir, "Miss01");

    expect(missing).toMatchObject({
      ok: true,
      checks: [{
        status: "ok",
        message: "selected rotation staging residue does not exist",
        details: {
          assessment: "staging_missing",
          eligible: false,
          mutation_performed: false
        }
      }]
    });
    expect(disabled).toEqual({
      ok: true,
      checks: [{
        name: "audit_rotation_recovery",
        status: "warn",
        message: "skipped; persistence is disabled",
        details: {
          enabled: false,
          staging_id: "Miss01",
          eligible: false,
          confirmation_required: true,
          mutation_performed: false
        }
      }]
    });
    expect(invalidId).toMatchObject({
      ok: false,
      checks: [{
        name: "audit_rotation_recovery",
        status: "error",
        message: expect.stringContaining("expected six ASCII alphanumeric characters")
      }]
    });
    expect(invalidConfig).toMatchObject({
      ok: false,
      checks: [{
        name: "audit_rotation_recovery",
        status: "error",
        message: expect.stringContaining("audit configuration is invalid")
      }]
    });
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("dry-runs and executes fingerprinted rotation staging recovery", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "Apply1");
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );

    const dryRun = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "Apply1");
    const dryText = renderAuditRotationStagingRecoveryReport(dryRun);
    const dryJson = renderAuditRotationStagingRecoveryReportJson(dryRun);
    const fingerprint = dryRun.checks[0]?.details.recovery_fingerprint;

    expect(dryRun).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_rotation_staging_recovery",
        status: "warn",
        message: expect.stringContaining("dry run"),
        details: {
          enabled: true,
          file_path: filePath,
          rotation_path: rotatedPath,
          staging_id: "Apply1",
          staging_path: stagingPath,
          assessment: "restore_previous_archive",
          eligible: true,
          recommended_action: "restore_previous_archive",
          recovery_fingerprint: expect.stringMatching(/^[0-9a-f]{32}$/u),
          dry_run: true,
          confirmation_required: true,
          mutation_performed: false,
          recovered: false,
          staging_removed: false,
          durability: "buffered"
        }
      }]
    });
    expect(dryText).toContain("WARN audit_rotation_staging_recovery");
    expect(JSON.parse(dryJson)).toEqual(dryRun);
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");

    const applied = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "Apply1", {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    });

    expect(applied).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_rotation_staging_recovery",
        status: "ok",
        message: expect.stringContaining("lock-held fingerprint revalidation"),
        details: {
          expected_action: "restore_previous_archive",
          performed_action: "restore_previous_archive",
          expected_recovery_fingerprint: fingerprint,
          action_matches: true,
          recovery_fingerprint_matches: true,
          confirmation_required: false,
          mutation_performed: true,
          recovered: true,
          staging_removed: true,
          durability: "buffered",
          durability_completed: true,
          recovery_handles_closed: true,
          coordination_lock_path: getJsonlAuditLockPath(filePath),
          coordination_lock_released: true
        }
      }]
    });
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(rotatedPath, "utf8")).toBe("previous-archive\n");
    await expect(fs.access(stagingPath)).rejects.toThrow();
  });

  it("reports committed recovery when candidate handle finalization warns", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "CliL01");
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const dryRun = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliL01");
    const fingerprint = dryRun.checks[0]?.details.recovery_fingerprint;
    const originalOpen = fs.open.bind(fs);
    let stagingOpenCount = 0;
    let closeCompletion: Promise<void> | undefined;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (String(target) === stagingPath) {
        stagingOpenCount += 1;
        if (stagingOpenCount === 3) {
          const close = handle.close.bind(handle);
          vi.spyOn(handle, "close").mockImplementation(() => {
            closeCompletion = close();
            throw new Error("injected CLI recovery handle close failure");
          });
        }
      }
      return handle;
    });

    const applied = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliL01", {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    });
    await closeCompletion;
    const text = renderAuditRotationStagingRecoveryReport(applied);
    const json = renderAuditRotationStagingRecoveryReportJson(applied);

    expect(stagingOpenCount).toBe(3);
    expect(applied).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_rotation_staging_recovery",
        status: "warn",
        message: expect.stringContaining("resource finalization"),
        details: {
          performed_action: "restore_previous_archive",
          mutation_performed: true,
          recovered: true,
          staging_removed: true,
          recovery_handles_closed: false,
          recovery_handle_warning: expect.stringContaining(
            "injected CLI recovery handle close failure"
          ),
          coordination_lock_released: true
        }
      }]
    });
    expect(text).toContain("recovery_handles_closed: false");
    expect(JSON.parse(json)).toEqual(applied);
  });

  it("bounds committed rotation recovery close timeout in CLI diagnostics", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "CliT01");
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const dryRun = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliT01");
    const fingerprint = dryRun.checks[0]?.details.recovery_fingerprint;
    const injection = injectAuditHandlePendingClose(stagingPath, 3, dir);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const reportPromise = recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliT01", {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    });

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditCliPromiseAfterCloseDeadline(
        reportPromise,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.rejectClose(new Error("late CLI recovery close rejection"));
      const report = settlement.settled
        ? settlement.value
        : await reportPromise;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const output = `${renderAuditRotationStagingRecoveryReport(report)}\n${renderAuditRotationStagingRecoveryReportJson(report)}`;

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedOpenCount).toBe(3);
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.observedCloseCount).toBe(1);
      expect(report).toMatchObject({
        ok: true,
        checks: [{
          name: "audit_rotation_staging_recovery",
          status: "warn",
          message: expect.stringContaining("resource finalization"),
          details: {
            performed_action: "restore_previous_archive",
            mutation_performed: true,
            recovered: true,
            staging_removed: true,
            recovery_handles_closed: false,
            recovery_handle_warning:
              "recovery descriptor close failed: recovery descriptor close timed out after 5000 ms",
            coordination_lock_released: true
          }
        }]
      });
      expect(output).toContain("recovery_handles_closed: false");
      expect(output).toContain(
        "recovery_handle_warning: recovery descriptor close failed: recovery descriptor close timed out after 5000 ms"
      );
      expect(output).not.toContain("late CLI recovery close rejection");
      expect(unhandled).toEqual([]);
      expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
      expect(await fs.readFile(rotatedPath, "utf8"))
        .toBe("previous-archive\n");
      await expect(fs.access(stagingPath)).rejects.toThrow();
    } finally {
      injection.resolveClose();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
    }
  });

  it("projects committed recovery cleanup stream timeout in CLI diagnostics", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "CliT06");
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const dryRun = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliT06");
    const fingerprint = dryRun.checks[0]?.details.recovery_fingerprint;
    const injection = injectAuditCommittedRecoveryDirectoryStreamPendingClose(
      stagingPath,
      rotatedPath
    );
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const reportPromise = recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliT06", {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    });

    try {
      const settlement = await observeAuditCliPromiseAfterCloseDeadline(
        reportPromise,
        injection.closeStarted
      );
      const settledWithinBound = settlement.settled;
      injection.rejectClose(
        new Error("late CLI recovered-staging stream close rejection")
      );
      await injection.actualCloseCompletion;
      const report = settlement.settled
        ? settlement.value
        : await reportPromise;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const output = `${renderAuditRotationStagingRecoveryReport(report)}\n${renderAuditRotationStagingRecoveryReportJson(report)}`;

      expect(settledWithinBound).toBe(true);
      expect(injection.committedStreamCount).toBeGreaterThanOrEqual(2);
      expect(injection.selectedCloseCount).toBe(1);
      expect(report).toMatchObject({
        ok: true,
        checks: [{
          name: "audit_rotation_staging_recovery",
          status: "warn",
          message: expect.stringContaining("residual cleanup"),
          details: {
            performed_action: "restore_previous_archive",
            mutation_performed: true,
            recovered: true,
            staging_removed: false,
            durability_completed: true,
            residual_staging_path: stagingPath,
            recovery_warning:
              "recovered staging could not be safely removed: recovery descriptor close timed out after 5000 ms",
            recovery_handles_closed: true,
            coordination_lock_released: true
          }
        }]
      });
      expect(output).toContain("staging_removed: false");
      expect(output).toContain(`residual_staging_path: ${stagingPath}`);
      expect(output).toContain(
        "recovery_warning: recovered staging could not be safely removed: recovery descriptor close timed out after 5000 ms"
      );
      expect(output).not.toContain(
        "late CLI recovered-staging stream close rejection"
      );
      expect(unhandled).toEqual([]);
      expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
      expect(await fs.readFile(rotatedPath, "utf8"))
        .toBe("previous-archive\n");
      expect(await fs.readdir(stagingPath)).toEqual([]);
    } finally {
      injection.resolveClose();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
    }
  });

  it("preserves candidate-open CLI error across close timeout", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "CliT02");
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const dryRun = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliT02");
    const fingerprint = dryRun.checks[0]?.details.recovery_fingerprint;
    const injection = injectAuditHandlePendingClose(
      stagingPath,
      3,
      dir,
      "primary CLI pending candidate-open validation failure"
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const reportPromise = recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliT02", {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    });

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditCliPromiseAfterCloseDeadline(
        reportPromise,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.resolveClose();
      const report = settlement.settled
        ? settlement.value
        : await reportPromise;
      const output = `${renderAuditRotationStagingRecoveryReport(report)}\n${renderAuditRotationStagingRecoveryReportJson(report)}`;

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedOpenCount).toBe(4);
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.observedCloseCount).toBe(1);
      expect(report).toMatchObject({
        ok: false,
        checks: [{
          name: "audit_rotation_staging_recovery",
          status: "error",
          message: "primary CLI pending candidate-open validation failure",
          details: {
            failure_stage: "candidate_open",
            mutation_state: "not_started",
            mutation_attempted: false,
            mutation_performed: false,
            recovered: false,
            recovery_handles_closed: false,
            recovery_handle_warning:
              "recovery descriptor close failed: recovery descriptor close timed out after 5000 ms",
            coordination_lock_acquired: true,
            coordination_lock_released: true,
            post_failure_observation_completed: true
          }
        }]
      });
      expect(output).toContain("failure_stage: candidate_open");
      expect(output).toContain("recovery_handles_closed: false");
      expect(output).toContain(
        "recovery_handle_warning: recovery descriptor close failed: recovery descriptor close timed out after 5000 ms"
      );
      expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
      expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
        .toBe("previous-archive\n");
      await expect(fs.access(rotatedPath)).rejects.toThrow();
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("renders a stable fallback for an unprintable recovery warning", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "CliF01");
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const dryRun = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliF01");
    const fingerprint = dryRun.checks[0]?.details.recovery_fingerprint;
    const originalOpen = fs.open.bind(fs);
    let stagingOpenCount = 0;
    let closeCompletion: Promise<void> | undefined;
    const hostileReason = {
      [Symbol.toPrimitive]() {
        throw new Error("injected CLI warning formatter failure");
      }
    };
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (String(target) === stagingPath) {
        stagingOpenCount += 1;
        if (stagingOpenCount === 3) {
          const close = handle.close.bind(handle);
          vi.spyOn(handle, "close").mockImplementation(() => {
            closeCompletion = close();
            throw hostileReason;
          });
        }
      }
      return handle;
    });

    const applied = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliF01", {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    });
    await closeCompletion;
    const text = renderAuditRotationStagingRecoveryReport(applied);
    const json = renderAuditRotationStagingRecoveryReportJson(applied);

    expect(applied).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        details: {
          performed_action: "restore_previous_archive",
          mutation_performed: true,
          recovery_handles_closed: false,
          recovery_handle_warning:
            "recovery descriptor close failed: unavailable error detail",
          coordination_lock_released: true
        }
      }]
    });
    expect(text).toContain(
      "recovery_handle_warning: recovery descriptor close failed: unavailable error detail"
    );
    expect(text).not.toContain("injected CLI warning formatter failure");
    expect(JSON.parse(json)).toEqual(applied);
  });

  it("projects handed-off candidate-open close failures", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "CliH01");
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const dryRun = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliH01");
    const fingerprint = dryRun.checks[0]?.details.recovery_fingerprint;
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    let closeCalls = 0;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && String(target) === dir) {
        injected = true;
        vi.spyOn(handle, "stat").mockRejectedValue(
          new Error("injected CLI candidate parent validation failure")
        );
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(async () => {
          closeCalls += 1;
          await close();
          throw new Error("injected CLI handed-off close failure");
        });
      }
      return handle;
    });

    const applied = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliH01", {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    });
    const text = renderAuditRotationStagingRecoveryReport(applied);
    const json = renderAuditRotationStagingRecoveryReportJson(applied);

    expect(injected).toBe(true);
    expect(closeCalls).toBe(1);
    expect(applied).toMatchObject({
      ok: false,
      checks: [{
        name: "audit_rotation_staging_recovery",
        status: "error",
        message: "injected CLI candidate parent validation failure",
        details: {
          failure_stage: "candidate_open",
          mutation_state: "not_started",
          mutation_attempted: false,
          mutation_performed: false,
          recovered: false,
          recovery_handles_closed: false,
          recovery_handle_warning: expect.stringContaining(
            "injected CLI handed-off close failure"
          ),
          coordination_lock_acquired: true,
          coordination_lock_released: true
        }
      }]
    });
    expect(text).toContain("failure_stage: candidate_open");
    expect(text).toContain("recovery_handles_closed: false");
    expect(JSON.parse(json)).toEqual(applied);
  });

  it("reports committed recovery when coordination lock release warns", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "CliL02");
    const lockPath = getJsonlAuditLockPath(filePath);
    await fs.mkdir(stagingPath, { mode: 0o700 });
    const dryRun = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliL02");
    const fingerprint = dryRun.checks[0]?.details.recovery_fingerprint;
    const originalRmdir = fs.rmdir.bind(fs);
    let injected = false;
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      if (
        !injected
        && path.basename(String(target)) === path.basename(lockPath)
      ) {
        injected = true;
        throw new Error("injected CLI coordination lock release failure");
      }
      await originalRmdir(target, options);
    });

    try {
      const applied = await recoverAuditRotationStaging({
        GOD_CODE_AUDIT_FILE: filePath
      }, dir, "CliL02", {
        dryRun: false,
        expectedAction: "cleanup_empty_staging",
        expectedRecoveryFingerprint: fingerprint
      });
      const text = renderAuditRotationStagingRecoveryReport(applied);
      const json = renderAuditRotationStagingRecoveryReportJson(applied);

      expect(injected).toBe(true);
      expect(applied).toMatchObject({
        ok: true,
        checks: [{
          name: "audit_rotation_staging_recovery",
          status: "warn",
          message: expect.stringContaining("resource finalization"),
          details: {
            performed_action: "cleanup_empty_staging",
            mutation_performed: true,
            recovered: true,
            staging_removed: true,
            recovery_handles_closed: true,
            coordination_lock_path: lockPath,
            coordination_lock_released: false,
            residual_coordination_lock_path: lockPath,
            coordination_lock_warning: expect.stringContaining(
              "injected CLI coordination lock release failure"
            )
          }
        }]
      });
      expect(text).toContain("coordination_lock_released: false");
      expect(JSON.parse(json)).toEqual(applied);
      await expect(fs.access(stagingPath)).rejects.toThrow();
    } finally {
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  });

  it("bounds recovery coordination lifecycle timeout in CLI diagnostics", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "CliT03");
    const lockPath = getJsonlAuditLockPath(filePath);
    const ownerPath = getJsonlAuditLockOwnerPath(lockPath);
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const dryRun = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliT03");
    const fingerprint = dryRun.checks[0]?.details.recovery_fingerprint;
    const injection = injectAuditHandlePendingClose(
      ownerPath,
      1,
      lockPath
    );
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const reportPromise = recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliT03", {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    });

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditCliPromiseAfterCloseDeadline(
        reportPromise,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.rejectClose(
        new Error("late CLI lock lifecycle close rejection")
      );
      const report = settlement.settled
        ? settlement.value
        : await reportPromise;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const details = report.checks[0]?.details;
      const output = `${renderAuditRotationStagingRecoveryReport(report)}\n${renderAuditRotationStagingRecoveryReportJson(report)}`;

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedOpenCount).toBe(1);
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.observedCloseCount).toBe(1);
      expect(report).toMatchObject({
        ok: true,
        checks: [{
          name: "audit_rotation_staging_recovery",
          status: "warn",
          details: {
            performed_action: "restore_previous_archive",
            mutation_performed: true,
            recovered: true,
            staging_removed: true,
            recovery_handles_closed: true,
            coordination_lock_released: false,
            coordination_lock_warning:
              "coordination lock release failed: audit lock lifecycle descriptor close timed out after 5000 ms"
          }
        }]
      });
      expect(details?.residual_coordination_lock_path).toBeUndefined();
      expect(output).toContain("coordination_lock_released: false");
      expect(output).toContain(
        "coordination_lock_warning: coordination lock release failed: audit lock lifecycle descriptor close timed out after 5000 ms"
      );
      expect(output).not.toContain(
        "coordination lock handle abandonment failed"
      );
      expect(output).not.toContain("late CLI lock lifecycle close rejection");
      expect(unhandled).toEqual([]);
      await expect(fs.access(lockPath)).rejects.toThrow();
      expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
      expect(await fs.readFile(rotatedPath, "utf8"))
        .toBe("previous-archive\n");
      await expect(fs.access(stagingPath)).rejects.toThrow();
    } finally {
      injection.resolveClose();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  });

  it("bounds recovery lifecycle assertion stream timeout before mutation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "CliT05");
    const lockPath = getJsonlAuditLockPath(filePath);
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const dryRun = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliT05");
    const fingerprint = dryRun.checks[0]?.details.recovery_fingerprint;
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(2);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const reportPromise = recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliT05", {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    });

    try {
      const settlement = await observeAuditCliPromiseAfterCloseDeadline(
        reportPromise,
        injection.closeStarted
      );
      const settledWithinBound = settlement.settled;
      injection.rejectClose(
        new Error("late CLI lifecycle assertion stream close rejection")
      );
      await injection.actualCloseCompletion;
      const report = settlement.settled
        ? settlement.value
        : await reportPromise;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const output = `${renderAuditRotationStagingRecoveryReport(report)}\n${renderAuditRotationStagingRecoveryReportJson(report)}`;

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedStreamCount).toBeGreaterThanOrEqual(2);
      expect(injection.selectedCloseCount).toBe(1);
      expect(report).toMatchObject({
        ok: false,
        checks: [{
          name: "audit_rotation_staging_recovery",
          status: "error",
          message:
            "audit lock lifecycle descriptor close timed out after 5000 ms",
          details: {
            failure_stage: "locked_revalidation",
            mutation_state: "not_started",
            mutation_attempted: false,
            rollback_attempted: false,
            recovered: false,
            coordination_lock_acquired: true,
            coordination_lock_released: true
          }
        }]
      });
      expect(output).toContain("failure_stage: locked_revalidation");
      expect(output).not.toContain(
        "late CLI lifecycle assertion stream close rejection"
      );
      expect(unhandled).toEqual([]);
      await expect(fs.access(lockPath)).rejects.toThrow();
      expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
      await expect(fs.access(rotatedPath)).rejects.toThrow();
      expect((await fs.stat(stagingPath)).isDirectory()).toBe(true);
      expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
        .toBe("previous-archive\n");
    } finally {
      injection.resolveClose();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  });

  it("projects bounded acquisition close timeout in CLI recovery diagnostics", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "CliT04");
    const lockPath = getJsonlAuditLockPath(filePath);
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const dryRun = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliT04");
    const fingerprint = dryRun.checks[0]?.details.recovery_fingerprint;
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(1);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const reportPromise = recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "CliT04", {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    });

    try {
      const settlement = await observeAuditCliPromiseAfterCloseDeadline(
        reportPromise,
        injection.closeStarted
      );
      const settledWithinBound = settlement.settled;
      injection.rejectClose(
        new Error("late CLI acquisition close rejection")
      );
      await injection.actualCloseCompletion;
      const report = settlement.settled
        ? settlement.value
        : await reportPromise;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const output = `${renderAuditRotationStagingRecoveryReport(report)}\n${renderAuditRotationStagingRecoveryReportJson(report)}`;

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedCloseCount).toBe(1);
      expect(report).toMatchObject({
        ok: false,
        checks: [{
          name: "audit_rotation_staging_recovery",
          status: "error",
          message:
            "audit lock acquisition descriptor close timed out after 5000 ms",
          details: {
            failure_stage: "lock_acquisition",
            mutation_state: "not_started",
            mutation_attempted: false,
            rollback_attempted: false,
            recovered: false,
            coordination_lock_acquired: false
          }
        }]
      });
      expect(output).toContain("failure_stage: lock_acquisition");
      expect(output).toContain(
        "audit lock acquisition descriptor close timed out after 5000 ms"
      );
      expect(output).not.toContain("late CLI acquisition close rejection");
      expect(unhandled).toEqual([]);
      await expect(fs.access(lockPath)).rejects.toThrow();
      expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
      await expect(fs.access(rotatedPath)).rejects.toThrow();
      expect((await fs.stat(stagingPath)).isDirectory()).toBe(true);
    } finally {
      injection.resolveClose();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  });

  it("supports idempotent missing recovery and rejects mismatched confirmation", async () => {
    const dir = await createTempDir();
    const missingFile = path.join(dir, "missing.jsonl");
    const missing = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: missingFile
    }, dir, "Apply2", {
      dryRun: false,
      expectedAction: "cleanup_empty_staging",
      expectedRecoveryFingerprint: "0".repeat(32)
    });
    expect(missing).toMatchObject({
      ok: true,
      checks: [{
        status: "ok",
        message: expect.stringContaining("nothing was mutated"),
        details: {
          mutation_performed: false,
          recovered: false,
          staging_removed: false,
          durability_completed: true,
          recovery_handles_closed: true,
          coordination_lock_path: getJsonlAuditLockPath(missingFile),
          coordination_lock_released: true
        }
      }]
    });
    expect(missing.checks[0]?.details.performed_action).toBeUndefined();

    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "Apply3");
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const mismatch = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "Apply3", {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: "0".repeat(32)
    });
    const mismatchText = renderAuditRotationStagingRecoveryReport(mismatch);
    const mismatchJson = renderAuditRotationStagingRecoveryReportJson(mismatch);
    expect(mismatch).toMatchObject({
      ok: false,
      checks: [{
        name: "audit_rotation_staging_recovery",
        status: "error",
        message: expect.stringContaining("fingerprint does not match"),
        details: {
          file_path: filePath,
          rotation_path: `${filePath}.1`,
          staging_path: stagingPath,
          recovery_fingerprint: expect.stringMatching(/^[0-9a-f]{32}$/u),
          failure_stage: "locked_revalidation",
          mutation_state: "not_started",
          mutation_attempted: false,
          mutation_performed: false,
          rollback_attempted: false,
          recovered: false,
          coordination_lock_path: getJsonlAuditLockPath(filePath),
          coordination_lock_acquired: true,
          coordination_lock_released: true
        }
      }]
    });
    expect(mismatchText).toContain("failure_stage: locked_revalidation");
    expect(mismatchText).toContain("mutation_attempted: false");
    expect(JSON.parse(mismatchJson)).toEqual(mismatch);
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
  });

  it("projects a successfully rolled-back recovery failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "Apply5");
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const dryRun = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "Apply5");
    const fingerprint = dryRun.checks[0]?.details.recovery_fingerprint;
    expect(fingerprint).toMatch(/^[0-9a-f]{32}$/u);

    const originalRename = fs.rename.bind(fs);
    const originalLstat = fs.lstat.bind(fs);
    let archiveRenamed = false;
    let injected = false;
    vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
      await originalRename(source, destination);
      if (
        path.basename(String(source)) === "previous"
        && path.basename(String(destination)) === path.basename(rotatedPath)
      ) {
        archiveRenamed = true;
      }
    });
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (!injected && archiveRenamed && String(target) === rotatedPath) {
        injected = true;
        throw new Error("injected CLI generation verification failure");
      }
      return originalLstat(target, options);
    });

    const applied = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "Apply5", {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint!
    });
    const text = renderAuditRotationStagingRecoveryReport(applied);
    const json = renderAuditRotationStagingRecoveryReportJson(applied);

    expect(injected).toBe(true);
    expect(applied).toMatchObject({
      ok: false,
      checks: [{
        name: "audit_rotation_staging_recovery",
        status: "error",
        message: "injected CLI generation verification failure",
        details: {
          failure_stage: "mutation",
          mutation_state: "rolled_back",
          mutation_attempted: true,
          mutation_performed: true,
          rollback_attempted: true,
          rollback_completed: true,
          recovered: false,
          staging_removed: false,
          recovery_handles_closed: true,
          coordination_lock_path: getJsonlAuditLockPath(filePath),
          coordination_lock_acquired: true,
          coordination_lock_released: true,
          post_failure_observation_completed: true,
          post_failure_observation: {
            observed_while_coordination_lock_held: true,
            assessment: "restore_previous_archive",
            eligible: true,
            recommended_action: "restore_previous_archive",
            recovery_fingerprint: expect.stringMatching(/^[0-9a-f]{32}$/u),
            current_generation: {
              entry_path: filePath,
              exists: true,
              entry_type: "regular_file"
            },
            rotated_generation: {
              entry_path: rotatedPath,
              exists: false
            },
            staging: {
              staging_id: "Apply5",
              staging_path: stagingPath,
              exists: true,
              layout: "previous_only"
            }
          }
        }
      }]
    });
    expect(text).toContain("mutation_state: rolled_back");
    expect(text).toContain("rollback_completed: true");
    expect(text).toContain("post_failure_observation_completed: true");
    expect(text).toContain("  post_failure_observation:\n");
    expect(text).toContain("    assessment: restore_previous_archive");
    expect(text).toContain("    current_generation:\n");
    expect(text).not.toContain("[object Object]");
    expect(JSON.parse(json)).toEqual(applied);
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
    await expect(fs.access(rotatedPath)).rejects.toThrow();
  });

  it("projects a failed post-failure namespace observation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "Apply6");
    await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
    await fs.mkdir(stagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      "previous-archive\n",
      { mode: 0o600 }
    );
    const dryRun = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "Apply6");
    const actualFingerprint =
      dryRun.checks[0]?.details.recovery_fingerprint;
    const staleFingerprint = actualFingerprint === "0".repeat(32)
      ? "1".repeat(32)
      : "0".repeat(32);
    const originalLstat = fs.lstat.bind(fs);
    let currentLstatCount = 0;
    let observationFailureInjected = false;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (String(target) === filePath) {
        currentLstatCount += 1;
        if (currentLstatCount === 3) {
          observationFailureInjected = true;
          throw new Error("injected CLI post-failure observation failure");
        }
      }
      return originalLstat(target, options);
    });

    const applied = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: filePath
    }, dir, "Apply6", {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: staleFingerprint
    });
    const text = renderAuditRotationStagingRecoveryReport(applied);
    const json = renderAuditRotationStagingRecoveryReportJson(applied);

    expect(observationFailureInjected).toBe(true);
    expect(applied).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("fingerprint does not match"),
        details: {
          recovery_fingerprint: actualFingerprint,
          failure_stage: "locked_revalidation",
          mutation_state: "not_started",
          coordination_lock_acquired: true,
          coordination_lock_released: true,
          post_failure_observation_completed: false,
          post_failure_observation_warning: expect.stringContaining(
            "injected CLI post-failure observation failure"
          )
        }
      }]
    });
    expect(applied.checks[0]?.details.post_failure_observation)
      .toBeUndefined();
    expect(text).toContain("post_failure_observation_completed: false");
    expect(text).toContain(
      "post_failure_observation_warning: post-failure namespace observation could not be completed"
    );
    expect(text).not.toContain("[object Object]");
    expect(JSON.parse(json)).toEqual(applied);
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
  });

  it("handles disabled and malformed rotation staging recovery requests", async () => {
    const dir = await createTempDir();
    const disabledDryRun = await recoverAuditRotationStaging({}, dir, "Apply4");
    const disabledMutation = await recoverAuditRotationStaging({}, dir, "Apply4", {
      dryRun: false,
      expectedAction: "cleanup_empty_staging",
      expectedRecoveryFingerprint: "0".repeat(32)
    });
    const invalidId = await recoverAuditRotationStaging({}, dir, "bad");
    const invalidConfig = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: "audit.jsonl",
      GOD_CODE_AUDIT_MAX_BYTES: "invalid"
    }, dir, "Apply4");
    const missingAction = await recoverAuditRotationStaging({
      GOD_CODE_AUDIT_FILE: "audit.jsonl"
    }, dir, "Apply4", {
      dryRun: false,
      expectedRecoveryFingerprint: "0".repeat(32)
    });

    expect(disabledDryRun).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        details: {
          enabled: false,
          dry_run: true,
          mutation_performed: false
        }
      }]
    });
    expect(disabledMutation).toMatchObject({
      ok: false,
      checks: [{ message: expect.stringContaining("persistence is disabled") }]
    });
    expect(invalidId).toMatchObject({
      ok: false,
      checks: [{ message: expect.stringContaining("six ASCII alphanumeric") }]
    });
    expect(invalidConfig).toMatchObject({
      ok: false,
      checks: [{ message: expect.stringContaining("configuration is invalid") }]
    });
    expect(missingAction).toMatchObject({
      ok: false,
      checks: [{ message: expect.stringContaining("requires --expect-action") }]
    });
  });

  it("defaults lock cleanup to a non-mutating fingerprinted dry run", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);

    const report = await cleanupAuditLock({ GOD_CODE_AUDIT_FILE: filePath }, dir);
    const text = renderAuditLockCleanupReport(report);
    const json = renderAuditLockCleanupReportJson(report);

    expect(report.ok).toBe(true);
    expect(report.checks[0]).toMatchObject({
      status: "warn",
      message: expect.stringContaining("dry run"),
      details: {
        enabled: true,
        file_path: filePath,
        coordination_lock_path: lock.lockPath,
        coordination_lock_exists: true,
        coordination_lock_entry_type: "directory",
        coordination_lock_entry_count: 1,
        coordination_lock_entry_scan_count: 1,
        coordination_lock_entry_scan_limit:
          MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
        coordination_lock_entry_scan_truncated: false,
        coordination_lock_owner_entry_exclusive: true,
        coordination_lock_owner_metadata_status: "valid",
        coordination_lock_owner_pid: process.pid,
        coordination_lock_acquired_at: "2026-07-22T10:30:00.000Z",
        coordination_lock_owner_fingerprint: ownerFingerprint,
        dry_run: true,
        confirmation_required: true,
        liveness_verified: false,
        removed: false
      }
    });
    expect(`${text}\n${json}`).toContain(ownerFingerprint);
    expect(`${text}\n${json}`).not.toContain(lock.ownerToken);
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("withholds cleanup fingerprints when active lock children drift", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const extraPath = path.join(lock.lockPath, "late-overflow-secret");
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, ...args) => {
      if (
        !injected
        && path.resolve(String(target)) === path.resolve(lock.ownerPath)
      ) {
        injected = true;
        const extra = await originalOpen(extraPath, "w", 0o600);
        try {
          await extra.writeFile("preserved\n");
        } finally {
          await extra.close();
        }
      }
      return originalOpen(target, ...args);
    });
    const unlink = vi.spyOn(fs, "unlink");

    const report = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir
    );
    const text = renderAuditLockCleanupReport(report);
    const json = renderAuditLockCleanupReportJson(report);

    expect(injected).toBe(true);
    expect(unlink).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("state changed during inspection"),
        details: {
          coordination_lock_entry_count: 1,
          coordination_lock_entry_scan_count: 1,
          coordination_lock_entry_scan_limit:
            MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
          coordination_lock_entry_scan_truncated: false,
          coordination_lock_owner_entry_exclusive: false,
          coordination_lock_state_changed: true,
          confirmation_required: false,
          removed: false
        }
      }]
    });
    expect(
      report.checks[0]!.details.coordination_lock_owner_fingerprint
    ).toBeUndefined();
    expect(`${text}\n${json}`).not.toContain(lock.ownerToken);
    expect(`${text}\n${json}`).not.toContain("late-overflow-secret");
    expect(await fs.readFile(extraPath, "utf8")).toBe("preserved\n");

    vi.restoreAllMocks();
    await fs.rm(extraPath);
    await lock.release();
  });

  it("withholds cleanup fingerprints after terminal lock directory rebinding", async () => {
    if (process.platform === "win32") {
      return;
    }
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const hiddenName = "terminal-hidden-secret";
    const hiddenPath = `${lock.lockPath}.${hiddenName}`;
    const originalLstat = fs.lstat.bind(fs);
    const originalRename = fs.rename.bind(fs);
    const originalSymlink = fs.symlink.bind(fs);
    const originalUnlink = fs.unlink.bind(fs);
    let ownerPathReads = 0;
    let injected = false;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.resolve(String(target)) === path.resolve(lock.ownerPath)) {
        ownerPathReads += 1;
        if (ownerPathReads === 4) {
          await originalRename(lock.lockPath, hiddenPath);
          await originalSymlink(hiddenPath, lock.lockPath, "dir");
          injected = true;
        }
      }
      return originalLstat(target, options);
    });
    const unlink = vi.spyOn(fs, "unlink");

    try {
      const report = await cleanupAuditLock(
        { GOD_CODE_AUDIT_FILE: filePath },
        dir
      );
      const text = renderAuditLockCleanupReport(report);
      const json = renderAuditLockCleanupReportJson(report);

      expect(injected).toBe(true);
      expect(ownerPathReads).toBe(5);
      expect(unlink).not.toHaveBeenCalled();
      expect((await originalLstat(lock.lockPath)).isSymbolicLink()).toBe(true);
      expect(report).toMatchObject({
        ok: false,
        checks: [{
          status: "error",
          message: expect.stringContaining("state changed during inspection"),
          details: {
            coordination_lock_entry_count: 1,
            coordination_lock_entry_scan_count: 1,
            coordination_lock_entry_scan_limit:
              MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
            coordination_lock_entry_scan_truncated: false,
            coordination_lock_owner_entry_exclusive: false,
            coordination_lock_state_changed: true,
            confirmation_required: false,
            removed: false
          }
        }]
      });
      expect(
        report.checks[0]!.details.coordination_lock_owner_fingerprint
      ).toBeUndefined();
      expect(report.checks[0]!.details.coordination_lock_owner_metadata_status)
        .toBeUndefined();
      expect(`${text}\n${json}`).not.toContain(lock.ownerToken);
      expect(`${text}\n${json}`).not.toContain(hiddenName);
      await fs.access(path.join(hiddenPath, "owner.json"));
    } finally {
      vi.restoreAllMocks();
      try {
        if ((await originalLstat(lock.lockPath)).isSymbolicLink()) {
          await originalUnlink(lock.lockPath);
        }
      } catch {
        // Restore below when the logical path disappeared mid-injection.
      }
      try {
        await originalRename(hiddenPath, lock.lockPath);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }
      await lock.release();
    }
  });

  it("withholds cleanup fingerprints after terminal lock directory generation drift", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const extraName = "terminal-late-secret";
    const extraPath = path.join(lock.lockPath, extraName);
    const originalLstat = fs.lstat.bind(fs);
    const originalOpen = fs.open.bind(fs);
    let ownerPathReads = 0;
    let injected = false;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      const resolvedTarget = path.resolve(String(target));
      if (resolvedTarget === path.resolve(lock.ownerPath)) {
        ownerPathReads += 1;
        if (ownerPathReads === 4) {
          const extra = await originalOpen(extraPath, "w", 0o600);
          try {
            await extra.writeFile("preserved\n");
          } finally {
            await extra.close();
          }
          injected = true;
        }
      }
      const status = await originalLstat(target, options);
      if (
        injected
        && resolvedTarget === path.resolve(lock.lockPath)
        && "ctimeNs" in status
      ) {
        status.ctimeNs += 1n;
      }
      return status;
    });
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");

    try {
      const report = await cleanupAuditLock(
        { GOD_CODE_AUDIT_FILE: filePath },
        dir
      );
      const text = renderAuditLockCleanupReport(report);
      const json = renderAuditLockCleanupReportJson(report);

      expect(injected).toBe(true);
      expect(ownerPathReads).toBeGreaterThanOrEqual(5);
      expect(ownerPathReads).toBeLessThanOrEqual(8);
      expect(unlink).not.toHaveBeenCalled();
      expect(rmdir).not.toHaveBeenCalled();
      expect(report).toMatchObject({
        ok: false,
        checks: [{
          status: "error",
          message: expect.stringContaining("state changed during inspection"),
          details: {
            coordination_lock_entry_count: 1,
            coordination_lock_entry_scan_count: 1,
            coordination_lock_entry_scan_limit:
              MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
            coordination_lock_entry_scan_truncated: false,
            coordination_lock_owner_entry_exclusive: false,
            coordination_lock_state_changed: true,
            confirmation_required: false,
            removed: false
          }
        }]
      });
      expect(
        report.checks[0]!.details.coordination_lock_owner_fingerprint
      ).toBeUndefined();
      expect(report.checks[0]!.details.coordination_lock_owner_metadata_status)
        .toBeUndefined();
      expect(`${text}\n${json}`).not.toContain(lock.ownerToken);
      expect(`${text}\n${json}`).not.toContain(extraName);
      expect(await fs.readFile(extraPath, "utf8")).toBe("preserved\n");
    } finally {
      vi.restoreAllMocks();
      await fs.rm(extraPath, { force: true });
      await lock.release();
    }
  });

  it("withholds cleanup fingerprints after terminal owner file generation drift", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const replacementToken = "00000000-0000-4000-8000-000000000045";
    const originalFingerprint = await requireActiveLockOwnerFingerprint(
      filePath
    );
    const race = rewriteOwnerOnNthPathInspection(
      lock.lockPath,
      lock.ownerPath,
      replacementToken,
      5
    );
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");

    try {
      const report = await cleanupAuditLock(
        { GOD_CODE_AUDIT_FILE: filePath },
        dir
      );
      const output = `${renderAuditLockCleanupReport(report)}\n${renderAuditLockCleanupReportJson(report)}`;

      expect(race).toEqual({ pathReads: 5, rewritten: true });
      expect(unlink).not.toHaveBeenCalled();
      expect(rmdir).not.toHaveBeenCalled();
      expect(report).toMatchObject({
        ok: false,
        checks: [{
          status: "error",
          message: expect.stringContaining("state changed during inspection"),
          details: {
            coordination_lock_entry_count: 1,
            coordination_lock_entry_scan_count: 1,
            coordination_lock_entry_scan_limit:
              MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
            coordination_lock_entry_scan_truncated: false,
            coordination_lock_owner_entry_exclusive: false,
            coordination_lock_state_changed: true,
            confirmation_required: false,
            removed: false
          }
        }]
      });
      expect(
        report.checks[0]!.details.coordination_lock_owner_fingerprint
      ).toBeUndefined();
      expect(report.checks[0]!.details.coordination_lock_owner_metadata_status)
        .toBeUndefined();
      for (const secret of [
        lock.ownerToken,
        replacementToken,
        originalFingerprint
      ]) {
        expect(output).not.toContain(secret);
      }
      expect(JSON.parse(await fs.readFile(lock.ownerPath, "utf8")))
        .toMatchObject({ owner_token: replacementToken });
    } finally {
      vi.restoreAllMocks();
      await lock.abandon();
      await fs.rm(lock.lockPath, { recursive: true, force: true });
    }
  });

  it("requires an exact dry-run fingerprint before removing a lock", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await fs.writeFile(filePath, "unchanged", { mode: 0o600 });
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);

    const mismatch = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: "0".repeat(32) }
    );
    expect(mismatch).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("does not match"),
        details: {
          owner_fingerprint_matches: false,
          removed: false
        }
      }]
    });
    expect(renderAuditLockCleanupReportJson(mismatch)).not.toContain(ownerFingerprint);
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);

    const removed = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    expect(removed).toMatchObject({
      ok: true,
      checks: [{
        status: "ok",
        details: {
          coordination_lock_exists: false,
          owner_fingerprint_matches: true,
          dry_run: false,
          confirmation_required: false,
          liveness_verified: false,
          removed: true,
          cleanup_handles_closed: true
        }
      }]
    });
    expect(renderAuditLockCleanupReportJson(removed)).not.toContain(lock.ownerToken);
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect(await fs.readFile(filePath, "utf8")).toBe("unchanged");
  });

  it("preserves committed lock cleanup evidence when descriptor finalization fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const closeFailure = injectAuditMaintenanceHandleCloseFailure(
      lock.lockPath,
      2,
      "injected CLI lock cleanup handle close failure"
    );

    const report = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    await closeFailure.closeCompletion;
    const output = `${renderAuditLockCleanupReport(report)}\n${renderAuditLockCleanupReportJson(report)}`;

    expect(closeFailure.selectedOpenCount).toBeGreaterThanOrEqual(2);
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("descriptor finalization"),
        details: {
          coordination_lock_exists: false,
          coordination_lock_owner_fingerprint: ownerFingerprint,
          owner_fingerprint_matches: true,
          removed: true,
          cleanup_handles_closed: false,
          cleanup_handle_warning: expect.stringContaining(
            "injected CLI lock cleanup handle close failure"
          )
        }
      }]
    });
    expect(output).toContain("cleanup_handles_closed");
    expect(output).toContain("cleanup_handle_warning");
    expect(output).not.toContain(lock.ownerToken);
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
  });

  it("projects descriptor finalization evidence for rejected lock cleanup", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const closeFailure = injectAuditMaintenanceHandleCloseFailure(
      lock.lockPath,
      2,
      "rejected CLI lock cleanup handle close failure"
    );
    vi.spyOn(fs, "mkdtemp").mockRejectedValue(
      new Error("primary CLI lock cleanup failure")
    );

    const report = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    await closeFailure.closeCompletion;
    const output = `${renderAuditLockCleanupReport(report)}\n${renderAuditLockCleanupReportJson(report)}`;

    expect(closeFailure.selectedOpenCount).toBeGreaterThanOrEqual(2);
    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: "primary CLI lock cleanup failure",
        details: {
          coordination_lock_exists: true,
          removed: false,
          cleanup_handles_closed: false,
          cleanup_handle_warning: expect.stringContaining(
            "rejected CLI lock cleanup handle close failure"
          )
        }
      }]
    });
    expect(output).toContain("cleanup_handles_closed");
    expect(output).toContain("cleanup_handle_warning");
    expect(output).not.toContain(lock.ownerToken);
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("projects failed-open candidate descriptor evidence for lock cleanup", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const injection = injectAuditMaintenanceOpenValidationFailure(
      lock.lockPath,
      2,
      "CLI candidate opener primary failure",
      "CLI candidate opener close failure"
    );

    const report = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    await injection.closeCompletion;
    const output = `${renderAuditLockCleanupReport(report)}\n${renderAuditLockCleanupReportJson(report)}`;

    expect(injection.selectedOpenCount).toBeGreaterThanOrEqual(2);
    expect(injection.selectedCloseCount).toBe(1);
    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: "CLI candidate opener primary failure",
        details: {
          coordination_lock_exists: true,
          removed: false,
          cleanup_handles_closed: false,
          cleanup_handle_warning: expect.stringContaining(
            "CLI candidate opener close failure"
          )
        }
      }]
    });
    expect(output).toContain("cleanup_handles_closed");
    expect(output).toContain("cleanup_handle_warning");
    expect(output).not.toContain(lock.ownerToken);
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("preserves CLI cleanup when a candidate directory stream close fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const injection = injectAuditMaintenanceDirectoryStreamFailure(
      3,
      "CLI candidate stream close failure"
    );

    const report = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    await injection.closeCompletion;
    const output = `${renderAuditLockCleanupReport(report)}\n${renderAuditLockCleanupReportJson(report)}`;

    expect(injection.selectedStreamCount).toBeGreaterThan(3);
    expect(injection.selectedCloseCount).toBe(1);
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("descriptor finalization"),
        details: {
          coordination_lock_exists: false,
          removed: true,
          cleanup_handles_closed: false,
          cleanup_handle_warning: expect.stringContaining(
            "CLI candidate stream close failure"
          )
        }
      }]
    });
    expect(output).toContain("cleanup_handle_warning");
    expect(output).not.toContain(lock.ownerToken);
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
  });

  it("projects scan primary and stream close evidence for CLI cleanup", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const injection = injectAuditMaintenanceDirectoryStreamFailure(
      3,
      "CLI candidate stream secondary close failure",
      "CLI candidate stream primary read failure"
    );

    const report = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    await injection.closeCompletion;
    const output = `${renderAuditLockCleanupReport(report)}\n${renderAuditLockCleanupReportJson(report)}`;

    expect(injection.selectedStreamCount).toBe(3);
    expect(injection.selectedCloseCount).toBe(1);
    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: "CLI candidate stream primary read failure",
        details: {
          coordination_lock_exists: true,
          removed: false,
          cleanup_handles_closed: false,
          cleanup_handle_warning: expect.stringContaining(
            "CLI candidate stream secondary close failure"
          )
        }
      }]
    });
    expect(output).toContain("cleanup_handle_warning");
    expect(output).not.toContain(lock.ownerToken);
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("projects a pending candidate stream timeout as a CLI cleanup warning", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(3);
    vi.useFakeTimers();
    const reportPromise = cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );

    try {
      await injection.closeStarted;
      await vi.advanceTimersByTimeAsync(60_000);
      vi.useRealTimers();
      const settlement = await Promise.race([
        reportPromise.then((report) => ({ settled: true as const, report })),
        new Promise<{ settled: false }>((resolve) => {
          setTimeout(() => resolve({ settled: false }), 500);
        })
      ]);
      const settledWithinBound = settlement.settled;
      injection.resolveClose();
      await injection.actualCloseCompletion;
      const report = settlement.settled
        ? settlement.report
        : await reportPromise;
      const output = `${renderAuditLockCleanupReport(report)}\n${renderAuditLockCleanupReportJson(report)}`;

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedStreamCount).toBeGreaterThan(3);
      expect(injection.selectedCloseCount).toBe(1);
      expect(report).toMatchObject({
        ok: true,
        checks: [{
          status: "warn",
          message: expect.stringContaining("descriptor finalization"),
          details: {
            coordination_lock_exists: false,
            removed: true,
            cleanup_handles_closed: false,
            cleanup_handle_warning: expect.stringContaining(
              "maintenance descriptor close timed out after 5000 ms"
            )
          }
        }]
      });
      expect(output).toContain("cleanup_handle_warning");
      expect(output).not.toContain(lock.ownerToken);
      await expect(fs.access(lock.lockPath)).rejects.toThrow();
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("preserves CLI scan primary evidence across a stream close timeout", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(
      3,
      "CLI pending stream primary failure"
    );
    vi.useFakeTimers();
    const reportPromise = cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );

    try {
      await injection.closeStarted;
      await vi.advanceTimersByTimeAsync(60_000);
      vi.useRealTimers();
      const settlement = await Promise.race([
        reportPromise.then((report) => ({ settled: true as const, report })),
        new Promise<{ settled: false }>((resolve) => {
          setTimeout(() => resolve({ settled: false }), 500);
        })
      ]);
      const settledWithinBound = settlement.settled;
      injection.resolveClose();
      await injection.actualCloseCompletion;
      const report = settlement.settled
        ? settlement.report
        : await reportPromise;
      const output = `${renderAuditLockCleanupReport(report)}\n${renderAuditLockCleanupReportJson(report)}`;

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedStreamCount).toBe(3);
      expect(injection.selectedCloseCount).toBe(1);
      expect(report).toMatchObject({
        ok: false,
        checks: [{
          status: "error",
          message: "CLI pending stream primary failure",
          details: {
            coordination_lock_exists: true,
            removed: false,
            cleanup_handles_closed: false,
            cleanup_handle_warning: expect.stringContaining(
              "maintenance descriptor close timed out after 5000 ms"
            )
          }
        }]
      });
      expect(output).toContain("cleanup_handle_warning");
      expect(output).not.toContain(lock.ownerToken);
      expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
      await lock.release();
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("reports active target absence when private quarantine contraction leaves a residual", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const quarantinePrefix = getJsonlAuditLockQuarantinePrefix(filePath);
    const quarantineParent = path.dirname(quarantinePrefix);
    const quarantineNamePrefix = path.basename(quarantinePrefix);
    const originalRmdir = fs.rmdir.bind(fs);
    let detachedRoot = "";
    tempDirs.push(lock.lockPath);
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      const targetPath = String(target);
      const targetName = path.basename(targetPath);
      if (
        detachedRoot.length === 0
        && targetName.startsWith(quarantineNamePrefix)
      ) {
        const logicalTargetPath = path.join(quarantineParent, targetName);
        detachedRoot = `${logicalTargetPath}.phase573-detached`;
        tempDirs.push(logicalTargetPath, detachedRoot);
        await fs.rename(logicalTargetPath, detachedRoot);
        await fs.mkdir(logicalTargetPath, { mode: 0o700 });
        await originalRmdir(targetPath);
        return;
      }
      await originalRmdir(target, options);
    });

    const report = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const output = `${renderAuditLockCleanupReport(report)}\n${renderAuditLockCleanupReportJson(report)}`;

    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("quarantine residue"),
        details: {
          coordination_lock_exists: false,
          owner_fingerprint_matches: true,
          removed: true,
          residual_quarantine_path: expect.stringContaining(
            quarantineNamePrefix
          )
        }
      }]
    });
    expect(detachedRoot).not.toBe("");
    expect(output).not.toContain(lock.ownerToken);
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    await expect(fs.access(
      report.checks[0]!.details.residual_quarantine_path!
    )).rejects.toThrow();
    expect(await fs.readdir(detachedRoot)).toEqual([]);
  });

  it("refuses lock cleanup when persistence or owner metadata is unavailable", async () => {
    const dir = await createTempDir();
    const disabled = await cleanupAuditLock({}, dir);
    expect(disabled).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("disabled")
      }]
    });

    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    await fs.mkdir(lockPath, { mode: 0o700 });
    const missingOwner = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir
    );
    expect(missingOwner).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("valid owner metadata is required"),
        details: {
          coordination_lock_owner_metadata_status: "missing",
          removed: false
        }
      }]
    });
    expect(await fs.readdir(lockPath)).toEqual([]);
    await fs.rmdir(lockPath);
  });

  it("refuses a dry run when the lock directory contains extra entries", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const extraPath = path.join(lock.lockPath, "unexpected");
    await fs.writeFile(extraPath, "preserved", { mode: 0o600 });

    const report = await cleanupAuditLock({ GOD_CODE_AUDIT_FILE: filePath }, dir);

    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("exactly one owner metadata entry"),
        details: { removed: false }
      }]
    });
    expect(await fs.readFile(extraPath, "utf8")).toBe("preserved");
    await fs.rm(extraPath);
    await lock.release();
  });

  it("reports bounded quarantine residue without exposing owner tokens", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });
    const quarantinePath = `${getJsonlAuditLockQuarantinePrefix(filePath)}Bb0001`;
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(quarantinePath));
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      "Bb0001"
    );

    const report = await inspectAuditLockQuarantines(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir
    );
    const text = renderAuditLockQuarantineReport(report);
    const json = renderAuditLockQuarantineReportJson(report);

    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("requires manual review"),
        details: {
          enabled: true,
          file_path: filePath,
          coordination_lock_path: lock.lockPath,
          quarantine_prefix: getJsonlAuditLockQuarantinePrefix(filePath),
          scan_limit: 4_096,
          scan_truncated: false,
          matched_entry_count: 1,
          result_limit: 128,
          result_truncated: false,
          quarantines: [{
            quarantine_id: "Bb0001",
            quarantine_path: quarantinePath,
            exists: true,
            entry_type: "directory",
            layout: "owner_only",
            root_entry_count: 1,
            root_owner_metadata_status: "valid",
            owner_location: "root",
            owner_metadata_status: "valid",
            owner_pid: process.pid,
            owner_acquired_at: "2026-07-22T10:30:00.000Z",
            owner_fingerprint: ownerFingerprint
          }]
        }
      }]
    });
    expect(`${text}\n${json}`).toContain(ownerFingerprint);
    expect(`${text}\n${json}`).not.toContain(lock.ownerToken);
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("projects bounded selected quarantine child scans", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Bq1001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const overflowNames = ["overflow-secret-a", "overflow-secret-b"];
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.writeFile(
      getJsonlAuditLockOwnerPath(quarantinePath),
      "invalid-owner\n",
      { mode: 0o600 }
    );
    await Promise.all(overflowNames.map((name) => fs.writeFile(
      path.join(quarantinePath, name),
      "overflow\n",
      { mode: 0o600 }
    )));

    const report = await inspectAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const text = renderAuditTargetedLockQuarantineReport(report);
    const json = renderAuditTargetedLockQuarantineReportJson(report);

    expect(report).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_lock_quarantine",
        status: "warn",
        details: {
          quarantine_id: quarantineId,
          quarantine: {
            quarantine_id: quarantineId,
            quarantine_path: quarantinePath,
            exists: true,
            entry_type: "directory",
            layout: "unknown",
            root_entry_scan_count:
              MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
            root_entry_scan_limit:
              MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
            root_entry_scan_truncated: true
          }
        }
      }]
    });
    const quarantine = report.checks[0]?.details.quarantine;
    expect(quarantine?.root_entry_count).toBeUndefined();
    expect(quarantine?.root_owner_metadata_status).toBeUndefined();
    expect(quarantine?.owner_fingerprint).toBeUndefined();
    expect(quarantine?.empty_directory_fingerprint).toBeUndefined();
    expect(text).toContain("root_entry_scan_count: 2");
    expect(text).toContain("root_entry_scan_limit: 2");
    expect(text).toContain("root_entry_scan_truncated: true");
    for (const overflowName of overflowNames) {
      expect(text).not.toContain(overflowName);
      expect(json).not.toContain(overflowName);
    }
    expect(JSON.parse(json)).toEqual(report);
  });

  it("projects targeted quarantine close timeout as inspection uncertainty", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "P58103";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(quarantinePath)
    );
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(1);
    vi.useFakeTimers();
    const reportPromise = inspectAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );

    try {
      const settlement = await observeAuditCliPromiseAfterCloseDeadline(
        reportPromise,
        injection.closeStarted
      );
      injection.resolveClose();
      await injection.actualCloseCompletion;
      const report = settlement.settled
        ? settlement.value
        : await reportPromise;
      const output = `${renderAuditTargetedLockQuarantineReport(report)}\n${renderAuditTargetedLockQuarantineReportJson(report)}`;
      const quarantine = report.checks[0]?.details.quarantine;

      expect(settlement.settled).toBe(true);
      expect(injection.selectedCloseCount).toBe(1);
      expect(report).toMatchObject({
        ok: true,
        checks: [{
          name: "audit_lock_quarantine",
          status: "warn",
          message: expect.stringContaining("uncertain or invalid state"),
          details: {
            quarantine_id: quarantineId,
            quarantine: {
              quarantine_path: quarantinePath,
              exists: true,
              layout: "unknown",
              inspection_error_code: "inspection_failed"
            }
          }
        }]
      });
      expect(quarantine?.owner_fingerprint).toBeUndefined();
      expect(quarantine?.empty_directory_fingerprint).toBeUndefined();
      expect(output).not.toContain(lock.ownerToken);
      expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
      expect(await fs.readFile(
        getJsonlAuditLockOwnerPath(quarantinePath),
        "utf8"
      )).toContain(lock.ownerToken);
      await lock.release();
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("inspects one owner_only quarantine directly with the same projection as the bounded list", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });
    const quarantineId = "Tq0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(quarantinePath));
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    const direct = await inspectAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const listed = await inspectAuditLockQuarantines(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir
    );
    const text = renderAuditTargetedLockQuarantineReport(direct);
    const json = renderAuditTargetedLockQuarantineReportJson(direct);

    expect(direct).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_lock_quarantine",
        status: "warn",
        message: "selected quarantine residue requires manual review",
        details: {
          enabled: true,
          file_path: filePath,
          coordination_lock_path: lock.lockPath,
          quarantine_id: quarantineId,
          quarantine: {
            quarantine_id: quarantineId,
            quarantine_path: quarantinePath,
            exists: true,
            entry_type: "directory",
            layout: "owner_only",
            root_entry_count: 1,
            root_owner_metadata_status: "valid",
            owner_location: "root",
            owner_metadata_status: "valid",
            owner_pid: process.pid,
            owner_acquired_at: "2026-07-22T10:30:00.000Z",
            owner_fingerprint: ownerFingerprint
          }
        }
      }]
    });
    const directEntry = direct.checks[0]!.details.quarantine!;
    const listedEntry = listed.checks[0]!.details.quarantines[0]!;
    const { age_ms: directAge, ...directStable } = directEntry;
    const { age_ms: listedAge, ...listedStable } = listedEntry;
    expect(directStable).toEqual(listedStable);
    expect(directAge).toEqual(expect.any(Number));
    expect(listedAge).toEqual(expect.any(Number));
    expect(`${text}\n${json}`).toContain(ownerFingerprint);
    expect(`${text}\n${json}`).not.toContain(lock.ownerToken);
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("withholds quarantine inspect and cleanup fingerprints after selected owner rewrite", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Tq0010";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const ownerPath = getJsonlAuditLockOwnerPath(quarantinePath);
    const replacementToken = "00000000-0000-4000-8000-000000000012";
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const originalFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    const directRace = rewriteOwnerOnSecondDirectoryScan(
      quarantinePath,
      ownerPath,
      replacementToken
    );
    const direct = await inspectAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const directOutput = `${renderAuditTargetedLockQuarantineReport(direct)}\n${renderAuditTargetedLockQuarantineReportJson(direct)}`;

    expect(directRace).toEqual({ selectedScans: 2, rewritten: true });
    expect(direct).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_lock_quarantine",
        status: "warn",
        message: expect.stringContaining("uncertain or invalid state"),
        details: {
          quarantine_id: quarantineId,
          quarantine: {
            quarantine_id: quarantineId,
            quarantine_path: quarantinePath,
            exists: true,
            entry_type: "directory",
            root_entry_count: 1,
            root_owner_metadata_status: "valid",
            layout: "unknown",
            state_changed: true
          }
        }
      }]
    });
    expect(direct.checks[0]!.details.quarantine!.owner_location)
      .toBeUndefined();
    expect(direct.checks[0]!.details.quarantine!.owner_metadata_status)
      .toBeUndefined();
    expect(direct.checks[0]!.details.quarantine!.owner_fingerprint)
      .toBeUndefined();
    for (const secret of [
      lock.ownerToken,
      replacementToken,
      originalFingerprint
    ]) {
      expect(directOutput).not.toContain(secret);
    }

    vi.restoreAllMocks();
    await fs.copyFile(lock.ownerPath, ownerPath);
    const cleanupRace = rewriteOwnerOnSecondDirectoryScan(
      quarantinePath,
      ownerPath,
      replacementToken
    );
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const cleanup = await cleanupAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const cleanupOutput = `${renderAuditLockQuarantineCleanupReport(cleanup)}\n${renderAuditLockQuarantineCleanupReportJson(cleanup)}`;

    expect(cleanupRace).toEqual({ selectedScans: 2, rewritten: true });
    expect(cleanup).toMatchObject({
      ok: false,
      checks: [{
        name: "audit_lock_quarantine_cleanup",
        status: "error",
        message: expect.stringContaining("only owner_only"),
        details: {
          quarantine_id: quarantineId,
          quarantine_path: quarantinePath,
          quarantine_exists: true,
          quarantine_entry_type: "directory",
          quarantine_layout: "unknown",
          state_changed: true,
          dry_run: true,
          confirmation_required: false,
          removed: false
        }
      }]
    });
    expect(cleanup.checks[0]!.details.owner_fingerprint).toBeUndefined();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    for (const secret of [
      lock.ownerToken,
      replacementToken,
      originalFingerprint
    ]) {
      expect(cleanupOutput).not.toContain(secret);
    }
    expect(JSON.parse(await fs.readFile(ownerPath, "utf8"))).toMatchObject({
      owner_token: replacementToken
    });

    vi.restoreAllMocks();
    await lock.release();
  });

  it("withholds quarantine cleanup fingerprint after terminal owner file generation drift", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Tq0013";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const ownerPath = getJsonlAuditLockOwnerPath(quarantinePath);
    const replacementToken = "00000000-0000-4000-8000-000000000046";
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const originalFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const race = rewriteOwnerOnNthPathInspection(
      quarantinePath,
      ownerPath,
      replacementToken,
      5
    );
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");

    const cleanup = await cleanupAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const output = `${renderAuditLockQuarantineCleanupReport(cleanup)}\n${renderAuditLockQuarantineCleanupReportJson(cleanup)}`;

    expect(race).toEqual({ pathReads: 5, rewritten: true });
    expect(cleanup).toMatchObject({
      ok: false,
      checks: [{
        name: "audit_lock_quarantine_cleanup",
        status: "error",
        message: expect.stringContaining("only owner_only"),
        details: {
          quarantine_id: quarantineId,
          quarantine_path: quarantinePath,
          quarantine_exists: true,
          quarantine_entry_type: "directory",
          quarantine_layout: "unknown",
          state_changed: true,
          dry_run: true,
          confirmation_required: false,
          removed: false
        }
      }]
    });
    expect(cleanup.checks[0]!.details.owner_fingerprint).toBeUndefined();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    for (const secret of [
      lock.ownerToken,
      replacementToken,
      originalFingerprint
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(JSON.parse(await fs.readFile(ownerPath, "utf8"))).toMatchObject({
      owner_token: replacementToken
    });

    vi.restoreAllMocks();
    await lock.release();
  });

  it("inspects a pre-commit quarantine and preserves its nested owner layout", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });
    const quarantineId = "Tq0002";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(nestedLockPath, { recursive: true, mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(nestedLockPath));
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    const report = await inspectAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );

    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: "selected quarantine residue requires manual review",
        details: {
          quarantine: {
            layout: "lock_with_owner",
            root_entry_count: 1,
            lock_entry_type: "directory",
            lock_entry_count: 1,
            root_owner_metadata_status: "missing",
            lock_owner_metadata_status: "valid",
            owner_location: "lock",
            owner_metadata_status: "valid",
            owner_fingerprint: ownerFingerprint
          }
        }
      }]
    });
    expect((await fs.stat(getJsonlAuditLockOwnerPath(nestedLockPath))).isFile()).toBe(true);
    await lock.release();
  });

  it("reports empty and missing targeted quarantines without mutating either path", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Tq0003";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });

    const empty = await inspectAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    expect(empty).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: "selected quarantine residue requires manual review",
        details: {
          quarantine: {
            exists: true,
            entry_type: "directory",
            layout: "empty",
            root_entry_count: 0,
            root_owner_metadata_status: "missing"
          }
        }
      }]
    });
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);

    const missing = await inspectAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      "Tq0004"
    );
    expect(missing).toMatchObject({
      ok: true,
      checks: [{
        status: "ok",
        message: "selected quarantine residue does not exist",
        details: {
          quarantine_id: "Tq0004",
          quarantine: { exists: false }
        }
      }]
    });
    expect(missing.checks[0]!.details.quarantine?.state_changed).toBeUndefined();
    expect(renderAuditTargetedLockQuarantineReportJson(missing)).not.toContain(
      "state_changed"
    );
  });

  it("warns for uncertain targeted quarantine entries and preserves their contents", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const unknownPath = getJsonlAuditLockQuarantinePath(filePath, "Tq0005");
    const blockerPath = getJsonlAuditLockQuarantinePath(filePath, "Tq0006");
    const unexpectedPath = path.join(unknownPath, "unexpected");
    tempDirs.push(unknownPath, blockerPath);
    await fs.mkdir(unknownPath, { mode: 0o700 });
    await fs.writeFile(unexpectedPath, "preserved", { mode: 0o600 });
    await fs.writeFile(blockerPath, "blocker", { mode: 0o600 });

    for (const [quarantineId, expectedEntryType, expectedLayout] of [
      ["Tq0005", "directory", "unknown"],
      ["Tq0006", "regular_file", undefined]
    ] as const) {
      const report = await inspectAuditLockQuarantine(
        { GOD_CODE_AUDIT_FILE: filePath },
        dir,
        quarantineId
      );
      expect(report).toMatchObject({
        ok: true,
        checks: [{
          status: "warn",
          message: expect.stringContaining("uncertain or invalid state"),
          details: {
            quarantine: {
              exists: true,
              entry_type: expectedEntryType,
              layout: expectedLayout
            }
          }
        }]
      });
    }
    expect(await fs.readFile(unexpectedPath, "utf8")).toBe("preserved");
    expect(await fs.readFile(blockerPath, "utf8")).toBe("blocker");
  });

  it("skips targeted quarantine inspection when audit persistence is disabled", async () => {
    const report = await inspectAuditLockQuarantine({}, "/workspace", "Tq0007");

    expect(report).toEqual({
      ok: true,
      checks: [{
        name: "audit_lock_quarantine",
        status: "warn",
        message: "skipped; persistence is disabled",
        details: {
          enabled: false,
          quarantine_id: "Tq0007"
        }
      }]
    });
  });

  it("reports bounded disposal residue and source state without exposing owner tokens", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Bd0001",
      "Cd0001"
    );
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, "Bd0001");
    tempDirs.push(lock.lockPath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(disposalPath));
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      "Bd0001",
      "Cd0001"
    );

    const report = await inspectAuditLockDisposals(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir
    );
    const text = renderAuditLockDisposalReport(report);
    const json = renderAuditLockDisposalReportJson(report);

    expect(report).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_lock_disposals",
        status: "warn",
        message: expect.stringContaining("requires manual review"),
        details: {
          enabled: true,
          file_path: filePath,
          coordination_lock_path: lock.lockPath,
          disposal_namespace_prefix: getJsonlAuditLockQuarantinePrefix(filePath),
          scan_limit: 4_096,
          scan_truncated: false,
          matched_entry_count: 1,
          result_limit: 128,
          result_truncated: false,
          disposals: [{
            quarantine_id: "Bd0001",
            quarantine_path: quarantinePath,
            source_quarantine_exists: false,
            disposal_id: "Cd0001",
            disposal_path: disposalPath,
            exists: true,
            entry_type: "directory",
            layout: "owner_only",
            root_entry_count: 1,
            owner_metadata_status: "valid",
            owner_pid: process.pid,
            owner_acquired_at: "2026-07-22T10:30:00.000Z",
            owner_fingerprint: ownerFingerprint
          }]
        }
      }]
    });
    expect(`${text}\n${json}`).toContain(ownerFingerprint);
    expect(`${text}\n${json}`).not.toContain(lock.ownerToken);
    expect((await fs.stat(disposalPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("projects bounded selected disposal child scans", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Bd1001";
    const disposalId = "Cd1001";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const overflowNames = ["overflow-secret-a", "overflow-secret-b"];
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.writeFile(
      getJsonlAuditLockOwnerPath(disposalPath),
      "invalid-owner\n",
      { mode: 0o600 }
    );
    await Promise.all(overflowNames.map((name) => fs.writeFile(
      path.join(disposalPath, name),
      "overflow\n",
      { mode: 0o600 }
    )));

    const report = await inspectAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const text = renderAuditTargetedLockDisposalReport(report);
    const json = renderAuditTargetedLockDisposalReportJson(report);

    expect(report).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_lock_disposal",
        status: "warn",
        details: {
          quarantine_id: quarantineId,
          disposal_id: disposalId,
          disposal: {
            disposal_path: disposalPath,
            exists: true,
            entry_type: "directory",
            layout: "unknown",
            root_entry_scan_count:
              MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
            root_entry_scan_limit:
              MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
            root_entry_scan_truncated: true
          }
        }
      }]
    });
    const disposal = report.checks[0]?.details.disposal;
    expect(disposal?.root_entry_count).toBeUndefined();
    expect(disposal?.owner_metadata_status).toBeUndefined();
    expect(disposal?.owner_fingerprint).toBeUndefined();
    expect(disposal?.empty_directory_fingerprint).toBeUndefined();
    expect(text).toContain("root_entry_scan_count: 2");
    expect(text).toContain("root_entry_scan_limit: 2");
    expect(text).toContain("root_entry_scan_truncated: true");
    for (const overflowName of overflowNames) {
      expect(text).not.toContain(overflowName);
      expect(json).not.toContain(overflowName);
    }
    expect(JSON.parse(json)).toEqual(report);
  });

  it("inspects one owner_only disposal directly without scanning or exposing the owner token", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });
    const quarantineId = "Td0001";
    const disposalId = "Te0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    tempDirs.push(lock.lockPath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(disposalPath));
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );

    const report = await inspectAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const text = renderAuditTargetedLockDisposalReport(report);
    const json = renderAuditTargetedLockDisposalReportJson(report);

    expect(report).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_lock_disposal",
        status: "warn",
        message: "selected disposal residue requires manual review",
        details: {
          enabled: true,
          file_path: filePath,
          coordination_lock_path: lock.lockPath,
          quarantine_id: quarantineId,
          disposal_id: disposalId,
          disposal: {
            quarantine_id: quarantineId,
            quarantine_path: quarantinePath,
            source_quarantine_exists: false,
            disposal_id: disposalId,
            disposal_path: disposalPath,
            exists: true,
            entry_type: "directory",
            layout: "owner_only",
            root_entry_count: 1,
            owner_metadata_status: "valid",
            owner_pid: process.pid,
            owner_acquired_at: "2026-07-22T10:30:00.000Z",
            owner_fingerprint: ownerFingerprint
          }
        }
      }]
    });
    expect(`${text}\n${json}`).toContain(ownerFingerprint);
    expect(`${text}\n${json}`).not.toContain(lock.ownerToken);
    expect((await fs.stat(disposalPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("withholds disposal inspect and cleanup fingerprints after selected owner rewrite", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Td0010";
    const disposalId = "Te0010";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const ownerPath = getJsonlAuditLockOwnerPath(disposalPath);
    const replacementToken = "00000000-0000-4000-8000-000000000013";
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const originalFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );

    const directRace = rewriteOwnerOnSecondDirectoryScan(
      disposalPath,
      ownerPath,
      replacementToken
    );
    const direct = await inspectAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const directOutput = `${renderAuditTargetedLockDisposalReport(direct)}\n${renderAuditTargetedLockDisposalReportJson(direct)}`;

    expect(directRace).toEqual({ selectedScans: 2, rewritten: true });
    expect(direct).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_lock_disposal",
        status: "warn",
        message: expect.stringContaining("uncertain or invalid state"),
        details: {
          quarantine_id: quarantineId,
          disposal_id: disposalId,
          disposal: {
            quarantine_id: quarantineId,
            source_quarantine_exists: false,
            disposal_id: disposalId,
            disposal_path: disposalPath,
            exists: true,
            entry_type: "directory",
            root_entry_count: 1,
            layout: "unknown",
            state_changed: true
          }
        }
      }]
    });
    expect(direct.checks[0]!.details.disposal!.owner_metadata_status)
      .toBeUndefined();
    expect(direct.checks[0]!.details.disposal!.owner_fingerprint)
      .toBeUndefined();
    for (const secret of [
      lock.ownerToken,
      replacementToken,
      originalFingerprint
    ]) {
      expect(directOutput).not.toContain(secret);
    }

    vi.restoreAllMocks();
    await fs.copyFile(lock.ownerPath, ownerPath);
    const cleanupRace = rewriteOwnerOnSecondDirectoryScan(
      disposalPath,
      ownerPath,
      replacementToken
    );
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const cleanup = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const cleanupOutput = `${renderAuditLockDisposalCleanupReport(cleanup)}\n${renderAuditLockDisposalCleanupReportJson(cleanup)}`;

    expect(cleanupRace).toEqual({ selectedScans: 2, rewritten: true });
    expect(cleanup).toMatchObject({
      ok: false,
      checks: [{
        name: "audit_lock_disposal_cleanup",
        status: "error",
        message: expect.stringContaining("only owner_only"),
        details: {
          quarantine_id: quarantineId,
          source_quarantine_exists: false,
          disposal_id: disposalId,
          disposal_path: disposalPath,
          disposal_exists: true,
          disposal_entry_type: "directory",
          disposal_layout: "unknown",
          state_changed: true,
          dry_run: true,
          confirmation_required: false,
          removed: false
        }
      }]
    });
    expect(cleanup.checks[0]!.details.owner_fingerprint).toBeUndefined();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    for (const secret of [
      lock.ownerToken,
      replacementToken,
      originalFingerprint
    ]) {
      expect(cleanupOutput).not.toContain(secret);
    }
    expect(JSON.parse(await fs.readFile(ownerPath, "utf8"))).toMatchObject({
      owner_token: replacementToken
    });

    vi.restoreAllMocks();
    await lock.release();
  });

  it("withholds disposal cleanup fingerprint after terminal owner file generation drift", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Td0013";
    const disposalId = "Te0013";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const ownerPath = getJsonlAuditLockOwnerPath(disposalPath);
    const replacementToken = "00000000-0000-4000-8000-000000000047";
    tempDirs.push(quarantinePath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const originalFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );
    const race = rewriteOwnerOnNthPathInspection(
      quarantinePath,
      ownerPath,
      replacementToken,
      2
    );
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");

    const cleanup = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const output = `${renderAuditLockDisposalCleanupReport(cleanup)}\n${renderAuditLockDisposalCleanupReportJson(cleanup)}`;

    expect(race).toEqual({ pathReads: 2, rewritten: true });
    expect(cleanup).toMatchObject({
      ok: false,
      checks: [{
        name: "audit_lock_disposal_cleanup",
        status: "error",
        message: expect.stringContaining("only owner_only"),
        details: {
          quarantine_id: quarantineId,
          quarantine_path: quarantinePath,
          source_quarantine_exists: false,
          disposal_id: disposalId,
          disposal_path: disposalPath,
          disposal_exists: true,
          disposal_entry_type: "directory",
          disposal_layout: "unknown",
          state_changed: true,
          dry_run: true,
          confirmation_required: false,
          removed: false
        }
      }]
    });
    expect(cleanup.checks[0]!.details.owner_fingerprint).toBeUndefined();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    for (const secret of [
      lock.ownerToken,
      replacementToken,
      originalFingerprint
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(JSON.parse(await fs.readFile(ownerPath, "utf8"))).toMatchObject({
      owner_token: replacementToken
    });

    vi.restoreAllMocks();
    await lock.release();
  });

  it("withholds owner disposal inspect and cleanup confirmation after late source appearance", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Td0011";
    const disposalId = "Te0011";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const ownerPath = getJsonlAuditLockOwnerPath(disposalPath);
    tempDirs.push(quarantinePath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );

    const directRace = createDirectoryOnSecondPathInspection(quarantinePath);
    const direct = await inspectAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const directOutput = `${renderAuditTargetedLockDisposalReport(direct)}\n${renderAuditTargetedLockDisposalReportJson(direct)}`;

    expect(directRace).toEqual({ pathReads: 2, created: true });
    expect(direct).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_lock_disposal",
        status: "warn",
        message: expect.stringContaining("uncertain or invalid state"),
        details: {
          quarantine_id: quarantineId,
          disposal_id: disposalId,
          disposal: {
            quarantine_id: quarantineId,
            quarantine_path: quarantinePath,
            source_quarantine_exists: true,
            source_quarantine_entry_type: "directory",
            source_quarantine_layout: "unknown",
            source_quarantine_state_changed: true,
            disposal_id: disposalId,
            disposal_path: disposalPath,
            exists: true,
            entry_type: "directory",
            root_entry_count: 1,
            layout: "unknown",
            state_changed: true
          }
        }
      }]
    });
    expect(direct.checks[0]!.details.disposal!.owner_metadata_status)
      .toBeUndefined();
    expect(direct.checks[0]!.details.disposal!.owner_fingerprint)
      .toBeUndefined();
    expect(directOutput).not.toContain(lock.ownerToken);
    expect(directOutput).not.toContain(ownerFingerprint);

    vi.restoreAllMocks();
    await fs.rm(quarantinePath, { recursive: true });
    const cleanupRace = createDirectoryOnSecondPathInspection(quarantinePath);
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const cleanup = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const cleanupOutput = `${renderAuditLockDisposalCleanupReport(cleanup)}\n${renderAuditLockDisposalCleanupReportJson(cleanup)}`;

    expect(cleanupRace).toEqual({ pathReads: 2, created: true });
    expect(cleanup).toMatchObject({
      ok: false,
      checks: [{
        name: "audit_lock_disposal_cleanup",
        status: "error",
        message: expect.stringContaining("source quarantine must be absent"),
        details: {
          quarantine_id: quarantineId,
          quarantine_path: quarantinePath,
          source_quarantine_exists: true,
          source_quarantine_entry_type: "directory",
          source_quarantine_layout: "unknown",
          source_quarantine_state_changed: true,
          disposal_id: disposalId,
          disposal_path: disposalPath,
          disposal_exists: true,
          disposal_entry_type: "directory",
          disposal_layout: "unknown",
          state_changed: true,
          dry_run: true,
          confirmation_required: false,
          removed: false
        }
      }]
    });
    expect(cleanup.checks[0]!.details.owner_fingerprint).toBeUndefined();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(cleanupOutput).not.toContain(lock.ownerToken);
    expect(cleanupOutput).not.toContain(ownerFingerprint);
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    expect(await fs.readFile(ownerPath, "utf8")).toBe(
      await fs.readFile(lock.ownerPath, "utf8")
    );

    vi.restoreAllMocks();
    await lock.release();
  });

  it("withholds empty disposal inspect and cleanup confirmation after late source appearance", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Td0012";
    const disposalId = "Te0012";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    tempDirs.push(quarantinePath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });

    const directRace = createDirectoryOnSecondPathInspection(quarantinePath);
    const direct = await inspectAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const directOutput = `${renderAuditTargetedLockDisposalReport(direct)}\n${renderAuditTargetedLockDisposalReportJson(direct)}`;

    expect(directRace).toEqual({ pathReads: 2, created: true });
    expect(direct).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_lock_disposal",
        status: "warn",
        message: expect.stringContaining("uncertain or invalid state"),
        details: {
          quarantine_id: quarantineId,
          disposal_id: disposalId,
          disposal: {
            quarantine_id: quarantineId,
            quarantine_path: quarantinePath,
            source_quarantine_exists: true,
            source_quarantine_entry_type: "directory",
            source_quarantine_layout: "unknown",
            source_quarantine_state_changed: true,
            disposal_id: disposalId,
            disposal_path: disposalPath,
            exists: true,
            entry_type: "directory",
            root_entry_count: 0,
            layout: "unknown",
            state_changed: true
          }
        }
      }]
    });
    expect(direct.checks[0]!.details.disposal!.empty_directory_fingerprint)
      .toBeUndefined();
    expect(directOutput).not.toContain("empty_directory_fingerprint");

    vi.restoreAllMocks();
    await fs.rm(quarantinePath, { recursive: true });
    const cleanupRace = createDirectoryOnSecondPathInspection(quarantinePath);
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const cleanup = await cleanupAuditEmptyLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const cleanupOutput = `${renderAuditEmptyLockDisposalCleanupReport(cleanup)}\n${renderAuditEmptyLockDisposalCleanupReportJson(cleanup)}`;

    expect(cleanupRace).toEqual({ pathReads: 2, created: true });
    expect(cleanup).toMatchObject({
      ok: false,
      checks: [{
        name: "audit_empty_lock_disposal_cleanup",
        status: "error",
        message: expect.stringContaining("source quarantine must be absent"),
        details: {
          quarantine_id: quarantineId,
          quarantine_path: quarantinePath,
          source_quarantine_exists: true,
          source_quarantine_entry_type: "directory",
          source_quarantine_layout: "unknown",
          source_quarantine_state_changed: true,
          disposal_id: disposalId,
          disposal_path: disposalPath,
          disposal_exists: true,
          disposal_entry_type: "directory",
          disposal_layout: "unknown",
          state_changed: true,
          dry_run: true,
          confirmation_required: false,
          removed: false
        }
      }]
    });
    expect(cleanup.checks[0]!.details.empty_directory_fingerprint)
      .toBeUndefined();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(cleanupOutput).not.toContain("empty_directory_fingerprint");
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    expect(await fs.readdir(disposalPath)).toEqual([]);
  });

  it("reports empty and missing targeted disposals without mutating either path", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Td0002";
    const disposalId = "Te0002";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });

    const empty = await inspectAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    expect(empty).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        details: {
          disposal: {
            exists: true,
            entry_type: "directory",
            layout: "empty",
            root_entry_count: 0,
            owner_metadata_status: "missing",
            empty_directory_fingerprint: expect.stringMatching(/^[0-9a-f]{32}$/)
          }
        }
      }]
    });
    expect((await fs.stat(disposalPath)).isDirectory()).toBe(true);

    const missing = await inspectAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      "Td0003",
      "Te0003"
    );
    expect(missing).toMatchObject({
      ok: true,
      checks: [{
        status: "ok",
        message: "selected disposal residue does not exist",
        details: {
          quarantine_id: "Td0003",
          disposal_id: "Te0003",
          disposal: {
            exists: false
          }
        }
      }]
    });
    expect(missing.checks[0]!.details.disposal?.state_changed).toBeUndefined();
    expect(renderAuditTargetedLockDisposalReportJson(missing)).not.toContain(
      "state_changed"
    );
  });

  it("warns for an uncertain targeted disposal and preserves unknown contents", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Td0004";
    const disposalId = "Te0004";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const unexpectedPath = path.join(disposalPath, "unexpected");
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.writeFile(unexpectedPath, "preserved", { mode: 0o600 });

    const report = await inspectAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );

    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("uncertain or invalid state"),
        details: {
          disposal: {
            exists: true,
            entry_type: "directory",
            layout: "unknown",
            root_entry_count: 1,
            owner_metadata_status: "missing"
          }
        }
      }]
    });
    expect(await fs.readFile(unexpectedPath, "utf8")).toBe("preserved");
  });

  it("skips targeted disposal inspection when audit persistence is disabled", async () => {
    const report = await inspectAuditLockDisposal(
      {},
      "/workspace",
      "Td0005",
      "Te0005"
    );

    expect(report).toEqual({
      ok: true,
      checks: [{
        name: "audit_lock_disposal",
        status: "warn",
        message: "skipped; persistence is disabled",
        details: {
          enabled: false,
          quarantine_id: "Td0005",
          disposal_id: "Te0005"
        }
      }]
    });
  });

  it("defaults owner_only disposal cleanup to dry run and requires exact confirmation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });
    const quarantineId = "Pd0001";
    const disposalId = "Pe0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    tempDirs.push(lock.lockPath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(disposalPath));
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );

    const dryRun = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const dryRunText = renderAuditLockDisposalCleanupReport(dryRun);
    const dryRunJson = renderAuditLockDisposalCleanupReportJson(dryRun);
    expect(dryRun).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_lock_disposal_cleanup",
        status: "warn",
        message: expect.stringContaining("dry run"),
        details: {
          quarantine_id: quarantineId,
          quarantine_path: quarantinePath,
          source_quarantine_exists: false,
          disposal_id: disposalId,
          disposal_path: disposalPath,
          disposal_exists: true,
          disposal_entry_type: "directory",
          disposal_layout: "owner_only",
          owner_metadata_status: "valid",
          owner_pid: process.pid,
          owner_acquired_at: "2026-07-22T10:30:00.000Z",
          owner_fingerprint: ownerFingerprint,
          dry_run: true,
          confirmation_required: true,
          liveness_verified: false,
          removed: false
        }
      }]
    });
    expect(`${dryRunText}\n${dryRunJson}`).not.toContain(lock.ownerToken);
    expect((await fs.stat(disposalPath)).isDirectory()).toBe(true);

    const mismatch = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId,
      { dryRun: false, expectedOwnerFingerprint: "0".repeat(32) }
    );
    expect(mismatch).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("does not match"),
        details: {
          owner_fingerprint_matches: false,
          removed: false
        }
      }]
    });
    expect(renderAuditLockDisposalCleanupReportJson(mismatch)).not.toContain(
      ownerFingerprint
    );
    expect((await fs.stat(disposalPath)).isDirectory()).toBe(true);

    const removed = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    expect(removed).toMatchObject({
      ok: true,
      checks: [{
        status: "ok",
        details: {
          source_quarantine_exists: false,
          disposal_exists: false,
          owner_fingerprint_matches: true,
          dry_run: false,
          removed: true
        }
      }]
    });
    await expect(fs.access(disposalPath)).rejects.toThrow();
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("withholds disposal existence when a post-commit residual remains present", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Yu0001";
    const disposalId = "Yu0002";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const extraPath = path.join(disposalPath, "unexpected");
    tempDirs.push(lock.lockPath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(disposalPath)
    );
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );
    const race = addEntryOnFirstDirectoryRemoval(disposalPath, extraPath);

    const report = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const details = report.checks[0]!.details;
    const output = `${renderAuditLockDisposalCleanupReport(report)}\n${renderAuditLockDisposalCleanupReportJson(report)}`;

    expect(race).toMatchObject({ injected: true });
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("could not be safely confirmed"),
        details: {
          removed: true,
          owner_fingerprint_matches: true,
          residual_disposal_path: disposalPath
        }
      }]
    });
    expect(details.disposal_exists).toBeUndefined();
    expect(output).not.toContain("disposal_exists");
    expect(output).not.toContain(lock.ownerToken);
    expect(await fs.readFile(extraPath, "utf8")).toBe("preserved");
    expect((await fs.stat(disposalPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("withholds disposal existence when a post-commit residual locator is missing", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Yu0003";
    const disposalId = "Yu0004";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const movedDisposalPath = `${disposalPath}.phase574-detached`;
    tempDirs.push(lock.lockPath, disposalPath, movedDisposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(disposalPath)
    );
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );
    const race = replaceDirectoryOnFirstRemoval(
      disposalPath,
      movedDisposalPath
    );

    const report = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const details = report.checks[0]!.details;
    const output = `${renderAuditLockDisposalCleanupReport(report)}\n${renderAuditLockDisposalCleanupReportJson(report)}`;

    expect(race).toMatchObject({ replaced: true });
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("could not be safely confirmed"),
        details: {
          removed: true,
          owner_fingerprint_matches: true,
          residual_disposal_path: disposalPath
        }
      }]
    });
    expect(details.disposal_exists).toBeUndefined();
    expect(output).not.toContain("disposal_exists");
    expect(output).not.toContain(lock.ownerToken);
    await expect(fs.access(disposalPath)).rejects.toThrow();
    expect(await fs.readdir(movedDisposalPath)).toEqual([]);
    await lock.release();
  });

  it("refuses disposal cleanup for source-present, non-owner-only, and invalid states", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const sourcePath = getJsonlAuditLockQuarantinePath(filePath, "Pd0002");
    const sourceDisposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Pd0002",
      "Pe0002"
    );
    const emptyPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Pd0003",
      "Pe0003"
    );
    const unknownPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Pd0004",
      "Pe0004"
    );
    const blockerPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Pd0005",
      "Pe0005"
    );
    const invalidOwnerPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Pd0006",
      "Pe0006"
    );
    tempDirs.push(
      lock.lockPath,
      sourcePath,
      sourceDisposalPath,
      emptyPath,
      unknownPath,
      blockerPath,
      invalidOwnerPath
    );
    await fs.mkdir(sourcePath, { mode: 0o700 });
    await fs.mkdir(sourceDisposalPath, { mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(sourceDisposalPath)
    );
    await fs.mkdir(emptyPath, { mode: 0o700 });
    await fs.mkdir(unknownPath, { mode: 0o700 });
    await fs.writeFile(path.join(unknownPath, "unexpected"), "preserved", {
      mode: 0o600
    });
    await fs.writeFile(blockerPath, "blocker", { mode: 0o600 });
    await fs.mkdir(invalidOwnerPath, { mode: 0o700 });
    await fs.writeFile(
      getJsonlAuditLockOwnerPath(invalidOwnerPath),
      "invalid",
      { mode: 0o600 }
    );

    const sourcePresent = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      "Pd0002",
      "Pe0002"
    );
    expect(sourcePresent).toMatchObject({
      ok: false,
      checks: [{
        message: expect.stringContaining("source quarantine must be absent"),
        details: {
          source_quarantine_exists: true,
          disposal_layout: "owner_only",
          removed: false
        }
      }]
    });

    for (const [quarantineId, disposalId, expectedLayout] of [
      ["Pd0003", "Pe0003", "empty"],
      ["Pd0004", "Pe0004", "unknown"],
      ["Pd0005", "Pe0005", undefined]
    ] as const) {
      const report = await cleanupAuditLockDisposal(
        { GOD_CODE_AUDIT_FILE: filePath },
        dir,
        quarantineId,
        disposalId
      );
      expect(report).toMatchObject({
        ok: false,
        checks: [{
          message: expect.stringContaining("only owner_only"),
          details: {
            disposal_layout: expectedLayout,
            removed: false
          }
        }]
      });
    }

    const invalidOwner = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      "Pd0006",
      "Pe0006"
    );
    expect(invalidOwner).toMatchObject({
      ok: false,
      checks: [{
        message: expect.stringContaining("valid root owner metadata"),
        details: {
          disposal_layout: "owner_only",
          owner_metadata_status: "invalid",
          removed: false
        }
      }]
    });
    expect(await fs.readFile(path.join(unknownPath, "unexpected"), "utf8")).toBe("preserved");
    expect(await fs.readFile(blockerPath, "utf8")).toBe("blocker");
    await lock.release();
  });

  it("defaults empty disposal cleanup to dry run and requires exact directory confirmation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Xd0001";
    const disposalId = "Xe0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });

    const dryRun = await cleanupAuditEmptyLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const dryRunText = renderAuditEmptyLockDisposalCleanupReport(dryRun);
    const dryRunJson = renderAuditEmptyLockDisposalCleanupReportJson(dryRun);
    const disposalFingerprint = dryRun.checks[0]!.details
      .empty_directory_fingerprint!;
    expect(disposalFingerprint).toMatch(/^[0-9a-f]{32}$/u);
    expect(dryRun).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_empty_lock_disposal_cleanup",
        status: "warn",
        message: expect.stringContaining("dry run"),
        details: {
          quarantine_id: quarantineId,
          quarantine_path: quarantinePath,
          source_quarantine_exists: false,
          disposal_id: disposalId,
          disposal_path: disposalPath,
          disposal_exists: true,
          disposal_entry_type: "directory",
          disposal_layout: "empty",
          empty_directory_fingerprint: disposalFingerprint,
          dry_run: true,
          confirmation_required: true,
          liveness_verified: false,
          removed: false
        }
      }]
    });
    expect(`${dryRunText}\n${dryRunJson}`).toContain(disposalFingerprint);
    expect((await fs.stat(disposalPath)).isDirectory()).toBe(true);

    const mismatch = await cleanupAuditEmptyLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId,
      { dryRun: false, expectedDisposalFingerprint: "0".repeat(32) }
    );
    expect(mismatch).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("does not match"),
        details: {
          disposal_fingerprint_matches: false,
          removed: false
        }
      }]
    });
    expect(renderAuditEmptyLockDisposalCleanupReportJson(mismatch)).not.toContain(
      disposalFingerprint
    );
    expect((await fs.stat(disposalPath)).isDirectory()).toBe(true);

    const removed = await cleanupAuditEmptyLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId,
      { dryRun: false, expectedDisposalFingerprint: disposalFingerprint }
    );
    expect(removed).toMatchObject({
      ok: true,
      checks: [{
        status: "ok",
        details: {
          source_quarantine_exists: false,
          disposal_exists: false,
          disposal_fingerprint_matches: true,
          dry_run: false,
          removed: true
        }
      }]
    });
    await expect(fs.access(disposalPath)).rejects.toThrow();
  });

  it("refuses empty disposal cleanup for source-present and non-empty states", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const sourcePath = getJsonlAuditLockQuarantinePath(filePath, "Xd0002");
    const sourceDisposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Xd0002",
      "Xe0002"
    );
    const ownerOnlyPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Xd0003",
      "Xe0003"
    );
    const unknownPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Xd0004",
      "Xe0004"
    );
    const blockerPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Xd0005",
      "Xe0005"
    );
    tempDirs.push(
      lock.lockPath,
      sourcePath,
      sourceDisposalPath,
      ownerOnlyPath,
      unknownPath,
      blockerPath
    );
    await fs.mkdir(sourcePath, { mode: 0o700 });
    await fs.mkdir(sourceDisposalPath, { mode: 0o700 });
    await fs.mkdir(ownerOnlyPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(ownerOnlyPath));
    await fs.mkdir(unknownPath, { mode: 0o700 });
    await fs.writeFile(path.join(unknownPath, "unexpected"), "preserved", {
      mode: 0o600
    });
    await fs.writeFile(blockerPath, "blocker", { mode: 0o600 });

    const sourcePresent = await cleanupAuditEmptyLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      "Xd0002",
      "Xe0002"
    );
    expect(sourcePresent).toMatchObject({
      ok: false,
      checks: [{
        message: expect.stringContaining("source quarantine must be absent"),
        details: {
          source_quarantine_exists: true,
          disposal_layout: "empty",
          removed: false
        }
      }]
    });

    for (const [quarantineId, disposalId, expectedLayout] of [
      ["Xd0003", "Xe0003", "owner_only"],
      ["Xd0004", "Xe0004", "unknown"],
      ["Xd0005", "Xe0005", undefined]
    ] as const) {
      const report = await cleanupAuditEmptyLockDisposal(
        { GOD_CODE_AUDIT_FILE: filePath },
        dir,
        quarantineId,
        disposalId
      );
      expect(report).toMatchObject({
        ok: false,
        checks: [{
          message: expect.stringContaining("exact empty directory"),
          details: {
            disposal_layout: expectedLayout,
            removed: false
          }
        }]
      });
    }
    expect(await fs.readFile(path.join(unknownPath, "unexpected"), "utf8")).toBe("preserved");
    expect(await fs.readFile(blockerPath, "utf8")).toBe("blocker");
    await lock.release();
  });

  it("defaults empty quarantine cleanup to dry run and requires exact directory confirmation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Xq0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });

    const direct = await inspectAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const quarantineFingerprint = direct.checks[0]!.details.quarantine!
      .empty_directory_fingerprint!;
    expect(quarantineFingerprint).toMatch(/^[0-9a-f]{32}$/u);

    const dryRun = await cleanupAuditEmptyLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const dryRunText = renderAuditEmptyLockQuarantineCleanupReport(dryRun);
    const dryRunJson = renderAuditEmptyLockQuarantineCleanupReportJson(dryRun);
    expect(dryRun).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_empty_lock_quarantine_cleanup",
        status: "warn",
        message: expect.stringContaining("dry run"),
        details: {
          quarantine_id: quarantineId,
          quarantine_path: quarantinePath,
          quarantine_exists: true,
          quarantine_entry_type: "directory",
          quarantine_layout: "empty",
          empty_directory_fingerprint: quarantineFingerprint,
          dry_run: true,
          confirmation_required: true,
          liveness_verified: false,
          removed: false
        }
      }]
    });
    expect(`${dryRunText}\n${dryRunJson}`).toContain(quarantineFingerprint);
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);

    const mismatch = await cleanupAuditEmptyLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedQuarantineFingerprint: "0".repeat(32) }
    );
    expect(mismatch).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("does not match"),
        details: {
          quarantine_fingerprint_matches: false,
          removed: false
        }
      }]
    });
    expect(renderAuditEmptyLockQuarantineCleanupReportJson(mismatch)).not.toContain(
      quarantineFingerprint
    );
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);

    const removed = await cleanupAuditEmptyLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedQuarantineFingerprint: quarantineFingerprint }
    );
    expect(removed).toMatchObject({
      ok: true,
      checks: [{
        status: "ok",
        message: expect.stringContaining("descriptor-bound"),
        details: {
          quarantine_exists: false,
          quarantine_fingerprint_matches: true,
          dry_run: false,
          removed: true
        }
      }]
    });
    await expect(fs.access(quarantinePath)).rejects.toThrow();
  });

  it("preserves empty quarantine cleanup when a transient assertion close fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Xq0010";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    const quarantineFingerprint = await requireQuarantineEmptyDirectoryFingerprint(
      filePath,
      quarantineId
    );
    const closeFailure = injectAuditMaintenanceHandleCloseFailure(
      quarantinePath,
      4,
      "CLI transient assertion close failure"
    );

    const report = await cleanupAuditEmptyLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedQuarantineFingerprint: quarantineFingerprint }
    );
    await closeFailure.closeCompletion;
    const output = `${renderAuditEmptyLockQuarantineCleanupReport(report)}\n${renderAuditEmptyLockQuarantineCleanupReportJson(report)}`;

    expect(closeFailure.selectedOpenCount).toBeGreaterThanOrEqual(4);
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("descriptor finalization"),
        details: {
          quarantine_exists: false,
          quarantine_fingerprint_matches: true,
          removed: true,
          cleanup_handles_closed: false,
          cleanup_handle_warning: expect.stringContaining(
            "CLI transient assertion close failure"
          )
        }
      }]
    });
    expect(output).toContain("cleanup_handles_closed");
    expect(output).toContain("cleanup_handle_warning");
    await expect(fs.access(quarantinePath)).rejects.toThrow();
  });

  it("refuses empty quarantine cleanup for owner, pre-commit, unknown, and non-directory states", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerOnlyPath = getJsonlAuditLockQuarantinePath(filePath, "Xq0002");
    const preCommitPath = getJsonlAuditLockQuarantinePath(filePath, "Xq0003");
    const nestedLockPath = path.join(preCommitPath, "lock");
    const unknownPath = getJsonlAuditLockQuarantinePath(filePath, "Xq0004");
    const blockerPath = getJsonlAuditLockQuarantinePath(filePath, "Xq0005");
    const unexpectedPath = path.join(unknownPath, "unexpected");
    tempDirs.push(
      lock.lockPath,
      ownerOnlyPath,
      preCommitPath,
      unknownPath,
      blockerPath
    );
    await fs.mkdir(ownerOnlyPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(ownerOnlyPath));
    await fs.mkdir(nestedLockPath, { recursive: true, mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(nestedLockPath));
    await fs.mkdir(unknownPath, { mode: 0o700 });
    await fs.writeFile(unexpectedPath, "preserved", { mode: 0o600 });
    await fs.writeFile(blockerPath, "blocker", { mode: 0o600 });

    for (const [quarantineId, expectedLayout] of [
      ["Xq0002", "owner_only"],
      ["Xq0003", "lock_with_owner"],
      ["Xq0004", "unknown"],
      ["Xq0005", undefined]
    ] as const) {
      const report = await cleanupAuditEmptyLockQuarantine(
        { GOD_CODE_AUDIT_FILE: filePath },
        dir,
        quarantineId
      );
      expect(report).toMatchObject({
        ok: false,
        checks: [{
          message: expect.stringContaining("exact empty directory"),
          details: {
            quarantine_layout: expectedLayout,
            removed: false
          }
        }]
      });
    }
    expect(await fs.readFile(unexpectedPath, "utf8")).toBe("preserved");
    expect(await fs.readFile(blockerPath, "utf8")).toBe("blocker");
    await lock.release();
  });

  it("reports missing empty quarantine cleanup and rejects disabled persistence", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const missing = await cleanupAuditEmptyLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      "Xq0006"
    );
    expect(missing).toMatchObject({
      ok: true,
      checks: [{
        status: "ok",
        details: {
          quarantine_exists: false,
          removed: false
        }
      }]
    });

    const disabled = await cleanupAuditEmptyLockQuarantine(
      {},
      dir,
      "Xq0007"
    );
    expect(disabled).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("persistence is disabled"),
        details: {
          enabled: false,
          removed: false
        }
      }]
    });
  });

  it("defaults owner_only quarantine cleanup to dry run and requires exact confirmation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });
    const quarantineId = "Qc0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(quarantinePath));
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    const dryRun = await cleanupAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const dryRunText = renderAuditLockQuarantineCleanupReport(dryRun);
    const dryRunJson = renderAuditLockQuarantineCleanupReportJson(dryRun);
    expect(dryRun).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("dry run"),
        details: {
          quarantine_id: quarantineId,
          quarantine_path: quarantinePath,
          quarantine_exists: true,
          quarantine_entry_type: "directory",
          quarantine_layout: "owner_only",
          owner_location: "root",
          owner_metadata_status: "valid",
          owner_pid: process.pid,
          owner_acquired_at: "2026-07-22T10:30:00.000Z",
          owner_fingerprint: ownerFingerprint,
          dry_run: true,
          confirmation_required: true,
          liveness_verified: false,
          removed: false
        }
      }]
    });
    expect(`${dryRunText}\n${dryRunJson}`).not.toContain(lock.ownerToken);
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);

    const mismatch = await cleanupAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: "0".repeat(32) }
    );
    expect(mismatch).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("does not match"),
        details: {
          owner_fingerprint_matches: false,
          removed: false
        }
      }]
    });
    expect(renderAuditLockQuarantineCleanupReportJson(mismatch)).not.toContain(
      ownerFingerprint
    );
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);

    const removed = await cleanupAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    expect(removed).toMatchObject({
      ok: true,
      checks: [{
        status: "ok",
        details: {
          quarantine_exists: false,
          owner_fingerprint_matches: true,
          dry_run: false,
          removed: true
        }
      }]
    });
    await expect(fs.access(quarantinePath)).rejects.toThrow();
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("reports quarantine target absence when private disposal contraction leaves a residual", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Yc0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const disposalPrefix = `${quarantinePath}.dispose-`;
    const disposalParent = path.dirname(disposalPrefix);
    const disposalNamePrefix = path.basename(disposalPrefix);
    const originalRmdir = fs.rmdir.bind(fs);
    let detachedRoot = "";
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(quarantinePath)
    );
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      const targetPath = String(target);
      const targetName = path.basename(targetPath);
      if (
        detachedRoot.length === 0
        && targetName.startsWith(disposalNamePrefix)
      ) {
        const logicalTargetPath = path.join(disposalParent, targetName);
        detachedRoot = `${logicalTargetPath}.phase573-detached`;
        tempDirs.push(logicalTargetPath, detachedRoot);
        await fs.rename(logicalTargetPath, detachedRoot);
        await fs.mkdir(logicalTargetPath, { mode: 0o700 });
        await originalRmdir(targetPath);
        return;
      }
      await originalRmdir(target, options);
    });

    const report = await cleanupAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const output = `${renderAuditLockQuarantineCleanupReport(report)}\n${renderAuditLockQuarantineCleanupReportJson(report)}`;

    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("disposal residue"),
        details: {
          quarantine_exists: false,
          owner_fingerprint_matches: true,
          removed: true,
          residual_disposal_path: expect.stringContaining(
            disposalNamePrefix
          )
        }
      }]
    });
    expect(detachedRoot).not.toBe("");
    expect(output).not.toContain(lock.ownerToken);
    await expect(fs.access(quarantinePath)).rejects.toThrow();
    await expect(fs.access(
      report.checks[0]!.details.residual_disposal_path!
    )).rejects.toThrow();
    expect(await fs.readdir(detachedRoot)).toEqual([]);
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("refuses quarantine cleanup for every non-owner-only or invalid state", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const lockWithOwnerPath = getJsonlAuditLockQuarantinePath(filePath, "Qc0002");
    const lockAndOwnerPath = getJsonlAuditLockQuarantinePath(filePath, "Qc0003");
    const emptyPath = getJsonlAuditLockQuarantinePath(filePath, "Qc0004");
    const unknownPath = getJsonlAuditLockQuarantinePath(filePath, "Qc0005");
    const blockerPath = getJsonlAuditLockQuarantinePath(filePath, "Qc0006");
    const invalidOwnerPath = getJsonlAuditLockQuarantinePath(filePath, "Qc0007");
    tempDirs.push(
      lock.lockPath,
      lockWithOwnerPath,
      lockAndOwnerPath,
      emptyPath,
      unknownPath,
      blockerPath,
      invalidOwnerPath
    );
    await fs.mkdir(path.join(lockWithOwnerPath, "lock"), {
      recursive: true,
      mode: 0o700
    });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(path.join(lockWithOwnerPath, "lock"))
    );
    await fs.mkdir(path.join(lockAndOwnerPath, "lock"), {
      recursive: true,
      mode: 0o700
    });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(lockAndOwnerPath)
    );
    await fs.mkdir(emptyPath, { mode: 0o700 });
    await fs.mkdir(unknownPath, { mode: 0o700 });
    await fs.writeFile(path.join(unknownPath, "unexpected"), "preserved", {
      mode: 0o600
    });
    await fs.writeFile(blockerPath, "blocker", { mode: 0o600 });
    await fs.mkdir(invalidOwnerPath, { mode: 0o700 });
    await fs.writeFile(
      getJsonlAuditLockOwnerPath(invalidOwnerPath),
      "invalid",
      { mode: 0o600 }
    );

    for (const [quarantineId, expectedLayout] of [
      ["Qc0002", "lock_with_owner"],
      ["Qc0003", "lock_and_owner"],
      ["Qc0004", "empty"],
      ["Qc0005", "unknown"],
      ["Qc0006", undefined]
    ] as const) {
      const report = await cleanupAuditLockQuarantine(
        { GOD_CODE_AUDIT_FILE: filePath },
        dir,
        quarantineId
      );
      expect(report).toMatchObject({
        ok: false,
        checks: [{
          status: "error",
          message: expect.stringContaining("only owner_only"),
          details: {
            quarantine_layout: expectedLayout,
            removed: false
          }
        }]
      });
    }
    const invalidOwner = await cleanupAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      "Qc0007"
    );
    expect(invalidOwner).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("valid root owner metadata"),
        details: {
          quarantine_layout: "owner_only",
          owner_metadata_status: "invalid",
          removed: false
        }
      }]
    });
    expect(await fs.readFile(path.join(unknownPath, "unexpected"), "utf8")).toBe("preserved");
    expect(await fs.readFile(blockerPath, "utf8")).toBe("blocker");
    await lock.release();
  });

  it("defaults pre-commit quarantine recovery to dry run and requires exact confirmation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });
    const quarantineId = "Qr0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    const dryRun = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const dryRunText = renderAuditLockQuarantineRecoveryReport(dryRun);
    const dryRunJson = renderAuditLockQuarantineRecoveryReportJson(dryRun);
    expect(dryRun).toMatchObject({
      ok: true,
      checks: [{
        name: "audit_lock_quarantine_recovery",
        status: "warn",
        message: expect.stringContaining("dry run"),
        details: {
          coordination_lock_path: lock.lockPath,
          coordination_lock_exists: false,
          coordination_lock_acquirable: true,
          quarantine_id: quarantineId,
          quarantine_path: quarantinePath,
          quarantine_exists: true,
          quarantine_entry_type: "directory",
          quarantine_layout: "lock_with_owner",
          owner_location: "lock",
          owner_metadata_status: "valid",
          owner_pid: process.pid,
          owner_acquired_at: "2026-07-22T10:30:00.000Z",
          owner_fingerprint: ownerFingerprint,
          dry_run: true,
          confirmation_required: true,
          liveness_verified: false,
          recovered: false
        }
      }]
    });
    expect(`${dryRunText}\n${dryRunJson}`).not.toContain(lock.ownerToken);
    await expect(fs.access(lock.lockPath)).rejects.toThrow();

    const mismatch = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: "0".repeat(32) }
    );
    expect(mismatch).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("does not match"),
        details: {
          owner_fingerprint_matches: false,
          recovered: false
        }
      }]
    });
    expect(renderAuditLockQuarantineRecoveryReportJson(mismatch)).not.toContain(
      ownerFingerprint
    );
    await expect(fs.access(lock.lockPath)).rejects.toThrow();

    const recovered = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    expect(recovered).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("use cleanup-lock separately"),
        details: {
          coordination_lock_exists: true,
          coordination_lock_entry_type: "directory",
          coordination_lock_acquirable: false,
          coordination_lock_owner_metadata_status: "valid",
          quarantine_exists: false,
          quarantine_layout: "lock_with_owner",
          owner_fingerprint_matches: true,
          dry_run: false,
          liveness_verified: false,
          recovered: true,
          recovery_handles_closed: true
        }
      }]
    });
    expect(renderAuditLockQuarantineRecoveryReportJson(recovered)).not.toContain(
      lock.ownerToken
    );
    await expect(fs.access(quarantinePath)).rejects.toThrow();
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    const activeOwnerFingerprint = await requireActiveLockOwnerFingerprint(
      filePath
    );
    expect(activeOwnerFingerprint).not.toBe(ownerFingerprint);

    const cleanup = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: activeOwnerFingerprint }
    );
    expect(cleanup).toMatchObject({
      ok: true,
      checks: [{ details: { removed: true } }]
    });
  });

  it("preserves successful quarantine recovery evidence when descriptor finalization fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Qf0576";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const closeFailure = injectAuditMaintenanceHandleCloseFailure(
      quarantinePath,
      2,
      "injected CLI quarantine recovery handle close failure"
    );

    const report = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    await closeFailure.closeCompletion;
    const output = `${renderAuditLockQuarantineRecoveryReport(report)}\n${renderAuditLockQuarantineRecoveryReportJson(report)}`;

    expect(closeFailure.selectedOpenCount).toBeGreaterThanOrEqual(2);
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("descriptor finalization"),
        details: {
          coordination_lock_exists: true,
          coordination_lock_entry_type: "directory",
          coordination_lock_acquirable: false,
          quarantine_exists: false,
          owner_fingerprint: ownerFingerprint,
          owner_fingerprint_matches: true,
          recovered: true,
          recovery_handles_closed: false,
          recovery_handle_warning: expect.stringContaining(
            "injected CLI quarantine recovery handle close failure"
          )
        }
      }]
    });
    expect(output).toContain("recovery_handles_closed");
    expect(output).toContain("recovery_handle_warning");
    expect(output).not.toContain(lock.ownerToken);
    await expect(fs.access(quarantinePath)).rejects.toThrow();
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);

    const activeOwnerFingerprint = await requireActiveLockOwnerFingerprint(
      filePath
    );
    const cleanup = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: activeOwnerFingerprint }
    );
    expect(cleanup).toMatchObject({
      ok: true,
      checks: [{ details: { removed: true } }]
    });
  });

  it("projects descriptor finalization evidence for rejected quarantine recovery", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Qf1771";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const closeFailure = injectAuditMaintenanceHandleCloseFailure(
      quarantinePath,
      2,
      "rejected CLI quarantine recovery handle close failure"
    );
    const originalMkdir = fs.mkdir.bind(fs);
    vi.spyOn(fs, "mkdir").mockImplementation(async (target, options) => {
      if (path.basename(String(target)) === path.basename(lock.lockPath)) {
        throw new Error("primary CLI quarantine recovery failure");
      }
      await originalMkdir(target, options);
    });

    const report = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    await closeFailure.closeCompletion;
    const output = `${renderAuditLockQuarantineRecoveryReport(report)}\n${renderAuditLockQuarantineRecoveryReportJson(report)}`;

    expect(closeFailure.selectedOpenCount).toBeGreaterThanOrEqual(2);
    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: "primary CLI quarantine recovery failure",
        details: {
          coordination_lock_exists: false,
          quarantine_exists: true,
          recovered: false,
          recovery_handles_closed: false,
          recovery_handle_warning: expect.stringContaining(
            "rejected CLI quarantine recovery handle close failure"
          )
        }
      }]
    });
    expect(output).toContain("recovery_handles_closed");
    expect(output).toContain("recovery_handle_warning");
    expect(output).not.toContain(lock.ownerToken);
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect(await fs.readdir(nestedLockPath)).toEqual(["owner.json"]);
  });

  it("withholds quarantine existence when a recovery residual remains present", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Yv0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const nestedLockPath = path.join(quarantinePath, "lock");
    const extraPath = path.join(nestedLockPath, "unexpected");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const race = addEntryOnFirstDirectoryRemoval(nestedLockPath, extraPath);

    const report = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const details = report.checks[0]!.details;
    const output = `${renderAuditLockQuarantineRecoveryReport(report)}\n${renderAuditLockQuarantineRecoveryReportJson(report)}`;

    expect(race).toMatchObject({ injected: true });
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("could not be safely confirmed"),
        details: {
          coordination_lock_exists: true,
          recovered: true,
          owner_fingerprint_matches: true,
          residual_quarantine_path: quarantinePath
        }
      }]
    });
    expect(details.quarantine_exists).toBeUndefined();
    expect(output).not.toContain("quarantine_exists");
    expect(output).not.toContain(lock.ownerToken);
    expect(await fs.readFile(extraPath, "utf8")).toBe("preserved");
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);

    const activeFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    await expect(cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: activeFingerprint }
    )).resolves.toMatchObject({
      ok: true,
      checks: [{ details: { removed: true } }]
    });
  });

  it("withholds quarantine existence when a recovery residual locator is missing", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Yv0002";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const nestedLockPath = path.join(quarantinePath, "lock");
    const movedQuarantinePath = `${quarantinePath}.phase574-detached`;
    tempDirs.push(lock.lockPath, quarantinePath, movedQuarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const race = replaceDirectoryOnFirstRemoval(
      quarantinePath,
      movedQuarantinePath
    );

    const report = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const details = report.checks[0]!.details;
    const output = `${renderAuditLockQuarantineRecoveryReport(report)}\n${renderAuditLockQuarantineRecoveryReportJson(report)}`;

    expect(race).toMatchObject({ replaced: true });
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("could not be safely confirmed"),
        details: {
          coordination_lock_exists: true,
          recovered: true,
          owner_fingerprint_matches: true,
          residual_quarantine_path: quarantinePath
        }
      }]
    });
    expect(details.quarantine_exists).toBeUndefined();
    expect(output).not.toContain("quarantine_exists");
    expect(output).not.toContain(lock.ownerToken);
    await expect(fs.access(quarantinePath)).rejects.toThrow();
    expect(await fs.readdir(movedQuarantinePath)).toEqual([]);
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);

    const activeFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    await expect(cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: activeFingerprint }
    )).resolves.toMatchObject({
      ok: true,
      checks: [{ details: { removed: true } }]
    });
  });

  it("recovers lock_and_owner quarantine layout", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Qr0002";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    await fs.rename(
      getJsonlAuditLockOwnerPath(nestedLockPath),
      getJsonlAuditLockOwnerPath(quarantinePath)
    );
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    const report = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );

    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        details: {
          quarantine_layout: "lock_and_owner",
          owner_location: "root",
          owner_fingerprint_matches: true,
          recovered: true
        }
      }]
    });
    await expect(fs.access(quarantinePath)).rejects.toThrow();
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    const activeOwnerFingerprint = await requireActiveLockOwnerFingerprint(
      filePath
    );
    expect(activeOwnerFingerprint).not.toBe(ownerFingerprint);
    await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: activeOwnerFingerprint }
    );
  });

  it("refuses quarantine recovery for occupied, post-commit, empty, unknown, and invalid states", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const occupiedPath = getJsonlAuditLockQuarantinePath(filePath, "Qr0003");
    const ownerOnlyPath = getJsonlAuditLockQuarantinePath(filePath, "Qr0004");
    const emptyPath = getJsonlAuditLockQuarantinePath(filePath, "Qr0005");
    const unknownPath = getJsonlAuditLockQuarantinePath(filePath, "Qr0006");
    const blockerPath = getJsonlAuditLockQuarantinePath(filePath, "Qr0007");
    const invalidOwnerPath = getJsonlAuditLockQuarantinePath(filePath, "Qr0008");
    tempDirs.push(
      lock.lockPath,
      occupiedPath,
      ownerOnlyPath,
      emptyPath,
      unknownPath,
      blockerPath,
      invalidOwnerPath
    );
    await fs.mkdir(path.join(occupiedPath, "lock"), {
      recursive: true,
      mode: 0o700
    });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(path.join(occupiedPath, "lock"))
    );
    await fs.mkdir(ownerOnlyPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(ownerOnlyPath));
    await fs.mkdir(emptyPath, { mode: 0o700 });
    await fs.mkdir(unknownPath, { mode: 0o700 });
    await fs.writeFile(path.join(unknownPath, "unexpected"), "preserved", {
      mode: 0o600
    });
    await fs.writeFile(blockerPath, "blocker", { mode: 0o600 });
    await fs.mkdir(path.join(invalidOwnerPath, "lock"), {
      recursive: true,
      mode: 0o700
    });
    await fs.writeFile(
      getJsonlAuditLockOwnerPath(path.join(invalidOwnerPath, "lock")),
      "invalid",
      { mode: 0o600 }
    );

    const occupied = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      "Qr0003"
    );
    expect(occupied).toMatchObject({
      ok: false,
      checks: [{
        message: expect.stringContaining("coordination lock entry already exists"),
        details: {
          coordination_lock_exists: true,
          quarantine_layout: "lock_with_owner",
          recovered: false
        }
      }]
    });

    for (const [quarantineId, expectedLayout] of [
      ["Qr0004", "owner_only"],
      ["Qr0005", "empty"],
      ["Qr0006", "unknown"],
      ["Qr0007", undefined]
    ] as const) {
      const report = await recoverAuditLockQuarantine(
        { GOD_CODE_AUDIT_FILE: filePath },
        dir,
        quarantineId
      );
      expect(report).toMatchObject({
        ok: false,
        checks: [{
          message: expect.stringContaining("only lock_with_owner or lock_and_owner"),
          details: {
            quarantine_layout: expectedLayout,
            recovered: false
          }
        }]
      });
    }

    const invalidOwner = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      "Qr0008"
    );
    expect(invalidOwner).toMatchObject({
      ok: false,
      checks: [{
        message: expect.stringContaining("valid layout-selected owner metadata"),
        details: {
          quarantine_layout: "lock_with_owner",
          owner_metadata_status: "invalid",
          recovered: false
        }
      }]
    });
    expect(await fs.readFile(path.join(unknownPath, "unexpected"), "utf8")).toBe("preserved");
    expect(await fs.readFile(blockerPath, "utf8")).toBe("blocker");
    await lock.release();
  });

  it("rejects active cleanup when a copied candidate replaced the dry-run object", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const movedLockPath = `${lock.lockPath}.phase571-original`;
    tempDirs.push(lock.lockPath, movedLockPath);
    const dryRun = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir
    );
    const ownerFingerprint = dryRun.checks[0]?.details
      .coordination_lock_owner_fingerprint;
    if (ownerFingerprint === undefined) {
      throw new Error("Expected an active cleanup dry-run fingerprint.");
    }

    await fs.rename(lock.lockPath, movedLockPath);
    await fs.mkdir(lock.lockPath, { mode: 0o700 });
    await fs.copyFile(
      getJsonlAuditLockOwnerPath(movedLockPath),
      getJsonlAuditLockOwnerPath(lock.lockPath)
    );
    const replacementFingerprint = await requireActiveLockOwnerFingerprint(
      filePath
    );
    expect(replacementFingerprint).not.toBe(ownerFingerprint);

    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const report = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const output = `${renderAuditLockCleanupReport(report)}\n${renderAuditLockCleanupReportJson(report)}`;

    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("does not match"),
        details: {
          owner_fingerprint_matches: false,
          removed: false
        }
      }]
    });
    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(output).not.toContain(lock.ownerToken);
    expect(output).not.toContain(replacementFingerprint);
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    expect((await fs.stat(movedLockPath)).isDirectory()).toBe(true);
  });

  it("rejects quarantine cleanup when a copied candidate replaced the dry-run object", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Vq1001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const movedQuarantinePath = `${quarantinePath}.phase571-original`;
    tempDirs.push(lock.lockPath, quarantinePath, movedQuarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(quarantinePath)
    );
    const dryRun = await cleanupAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const ownerFingerprint = dryRun.checks[0]?.details.owner_fingerprint;
    if (ownerFingerprint === undefined) {
      throw new Error("Expected a quarantine cleanup dry-run fingerprint.");
    }

    await fs.rename(quarantinePath, movedQuarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(
      getJsonlAuditLockOwnerPath(movedQuarantinePath),
      getJsonlAuditLockOwnerPath(quarantinePath)
    );
    const replacementFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    expect(replacementFingerprint).not.toBe(ownerFingerprint);

    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const report = await cleanupAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const output = `${renderAuditLockQuarantineCleanupReport(report)}\n${renderAuditLockQuarantineCleanupReportJson(report)}`;

    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("does not match"),
        details: {
          owner_fingerprint_matches: false,
          removed: false
        }
      }]
    });
    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(output).not.toContain(lock.ownerToken);
    expect(output).not.toContain(replacementFingerprint);
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    expect((await fs.stat(movedQuarantinePath)).isDirectory()).toBe(true);
  });

  it("rejects disposal cleanup when a copied candidate replaced the dry-run object", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Vd1001";
    const disposalId = "Ve1001";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const movedDisposalPath = `${disposalPath}.phase571-original`;
    tempDirs.push(lock.lockPath, disposalPath, movedDisposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(disposalPath)
    );
    const dryRun = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const ownerFingerprint = dryRun.checks[0]?.details.owner_fingerprint;
    if (ownerFingerprint === undefined) {
      throw new Error("Expected a disposal cleanup dry-run fingerprint.");
    }

    await fs.rename(disposalPath, movedDisposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(
      getJsonlAuditLockOwnerPath(movedDisposalPath),
      getJsonlAuditLockOwnerPath(disposalPath)
    );
    const replacementFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );
    expect(replacementFingerprint).not.toBe(ownerFingerprint);

    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const report = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const output = `${renderAuditLockDisposalCleanupReport(report)}\n${renderAuditLockDisposalCleanupReportJson(report)}`;

    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("does not match"),
        details: {
          owner_fingerprint_matches: false,
          removed: false
        }
      }]
    });
    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(output).not.toContain(lock.ownerToken);
    expect(output).not.toContain(replacementFingerprint);
    expect((await fs.stat(disposalPath)).isDirectory()).toBe(true);
    expect((await fs.stat(movedDisposalPath)).isDirectory()).toBe(true);
  });

  it("rejects quarantine recovery when a copied candidate replaced the dry-run object", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Vr1001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const nestedLockPath = path.join(quarantinePath, "lock");
    const movedQuarantinePath = `${quarantinePath}.phase571-original`;
    const movedNestedLockPath = path.join(movedQuarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath, movedQuarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const dryRun = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const ownerFingerprint = dryRun.checks[0]?.details.owner_fingerprint;
    if (ownerFingerprint === undefined) {
      throw new Error("Expected a quarantine recovery dry-run fingerprint.");
    }

    await fs.rename(quarantinePath, movedQuarantinePath);
    await fs.mkdir(nestedLockPath, { recursive: true, mode: 0o700 });
    await fs.copyFile(
      getJsonlAuditLockOwnerPath(movedNestedLockPath),
      getJsonlAuditLockOwnerPath(nestedLockPath)
    );
    const replacementFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    expect(replacementFingerprint).not.toBe(ownerFingerprint);

    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const report = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const output = `${renderAuditLockQuarantineRecoveryReport(report)}\n${renderAuditLockQuarantineRecoveryReportJson(report)}`;

    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("does not match"),
        details: {
          owner_fingerprint_matches: false,
          recovered: false
        }
      }]
    });
    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(output).not.toContain(lock.ownerToken);
    expect(output).not.toContain(replacementFingerprint);
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    expect((await fs.stat(movedQuarantinePath)).isDirectory()).toBe(true);
  });

  it("withholds active cleanup confirmation when runtime sees a replacement candidate", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const movedLockPath = `${lock.lockPath}.phase572-original`;
    tempDirs.push(lock.lockPath, movedLockPath);
    const dryRun = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir
    );
    const ownerFingerprint = dryRun.checks[0]?.details
      .coordination_lock_owner_fingerprint;
    if (ownerFingerprint === undefined) {
      throw new Error("Expected an active cleanup dry-run fingerprint.");
    }
    const preflightReads = await countPathInspections(
      lock.lockPath,
      () => inspectRuntimeJsonlAuditFileLock(filePath)
    );
    const race = replaceDirectoryOnNthPathInspection(
      lock.lockPath,
      lock.lockPath,
      movedLockPath,
      preflightReads + 1,
      path.relative(lock.lockPath, lock.ownerPath)
    );

    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const report = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const details = report.checks[0]!.details;
    const replacementFingerprint = await requireActiveLockOwnerFingerprint(
      filePath
    );
    const output = `${renderAuditLockCleanupReport(report)}\n${renderAuditLockCleanupReportJson(report)}`;

    expect(preflightReads).toBeGreaterThan(0);
    expect(race.replaced).toBe(true);
    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("fingerprint does not match"),
        details: { removed: false }
      }]
    });
    expect(details.owner_fingerprint_matches).toBeUndefined();
    expect(details.coordination_lock_owner_fingerprint).toBeUndefined();
    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(replacementFingerprint).not.toBe(ownerFingerprint);
    expect(output).not.toContain(lock.ownerToken);
    expect(output).not.toContain(ownerFingerprint);
    expect(output).not.toContain(replacementFingerprint);
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    expect((await fs.stat(movedLockPath)).isDirectory()).toBe(true);
  });

  it("withholds quarantine cleanup confirmation when runtime sees a replacement candidate", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Wq2001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const movedQuarantinePath = `${quarantinePath}.phase572-original`;
    const ownerPath = getJsonlAuditLockOwnerPath(quarantinePath);
    tempDirs.push(quarantinePath, movedQuarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const dryRun = await cleanupAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const ownerFingerprint = dryRun.checks[0]?.details.owner_fingerprint;
    if (ownerFingerprint === undefined) {
      throw new Error("Expected a quarantine cleanup dry-run fingerprint.");
    }
    const preflightReads = await countPathInspections(
      quarantinePath,
      () => inspectRuntimeJsonlAuditLockQuarantine(filePath, quarantineId)
    );
    const race = replaceDirectoryOnNthPathInspection(
      quarantinePath,
      quarantinePath,
      movedQuarantinePath,
      preflightReads + 1,
      path.relative(quarantinePath, ownerPath)
    );

    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const report = await cleanupAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const details = report.checks[0]!.details;
    const replacementFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const output = `${renderAuditLockQuarantineCleanupReport(report)}\n${renderAuditLockQuarantineCleanupReportJson(report)}`;

    expect(preflightReads).toBeGreaterThan(0);
    expect(race.replaced).toBe(true);
    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("fingerprint does not match"),
        details: { removed: false }
      }]
    });
    expect(details.owner_fingerprint_matches).toBeUndefined();
    expect(details.owner_fingerprint).toBeUndefined();
    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(replacementFingerprint).not.toBe(ownerFingerprint);
    expect(output).not.toContain(lock.ownerToken);
    expect(output).not.toContain(ownerFingerprint);
    expect(output).not.toContain(replacementFingerprint);
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    expect((await fs.stat(movedQuarantinePath)).isDirectory()).toBe(true);
  });

  it("withholds disposal cleanup confirmation when runtime sees a replacement candidate", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Wd2001";
    const disposalId = "Wd2002";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const movedDisposalPath = `${disposalPath}.phase572-original`;
    const ownerPath = getJsonlAuditLockOwnerPath(disposalPath);
    tempDirs.push(disposalPath, movedDisposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const dryRun = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const ownerFingerprint = dryRun.checks[0]?.details.owner_fingerprint;
    if (ownerFingerprint === undefined) {
      throw new Error("Expected a disposal cleanup dry-run fingerprint.");
    }
    const preflightReads = await countPathInspections(
      disposalPath,
      () => inspectRuntimeJsonlAuditLockDisposal(
        filePath,
        quarantineId,
        disposalId
      )
    );
    const race = replaceDirectoryOnNthPathInspection(
      disposalPath,
      disposalPath,
      movedDisposalPath,
      preflightReads + 1,
      path.relative(disposalPath, ownerPath)
    );

    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const report = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const details = report.checks[0]!.details;
    const replacementFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );
    const output = `${renderAuditLockDisposalCleanupReport(report)}\n${renderAuditLockDisposalCleanupReportJson(report)}`;

    expect(preflightReads).toBeGreaterThan(0);
    expect(race.replaced).toBe(true);
    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("fingerprint does not match"),
        details: { removed: false }
      }]
    });
    expect(details.owner_fingerprint_matches).toBeUndefined();
    expect(details.owner_fingerprint).toBeUndefined();
    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(replacementFingerprint).not.toBe(ownerFingerprint);
    expect(output).not.toContain(lock.ownerToken);
    expect(output).not.toContain(ownerFingerprint);
    expect(output).not.toContain(replacementFingerprint);
    expect((await fs.stat(disposalPath)).isDirectory()).toBe(true);
    expect((await fs.stat(movedDisposalPath)).isDirectory()).toBe(true);
  });

  it("withholds recovery confirmation when runtime sees a replacement candidate", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Wr2001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const nestedLockPath = path.join(quarantinePath, "lock");
    const ownerPath = getJsonlAuditLockOwnerPath(nestedLockPath);
    const movedQuarantinePath = `${quarantinePath}.phase572-original`;
    tempDirs.push(quarantinePath, movedQuarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const dryRun = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const ownerFingerprint = dryRun.checks[0]?.details.owner_fingerprint;
    if (ownerFingerprint === undefined) {
      throw new Error("Expected a quarantine recovery dry-run fingerprint.");
    }
    const preflightReads = await countPathInspections(
      quarantinePath,
      () => inspectRuntimeJsonlAuditLockQuarantine(filePath, quarantineId)
    );
    const race = replaceDirectoryOnNthPathInspection(
      quarantinePath,
      quarantinePath,
      movedQuarantinePath,
      preflightReads + 1,
      path.relative(quarantinePath, ownerPath)
    );

    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const report = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const details = report.checks[0]!.details;
    const replacementFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const output = `${renderAuditLockQuarantineRecoveryReport(report)}\n${renderAuditLockQuarantineRecoveryReportJson(report)}`;

    expect(preflightReads).toBeGreaterThan(0);
    expect(race.replaced).toBe(true);
    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("fingerprint does not match"),
        details: { recovered: false }
      }]
    });
    expect(details.owner_fingerprint_matches).toBeUndefined();
    expect(details.owner_fingerprint).toBeUndefined();
    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(replacementFingerprint).not.toBe(ownerFingerprint);
    expect(output).not.toContain(lock.ownerToken);
    expect(output).not.toContain(ownerFingerprint);
    expect(output).not.toContain(replacementFingerprint);
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    expect((await fs.stat(movedQuarantinePath)).isDirectory()).toBe(true);
  });

  it("withholds empty quarantine confirmation when runtime sees a replacement candidate", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "We2001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const movedQuarantinePath = `${quarantinePath}.phase572-original`;
    tempDirs.push(quarantinePath, movedQuarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    const dryRun = await cleanupAuditEmptyLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const emptyFingerprint = dryRun.checks[0]?.details
      .empty_directory_fingerprint;
    if (emptyFingerprint === undefined) {
      throw new Error("Expected an empty quarantine dry-run fingerprint.");
    }
    const preflightReads = await countPathInspections(
      quarantinePath,
      () => inspectRuntimeJsonlAuditLockQuarantine(filePath, quarantineId)
    );
    const race = replaceDirectoryOnNthPathInspection(
      quarantinePath,
      quarantinePath,
      movedQuarantinePath,
      preflightReads + 1
    );

    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const report = await cleanupAuditEmptyLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedQuarantineFingerprint: emptyFingerprint }
    );
    const details = report.checks[0]!.details;
    const replacementFingerprint =
      await requireQuarantineEmptyDirectoryFingerprint(
        filePath,
        quarantineId
      );
    const output = `${renderAuditEmptyLockQuarantineCleanupReport(report)}\n${renderAuditEmptyLockQuarantineCleanupReportJson(report)}`;

    expect(preflightReads).toBeGreaterThan(0);
    expect(race.replaced).toBe(true);
    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("fingerprint does not match"),
        details: { removed: false }
      }]
    });
    expect(details.quarantine_fingerprint_matches).toBeUndefined();
    expect(details.empty_directory_fingerprint).toBeUndefined();
    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(replacementFingerprint).not.toBe(emptyFingerprint);
    expect(output).not.toContain(emptyFingerprint);
    expect(output).not.toContain(replacementFingerprint);
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    expect((await fs.stat(movedQuarantinePath)).isDirectory()).toBe(true);
  });

  it("withholds empty disposal confirmation when runtime sees a replacement candidate", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "We2002";
    const disposalId = "We2003";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const movedDisposalPath = `${disposalPath}.phase572-original`;
    tempDirs.push(disposalPath, movedDisposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    const dryRun = await cleanupAuditEmptyLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId
    );
    const emptyFingerprint = dryRun.checks[0]?.details
      .empty_directory_fingerprint;
    if (emptyFingerprint === undefined) {
      throw new Error("Expected an empty disposal dry-run fingerprint.");
    }
    const preflightReads = await countPathInspections(
      disposalPath,
      () => inspectRuntimeJsonlAuditLockDisposal(
        filePath,
        quarantineId,
        disposalId
      )
    );
    const race = replaceDirectoryOnNthPathInspection(
      disposalPath,
      disposalPath,
      movedDisposalPath,
      preflightReads + 1
    );

    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const report = await cleanupAuditEmptyLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId,
      { dryRun: false, expectedDisposalFingerprint: emptyFingerprint }
    );
    const details = report.checks[0]!.details;
    const replacementFingerprint =
      await requireDisposalEmptyDirectoryFingerprint(
        filePath,
        quarantineId,
        disposalId
      );
    const output = `${renderAuditEmptyLockDisposalCleanupReport(report)}\n${renderAuditEmptyLockDisposalCleanupReportJson(report)}`;

    expect(preflightReads).toBeGreaterThan(0);
    expect(race.replaced).toBe(true);
    expect(report).toMatchObject({
      ok: false,
      checks: [{
        status: "error",
        message: expect.stringContaining("fingerprint does not match"),
        details: { removed: false }
      }]
    });
    expect(details.disposal_fingerprint_matches).toBeUndefined();
    expect(details.empty_directory_fingerprint).toBeUndefined();
    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(replacementFingerprint).not.toBe(emptyFingerprint);
    expect(output).not.toContain(emptyFingerprint);
    expect(output).not.toContain(replacementFingerprint);
    expect((await fs.stat(disposalPath)).isDirectory()).toBe(true);
    expect((await fs.stat(movedDisposalPath)).isDirectory()).toBe(true);
  });

  it("withholds active cleanup confirmation when the candidate disappears before runtime selection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const movedLockPath = `${lock.lockPath}.phase572-missing`;
    tempDirs.push(lock.lockPath, movedLockPath);
    const dryRun = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir
    );
    const ownerFingerprint = dryRun.checks[0]?.details
      .coordination_lock_owner_fingerprint;
    if (ownerFingerprint === undefined) {
      throw new Error("Expected an active cleanup dry-run fingerprint.");
    }
    const preflightReads = await countPathInspections(
      lock.lockPath,
      () => inspectRuntimeJsonlAuditFileLock(filePath)
    );
    const race = moveDirectoryOnNthPathInspection(
      lock.lockPath,
      lock.lockPath,
      movedLockPath,
      preflightReads + 1
    );

    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const report = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const details = report.checks[0]!.details;
    const output = `${renderAuditLockCleanupReport(report)}\n${renderAuditLockCleanupReportJson(report)}`;

    expect(preflightReads).toBeGreaterThan(0);
    expect(race.moved).toBe(true);
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("disappeared before cleanup"),
        details: {
          coordination_lock_exists: false,
          removed: false
        }
      }]
    });
    expect(details.owner_fingerprint_matches).toBeUndefined();
    expect(details.coordination_lock_owner_fingerprint).toBeUndefined();
    expect(details.coordination_lock_entry_type).toBeUndefined();
    expect(details.coordination_lock_entry_count).toBeUndefined();
    expect(details.coordination_lock_entry_scan_count).toBeUndefined();
    expect(details.coordination_lock_entry_scan_limit).toBeUndefined();
    expect(details.coordination_lock_entry_scan_truncated).toBeUndefined();
    expect(details.coordination_lock_owner_entry_exclusive).toBeUndefined();
    expect(details.coordination_lock_owner_metadata_status).toBeUndefined();
    expect(details.coordination_lock_owner_pid).toBeUndefined();
    expect(details.coordination_lock_acquired_at).toBeUndefined();
    expect(details.coordination_lock_state_changed).toBeUndefined();
    expect(details.coordination_lock_inspection_error_code).toBeUndefined();
    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(output).not.toContain("coordination_lock_entry_type");
    expect(output).not.toContain("coordination_lock_owner_metadata_status");
    expect(output).not.toContain(lock.ownerToken);
    expect(output).not.toContain(ownerFingerprint);
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect((await fs.stat(movedLockPath)).isDirectory()).toBe(true);
  });

  it("withdraws owner quarantine preflight evidence when the candidate disappears before runtime selection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "We2006";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const movedQuarantinePath = `${quarantinePath}.phase575-missing`;
    tempDirs.push(quarantinePath, movedQuarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(quarantinePath)
    );
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const preflightReads = await countPathInspections(
      quarantinePath,
      () => inspectRuntimeJsonlAuditLockQuarantine(filePath, quarantineId)
    );
    const race = moveDirectoryOnNthPathInspection(
      quarantinePath,
      quarantinePath,
      movedQuarantinePath,
      preflightReads + 1
    );

    const report = await cleanupAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const details = report.checks[0]!.details;
    const output = `${renderAuditLockQuarantineCleanupReport(report)}\n${renderAuditLockQuarantineCleanupReportJson(report)}`;

    expect(preflightReads).toBeGreaterThan(0);
    expect(race.moved).toBe(true);
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("disappeared before cleanup"),
        details: {
          quarantine_exists: false,
          removed: false
        }
      }]
    });
    expect(details.quarantine_entry_type).toBeUndefined();
    expect(details.quarantine_layout).toBeUndefined();
    expect(details.owner_location).toBeUndefined();
    expect(details.owner_metadata_status).toBeUndefined();
    expect(details.owner_pid).toBeUndefined();
    expect(details.owner_acquired_at).toBeUndefined();
    expect(details.owner_fingerprint).toBeUndefined();
    expect(details.owner_fingerprint_matches).toBeUndefined();
    expect(details.state_changed).toBeUndefined();
    expect(details.inspection_error_code).toBeUndefined();
    expect(output).not.toContain("quarantine_entry_type");
    expect(output).not.toContain("owner_metadata_status");
    expect(output).not.toContain(ownerFingerprint);
    expect(output).not.toContain(lock.ownerToken);
    await expect(fs.access(quarantinePath)).rejects.toThrow();
    expect((await fs.stat(movedQuarantinePath)).isDirectory()).toBe(true);
  });

  it("withdraws owner disposal and source preflight evidence when the candidate disappears", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "We2007";
    const disposalId = "We2008";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const movedDisposalPath = `${disposalPath}.phase575-missing`;
    tempDirs.push(quarantinePath, disposalPath, movedDisposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(disposalPath)
    );
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );
    const preflightReads = await countPathInspections(
      disposalPath,
      () => inspectRuntimeJsonlAuditLockDisposal(
        filePath,
        quarantineId,
        disposalId
      )
    );
    const originalLstat = fs.lstat.bind(fs);
    const originalRename = fs.rename.bind(fs);
    const originalMkdir = fs.mkdir.bind(fs);
    const race = { pathReads: 0, injected: false };
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.resolve(String(target)) === path.resolve(disposalPath)) {
        race.pathReads += 1;
        if (race.pathReads === preflightReads + 1) {
          await originalRename(disposalPath, movedDisposalPath);
          await originalMkdir(quarantinePath, { mode: 0o700 });
          race.injected = true;
        }
      }
      return originalLstat(target, options);
    });

    const report = await cleanupAuditLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const details = report.checks[0]!.details;
    const output = `${renderAuditLockDisposalCleanupReport(report)}\n${renderAuditLockDisposalCleanupReportJson(report)}`;

    expect(preflightReads).toBeGreaterThan(0);
    expect(race.injected).toBe(true);
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("disappeared before cleanup"),
        details: {
          disposal_exists: false,
          removed: false
        }
      }]
    });
    expect(details.source_quarantine_exists).toBeUndefined();
    expect(details.source_quarantine_entry_type).toBeUndefined();
    expect(details.source_quarantine_layout).toBeUndefined();
    expect(details.source_quarantine_state_changed).toBeUndefined();
    expect(details.source_quarantine_inspection_error_code).toBeUndefined();
    expect(details.disposal_entry_type).toBeUndefined();
    expect(details.disposal_layout).toBeUndefined();
    expect(details.owner_metadata_status).toBeUndefined();
    expect(details.owner_pid).toBeUndefined();
    expect(details.owner_acquired_at).toBeUndefined();
    expect(details.owner_fingerprint).toBeUndefined();
    expect(details.owner_fingerprint_matches).toBeUndefined();
    expect(details.state_changed).toBeUndefined();
    expect(details.inspection_error_code).toBeUndefined();
    expect(output).not.toContain("source_quarantine_exists");
    expect(output).not.toContain("disposal_entry_type");
    expect(output).not.toContain(ownerFingerprint);
    expect(output).not.toContain(lock.ownerToken);
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    await expect(fs.access(disposalPath)).rejects.toThrow();
    expect((await fs.stat(movedDisposalPath)).isDirectory()).toBe(true);
  });

  it("withdraws empty disposal and source preflight evidence when the candidate disappears", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "We2009";
    const disposalId = "We2010";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const movedDisposalPath = `${disposalPath}.phase575-missing`;
    tempDirs.push(quarantinePath, disposalPath, movedDisposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    const emptyFingerprint = await requireDisposalEmptyDirectoryFingerprint(
      filePath,
      quarantineId,
      disposalId
    );
    const preflightReads = await countPathInspections(
      disposalPath,
      () => inspectRuntimeJsonlAuditLockDisposal(
        filePath,
        quarantineId,
        disposalId
      )
    );
    const originalLstat = fs.lstat.bind(fs);
    const originalRename = fs.rename.bind(fs);
    const originalMkdir = fs.mkdir.bind(fs);
    const race = { pathReads: 0, injected: false };
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.resolve(String(target)) === path.resolve(disposalPath)) {
        race.pathReads += 1;
        if (race.pathReads === preflightReads + 1) {
          await originalRename(disposalPath, movedDisposalPath);
          await originalMkdir(quarantinePath, { mode: 0o700 });
          race.injected = true;
        }
      }
      return originalLstat(target, options);
    });

    const report = await cleanupAuditEmptyLockDisposal(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      disposalId,
      { dryRun: false, expectedDisposalFingerprint: emptyFingerprint }
    );
    const details = report.checks[0]!.details;
    const output = `${renderAuditEmptyLockDisposalCleanupReport(report)}\n${renderAuditEmptyLockDisposalCleanupReportJson(report)}`;

    expect(preflightReads).toBeGreaterThan(0);
    expect(race.injected).toBe(true);
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("disappeared before cleanup"),
        details: {
          disposal_exists: false,
          removed: false
        }
      }]
    });
    expect(details.source_quarantine_exists).toBeUndefined();
    expect(details.source_quarantine_entry_type).toBeUndefined();
    expect(details.source_quarantine_layout).toBeUndefined();
    expect(details.source_quarantine_state_changed).toBeUndefined();
    expect(details.source_quarantine_inspection_error_code).toBeUndefined();
    expect(details.disposal_entry_type).toBeUndefined();
    expect(details.disposal_layout).toBeUndefined();
    expect(details.empty_directory_fingerprint).toBeUndefined();
    expect(details.disposal_fingerprint_matches).toBeUndefined();
    expect(details.state_changed).toBeUndefined();
    expect(details.inspection_error_code).toBeUndefined();
    expect(output).not.toContain("source_quarantine_exists");
    expect(output).not.toContain("disposal_entry_type");
    expect(output).not.toContain(emptyFingerprint);
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    await expect(fs.access(disposalPath)).rejects.toThrow();
    expect((await fs.stat(movedDisposalPath)).isDirectory()).toBe(true);
  });

  it("withdraws stale preflight evidence when a recovery candidate disappears before runtime selection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "We2005";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const nestedLockPath = path.join(quarantinePath, "lock");
    const movedQuarantinePath = `${quarantinePath}.phase575-missing`;
    tempDirs.push(lock.lockPath, quarantinePath, movedQuarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const preflightReads = await countPathInspections(
      quarantinePath,
      () => inspectRuntimeJsonlAuditLockQuarantine(filePath, quarantineId)
    );
    const originalLstat = fs.lstat.bind(fs);
    const originalRename = fs.rename.bind(fs);
    const race = {
      pathReads: 0,
      injected: false,
      concurrentOwnerToken: undefined as string | undefined
    };
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.resolve(String(target)) === path.resolve(quarantinePath)) {
        race.pathReads += 1;
        if (race.pathReads === preflightReads + 1) {
          await originalRename(quarantinePath, movedQuarantinePath);
          const concurrentLock = await acquireJsonlAuditFileLock(filePath);
          race.concurrentOwnerToken = concurrentLock.ownerToken;
          race.injected = true;
        }
      }
      return originalLstat(target, options);
    });

    const report = await recoverAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
    );
    const details = report.checks[0]!.details;
    const output = `${renderAuditLockQuarantineRecoveryReport(report)}\n${renderAuditLockQuarantineRecoveryReportJson(report)}`;

    expect(preflightReads).toBeGreaterThan(0);
    expect(race).toMatchObject({ injected: true });
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("disappeared before recovery"),
        details: {
          quarantine_exists: false,
          recovered: false
        }
      }]
    });
    expect(details.coordination_lock_exists).toBeUndefined();
    expect(details.quarantine_entry_type).toBeUndefined();
    expect(details.quarantine_layout).toBeUndefined();
    expect(details.owner_location).toBeUndefined();
    expect(details.owner_metadata_status).toBeUndefined();
    expect(details.owner_pid).toBeUndefined();
    expect(details.owner_acquired_at).toBeUndefined();
    expect(details.state_changed).toBeUndefined();
    expect(details.inspection_error_code).toBeUndefined();
    expect(details.coordination_lock_entry_type).toBeUndefined();
    expect(details.coordination_lock_acquirable).toBeUndefined();
    expect(details.coordination_lock_entry_count).toBeUndefined();
    expect(details.coordination_lock_entry_scan_count).toBeUndefined();
    expect(details.coordination_lock_entry_scan_limit).toBeUndefined();
    expect(details.coordination_lock_entry_scan_truncated).toBeUndefined();
    expect(details.coordination_lock_owner_entry_exclusive).toBeUndefined();
    expect(details.coordination_lock_owner_metadata_status).toBeUndefined();
    expect(details.coordination_lock_owner_pid).toBeUndefined();
    expect(details.coordination_lock_acquired_at).toBeUndefined();
    expect(details.coordination_lock_state_changed).toBeUndefined();
    expect(details.coordination_lock_inspection_error_code).toBeUndefined();
    expect(details.owner_fingerprint_matches).toBeUndefined();
    expect(details.owner_fingerprint).toBeUndefined();
    expect(output).not.toContain("quarantine_entry_type");
    expect(output).not.toContain("coordination_lock_exists");
    expect(output).not.toContain(ownerFingerprint);
    expect(output).not.toContain(lock.ownerToken);
    expect(output).not.toContain(race.concurrentOwnerToken);
    await expect(fs.access(quarantinePath)).rejects.toThrow();
    expect((await fs.stat(movedQuarantinePath)).isDirectory()).toBe(true);
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
  });

  it("withholds empty quarantine confirmation when the candidate disappears before runtime selection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "We2004";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const movedQuarantinePath = `${quarantinePath}.phase572-missing`;
    tempDirs.push(quarantinePath, movedQuarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    const dryRun = await cleanupAuditEmptyLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId
    );
    const emptyFingerprint = dryRun.checks[0]?.details
      .empty_directory_fingerprint;
    if (emptyFingerprint === undefined) {
      throw new Error("Expected an empty quarantine dry-run fingerprint.");
    }
    const preflightReads = await countPathInspections(
      quarantinePath,
      () => inspectRuntimeJsonlAuditLockQuarantine(filePath, quarantineId)
    );
    const race = moveDirectoryOnNthPathInspection(
      quarantinePath,
      quarantinePath,
      movedQuarantinePath,
      preflightReads + 1
    );

    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");
    const report = await cleanupAuditEmptyLockQuarantine(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      quarantineId,
      { dryRun: false, expectedQuarantineFingerprint: emptyFingerprint }
    );
    const details = report.checks[0]!.details;
    const output = `${renderAuditEmptyLockQuarantineCleanupReport(report)}\n${renderAuditEmptyLockQuarantineCleanupReportJson(report)}`;

    expect(preflightReads).toBeGreaterThan(0);
    expect(race.moved).toBe(true);
    expect(report).toMatchObject({
      ok: true,
      checks: [{
        status: "warn",
        message: expect.stringContaining("disappeared before cleanup"),
        details: {
          quarantine_exists: false,
          removed: false
        }
      }]
    });
    expect(details.quarantine_fingerprint_matches).toBeUndefined();
    expect(details.empty_directory_fingerprint).toBeUndefined();
    expect(details.quarantine_entry_type).toBeUndefined();
    expect(details.quarantine_layout).toBeUndefined();
    expect(details.state_changed).toBeUndefined();
    expect(details.inspection_error_code).toBeUndefined();
    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(output).not.toContain("quarantine_entry_type");
    expect(output).not.toContain("quarantine_layout");
    expect(output).not.toContain(emptyFingerprint);
    await expect(fs.access(quarantinePath)).rejects.toThrow();
    expect((await fs.stat(movedQuarantinePath)).isDirectory()).toBe(true);
  });

  it("skips quarantine inspection when audit persistence is disabled", async () => {
    const report = await inspectAuditLockQuarantines({}, "/workspace");

    expect(report).toEqual({
      ok: true,
      checks: [{
        name: "audit_lock_quarantines",
        status: "warn",
        message: "skipped; persistence is disabled",
        details: {
          enabled: false,
          scanned_entry_count: 0,
          scan_limit: 4_096,
          scan_truncated: false,
          matched_entry_count: 0,
          result_limit: 128,
          result_truncated: false,
          quarantines: []
        }
      }]
    });
  });

  it("skips disposal inspection when audit persistence is disabled", async () => {
    const report = await inspectAuditLockDisposals({}, "/workspace");

    expect(report).toEqual({
      ok: true,
      checks: [{
        name: "audit_lock_disposals",
        status: "warn",
        message: "skipped; persistence is disabled",
        details: {
          enabled: false,
          scanned_entry_count: 0,
          scan_limit: 4_096,
          scan_truncated: false,
          matched_entry_count: 0,
          result_limit: 128,
          result_truncated: false,
          disposals: []
        }
      }]
    });
  });

  it("rejects a non-directory coordination lock blocker without modifying it", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    await fs.writeFile(lockPath, "blocker", { mode: 0o600 });

    const report = await inspectAuditPath({ GOD_CODE_AUDIT_FILE: filePath }, dir);

    expect(report.ok).toBe(false);
    expect(report.checks[0]).toMatchObject({
      status: "error",
      message: expect.stringContaining("lock path must be a directory"),
      details: {
        coordination_lock_path: lockPath,
        coordination_lock_exists: true,
        coordination_lock_entry_type: "regular_file",
        coordination_lock_acquirable: false
      }
    });
    expect(await fs.readFile(lockPath, "utf8")).toBe("blocker");
    await fs.rm(lockPath);
  });

  it("reports remaining capacity without warning for an under-capacity target", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await fs.writeFile(filePath, "12345678", { mode: 0o600 });
    await fs.chmod(filePath, 0o600);

    const report = await inspectAuditPath({
      GOD_CODE_AUDIT_FILE: filePath,
      GOD_CODE_AUDIT_MAX_BYTES: "16"
    }, dir);

    expect(report.ok).toBe(true);
    expect(report.checks[0]).toMatchObject({
      status: "ok",
      details: {
        max_bytes: 16,
        current_generation_bytes: 8,
        remaining_capacity_bytes: 8,
        rotation_expected_on_next_record: false,
        current_generation_over_capacity: false
      }
    });
    expect(report.checks[0]?.message).not.toContain("capacity");
    expect(await fs.readFile(filePath, "utf8")).toBe("12345678");
  });

  it("warns for broad existing POSIX modes without modifying the target", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await fs.writeFile(filePath, "unchanged", { mode: 0o666 });
    await fs.chmod(filePath, 0o666);
    const report = await inspectAuditPath({ GOD_CODE_AUDIT_FILE: filePath }, dir);

    expect(report.ok).toBe(true);
    if (process.platform === "win32") {
      expect(report.checks[0]?.status).toBe("ok");
    } else {
      expect(report.checks[0]).toMatchObject({
        status: "warn",
        details: {
          target_exists: true,
          target_writable: true,
          target_mode: "0666",
          target_private_mode: false
        }
      });
    }
    expect(await fs.readFile(filePath, "utf8")).toBe("unchanged");
    if (process.platform !== "win32") {
      expect((await fs.stat(filePath)).mode & 0o777).toBe(0o666);
    }
  });

  it("reports an existing target that cannot be opened for append", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await fs.writeFile(filePath, "unchanged", "utf8");

    const report = await inspectAuditPath(
      { GOD_CODE_AUDIT_FILE: filePath },
      dir,
      async (target) => {
        if (target === filePath) {
          throw Object.assign(new Error("denied"), { code: "EACCES" });
        }
      }
    );

    expect(report.ok).toBe(false);
    expect(report.checks[0]).toMatchObject({
      status: "error",
      message: expect.stringContaining("existing audit target is not writable"),
      details: {
        directory_writable: true,
        target_writable: false
      }
    });
    expect(await fs.readFile(filePath, "utf8")).toBe("unchanged");
  });

  it("reports capacity exhaustion without modifying the current generation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await fs.writeFile(filePath, "1234567890abcdef", { mode: 0o600 });
    await fs.chmod(filePath, 0o600);

    const atCapacity = await inspectAuditPath({
      GOD_CODE_AUDIT_FILE: filePath,
      GOD_CODE_AUDIT_MAX_BYTES: "16"
    }, dir);

    expect(atCapacity.ok).toBe(true);
    expect(atCapacity.checks[0]).toMatchObject({
      status: "warn",
      message: expect.stringContaining("at capacity"),
      details: {
        max_bytes: 16,
        current_generation_bytes: 16,
        remaining_capacity_bytes: 0,
        rotation_expected_on_next_record: true,
        current_generation_over_capacity: false
      }
    });
    expect(await fs.readFile(filePath, "utf8")).toBe("1234567890abcdef");

    await fs.writeFile(filePath, "1234567890abcdefg", { mode: 0o600 });
    const overCapacity = await inspectAuditPath({
      GOD_CODE_AUDIT_FILE: filePath,
      GOD_CODE_AUDIT_MAX_BYTES: "16"
    }, dir);

    expect(overCapacity.ok).toBe(true);
    expect(overCapacity.checks[0]).toMatchObject({
      status: "warn",
      message: expect.stringContaining("exceeds configured capacity"),
      details: {
        max_bytes: 16,
        current_generation_bytes: 17,
        remaining_capacity_bytes: 0,
        rotation_expected_on_next_record: true,
        current_generation_over_capacity: true
      }
    });
    expect(await fs.readFile(filePath, "utf8")).toBe("1234567890abcdefg");
  });

  it("rejects a directory occupying the rotated generation path", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await fs.writeFile(filePath, "unchanged", "utf8");
    await fs.mkdir(rotatedPath);

    const report = await inspectAuditPath({ GOD_CODE_AUDIT_FILE: filePath }, dir);

    expect(report.ok).toBe(false);
    expect(report.checks[0]).toMatchObject({
      status: "error",
      message: expect.stringContaining("rotated audit path must not be a directory"),
      details: {
        rotation_path: rotatedPath,
        rotation_entry_exists: true,
        rotation_entry_type: "directory",
        rotation_entry_replaceable: false
      }
    });
    expect((await fs.stat(rotatedPath)).isDirectory()).toBe(true);
    expect(await fs.readFile(filePath, "utf8")).toBe("unchanged");
  });

  it("warns for a rotated symlink without following or removing it", async () => {
    const dir = await createTempDir();
    const outside = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const victim = path.join(outside, "victim.txt");
    await fs.writeFile(filePath, "current", "utf8");
    await fs.writeFile(victim, "unchanged", "utf8");
    await fs.symlink(victim, rotatedPath);

    const report = await inspectAuditPath({ GOD_CODE_AUDIT_FILE: filePath }, dir);

    expect(report.ok).toBe(true);
    expect(report.checks[0]).toMatchObject({
      status: "warn",
      message: expect.stringContaining("without following it"),
      details: {
        rotation_entry_exists: true,
        rotation_entry_type: "symbolic_link",
        rotation_entry_replaceable: true
      }
    });
    expect((await fs.lstat(rotatedPath)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(victim, "utf8")).toBe("unchanged");
  });

  it("rejects linked audit paths without following or writing them", async () => {
    const dir = await createTempDir();
    const outside = await createTempDir();
    const victim = path.join(outside, "victim.txt");
    const linked = path.join(dir, "audit.jsonl");
    await fs.writeFile(victim, "unchanged", "utf8");
    await fs.symlink(victim, linked);

    const report = await inspectAuditPath({ GOD_CODE_AUDIT_FILE: linked }, dir);

    expect(report.ok).toBe(false);
    expect(report.checks[0]?.status).toBe("error");
    expect(report.checks[0]?.message).toContain("must not contain symbolic links");
    expect(await fs.readFile(victim, "utf8")).toBe("unchanged");
  });
});
