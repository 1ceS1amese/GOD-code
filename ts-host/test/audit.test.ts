import { spawn } from "node:child_process";
import { once } from "node:events";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createConfiguredAuditSink,
  parseAuditDurability,
  parseAuditMaxBytes,
  parseAuditRedactKeys
} from "../src/audit/config.js";
import {
  acquireJsonlAuditFileLock as acquireUntrackedJsonlAuditFileLock,
  cleanupJsonlAuditEmptyLockDisposal,
  cleanupJsonlAuditEmptyLockQuarantine,
  cleanupJsonlAuditFileLock,
  cleanupJsonlAuditLockDisposal,
  cleanupJsonlAuditLockQuarantine,
  DEFAULT_JSONL_AUDIT_LOCK_RETRY_MS,
  DEFAULT_JSONL_AUDIT_LOCK_TIMEOUT_MS,
  evaluateJsonlAuditCapacity,
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockPath,
  getJsonlAuditLockDisposalPath,
  getJsonlAuditLockQuarantinePath,
  getJsonlAuditLockQuarantinePrefix,
  getJsonlAuditRotationStagingPath,
  getJsonlAuditRotationStagingPrefix,
  inspectJsonlAuditFileLock,
  inspectJsonlAuditLockDisposal,
  inspectJsonlAuditLockDisposals,
  inspectJsonlAuditLockQuarantine,
  inspectJsonlAuditLockQuarantines,
  inspectJsonlAuditPath,
  inspectJsonlAuditRotationRecovery,
  inspectJsonlAuditRotationStaging,
  inspectJsonlAuditRotationStagings,
  JSONL_AUDIT_LOCK_OWNER_FILE_NAME,
  JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_HEX_LENGTH,
  JsonlAuditRotationStagingRecoveryError,
  jsonlAuditFileIdentityMatches,
  recoverJsonlAuditRotationStaging,
  type JsonlAuditFileLock,
  JsonlAuditSink,
  MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
  MAX_JSONL_AUDIT_LOCK_OWNER_BYTES,
  MAX_JSONL_AUDIT_REDACTION_KEYS,
  MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES,
  MAX_JSONL_AUDIT_ROTATION_STAGING_RESULTS,
  MAX_JSONL_AUDIT_ROTATION_STAGING_SCAN_ENTRIES,
  MAX_JSONL_AUDIT_SNAPSHOT_NODES,
  recoverJsonlAuditLockQuarantine
} from "../src/audit/jsonlAuditSink.js";
import {
  createJsonlAuditDirectoryEntry,
  createJsonlAuditTemporaryDirectoryEntry,
  resolveJsonlAuditDirectoryMutationPath,
  unlinkJsonlAuditDirectoryEntry
} from "../src/audit/jsonlAuditDirectoryMutation.js";
import { MemoryAuditSink } from "../src/audit/memoryAuditSink.js";
import { NoopAuditSink } from "../src/audit/noopAuditSink.js";
import { prepareGodCodeHost } from "../src/headless/godCodeHostSetup.js";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "god-code-audit-"));
  tempDirs.push(dir);
  return dir;
}

async function captureAuditFailure(
  operation: () => Promise<unknown>
): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected audit operation to reject.");
}

async function observeAuditPromiseAfterCloseDeadline<T>(
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

async function captureAuditPendingCloseFailure(
  start: () => Promise<unknown>,
  injection: {
    closeStarted: Promise<void>;
    actualCloseCompletion?: Promise<void>;
    resolveClose(): void;
    rejectClose(reason: unknown): void;
  },
  lateMessage: string
): Promise<{
  settledWithinBound: boolean;
  failure: unknown;
  unhandled: unknown[];
}> {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const failurePromise = start().catch((error: unknown) => error);
  try {
    await injection.closeStarted;
    await injection.actualCloseCompletion;
    await new Promise<void>((resolve) => setImmediate(resolve));
    const settlement = await observeAuditPromiseAfterCloseDeadline(
      failurePromise,
      Promise.resolve()
    );
    injection.rejectClose(new Error(lateMessage));
    const failure = settlement.settled
      ? settlement.value
      : await failurePromise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {
      settledWithinBound: settlement.settled,
      failure,
      unhandled
    };
  } finally {
    injection.resolveClose();
    process.off("unhandledRejection", onUnhandled);
    vi.useRealTimers();
  }
}

async function requireActiveLockOwnerFingerprint(
  filePath: string
): Promise<string> {
  const fingerprint = (await inspectJsonlAuditFileLock(filePath)).ownerFingerprint;
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
    await inspectJsonlAuditLockQuarantine(filePath, quarantineId)
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
    await inspectJsonlAuditLockDisposal(filePath, quarantineId, disposalId)
  ).ownerFingerprint;
  if (fingerprint === undefined) {
    throw new Error("Expected a disposal owner fingerprint.");
  }
  return fingerprint;
}

async function createAuditRotationStagingFixture(
  filePath: string,
  stagingId: string,
  previousContent?: string
): Promise<string> {
  const stagingPath = getJsonlAuditRotationStagingPath(filePath, stagingId);
  await fs.mkdir(stagingPath, { mode: 0o700 });
  if (previousContent !== undefined) {
    await fs.writeFile(
      path.join(stagingPath, "previous"),
      previousContent,
      { mode: 0o600 }
    );
  }
  return stagingPath;
}

async function writePrivateAuditGeneration(
  filePath: string,
  content: string
): Promise<void> {
  await fs.writeFile(filePath, content, { mode: 0o600 });
}

async function supportsJsonlAuditDescriptorRelativeMutation(
  directoryPath: string
): Promise<boolean> {
  if (process.platform !== "linux") {
    return false;
  }
  const handle = await fs.open(directoryPath, "r");
  try {
    const capability = await resolveJsonlAuditDirectoryMutationPath(
      { directoryPath, handle },
      "probe"
    );
    return capability.mode === "descriptor_relative";
  } finally {
    await handle.close();
  }
}

function isJsonlAuditEntryTarget(target: unknown, logicalPath: string): boolean {
  const targetPath = String(target);
  return targetPath === logicalPath
    || (targetPath.startsWith("/proc/self/fd/")
      && path.basename(targetPath) === path.basename(logicalPath));
}

function isJsonlAuditExclusiveOwnerOpen(
  target: unknown,
  flags: unknown
): boolean {
  return path.basename(String(target)) === JSONL_AUDIT_LOCK_OWNER_FILE_NAME
    && typeof flags === "number"
    && (flags & fsConstants.O_EXCL) !== 0;
}

function isJsonlAuditAppendOpen(
  target: unknown,
  flags: unknown,
  filePath: string
): boolean {
  return isJsonlAuditEntryTarget(target, filePath)
    && typeof flags === "number"
    && (flags & fsConstants.O_APPEND) !== 0;
}

function injectFirstAuditMaintenanceHandleCloseFailure(
  targetPath: string,
  message: string,
  observedClosePath?: string
): {
  selectedOpenCount: number;
  closeCompletion?: Promise<void>;
  observedCloseCount: number;
} {
  const state: {
    selectedOpenCount: number;
    closeCompletion?: Promise<void>;
    observedCloseCount: number;
  } = { selectedOpenCount: 0, observedCloseCount: 0 };
  const originalOpen = fs.open.bind(fs);
  vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
    const handle = await originalOpen(target, flags, mode);
    if (isJsonlAuditEntryTarget(target, targetPath)) {
      state.selectedOpenCount += 1;
      if (state.selectedOpenCount === 1) {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(() => {
          state.closeCompletion = close();
          throw new Error(message);
        });
      }
    } else if (
      observedClosePath !== undefined
      && isJsonlAuditEntryTarget(target, observedClosePath)
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
  primaryMessage: string,
  closeMessage: string,
  selectedOpenNumber = 1,
  observedClosePath?: string
): {
  selectedOpenCount: number;
  selectedCloseCount: number;
  selectedCloseCompletion?: Promise<void>;
  observedCloseCount: number;
} {
  const state: {
    selectedOpenCount: number;
    selectedCloseCount: number;
    selectedCloseCompletion?: Promise<void>;
    observedCloseCount: number;
  } = {
    selectedOpenCount: 0,
    selectedCloseCount: 0,
    observedCloseCount: 0
  };
  const originalOpen = fs.open.bind(fs);
  vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
    const handle = await originalOpen(target, flags, mode);
    if (isJsonlAuditEntryTarget(target, targetPath)) {
      state.selectedOpenCount += 1;
      if (state.selectedOpenCount === selectedOpenNumber) {
        vi.spyOn(handle, "stat").mockRejectedValue(
          new Error(primaryMessage)
        );
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(() => {
          state.selectedCloseCount += 1;
          state.selectedCloseCompletion = close();
          throw new Error(closeMessage);
        });
      }
    } else if (
      observedClosePath !== undefined
      && isJsonlAuditEntryTarget(target, observedClosePath)
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

function injectAuditPrivateDirectoryInitializationFailure(
  prefix: string,
  primaryMessage: string,
  closeMessage: string
): {
  privateDirectoryOpened: boolean;
  privateCloseCount: number;
  privateCloseCompletion?: Promise<void>;
  parentCloseCount: number;
} {
  const state: {
    privateDirectoryOpened: boolean;
    privateCloseCount: number;
    privateCloseCompletion?: Promise<void>;
    parentCloseCount: number;
  } = {
    privateDirectoryOpened: false,
    privateCloseCount: 0,
    parentCloseCount: 0
  };
  const parentPath = path.dirname(prefix);
  const namePrefix = path.basename(prefix);
  const originalOpen = fs.open.bind(fs);
  vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
    const handle = await originalOpen(target, flags, mode);
    const targetPath = String(target);
    if (path.resolve(targetPath) === path.resolve(parentPath)) {
      const close = handle.close.bind(handle);
      vi.spyOn(handle, "close").mockImplementation(async () => {
        state.parentCloseCount += 1;
        await close();
      });
    } else if (path.basename(targetPath).startsWith(namePrefix)) {
      state.privateDirectoryOpened = true;
      vi.spyOn(handle, "chmod").mockRejectedValue(new Error(primaryMessage));
      const close = handle.close.bind(handle);
      vi.spyOn(handle, "close").mockImplementation(() => {
        state.privateCloseCount += 1;
        state.privateCloseCompletion = close();
        throw new Error(closeMessage);
      });
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
  selectedCloseCompletion?: Promise<void>;
} {
  const state: {
    selectedStreamCount: number;
    selectedCloseCount: number;
    selectedCloseCompletion?: Promise<void>;
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
        state.selectedCloseCompletion = close();
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

function injectAuditResolvedDirectoryStreamPendingClose(
  directoryPath: string,
  selectedOccurrence: number,
  readMessage?: string,
  initiallyEnabled = true
): {
  matchingStreamCount: number;
  selectedCloseCount: number;
  closeStarted: Promise<void>;
  actualCloseCompletion?: Promise<void>;
  enable(): void;
  resolveClose(): void;
  rejectClose(reason: unknown): void;
} {
  const expectedDirectoryPath = path.resolve(directoryPath);
  let enabled = initiallyEnabled;
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
    matchingStreamCount: number;
    selectedCloseCount: number;
    closeStarted: Promise<void>;
    actualCloseCompletion?: Promise<void>;
    enable(): void;
    resolveClose(): void;
    rejectClose(reason: unknown): void;
  } = {
    matchingStreamCount: 0,
    selectedCloseCount: 0,
    closeStarted,
    enable: () => {
      enabled = true;
    },
    resolveClose: () => resolvePendingClose(),
    rejectClose: (reason) => rejectPendingClose(reason)
  };
  const originalOpendir = fs.opendir.bind(fs);
  vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
    const stream = await originalOpendir(target, options);
    if (!enabled) {
      return stream;
    }
    let resolvedTarget = path.resolve(String(target));
    try {
      resolvedTarget = await fs.realpath(target);
    } catch {
      // Preserve native behavior for a descriptor path that disappeared.
    }
    if (path.resolve(resolvedTarget) !== expectedDirectoryPath) {
      return stream;
    }
    state.matchingStreamCount += 1;
    if (state.matchingStreamCount === selectedOccurrence) {
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

function injectAuditHandlePendingClose(
  targetPath: string,
  selectedOpenNumber: number,
  observedClosePath?: string,
  statFailureMessage?: string,
  writeFailureMessage?: string
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
    if (isJsonlAuditEntryTarget(target, targetPath)) {
      state.selectedOpenCount += 1;
      if (state.selectedOpenCount === selectedOpenNumber) {
        if (statFailureMessage !== undefined) {
          vi.spyOn(handle, "stat").mockRejectedValue(
            new Error(statFailureMessage)
          );
        }
        if (writeFailureMessage !== undefined) {
          vi.spyOn(handle, "writeFile").mockRejectedValue(
            new Error(writeFailureMessage)
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
      observedClosePath === undefined
      || isJsonlAuditEntryTarget(target, observedClosePath)
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

function injectFirstAuditMaintenanceHandlePendingClose(
  targetPath: string,
  observedClosePath?: string
): ReturnType<typeof injectAuditHandlePendingClose> {
  return injectAuditHandlePendingClose(targetPath, 1, observedClosePath);
}

function injectAuditLockLifecycleHandlePendingClose(
  filePath: string
): {
  selectedOpenCount: number;
  selectedCloseCount: number;
  lockDirectoryCloseCount: number;
  parentCloseCount: number;
  closeStarted: Promise<void>;
  actualCloseCompletion?: Promise<void>;
  otherCloseCompletions: Promise<void>[];
  resolveClose(): void;
  rejectClose(reason: unknown): void;
} {
  const lockPath = getJsonlAuditLockPath(filePath);
  const ownerPath = getJsonlAuditLockOwnerPath(lockPath);
  const parentPath = path.dirname(lockPath);
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
    lockDirectoryCloseCount: number;
    parentCloseCount: number;
    closeStarted: Promise<void>;
    actualCloseCompletion?: Promise<void>;
    otherCloseCompletions: Promise<void>[];
    resolveClose(): void;
    rejectClose(reason: unknown): void;
  } = {
    selectedOpenCount: 0,
    selectedCloseCount: 0,
    lockDirectoryCloseCount: 0,
    parentCloseCount: 0,
    closeStarted,
    otherCloseCompletions: [],
    resolveClose: () => resolvePendingClose(),
    rejectClose: (reason) => rejectPendingClose(reason)
  };
  const originalOpen = fs.open.bind(fs);
  vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
    const handle = await originalOpen(target, flags, mode);
    if (isJsonlAuditEntryTarget(target, ownerPath)) {
      state.selectedOpenCount += 1;
      if (state.selectedOpenCount === 1) {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(() => {
          state.selectedCloseCount += 1;
          state.actualCloseCompletion = close();
          resolveCloseStarted();
          return pendingClose;
        });
      }
    } else if (isJsonlAuditEntryTarget(target, lockPath)) {
      const close = handle.close.bind(handle);
      vi.spyOn(handle, "close").mockImplementation(() => {
        state.lockDirectoryCloseCount += 1;
        const completion = close();
        state.otherCloseCompletions.push(completion);
        return completion;
      });
    } else if (path.resolve(String(target)) === path.resolve(parentPath)) {
      const close = handle.close.bind(handle);
      vi.spyOn(handle, "close").mockImplementation(() => {
        state.parentCloseCount += 1;
        const completion = close();
        state.otherCloseCompletions.push(completion);
        return completion;
      });
    }
    return handle;
  });
  return state;
}

function injectAuditWriterParentPendingClose(
  filePath: string,
  writeFailureMessage?: string
): {
  parentOpenCount: number;
  parentCloseCount: number;
  appendOpenCount: number;
  closeStarted: Promise<void>;
  actualCloseCompletion?: Promise<void>;
  resolveClose(): void;
  rejectClose(reason: unknown): void;
} {
  const parentPath = path.dirname(filePath);
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
    parentOpenCount: number;
    parentCloseCount: number;
    appendOpenCount: number;
    closeStarted: Promise<void>;
    actualCloseCompletion?: Promise<void>;
    resolveClose(): void;
    rejectClose(reason: unknown): void;
  } = {
    parentOpenCount: 0,
    parentCloseCount: 0,
    appendOpenCount: 0,
    closeStarted,
    resolveClose: () => resolvePendingClose(),
    rejectClose: (reason) => rejectPendingClose(reason)
  };
  let selectedParentClose = false;
  const originalOpen = fs.open.bind(fs);
  vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
    const handle = await originalOpen(target, flags, mode);
    if (path.resolve(String(target)) === path.resolve(parentPath)) {
      state.parentOpenCount += 1;
      const close = handle.close.bind(handle);
      vi.spyOn(handle, "close").mockImplementation(() => {
        const completion = close();
        if (!selectedParentClose) {
          selectedParentClose = true;
          state.parentCloseCount += 1;
          state.actualCloseCompletion = completion;
          resolveCloseStarted();
          return pendingClose;
        }
        return completion;
      });
    } else if (isJsonlAuditAppendOpen(target, flags, filePath)) {
      state.appendOpenCount += 1;
      if (writeFailureMessage !== undefined) {
        vi.spyOn(handle, "writeFile").mockRejectedValue(
          new Error(writeFailureMessage)
        );
      }
    }
    return handle;
  });
  return state;
}

function injectAuditFailedWriterParentPendingClose(
  filePath: string,
  statFailureMessage: string
): {
  parentOpenCount: number;
  selectedOpenCount: number;
  selectedCloseCount: number;
  closeStarted: Promise<void>;
  actualCloseCompletion?: Promise<void>;
  resolveClose(): void;
  rejectClose(reason: unknown): void;
} {
  const parentPath = path.dirname(filePath);
  const lockPath = getJsonlAuditLockPath(filePath);
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
    parentOpenCount: number;
    selectedOpenCount: number;
    selectedCloseCount: number;
    closeStarted: Promise<void>;
    actualCloseCompletion?: Promise<void>;
    resolveClose(): void;
    rejectClose(reason: unknown): void;
  } = {
    parentOpenCount: 0,
    selectedOpenCount: 0,
    selectedCloseCount: 0,
    closeStarted,
    resolveClose: () => resolvePendingClose(),
    rejectClose: (reason) => rejectPendingClose(reason)
  };
  const originalOpen = fs.open.bind(fs);
  const originalLstat = fs.lstat.bind(fs);
  vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
    const handle = await originalOpen(target, flags, mode);
    if (path.resolve(String(target)) !== path.resolve(parentPath)) {
      return handle;
    }
    state.parentOpenCount += 1;
    let lockExists = true;
    try {
      await originalLstat(lockPath);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        lockExists = false;
      } else {
        throw error;
      }
    }
    if (!lockExists || state.selectedOpenCount > 0) {
      return handle;
    }
    state.selectedOpenCount += 1;
    vi.spyOn(handle, "stat").mockRejectedValue(
      new Error(statFailureMessage)
    );
    const close = handle.close.bind(handle);
    vi.spyOn(handle, "close").mockImplementation(() => {
      state.selectedCloseCount += 1;
      state.actualCloseCompletion = close();
      resolveCloseStarted();
      return pendingClose;
    });
    return handle;
  });
  return state;
}

function createRequestedAuditEvent(cwd: string, toolCallId = "read-1") {
  return {
    type: "tool_requested" as const,
    request: {
      session_id: "session-1",
      turn_id: "turn-1",
      tool_call_id: toolCallId,
      tool_name: "Read" as const,
      input: {}
    },
    context: {
      cwd,
      sessionId: "session-1",
      turnId: "turn-1",
      toolCallId
    }
  };
}

async function findSingleAuditTemporaryPath(prefix: string): Promise<string> {
  const parent = path.dirname(prefix);
  const namePrefix = path.basename(prefix);
  const matches = (await fs.readdir(parent))
    .filter((entry) => entry.startsWith(namePrefix));
  if (matches.length !== 1) {
    throw new Error(
      `Expected one audit temporary path for ${prefix}, found ${matches.length}.`
    );
  }
  return path.join(parent, matches[0]!);
}

describe("Host audit sinks", () => {
  it("resolves Linux audit mutations through a pinned procfd directory", async () => {
    const dir = await createTempDir();
    const handle = await fs.open(dir, "r");
    try {
      const resolved = await resolveJsonlAuditDirectoryMutationPath(
        { directoryPath: dir, handle },
        "owner.json"
      );
      if (resolved.mode === "descriptor_relative") {
        expect(resolved).toEqual({
          path: `/proc/self/fd/${handle.fd}/owner.json`,
          mode: "descriptor_relative"
        });
      } else {
        expect(resolved).toEqual({
          path: path.join(dir, "owner.json"),
          mode: "path"
        });
      }
    } finally {
      await handle.close();
    }
  });

  it("keeps a deterministic path fallback for non-Linux audit mutations", async () => {
    const dir = await createTempDir();
    const handle = await fs.open(dir, "r");
    try {
      await expect(resolveJsonlAuditDirectoryMutationPath(
        { directoryPath: dir, handle },
        "owner.json",
        "win32"
      )).resolves.toEqual({
        path: path.join(dir, "owner.json"),
        mode: "path"
      });
      await expect(resolveJsonlAuditDirectoryMutationPath(
        { directoryPath: dir, handle },
        "../owner.json",
        "win32"
      )).rejects.toThrow("Invalid audit directory mutation entry name");
    } finally {
      await handle.close();
    }
  });

  it("fails closed when a path fallback no longer names the pinned directory", async () => {
    const dir = await createTempDir();
    const rootPath = path.join(dir, "fallback-root");
    const detachedPath = path.join(dir, "fallback-root.detached");
    await fs.mkdir(rootPath, { mode: 0o700 });
    const handle = await fs.open(rootPath, "r");
    try {
      await fs.rename(rootPath, detachedPath);
      await fs.mkdir(rootPath, { mode: 0o700 });
      await expect(resolveJsonlAuditDirectoryMutationPath(
        { directoryPath: rootPath, handle },
        "owner.json",
        "win32"
      )).rejects.toThrow("Audit directory mutation anchor changed");
    } finally {
      await handle.close();
    }
  });

  it("creates a logical private root through the pinned parent descriptor", async () => {
    const dir = await createTempDir();
    const handle = await fs.open(dir, "r");
    try {
      const expectedMode = (await resolveJsonlAuditDirectoryMutationPath(
        { directoryPath: dir, handle },
        "probe"
      )).mode;
      const created = await createJsonlAuditTemporaryDirectoryEntry(
        { directoryPath: dir, handle },
        "wrapper-"
      );
      expect(created.path).toBe(path.join(dir, created.name));
      expect(path.basename(created.mutationPath)).toBe(created.name);
      expect(created.name).toMatch(/^wrapper-.+/u);
      expect((await fs.stat(created.path)).isDirectory()).toBe(true);
      expect(created.mode).toBe(expectedMode);
    } finally {
      await handle.close();
    }
  });

  it("creates an exact directory entry through the pinned parent descriptor", async () => {
    const dir = await createTempDir();
    const handle = await fs.open(dir, "r");
    try {
      const created = await createJsonlAuditDirectoryEntry(
        { directoryPath: dir, handle },
        "reservation",
        0o700
      );
      expect(created.path).toBe(path.join(dir, "reservation"));
      expect(path.basename(created.mutationPath)).toBe("reservation");
      expect((await fs.stat(created.path)).isDirectory()).toBe(true);
      if (created.mode === "descriptor_relative") {
        expect(created.mutationPath).toBe(
          `/proc/self/fd/${handle.fd}/reservation`
        );
      }
    } finally {
      await handle.close();
    }
  });

  it("keeps the created root reachable through its parent descriptor path", async () => {
    if (process.platform !== "linux") {
      return;
    }
    const dir = await createTempDir();
    const parentPath = path.join(dir, "parent");
    const detachedParentPath = path.join(dir, "parent.detached");
    await fs.mkdir(parentPath, { mode: 0o700 });
    const handle = await fs.open(parentPath, "r");
    try {
      const created = await createJsonlAuditTemporaryDirectoryEntry(
        { directoryPath: parentPath, handle },
        "wrapper-"
      );
      if (created.mode !== "descriptor_relative") {
        return;
      }
      await fs.writeFile(path.join(created.mutationPath, "marker"), "original");
      await fs.rename(parentPath, detachedParentPath);
      await fs.mkdir(parentPath, { mode: 0o700 });
      await fs.mkdir(created.path, { mode: 0o700 });

      await expect(fs.readFile(
        path.join(created.mutationPath, "marker"),
        "utf8"
      )).resolves.toBe("original");
      await expect(fs.access(path.join(created.path, "marker"))).rejects.toThrow();
    } finally {
      await handle.close();
    }
  });

  it("keeps descriptor-relative mutation anchored after logical path replacement", async () => {
    if (process.platform !== "linux") {
      return;
    }
    const dir = await createTempDir();
    const rootPath = path.join(dir, "root");
    const detachedPath = path.join(dir, "root.detached");
    const ownerPath = path.join(rootPath, "owner.json");
    const replacementOwnerPath = path.join(rootPath, "owner.json");
    await fs.mkdir(rootPath, { mode: 0o700 });
    await fs.writeFile(ownerPath, "original");
    const handle = await fs.open(rootPath, "r");
    try {
      const capability = await resolveJsonlAuditDirectoryMutationPath(
        { directoryPath: rootPath, handle },
        "owner.json"
      );
      if (capability.mode !== "descriptor_relative") {
        return;
      }
      await fs.rename(rootPath, detachedPath);
      await fs.mkdir(rootPath, { mode: 0o700 });
      await fs.writeFile(replacementOwnerPath, "replacement");

      await unlinkJsonlAuditDirectoryEntry(
        { directoryPath: rootPath, handle },
        "owner.json"
      );

      await expect(fs.access(path.join(detachedPath, "owner.json"))).rejects.toThrow();
      await expect(fs.readFile(replacementOwnerPath, "utf8")).resolves.toBe(
        "replacement"
      );
    } finally {
      await handle.close();
    }
  });

  it("waits for a cooperative filesystem lock held by another process", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    const child = spawn(process.execPath, [
      "-e",
      [
        'const fs = require("node:fs");',
        "const lockPath = process.argv[1];",
        "fs.mkdirSync(lockPath, { mode: 0o700 });",
        'process.stdout.write("locked\\n");',
        'process.stdin.once("data", () => {',
        "  fs.rmdirSync(lockPath);",
        "  process.exit(0);",
        "});"
      ].join("\n"),
      lockPath
    ], { stdio: ["pipe", "pipe", "inherit"] });
    const childExit = once(child, "exit");
    await once(child.stdout!, "data");
    let settled = false;
    const record = new JsonlAuditSink(filePath).record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: {}
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    }).finally(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(settled).toBe(false);
    await expect(fs.access(filePath)).rejects.toThrow();
    child.stdin!.end("release\n");
    await record;
    expect(await childExit).toEqual([0, null]);

    expect((await fs.readFile(filePath, "utf8")).trim().length).toBeGreaterThan(0);
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it("retries and times out cooperative filesystem lock acquisition", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const firstLock = await acquireJsonlAuditFileLock(filePath);
    if (process.platform !== "win32") {
      expect((await fs.stat(firstLock.lockPath)).mode & 0o777).toBe(0o700);
    }
    let elapsedMs = 0;
    let waits = 0;

    await expect(acquireJsonlAuditFileLock(filePath, {
      timeoutMs: DEFAULT_JSONL_AUDIT_LOCK_RETRY_MS * 2,
      retryMs: DEFAULT_JSONL_AUDIT_LOCK_RETRY_MS,
      now: () => elapsedMs,
      wait: async (milliseconds) => {
        waits += 1;
        elapsedMs += milliseconds;
      }
    })).rejects.toThrow("Timed out waiting for audit file lock");

    expect(waits).toBe(2);
    expect(DEFAULT_JSONL_AUDIT_LOCK_TIMEOUT_MS).toBe(5_000);
    await firstLock.release();
  });

  it("bounds pre-transfer lock parent close settlement during acquisition", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const heldLock = await acquireUntrackedJsonlAuditFileLock(filePath);
    const parentPath = path.dirname(getJsonlAuditLockPath(filePath));
    const injection = injectAuditHandlePendingClose(parentPath, 1);
    let elapsedMs = 0;
    let waits = 0;
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const failurePromise = acquireUntrackedJsonlAuditFileLock(filePath, {
      timeoutMs: 10,
      retryMs: 10,
      now: () => elapsedMs,
      wait: async (milliseconds) => {
        waits += 1;
        elapsedMs += milliseconds;
      }
    }).catch((error: unknown) => error);

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        failurePromise,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.rejectClose(
        new Error("late acquisition parent close rejection")
      );
      const failure = settlement.settled
        ? settlement.value
        : await failurePromise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settledWithinBound).toBe(true);
      expect(failure).toMatchObject({
        name: "Error",
        message: "Timed out waiting for audit file lock."
      });
      expect(waits).toBe(1);
      expect(injection.selectedOpenCount).toBe(2);
      expect(injection.selectedCloseCount).toBe(1);
      expect(unhandled).toEqual([]);
      expect((await fs.stat(heldLock.lockPath)).isDirectory()).toBe(true);
    } finally {
      injection.resolveClose();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
      await heldLock.release();
    }
  });

  it("bounds failed acquisition handle finalization without replacing primary", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    const ownerPath = getJsonlAuditLockOwnerPath(lockPath);
    const injection = injectAuditHandlePendingClose(
      ownerPath,
      1,
      lockPath,
      undefined,
      "injected acquisition metadata write failure"
    );
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const failurePromise = acquireUntrackedJsonlAuditFileLock(filePath)
      .catch((error: unknown) => error);

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        failurePromise,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.rejectClose(
        new Error("late acquisition owner close rejection")
      );
      const failure = settlement.settled
        ? settlement.value
        : await failurePromise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settledWithinBound).toBe(true);
      expect(failure).toMatchObject({
        name: "Error",
        message: "injected acquisition metadata write failure"
      });
      expect(injection.selectedOpenCount).toBe(1);
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.observedCloseCount).toBe(1);
      expect(unhandled).toEqual([]);
      await expect(fs.access(lockPath)).rejects.toThrow();
    } finally {
      injection.resolveClose();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  });

  it("bounds failed-open acquisition descriptor settlement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    const parentPath = path.dirname(lockPath);
    const injection = injectAuditHandlePendingClose(
      parentPath,
      1,
      undefined,
      "injected acquisition parent validation failure"
    );
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const failurePromise = acquireUntrackedJsonlAuditFileLock(filePath)
      .catch((error: unknown) => error);

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        failurePromise,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.rejectClose(
        new Error("late failed-open acquisition close rejection")
      );
      const failure = settlement.settled
        ? settlement.value
        : await failurePromise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settledWithinBound).toBe(true);
      expect(failure).toMatchObject({
        name: "Error",
        message: "injected acquisition parent validation failure"
      });
      expect(injection.selectedOpenCount).toBe(1);
      expect(injection.selectedCloseCount).toBe(1);
      expect(unhandled).toEqual([]);
      await expect(fs.access(lockPath)).rejects.toThrow();
    } finally {
      injection.resolveClose();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  });

  it("bounds failed acquisition directory stream settlement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    const streamInjection = injectAuditMaintenanceDirectoryStreamPendingClose(1);
    const originalOpen = fs.open.bind(fs);
    let ownerWriteFailed = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!ownerWriteFailed && isJsonlAuditExclusiveOwnerOpen(target, flags)) {
        ownerWriteFailed = true;
        vi.spyOn(handle, "writeFile").mockRejectedValue(
          new Error("injected acquisition stream primary failure")
        );
      }
      return handle;
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const failurePromise = acquireUntrackedJsonlAuditFileLock(filePath)
      .catch((error: unknown) => error);

    try {
      await streamInjection.closeStarted;
      await streamInjection.actualCloseCompletion;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        failurePromise,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      streamInjection.rejectClose(
        new Error("late acquisition stream close rejection")
      );
      const failure = settlement.settled
        ? settlement.value
        : await failurePromise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settledWithinBound).toBe(true);
      expect(failure).toMatchObject({
        name: "Error",
        message: "injected acquisition stream primary failure"
      });
      expect(ownerWriteFailed).toBe(true);
      expect(streamInjection.selectedStreamCount).toBe(1);
      expect(streamInjection.selectedCloseCount).toBe(1);
      expect(unhandled).toEqual([]);
      expect((await fs.stat(lockPath)).isDirectory()).toBe(true);
      await expect(fs.access(getJsonlAuditLockOwnerPath(lockPath))).resolves
        .toBeUndefined();
    } finally {
      streamInjection.resolveClose();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  });

  it("rejects bounded acquisition when a successful scan close times out", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(1);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const failurePromise = acquireUntrackedJsonlAuditFileLock(filePath)
      .catch((error: unknown) => error);

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        failurePromise,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.rejectClose(
        new Error("late successful acquisition scan close rejection")
      );
      const failure = settlement.settled
        ? settlement.value
        : await failurePromise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settledWithinBound).toBe(true);
      expect(failure).toMatchObject({
        name: "Error",
        message:
          "audit lock acquisition descriptor close timed out after 5000 ms"
      });
      expect(injection.selectedCloseCount).toBe(1);
      expect(unhandled).toEqual([]);
      await expect(fs.access(lockPath)).rejects.toThrow();
    } finally {
      injection.resolveClose();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  });

  it("validates explicit cooperative filesystem lock timing options", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");

    await expect(acquireJsonlAuditFileLock(filePath, { timeoutMs: 0 })).rejects.toThrow(
      "Invalid JSONL audit lock timeout"
    );
    await expect(acquireJsonlAuditFileLock(filePath, { retryMs: 0 })).rejects.toThrow(
      "Invalid JSONL audit lock retry interval"
    );
    await expect(acquireJsonlAuditFileLock(filePath, {
      now: () => Number.NaN
    })).rejects.toThrow("Invalid JSONL audit lock clock");
    await expect(acquireJsonlAuditFileLock(filePath, {
      now: () => Number.MAX_SAFE_INTEGER
    })).rejects.toThrow("Invalid JSONL audit lock clock");
    await expect(fs.access(getJsonlAuditLockPath(filePath))).rejects.toThrow();
    expect(getJsonlAuditLockPath(filePath)).toContain("god-code-audit-");
    expect(getJsonlAuditLockPath(filePath)).not.toBe(
      getJsonlAuditLockPath(`${filePath}.other`)
    );
  });

  it("inspects cooperative filesystem lock state without following blockers", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    const ownerPath = getJsonlAuditLockOwnerPath(lockPath);

    await expect(inspectJsonlAuditFileLock(filePath)).resolves.toEqual({
      lockPath,
      exists: false,
      acquirable: true
    });

    const acquiredAtMs = Date.parse("2026-07-22T10:30:00.000Z");
    const heldLock = await acquireJsonlAuditFileLock(filePath, {
      now: () => acquiredAtMs
    });
    const lockStatus = await fs.stat(lockPath);
    await expect(inspectJsonlAuditFileLock(
      filePath,
      () => lockStatus.mtimeMs + 25
    )).resolves.toEqual({
      lockPath,
      exists: true,
      entryType: "directory",
      acquirable: false,
      ageMs: 25,
      entryCount: 1,
      entryScanCount: 1,
      entryScanLimit: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
      entryScanTruncated: false,
      ownerPath,
      ownerMetadataStatus: "valid",
      ownerEntryExclusive: true,
      ownerToken: heldLock.ownerToken,
      ownerPid: process.pid,
      ownerAcquiredAt: "2026-07-22T10:30:00.000Z",
      ownerAcquiredAtMs: acquiredAtMs,
      ownerFingerprint: expect.stringMatching(/^[0-9a-f]{32}$/)
    });
    if (process.platform !== "win32") {
      expect((await fs.stat(ownerPath)).mode & 0o777).toBe(0o600);
    }
    await expect(inspectJsonlAuditFileLock(filePath, () => Number.NaN)).rejects.toThrow(
      "Invalid JSONL audit lock inspection clock"
    );
    await heldLock.release();

    await fs.mkdir(lockPath, { mode: 0o700 });
    await expect(inspectJsonlAuditFileLock(filePath)).resolves.toMatchObject({
      lockPath,
      exists: true,
      entryType: "directory",
      ownerPath,
      ownerMetadataStatus: "missing"
    });
    await fs.writeFile(ownerPath, "invalid", { mode: 0o600 });
    await expect(inspectJsonlAuditFileLock(filePath)).resolves.toMatchObject({
      lockPath,
      exists: true,
      entryType: "directory",
      ownerPath,
      ownerMetadataStatus: "invalid"
    });
    await fs.writeFile(ownerPath, "x".repeat(MAX_JSONL_AUDIT_LOCK_OWNER_BYTES + 1), {
      mode: 0o600
    });
    await expect(inspectJsonlAuditFileLock(filePath)).resolves.toMatchObject({
      ownerMetadataStatus: "invalid"
    });
    expect((await fs.stat(ownerPath)).size).toBe(MAX_JSONL_AUDIT_LOCK_OWNER_BYTES + 1);

    if (process.platform !== "win32") {
      const ownerVictim = path.join(dir, "owner-victim.txt");
      await fs.rm(ownerPath);
      await fs.writeFile(ownerVictim, "unchanged", { mode: 0o600 });
      await fs.symlink(ownerVictim, ownerPath);
      await expect(inspectJsonlAuditFileLock(filePath)).resolves.toMatchObject({
        ownerMetadataStatus: "invalid"
      });
      expect(await fs.readFile(ownerVictim, "utf8")).toBe("unchanged");
    }
    await fs.rm(lockPath, { recursive: true });

    await fs.writeFile(lockPath, "blocker", { mode: 0o600 });
    await expect(inspectJsonlAuditFileLock(filePath)).resolves.toMatchObject({
      lockPath,
      exists: true,
      entryType: "regular_file",
      acquirable: false,
      ageMs: expect.any(Number)
    });
    expect(await fs.readFile(lockPath, "utf8")).toBe("blocker");
    await fs.rm(lockPath);

    if (process.platform !== "win32") {
      const victim = path.join(dir, "victim.txt");
      await fs.writeFile(victim, "unchanged", { mode: 0o600 });
      await fs.symlink(victim, lockPath);
      await expect(inspectJsonlAuditFileLock(filePath)).resolves.toMatchObject({
        lockPath,
        exists: true,
        entryType: "symbolic_link",
        acquirable: false
      });
      expect(await fs.readFile(victim, "utf8")).toBe("unchanged");
      await fs.rm(lockPath);
    }
  });

  it("bounds stable active lock child scans and withholds truncated owner authority", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const overflowNames = ["overflow-secret-a", "overflow-secret-b"];
    await Promise.all(overflowNames.map((name) => fs.writeFile(
      path.join(lock.lockPath, name),
      "preserved\n",
      { mode: 0o600 }
    )));
    const originalOpendir = fs.opendir.bind(fs);
    let opendirCalls = 0;
    let readCalls = 0;
    vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
      let resolvedTarget = path.resolve(String(target));
      try {
        resolvedTarget = await fs.realpath(target);
      } catch {
        // Preserve the original open behavior for disappearing paths.
      }
      const directory = await originalOpendir(target, options);
      if (resolvedTarget === path.resolve(lock.lockPath)) {
        opendirCalls += 1;
        const read = directory.read.bind(directory);
        vi.spyOn(directory, "read").mockImplementation(async () => {
          readCalls += 1;
          return read();
        });
      }
      return directory;
    });
    const readdir = vi.spyOn(fs, "readdir");

    const inspection = await inspectJsonlAuditFileLock(filePath);

    expect(opendirCalls).toBe(2);
    expect(readCalls).toBe(
      2 * (MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES + 1)
    );
    expect(readdir).not.toHaveBeenCalled();
    expect(inspection).toMatchObject({
      lockPath: lock.lockPath,
      exists: true,
      entryType: "directory",
      acquirable: false,
      entryScanCount: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
      entryScanLimit: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
      entryScanTruncated: true,
      ownerEntryExclusive: false
    });
    expect(inspection.entryCount).toBeUndefined();
    expect(inspection.ownerMetadataStatus).toBeUndefined();
    expect(inspection.ownerToken).toBeUndefined();
    const serialized = JSON.stringify(inspection);
    for (const overflowName of overflowNames) {
      expect(serialized).not.toContain(overflowName);
    }

    vi.restoreAllMocks();
    await Promise.all(overflowNames.map(
      (name) => fs.rm(path.join(lock.lockPath, name))
    ));
    await lock.release();
  });

  it("withdraws active lock owner authority when children change during inspection", async () => {
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

    const inspection = await inspectJsonlAuditFileLock(filePath);

    expect(injected).toBe(true);
    expect(inspection).toMatchObject({
      entryCount: 1,
      entryScanCount: 1,
      entryScanLimit: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
      entryScanTruncated: false,
      ownerEntryExclusive: false,
      stateChanged: true
    });
    expect(inspection.ownerMetadataStatus).toBeUndefined();
    expect(inspection.ownerToken).toBeUndefined();
    expect(await fs.readFile(extraPath, "utf8")).toBe("preserved\n");

    vi.restoreAllMocks();
    await fs.rm(extraPath);
    await lock.release();
  });

  it("withdraws active lock owner authority after a copied owner replacement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const movedOwnerPath = `${lock.ownerPath}.original`;
    const originalOpendir = fs.opendir.bind(fs);
    let selectedScans = 0;
    let replaced = false;
    vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
      let resolvedTarget = path.resolve(String(target));
      try {
        resolvedTarget = await fs.realpath(target);
      } catch {
        // Preserve the original open behavior for disappearing paths.
      }
      if (resolvedTarget === path.resolve(lock.lockPath)) {
        selectedScans += 1;
        if (selectedScans === 2) {
          replaced = true;
          await fs.rename(lock.ownerPath, movedOwnerPath);
          await fs.copyFile(movedOwnerPath, lock.ownerPath);
        }
      }
      return originalOpendir(target, options);
    });

    const inspection = await inspectJsonlAuditFileLock(filePath);

    expect(replaced).toBe(true);
    expect(inspection).toMatchObject({
      entryCount: 1,
      entryScanCount: 1,
      entryScanLimit: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
      entryScanTruncated: false,
      ownerEntryExclusive: false,
      stateChanged: true
    });
    expect(inspection.ownerMetadataStatus).toBeUndefined();
    expect(inspection.ownerToken).toBeUndefined();

    vi.restoreAllMocks();
    await fs.rm(lock.ownerPath);
    await fs.rename(movedOwnerPath, lock.ownerPath);
    await lock.release();
  });

  it("withdraws active lock owner authority after terminal directory rebinding", async () => {
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

    try {
      const inspection = await inspectJsonlAuditFileLock(filePath);

      expect(injected).toBe(true);
      expect(ownerPathReads).toBe(5);
      expect((await originalLstat(lock.lockPath)).isSymbolicLink()).toBe(true);
      expect(inspection).toMatchObject({
        entryCount: 1,
        entryScanCount: 1,
        entryScanLimit: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
        entryScanTruncated: false,
        ownerEntryExclusive: false,
        stateChanged: true
      });
      expect(inspection.ownerMetadataStatus).toBeUndefined();
      expect(inspection.ownerToken).toBeUndefined();
      expect(inspection.inspectionErrorCode).toBeUndefined();
      expect(JSON.stringify(inspection)).not.toContain(hiddenName);
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

  it("withdraws active lock owner authority after terminal directory generation drift", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const extraName = "terminal-late-secret";
    const extraPath = path.join(lock.lockPath, extraName);
    const generationPulsePath = path.join(
      lock.lockPath,
      ".terminal-generation-pulse"
    );
    const originalLstat = fs.lstat.bind(fs);
    const originalOpen = fs.open.bind(fs);
    const originalUnlink = fs.unlink.bind(fs);
    const initialDirectoryStatus = await originalLstat(lock.lockPath, {
      bigint: true
    });
    const initialDirectoryCtimeNs = initialDirectoryStatus.ctimeNs;
    let ownerPathReads = 0;
    let injected = false;
    let generationObserved = false;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.resolve(String(target)) === path.resolve(lock.ownerPath)) {
        ownerPathReads += 1;
        if (ownerPathReads === 4) {
          const extra = await originalOpen(extraPath, "w", 0o600);
          try {
            await extra.writeFile("preserved\n");
          } finally {
            await extra.close();
          }
          generationObserved = (
            await originalLstat(lock.lockPath, { bigint: true })
          ).ctimeNs !== initialDirectoryCtimeNs;
          if (!generationObserved) {
            // Some mounted filesystems expose directory ctime lazily under load.
            await new Promise((resolve) => setTimeout(resolve, 1_100));
            const pulse = await originalOpen(generationPulsePath, "w", 0o600);
            await pulse.close();
            await originalUnlink(generationPulsePath);
            generationObserved = (
              await originalLstat(lock.lockPath, { bigint: true })
            ).ctimeNs !== initialDirectoryCtimeNs;
          }
          injected = true;
        }
      }
      return originalLstat(target, options);
    });

    try {
      const inspection = await inspectJsonlAuditFileLock(filePath);

      expect(injected).toBe(true);
      expect(generationObserved).toBe(true);
      expect(ownerPathReads).toBeGreaterThanOrEqual(5);
      expect(inspection).toMatchObject({
        entryCount: 1,
        entryScanCount: 1,
        entryScanLimit: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
        entryScanTruncated: false,
        ownerEntryExclusive: false,
        stateChanged: true
      });
      expect(inspection.ownerMetadataStatus).toBeUndefined();
      expect(inspection.ownerToken).toBeUndefined();
      expect(inspection.inspectionErrorCode).toBeUndefined();
      expect(JSON.stringify(inspection)).not.toContain(extraName);
      expect(await fs.readFile(extraPath, "utf8")).toBe("preserved\n");
    } finally {
      vi.restoreAllMocks();
      await fs.rm(generationPulsePath, { force: true });
      await fs.rm(extraPath, { force: true });
      await lock.release();
    }
  });

  it("withdraws active lock owner authority after terminal owner file generation drift", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const replacementToken = "00000000-0000-4000-8000-000000000041";
    const originalLstat = fs.lstat.bind(fs);
    let lockPathReads = 0;
    let rewritten = false;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.resolve(String(target)) === path.resolve(lock.lockPath)) {
        lockPathReads += 1;
        if (lockPathReads === 5) {
          const persisted = JSON.parse(
            await fs.readFile(lock.ownerPath, "utf8")
          ) as Record<string, unknown>;
          persisted.owner_token = replacementToken;
          await fs.writeFile(
            lock.ownerPath,
            `${JSON.stringify(persisted)}\n`,
            { encoding: "utf8" }
          );
          rewritten = true;
        }
      }
      return originalLstat(target, options);
    });

    try {
      const inspection = await inspectJsonlAuditFileLock(filePath);

      expect(rewritten).toBe(true);
      expect(lockPathReads).toBe(5);
      expect(inspection).toMatchObject({
        entryCount: 1,
        entryScanCount: 1,
        entryScanLimit: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
        entryScanTruncated: false,
        ownerEntryExclusive: false,
        stateChanged: true
      });
      expect(inspection.ownerMetadataStatus).toBeUndefined();
      expect(inspection.ownerToken).toBeUndefined();
      expect(inspection.inspectionErrorCode).toBeUndefined();
      expect(JSON.stringify(inspection)).not.toContain(lock.ownerToken);
      expect(JSON.stringify(inspection)).not.toContain(replacementToken);
      expect(JSON.parse(await fs.readFile(lock.ownerPath, "utf8"))).toMatchObject({
        owner_token: replacementToken
      });
    } finally {
      vi.restoreAllMocks();
      await lock.abandon();
      await fs.rm(lock.lockPath, { recursive: true, force: true });
    }
  });

  it("refuses to release a lock after owner token replacement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });
    const persisted = JSON.parse(await fs.readFile(lock.ownerPath, "utf8")) as {
      owner_token: string;
    };
    persisted.owner_token = "00000000-0000-4000-8000-000000000000";
    await fs.writeFile(lock.ownerPath, `${JSON.stringify(persisted)}\n`, {
      encoding: "utf8"
    });

    await expect(lock.release()).rejects.toThrow(
      "Audit file lock changed before release"
    );
    await expect(inspectJsonlAuditFileLock(filePath)).resolves.toMatchObject({
      ownerMetadataStatus: "valid",
      ownerToken: "00000000-0000-4000-8000-000000000000"
    });
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await fs.rm(lock.lockPath, { recursive: true });
  });

  it("releases with the acquisition-time owner descriptor without reopening it", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const open = vi.spyOn(fs, "open").mockRejectedValue(
      new Error("release must not reopen owner metadata")
    );

    await lock.release();

    expect(open).not.toHaveBeenCalled();
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    await lock.release();
  });

  it("bounds pending cooperative lock release handle settlement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const injection = injectAuditLockLifecycleHandlePendingClose(filePath);
    const lock = await acquireUntrackedJsonlAuditFileLock(filePath);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const failurePromise = lock.release().catch((error: unknown) => error);

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await Promise.all(injection.otherCloseCompletions);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        failurePromise,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.rejectClose(new Error("late lock lifecycle close rejection"));
      const failure = settlement.settled
        ? settlement.value
        : await failurePromise;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settledWithinBound).toBe(true);
      expect(failure).toMatchObject({
        name: "JsonlAuditLockLifecycleCloseError",
        message: "audit lock lifecycle descriptor close timed out after 5000 ms"
      });
      expect(injection.selectedOpenCount).toBe(1);
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.lockDirectoryCloseCount).toBe(1);
      expect(injection.parentCloseCount).toBe(1);
      expect(unhandled).toEqual([]);
      await expect(fs.access(lock.lockPath)).rejects.toThrow();
      await expect(lock.release()).rejects.toThrow(
        "audit lock lifecycle descriptor close timed out after 5000 ms"
      );
      await expect(lock.abandon()).rejects.toThrow(
        "audit lock lifecycle descriptor close timed out after 5000 ms"
      );
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.lockDirectoryCloseCount).toBe(1);
      expect(injection.parentCloseCount).toBe(1);
    } finally {
      injection.resolveClose();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
      await fs.rm(lock.lockPath, { recursive: true, force: true });
    }
  });

  it("bounds pending cooperative lock abandon handle settlement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const injection = injectAuditLockLifecycleHandlePendingClose(filePath);
    const lock = await acquireUntrackedJsonlAuditFileLock(filePath);
    const ownerContent = await fs.readFile(lock.ownerPath, "utf8");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const failurePromise = lock.abandon().catch((error: unknown) => error);

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await Promise.all(injection.otherCloseCompletions);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        failurePromise,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.resolveClose();
      const failure = settlement.settled
        ? settlement.value
        : await failurePromise;

      expect(settledWithinBound).toBe(true);
      expect(failure).toMatchObject({
        name: "JsonlAuditLockLifecycleCloseError",
        message: "audit lock lifecycle descriptor close timed out after 5000 ms"
      });
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.lockDirectoryCloseCount).toBe(1);
      expect(injection.parentCloseCount).toBe(1);
      expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
      expect(await fs.readFile(lock.ownerPath, "utf8")).toBe(ownerContent);
      await expect(lock.abandon()).rejects.toThrow(
        "audit lock lifecycle descriptor close timed out after 5000 ms"
      );
      await expect(lock.release()).rejects.toThrow(
        "Audit file lock was abandoned before release"
      );
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.lockDirectoryCloseCount).toBe(1);
      expect(injection.parentCloseCount).toBe(1);
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
      await fs.rm(lock.lockPath, { recursive: true, force: true });
    }
  });

  it("bounds cooperative lock release stream settlement before owner unlink", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireUntrackedJsonlAuditFileLock(filePath);
    tempDirs.push(lock.lockPath);
    const ownerContent = await fs.readFile(lock.ownerPath, "utf8");
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(1);

    try {
      const settlement = await captureAuditPendingCloseFailure(
        () => lock.release(),
        injection,
        "late lifecycle pre-release stream close rejection"
      );

      expect(settlement.settledWithinBound).toBe(true);
      expect(settlement.failure).toMatchObject({
        name: "Error",
        message:
          "audit lock lifecycle descriptor close timed out after 5000 ms"
      });
      expect(injection.selectedStreamCount).toBe(1);
      expect(injection.selectedCloseCount).toBe(1);
      expect(settlement.unhandled).toEqual([]);
      expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
      expect(await fs.readFile(lock.ownerPath, "utf8")).toBe(ownerContent);
    } finally {
      await lock.abandon().catch(() => undefined);
    }
  });

  it("preserves lifecycle scan primary across stream close timeout", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireUntrackedJsonlAuditFileLock(filePath);
    tempDirs.push(lock.lockPath);
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(
      1,
      "injected lifecycle scan primary failure"
    );

    try {
      const settlement = await captureAuditPendingCloseFailure(
        () => lock.release(),
        injection,
        "late lifecycle primary stream close rejection"
      );

      expect(settlement.settledWithinBound).toBe(true);
      expect(settlement.failure).toMatchObject({
        name: "Error",
        message: "injected lifecycle scan primary failure"
      });
      expect(injection.selectedStreamCount).toBe(1);
      expect(injection.selectedCloseCount).toBe(1);
      expect(settlement.unhandled).toEqual([]);
      expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
      expect((await fs.stat(lock.ownerPath)).isFile()).toBe(true);
    } finally {
      await lock.abandon().catch(() => undefined);
    }
  });

  it("preserves owner unlink across post-release stream close timeout", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireUntrackedJsonlAuditFileLock(filePath);
    tempDirs.push(lock.lockPath);
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(2);

    try {
      const settlement = await captureAuditPendingCloseFailure(
        () => lock.release(),
        injection,
        "late lifecycle post-owner stream close rejection"
      );

      expect(settlement.settledWithinBound).toBe(true);
      expect(settlement.failure).toMatchObject({
        name: "Error",
        message:
          "audit lock lifecycle descriptor close timed out after 5000 ms"
      });
      expect(injection.selectedStreamCount).toBe(2);
      expect(injection.selectedCloseCount).toBe(1);
      expect(settlement.unhandled).toEqual([]);
      expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
      await expect(fs.access(lock.ownerPath)).rejects.toThrow();
      expect(await fs.readdir(lock.lockPath)).toEqual([]);
    } finally {
      await lock.abandon().catch(() => undefined);
    }
  });

  it("bounds writer release stream settlement after committed record", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    const ownerPath = getJsonlAuditLockOwnerPath(lockPath);
    tempDirs.push(lockPath);
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(2);
    const settlement = await captureAuditPendingCloseFailure(
      () => new JsonlAuditSink(filePath).record(
        createRequestedAuditEvent(dir, "lifecycle-stream-writer")
      ),
      injection,
      "late writer lifecycle stream close rejection"
    );

    expect(settlement.settledWithinBound).toBe(true);
    expect(settlement.failure).toMatchObject({
      name: "Error",
      message: "audit lock lifecycle descriptor close timed out after 5000 ms"
    });
    expect(injection.selectedStreamCount).toBe(2);
    expect(injection.selectedCloseCount).toBe(1);
    expect(settlement.unhandled).toEqual([]);
    expect(await fs.readFile(filePath, "utf8")).toContain(
      "lifecycle-stream-writer"
    );
    expect((await fs.stat(lockPath)).isDirectory()).toBe(true);
    expect((await fs.stat(ownerPath)).isFile()).toBe(true);
  });

  it("bounds writer settlement when cooperative lock close stays pending", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const injection = injectAuditLockLifecycleHandlePendingClose(filePath);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const failurePromise = new JsonlAuditSink(filePath).record(
      createRequestedAuditEvent(dir, "lifecycle-writer")
    ).catch((error: unknown) => error);

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await Promise.all(injection.otherCloseCompletions);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        failurePromise,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.resolveClose();
      const failure = settlement.settled
        ? settlement.value
        : await failurePromise;

      expect(settledWithinBound).toBe(true);
      expect(failure).toMatchObject({
        name: "JsonlAuditLockLifecycleCloseError",
        message: "audit lock lifecycle descriptor close timed out after 5000 ms"
      });
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.lockDirectoryCloseCount).toBe(1);
      expect(injection.parentCloseCount).toBe(1);
      expect(await fs.readFile(filePath, "utf8")).toContain(
        "lifecycle-writer"
      );
      await expect(fs.access(getJsonlAuditLockPath(filePath))).rejects.toThrow();
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
      await fs.rm(getJsonlAuditLockPath(filePath), {
        recursive: true,
        force: true
      });
    }
  });

  it("abandons runtime descriptor ownership without changing the disk lock", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const ownerContent = await fs.readFile(lock.ownerPath, "utf8");

    await lock.abandon();
    await lock.abandon();

    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    expect(await fs.readFile(lock.ownerPath, "utf8")).toBe(ownerContent);
    await expect(lock.release()).rejects.toThrow(
      "Audit file lock was abandoned before release"
    );
    await expect(cleanupJsonlAuditFileLock(
      filePath,
      ownerFingerprint
    )).resolves.toMatchObject({
      existed: true,
      removed: true,
      ownerFingerprint
    });
  });

  it("serializes concurrent release and abandon operations", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);

    await Promise.all([lock.release(), lock.abandon()]);

    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    await lock.release();
    await lock.abandon();
  });

  it("uses descriptor-relative paths for runtime owner creation and release", async () => {
    const dir = await createTempDir();
    if (!await supportsJsonlAuditDescriptorRelativeMutation(dir)) {
      return;
    }
    const filePath = path.join(dir, "audit.jsonl");
    const openPaths: string[] = [];
    const unlinkPaths: string[] = [];
    const rmdirPaths: string[] = [];
    const originalOpen = fs.open.bind(fs);
    const originalUnlink = fs.unlink.bind(fs);
    const originalRmdir = fs.rmdir.bind(fs);
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      openPaths.push(String(target));
      return originalOpen(target, flags, mode);
    });
    vi.spyOn(fs, "unlink").mockImplementation(async (target) => {
      unlinkPaths.push(String(target));
      await originalUnlink(target);
    });
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      rmdirPaths.push(String(target));
      await originalRmdir(target, options);
    });

    const lock = await acquireJsonlAuditFileLock(filePath);
    tempDirs.push(lock.lockPath);
    await lock.release();

    expect(openPaths.some(
      (openedPath) => openedPath.startsWith("/proc/self/fd/")
        && path.basename(openedPath) === JSONL_AUDIT_LOCK_OWNER_FILE_NAME
    )).toBe(true);
    expect(unlinkPaths).toHaveLength(1);
    expect(rmdirPaths).toHaveLength(1);
    expect([...unlinkPaths, ...rmdirPaths].every(
      (mutationPath) => mutationPath.startsWith("/proc/self/fd/")
    )).toBe(true);
  });

  it("cleans an exclusive owner entry after a zero-byte metadata write failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && isJsonlAuditExclusiveOwnerOpen(target, flags)) {
        injected = true;
        vi.spyOn(handle, "writeFile").mockRejectedValue(
          new Error("injected owner metadata write failure")
        );
      }
      return handle;
    });

    await expect(acquireJsonlAuditFileLock(filePath)).rejects.toThrow(
      "injected owner metadata write failure"
    );

    expect(injected).toBe(true);
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it("cleans an exclusive owner entry after a partial metadata write failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && isJsonlAuditExclusiveOwnerOpen(target, flags)) {
        injected = true;
        vi.spyOn(handle, "writeFile").mockImplementation(async () => {
          await handle.write(Buffer.from('{"version":1'), 0, 12, 0);
          throw new Error("injected partial owner metadata write failure");
        });
      }
      return handle;
    });

    await expect(acquireJsonlAuditFileLock(filePath)).rejects.toThrow(
      "injected partial owner metadata write failure"
    );

    expect(injected).toBe(true);
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it("preserves an owner replacement after metadata persistence fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    const ownerPath = getJsonlAuditLockOwnerPath(lockPath);
    const movedOwnerPath = path.join(lockPath, "owner.original");
    tempDirs.push(lockPath);
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && isJsonlAuditExclusiveOwnerOpen(target, flags)) {
        injected = true;
        vi.spyOn(handle, "writeFile").mockImplementation(async () => {
          const original = Buffer.from("original-owner\n");
          await handle.write(original, 0, original.length, 0);
          await fs.rename(ownerPath, movedOwnerPath);
          await fs.writeFile(ownerPath, "replacement-owner\n", { mode: 0o600 });
          throw new Error("injected replaced owner metadata write failure");
        });
      }
      return handle;
    });

    await expect(acquireJsonlAuditFileLock(filePath)).rejects.toThrow(
      "injected replaced owner metadata write failure"
    );

    expect(injected).toBe(true);
    expect(await fs.readFile(ownerPath, "utf8")).toBe("replacement-owner\n");
    expect(await fs.readFile(movedOwnerPath, "utf8")).toBe("original-owner\n");
    expect((await fs.readdir(lockPath)).sort()).toEqual([
      JSONL_AUDIT_LOCK_OWNER_FILE_NAME,
      "owner.original"
    ]);
  });

  it("rejects a wrong-object owner unlink that reports success", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    tempDirs.push(lock.lockPath);
    const detachedOwnerPath = path.join(lock.lockPath, "owner.detached");
    const originalUnlink = fs.unlink.bind(fs);
    let unlinkIntercepted = false;
    vi.spyOn(fs, "unlink").mockImplementation(async (target) => {
      if (
        !unlinkIntercepted
        && path.basename(String(target)) === JSONL_AUDIT_LOCK_OWNER_FILE_NAME
      ) {
        unlinkIntercepted = true;
        await fs.rename(lock.ownerPath, detachedOwnerPath);
        await fs.copyFile(detachedOwnerPath, lock.ownerPath);
        await originalUnlink(target);
        return;
      }
      await originalUnlink(target);
    });

    await expect(lock.release()).rejects.toThrow(
      "Audit file lock changed before release"
    );

    expect((await fs.stat(detachedOwnerPath)).isFile()).toBe(true);
    await expect(fs.access(lock.ownerPath)).rejects.toThrow();
    await lock.abandon();
  });

  it("rejects a wrong-object lock directory removal that reports success", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const detachedLockPath = `${lock.lockPath}.detached`;
    tempDirs.push(detachedLockPath);
    const originalRmdir = fs.rmdir.bind(fs);
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      const targetPath = String(target);
      if (path.basename(targetPath) === path.basename(lock.lockPath)) {
        await fs.rename(lock.lockPath, detachedLockPath);
        await fs.mkdir(lock.lockPath, { mode: 0o700 });
        await originalRmdir(targetPath);
        return;
      }
      await originalRmdir(target, options);
    });

    await expect(lock.release()).rejects.toThrow(
      "Audit file lock changed before release"
    );

    expect(await fs.readdir(detachedLockPath)).toEqual([]);
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    await lock.abandon();
  });

  it("refuses to release a copied-metadata owner file replacement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const movedOwnerPath = `${lock.lockPath}.owner-original`;
    tempDirs.push(lock.lockPath, movedOwnerPath);

    await fs.rename(lock.ownerPath, movedOwnerPath);
    await fs.copyFile(movedOwnerPath, lock.ownerPath);

    await expect(lock.release()).rejects.toThrow(
      "Audit file lock changed before release"
    );
    expect(await fs.readFile(lock.ownerPath, "utf8")).toBe(
      await fs.readFile(movedOwnerPath, "utf8")
    );
  });

  it("refuses to release a replacement lock directory with copied owner metadata", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const movedLockPath = `${lock.lockPath}.moved`;
    await fs.rename(lock.lockPath, movedLockPath);
    await fs.mkdir(lock.lockPath, { mode: 0o700 });
    await fs.copyFile(
      getJsonlAuditLockOwnerPath(movedLockPath),
      lock.ownerPath
    );

    await expect(lock.release()).rejects.toThrow(
      "Audit file lock changed before release"
    );
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    expect((await fs.stat(movedLockPath)).isDirectory()).toBe(true);
    await fs.rm(lock.lockPath, { recursive: true });
    await fs.rm(movedLockPath, { recursive: true });
  });

  it("removes only the identity-bound lock selected by its owner fingerprint", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await fs.writeFile(filePath, "unchanged", { mode: 0o600 });
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);

    expect(ownerFingerprint).toMatch(/^[0-9a-f]{32}$/u);
    expect(ownerFingerprint).not.toContain(lock.ownerToken);
    await expect(cleanupJsonlAuditFileLock(
      filePath,
      ownerFingerprint
    )).resolves.toEqual({
      lockPath: lock.lockPath,
      existed: true,
      removed: true,
      ownerFingerprint,
      cleanupHandlesClosed: true
    });

    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect(await fs.readFile(filePath, "utf8")).toBe("unchanged");
    await expect(lock.release()).rejects.toThrow(
      "Audit file lock changed before release"
    );
  });

  it("uses descriptor-relative mutations throughout main private cleanup", async () => {
    if (process.platform !== "linux") {
      return;
    }
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const probeHandle = await fs.open(dir, "r");
    const capability = await resolveJsonlAuditDirectoryMutationPath(
      { directoryPath: dir, handle: probeHandle },
      "probe"
    );
    await probeHandle.close();
    if (capability.mode !== "descriptor_relative") {
      return;
    }
    const lock = await acquireJsonlAuditFileLock(filePath);
    tempDirs.push(lock.lockPath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const renamePaths: string[] = [];
    const unlinkPaths: string[] = [];
    const rmdirPaths: string[] = [];
    const originalRename = fs.rename.bind(fs);
    const originalUnlink = fs.unlink.bind(fs);
    const originalRmdir = fs.rmdir.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
      renamePaths.push(String(source), String(destination));
      await originalRename(source, destination);
    });
    vi.spyOn(fs, "unlink").mockImplementation(async (target) => {
      unlinkPaths.push(String(target));
      await originalUnlink(target);
    });
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      rmdirPaths.push(String(target));
      await originalRmdir(target, options);
    });

    await expect(cleanupJsonlAuditFileLock(
      filePath,
      ownerFingerprint
    )).resolves.toMatchObject({ existed: true, removed: true });

    expect(renamePaths).toHaveLength(4);
    expect(unlinkPaths).toHaveLength(1);
    expect(rmdirPaths).toHaveLength(2);
    expect([...renamePaths, ...unlinkPaths, ...rmdirPaths].every(
      (mutationPath) => mutationPath.startsWith("/proc/self/fd/")
    )).toBe(true);
  });

  it("refuses a replacement private quarantine root before main cleanup", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const quarantinePrefix = getJsonlAuditLockQuarantinePrefix(filePath);
    let quarantineRoot = "";
    let detachedRoot = "";

    await expect(cleanupJsonlAuditFileLock(
      filePath,
      ownerFingerprint,
      {
        beforeQuarantine: async () => {
          quarantineRoot = await findSingleAuditTemporaryPath(quarantinePrefix);
          detachedRoot = `${quarantineRoot}.detached`;
          tempDirs.push(quarantineRoot, detachedRoot);
          await fs.rename(quarantineRoot, detachedRoot);
          await fs.mkdir(quarantineRoot, { mode: 0o700 });
        }
      }
    )).rejects.toThrow("quarantine retained");

    expect(await fs.readdir(quarantineRoot)).toEqual([]);
    expect(await fs.readdir(detachedRoot)).toEqual([]);
    expect(await fs.readdir(lock.lockPath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("reports a residual for wrong-object private quarantine root removal", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const quarantinePrefix = getJsonlAuditLockQuarantinePrefix(filePath);
    const quarantineParent = path.dirname(quarantinePrefix);
    const quarantineNamePrefix = path.basename(quarantinePrefix);
    const originalRmdir = fs.rmdir.bind(fs);
    let detachedRoot = "";
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      const targetPath = String(target);
      const targetName = path.basename(targetPath);
      if (
        detachedRoot.length === 0
        && targetName.startsWith(quarantineNamePrefix)
      ) {
        const logicalTargetPath = path.join(quarantineParent, targetName);
        detachedRoot = `${logicalTargetPath}.detached`;
        tempDirs.push(detachedRoot);
        await fs.rename(logicalTargetPath, detachedRoot);
        await fs.mkdir(logicalTargetPath, { mode: 0o700 });
        await originalRmdir(targetPath);
        return;
      }
      await originalRmdir(target, options);
    });

    const cleanup = await cleanupJsonlAuditFileLock(
      filePath,
      ownerFingerprint
    );

    expect(cleanup).toMatchObject({
      existed: true,
      removed: true,
      ownerFingerprint,
      residualQuarantinePath: expect.stringContaining(quarantineNamePrefix)
    });
    expect(await fs.readdir(detachedRoot)).toEqual([]);
    await expect(fs.access(cleanup.residualQuarantinePath!)).rejects.toThrow();
  });

  it("preserves committed active cleanup when descriptor finalization fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      lock.lockPath,
      "injected maintenance handle close failure"
    );

    const cleanup = await cleanupJsonlAuditFileLock(
      filePath,
      ownerFingerprint
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.selectedOpenCount).toBeGreaterThan(0);
    expect(cleanup).toMatchObject({
      existed: true,
      removed: true,
      ownerFingerprint,
      cleanupHandlesClosed: false,
      cleanupHandleWarning: expect.stringContaining(
        "injected maintenance handle close failure"
      )
    });
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
  });

  it("preserves the primary cleanup error when descriptor finalization also fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      lock.lockPath,
      "secondary maintenance handle close failure",
      lock.ownerPath
    );

    let failure: unknown;
    try {
      await cleanupJsonlAuditFileLock(
        filePath,
        ownerFingerprint,
        {
          beforeQuarantine: () => {
            throw new Error("primary maintenance failure");
          }
        }
      );
    } catch (error) {
      failure = error;
    }
    await closeFailure.closeCompletion;

    expect(closeFailure.selectedOpenCount).toBeGreaterThan(0);
    expect(closeFailure.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "primary maintenance failure",
      details: {
        operation: "active_lock_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "secondary maintenance handle close failure"
        )
      }
    });
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("preserves candidate-selection failure when descriptor finalization also fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      lock.lockPath,
      "candidate-selection handle close failure",
      lock.ownerPath
    );

    let failure: unknown;
    try {
      await cleanupJsonlAuditFileLock(filePath, "0".repeat(32));
    } catch (error) {
      failure = error;
    }
    await closeFailure.closeCompletion;

    expect(closeFailure.selectedOpenCount).toBeGreaterThan(0);
    expect(closeFailure.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "Audit file lock owner fingerprint does not match.",
      details: {
        operation: "active_lock_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "candidate-selection handle close failure"
        )
      }
    });
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("preserves a candidate opener validation failure and its close evidence", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const injection = injectAuditMaintenanceOpenValidationFailure(
      lock.lockPath,
      "candidate opener primary validation failure",
      "candidate opener secondary close failure"
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditFileLock(filePath, ownerFingerprint)
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedOpenCount).toBe(1);
    expect(injection.selectedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "candidate opener primary validation failure",
      details: {
        operation: "active_lock_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "candidate opener secondary close failure"
        )
      }
    });
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("does not project handle evidence when candidate open acquires no descriptor", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const originalOpen = fs.open.bind(fs);
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      if (String(target) === lock.lockPath) {
        throw new Error("candidate open failed before descriptor acquisition");
      }
      return originalOpen(target, flags, mode);
    });

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditFileLock(filePath, ownerFingerprint)
    );

    expect(failure).toMatchObject({
      name: "Error",
      message: "candidate open failed before descriptor acquisition"
    });
    expect((failure as { details?: unknown }).details).toBeUndefined();
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("hands private cleanup initialization handles to the outer finalizer", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const quarantinePrefix = getJsonlAuditLockQuarantinePrefix(filePath);
    const injection = injectAuditPrivateDirectoryInitializationFailure(
      quarantinePrefix,
      "private cleanup initialization primary failure",
      "private cleanup initialization close failure"
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditFileLock(filePath, ownerFingerprint)
    );
    await injection.privateCloseCompletion;

    expect(injection.privateDirectoryOpened).toBe(true);
    expect(injection.privateCloseCount).toBe(1);
    expect(injection.parentCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "private cleanup initialization primary failure",
      details: {
        operation: "active_lock_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "private cleanup initialization close failure"
        )
      }
    });
    const retained = (await fs.readdir(path.dirname(quarantinePrefix)))
      .filter((entry) => entry.startsWith(path.basename(quarantinePrefix)));
    expect(retained).toEqual([]);
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("preserves a candidate scan primary error when stream close also fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const injection = injectAuditMaintenanceDirectoryStreamFailure(
      1,
      "candidate scan stream close failure",
      "candidate scan primary read failure"
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditFileLock(filePath, ownerFingerprint)
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedStreamCount).toBeGreaterThanOrEqual(1);
    expect(injection.selectedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "candidate scan primary read failure",
      details: {
        operation: "active_lock_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "candidate scan stream close failure"
        )
      }
    });
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("preserves committed cleanup when a candidate scan stream close fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const injection = injectAuditMaintenanceDirectoryStreamFailure(
      1,
      "candidate scan result close failure"
    );

    const cleanup = await cleanupJsonlAuditFileLock(
      filePath,
      ownerFingerprint
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedStreamCount).toBeGreaterThan(1);
    expect(injection.selectedCloseCount).toBe(1);
    expect(cleanup).toMatchObject({
      existed: true,
      removed: true,
      ownerFingerprint,
      cleanupHandlesClosed: false,
      cleanupHandleWarning: expect.stringContaining(
        "candidate scan result close failure"
      )
    });
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
  });

  it("preserves cleanup when a private initialization stream close fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const injection = injectAuditMaintenanceDirectoryStreamFailure(
      2,
      "private initialization stream close failure"
    );

    const cleanup = await cleanupJsonlAuditFileLock(
      filePath,
      ownerFingerprint
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedStreamCount).toBeGreaterThan(2);
    expect(injection.selectedCloseCount).toBe(1);
    expect(cleanup).toMatchObject({
      existed: true,
      removed: true,
      ownerFingerprint,
      cleanupHandlesClosed: false,
      cleanupHandleWarning: expect.stringContaining(
        "private initialization stream close failure"
      )
    });
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
  });

  it("aggregates directory stream and FileHandle finalization failures", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const handleFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      lock.lockPath,
      "combined FileHandle close failure"
    );
    const streamFailure = injectAuditMaintenanceDirectoryStreamFailure(
      1,
      "combined directory stream close failure"
    );

    const cleanup = await cleanupJsonlAuditFileLock(
      filePath,
      ownerFingerprint
    );
    await Promise.all([
      handleFailure.closeCompletion,
      streamFailure.selectedCloseCompletion
    ]);

    expect(handleFailure.selectedOpenCount).toBeGreaterThan(0);
    expect(streamFailure.selectedCloseCount).toBe(1);
    expect(cleanup).toMatchObject({
      existed: true,
      removed: true,
      cleanupHandlesClosed: false,
      cleanupHandleWarning: expect.stringContaining(
        "combined FileHandle close failure"
      )
    });
    expect(cleanup.cleanupHandleWarning).toContain(
      "combined directory stream close failure"
    );
    expect(cleanup.cleanupHandleWarning!.length).toBeLessThanOrEqual(512);
    expect(cleanup.cleanupHandleWarning).not.toMatch(/[\r\n\t]/u);
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
  });

  it("keeps inspection-only stream close failures in inspection diagnostics", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const injection = injectAuditMaintenanceDirectoryStreamFailure(
      1,
      "inspection stream close failure"
    );

    const inspection = await inspectJsonlAuditFileLock(filePath);
    await injection.selectedCloseCompletion;

    expect(injection.selectedCloseCount).toBe(1);
    expect(inspection).toMatchObject({
      exists: true,
      ownerEntryExclusive: false,
      inspectionErrorCode: expect.any(String)
    });
    expect(inspection.ownerFingerprint).toBeUndefined();
    await lock.release();
  });

  it("bounds pending inspection directory stream close settlement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(1);
    vi.useFakeTimers();
    const inspectionPromise = inspectJsonlAuditFileLock(filePath);

    try {
      await injection.closeStarted;
      await vi.advanceTimersByTimeAsync(60_000);
      vi.useRealTimers();
      const settlement = await Promise.race([
        inspectionPromise.then((inspection) => ({
          settled: true as const,
          inspection
        })),
        new Promise<{ settled: false }>((resolve) => {
          setTimeout(() => resolve({ settled: false }), 500);
        })
      ]);
      const settledWithinBound = settlement.settled;
      injection.resolveClose();
      await injection.actualCloseCompletion;
      const inspection = settlement.settled
        ? settlement.inspection
        : await inspectionPromise;

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedCloseCount).toBe(1);
      expect(inspection).toMatchObject({
        exists: true,
        ownerEntryExclusive: false,
        inspectionErrorCode: "inspection_failed"
      });
      expect(inspection.ownerFingerprint).toBeUndefined();
      await lock.release();
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("bounds all parent namespace inspection stream close settlements", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const initialEntries = await fs.readdir(dir);
    const inspections: Array<{
      name: string;
      execute(): Promise<unknown>;
    }> = [{
      name: "rotation staging",
      execute: () => inspectJsonlAuditRotationStagings(filePath)
    }, {
      name: "lock quarantine",
      execute: () => inspectJsonlAuditLockQuarantines(filePath)
    }, {
      name: "lock disposal",
      execute: () => inspectJsonlAuditLockDisposals(filePath)
    }];

    for (const inspection of inspections) {
      const injection = injectAuditMaintenanceDirectoryStreamPendingClose(1);
      vi.useFakeTimers();
      const failurePromise = captureAuditFailure(inspection.execute);
      try {
        const settlement = await observeAuditPromiseAfterCloseDeadline(
          failurePromise,
          injection.closeStarted
        );
        injection.resolveClose();
        await injection.actualCloseCompletion;
        const failure = settlement.settled
          ? settlement.value
          : await failurePromise;

        expect(settlement.settled, inspection.name).toBe(true);
        expect(injection.selectedStreamCount, inspection.name).toBe(1);
        expect(injection.selectedCloseCount, inspection.name).toBe(1);
        expect(failure).toMatchObject({
          message: "audit inspection descriptor close timed out after 5000 ms"
        });
      } finally {
        injection.resolveClose();
        vi.useRealTimers();
        vi.restoreAllMocks();
      }
    }

    expect(await fs.readdir(dir)).toEqual(initialEntries);
  });

  it("preserves a parent inspection read error across close timeout", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(
      1,
      "inspection parent primary read failure"
    );
    vi.useFakeTimers();
    const failurePromise = captureAuditFailure(
      () => inspectJsonlAuditRotationStagings(filePath)
    );

    try {
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        failurePromise,
        injection.closeStarted
      );
      injection.resolveClose();
      await injection.actualCloseCompletion;
      const failure = settlement.settled
        ? settlement.value
        : await failurePromise;

      expect(settlement.settled).toBe(true);
      expect(injection.selectedCloseCount).toBe(1);
      expect(failure).toMatchObject({
        message: "inspection parent primary read failure"
      });
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("bounds pending rotation staging child stream close settlement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingId = "P58101";
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      stagingId,
      "previous archive\n"
    );
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(1);
    vi.useFakeTimers();
    const inspectionPromise = inspectJsonlAuditRotationStaging(
      filePath,
      stagingId
    );

    try {
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        inspectionPromise,
        injection.closeStarted
      );
      injection.resolveClose();
      await injection.actualCloseCompletion;
      const inspection = settlement.settled
        ? settlement.value
        : await inspectionPromise;

      expect(settlement.settled).toBe(true);
      expect(injection.selectedCloseCount).toBe(1);
      expect(inspection).toMatchObject({
        exists: true,
        layout: "unknown",
        inspectionErrorCode: "inspection_failed"
      });
      expect(inspection.recoveryFingerprint).toBeUndefined();
      expect(await fs.readFile(
        path.join(stagingPath, "previous"),
        "utf8"
      )).toBe("previous archive\n");
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("bounds multi-handle quarantine inspection and observes late rejection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "P58102";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const nestedLockPath = path.join(quarantinePath, "lock");
    await fs.mkdir(nestedLockPath, { recursive: true, mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(nestedLockPath)
    );
    const injection = injectFirstAuditMaintenanceHandlePendingClose(
      quarantinePath
    );
    vi.useFakeTimers();
    const inspectionPromise = inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );

    try {
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        inspectionPromise,
        injection.closeStarted
      );
      injection.rejectClose(new Error("late inspection close rejection"));
      await injection.actualCloseCompletion;
      const inspection = settlement.settled
        ? settlement.value
        : await inspectionPromise;
      await Promise.resolve();

      expect(settlement.settled).toBe(true);
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.observedCloseCount).toBeGreaterThan(0);
      expect(inspection).toMatchObject({
        exists: true,
        layout: "unknown",
        inspectionErrorCode: "inspection_failed"
      });
      expect(inspection.ownerFingerprint).toBeUndefined();
      expect((await fs.stat(nestedLockPath)).isDirectory()).toBe(true);
      expect(await fs.readFile(
        getJsonlAuditLockOwnerPath(nestedLockPath),
        "utf8"
      )).toContain(lock.ownerToken);
      await lock.release();
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("bounds pending candidate directory stream close settlement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(1);
    vi.useFakeTimers();
    let settled = false;
    const cleanup = cleanupJsonlAuditFileLock(filePath, ownerFingerprint).then(
      (result) => {
        settled = true;
        return result;
      },
      (error: unknown) => {
        settled = true;
        throw error;
      }
    );

    try {
      await injection.closeStarted;
      await vi.advanceTimersByTimeAsync(60_000);
      vi.useRealTimers();
      const settlement = await Promise.race([
        cleanup.then((result) => ({ settled: true as const, result })),
        new Promise<{ settled: false }>((resolve) => {
          setTimeout(() => resolve({ settled: false }), 500);
        })
      ]);
      const settledWithinBound = settlement.settled;
      injection.resolveClose();
      await injection.actualCloseCompletion;
      const result = settlement.settled
        ? settlement.result
        : await cleanup;

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedCloseCount).toBe(1);
      expect(result).toMatchObject({
        existed: true,
        removed: true,
        cleanupHandlesClosed: false,
        cleanupHandleWarning: expect.stringContaining(
          "maintenance descriptor close timed out"
        )
      });
      await expect(fs.access(lock.lockPath)).rejects.toThrow();
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("preserves a scan primary error when stream close settlement times out", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(
      1,
      "pending scan primary failure"
    );
    vi.useFakeTimers();
    const failurePromise = captureAuditFailure(
      () => cleanupJsonlAuditFileLock(filePath, ownerFingerprint)
    );

    try {
      await injection.closeStarted;
      await vi.advanceTimersByTimeAsync(60_000);
      vi.useRealTimers();
      const settlement = await Promise.race([
        failurePromise.then((failure) => ({
          settled: true as const,
          failure
        })),
        new Promise<{ settled: false }>((resolve) => {
          setTimeout(() => resolve({ settled: false }), 500);
        })
      ]);
      const settledWithinBound = settlement.settled;
      injection.resolveClose();
      await injection.actualCloseCompletion;
      const failure = settlement.settled
        ? settlement.failure
        : await failurePromise;

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedCloseCount).toBe(1);
      expect(failure).toMatchObject({
        name: "JsonlAuditLockMaintenanceError",
        message: "pending scan primary failure",
        cause: expect.objectContaining({
          message: "pending scan primary failure"
        }),
        details: {
          operation: "active_lock_cleanup",
          handlesClosed: false,
          handleWarning: expect.stringContaining(
            "maintenance descriptor close timed out after 5000 ms"
          )
        }
      });
      expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
      await lock.release();
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("bounds pending FileHandle settlement without blocking other closes", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const injection = injectFirstAuditMaintenanceHandlePendingClose(
      lock.lockPath
    );
    vi.useFakeTimers();
    const cleanup = cleanupJsonlAuditFileLock(filePath, ownerFingerprint);

    try {
      await injection.closeStarted;
      await vi.advanceTimersByTimeAsync(60_000);
      vi.useRealTimers();
      const settlement = await Promise.race([
        cleanup.then((result) => ({ settled: true as const, result })),
        new Promise<{ settled: false }>((resolve) => {
          setTimeout(() => resolve({ settled: false }), 500);
        })
      ]);
      const settledWithinBound = settlement.settled;
      injection.rejectClose(new Error("late FileHandle close rejection"));
      await injection.actualCloseCompletion;
      const result = settlement.settled
        ? settlement.result
        : await cleanup;
      await Promise.resolve();

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedOpenCount).toBeGreaterThan(0);
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.observedCloseCount).toBeGreaterThan(0);
      expect(result).toMatchObject({
        existed: true,
        removed: true,
        cleanupHandlesClosed: false,
        cleanupHandleWarning: expect.stringContaining(
          "maintenance descriptor close timed out after 5000 ms"
        )
      });
      expect(result.cleanupHandleWarning).not.toContain(
        "late FileHandle close rejection"
      );
      await expect(fs.access(lock.lockPath)).rejects.toThrow();
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("aggregates a stream close timeout with FileHandle rejection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const handleFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      lock.lockPath,
      "timeout aggregate FileHandle failure"
    );
    const streamPending = injectAuditMaintenanceDirectoryStreamPendingClose(1);
    vi.useFakeTimers();
    const cleanup = cleanupJsonlAuditFileLock(filePath, ownerFingerprint);

    try {
      await streamPending.closeStarted;
      await vi.advanceTimersByTimeAsync(60_000);
      vi.useRealTimers();
      const settlement = await Promise.race([
        cleanup.then((result) => ({ settled: true as const, result })),
        new Promise<{ settled: false }>((resolve) => {
          setTimeout(() => resolve({ settled: false }), 500);
        })
      ]);
      const settledWithinBound = settlement.settled;
      streamPending.resolveClose();
      await Promise.all([
        streamPending.actualCloseCompletion,
        handleFailure.closeCompletion
      ]);
      const result = settlement.settled
        ? settlement.result
        : await cleanup;

      expect(settledWithinBound).toBe(true);
      expect(streamPending.selectedCloseCount).toBe(1);
      expect(handleFailure.selectedOpenCount).toBeGreaterThan(0);
      expect(result.cleanupHandlesClosed).toBe(false);
      expect(result.cleanupHandleWarning).toContain(
        "maintenance descriptor close timed out after 5000 ms"
      );
      expect(result.cleanupHandleWarning).toContain(
        "timeout aggregate FileHandle failure"
      );
      expect(result.cleanupHandleWarning!.length).toBeLessThanOrEqual(512);
      expect(result.cleanupHandleWarning).not.toMatch(/[\r\n\t]/u);
      await expect(fs.access(lock.lockPath)).rejects.toThrow();
    } finally {
      streamPending.resolveClose();
      vi.useRealTimers();
    }
  });

  it("reports successful descriptor finalization on rejected active cleanup", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);

    const failure = await captureAuditFailure(() => cleanupJsonlAuditFileLock(
      filePath,
      ownerFingerprint,
      {
        beforeQuarantine: () => {
          throw new Error("stable rejected maintenance failure");
        }
      }
    ));

    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "stable rejected maintenance failure",
      cause: expect.objectContaining({
        message: "stable rejected maintenance failure"
      }),
      details: {
        operation: "active_lock_cleanup",
        handlesClosed: true
      }
    });
    expect((failure as {
      details: { handleWarning?: string };
    }).details.handleWarning).toBeUndefined();
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("reports rejected owner quarantine cleanup finalization failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Qf1701";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const quarantineOwnerPath = getJsonlAuditLockOwnerPath(quarantinePath);
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, quarantineOwnerPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      quarantinePath,
      "owner quarantine rejection close failure",
      quarantineOwnerPath
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditLockQuarantine(
        filePath,
        quarantineId,
        ownerFingerprint,
        {
          beforeOwnerIsolation: () => {
            throw new Error("owner quarantine primary failure");
          }
        }
      )
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "owner quarantine primary failure",
      details: {
        operation: "owner_quarantine_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "owner quarantine rejection close failure"
        )
      }
    });
    expect(await fs.readdir(quarantinePath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("reports owner quarantine candidate-selection finalization failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Qf1702";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const quarantineOwnerPath = getJsonlAuditLockOwnerPath(quarantinePath);
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, quarantineOwnerPath);
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      quarantinePath,
      "owner quarantine candidate close failure",
      quarantineOwnerPath
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditLockQuarantine(
        filePath,
        quarantineId,
        "0".repeat(32)
      )
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "Audit file lock owner fingerprint does not match.",
      details: {
        operation: "owner_quarantine_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "owner quarantine candidate close failure"
        )
      }
    });
    expect(await fs.readdir(quarantinePath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("hands a failed-open quarantine owner descriptor to candidate finalization", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Qf1703";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const quarantineOwnerPath = getJsonlAuditLockOwnerPath(quarantinePath);
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, quarantineOwnerPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const injection = injectAuditMaintenanceOpenValidationFailure(
      quarantineOwnerPath,
      "quarantine owner opener primary failure",
      "quarantine owner opener close failure",
      1,
      quarantinePath
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditLockQuarantine(
        filePath,
        quarantineId,
        ownerFingerprint
      )
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedCloseCount).toBe(1);
    expect(injection.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "quarantine owner opener primary failure",
      details: {
        operation: "owner_quarantine_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "quarantine owner opener close failure"
        )
      }
    });
    expect(await fs.readdir(quarantinePath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("hands private disposal initialization handles to the outer finalizer", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Qf1704";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const quarantineOwnerPath = getJsonlAuditLockOwnerPath(quarantinePath);
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, quarantineOwnerPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const disposalPrefix = `${quarantinePath}.dispose-`;
    const injection = injectAuditPrivateDirectoryInitializationFailure(
      disposalPrefix,
      "private disposal initialization primary failure",
      "private disposal initialization close failure"
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditLockQuarantine(
        filePath,
        quarantineId,
        ownerFingerprint
      )
    );
    await injection.privateCloseCompletion;

    expect(injection.privateDirectoryOpened).toBe(true);
    expect(injection.privateCloseCount).toBe(1);
    expect(injection.parentCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "private disposal initialization primary failure",
      details: {
        operation: "owner_quarantine_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "private disposal initialization close failure"
        )
      }
    });
    const retained = (await fs.readdir(path.dirname(disposalPrefix)))
      .filter((entry) => entry.startsWith(path.basename(disposalPrefix)));
    expect(retained).toEqual([]);
    expect(await fs.readdir(quarantinePath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("carries owner quarantine scan finalization into the cleanup result", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Qf1705";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const quarantineOwnerPath = getJsonlAuditLockOwnerPath(quarantinePath);
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, quarantineOwnerPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const injection = injectAuditMaintenanceDirectoryStreamFailure(
      1,
      "owner quarantine stream close failure"
    );

    const cleanup = await cleanupJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedCloseCount).toBe(1);
    expect(cleanup).toMatchObject({
      existed: true,
      removed: true,
      ownerFingerprint,
      cleanupHandlesClosed: false,
      cleanupHandleWarning: expect.stringContaining(
        "owner quarantine stream close failure"
      )
    });
    await expect(fs.access(quarantinePath)).rejects.toThrow();
    await lock.release();
  });

  it("reports rejected empty quarantine cleanup finalization failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Eq1701";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    const fingerprint = (
      await inspectJsonlAuditLockQuarantine(filePath, quarantineId)
    ).emptyDirectoryFingerprint!;
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      quarantinePath,
      "empty quarantine rejection close failure",
      path.dirname(quarantinePath)
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditEmptyLockQuarantine(
        filePath,
        quarantineId,
        fingerprint,
        {
          beforeRemoval: () => {
            throw new Error("empty quarantine primary failure");
          }
        }
      )
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "empty quarantine primary failure",
      details: {
        operation: "empty_quarantine_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "empty quarantine rejection close failure"
        )
      }
    });
    expect(await fs.readdir(quarantinePath)).toEqual([]);
  });

  it("reports empty quarantine candidate-selection finalization failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Eq1702";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      quarantinePath,
      "empty quarantine candidate close failure"
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditEmptyLockQuarantine(
        filePath,
        quarantineId,
        "0".repeat(32)
      )
    );
    await closeFailure.closeCompletion;

    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "Audit lock empty quarantine fingerprint does not match.",
      details: {
        operation: "empty_quarantine_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "empty quarantine candidate close failure"
        )
      }
    });
    expect(await fs.readdir(quarantinePath)).toEqual([]);
  });

  it("hands a pinned-empty scan failure to candidate finalization", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Eq1703";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    const originalOpen = fs.open.bind(fs);
    let selectedCloseCount = 0;
    let selectedCloseCompletion: Promise<void> | undefined;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (String(target) === quarantinePath) {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(() => {
          selectedCloseCount += 1;
          selectedCloseCompletion = close();
          throw new Error("empty candidate opener close failure");
        });
      }
      return handle;
    });
    vi.spyOn(fs, "opendir").mockRejectedValue(
      new Error("empty candidate scan primary failure")
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditEmptyLockQuarantine(
        filePath,
        quarantineId,
        "0".repeat(32)
      )
    );
    await selectedCloseCompletion;

    expect(selectedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "empty candidate scan primary failure",
      details: {
        operation: "empty_quarantine_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "empty candidate opener close failure"
        )
      }
    });
    expect(await fs.readdir(quarantinePath)).toEqual([]);
  });

  it("preserves empty quarantine cleanup when an assertion handle close fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Qf2703";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    const quarantineFingerprint = (
      await inspectJsonlAuditLockQuarantine(filePath, quarantineId)
    ).emptyDirectoryFingerprint!;
    const originalOpen = fs.open.bind(fs);
    let selectedOpenCount = 0;
    let selectedCloseCount = 0;
    let selectedCloseCompletion: Promise<void> | undefined;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (String(target) === quarantinePath) {
        selectedOpenCount += 1;
        if (selectedOpenCount === 2) {
          const close = handle.close.bind(handle);
          vi.spyOn(handle, "close").mockImplementation(() => {
            selectedCloseCount += 1;
            selectedCloseCompletion = close();
            throw new Error("assertion transient handle close failure");
          });
        }
      }
      return handle;
    });

    const cleanup = await cleanupJsonlAuditEmptyLockQuarantine(
      filePath,
      quarantineId,
      quarantineFingerprint
    );
    await selectedCloseCompletion;

    expect(selectedOpenCount).toBe(2);
    expect(selectedCloseCount).toBe(1);
    expect(cleanup).toMatchObject({
      existed: true,
      removed: true,
      quarantineFingerprint,
      cleanupHandlesClosed: false,
      cleanupHandleWarning: expect.stringContaining(
        "assertion transient handle close failure"
      )
    });
    await expect(fs.access(quarantinePath)).rejects.toThrow();
  });

  it("reports rejected owner disposal cleanup finalization failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Df1701";
    const disposalId = "Dr1701";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const disposalOwnerPath = getJsonlAuditLockOwnerPath(disposalPath);
    tempDirs.push(lock.lockPath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, disposalOwnerPath);
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      disposalPath,
      "owner disposal rejection close failure",
      disposalOwnerPath
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditLockDisposal(
        filePath,
        quarantineId,
        disposalId,
        ownerFingerprint,
        {
          beforeOwnerDeletion: () => {
            throw new Error("owner disposal primary failure");
          }
        }
      )
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "owner disposal primary failure",
      details: {
        operation: "owner_disposal_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "owner disposal rejection close failure"
        )
      }
    });
    expect(await fs.readdir(disposalPath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("reports owner disposal candidate-selection finalization failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Df1702";
    const disposalId = "Dr1702";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const disposalOwnerPath = getJsonlAuditLockOwnerPath(disposalPath);
    tempDirs.push(lock.lockPath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, disposalOwnerPath);
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      disposalPath,
      "owner disposal candidate close failure",
      disposalOwnerPath
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditLockDisposal(
        filePath,
        quarantineId,
        disposalId,
        "0".repeat(32)
      )
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "Audit lock disposal owner fingerprint does not match.",
      details: {
        operation: "owner_disposal_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "owner disposal candidate close failure"
        )
      }
    });
    expect(await fs.readdir(disposalPath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("hands a failed-open disposal owner descriptor to candidate finalization", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Df1703";
    const disposalId = "Dr1703";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const disposalOwnerPath = getJsonlAuditLockOwnerPath(disposalPath);
    tempDirs.push(lock.lockPath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, disposalOwnerPath);
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );
    const injection = injectAuditMaintenanceOpenValidationFailure(
      disposalOwnerPath,
      "disposal owner opener primary failure",
      "disposal owner opener close failure",
      1,
      disposalPath
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditLockDisposal(
        filePath,
        quarantineId,
        disposalId,
        ownerFingerprint
      )
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedCloseCount).toBe(1);
    expect(injection.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "disposal owner opener primary failure",
      details: {
        operation: "owner_disposal_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "disposal owner opener close failure"
        )
      }
    });
    expect(await fs.readdir(disposalPath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("hands a failed-open disposal parent descriptor to operation finalization", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Df1704";
    const disposalId = "Dr1704";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const disposalOwnerPath = getJsonlAuditLockOwnerPath(disposalPath);
    tempDirs.push(lock.lockPath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, disposalOwnerPath);
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );
    const injection = injectAuditMaintenanceOpenValidationFailure(
      path.dirname(disposalPath),
      "disposal parent opener primary failure",
      "disposal parent opener close failure",
      1,
      disposalPath
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditLockDisposal(
        filePath,
        quarantineId,
        disposalId,
        ownerFingerprint
      )
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedCloseCount).toBe(1);
    expect(injection.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "disposal parent opener primary failure",
      details: {
        operation: "owner_disposal_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "disposal parent opener close failure"
        )
      }
    });
    expect(await fs.readdir(disposalPath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("carries owner disposal scan finalization into the cleanup result", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Df1705";
    const disposalId = "Dr1705";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const disposalOwnerPath = getJsonlAuditLockOwnerPath(disposalPath);
    tempDirs.push(lock.lockPath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, disposalOwnerPath);
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );
    const injection = injectAuditMaintenanceDirectoryStreamFailure(
      1,
      "owner disposal stream close failure"
    );

    const cleanup = await cleanupJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      ownerFingerprint
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedCloseCount).toBe(1);
    expect(cleanup).toMatchObject({
      existed: true,
      removed: true,
      ownerFingerprint,
      cleanupHandlesClosed: false,
      cleanupHandleWarning: expect.stringContaining(
        "owner disposal stream close failure"
      )
    });
    await expect(fs.access(disposalPath)).rejects.toThrow();
    await lock.release();
  });

  it("reports rejected empty disposal cleanup finalization failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Df2701";
    const disposalId = "Dr2701";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    const fingerprint = (
      await inspectJsonlAuditLockDisposal(filePath, quarantineId, disposalId)
    ).emptyDirectoryFingerprint!;
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      disposalPath,
      "empty disposal rejection close failure",
      path.dirname(disposalPath)
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditEmptyLockDisposal(
        filePath,
        quarantineId,
        disposalId,
        fingerprint,
        {
          beforeRemoval: () => {
            throw new Error("empty disposal primary failure");
          }
        }
      )
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "empty disposal primary failure",
      details: {
        operation: "empty_disposal_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "empty disposal rejection close failure"
        )
      }
    });
    expect(await fs.readdir(disposalPath)).toEqual([]);
  });

  it("reports empty disposal candidate-selection finalization failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Df2702";
    const disposalId = "Dr2702";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      disposalPath,
      "empty disposal candidate close failure"
    );

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditEmptyLockDisposal(
        filePath,
        quarantineId,
        disposalId,
        "0".repeat(32)
      )
    );
    await closeFailure.closeCompletion;

    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "Audit lock empty disposal fingerprint does not match.",
      details: {
        operation: "empty_disposal_cleanup",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "empty disposal candidate close failure"
        )
      }
    });
    expect(await fs.readdir(disposalPath)).toEqual([]);
  });

  it("preserves empty disposal cleanup when an assertion handle close fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Df2703";
    const disposalId = "Dr2703";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    const disposalFingerprint = (
      await inspectJsonlAuditLockDisposal(filePath, quarantineId, disposalId)
    ).emptyDirectoryFingerprint!;
    const originalOpen = fs.open.bind(fs);
    let selectedOpenCount = 0;
    let selectedCloseCount = 0;
    let selectedCloseCompletion: Promise<void> | undefined;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (String(target) === disposalPath) {
        selectedOpenCount += 1;
        if (selectedOpenCount === 2) {
          const close = handle.close.bind(handle);
          vi.spyOn(handle, "close").mockImplementation(() => {
            selectedCloseCount += 1;
            selectedCloseCompletion = close();
            throw new Error("disposal assertion transient close failure");
          });
        }
      }
      return handle;
    });

    const cleanup = await cleanupJsonlAuditEmptyLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      disposalFingerprint
    );
    await selectedCloseCompletion;

    expect(selectedOpenCount).toBe(2);
    expect(selectedCloseCount).toBe(1);
    expect(cleanup).toMatchObject({
      existed: true,
      removed: true,
      disposalFingerprint,
      cleanupHandlesClosed: false,
      cleanupHandleWarning: expect.stringContaining(
        "disposal assertion transient close failure"
      )
    });
    await expect(fs.access(disposalPath)).rejects.toThrow();
  });

  it("carries empty disposal scan finalization into the cleanup result", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Df2704";
    const disposalId = "Dr2704";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    const disposalFingerprint = (
      await inspectJsonlAuditLockDisposal(filePath, quarantineId, disposalId)
    ).emptyDirectoryFingerprint!;
    const injection = injectAuditMaintenanceDirectoryStreamFailure(
      1,
      "empty disposal stream close failure"
    );

    const cleanup = await cleanupJsonlAuditEmptyLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      disposalFingerprint
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedCloseCount).toBe(1);
    expect(cleanup).toMatchObject({
      existed: true,
      removed: true,
      disposalFingerprint,
      cleanupHandlesClosed: false,
      cleanupHandleWarning: expect.stringContaining(
        "empty disposal stream close failure"
      )
    });
    await expect(fs.access(disposalPath)).rejects.toThrow();
  });

  it("reports rejected quarantine recovery finalization failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rf1701";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      quarantinePath,
      "quarantine recovery rejection close failure",
      nestedLockPath
    );

    const failure = await captureAuditFailure(
      () => recoverJsonlAuditLockQuarantine(
        filePath,
        quarantineId,
        ownerFingerprint,
        {
          beforeLockReservation: () => {
            throw new Error("quarantine recovery primary failure");
          }
        }
      )
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "quarantine recovery primary failure",
      details: {
        operation: "quarantine_recovery",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "quarantine recovery rejection close failure"
        )
      }
    });
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect(await fs.readdir(nestedLockPath)).toEqual(["owner.json"]);
  });

  it("reports quarantine recovery candidate-selection finalization failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rf1702";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      quarantinePath,
      "quarantine recovery candidate close failure",
      nestedLockPath
    );

    const failure = await captureAuditFailure(
      () => recoverJsonlAuditLockQuarantine(
        filePath,
        quarantineId,
        "0".repeat(32)
      )
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "Audit file lock owner fingerprint does not match.",
      details: {
        operation: "quarantine_recovery",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "quarantine recovery candidate close failure"
        )
      }
    });
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect(await fs.readdir(nestedLockPath)).toEqual(["owner.json"]);
  });

  it("finalizes returned and failed-open quarantine recovery handles together", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rf1703";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const injection = injectAuditMaintenanceOpenValidationFailure(
      nestedLockPath,
      "nested candidate opener primary failure",
      "nested candidate opener close failure",
      1,
      quarantinePath
    );

    const failure = await captureAuditFailure(
      () => recoverJsonlAuditLockQuarantine(
        filePath,
        quarantineId,
        ownerFingerprint
      )
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedOpenCount).toBe(1);
    expect(injection.selectedCloseCount).toBe(1);
    expect(injection.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "nested candidate opener primary failure",
      details: {
        operation: "quarantine_recovery",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "nested candidate opener close failure"
        )
      }
    });
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect(await fs.readdir(nestedLockPath)).toEqual(["owner.json"]);
  });

  it("hands a failed-open recovery owner descriptor to candidate finalization", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rf1704";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    const ownerPath = getJsonlAuditLockOwnerPath(nestedLockPath);
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const injection = injectAuditMaintenanceOpenValidationFailure(
      ownerPath,
      "recovery owner opener primary failure",
      "recovery owner opener close failure",
      1,
      quarantinePath
    );

    const failure = await captureAuditFailure(
      () => recoverJsonlAuditLockQuarantine(
        filePath,
        quarantineId,
        ownerFingerprint
      )
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedCloseCount).toBe(1);
    expect(injection.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "recovery owner opener primary failure",
      details: {
        operation: "quarantine_recovery",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "recovery owner opener close failure"
        )
      }
    });
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect(await fs.readdir(nestedLockPath)).toEqual(["owner.json"]);
  });

  it("reports a failed-open recovery reservation descriptor in finalization", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rf1705";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const injection = injectAuditMaintenanceOpenValidationFailure(
      lock.lockPath,
      "recovery reservation opener primary failure",
      "recovery reservation opener close failure",
      1,
      quarantinePath
    );

    const failure = await captureAuditFailure(
      () => recoverJsonlAuditLockQuarantine(
        filePath,
        quarantineId,
        ownerFingerprint
      )
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedCloseCount).toBe(1);
    expect(injection.observedCloseCount).toBe(1);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: expect.stringContaining(
        "could not verify its reservation; coordination entry retained"
      ),
      details: {
        operation: "quarantine_recovery",
        handlesClosed: false,
        handleWarning: expect.stringContaining(
          "recovery reservation opener close failure"
        )
      }
    });
    expect(await fs.readdir(lock.lockPath)).toEqual([]);
    expect(await fs.readdir(nestedLockPath)).toEqual(["owner.json"]);
  });

  it("carries quarantine recovery scan finalization into the result", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rf1706";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const injection = injectAuditMaintenanceDirectoryStreamFailure(
      1,
      "quarantine recovery stream close failure"
    );

    const recovery = await recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint
    );
    await injection.selectedCloseCompletion;

    expect(injection.selectedCloseCount).toBe(1);
    expect(recovery).toMatchObject({
      existed: true,
      recovered: true,
      ownerFingerprint,
      recoveryHandlesClosed: false,
      recoveryHandleWarning: expect.stringContaining(
        "quarantine recovery stream close failure"
      )
    });
    await expect(fs.access(quarantinePath)).rejects.toThrow();
    expect(await fs.readdir(lock.lockPath)).toEqual(["owner.json"]);
  });

  it("bounds aggregated maintenance rejection close warnings", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const originalOpen = fs.open.bind(fs);
    let directoryCloseCompletion: Promise<void> | undefined;
    let ownerCloseCompletion: Promise<void> | undefined;
    let directoryCloseCount = 0;
    let ownerCloseCount = 0;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (String(target) === lock.lockPath) {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(() => {
          directoryCloseCount += 1;
          directoryCloseCompletion = close();
          throw new Error(`directory\n${"a".repeat(700)}`);
        });
      } else if (String(target) === lock.ownerPath) {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(() => {
          ownerCloseCount += 1;
          ownerCloseCompletion = close();
          throw new Error(`owner\r${"b".repeat(700)}`);
        });
      }
      return handle;
    });

    const failure = await captureAuditFailure(
      () => cleanupJsonlAuditFileLock(filePath, "0".repeat(32))
    );
    await Promise.all([directoryCloseCompletion, ownerCloseCompletion]);

    const warning = (failure as {
      details: { handleWarning?: string };
    }).details.handleWarning;
    expect(directoryCloseCount).toBe(1);
    expect(ownerCloseCount).toBe(1);
    expect(warning).toBeDefined();
    expect(warning!.length).toBeLessThanOrEqual(512);
    expect(warning).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u);
    expect(failure).toMatchObject({
      name: "JsonlAuditLockMaintenanceError",
      message: "Audit file lock owner fingerprint does not match.",
      details: {
        operation: "active_lock_cleanup",
        handlesClosed: false
      }
    });
    await lock.release();
  });

  it("preserves committed owner quarantine cleanup when descriptor finalization fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Cf0576";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(quarantinePath));
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      quarantinePath,
      "injected quarantine cleanup handle close failure"
    );

    const cleanup = await cleanupJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.selectedOpenCount).toBeGreaterThan(0);
    expect(cleanup).toMatchObject({
      quarantineId,
      quarantinePath,
      existed: true,
      removed: true,
      ownerFingerprint,
      cleanupHandlesClosed: false,
      cleanupHandleWarning: expect.stringContaining(
        "injected quarantine cleanup handle close failure"
      )
    });
    await expect(fs.access(quarantinePath)).rejects.toThrow();
    await lock.release();
  });

  it("preserves committed empty quarantine cleanup when descriptor finalization fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Ef0576";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    const inspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );
    const quarantineFingerprint = inspection.emptyDirectoryFingerprint!;
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      quarantinePath,
      "injected empty quarantine handle close failure"
    );

    const cleanup = await cleanupJsonlAuditEmptyLockQuarantine(
      filePath,
      quarantineId,
      quarantineFingerprint
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.selectedOpenCount).toBeGreaterThan(0);
    expect(cleanup).toMatchObject({
      quarantineId,
      quarantinePath,
      existed: true,
      removed: true,
      quarantineFingerprint,
      cleanupHandlesClosed: false,
      cleanupHandleWarning: expect.stringContaining(
        "injected empty quarantine handle close failure"
      )
    });
    await expect(fs.access(quarantinePath)).rejects.toThrow();
  });

  it("preserves committed owner disposal cleanup when descriptor finalization fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Df0576";
    const disposalId = "Dr0576";
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
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      disposalPath,
      "injected disposal cleanup handle close failure"
    );

    const cleanup = await cleanupJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      ownerFingerprint
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.selectedOpenCount).toBeGreaterThan(0);
    expect(cleanup).toMatchObject({
      quarantineId,
      quarantinePath,
      disposalId,
      disposalPath,
      existed: true,
      removed: true,
      ownerFingerprint,
      cleanupHandlesClosed: false,
      cleanupHandleWarning: expect.stringContaining(
        "injected disposal cleanup handle close failure"
      )
    });
    await expect(fs.access(disposalPath)).rejects.toThrow();
    await lock.release();
  });

  it("preserves committed empty disposal cleanup when descriptor finalization fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Df1576";
    const disposalId = "Dr1576";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    const inspection = await inspectJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId
    );
    const disposalFingerprint = inspection.emptyDirectoryFingerprint!;
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      disposalPath,
      "injected empty disposal handle close failure"
    );

    const cleanup = await cleanupJsonlAuditEmptyLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      disposalFingerprint
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.selectedOpenCount).toBeGreaterThan(0);
    expect(cleanup).toMatchObject({
      quarantineId,
      quarantinePath,
      disposalId,
      disposalPath,
      existed: true,
      removed: true,
      disposalFingerprint,
      cleanupHandlesClosed: false,
      cleanupHandleWarning: expect.stringContaining(
        "injected empty disposal handle close failure"
      )
    });
    await expect(fs.access(disposalPath)).rejects.toThrow();
  });

  it("preserves successful quarantine recovery when descriptor finalization fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rf0576";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const closeFailure = injectFirstAuditMaintenanceHandleCloseFailure(
      quarantinePath,
      "injected quarantine recovery handle close failure"
    );

    const recovery = await recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint
    );
    await closeFailure.closeCompletion;

    expect(closeFailure.selectedOpenCount).toBeGreaterThan(0);
    expect(recovery).toMatchObject({
      quarantineId,
      quarantinePath,
      lockPath: lock.lockPath,
      existed: true,
      recovered: true,
      layout: "lock_with_owner",
      ownerFingerprint,
      recoveryHandlesClosed: false,
      recoveryHandleWarning: expect.stringContaining(
        "injected quarantine recovery handle close failure"
      )
    });
    await expect(fs.access(quarantinePath)).rejects.toThrow();
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await expect(lock.release()).rejects.toThrow(
      "Audit file lock changed before release"
    );
    const activeOwnerFingerprint = await requireActiveLockOwnerFingerprint(
      filePath
    );
    await expect(cleanupJsonlAuditFileLock(
      filePath,
      activeOwnerFingerprint
    )).resolves.toMatchObject({ existed: true, removed: true });
  });

  it("refuses cleanup when the owner fingerprint does not match", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);

    await expect(cleanupJsonlAuditFileLock(
      filePath,
      "0".repeat(32)
    )).rejects.toThrow("owner fingerprint does not match");

    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("refuses cleanup for missing owner metadata and non-directory blockers", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);

    await fs.mkdir(lockPath, { mode: 0o700 });
    await expect(cleanupJsonlAuditFileLock(
      filePath,
      "0".repeat(32)
    )).rejects.toThrow("requires valid owner metadata");
    expect(await fs.readdir(lockPath)).toEqual([]);
    await fs.rmdir(lockPath);

    await fs.writeFile(lockPath, "blocker", { mode: 0o600 });
    await expect(cleanupJsonlAuditFileLock(
      filePath,
      "0".repeat(32)
    )).rejects.toThrow("requires a directory lock entry");
    expect(await fs.readFile(lockPath, "utf8")).toBe("blocker");
    await fs.rm(lockPath);
  });

  it("refuses a replacement directory raced in before quarantine", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const movedLockPath = `${lock.lockPath}.original`;

    await expect(cleanupJsonlAuditFileLock(filePath, ownerFingerprint, {
      beforeQuarantine: async () => {
        await fs.rename(lock.lockPath, movedLockPath);
        await fs.mkdir(lock.lockPath, { mode: 0o700 });
        await fs.copyFile(
          getJsonlAuditLockOwnerPath(movedLockPath),
          lock.ownerPath
        );
      }
    })).rejects.toThrow("Audit file lock changed before cleanup");

    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    expect((await fs.stat(movedLockPath)).isDirectory()).toBe(true);
    await fs.rm(lock.lockPath, { recursive: true });
    await fs.rm(movedLockPath, { recursive: true });
  });

  it("refuses owner token drift raced in before quarantine", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);

    await expect(cleanupJsonlAuditFileLock(filePath, ownerFingerprint, {
      beforeQuarantine: async () => {
        const persisted = JSON.parse(await fs.readFile(lock.ownerPath, "utf8")) as {
          owner_token: string;
        };
        persisted.owner_token = "00000000-0000-4000-8000-000000000000";
        await fs.writeFile(lock.ownerPath, `${JSON.stringify(persisted)}\n`, {
          encoding: "utf8"
        });
      }
    })).rejects.toThrow("Audit file lock changed before cleanup");

    await expect(inspectJsonlAuditFileLock(filePath)).resolves.toMatchObject({
      exists: true,
      ownerToken: "00000000-0000-4000-8000-000000000000"
    });
    await fs.rm(lock.lockPath, { recursive: true });
  });

  it("refuses a copied-metadata owner replacement before quarantine", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);
    const movedOwnerPath = `${lock.lockPath}.owner-original`;
    tempDirs.push(lock.lockPath, movedOwnerPath);

    await expect(cleanupJsonlAuditFileLock(filePath, ownerFingerprint, {
      beforeQuarantine: async () => {
        await fs.rename(lock.ownerPath, movedOwnerPath);
        await fs.copyFile(movedOwnerPath, lock.ownerPath);
      }
    })).rejects.toThrow("Audit file lock changed before cleanup");

    expect(await fs.readFile(lock.ownerPath, "utf8")).toBe(
      await fs.readFile(movedOwnerPath, "utf8")
    );
  });

  it("inspects derived lock quarantine layouts without following or modifying entries", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });
    tempDirs.push(lock.lockPath);
    const prefix = getJsonlAuditLockQuarantinePrefix(filePath);
    const ownerOnly = `${prefix}Aa0001`;
    const lockWithOwner = `${prefix}Aa0002`;
    const lockAndOwner = `${prefix}Aa0003`;
    const empty = `${prefix}Aa0004`;
    const unknown = `${prefix}Aa0005`;
    const blocker = `${prefix}Aa0006`;
    const ignored = `${prefix}not-a-valid-suffix`;
    tempDirs.push(ownerOnly, lockWithOwner, lockAndOwner, empty, unknown, blocker, ignored);

    await fs.mkdir(ownerOnly, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(ownerOnly));
    await fs.mkdir(path.join(lockWithOwner, "lock"), {
      recursive: true,
      mode: 0o700
    });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(path.join(lockWithOwner, "lock"))
    );
    await fs.mkdir(path.join(lockAndOwner, "lock"), {
      recursive: true,
      mode: 0o700
    });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(lockAndOwner));
    await fs.mkdir(empty, { mode: 0o700 });
    await fs.mkdir(unknown, { mode: 0o700 });
    await fs.writeFile(path.join(unknown, "unexpected"), "preserved", {
      mode: 0o600
    });
    await fs.writeFile(blocker, "blocker", { mode: 0o600 });
    await fs.mkdir(ignored, { mode: 0o700 });

    const inspection = await inspectJsonlAuditLockQuarantines(filePath);
    const byPath = new Map(
      inspection.entries.map((entry) => [entry.quarantinePath, entry])
    );

    expect(inspection).toMatchObject({
      lockPath: lock.lockPath,
      quarantinePrefix: prefix,
      scanLimit: 4_096,
      scanTruncated: false,
      matchedEntryCount: 6,
      resultLimit: 128,
      resultTruncated: false
    });
    expect(inspection.entries).toHaveLength(6);
    expect(byPath.get(ownerOnly)).toMatchObject({
      entryType: "directory",
      layout: "owner_only",
      rootEntryCount: 1,
      rootOwnerMetadataStatus: "valid",
      ownerLocation: "root",
      ownerMetadataStatus: "valid",
      ownerToken: lock.ownerToken,
      ownerPid: process.pid
    });
    expect(byPath.get(lockWithOwner)).toMatchObject({
      entryType: "directory",
      layout: "lock_with_owner",
      rootEntryCount: 1,
      lockEntryType: "directory",
      lockEntryCount: 1,
      rootOwnerMetadataStatus: "missing",
      lockOwnerMetadataStatus: "valid",
      ownerLocation: "lock",
      ownerToken: lock.ownerToken
    });
    expect(byPath.get(lockAndOwner)).toMatchObject({
      entryType: "directory",
      layout: "lock_and_owner",
      rootEntryCount: 2,
      lockEntryType: "directory",
      lockEntryCount: 0,
      rootOwnerMetadataStatus: "valid",
      lockOwnerMetadataStatus: "missing",
      ownerLocation: "root",
      ownerToken: lock.ownerToken
    });
    expect(byPath.get(empty)).toMatchObject({
      entryType: "directory",
      layout: "empty",
      rootEntryCount: 0,
      rootOwnerMetadataStatus: "missing"
    });
    expect(byPath.get(unknown)).toMatchObject({
      entryType: "directory",
      layout: "unknown",
      rootEntryCount: 1
    });
    expect(byPath.get(blocker)).toMatchObject({
      entryType: "regular_file"
    });
    expect(byPath.has(ignored)).toBe(false);
    expect(await fs.readFile(path.join(unknown, "unexpected"), "utf8")).toBe("preserved");
    expect(await fs.readFile(blocker, "utf8")).toBe("blocker");
    expect((await fs.stat(ownerOnly)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("withdraws owner-only quarantine authority after selected owner rewrite", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Sq0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const ownerPath = getJsonlAuditLockOwnerPath(quarantinePath);
    const replacementToken = "00000000-0000-4000-8000-000000000002";
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const originalOpendir = fs.opendir.bind(fs);
    let selectedScans = 0;
    let rewritten = false;
    vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
      let resolvedTarget = path.resolve(String(target));
      try {
        resolvedTarget = await fs.realpath(target);
      } catch {
        // Preserve the original open behavior for disappearing paths.
      }
      if (resolvedTarget === path.resolve(quarantinePath)) {
        selectedScans += 1;
        if (selectedScans === 2) {
          const persisted = JSON.parse(
            await fs.readFile(ownerPath, "utf8")
          ) as Record<string, unknown>;
          persisted.owner_token = replacementToken;
          await fs.writeFile(ownerPath, `${JSON.stringify(persisted)}\n`, {
            encoding: "utf8"
          });
          rewritten = true;
        }
      }
      return originalOpendir(target, options);
    });

    const inspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );

    expect(rewritten).toBe(true);
    expect(selectedScans).toBe(2);
    expect(inspection).toMatchObject({
      quarantineId,
      quarantinePath,
      exists: true,
      entryType: "directory",
      rootEntryCount: 1,
      rootOwnerMetadataStatus: "valid",
      layout: "unknown",
      stateChanged: true
    });
    expect(inspection.ownerLocation).toBeUndefined();
    expect(inspection.ownerMetadataStatus).toBeUndefined();
    expect(inspection.ownerToken).toBeUndefined();
    expect(inspection.emptyDirectoryFingerprint).toBeUndefined();
    expect(JSON.stringify(inspection)).not.toContain(lock.ownerToken);
    expect(JSON.stringify(inspection)).not.toContain(replacementToken);
    expect(JSON.parse(await fs.readFile(ownerPath, "utf8"))).toMatchObject({
      owner_token: replacementToken
    });
    await lock.release();
  });

  it("withdraws owner-only quarantine authority after terminal owner file generation drift", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Sq0004";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const ownerPath = getJsonlAuditLockOwnerPath(quarantinePath);
    const replacementToken = "00000000-0000-4000-8000-000000000042";
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const originalLstat = fs.lstat.bind(fs);
    let rootPathReads = 0;
    let rewritten = false;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.resolve(String(target)) === path.resolve(quarantinePath)) {
        rootPathReads += 1;
        if (rootPathReads === 5) {
          const persisted = JSON.parse(
            await fs.readFile(ownerPath, "utf8")
          ) as Record<string, unknown>;
          persisted.owner_token = replacementToken;
          await fs.writeFile(ownerPath, `${JSON.stringify(persisted)}\n`, {
            encoding: "utf8"
          });
          rewritten = true;
        }
      }
      return originalLstat(target, options);
    });

    const inspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );

    expect(rewritten).toBe(true);
    expect(rootPathReads).toBe(5);
    expect(inspection).toMatchObject({
      quarantineId,
      quarantinePath,
      exists: true,
      entryType: "directory",
      rootEntryCount: 1,
      rootOwnerMetadataStatus: "valid",
      layout: "unknown",
      stateChanged: true
    });
    expect(inspection.ownerLocation).toBeUndefined();
    expect(inspection.ownerMetadataStatus).toBeUndefined();
    expect(inspection.ownerToken).toBeUndefined();
    expect(inspection.emptyDirectoryFingerprint).toBeUndefined();
    expect(JSON.stringify(inspection)).not.toContain(lock.ownerToken);
    expect(JSON.stringify(inspection)).not.toContain(replacementToken);
    expect(JSON.parse(await fs.readFile(ownerPath, "utf8"))).toMatchObject({
      owner_token: replacementToken
    });
    await lock.release();
  });

  it("withdraws nested quarantine authority after selected owner rewrite", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Sq0002";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const nestedLockPath = path.join(quarantinePath, "lock");
    const ownerPath = getJsonlAuditLockOwnerPath(nestedLockPath);
    const replacementToken = "00000000-0000-4000-8000-000000000003";
    tempDirs.push(quarantinePath);
    await fs.mkdir(nestedLockPath, { recursive: true, mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const originalOpendir = fs.opendir.bind(fs);
    let selectedScans = 0;
    let rewritten = false;
    vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
      let resolvedTarget = path.resolve(String(target));
      try {
        resolvedTarget = await fs.realpath(target);
      } catch {
        // Preserve the original open behavior for disappearing paths.
      }
      if (resolvedTarget === path.resolve(nestedLockPath)) {
        selectedScans += 1;
        if (selectedScans === 2) {
          const persisted = JSON.parse(
            await fs.readFile(ownerPath, "utf8")
          ) as Record<string, unknown>;
          persisted.owner_token = replacementToken;
          await fs.writeFile(ownerPath, `${JSON.stringify(persisted)}\n`, {
            encoding: "utf8"
          });
          rewritten = true;
        }
      }
      return originalOpendir(target, options);
    });

    const inspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );

    expect(rewritten).toBe(true);
    expect(selectedScans).toBe(2);
    expect(inspection).toMatchObject({
      quarantineId,
      quarantinePath,
      rootEntryCount: 1,
      rootOwnerMetadataStatus: "missing",
      lockEntryType: "directory",
      lockEntryCount: 1,
      lockOwnerMetadataStatus: "valid",
      layout: "unknown",
      stateChanged: true
    });
    expect(inspection.ownerLocation).toBeUndefined();
    expect(inspection.ownerMetadataStatus).toBeUndefined();
    expect(inspection.ownerToken).toBeUndefined();
    expect(JSON.stringify(inspection)).not.toContain(lock.ownerToken);
    expect(JSON.stringify(inspection)).not.toContain(replacementToken);
    expect(JSON.parse(await fs.readFile(ownerPath, "utf8"))).toMatchObject({
      owner_token: replacementToken
    });
    await lock.release();
  });

  it("withdraws nested quarantine authority after terminal owner file generation drift", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Sq0005";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const nestedLockPath = path.join(quarantinePath, "lock");
    const ownerPath = getJsonlAuditLockOwnerPath(nestedLockPath);
    const replacementToken = "00000000-0000-4000-8000-000000000043";
    tempDirs.push(quarantinePath);
    await fs.mkdir(nestedLockPath, { recursive: true, mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const originalLstat = fs.lstat.bind(fs);
    let rootPathReads = 0;
    let rewritten = false;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.resolve(String(target)) === path.resolve(quarantinePath)) {
        rootPathReads += 1;
        if (rootPathReads === 5) {
          const persisted = JSON.parse(
            await fs.readFile(ownerPath, "utf8")
          ) as Record<string, unknown>;
          persisted.owner_token = replacementToken;
          await fs.writeFile(ownerPath, `${JSON.stringify(persisted)}\n`, {
            encoding: "utf8"
          });
          rewritten = true;
        }
      }
      return originalLstat(target, options);
    });

    const inspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );

    expect(rewritten).toBe(true);
    expect(rootPathReads).toBe(5);
    expect(inspection).toMatchObject({
      quarantineId,
      quarantinePath,
      rootEntryCount: 1,
      rootOwnerMetadataStatus: "missing",
      lockEntryType: "directory",
      lockEntryCount: 1,
      lockOwnerMetadataStatus: "valid",
      layout: "unknown",
      stateChanged: true
    });
    expect(inspection.ownerLocation).toBeUndefined();
    expect(inspection.ownerMetadataStatus).toBeUndefined();
    expect(inspection.ownerToken).toBeUndefined();
    expect(JSON.stringify(inspection)).not.toContain(lock.ownerToken);
    expect(JSON.stringify(inspection)).not.toContain(replacementToken);
    expect(JSON.parse(await fs.readFile(ownerPath, "utf8"))).toMatchObject({
      owner_token: replacementToken
    });
    await lock.release();
  });

  it("withholds empty quarantine fingerprint after terminal empty generation drift", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Sq0003";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const extraName = "terminal-empty-secret";
    const extraPath = path.join(quarantinePath, extraName);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    const originalOpendir = fs.opendir.bind(fs);
    let selectedScans = 0;
    let injected = false;
    vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
      let resolvedTarget = path.resolve(String(target));
      try {
        resolvedTarget = await fs.realpath(target);
      } catch {
        // Preserve the original open behavior for disappearing paths.
      }
      const directory = await originalOpendir(target, options);
      if (resolvedTarget === path.resolve(quarantinePath)) {
        selectedScans += 1;
        if (selectedScans === 4) {
          const read = directory.read.bind(directory);
          vi.spyOn(directory, "read").mockImplementation(async () => {
            const entry = await read();
            if (entry === null && !injected) {
              await new Promise((resolve) => setTimeout(resolve, 5));
              await fs.writeFile(extraPath, "preserved\n", { mode: 0o600 });
              injected = true;
            }
            return entry;
          });
        }
      }
      return directory;
    });

    const inspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );

    expect(injected).toBe(true);
    expect(selectedScans).toBe(4);
    expect(inspection).toMatchObject({
      quarantineId,
      quarantinePath,
      rootEntryCount: 0,
      layout: "unknown",
      stateChanged: true
    });
    expect(inspection.emptyDirectoryFingerprint).toBeUndefined();
    expect(JSON.stringify(inspection)).not.toContain(extraName);
    expect(await fs.readFile(extraPath, "utf8")).toBe("preserved\n");
  });

  it("does not follow symbolic-link quarantine candidates", async () => {
    if (process.platform === "win32") {
      return;
    }
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const victim = path.join(dir, "victim.txt");
    const quarantinePath = `${getJsonlAuditLockQuarantinePrefix(filePath)}Sy0001`;
    tempDirs.push(quarantinePath);
    await fs.writeFile(victim, "unchanged", { mode: 0o600 });
    await fs.symlink(victim, quarantinePath);

    const inspection = await inspectJsonlAuditLockQuarantines(filePath);

    expect(inspection.entries).toEqual([expect.objectContaining({
      quarantinePath,
      exists: true,
      entryType: "symbolic_link"
    })]);
    expect(await fs.readFile(victim, "utf8")).toBe("unchanged");
    expect((await fs.lstat(quarantinePath)).isSymbolicLink()).toBe(true);
  });

  it("bounds selected quarantine root child scans", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Bq0001";
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
    const originalOpendir = fs.opendir.bind(fs);
    let opendirCalls = 0;
    let readCalls = 0;
    vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
      const directory = await originalOpendir(target, options);
      opendirCalls += 1;
      const read = directory.read.bind(directory);
      vi.spyOn(directory, "read").mockImplementation(async () => {
        readCalls += 1;
        return read();
      });
      return directory;
    });
    const readdir = vi.spyOn(fs, "readdir");

    const inspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );

    expect(opendirCalls).toBe(2);
    expect(readCalls).toBe(
      2 * (MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES + 1)
    );
    expect(readdir).not.toHaveBeenCalled();
    expect(inspection).toMatchObject({
      quarantineId,
      quarantinePath,
      exists: true,
      entryType: "directory",
      layout: "unknown",
      rootEntryScanCount: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
      rootEntryScanLimit: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
      rootEntryScanTruncated: true
    });
    expect(inspection.rootEntryCount).toBeUndefined();
    expect(inspection.rootOwnerMetadataStatus).toBeUndefined();
    expect(inspection.ownerLocation).toBeUndefined();
    expect(inspection.ownerToken).toBeUndefined();
    expect(inspection.emptyDirectoryFingerprint).toBeUndefined();
    const serialized = JSON.stringify(inspection);
    for (const overflowName of overflowNames) {
      expect(serialized).not.toContain(overflowName);
    }
  });

  it("withholds quarantine recovery authority for a truncated nested lock", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Bq0002";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(quarantinePath);
    await fs.mkdir(nestedLockPath, { recursive: true, mode: 0o700 });
    await fs.writeFile(
      getJsonlAuditLockOwnerPath(nestedLockPath),
      "invalid-owner\n",
      { mode: 0o600 }
    );
    await fs.writeFile(
      path.join(nestedLockPath, "overflow-secret-a"),
      "overflow\n",
      { mode: 0o600 }
    );
    await fs.writeFile(
      path.join(nestedLockPath, "overflow-secret-b"),
      "overflow\n",
      { mode: 0o600 }
    );

    const inspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );

    expect(inspection).toMatchObject({
      layout: "unknown",
      rootEntryCount: 1,
      rootEntryScanCount: 1,
      rootEntryScanLimit: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
      rootEntryScanTruncated: false,
      lockEntryType: "directory",
      lockEntryScanCount: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
      lockEntryScanLimit: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
      lockEntryScanTruncated: true
    });
    expect(inspection.lockEntryCount).toBeUndefined();
    expect(inspection.lockOwnerMetadataStatus).toBeUndefined();
    expect(inspection.ownerLocation).toBeUndefined();
    expect(inspection.ownerToken).toBeUndefined();
  });

  it("bounds quarantine inspection output without deleting overflow entries", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const prefix = getJsonlAuditLockQuarantinePrefix(filePath);
    const quarantinePaths = Array.from(
      { length: 129 },
      (_, index) => `${prefix}Q${String(index).padStart(5, "0")}`
    );
    tempDirs.push(...quarantinePaths);
    await Promise.all(quarantinePaths.map(
      (quarantinePath) => fs.mkdir(quarantinePath, { mode: 0o700 })
    ));

    const inspection = await inspectJsonlAuditLockQuarantines(filePath);

    expect(inspection).toMatchObject({
      matchedEntryCount: 129,
      resultLimit: 128,
      resultTruncated: true
    });
    expect(inspection.entries).toHaveLength(128);
    await expect(fs.access(quarantinePaths[128]!)).resolves.toBeUndefined();
  });

  it("inspects exact lock disposal residues and correlates source quarantine state", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath, {
      now: () => Date.parse("2026-07-22T10:30:00.000Z")
    });
    const ownerOnlyPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Da0001",
      "Db0001"
    );
    const correlatedPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Da0002",
      "Db0002"
    );
    const sourceQuarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      "Da0002"
    );
    const emptyPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Da0003",
      "Db0003"
    );
    const unknownPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Da0004",
      "Db0004"
    );
    const blockerPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Da0005",
      "Db0005"
    );
    const ignoredPath = `${getJsonlAuditLockQuarantinePrefix(filePath)}Da0006.dispose-invalid`;
    tempDirs.push(
      lock.lockPath,
      ownerOnlyPath,
      correlatedPath,
      sourceQuarantinePath,
      emptyPath,
      unknownPath,
      blockerPath,
      ignoredPath
    );
    await fs.mkdir(ownerOnlyPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(ownerOnlyPath));
    await fs.mkdir(correlatedPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(correlatedPath));
    await fs.mkdir(path.join(sourceQuarantinePath, "lock"), {
      recursive: true,
      mode: 0o700
    });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(sourceQuarantinePath)
    );
    await fs.mkdir(emptyPath, { mode: 0o700 });
    await fs.mkdir(unknownPath, { mode: 0o700 });
    await fs.writeFile(path.join(unknownPath, "unexpected"), "preserved", {
      mode: 0o600
    });
    await fs.writeFile(blockerPath, "blocker", { mode: 0o600 });
    await fs.mkdir(ignoredPath, { mode: 0o700 });

    const inspection = await inspectJsonlAuditLockDisposals(
      filePath,
      () => Date.parse("2026-07-22T10:31:00.000Z")
    );
    const byPath = new Map(
      inspection.entries.map((entry) => [entry.disposalPath, entry])
    );

    expect(inspection).toMatchObject({
      lockPath: lock.lockPath,
      disposalNamespacePrefix: getJsonlAuditLockQuarantinePrefix(filePath),
      scanLimit: 4_096,
      scanTruncated: false,
      matchedEntryCount: 5,
      resultLimit: 128,
      resultTruncated: false
    });
    expect(inspection.entries).toHaveLength(5);
    expect(byPath.get(ownerOnlyPath)).toMatchObject({
      quarantineId: "Da0001",
      sourceQuarantineExists: false,
      disposalId: "Db0001",
      entryType: "directory",
      layout: "owner_only",
      rootEntryCount: 1,
      ownerMetadataStatus: "valid",
      ownerToken: lock.ownerToken,
      ownerPid: process.pid
    });
    expect(byPath.get(correlatedPath)).toMatchObject({
      quarantineId: "Da0002",
      quarantinePath: sourceQuarantinePath,
      sourceQuarantineExists: true,
      sourceQuarantineEntryType: "directory",
      sourceQuarantineLayout: "lock_and_owner",
      disposalId: "Db0002",
      layout: "owner_only",
      ownerMetadataStatus: "valid",
      ownerToken: lock.ownerToken
    });
    expect(byPath.get(emptyPath)).toMatchObject({
      sourceQuarantineExists: false,
      entryType: "directory",
      layout: "empty",
      rootEntryCount: 0,
      ownerMetadataStatus: "missing",
      emptyDirectoryFingerprint: expect.stringMatching(/^[0-9a-f]{32}$/u)
    });
    expect(byPath.get(unknownPath)).toMatchObject({
      entryType: "directory",
      layout: "unknown",
      rootEntryCount: 1,
      ownerMetadataStatus: "missing"
    });
    expect(byPath.get(blockerPath)).toMatchObject({
      entryType: "regular_file"
    });
    expect(byPath.has(ignoredPath)).toBe(false);
    expect(await fs.readFile(path.join(unknownPath, "unexpected"), "utf8")).toBe("preserved");
    expect(await fs.readFile(blockerPath, "utf8")).toBe("blocker");
    await lock.release();
  });

  it("withdraws owner-only disposal authority after selected owner rewrite", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Sd0001";
    const disposalId = "Se0001";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const ownerPath = getJsonlAuditLockOwnerPath(disposalPath);
    const replacementToken = "00000000-0000-4000-8000-000000000004";
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const originalOpendir = fs.opendir.bind(fs);
    let selectedScans = 0;
    let rewritten = false;
    vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
      let resolvedTarget = path.resolve(String(target));
      try {
        resolvedTarget = await fs.realpath(target);
      } catch {
        // Preserve the original open behavior for disappearing paths.
      }
      if (resolvedTarget === path.resolve(disposalPath)) {
        selectedScans += 1;
        if (selectedScans === 2) {
          const persisted = JSON.parse(
            await fs.readFile(ownerPath, "utf8")
          ) as Record<string, unknown>;
          persisted.owner_token = replacementToken;
          await fs.writeFile(ownerPath, `${JSON.stringify(persisted)}\n`, {
            encoding: "utf8"
          });
          rewritten = true;
        }
      }
      return originalOpendir(target, options);
    });

    const inspection = await inspectJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId
    );

    expect(rewritten).toBe(true);
    expect(selectedScans).toBe(2);
    expect(inspection).toMatchObject({
      quarantineId,
      sourceQuarantineExists: false,
      disposalId,
      disposalPath,
      exists: true,
      entryType: "directory",
      rootEntryCount: 1,
      layout: "unknown",
      stateChanged: true
    });
    expect(inspection.ownerMetadataStatus).toBeUndefined();
    expect(inspection.ownerToken).toBeUndefined();
    expect(inspection.emptyDirectoryFingerprint).toBeUndefined();
    expect(JSON.stringify(inspection)).not.toContain(lock.ownerToken);
    expect(JSON.stringify(inspection)).not.toContain(replacementToken);
    expect(JSON.parse(await fs.readFile(ownerPath, "utf8"))).toMatchObject({
      owner_token: replacementToken
    });
    await lock.release();
  });

  it("withdraws owner-only disposal authority after terminal owner file generation drift", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Sd0003";
    const disposalId = "Se0003";
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
    const replacementToken = "00000000-0000-4000-8000-000000000044";
    tempDirs.push(quarantinePath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const originalLstat = fs.lstat.bind(fs);
    let sourcePathReads = 0;
    let rewritten = false;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.resolve(String(target)) === path.resolve(quarantinePath)) {
        sourcePathReads += 1;
        if (sourcePathReads === 2) {
          const persisted = JSON.parse(
            await fs.readFile(ownerPath, "utf8")
          ) as Record<string, unknown>;
          persisted.owner_token = replacementToken;
          await fs.writeFile(ownerPath, `${JSON.stringify(persisted)}\n`, {
            encoding: "utf8"
          });
          rewritten = true;
        }
      }
      return originalLstat(target, options);
    });

    const inspection = await inspectJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId
    );

    expect(rewritten).toBe(true);
    expect(sourcePathReads).toBe(2);
    expect(inspection).toMatchObject({
      quarantineId,
      quarantinePath,
      sourceQuarantineExists: false,
      disposalId,
      disposalPath,
      exists: true,
      entryType: "directory",
      rootEntryCount: 1,
      layout: "unknown",
      stateChanged: true
    });
    expect(inspection.ownerMetadataStatus).toBeUndefined();
    expect(inspection.ownerToken).toBeUndefined();
    expect(inspection.emptyDirectoryFingerprint).toBeUndefined();
    expect(JSON.stringify(inspection)).not.toContain(lock.ownerToken);
    expect(JSON.stringify(inspection)).not.toContain(replacementToken);
    expect(JSON.parse(await fs.readFile(ownerPath, "utf8"))).toMatchObject({
      owner_token: replacementToken
    });
    await lock.release();
  });

  it("withholds empty disposal fingerprint after terminal empty generation drift", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Sd0002";
    const disposalId = "Se0002";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const extraName = "terminal-empty-secret";
    const extraPath = path.join(disposalPath, extraName);
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    const originalOpendir = fs.opendir.bind(fs);
    let selectedScans = 0;
    let injected = false;
    vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
      let resolvedTarget = path.resolve(String(target));
      try {
        resolvedTarget = await fs.realpath(target);
      } catch {
        // Preserve the original open behavior for disappearing paths.
      }
      const directory = await originalOpendir(target, options);
      if (resolvedTarget === path.resolve(disposalPath)) {
        selectedScans += 1;
        if (selectedScans === 4) {
          const read = directory.read.bind(directory);
          vi.spyOn(directory, "read").mockImplementation(async () => {
            const entry = await read();
            if (entry === null && !injected) {
              await new Promise((resolve) => setTimeout(resolve, 5));
              await fs.writeFile(extraPath, "preserved\n", { mode: 0o600 });
              injected = true;
            }
            return entry;
          });
        }
      }
      return directory;
    });

    const inspection = await inspectJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId
    );

    expect(injected).toBe(true);
    expect(selectedScans).toBe(4);
    expect(inspection).toMatchObject({
      quarantineId,
      sourceQuarantineExists: false,
      disposalId,
      disposalPath,
      rootEntryCount: 0,
      layout: "unknown",
      stateChanged: true
    });
    expect(inspection.emptyDirectoryFingerprint).toBeUndefined();
    expect(JSON.stringify(inspection)).not.toContain(extraName);
    expect(await fs.readFile(extraPath, "utf8")).toBe("preserved\n");
  });

  it("withdraws owner-only disposal authority when source appears at terminal check", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Sf0001";
    const disposalId = "Sg0001";
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
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(disposalPath)
    );
    const originalLstat = fs.lstat.bind(fs);
    let sourcePathReads = 0;
    let injected = false;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.resolve(String(target)) === path.resolve(quarantinePath)) {
        sourcePathReads += 1;
        if (sourcePathReads === 2) {
          await fs.mkdir(quarantinePath, { mode: 0o700 });
          injected = true;
        }
      }
      return originalLstat(target, options);
    });

    const inspection = await inspectJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId
    );

    expect(injected).toBe(true);
    expect(sourcePathReads).toBe(2);
    expect(inspection).toMatchObject({
      quarantineId,
      quarantinePath,
      sourceQuarantineExists: true,
      sourceQuarantineEntryType: "directory",
      sourceQuarantineLayout: "unknown",
      sourceQuarantineStateChanged: true,
      disposalId,
      disposalPath,
      exists: true,
      entryType: "directory",
      rootEntryCount: 1,
      layout: "unknown",
      stateChanged: true
    });
    expect(inspection.ownerMetadataStatus).toBeUndefined();
    expect(inspection.ownerToken).toBeUndefined();
    expect(inspection.ownerPid).toBeUndefined();
    expect(inspection.emptyDirectoryFingerprint).toBeUndefined();
    expect(JSON.stringify(inspection)).not.toContain(lock.ownerToken);
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("withdraws empty disposal fingerprint when source appears at terminal check", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Sf0002";
    const disposalId = "Sg0002";
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
    const originalLstat = fs.lstat.bind(fs);
    let sourcePathReads = 0;
    let injected = false;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.resolve(String(target)) === path.resolve(quarantinePath)) {
        sourcePathReads += 1;
        if (sourcePathReads === 2) {
          await fs.mkdir(quarantinePath, { mode: 0o700 });
          injected = true;
        }
      }
      return originalLstat(target, options);
    });

    const inspection = await inspectJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId
    );

    expect(injected).toBe(true);
    expect(sourcePathReads).toBe(2);
    expect(inspection).toMatchObject({
      quarantineId,
      quarantinePath,
      sourceQuarantineExists: true,
      sourceQuarantineEntryType: "directory",
      sourceQuarantineLayout: "unknown",
      sourceQuarantineStateChanged: true,
      disposalId,
      disposalPath,
      exists: true,
      entryType: "directory",
      rootEntryCount: 0,
      layout: "unknown",
      stateChanged: true
    });
    expect(inspection.ownerMetadataStatus).toBeUndefined();
    expect(inspection.emptyDirectoryFingerprint).toBeUndefined();
    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
  });

  it("does not follow symbolic-link lock disposal candidates", async () => {
    if (process.platform === "win32") {
      return;
    }
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const victimPath = path.join(dir, "victim.txt");
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      "Ds0001",
      "Dt0001"
    );
    tempDirs.push(disposalPath);
    await fs.writeFile(victimPath, "unchanged", { mode: 0o600 });
    await fs.symlink(victimPath, disposalPath);

    await expect(inspectJsonlAuditLockDisposal(
      filePath,
      "Ds0001",
      "Dt0001"
    )).resolves.toMatchObject({
      disposalPath,
      exists: true,
      entryType: "symbolic_link",
      sourceQuarantineExists: false
    });
    expect(await fs.readFile(victimPath, "utf8")).toBe("unchanged");
  });

  it("bounds selected disposal root child scans", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Bd0001";
    const disposalId = "Be0001";
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
    const originalOpendir = fs.opendir.bind(fs);
    let opendirCalls = 0;
    let readCalls = 0;
    vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
      const directory = await originalOpendir(target, options);
      opendirCalls += 1;
      const read = directory.read.bind(directory);
      vi.spyOn(directory, "read").mockImplementation(async () => {
        readCalls += 1;
        return read();
      });
      return directory;
    });
    const readdir = vi.spyOn(fs, "readdir");

    const inspection = await inspectJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId
    );

    expect(opendirCalls).toBe(2);
    expect(readCalls).toBe(
      2 * (MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES + 1)
    );
    expect(readdir).not.toHaveBeenCalled();
    expect(inspection).toMatchObject({
      disposalPath,
      exists: true,
      entryType: "directory",
      layout: "unknown",
      rootEntryScanCount: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
      rootEntryScanLimit: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
      rootEntryScanTruncated: true
    });
    expect(inspection.rootEntryCount).toBeUndefined();
    expect(inspection.ownerMetadataStatus).toBeUndefined();
    expect(inspection.ownerToken).toBeUndefined();
    expect(inspection.emptyDirectoryFingerprint).toBeUndefined();
    const serialized = JSON.stringify(inspection);
    for (const overflowName of overflowNames) {
      expect(serialized).not.toContain(overflowName);
    }
  });

  it("bounds lock disposal result materialization", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const disposalPaths = Array.from(
      { length: 129 },
      (_, index) => getJsonlAuditLockDisposalPath(
        filePath,
        "Dr0001",
        `R${String(index).padStart(5, "0")}`
      )
    );
    tempDirs.push(...disposalPaths);
    await Promise.all(disposalPaths.map(
      (disposalPath) => fs.mkdir(disposalPath, { mode: 0o700 })
    ));

    const inspection = await inspectJsonlAuditLockDisposals(filePath);

    expect(inspection).toMatchObject({
      matchedEntryCount: 129,
      resultLimit: 128,
      resultTruncated: true
    });
    expect(inspection.entries).toHaveLength(128);
    await expect(fs.access(disposalPaths[128]!)).resolves.toBeUndefined();
  });

  it("removes only the confirmed owner_only disposal with an absent source quarantine", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Dc0001";
    const disposalId = "Dd0001";
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

    await expect(cleanupJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      ownerFingerprint
    )).resolves.toEqual({
      quarantineId,
      quarantinePath,
      disposalId,
      disposalPath,
      existed: true,
      removed: true,
      ownerFingerprint,
      cleanupHandlesClosed: true
    });

    await expect(fs.access(disposalPath)).rejects.toThrow();
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("rejects truncated disposal state before owner deletion", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Dc0012";
    const disposalId = "Dd0012";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const ownerPath = getJsonlAuditLockOwnerPath(disposalPath);
    const overflowPaths = [
      path.join(disposalPath, "overflow-secret-a"),
      path.join(disposalPath, "overflow-secret-b")
    ];
    tempDirs.push(lock.lockPath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, ownerPath);
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );
    const unlink = vi.spyOn(fs, "unlink");

    await expect(cleanupJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      ownerFingerprint,
      {
        beforeOwnerDeletion: async () => {
          await Promise.all(overflowPaths.map((overflowPath) => fs.writeFile(
            overflowPath,
            "preserved\n",
            { mode: 0o600 }
          )));
        }
      }
    )).rejects.toThrow("Audit lock disposal changed before cleanup");

    expect(unlink).not.toHaveBeenCalled();
    expect(await fs.readFile(ownerPath, "utf8")).toBe(
      await fs.readFile(lock.ownerPath, "utf8")
    );
    for (const overflowPath of overflowPaths) {
      expect(await fs.readFile(overflowPath, "utf8")).toBe("preserved\n");
    }
    await lock.release();
  });

  it("uses descriptor-relative paths for owner-only disposal cleanup", async () => {
    const dir = await createTempDir();
    if (!await supportsJsonlAuditDescriptorRelativeMutation(dir)) {
      return;
    }
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Dc0009";
    const disposalId = "Dd0009";
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
    const unlink = vi.spyOn(fs, "unlink");
    const rmdir = vi.spyOn(fs, "rmdir");

    await expect(cleanupJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      ownerFingerprint
    )).resolves.toMatchObject({
      existed: true,
      removed: true,
      ownerFingerprint
    });

    const unlinkPaths = unlink.mock.calls.map(([target]) => String(target));
    const rmdirPaths = rmdir.mock.calls.map(([target]) => String(target));
    expect(unlinkPaths).toHaveLength(1);
    expect(rmdirPaths).toHaveLength(1);
    expect([...unlinkPaths, ...rmdirPaths].every(
      (mutationPath) => mutationPath.startsWith("/proc/self/fd/")
    )).toBe(true);
    vi.restoreAllMocks();
    await lock.release();
  });

  it("does not commit a wrong-object disposal owner unlink", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    tempDirs.push(lock.lockPath);
    const quarantineId = "Dc0011";
    const disposalId = "Dd0011";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const disposalOwnerPath = getJsonlAuditLockOwnerPath(disposalPath);
    const detachedOwnerPath = path.join(disposalPath, "owner.detached");
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, disposalOwnerPath);
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );
    const originalUnlink = fs.unlink.bind(fs);
    let unlinkIntercepted = false;
    vi.spyOn(fs, "unlink").mockImplementation(async (target) => {
      if (
        !unlinkIntercepted
        && path.basename(String(target)) === JSONL_AUDIT_LOCK_OWNER_FILE_NAME
      ) {
        unlinkIntercepted = true;
        await fs.rename(disposalOwnerPath, detachedOwnerPath);
        await fs.copyFile(detachedOwnerPath, disposalOwnerPath);
        await originalUnlink(target);
        return;
      }
      await originalUnlink(target);
    });

    await expect(cleanupJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      ownerFingerprint
    )).rejects.toThrow("Audit lock disposal changed during cleanup");

    expect(await fs.readdir(disposalPath)).toEqual(["owner.detached"]);
    await lock.release();
  });

  it("preserves owner_only disposal when the fingerprint does not match", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Dc0002";
    const disposalId = "Dd0002";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    tempDirs.push(lock.lockPath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(disposalPath));

    await expect(cleanupJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      "0".repeat(32)
    )).rejects.toThrow("disposal owner fingerprint does not match");

    expect(await fs.readdir(disposalPath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("refuses disposal cleanup while the source quarantine exists or appears", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const existingQuarantineId = "Dc0003";
    const existingDisposalId = "Dd0003";
    const existingQuarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      existingQuarantineId
    );
    const existingDisposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      existingQuarantineId,
      existingDisposalId
    );
    const racedQuarantineId = "Dc0004";
    const racedDisposalId = "Dd0004";
    const racedQuarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      racedQuarantineId
    );
    const racedDisposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      racedQuarantineId,
      racedDisposalId
    );
    tempDirs.push(
      lock.lockPath,
      existingQuarantinePath,
      existingDisposalPath,
      racedQuarantinePath,
      racedDisposalPath
    );
    await fs.mkdir(existingQuarantinePath, { mode: 0o700 });
    await fs.mkdir(existingDisposalPath, { mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(existingDisposalPath)
    );
    await fs.mkdir(racedDisposalPath, { mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(racedDisposalPath)
    );
    const racedOwnerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      racedQuarantineId,
      racedDisposalId
    );

    await expect(cleanupJsonlAuditLockDisposal(
      filePath,
      existingQuarantineId,
      existingDisposalId,
      "0".repeat(32)
    )).rejects.toThrow("source quarantine to be absent");
    expect(await fs.readdir(existingDisposalPath)).toEqual(["owner.json"]);

    await expect(cleanupJsonlAuditLockDisposal(
      filePath,
      racedQuarantineId,
      racedDisposalId,
      racedOwnerFingerprint,
      {
        beforeOwnerDeletion: async () => {
          await fs.mkdir(racedQuarantinePath, { mode: 0o700 });
        }
      }
    )).rejects.toThrow("source quarantine to be absent");
    expect(await fs.readdir(racedDisposalPath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("refuses a disposal directory replacement with copied owner metadata", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Dc0006";
    const disposalId = "Dd0006";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const movedDisposalPath = `${disposalPath}.original`;
    tempDirs.push(lock.lockPath, disposalPath, movedDisposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(disposalPath));
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );

    await expect(cleanupJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      ownerFingerprint,
      {
        beforeOwnerDeletion: async () => {
          await fs.rename(disposalPath, movedDisposalPath);
          await fs.mkdir(disposalPath, { mode: 0o700 });
          await fs.copyFile(
            getJsonlAuditLockOwnerPath(movedDisposalPath),
            getJsonlAuditLockOwnerPath(disposalPath)
          );
        }
      }
    )).rejects.toThrow("Audit lock disposal changed before cleanup");

    expect(await fs.readdir(disposalPath)).toEqual(["owner.json"]);
    expect(await fs.readdir(movedDisposalPath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("refuses a copied-metadata disposal owner replacement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Dc0007";
    const disposalId = "Dd0007";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const disposalOwnerPath = getJsonlAuditLockOwnerPath(disposalPath);
    const movedOwnerPath = `${disposalPath}.owner-original`;
    tempDirs.push(lock.lockPath, disposalPath, movedOwnerPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, disposalOwnerPath);
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );

    await expect(cleanupJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      ownerFingerprint,
      {
        beforeOwnerDeletion: async () => {
          await fs.rename(disposalOwnerPath, movedOwnerPath);
          await fs.copyFile(movedOwnerPath, disposalOwnerPath);
        }
      }
    )).rejects.toThrow("Audit lock disposal changed before cleanup");

    expect(await fs.readFile(disposalOwnerPath, "utf8")).toBe(
      await fs.readFile(movedOwnerPath, "utf8")
    );
    await lock.release();
  });

  it("preserves an unexpected disposal entry after owner deletion commit", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Dc0005";
    const disposalId = "Dd0005";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    const extraPath = path.join(disposalPath, "unexpected");
    tempDirs.push(lock.lockPath, disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(disposalPath));
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );

    await expect(cleanupJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      ownerFingerprint,
      {
        afterOwnerDeletion: async () => {
          await fs.writeFile(extraPath, "preserved", { mode: 0o600 });
        }
      }
    )).resolves.toEqual({
      quarantineId,
      quarantinePath,
      disposalId,
      disposalPath,
      existed: true,
      removed: true,
      ownerFingerprint,
      residualDisposalPath: disposalPath,
      cleanupHandlesClosed: true
    });

    expect(await fs.readFile(extraPath, "utf8")).toBe("preserved");
    expect(await fs.readdir(disposalPath)).toEqual(["unexpected"]);
    await expect(inspectJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId
    )).resolves.toMatchObject({
      layout: "unknown",
      ownerMetadataStatus: "missing"
    });
    await lock.release();
  });

  it("removes a confirmed exact empty quarantine", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Eq0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    const inspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );
    const quarantineFingerprint = inspection.emptyDirectoryFingerprint!;
    expect(inspection).toMatchObject({
      layout: "empty",
      rootEntryCount: 0,
      emptyDirectoryFingerprint: expect.stringMatching(/^[0-9a-f]{32}$/u)
    });

    await expect(cleanupJsonlAuditEmptyLockQuarantine(
      filePath,
      quarantineId,
      quarantineFingerprint
    )).resolves.toEqual({
      quarantineId,
      quarantinePath,
      existed: true,
      removed: true,
      quarantineFingerprint,
      cleanupHandlesClosed: true
    });
    await expect(fs.access(quarantinePath)).rejects.toThrow();

    await expect(cleanupJsonlAuditEmptyLockQuarantine(
      filePath,
      quarantineId,
      quarantineFingerprint
    )).resolves.toEqual({
      quarantineId,
      quarantinePath,
      existed: false,
      removed: false
    });
  });

  it("preserves empty quarantine on fingerprint mismatch and rejects non-empty state", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const mismatchId = "Eq0002";
    const mismatchPath = getJsonlAuditLockQuarantinePath(filePath, mismatchId);
    const nonEmptyId = "Eq0003";
    const nonEmptyPath = getJsonlAuditLockQuarantinePath(filePath, nonEmptyId);
    const unexpectedPath = path.join(nonEmptyPath, "unexpected");
    tempDirs.push(mismatchPath, nonEmptyPath);
    await fs.mkdir(mismatchPath, { mode: 0o700 });
    await fs.mkdir(nonEmptyPath, { mode: 0o700 });
    await fs.writeFile(unexpectedPath, "preserved", { mode: 0o600 });

    await expect(cleanupJsonlAuditEmptyLockQuarantine(
      filePath,
      mismatchId,
      "0".repeat(32)
    )).rejects.toThrow("empty quarantine fingerprint does not match");
    expect(await fs.readdir(mismatchPath)).toEqual([]);

    await expect(cleanupJsonlAuditEmptyLockQuarantine(
      filePath,
      nonEmptyId,
      "0".repeat(32)
    )).rejects.toThrow("requires an exact empty directory");
    expect(await fs.readFile(unexpectedPath, "utf8")).toBe("preserved");
  });

  it("refuses extra-entry and directory-replacement races during empty quarantine cleanup", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const extraId = "Eq0004";
    const extraPath = getJsonlAuditLockQuarantinePath(filePath, extraId);
    const extraEntryPath = path.join(extraPath, "unexpected");
    const replacementId = "Eq0005";
    const replacementPath = getJsonlAuditLockQuarantinePath(
      filePath,
      replacementId
    );
    tempDirs.push(extraPath, replacementPath);
    await fs.mkdir(extraPath, { mode: 0o700 });
    await fs.mkdir(replacementPath, { mode: 0o700 });
    const extraInspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      extraId
    );
    const replacementInspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      replacementId
    );

    await expect(cleanupJsonlAuditEmptyLockQuarantine(
      filePath,
      extraId,
      extraInspection.emptyDirectoryFingerprint!,
      {
        beforeRemoval: async () => {
          await fs.writeFile(extraEntryPath, "preserved", { mode: 0o600 });
        }
      }
    )).rejects.toThrow("empty quarantine changed before cleanup");
    expect(await fs.readFile(extraEntryPath, "utf8")).toBe("preserved");

    await expect(cleanupJsonlAuditEmptyLockQuarantine(
      filePath,
      replacementId,
      replacementInspection.emptyDirectoryFingerprint!,
      {
        beforeRemoval: async () => {
          await fs.rmdir(replacementPath);
          await fs.mkdir(replacementPath, { mode: 0o700 });
        }
      }
    )).rejects.toThrow("empty quarantine changed before cleanup");
    expect((await fs.stat(replacementPath)).isDirectory()).toBe(true);
  });

  it("removes a confirmed source-absent exact empty disposal", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Ec0001";
    const disposalId = "Ed0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      quarantineId,
      disposalId
    );
    tempDirs.push(disposalPath);
    await fs.mkdir(disposalPath, { mode: 0o700 });
    const inspection = await inspectJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId
    );
    const disposalFingerprint = inspection.emptyDirectoryFingerprint!;
    expect(disposalFingerprint).toMatch(/^[0-9a-f]{32}$/u);

    await expect(cleanupJsonlAuditEmptyLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      disposalFingerprint
    )).resolves.toEqual({
      quarantineId,
      quarantinePath,
      disposalId,
      disposalPath,
      existed: true,
      removed: true,
      disposalFingerprint,
      cleanupHandlesClosed: true
    });

    await expect(fs.access(disposalPath)).rejects.toThrow();
  });

  it("uses descriptor-relative parent paths for empty quarantine and disposal cleanup", async () => {
    const dir = await createTempDir();
    if (!await supportsJsonlAuditDescriptorRelativeMutation(dir)) {
      return;
    }
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Eq0009";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const disposalQuarantineId = "Ec0009";
    const disposalId = "Ed0009";
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      disposalQuarantineId,
      disposalId
    );
    tempDirs.push(quarantinePath, disposalPath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.mkdir(disposalPath, { mode: 0o700 });
    const quarantineInspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );
    const disposalInspection = await inspectJsonlAuditLockDisposal(
      filePath,
      disposalQuarantineId,
      disposalId
    );
    const rmdir = vi.spyOn(fs, "rmdir");

    await cleanupJsonlAuditEmptyLockQuarantine(
      filePath,
      quarantineId,
      quarantineInspection.emptyDirectoryFingerprint!
    );
    await cleanupJsonlAuditEmptyLockDisposal(
      filePath,
      disposalQuarantineId,
      disposalId,
      disposalInspection.emptyDirectoryFingerprint!
    );

    const rmdirPaths = rmdir.mock.calls.map(([target]) => String(target));
    expect(rmdirPaths).toHaveLength(2);
    expect(rmdirPaths.every(
      (mutationPath) => mutationPath.startsWith("/proc/self/fd/")
    )).toBe(true);
  });

  it("preserves empty disposal on fingerprint mismatch or source quarantine presence", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const mismatchQuarantineId = "Ec0002";
    const mismatchDisposalId = "Ed0002";
    const mismatchPath = getJsonlAuditLockDisposalPath(
      filePath,
      mismatchQuarantineId,
      mismatchDisposalId
    );
    const sourceQuarantineId = "Ec0003";
    const sourceDisposalId = "Ed0003";
    const sourcePath = getJsonlAuditLockQuarantinePath(
      filePath,
      sourceQuarantineId
    );
    const sourceDisposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      sourceQuarantineId,
      sourceDisposalId
    );
    tempDirs.push(mismatchPath, sourcePath, sourceDisposalPath);
    await fs.mkdir(mismatchPath, { mode: 0o700 });
    await fs.mkdir(sourcePath, { mode: 0o700 });
    await fs.mkdir(sourceDisposalPath, { mode: 0o700 });
    const sourceInspection = await inspectJsonlAuditLockDisposal(
      filePath,
      sourceQuarantineId,
      sourceDisposalId
    );

    await expect(cleanupJsonlAuditEmptyLockDisposal(
      filePath,
      mismatchQuarantineId,
      mismatchDisposalId,
      "0".repeat(32)
    )).rejects.toThrow("empty disposal fingerprint does not match");
    expect(await fs.readdir(mismatchPath)).toEqual([]);

    await expect(cleanupJsonlAuditEmptyLockDisposal(
      filePath,
      sourceQuarantineId,
      sourceDisposalId,
      sourceInspection.emptyDirectoryFingerprint!
    )).rejects.toThrow("source quarantine to be absent");
    expect(await fs.readdir(sourceDisposalPath)).toEqual([]);
  });

  it("refuses extra-entry and directory-replacement races during empty disposal cleanup", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const extraQuarantineId = "Ec0004";
    const extraDisposalId = "Ed0004";
    const extraPath = getJsonlAuditLockDisposalPath(
      filePath,
      extraQuarantineId,
      extraDisposalId
    );
    const extraEntryPath = path.join(extraPath, "unexpected");
    const replacementQuarantineId = "Ec0005";
    const replacementDisposalId = "Ed0005";
    const replacementPath = getJsonlAuditLockDisposalPath(
      filePath,
      replacementQuarantineId,
      replacementDisposalId
    );
    tempDirs.push(extraPath, replacementPath);
    await fs.mkdir(extraPath, { mode: 0o700 });
    await fs.mkdir(replacementPath, { mode: 0o700 });
    const extraInspection = await inspectJsonlAuditLockDisposal(
      filePath,
      extraQuarantineId,
      extraDisposalId
    );
    const replacementInspection = await inspectJsonlAuditLockDisposal(
      filePath,
      replacementQuarantineId,
      replacementDisposalId
    );

    await expect(cleanupJsonlAuditEmptyLockDisposal(
      filePath,
      extraQuarantineId,
      extraDisposalId,
      extraInspection.emptyDirectoryFingerprint!,
      {
        beforeRemoval: async () => {
          await fs.writeFile(extraEntryPath, "preserved", { mode: 0o600 });
        }
      }
    )).rejects.toThrow("empty disposal changed before cleanup");
    expect(await fs.readFile(extraEntryPath, "utf8")).toBe("preserved");

    await expect(cleanupJsonlAuditEmptyLockDisposal(
      filePath,
      replacementQuarantineId,
      replacementDisposalId,
      replacementInspection.emptyDirectoryFingerprint!,
      {
        beforeRemoval: async () => {
          await fs.rmdir(replacementPath);
          await fs.mkdir(replacementPath, { mode: 0o700 });
        }
      }
    )).rejects.toThrow("empty disposal changed before cleanup");
    expect((await fs.stat(replacementPath)).isDirectory()).toBe(true);
  });

  it("rejects a wrong-object empty quarantine rmdir that reports success", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const quarantineId = "Eq0006";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const detachedQuarantinePath = `${quarantinePath}.detached`;
    tempDirs.push(quarantinePath, detachedQuarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    const inspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );
    const originalRmdir = fs.rmdir.bind(fs);
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      const targetPath = String(target);
      if (path.basename(targetPath) === path.basename(quarantinePath)) {
        await fs.rename(quarantinePath, detachedQuarantinePath);
        await fs.mkdir(quarantinePath, { mode: 0o700 });
        await originalRmdir(targetPath);
        return;
      }
      await originalRmdir(target, options);
    });

    await expect(cleanupJsonlAuditEmptyLockQuarantine(
      filePath,
      quarantineId,
      inspection.emptyDirectoryFingerprint!
    )).rejects.toThrow("Audit lock empty quarantine changed before cleanup");

    expect(await fs.readdir(detachedQuarantinePath)).toEqual([]);
    await expect(fs.access(quarantinePath)).rejects.toThrow();
  });

  it("removes only the confirmed owner_only quarantine residue", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    tempDirs.push(lock.lockPath);
    const quarantineId = "Cl0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(quarantinePath));
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    await expect(cleanupJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint
    )).resolves.toEqual({
      quarantineId,
      quarantinePath,
      existed: true,
      removed: true,
      ownerFingerprint,
      cleanupHandlesClosed: true
    });

    await expect(fs.access(quarantinePath)).rejects.toThrow();
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("uses descriptor-relative mutations throughout private disposal cleanup", async () => {
    if (process.platform !== "linux") {
      return;
    }
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const probeHandle = await fs.open(dir, "r");
    const capability = await resolveJsonlAuditDirectoryMutationPath(
      { directoryPath: dir, handle: probeHandle },
      "probe"
    );
    await probeHandle.close();
    if (capability.mode !== "descriptor_relative") {
      return;
    }
    const lock = await acquireJsonlAuditFileLock(filePath);
    tempDirs.push(lock.lockPath);
    const quarantineId = "Cl0010";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(quarantinePath));
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const renamePaths: string[] = [];
    const unlinkPaths: string[] = [];
    const rmdirPaths: string[] = [];
    const originalRename = fs.rename.bind(fs);
    const originalUnlink = fs.unlink.bind(fs);
    const originalRmdir = fs.rmdir.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
      renamePaths.push(String(source), String(destination));
      await originalRename(source, destination);
    });
    vi.spyOn(fs, "unlink").mockImplementation(async (target) => {
      unlinkPaths.push(String(target));
      await originalUnlink(target);
    });
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      rmdirPaths.push(String(target));
      await originalRmdir(target, options);
    });

    await expect(cleanupJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint
    )).resolves.toMatchObject({ existed: true, removed: true });

    expect(renamePaths).toHaveLength(2);
    expect(unlinkPaths).toHaveLength(1);
    expect(rmdirPaths).toHaveLength(2);
    expect([...renamePaths, ...unlinkPaths, ...rmdirPaths].every(
      (mutationPath) => mutationPath.startsWith("/proc/self/fd/")
    )).toBe(true);
    await lock.release();
  });

  it("refuses a replacement private disposal root before owner isolation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Cl0011";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const disposalPrefix = `${quarantinePath}.dispose-`;
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(quarantinePath));
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    let disposalRoot = "";
    let detachedRoot = "";

    await expect(cleanupJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint,
      {
        beforeOwnerIsolation: async () => {
          disposalRoot = await findSingleAuditTemporaryPath(disposalPrefix);
          detachedRoot = `${disposalRoot}.detached`;
          tempDirs.push(disposalRoot, detachedRoot);
          await fs.rename(disposalRoot, detachedRoot);
          await fs.mkdir(disposalRoot, { mode: 0o700 });
        }
      }
    )).rejects.toThrow("disposal retained");

    expect(await fs.readdir(disposalRoot)).toEqual([]);
    expect(await fs.readdir(detachedRoot)).toEqual([]);
    expect(await fs.readdir(quarantinePath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("reports a residual for wrong-object private disposal root removal", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    tempDirs.push(lock.lockPath);
    const quarantineId = "Cl0012";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const disposalPrefix = `${quarantinePath}.dispose-`;
    const disposalParent = path.dirname(disposalPrefix);
    const disposalNamePrefix = path.basename(disposalPrefix);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(quarantinePath));
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const originalRmdir = fs.rmdir.bind(fs);
    let detachedRoot = "";
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      const targetPath = String(target);
      const targetName = path.basename(targetPath);
      if (
        detachedRoot.length === 0
        && targetName.startsWith(disposalNamePrefix)
      ) {
        const logicalTargetPath = path.join(disposalParent, targetName);
        detachedRoot = `${logicalTargetPath}.detached`;
        tempDirs.push(detachedRoot);
        await fs.rename(logicalTargetPath, detachedRoot);
        await fs.mkdir(logicalTargetPath, { mode: 0o700 });
        await originalRmdir(targetPath);
        return;
      }
      await originalRmdir(target, options);
    });

    const cleanup = await cleanupJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint
    );

    expect(cleanup).toMatchObject({
      existed: true,
      removed: true,
      ownerFingerprint,
      residualDisposalPath: expect.stringContaining(disposalNamePrefix)
    });
    expect(await fs.readdir(detachedRoot)).toEqual([]);
    await expect(fs.access(cleanup.residualDisposalPath!)).rejects.toThrow();
    await lock.release();
  });

  it("preserves owner_only quarantine residue when the fingerprint does not match", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    tempDirs.push(lock.lockPath);
    const quarantineId = "Cl0002";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(quarantinePath));

    await expect(cleanupJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      "0".repeat(32)
    )).rejects.toThrow("owner fingerprint does not match");

    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    expect(await fs.readdir(quarantinePath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("refuses quarantine owner drift raced before owner isolation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    tempDirs.push(lock.lockPath);
    const quarantineId = "Cl0003";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const quarantineOwnerPath = getJsonlAuditLockOwnerPath(quarantinePath);
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, quarantineOwnerPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    await expect(cleanupJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint,
      {
        beforeOwnerIsolation: async () => {
          const persisted = JSON.parse(
            await fs.readFile(quarantineOwnerPath, "utf8")
          ) as { owner_token: string };
          persisted.owner_token = "00000000-0000-4000-8000-000000000000";
          await fs.writeFile(
            quarantineOwnerPath,
            `${JSON.stringify(persisted)}\n`,
            { encoding: "utf8" }
          );
        }
      }
    )).rejects.toThrow("Audit file lock changed before cleanup");

    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    await expect(inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    )).resolves.toMatchObject({
      layout: "owner_only",
      ownerToken: "00000000-0000-4000-8000-000000000000"
    });
    await lock.release();
  });

  it("refuses a quarantine directory replacement with copied owner metadata", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Cl0005";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const movedQuarantinePath = `${quarantinePath}.original`;
    tempDirs.push(lock.lockPath, quarantinePath, movedQuarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(quarantinePath));
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    await expect(cleanupJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint,
      {
        beforeOwnerIsolation: async () => {
          await fs.rename(quarantinePath, movedQuarantinePath);
          await fs.mkdir(quarantinePath, { mode: 0o700 });
          await fs.copyFile(
            getJsonlAuditLockOwnerPath(movedQuarantinePath),
            getJsonlAuditLockOwnerPath(quarantinePath)
          );
        }
      }
    )).rejects.toThrow("Audit file lock changed before cleanup");

    expect(await fs.readdir(quarantinePath)).toEqual(["owner.json"]);
    expect(await fs.readdir(movedQuarantinePath)).toEqual(["owner.json"]);
    await lock.release();
  });

  it("restores the owner when an extra entry appears after owner isolation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    tempDirs.push(lock.lockPath);
    const quarantineId = "Cl0004";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const quarantineOwnerPath = getJsonlAuditLockOwnerPath(quarantinePath);
    const extraPath = path.join(quarantinePath, "unexpected");
    tempDirs.push(quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(lock.ownerPath, quarantineOwnerPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    await expect(cleanupJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint,
      {
        afterOwnerIsolation: async () => {
          await fs.writeFile(extraPath, "preserved", { mode: 0o600 });
        }
      }
    )).rejects.toThrow("Audit file lock changed during cleanup");

    expect((await fs.stat(quarantinePath)).isDirectory()).toBe(true);
    expect(await fs.readFile(extraPath, "utf8")).toBe("preserved");
    expect((await fs.stat(quarantineOwnerPath)).isFile()).toBe(true);
    await expect(inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    )).resolves.toMatchObject({
      layout: "unknown",
      rootOwnerMetadataStatus: "valid"
    });
    await lock.release();
  });

  it("recovers a confirmed lock_with_owner quarantine as the coordination lock", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rc0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint
    )).resolves.toEqual({
      quarantineId,
      quarantinePath,
      lockPath: lock.lockPath,
      existed: true,
      recovered: true,
      layout: "lock_with_owner",
      ownerFingerprint,
      recoveryHandlesClosed: true
    });

    await expect(fs.access(quarantinePath)).rejects.toThrow();
    await expect(inspectJsonlAuditFileLock(filePath)).resolves.toMatchObject({
      exists: true,
      entryType: "directory",
      ownerMetadataStatus: "valid",
      ownerEntryExclusive: true,
      ownerToken: lock.ownerToken
    });
    await expect(lock.release()).rejects.toThrow(
      "Audit file lock changed before release"
    );
    const activeOwnerFingerprint = await requireActiveLockOwnerFingerprint(
      filePath
    );
    expect(activeOwnerFingerprint).not.toBe(ownerFingerprint);
    await expect(cleanupJsonlAuditFileLock(
      filePath,
      activeOwnerFingerprint
    )).resolves.toMatchObject({
      existed: true,
      removed: true
    });
  });

  it("rejects truncated nested quarantine state before owner transfer", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rc0013";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    const nestedOwnerPath = getJsonlAuditLockOwnerPath(nestedLockPath);
    const overflowPaths = [
      path.join(nestedLockPath, "overflow-secret-a"),
      path.join(nestedLockPath, "overflow-secret-b")
    ];
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const rename = vi.spyOn(fs, "rename");

    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint,
      {
        beforeLockReservation: async () => {
          await Promise.all(overflowPaths.map((overflowPath) => fs.writeFile(
            overflowPath,
            "preserved\n",
            { mode: 0o600 }
          )));
        }
      }
    )).rejects.toThrow("rollback could not be fully verified");

    expect(rename).not.toHaveBeenCalled();
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect((await fs.stat(nestedOwnerPath)).isFile()).toBe(true);
    for (const overflowPath of overflowPaths) {
      expect(await fs.readFile(overflowPath, "utf8")).toBe("preserved\n");
    }
  });

  it("uses descriptor-relative paths for successful quarantine recovery", async () => {
    const dir = await createTempDir();
    if (!await supportsJsonlAuditDescriptorRelativeMutation(dir)) {
      return;
    }
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rx0001";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const rmdir = vi.spyOn(fs, "rmdir");

    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint
    )).resolves.toMatchObject({
      existed: true,
      recovered: true,
      layout: "lock_with_owner",
      ownerFingerprint
    });

    const mkdirPaths = mkdir.mock.calls.map(([target]) => String(target));
    const renamePaths = rename.mock.calls.flatMap(
      ([source, destination]) => [String(source), String(destination)]
    );
    const rmdirPaths = rmdir.mock.calls.map(([target]) => String(target));
    expect(mkdirPaths).toHaveLength(1);
    expect(renamePaths).toHaveLength(2);
    expect(rmdirPaths).toHaveLength(2);
    expect([...mkdirPaths, ...renamePaths, ...rmdirPaths].every(
      (mutationPath) => mutationPath.startsWith("/proc/self/fd/")
    )).toBe(true);
    vi.restoreAllMocks();
    const activeOwnerFingerprint = await requireActiveLockOwnerFingerprint(
      filePath
    );
    expect(activeOwnerFingerprint).not.toBe(ownerFingerprint);
    await expect(cleanupJsonlAuditFileLock(
      filePath,
      activeOwnerFingerprint
    )).resolves.toMatchObject({
      existed: true,
      removed: true
    });
  });

  it("uses descriptor-relative paths while rolling back quarantine recovery", async () => {
    const dir = await createTempDir();
    if (!await supportsJsonlAuditDescriptorRelativeMutation(dir)) {
      return;
    }
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rx0002";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );
    const mkdir = vi.spyOn(fs, "mkdir");
    const rename = vi.spyOn(fs, "rename");
    const rmdir = vi.spyOn(fs, "rmdir");

    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint,
      {
        afterOwnerTransfer: () => {
          throw new Error("rollback probe");
        }
      }
    )).rejects.toThrow("rollback probe");

    const mkdirPaths = mkdir.mock.calls.map(([target]) => String(target));
    const renamePaths = rename.mock.calls.flatMap(
      ([source, destination]) => [String(source), String(destination)]
    );
    const rmdirPaths = rmdir.mock.calls.map(([target]) => String(target));
    expect(mkdirPaths).toHaveLength(1);
    expect(renamePaths).toHaveLength(4);
    expect(rmdirPaths).toHaveLength(1);
    expect([...mkdirPaths, ...renamePaths, ...rmdirPaths].every(
      (mutationPath) => mutationPath.startsWith("/proc/self/fd/")
    )).toBe(true);
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    await expect(inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    )).resolves.toMatchObject({
      layout: "lock_with_owner",
      ownerToken: lock.ownerToken
    });
  });

  it("recovers a confirmed lock_and_owner quarantine as the coordination lock", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rc0002";
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

    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint
    )).resolves.toEqual({
      quarantineId,
      quarantinePath,
      lockPath: lock.lockPath,
      existed: true,
      recovered: true,
      layout: "lock_and_owner",
      ownerFingerprint,
      recoveryHandlesClosed: true
    });

    await expect(fs.access(quarantinePath)).rejects.toThrow();
    await expect(inspectJsonlAuditFileLock(filePath)).resolves.toMatchObject({
      exists: true,
      ownerMetadataStatus: "valid",
      ownerEntryExclusive: true,
      ownerToken: lock.ownerToken
    });
    const activeOwnerFingerprint = await requireActiveLockOwnerFingerprint(
      filePath
    );
    expect(activeOwnerFingerprint).not.toBe(ownerFingerprint);
    await expect(cleanupJsonlAuditFileLock(
      filePath,
      activeOwnerFingerprint
    )).resolves.toMatchObject({
      existed: true,
      removed: true
    });
  });

  it("refuses quarantine recovery while the coordination lock path is occupied", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rc0003";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(nestedLockPath, { recursive: true, mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(nestedLockPath)
    );
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint
    )).rejects.toThrow("coordination lock entry already exists");

    await expect(inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    )).resolves.toMatchObject({
      layout: "lock_with_owner",
      ownerToken: lock.ownerToken
    });
    await expect(inspectJsonlAuditFileLock(filePath)).resolves.toMatchObject({
      exists: true,
      ownerToken: lock.ownerToken
    });
    await lock.release();
  });

  it("preserves quarantine recovery state when the owner fingerprint does not match", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rc0004";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);

    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      "0".repeat(32)
    )).rejects.toThrow("owner fingerprint does not match");

    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    await expect(inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    )).resolves.toMatchObject({
      layout: "lock_with_owner",
      ownerToken: lock.ownerToken
    });
  });

  it("does not replace a coordination entry raced before lock reservation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rc0005";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    const blockerPath = path.join(lock.lockPath, "unexpected");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint,
      {
        beforeLockReservation: async () => {
          await fs.mkdir(lock.lockPath, { mode: 0o700 });
          await fs.writeFile(blockerPath, "preserved", { mode: 0o600 });
        }
      }
    )).rejects.toThrow("coordination lock entry already exists");

    expect(await fs.readFile(blockerPath, "utf8")).toBe("preserved");
    await expect(inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    )).resolves.toMatchObject({
      layout: "lock_with_owner",
      ownerToken: lock.ownerToken
    });
  });

  it("restores quarantine ownership and preserves an unexpected recovered-lock entry", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rc0006";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    const extraPath = path.join(lock.lockPath, "unexpected");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint,
      {
        afterOwnerTransfer: async () => {
          await fs.writeFile(extraPath, "preserved", { mode: 0o600 });
        }
      }
    )).resolves.toEqual({
      quarantineId,
      quarantinePath,
      lockPath: lock.lockPath,
      existed: true,
      recovered: false,
      layout: "lock_with_owner",
      ownerFingerprint,
      residualLockPath: lock.lockPath,
      recoveryHandlesClosed: true
    });

    expect(await fs.readFile(extraPath, "utf8")).toBe("preserved");
    expect(await fs.readdir(lock.lockPath)).toEqual(["unexpected"]);
    await expect(inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    )).resolves.toMatchObject({
      layout: "lock_with_owner",
      ownerToken: lock.ownerToken
    });
  });

  it("refuses a quarantine root replacement with copied recovery state", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rc0007";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    const movedQuarantinePath = `${quarantinePath}.original`;
    tempDirs.push(lock.lockPath, quarantinePath, movedQuarantinePath);
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

    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint,
      {
        beforeLockReservation: async () => {
          await fs.rename(quarantinePath, movedQuarantinePath);
          await fs.mkdir(path.join(quarantinePath, "lock"), {
            recursive: true,
            mode: 0o700
          });
          await fs.copyFile(
            getJsonlAuditLockOwnerPath(movedQuarantinePath),
            getJsonlAuditLockOwnerPath(quarantinePath)
          );
        }
      }
    )).rejects.toThrow("Audit lock quarantine changed during recovery");

    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect(await fs.readdir(quarantinePath)).toEqual(["lock", "owner.json"]);
    expect(await fs.readdir(movedQuarantinePath)).toEqual([
      "lock",
      "owner.json"
    ]);
  });

  it("refuses a nested lock replacement with copied owner metadata", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rc0008";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    const movedNestedLockPath = path.join(quarantinePath, "lock.original");
    tempDirs.push(lock.lockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint,
      {
        beforeLockReservation: async () => {
          await fs.rename(nestedLockPath, movedNestedLockPath);
          await fs.mkdir(nestedLockPath, { mode: 0o700 });
          await fs.copyFile(
            getJsonlAuditLockOwnerPath(movedNestedLockPath),
            getJsonlAuditLockOwnerPath(nestedLockPath)
          );
        }
      }
    )).rejects.toThrow("Audit lock quarantine changed during recovery");

    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect(await fs.readdir(nestedLockPath)).toEqual(["owner.json"]);
    expect(await fs.readdir(movedNestedLockPath)).toEqual(["owner.json"]);
  });

  it("refuses a recovered-lock replacement with copied owner metadata", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rc0009";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    const movedLockPath = `${lock.lockPath}.original`;
    tempDirs.push(lock.lockPath, movedLockPath, quarantinePath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint,
      {
        afterOwnerTransfer: async () => {
          await fs.rename(lock.lockPath, movedLockPath);
          await fs.mkdir(lock.lockPath, { mode: 0o700 });
          await fs.copyFile(
            getJsonlAuditLockOwnerPath(movedLockPath),
            getJsonlAuditLockOwnerPath(lock.lockPath)
          );
        }
      }
    )).rejects.toThrow("rollback could not be fully verified");

    expect(await fs.readdir(lock.lockPath)).toEqual(["owner.json"]);
    expect(await fs.readdir(movedLockPath)).toEqual(["owner.json"]);
    expect(await fs.readdir(nestedLockPath)).toEqual([]);
  });

  it("refuses a copied-metadata recovery owner replacement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Rc0010";
    const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
    const nestedLockPath = path.join(quarantinePath, "lock");
    const nestedOwnerPath = getJsonlAuditLockOwnerPath(nestedLockPath);
    const movedOwnerPath = `${quarantinePath}.owner-original`;
    tempDirs.push(lock.lockPath, quarantinePath, movedOwnerPath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.rename(lock.lockPath, nestedLockPath);
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint,
      {
        beforeLockReservation: async () => {
          await fs.rename(nestedOwnerPath, movedOwnerPath);
          await fs.copyFile(movedOwnerPath, nestedOwnerPath);
        }
      }
    )).rejects.toThrow("Audit lock quarantine changed during recovery");

    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect(await fs.readFile(nestedOwnerPath, "utf8")).toBe(
      await fs.readFile(movedOwnerPath, "utf8")
    );
  });

  it("rejects a copied active candidate selected by a stale owner fingerprint", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const movedLockPath = `${lock.lockPath}.phase571-original`;
    tempDirs.push(lock.lockPath, movedLockPath);
    const ownerFingerprint = await requireActiveLockOwnerFingerprint(filePath);

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
    await expect(cleanupJsonlAuditFileLock(
      filePath,
      ownerFingerprint
    )).rejects.toThrow("owner fingerprint does not match");

    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(await fs.readFile(
      getJsonlAuditLockOwnerPath(lock.lockPath),
      "utf8"
    )).toBe(await fs.readFile(
      getJsonlAuditLockOwnerPath(movedLockPath),
      "utf8"
    ));
  });

  it("rejects a copied quarantine candidate selected by a stale owner fingerprint", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Vq0001";
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
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

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
    await expect(cleanupJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint
    )).rejects.toThrow("owner fingerprint does not match");

    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(await fs.readFile(
      getJsonlAuditLockOwnerPath(quarantinePath),
      "utf8"
    )).toBe(await fs.readFile(
      getJsonlAuditLockOwnerPath(movedQuarantinePath),
      "utf8"
    ));
  });

  it("rejects a copied disposal candidate selected by a stale owner fingerprint", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Vd0001";
    const disposalId = "Ve0001";
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
    const ownerFingerprint = await requireDisposalOwnerFingerprint(
      filePath,
      quarantineId,
      disposalId
    );

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
    await expect(cleanupJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      ownerFingerprint
    )).rejects.toThrow("owner fingerprint does not match");

    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    expect(await fs.readFile(
      getJsonlAuditLockOwnerPath(disposalPath),
      "utf8"
    )).toBe(await fs.readFile(
      getJsonlAuditLockOwnerPath(movedDisposalPath),
      "utf8"
    ));
  });

  it("rejects a copied recovery candidate selected by a stale owner fingerprint", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Vr0001";
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
    const ownerFingerprint = await requireQuarantineOwnerFingerprint(
      filePath,
      quarantineId
    );

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
    await expect(recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      ownerFingerprint
    )).rejects.toThrow("owner fingerprint does not match");

    expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
    await expect(fs.access(lock.lockPath)).rejects.toThrow();
    expect(await fs.readFile(
      getJsonlAuditLockOwnerPath(nestedLockPath),
      "utf8"
    )).toBe(await fs.readFile(
      getJsonlAuditLockOwnerPath(movedNestedLockPath),
      "utf8"
    ));
  });

  it("binds owner fingerprints to path, layout, domain, and list projection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const quarantineId = "Vf0001";
    const recoveryId = "Vf0002";
    const disposalQuarantineId = "Vf0003";
    const disposalId = "Vf0004";
    const quarantinePath = getJsonlAuditLockQuarantinePath(
      filePath,
      quarantineId
    );
    const recoveryPath = getJsonlAuditLockQuarantinePath(
      filePath,
      recoveryId
    );
    const recoveryLockPath = path.join(recoveryPath, "lock");
    const disposalPath = getJsonlAuditLockDisposalPath(
      filePath,
      disposalQuarantineId,
      disposalId
    );
    tempDirs.push(lock.lockPath, quarantinePath, recoveryPath, disposalPath);
    await fs.mkdir(quarantinePath, { mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(quarantinePath)
    );
    await fs.mkdir(recoveryLockPath, { recursive: true, mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(recoveryLockPath)
    );
    await fs.mkdir(disposalPath, { mode: 0o700 });
    await fs.copyFile(
      lock.ownerPath,
      getJsonlAuditLockOwnerPath(disposalPath)
    );

    const active = await inspectJsonlAuditFileLock(filePath);
    const quarantine = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );
    const recovery = await inspectJsonlAuditLockQuarantine(
      filePath,
      recoveryId
    );
    const disposal = await inspectJsonlAuditLockDisposal(
      filePath,
      disposalQuarantineId,
      disposalId
    );
    const fingerprints = [
      active.ownerFingerprint,
      quarantine.ownerFingerprint,
      recovery.ownerFingerprint,
      disposal.ownerFingerprint
    ];

    expect(fingerprints).toEqual(fingerprints.map(() =>
      expect.stringMatching(/^[0-9a-f]{32}$/)
    ));
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    expect([
      active.ownerToken,
      quarantine.ownerToken,
      recovery.ownerToken,
      disposal.ownerToken
    ]).toEqual([
      lock.ownerToken,
      lock.ownerToken,
      lock.ownerToken,
      lock.ownerToken
    ]);
    expect(quarantine.layout).toBe("owner_only");
    expect(recovery.layout).toBe("lock_with_owner");
    expect(disposal.layout).toBe("owner_only");

    const quarantineList = await inspectJsonlAuditLockQuarantines(filePath);
    const disposalList = await inspectJsonlAuditLockDisposals(filePath);
    expect(quarantineList.entries.find(
      (entry) => entry.quarantineId === quarantineId
    )?.ownerFingerprint).toBe(quarantine.ownerFingerprint);
    expect(quarantineList.entries.find(
      (entry) => entry.quarantineId === recoveryId
    )?.ownerFingerprint).toBe(recovery.ownerFingerprint);
    expect(disposalList.entries.find(
      (entry) => entry.disposalPath === disposalPath
    )?.ownerFingerprint).toBe(disposal.ownerFingerprint);
  });

  it("shares overflow-safe capacity decisions across runtime and diagnostics", () => {
    expect(evaluateJsonlAuditCapacity(0, 16, 16)).toMatchObject({
      remainingBytes: 16,
      recordFits: true,
      rotationRequired: false,
      overCapacity: false
    });
    expect(evaluateJsonlAuditCapacity(8, 8, 16)).toMatchObject({
      remainingBytes: 8,
      recordFits: true,
      rotationRequired: false,
      overCapacity: false
    });
    expect(evaluateJsonlAuditCapacity(8, 9, 16)).toMatchObject({
      remainingBytes: 8,
      recordFits: true,
      rotationRequired: true,
      overCapacity: false
    });
    expect(evaluateJsonlAuditCapacity(16, 1, 16)).toMatchObject({
      remainingBytes: 0,
      recordFits: true,
      rotationRequired: true,
      overCapacity: false
    });
    expect(evaluateJsonlAuditCapacity(17, 1, 16)).toMatchObject({
      remainingBytes: 0,
      recordFits: true,
      rotationRequired: true,
      overCapacity: true
    });
    expect(evaluateJsonlAuditCapacity(0, 17, 16)).toMatchObject({
      recordFits: false,
      rotationRequired: false
    });
    expect(evaluateJsonlAuditCapacity(
      Number.MAX_SAFE_INTEGER,
      1,
      Number.MAX_SAFE_INTEGER
    ).rotationRequired).toBe(true);
  });

  it("rejects invalid shared capacity decision inputs", () => {
    expect(() => evaluateJsonlAuditCapacity(-1, 1, 16)).toThrow(
      "Invalid JSONL audit current bytes"
    );
    expect(() => evaluateJsonlAuditCapacity(0, 0, 16)).toThrow(
      "Invalid JSONL audit next record bytes"
    );
    expect(() => evaluateJsonlAuditCapacity(0, 1, 0)).toThrow(
      "Invalid JSONL audit maxBytes"
    );
  });

  it("bootstraps nested audit parents through pinned descriptors", async () => {
    const dir = await createTempDir();
    if (!await supportsJsonlAuditDescriptorRelativeMutation(dir)) {
      return;
    }
    const firstParentPath = path.join(dir, "one");
    const secondParentPath = path.join(firstParentPath, "two");
    const filePath = path.join(secondParentPath, "audit.jsonl");
    const mkdir = vi.spyOn(fs, "mkdir");

    await new JsonlAuditSink(filePath).record(createRequestedAuditEvent(dir));

    const bootstrapCalls = mkdir.mock.calls.filter(([target]) => (
      path.basename(String(target)) === "one"
      || path.basename(String(target)) === "two"
    ));
    expect(bootstrapCalls).toHaveLength(2);
    expect(bootstrapCalls.every(([target]) => (
      String(target).startsWith("/proc/self/fd/")
    ))).toBe(true);
    expect(bootstrapCalls.every(([, options]) => (
      options !== undefined
      && "mode" in options
      && options.mode === 0o700
      && (!("recursive" in options) || options.recursive !== true)
    ))).toBe(true);
    expect((await fs.stat(firstParentPath)).isDirectory()).toBe(true);
    expect((await fs.stat(secondParentPath)).isDirectory()).toBe(true);
    expect(JSON.parse((await fs.readFile(filePath, "utf8")).trim())).toMatchObject({
      event: { type: "tool_requested" }
    });
  });

  it("falls back to validated logical paths for parent bootstrap", async () => {
    if (process.platform !== "linux") {
      return;
    }
    const dir = await createTempDir();
    const firstParentPath = path.join(dir, "one");
    const secondParentPath = path.join(firstParentPath, "two");
    const filePath = path.join(secondParentPath, "audit.jsonl");
    const originalStat = fs.stat.bind(fs);
    vi.spyOn(fs, "stat").mockImplementation(async (target, options) => {
      if (String(target).startsWith("/proc/self/fd/")) {
        const error = new Error("procfd unavailable") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      return originalStat(target, options);
    });
    const mkdir = vi.spyOn(fs, "mkdir");

    await new JsonlAuditSink(filePath).record(createRequestedAuditEvent(dir));

    const bootstrapTargets = mkdir.mock.calls
      .map(([target]) => String(target))
      .filter((target) => (
        path.basename(target) === "one" || path.basename(target) === "two"
      ));
    expect(bootstrapTargets).toEqual([firstParentPath, secondParentPath]);
    expect((await fs.stat(filePath)).isFile()).toBe(true);
  });

  it("continues parent bootstrap after a concurrent EEXIST directory", async () => {
    const dir = await createTempDir();
    const firstParentPath = path.join(dir, "one");
    const secondParentPath = path.join(firstParentPath, "two");
    const filePath = path.join(secondParentPath, "audit.jsonl");
    const originalMkdir = fs.mkdir.bind(fs);
    let raced = false;
    vi.spyOn(fs, "mkdir").mockImplementation(async (target, options) => {
      if (!raced && path.basename(String(target)) === "one") {
        raced = true;
        await originalMkdir(firstParentPath, { mode: 0o700 });
      }
      return originalMkdir(target, options);
    });

    await new JsonlAuditSink(filePath).record(createRequestedAuditEvent(dir));

    expect(raced).toBe(true);
    expect((await fs.stat(firstParentPath)).isDirectory()).toBe(true);
    expect((await fs.stat(secondParentPath)).isDirectory()).toBe(true);
    expect((await fs.stat(filePath)).isFile()).toBe(true);
  });

  it("rejects non-directory EEXIST parent bootstrap blockers", async () => {
    for (const blocker of ["file", "symlink"] as const) {
      const dir = await createTempDir();
      const firstParentPath = path.join(dir, "one");
      const secondParentPath = path.join(firstParentPath, "two");
      const filePath = path.join(secondParentPath, "audit.jsonl");
      const originalMkdir = fs.mkdir.bind(fs);
      let raced = false;
      vi.spyOn(fs, "mkdir").mockImplementation(async (target, options) => {
        if (!raced && path.basename(String(target)) === "one") {
          raced = true;
          if (blocker === "file") {
            await fs.writeFile(firstParentPath, "blocker", { mode: 0o600 });
          } else {
            const victimPath = path.join(dir, "victim");
            await originalMkdir(victimPath, { mode: 0o700 });
            await fs.symlink(victimPath, firstParentPath, "dir");
          }
        }
        return originalMkdir(target, options);
      });

      await expect(new JsonlAuditSink(filePath).record(
        createRequestedAuditEvent(dir)
      )).rejects.toThrow("Audit parent directory changed during bootstrap");

      expect(raced).toBe(true);
      const blockerStatus = await fs.lstat(firstParentPath);
      expect(blocker === "file"
        ? blockerStatus.isFile()
        : blockerStatus.isSymbolicLink()).toBe(true);
      await expect(fs.access(secondParentPath)).rejects.toThrow();
      await expect(fs.access(filePath)).rejects.toThrow();
      vi.restoreAllMocks();
    }
  });

  it("keeps first bootstrap child out of a replacement nearest parent", async () => {
    const dir = await createTempDir();
    const parentPath = path.join(dir, "parent");
    const movedParentPath = path.join(dir, "parent.original");
    const childPath = path.join(parentPath, "one");
    const filePath = path.join(childPath, "audit.jsonl");
    await fs.mkdir(parentPath, { mode: 0o700 });
    if (!await supportsJsonlAuditDescriptorRelativeMutation(parentPath)) {
      return;
    }
    const originalMkdir = fs.mkdir.bind(fs);
    let replaced = false;
    vi.spyOn(fs, "mkdir").mockImplementation(async (target, options) => {
      if (
        !replaced
        && String(target).startsWith("/proc/self/fd/")
        && path.basename(String(target)) === "one"
      ) {
        replaced = true;
        await fs.rename(parentPath, movedParentPath);
        await originalMkdir(parentPath, { mode: 0o700 });
      }
      return originalMkdir(target, options);
    });

    await expect(new JsonlAuditSink(filePath).record(
      createRequestedAuditEvent(dir)
    )).rejects.toThrow("Audit parent directory changed during bootstrap");

    expect(replaced).toBe(true);
    expect(await fs.readdir(parentPath)).toEqual([]);
    expect((await fs.stat(path.join(movedParentPath, "one"))).isDirectory()).toBe(
      true
    );
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it("keeps later bootstrap child out of a replacement intermediate parent", async () => {
    const dir = await createTempDir();
    if (!await supportsJsonlAuditDescriptorRelativeMutation(dir)) {
      return;
    }
    const firstParentPath = path.join(dir, "one");
    const movedFirstParentPath = path.join(dir, "one.original");
    const secondParentPath = path.join(firstParentPath, "two");
    const filePath = path.join(secondParentPath, "audit.jsonl");
    const originalMkdir = fs.mkdir.bind(fs);
    let replaced = false;
    vi.spyOn(fs, "mkdir").mockImplementation(async (target, options) => {
      if (
        !replaced
        && String(target).startsWith("/proc/self/fd/")
        && path.basename(String(target)) === "two"
      ) {
        replaced = true;
        await fs.rename(firstParentPath, movedFirstParentPath);
        await originalMkdir(firstParentPath, { mode: 0o700 });
      }
      return originalMkdir(target, options);
    });

    await expect(new JsonlAuditSink(filePath).record(
      createRequestedAuditEvent(dir)
    )).rejects.toThrow("Audit parent directory changed during bootstrap");

    expect(replaced).toBe(true);
    expect(await fs.readdir(firstParentPath)).toEqual([]);
    expect((await fs.stat(path.join(movedFirstParentPath, "two"))).isDirectory()).toBe(
      true
    );
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it("shares current-generation metadata and target safety inspection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await fs.writeFile(filePath, "1234", { mode: 0o600 });

    const status = await fs.stat(filePath);
    const parentStatus = await fs.stat(dir);
    const inspection = await inspectJsonlAuditPath(filePath);
    expect(inspection).toMatchObject({
      filePath,
      targetExists: true,
      targetSizeBytes: 4,
      targetIdentity: { device: status.dev, inode: status.ino },
      nearestExistingDirectoryIdentity: {
        device: parentStatus.dev,
        inode: parentStatus.ino
      },
      missingComponents: []
    });
    expect(jsonlAuditFileIdentityMatches(
      inspection.targetIdentity!,
      { device: status.dev, inode: status.ino }
    )).toBe(true);
    expect(jsonlAuditFileIdentityMatches(
      inspection.targetIdentity!,
      { device: status.dev, inode: status.ino + 1 }
    )).toBe(false);

    const linkedPath = path.join(dir, "linked.jsonl");
    await fs.link(filePath, linkedPath);
    await expect(inspectJsonlAuditPath(filePath)).rejects.toThrow(
      "Audit file must be a regular non-linked file"
    );
  });

  it("rejects current-generation replacement between path and descriptor inspection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const originalPath = path.join(dir, "original.jsonl");
    const now = () => new Date("2026-07-21T12:00:00.000Z");
    const firstEvent = {
      type: "tool_finished" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: {}
      },
      result: { ok: true as const, output: { marker: "first" } }
    };
    await new JsonlAuditSink(filePath, now).record(firstEvent);
    const firstBytes = (await fs.stat(filePath)).size;
    const originalOpen = fs.open.bind(fs);
    let replaced = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      if (!replaced && isJsonlAuditEntryTarget(target, filePath)) {
        replaced = true;
        await fs.rename(filePath, originalPath);
        await fs.copyFile(originalPath, filePath);
      }
      return originalOpen(target, flags, mode);
    });

    await expect(new JsonlAuditSink(filePath, now, firstBytes).record({
      ...firstEvent,
      request: { ...firstEvent.request, tool_call_id: "read-2" },
      result: { ok: true, output: { marker: "other" } }
    })).rejects.toThrow("Audit file changed during rotation preparation");

    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
    expect(await fs.readFile(filePath, "utf8")).toBe(await fs.readFile(originalPath, "utf8"));
  });

  it("rejects current-generation replacement before the final append", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const originalPath = path.join(dir, "original.jsonl");
    const now = () => new Date("2026-07-21T12:00:00.000Z");
    const firstEvent = {
      type: "tool_finished" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: {}
      },
      result: { ok: true as const, output: { marker: "first" } }
    };
    const sink = new JsonlAuditSink(filePath, now);
    await sink.record(firstEvent);
    const originalOpen = fs.open.bind(fs);
    let targetOpenCount = 0;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      if (isJsonlAuditEntryTarget(target, filePath)) {
        targetOpenCount += 1;
        if (targetOpenCount === 2) {
          await fs.rename(filePath, originalPath);
          await fs.copyFile(originalPath, filePath);
        }
      }
      return originalOpen(target, flags, mode);
    });

    await expect(sink.record({
      ...firstEvent,
      request: { ...firstEvent.request, tool_call_id: "read-2" },
      result: { ok: true, output: { marker: "other" } }
    })).rejects.toThrow("Audit file changed before append");

    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
    expect(await fs.readFile(filePath, "utf8")).toBe(await fs.readFile(originalPath, "utf8"));
  });

  it("rejects current-generation disappearance before the final append", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const originalPath = path.join(dir, "original.jsonl");
    const sink = new JsonlAuditSink(filePath);
    const event = {
      type: "tool_requested" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: {}
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    };
    await sink.record(event);
    const originalOpen = fs.open.bind(fs);
    let targetOpenCount = 0;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      if (isJsonlAuditEntryTarget(target, filePath)) {
        targetOpenCount += 1;
        if (targetOpenCount === 2) {
          await fs.rename(filePath, originalPath);
        }
      }
      return originalOpen(target, flags, mode);
    });

    await expect(sink.record({
      ...event,
      request: { ...event.request, tool_call_id: "read-2" }
    })).rejects.toThrow("Audit file disappeared before append");

    await expect(fs.access(filePath)).rejects.toThrow();
    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
    expect((await fs.readFile(originalPath, "utf8")).trim().length).toBeGreaterThan(0);
  });

  it("rejects a file that appears before exclusive current-generation creation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const intruderPath = path.join(dir, "intruder.jsonl");
    await fs.writeFile(intruderPath, "unchanged", { mode: 0o600 });
    const originalOpen = fs.open.bind(fs);
    let appeared = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      if (!appeared && isJsonlAuditEntryTarget(target, filePath)) {
        appeared = true;
        await fs.rename(intruderPath, filePath);
      }
      return originalOpen(target, flags, mode);
    });

    await expect(new JsonlAuditSink(filePath).record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: {}
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    })).rejects.toThrow("Audit file appeared before append");

    expect(await fs.readFile(filePath, "utf8")).toBe("unchanged");
  });

  it("rejects existing current replacement after the final descriptor opens", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const movedPath = path.join(dir, "moved.jsonl");
    const sink = new JsonlAuditSink(filePath);
    const event = {
      type: "tool_requested" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: {}
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    };
    await sink.record(event);
    const originalContent = await fs.readFile(filePath, "utf8");
    const originalOpen = fs.open.bind(fs);
    const originalLstat = fs.lstat.bind(fs);
    let appendOpened = false;
    let replaced = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (
        isJsonlAuditEntryTarget(target, filePath)
        && typeof flags === "number"
        && (flags & fsConstants.O_APPEND) !== 0
      ) {
        appendOpened = true;
      }
      return handle;
    });
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (!replaced && appendOpened && target === filePath) {
        replaced = true;
        await fs.rename(filePath, movedPath);
        await fs.writeFile(filePath, "replacement\n", { mode: 0o600 });
      }
      return originalLstat(target, options);
    });

    await expect(sink.record({
      ...event,
      request: { ...event.request, tool_call_id: "read-2" }
    })).rejects.toThrow("Audit file changed before record write");

    expect(replaced).toBe(true);
    expect(await fs.readFile(movedPath, "utf8")).toBe(originalContent);
    expect(await fs.readFile(filePath, "utf8")).toBe("replacement\n");
  });

  it("rejects exclusive-created current replacement before the first record write", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const movedPath = path.join(dir, "moved.jsonl");
    const originalOpen = fs.open.bind(fs);
    const originalLstat = fs.lstat.bind(fs);
    let appendOpened = false;
    let replaced = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (
        isJsonlAuditEntryTarget(target, filePath)
        && typeof flags === "number"
        && (flags & fsConstants.O_APPEND) !== 0
      ) {
        appendOpened = true;
      }
      return handle;
    });
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (!replaced && appendOpened && target === filePath) {
        replaced = true;
        await fs.rename(filePath, movedPath);
        await fs.writeFile(filePath, "replacement\n", { mode: 0o600 });
      }
      return originalLstat(target, options);
    });

    await expect(new JsonlAuditSink(filePath).record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: {}
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    })).rejects.toThrow("Audit file changed before record write");

    expect(replaced).toBe(true);
    expect((await fs.stat(movedPath)).size).toBe(0);
    expect(await fs.readFile(filePath, "utf8")).toBe("replacement\n");
  });

  it("reports existing current replacement after the record write", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const movedPath = path.join(dir, "moved.jsonl");
    const now = () => new Date("2026-07-22T10:00:00.000Z");
    const firstEvent = {
      type: "tool_finished" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: {}
      },
      result: { ok: true as const, output: { marker: "first" } }
    };
    const sink = new JsonlAuditSink(filePath, now);
    await sink.record(firstEvent);
    const originalOpen = fs.open.bind(fs);
    const originalLstat = fs.lstat.bind(fs);
    let appendOpened = false;
    let finalPathInspections = 0;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (
        isJsonlAuditEntryTarget(target, filePath)
        && typeof flags === "number"
        && (flags & fsConstants.O_APPEND) !== 0
      ) {
        appendOpened = true;
      }
      return handle;
    });
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (appendOpened && target === filePath) {
        finalPathInspections += 1;
        if (finalPathInspections === 2) {
          await fs.rename(filePath, movedPath);
          await fs.writeFile(filePath, "replacement\n", { mode: 0o600 });
        }
      }
      return originalLstat(target, options);
    });

    await expect(sink.record({
      ...firstEvent,
      request: { ...firstEvent.request, tool_call_id: "read-2" },
      result: { ok: true, output: { marker: "written-before-drift" } }
    })).rejects.toThrow("Audit file changed after record write");

    expect(finalPathInspections).toBe(2);
    expect(await fs.readFile(movedPath, "utf8")).toContain(
      '"marker":"written-before-drift"'
    );
    expect(await fs.readFile(filePath, "utf8")).toBe("replacement\n");
  });

  it("reports exclusive-created current replacement after every durability policy writes", async () => {
    for (const durability of ["buffered", "data", "full"] as const) {
      const dir = await createTempDir();
      const filePath = path.join(dir, "audit.jsonl");
      const movedPath = path.join(dir, "moved.jsonl");
      const originalOpen = fs.open.bind(fs);
      const originalLstat = fs.lstat.bind(fs);
      let appendOpened = false;
      let finalPathInspections = 0;
      vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
        const handle = await originalOpen(target, flags, mode);
        if (
          isJsonlAuditEntryTarget(target, filePath)
          && typeof flags === "number"
          && (flags & fsConstants.O_APPEND) !== 0
        ) {
          appendOpened = true;
        }
        return handle;
      });
      vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
        if (appendOpened && target === filePath) {
          finalPathInspections += 1;
          if (finalPathInspections === 2) {
            await fs.rename(filePath, movedPath);
            await fs.writeFile(filePath, "replacement\n", { mode: 0o600 });
          }
        }
        return originalLstat(target, options);
      });

      await expect(new JsonlAuditSink(
        filePath,
        () => new Date("2026-07-22T10:00:00.000Z"),
        10 * 1024 * 1024,
        [],
        durability
      ).record({
        type: "tool_requested",
        request: {
          session_id: "session-1",
          turn_id: "turn-1",
          tool_call_id: `read-${durability}`,
          tool_name: "Read",
          input: {}
        },
        context: {
          cwd: dir,
          sessionId: "session-1",
          turnId: "turn-1",
          toolCallId: `read-${durability}`
        }
      })).rejects.toThrow("Audit file changed after record write");

      expect(finalPathInspections).toBe(2);
      expect(await fs.readFile(movedPath, "utf8")).toContain(
        `"tool_call_id":"read-${durability}"`
      );
      expect(await fs.readFile(filePath, "utf8")).toBe("replacement\n");
      vi.restoreAllMocks();
    }
  });

  it("rolls back a bounded partial append and remains usable", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const sink = new JsonlAuditSink(filePath);
    await sink.record(createRequestedAuditEvent(dir, "read-1"));
    const baseline = await fs.readFile(filePath, "utf8");
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && isJsonlAuditAppendOpen(target, flags, filePath)) {
        injected = true;
        vi.spyOn(handle, "writeFile").mockImplementation(async () => {
          await handle.write(Buffer.from('{"partial":'));
          throw new Error("injected audit append failure");
        });
      }
      return handle;
    });

    await expect(sink.record(
      createRequestedAuditEvent(dir, "read-2")
    )).rejects.toThrow("injected audit append failure");

    expect(injected).toBe(true);
    expect(await fs.readFile(filePath, "utf8")).toBe(baseline);
    vi.restoreAllMocks();

    await sink.record(createRequestedAuditEvent(dir, "read-3"));
    const records = (await fs.readFile(filePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records.map((record) => record.event.request.tool_call_id)).toEqual([
      "read-1",
      "read-3"
    ]);
  });

  it("removes a failed first append generation and remains usable", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const descriptorRelative = await supportsJsonlAuditDescriptorRelativeMutation(dir);
    const originalOpen = fs.open.bind(fs);
    const originalUnlink = fs.unlink.bind(fs);
    const currentUnlinkTargets: string[] = [];
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && isJsonlAuditAppendOpen(target, flags, filePath)) {
        injected = true;
        vi.spyOn(handle, "writeFile").mockImplementation(async () => {
          await handle.write(Buffer.from('{"partial":'));
          throw new Error("injected first audit append failure");
        });
      }
      return handle;
    });
    vi.spyOn(fs, "unlink").mockImplementation(async (target) => {
      if (isJsonlAuditEntryTarget(target, filePath)) {
        currentUnlinkTargets.push(String(target));
      }
      await originalUnlink(target);
    });

    await expect(new JsonlAuditSink(filePath).record(
      createRequestedAuditEvent(dir, "read-1")
    )).rejects.toThrow("injected first audit append failure");

    expect(injected).toBe(true);
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(currentUnlinkTargets).toHaveLength(1);
    if (descriptorRelative) {
      expect(currentUnlinkTargets[0]).toMatch(/^\/proc\/self\/fd\/\d+\/audit\.jsonl$/u);
    } else {
      expect(currentUnlinkTargets).toEqual([filePath]);
    }
    vi.restoreAllMocks();

    await new JsonlAuditSink(filePath).record(
      createRequestedAuditEvent(dir, "read-2")
    );
    const content = (await fs.readFile(filePath, "utf8")).trim();
    expect(JSON.parse(content).event.request.tool_call_id).toBe("read-2");
  });

  it("removes zero-growth failed exclusive generations with configured cleanup durability", async () => {
    for (const durability of ["buffered", "data", "full"] as const) {
      const dir = await createTempDir();
      const filePath = path.join(dir, "audit.jsonl");
      const originalOpen = fs.open.bind(fs);
      const syncedPaths: string[] = [];
      let injected = false;
      vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
        const handle = await originalOpen(target, flags, mode);
        vi.spyOn(handle, "sync").mockImplementation(async () => {
          syncedPaths.push(String(target));
        });
        if (!injected && isJsonlAuditAppendOpen(target, flags, filePath)) {
          injected = true;
          vi.spyOn(handle, "writeFile").mockRejectedValue(
            new Error(`injected ${durability} zero-growth append failure`)
          );
        }
        return handle;
      });

      await expect(new JsonlAuditSink(
        filePath,
        () => new Date("2026-07-22T12:00:00.000Z"),
        10 * 1024 * 1024,
        [],
        durability
      ).record(createRequestedAuditEvent(dir, `read-${durability}`)))
        .rejects.toThrow(`injected ${durability} zero-growth append failure`);

      expect(injected).toBe(true);
      await expect(fs.stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(syncedPaths).toEqual(
        durability === "full" && process.platform !== "win32" ? [dir] : []
      );
      vi.restoreAllMocks();
    }
  });

  it("removes an exclusive-created generation after a stable pre-write failure", async () => {
    if (process.platform === "win32") {
      return;
    }
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && isJsonlAuditAppendOpen(target, flags, filePath)) {
        injected = true;
        vi.spyOn(handle, "chmod").mockRejectedValue(
          new Error("injected audit mode convergence failure")
        );
      }
      return handle;
    });

    await expect(new JsonlAuditSink(filePath).record(
      createRequestedAuditEvent(dir, "read-1")
    )).rejects.toThrow("injected audit mode convergence failure");

    expect(injected).toBe(true);
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves a moved exclusive-created generation after a failed append", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const movedPath = path.join(dir, "audit.original.jsonl");
    const partial = Buffer.from('{"partial":');
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && isJsonlAuditAppendOpen(target, flags, filePath)) {
        injected = true;
        vi.spyOn(handle, "writeFile").mockImplementation(async () => {
          await handle.write(partial);
          await fs.rename(filePath, movedPath);
          await fs.writeFile(filePath, "replacement\n", { mode: 0o600 });
          throw new Error("injected moved exclusive append failure");
        });
      }
      return handle;
    });

    await expect(new JsonlAuditSink(filePath).record(
      createRequestedAuditEvent(dir, "read-1")
    )).rejects.toThrow("injected moved exclusive append failure");

    expect(injected).toBe(true);
    expect(await fs.readFile(filePath, "utf8")).toBe("replacement\n");
    expect(await fs.readFile(movedPath)).toEqual(partial);
  });

  it("preserves unknown growth in a failed exclusive-created generation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const unknownGrowth = Buffer.alloc(4_096, 0x78);
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && isJsonlAuditAppendOpen(target, flags, filePath)) {
        injected = true;
        vi.spyOn(handle, "writeFile").mockImplementation(async () => {
          await handle.write(unknownGrowth);
          throw new Error("injected exclusive beyond-bound append failure");
        });
      }
      return handle;
    });

    await expect(new JsonlAuditSink(filePath).record(
      createRequestedAuditEvent(dir, "read-1")
    )).rejects.toThrow("injected exclusive beyond-bound append failure");

    expect(injected).toBe(true);
    expect(await fs.readFile(filePath)).toEqual(unknownGrowth);
  });

  it("derives target-bound rotation staging namespaces for same-parent audit files", async () => {
    const dir = await createTempDir();
    const firstPath = path.join(dir, "first.jsonl");
    const secondPath = path.join(dir, "second.jsonl");
    const firstPrefix = getJsonlAuditRotationStagingPrefix(firstPath);
    const secondPrefix = getJsonlAuditRotationStagingPrefix(secondPath);

    expect(firstPrefix).not.toBe(secondPrefix);
    expect(path.dirname(firstPrefix)).toBe(dir);
    expect(path.basename(firstPrefix)).toMatch(
      /^\.god-code-audit-rotation-[0-9a-f]{32}-$/u
    );
    expect(getJsonlAuditRotationStagingPath(firstPath, "Ab12Z9"))
      .toBe(`${firstPrefix}Ab12Z9`);
    expect(() => getJsonlAuditRotationStagingPath(firstPath, "bad"))
      .toThrow("expected six ASCII alphanumeric characters");
  });

  it("lists only target-bound rotation staging residue and counts legacy entries", async () => {
    const dir = await createTempDir();
    const firstPath = path.join(dir, "first.jsonl");
    const secondPath = path.join(dir, "second.jsonl");
    const firstStagingPath = getJsonlAuditRotationStagingPath(
      firstPath,
      "First1"
    );
    const secondStagingPath = getJsonlAuditRotationStagingPath(
      secondPath,
      "Other2"
    );
    const legacyPath = path.join(dir, ".god-code-audit-rotation-Legacy");
    await fs.mkdir(firstStagingPath, { mode: 0o700 });
    await fs.writeFile(
      path.join(firstStagingPath, "previous"),
      "first-previous",
      { mode: 0o600 }
    );
    await fs.mkdir(secondStagingPath, { mode: 0o700 });
    await fs.mkdir(legacyPath, { mode: 0o700 });
    const before = (await fs.readdir(dir)).sort();
    const observedAt = Date.parse("2026-07-22T12:00:00.000Z");

    const inspection = await inspectJsonlAuditRotationStagings(
      firstPath,
      () => observedAt
    );

    expect(inspection).toMatchObject({
      filePath: firstPath,
      stagingPrefix: getJsonlAuditRotationStagingPrefix(firstPath),
      matchedEntryCount: 1,
      resultTruncated: false,
      legacyUnscopedEntryCount: 1,
      entries: [{
        stagingId: "First1",
        stagingPath: firstStagingPath,
        exists: true,
        entryType: "directory",
        layout: "previous_only",
        entryCount: 1,
        previousEntryType: "regular_file",
        previousSizeBytes: Buffer.byteLength("first-previous")
      }]
    });
    expect(JSON.stringify(inspection)).not.toContain("Other2");
    expect(JSON.stringify(inspection)).not.toContain(secondStagingPath);
    expect(await fs.readdir(dir).then((entries) => entries.sort())).toEqual(before);
    expect(await fs.readFile(
      path.join(firstStagingPath, "previous"),
      "utf8"
    )).toBe("first-previous");
  });

  it("projects rotation staging layouts without following symlinks", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const emptyPath = getJsonlAuditRotationStagingPath(filePath, "Empty1");
    const previousPath = getJsonlAuditRotationStagingPath(filePath, "Prev01");
    const unknownPath = getJsonlAuditRotationStagingPath(filePath, "Unkn01");
    const fileEntryPath = getJsonlAuditRotationStagingPath(filePath, "File01");
    const victimPath = path.join(dir, "victim.txt");
    await fs.mkdir(emptyPath, { mode: 0o700 });
    await fs.mkdir(previousPath, { mode: 0o700 });
    await fs.mkdir(unknownPath, { mode: 0o700 });
    await fs.writeFile(path.join(unknownPath, "extra"), "unknown");
    await fs.writeFile(fileEntryPath, "not-a-directory");
    await fs.writeFile(victimPath, "victim-content");
    if (process.platform === "win32") {
      await fs.writeFile(path.join(previousPath, "previous"), "archive");
    } else {
      await fs.symlink(victimPath, path.join(previousPath, "previous"));
      const linkedRootPath = getJsonlAuditRotationStagingPath(filePath, "Link01");
      await fs.symlink(emptyPath, linkedRootPath);
    }

    const inspection = await inspectJsonlAuditRotationStagings(filePath);
    const entries = new Map(inspection.entries.map(
      (entry) => [entry.stagingId, entry]
    ));

    expect(entries.get("Empty1")).toMatchObject({
      entryType: "directory",
      layout: "empty",
      entryCount: 0
    });
    expect(entries.get("Prev01")).toMatchObject({
      entryType: "directory",
      layout: "previous_only",
      entryCount: 1,
      previousEntryType: process.platform === "win32"
        ? "regular_file"
        : "symbolic_link"
    });
    expect(entries.get("Unkn01")).toMatchObject({
      entryType: "directory",
      layout: "unknown",
      entryCount: 1
    });
    expect(entries.get("File01")).toMatchObject({
      entryType: "regular_file",
      exists: true
    });
    expect(entries.get("File01")?.layout).toBeUndefined();
    if (process.platform !== "win32") {
      expect(entries.get("Link01")).toMatchObject({
        entryType: "symbolic_link",
        exists: true
      });
      expect(entries.get("Link01")?.layout).toBeUndefined();
    }
    expect(await fs.readFile(victimPath, "utf8")).toBe("victim-content");
  });

  it("bounds selected rotation staging child scans", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Bnd001",
      "previous-archive\n"
    );
    const overflowNames = ["overflow-secret-a", "overflow-secret-b"];
    await Promise.all(overflowNames.map((name) => fs.writeFile(
      path.join(stagingPath, name),
      "overflow\n",
      { mode: 0o600 }
    )));
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const originalOpendir = fs.opendir.bind(fs);
    let opendirCalls = 0;
    let readCalls = 0;
    vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
      const directory = await originalOpendir(target, options);
      opendirCalls += 1;
      const read = directory.read.bind(directory);
      vi.spyOn(directory, "read").mockImplementation(async () => {
        readCalls += 1;
        return read();
      });
      return directory;
    });
    const readdir = vi.spyOn(fs, "readdir");

    const inspection = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Bnd001"
    );

    expect(opendirCalls).toBe(2);
    expect(readCalls).toBe(
      2 * (MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES + 1)
    );
    expect(readdir).not.toHaveBeenCalled();
    expect(inspection).toMatchObject({
      assessment: "invalid_staging_state",
      eligible: false,
      staging: {
        stagingId: "Bnd001",
        stagingPath,
        exists: true,
        entryType: "directory",
        layout: "unknown",
        entryScanCount:
          MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES,
        entryScanLimit:
          MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES,
        entryScanTruncated: true
      }
    });
    expect(inspection.staging.entryCount).toBeUndefined();
    expect(inspection.recommendedAction).toBeUndefined();
    expect(inspection.recoveryFingerprint).toBeUndefined();
    const serialized = JSON.stringify(inspection);
    for (const overflowName of overflowNames) {
      expect(serialized).not.toContain(overflowName);
    }
  });

  it("bounds overflow revalidation before recovery mutation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Bnd002",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Bnd002"
    );
    const originalOpendir = fs.opendir.bind(fs);
    let injectionEnabled = false;
    let postHookOpendirCalls = 0;
    let injected = false;
    vi.spyOn(fs, "opendir").mockImplementation(async (target, options) => {
      let resolvedTarget = path.resolve(String(target));
      try {
        resolvedTarget = await fs.realpath(target);
      } catch {
        // Preserve the original open behavior for disappearing test paths.
      }
      if (
        injectionEnabled
        && resolvedTarget === path.resolve(stagingPath)
      ) {
        postHookOpendirCalls += 1;
        if (postHookOpendirCalls === 3) {
          injected = true;
          await fs.writeFile(
            path.join(stagingPath, "overflow-secret-a"),
            "overflow-a\n",
            { mode: 0o600 }
          );
          await fs.writeFile(
            path.join(stagingPath, "overflow-secret-b"),
            "overflow-b\n",
            { mode: 0o600 }
          );
        }
      }
      return originalOpendir(target, options);
    });
    const rename = vi.spyOn(fs, "rename");

    const failure = await recoverJsonlAuditRotationStaging(
      filePath,
      "Bnd002",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        beforeMutation: () => {
          injectionEnabled = true;
        }
      }
    ).catch((error: unknown) => error);

    expect(injected).toBe(true);
    expect(rename).not.toHaveBeenCalled();
    expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
    expect(failure).toMatchObject({
      message: "Audit rotation staging changed before recovery mutation.",
      details: {
        stage: "candidate_open",
        mutationState: "not_started",
        rollbackAttempted: false,
        recoveryFingerprint: readiness.recoveryFingerprint,
        recoveryHandlesClosed: true,
        coordinationLockAcquired: true,
        coordinationLockReleased: true,
        postFailureObservationCompleted: true,
        postFailureObservation: {
          observedWhileCoordinationLockHeld: true,
          assessment: "invalid_staging_state",
          eligible: false,
          staging: {
            stagingId: "Bnd002",
            stagingPath,
            layout: "unknown",
            entryScanCount:
              MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES,
            entryScanLimit:
              MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES,
            entryScanTruncated: true
          }
        }
      }
    });
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
  });

  it("bounds rotation staging result materialization", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const entryCount = MAX_JSONL_AUDIT_ROTATION_STAGING_RESULTS + 1;
    await Promise.all(Array.from({ length: entryCount }, async (_, index) => {
      const stagingId = index.toString(36).padStart(6, "0");
      await fs.mkdir(getJsonlAuditRotationStagingPath(filePath, stagingId));
    }));

    const inspection = await inspectJsonlAuditRotationStagings(filePath);

    expect(inspection.matchedEntryCount).toBe(entryCount);
    expect(inspection.resultLimit).toBe(MAX_JSONL_AUDIT_ROTATION_STAGING_RESULTS);
    expect(inspection.resultTruncated).toBe(true);
    expect(inspection.entries).toHaveLength(
      MAX_JSONL_AUDIT_ROTATION_STAGING_RESULTS
    );
  });

  it("bounds rotation staging parent scans", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const entryCount = MAX_JSONL_AUDIT_ROTATION_STAGING_SCAN_ENTRIES + 1;
    for (let offset = 0; offset < entryCount; offset += 256) {
      await Promise.all(Array.from(
        { length: Math.min(256, entryCount - offset) },
        async (_, index) => {
          await fs.writeFile(
            path.join(dir, `noise-${String(offset + index).padStart(5, "0")}`),
            ""
          );
        }
      ));
    }

    const inspection = await inspectJsonlAuditRotationStagings(filePath);

    expect(inspection.scannedEntryCount)
      .toBe(MAX_JSONL_AUDIT_ROTATION_STAGING_SCAN_ENTRIES);
    expect(inspection.scanLimit)
      .toBe(MAX_JSONL_AUDIT_ROTATION_STAGING_SCAN_ENTRIES);
    expect(inspection.scanTruncated).toBe(true);
  });

  it("keeps direct and listed rotation staging projections aligned", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = getJsonlAuditRotationStagingPath(filePath, "Parity");
    const observedAt = Date.parse("2026-07-22T12:00:00.000Z");
    await fs.mkdir(stagingPath, { mode: 0o700 });

    const listed = await inspectJsonlAuditRotationStagings(
      filePath,
      () => observedAt
    );
    const direct = await inspectJsonlAuditRotationStaging(
      filePath,
      "Parity",
      () => observedAt
    );
    const missing = await inspectJsonlAuditRotationStaging(
      filePath,
      "Absent",
      () => observedAt
    );

    expect(listed.entries).toEqual([direct]);
    expect(missing).toEqual({
      stagingId: "Absent",
      stagingPath: getJsonlAuditRotationStagingPath(filePath, "Absent"),
      exists: false
    });
    await expect(inspectJsonlAuditRotationStaging(filePath, "bad"))
      .rejects.toThrow("expected six ASCII alphanumeric characters");
  });

  it("classifies exact-empty rotation staging as a cleanup-only dry-run candidate", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "EmptyR"
    );
    const before = await fs.stat(stagingPath, { bigint: true });

    const first = await inspectJsonlAuditRotationRecovery(filePath, "EmptyR");
    const second = await inspectJsonlAuditRotationRecovery(filePath, "EmptyR");

    expect(first).toMatchObject({
      filePath,
      rotatedPath: `${filePath}.1`,
      stagingId: "EmptyR",
      stagingPath,
      coordinationLockExists: false,
      currentGeneration: { entryPath: filePath, exists: false },
      rotatedGeneration: { entryPath: `${filePath}.1`, exists: false },
      staging: {
        exists: true,
        entryType: "directory",
        layout: "empty",
        entryCount: 0
      },
      assessment: "cleanup_empty_staging",
      eligible: true,
      recommendedAction: "cleanup_empty_staging",
      recoveryFingerprint: expect.stringMatching(/^[0-9a-f]{32}$/u)
    });
    expect(first.recoveryFingerprint).toHaveLength(
      JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_HEX_LENGTH
    );
    expect(second.recoveryFingerprint).toBe(first.recoveryFingerprint);
    expect(JSON.stringify(first)).not.toContain("device");
    expect(await fs.stat(stagingPath, { bigint: true })).toMatchObject({
      dev: before.dev,
      ino: before.ino,
      ctimeNs: before.ctimeNs
    });
    expect(await fs.readdir(stagingPath)).toEqual([]);
  });

  it("classifies a staged archive with current present as archive restore readiness", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Rstr01",
      "previous-archive\n"
    );

    const inspection = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Rstr01"
    );

    expect(inspection).toMatchObject({
      assessment: "restore_previous_archive",
      eligible: true,
      recommendedAction: "restore_previous_archive",
      recoveryFingerprint: expect.stringMatching(/^[0-9a-f]{32}$/u),
      currentGeneration: {
        exists: true,
        entryType: "regular_file",
        sizeBytes: Buffer.byteLength("current-record\n"),
        linkCount: 1
      },
      rotatedGeneration: { exists: false },
      staging: {
        layout: "previous_only",
        previousEntryType: "regular_file"
      }
    });
    if (process.platform !== "win32") {
      expect(inspection.currentGeneration).toMatchObject({
        mode: 0o600,
        privateMode: true
      });
    }
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(
      path.join(stagingPath, "previous"),
      "utf8"
    )).toBe("previous-archive\n");
    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
  });

  it("classifies current-missing staged rotation as full rollback readiness", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(`${filePath}.1`, "original-current\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Roll01",
      "previous-archive\n"
    );

    const inspection = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Roll01"
    );

    expect(inspection).toMatchObject({
      assessment: "rollback_full_rotation",
      eligible: true,
      recommendedAction: "rollback_full_rotation",
      recoveryFingerprint: expect.stringMatching(/^[0-9a-f]{32}$/u),
      currentGeneration: { exists: false },
      rotatedGeneration: {
        exists: true,
        entryType: "regular_file",
        sizeBytes: Buffer.byteLength("original-current\n"),
        linkCount: 1
      },
      staging: { layout: "previous_only" }
    });
    expect(await fs.readFile(`${filePath}.1`, "utf8"))
      .toBe("original-current\n");
    expect(await fs.readFile(
      path.join(stagingPath, "previous"),
      "utf8"
    )).toBe("previous-archive\n");
  });

  it("keeps current-plus-rotated staged archives ambiguous without reading content", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "new-or-partial-record\n");
    await writePrivateAuditGeneration(`${filePath}.1`, "original-current\n");
    await createAuditRotationStagingFixture(
      filePath,
      "Ambig1",
      "previous-archive\n"
    );
    const readFile = vi.spyOn(fs, "readFile");

    const inspection = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Ambig1"
    );

    expect(inspection).toMatchObject({
      assessment: "ambiguous_record_state",
      eligible: false,
      currentGeneration: { exists: true, entryType: "regular_file" },
      rotatedGeneration: { exists: true, entryType: "regular_file" },
      staging: { layout: "previous_only" }
    });
    expect(inspection.recommendedAction).toBeUndefined();
    expect(inspection.recoveryFingerprint).toBeUndefined();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("withholds rotation recovery authority while the coordination lock exists", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    await createAuditRotationStagingFixture(
      filePath,
      "Lock01",
      "previous-archive\n"
    );
    const lock = await acquireJsonlAuditFileLock(filePath);

    const inspection = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Lock01"
    );

    expect(inspection).toMatchObject({
      coordinationLockPath: lock.lockPath,
      coordinationLockExists: true,
      coordinationLockEntryType: "directory",
      coordinationLockAcquirable: false,
      assessment: "coordination_lock_present",
      eligible: false
    });
    expect(inspection.recoveryFingerprint).toBeUndefined();
    expect((await fs.stat(lock.lockPath)).isDirectory()).toBe(true);
    await lock.release();
  });

  it("classifies missing, invalid staging, invalid generation, and unsupported namespace states", async () => {
    const dir = await createTempDir();
    const missingFile = path.join(dir, "missing", "audit.jsonl");
    await fs.mkdir(path.dirname(missingFile));
    const missing = await inspectJsonlAuditRotationRecovery(
      missingFile,
      "Miss01"
    );
    expect(missing).toMatchObject({
      assessment: "staging_missing",
      eligible: false,
      staging: { exists: false }
    });

    const invalidStagingFile = path.join(dir, "invalid-staging.jsonl");
    const invalidStagingPath = await createAuditRotationStagingFixture(
      invalidStagingFile,
      "PrevDr"
    );
    await fs.mkdir(path.join(invalidStagingPath, "previous"));
    const invalidStaging = await inspectJsonlAuditRotationRecovery(
      invalidStagingFile,
      "PrevDr"
    );
    expect(invalidStaging).toMatchObject({
      assessment: "invalid_staging_state",
      eligible: false,
      staging: {
        layout: "previous_only",
        previousEntryType: "directory"
      }
    });

    const nonDirectoryFile = path.join(dir, "non-directory.jsonl");
    const nonDirectoryStaging = getJsonlAuditRotationStagingPath(
      nonDirectoryFile,
      "File01"
    );
    await fs.writeFile(nonDirectoryStaging, "not-a-directory\n", { mode: 0o600 });
    expect(await inspectJsonlAuditRotationRecovery(nonDirectoryFile, "File01"))
      .toMatchObject({
        assessment: "invalid_staging_state",
        eligible: false,
        staging: { entryType: "regular_file" }
      });

    const unknownFile = path.join(dir, "unknown-staging.jsonl");
    const unknownStaging = await createAuditRotationStagingFixture(
      unknownFile,
      "Unkn01"
    );
    await fs.writeFile(path.join(unknownStaging, "unexpected"), "unknown\n");
    expect(await inspectJsonlAuditRotationRecovery(unknownFile, "Unkn01"))
      .toMatchObject({
        assessment: "invalid_staging_state",
        eligible: false,
        staging: { layout: "unknown", entryCount: 1 }
      });

    if (process.platform !== "win32") {
      const broadStagingFile = path.join(dir, "broad-staging.jsonl");
      const broadStaging = await createAuditRotationStagingFixture(
        broadStagingFile,
        "BroadS"
      );
      await fs.chmod(broadStaging, 0o755);
      expect(await inspectJsonlAuditRotationRecovery(
        broadStagingFile,
        "BroadS"
      )).toMatchObject({
        assessment: "invalid_staging_state",
        eligible: false,
        staging: { layout: "empty" }
      });
    }

    const zeroFile = path.join(dir, "zero.jsonl");
    await writePrivateAuditGeneration(zeroFile, "");
    await createAuditRotationStagingFixture(
      zeroFile,
      "Zero01",
      "previous-archive\n"
    );
    const invalidGeneration = await inspectJsonlAuditRotationRecovery(
      zeroFile,
      "Zero01"
    );
    expect(invalidGeneration).toMatchObject({
      assessment: "invalid_generation_state",
      eligible: false,
      currentGeneration: { exists: true, sizeBytes: 0 }
    });

    const unsupportedFile = path.join(dir, "unsupported.jsonl");
    await createAuditRotationStagingFixture(
      unsupportedFile,
      "Unsup1",
      "previous-archive\n"
    );
    const unsupported = await inspectJsonlAuditRotationRecovery(
      unsupportedFile,
      "Unsup1"
    );
    expect(unsupported).toMatchObject({
      assessment: "unsupported_namespace_state",
      eligible: false,
      currentGeneration: { exists: false },
      rotatedGeneration: { exists: false }
    });
  });

  it("rejects linked and broadly accessible recovery generations", async () => {
    const dir = await createTempDir();
    const hardSource = path.join(dir, "hard-source.jsonl");
    const hardFile = path.join(dir, "hard.jsonl");
    await writePrivateAuditGeneration(hardSource, "hard-linked\n");
    await fs.link(hardSource, hardFile);
    await createAuditRotationStagingFixture(
      hardFile,
      "Hard01",
      "previous-archive\n"
    );
    expect(await inspectJsonlAuditRotationRecovery(hardFile, "Hard01"))
      .toMatchObject({
        assessment: "invalid_generation_state",
        eligible: false,
        currentGeneration: { linkCount: 2 }
      });

    if (process.platform !== "win32") {
      const broadFile = path.join(dir, "broad.jsonl");
      await fs.writeFile(broadFile, "broad-mode\n", { mode: 0o644 });
      await createAuditRotationStagingFixture(
        broadFile,
        "Broad1",
        "previous-archive\n"
      );
      expect(await inspectJsonlAuditRotationRecovery(broadFile, "Broad1"))
        .toMatchObject({
          assessment: "invalid_generation_state",
          eligible: false,
          currentGeneration: { privateMode: false }
        });

      const victimPath = path.join(dir, "victim.jsonl");
      const linkedFile = path.join(dir, "linked.jsonl");
      await writePrivateAuditGeneration(victimPath, "victim\n");
      await fs.symlink(victimPath, linkedFile);
      await createAuditRotationStagingFixture(
        linkedFile,
        "Link01",
        "previous-archive\n"
      );
      expect(await inspectJsonlAuditRotationRecovery(linkedFile, "Link01"))
        .toMatchObject({
          assessment: "invalid_generation_state",
          eligible: false,
          currentGeneration: { entryType: "symbolic_link" }
        });
      expect(await fs.readFile(victimPath, "utf8")).toBe("victim\n");
    }
  });

  it("binds recovery fingerprints to action, target, id, and object snapshots", async () => {
    const dir = await createTempDir();
    const firstFile = path.join(dir, "first.jsonl");
    await writePrivateAuditGeneration(firstFile, "current-record\n");
    const firstStagingPath = await createAuditRotationStagingFixture(
      firstFile,
      "Bind01",
      "previous-archive\n"
    );
    const first = await inspectJsonlAuditRotationRecovery(firstFile, "Bind01");
    await fs.appendFile(firstFile, "next-record\n");
    const changed = await inspectJsonlAuditRotationRecovery(firstFile, "Bind01");
    await fs.appendFile(
      path.join(firstStagingPath, "previous"),
      "next-archive\n"
    );
    const previousChanged = await inspectJsonlAuditRotationRecovery(
      firstFile,
      "Bind01"
    );
    const historicalTime = new Date("2000-01-01T00:00:00.000Z");
    await fs.utimes(firstStagingPath, historicalTime, historicalTime);
    const stagingChanged = await inspectJsonlAuditRotationRecovery(
      firstFile,
      "Bind01"
    );

    const secondFile = path.join(dir, "second.jsonl");
    await writePrivateAuditGeneration(secondFile, "current-record\n");
    await createAuditRotationStagingFixture(
      secondFile,
      "Bind02",
      "previous-archive\n"
    );
    const second = await inspectJsonlAuditRotationRecovery(secondFile, "Bind02");

    const emptyFile = path.join(dir, "empty.jsonl");
    await createAuditRotationStagingFixture(emptyFile, "Bind03");
    const empty = await inspectJsonlAuditRotationRecovery(emptyFile, "Bind03");

    expect(first.eligible).toBe(true);
    expect(changed.eligible).toBe(true);
    expect(previousChanged.eligible).toBe(true);
    expect(stagingChanged.eligible).toBe(true);
    expect(second.eligible).toBe(true);
    expect(empty.eligible).toBe(true);
    expect(changed.recoveryFingerprint).not.toBe(first.recoveryFingerprint);
    expect(previousChanged.recoveryFingerprint)
      .not.toBe(changed.recoveryFingerprint);
    expect(stagingChanged.recoveryFingerprint)
      .not.toBe(previousChanged.recoveryFingerprint);
    expect(second.recoveryFingerprint).not.toBe(first.recoveryFingerprint);
    expect(empty.recoveryFingerprint).not.toBe(first.recoveryFingerprint);
  });

  it("reports generation drift during recovery readiness inspection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    await createAuditRotationStagingFixture(
      filePath,
      "Race01",
      "previous-archive\n"
    );
    const originalLstat = fs.lstat.bind(fs);
    let currentReads = 0;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (String(target) === filePath) {
        currentReads += 1;
        if (currentReads === 2) {
          await fs.appendFile(filePath, "external-drift\n");
        }
      }
      return originalLstat(target, options);
    });

    const inspection = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Race01"
    );

    expect(currentReads).toBeGreaterThanOrEqual(2);
    expect(inspection).toMatchObject({
      assessment: "state_changed",
      eligible: false,
      currentGeneration: { exists: true, stateChanged: true }
    });
    expect(inspection.recoveryFingerprint).toBeUndefined();
  });

  it("prioritizes graph drift over a missing staging residue", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const originalLstat = fs.lstat.bind(fs);
    let currentReads = 0;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (String(target) === filePath) {
        currentReads += 1;
        if (currentReads === 2) {
          await fs.appendFile(filePath, "external-drift\n");
        }
      }
      return originalLstat(target, options);
    });

    const inspection = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Race04"
    );

    expect(inspection).toMatchObject({
      assessment: "state_changed",
      eligible: false,
      currentGeneration: { stateChanged: true },
      staging: { exists: false }
    });
    expect(inspection.recoveryFingerprint).toBeUndefined();
  });

  it("reports staged previous drift during recovery readiness inspection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Race02",
      "previous-archive\n"
    );
    const previousPath = path.join(stagingPath, "previous");
    const originalLstat = fs.lstat.bind(fs);
    let previousReads = 0;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.basename(String(target)) === "previous") {
        previousReads += 1;
        if (previousReads === 2) {
          await fs.appendFile(previousPath, "external-drift\n");
        }
      }
      return originalLstat(target, options);
    });

    const inspection = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Race02"
    );

    expect(previousReads).toBeGreaterThanOrEqual(2);
    expect(inspection).toMatchObject({
      assessment: "state_changed",
      eligible: false,
      staging: {
        layout: "unknown",
        stateChanged: true
      }
    });
    expect(inspection.recoveryFingerprint).toBeUndefined();
  });

  it("reports coordination lock appearance during recovery readiness inspection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    await writePrivateAuditGeneration(filePath, "current-record\n");
    await createAuditRotationStagingFixture(
      filePath,
      "Race03",
      "previous-archive\n"
    );
    const originalLstat = fs.lstat.bind(fs);
    let lockReads = 0;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (String(target) === lockPath) {
        lockReads += 1;
        if (lockReads === 2) {
          await fs.writeFile(lockPath, "external-lock\n", { mode: 0o600 });
        }
      }
      return originalLstat(target, options);
    });

    const inspection = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Race03"
    );

    expect(lockReads).toBe(2);
    expect(inspection).toMatchObject({
      assessment: "state_changed",
      eligible: false,
      coordinationLockExists: true,
      coordinationLockEntryType: "regular_file",
      coordinationLockStateChanged: true
    });
    expect(inspection.recoveryFingerprint).toBeUndefined();
    await fs.unlink(lockPath);
  });

  it("reports terminal active lock rebinding during recovery readiness inspection", async () => {
    if (process.platform === "win32") {
      return;
    }
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await createAuditRotationStagingFixture(filePath, "Race07");
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

    try {
      const inspection = await inspectJsonlAuditRotationRecovery(
        filePath,
        "Race07"
      );

      expect(injected).toBe(true);
      expect(inspection).toMatchObject({
        assessment: "state_changed",
        eligible: false,
        coordinationLockExists: true,
        coordinationLockEntryType: "symbolic_link",
        coordinationLockStateChanged: true
      });
      expect(inspection.recoveryFingerprint).toBeUndefined();
      expect(JSON.stringify(inspection)).not.toContain(hiddenName);
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

  it("reports terminal active lock generation drift during recovery readiness inspection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await createAuditRotationStagingFixture(filePath, "Race08");
    const lock = await acquireJsonlAuditFileLock(filePath);
    const extraName = "terminal-late-secret";
    const extraPath = path.join(lock.lockPath, extraName);
    const originalLstat = fs.lstat.bind(fs);
    const originalOpen = fs.open.bind(fs);
    let ownerPathReads = 0;
    let injected = false;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (path.resolve(String(target)) === path.resolve(lock.ownerPath)) {
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
      return originalLstat(target, options);
    });

    try {
      const inspection = await inspectJsonlAuditRotationRecovery(
        filePath,
        "Race08"
      );

      expect(injected).toBe(true);
      expect(inspection).toMatchObject({
        assessment: "state_changed",
        eligible: false,
        coordinationLockExists: true,
        coordinationLockEntryType: "directory",
        coordinationLockEntryCount: 2,
        coordinationLockOwnerEntryExclusive: false,
        coordinationLockStateChanged: true
      });
      expect(inspection.recoveryFingerprint).toBeUndefined();
      expect(JSON.stringify(inspection)).not.toContain(extraName);
      expect(await fs.readFile(extraPath, "utf8")).toBe("preserved\n");
    } finally {
      vi.restoreAllMocks();
      await fs.rm(extraPath, { force: true });
      await lock.release();
    }
  });

  it("reports rotated generation drift during recovery readiness inspection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await writePrivateAuditGeneration(rotatedPath, "rotated-record\n");
    await createAuditRotationStagingFixture(
      filePath,
      "Race05",
      "previous-archive\n"
    );
    const originalLstat = fs.lstat.bind(fs);
    let rotatedReads = 0;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (String(target) === rotatedPath) {
        rotatedReads += 1;
        if (rotatedReads === 2) {
          await fs.appendFile(rotatedPath, "external-drift\n");
        }
      }
      return originalLstat(target, options);
    });

    const inspection = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Race05"
    );

    expect(rotatedReads).toBeGreaterThanOrEqual(2);
    expect(inspection).toMatchObject({
      assessment: "state_changed",
      eligible: false,
      rotatedGeneration: { exists: true, stateChanged: true }
    });
    expect(inspection.recoveryFingerprint).toBeUndefined();
  });

  it("reports staging root drift during recovery readiness inspection", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Race06",
      "previous-archive\n"
    );
    const originalLstat = fs.lstat.bind(fs);
    let stagingReads = 0;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (String(target) === stagingPath) {
        stagingReads += 1;
        if (stagingReads === 2) {
          const historicalTime = new Date("2000-01-01T00:00:00.000Z");
          await fs.utimes(stagingPath, historicalTime, historicalTime);
        }
      }
      return originalLstat(target, options);
    });

    const inspection = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Race06"
    );

    expect(stagingReads).toBeGreaterThanOrEqual(2);
    expect(inspection).toMatchObject({
      assessment: "state_changed",
      eligible: false,
      staging: { layout: "unknown", stateChanged: true }
    });
    expect(inspection.recoveryFingerprint).toBeUndefined();
  });

  it("removes only an exactly confirmed empty rotation staging", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await writePrivateAuditGeneration(filePath, "current-record\n");
    await writePrivateAuditGeneration(rotatedPath, "rotated-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix001"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix001"
    );

    const result = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fix001",
      "cleanup_empty_staging",
      readiness.recoveryFingerprint!
    );

    expect(result).toEqual({
      filePath,
      rotatedPath,
      stagingId: "Fix001",
      stagingPath,
      requestedAction: "cleanup_empty_staging",
      performedAction: "cleanup_empty_staging",
      expectedRecoveryFingerprint: readiness.recoveryFingerprint,
      recoveryFingerprint: readiness.recoveryFingerprint,
      existed: true,
      recovered: true,
      mutationPerformed: true,
      stagingRemoved: true,
      durability: "buffered",
      durabilityCompleted: true,
      recoveryHandlesClosed: true,
      coordinationLockPath: getJsonlAuditLockPath(filePath),
      coordinationLockReleased: true
    });
    await expect(fs.access(stagingPath)).rejects.toThrow();
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(rotatedPath, "utf8")).toBe("rotated-record\n");
    await expect(fs.access(getJsonlAuditLockPath(filePath))).rejects.toThrow();
  });

  it("restores a confirmed previous archive without reading generation content", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix002",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix002"
    );
    const readFile = vi.spyOn(fs, "readFile").mockRejectedValue(
      new Error("content read is forbidden")
    );

    const result = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fix002",
      "restore_previous_archive",
      readiness.recoveryFingerprint!
    );

    expect(readFile).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    expect(result).toMatchObject({
      requestedAction: "restore_previous_archive",
      performedAction: "restore_previous_archive",
      recovered: true,
      mutationPerformed: true,
      stagingRemoved: true,
      durabilityCompleted: true,
      recoveryHandlesClosed: true,
      coordinationLockReleased: true
    });
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(rotatedPath, "utf8")).toBe("previous-archive\n");
    await expect(fs.access(stagingPath)).rejects.toThrow();
  });

  it("rolls a confirmed pre-commit rotation back to both generations", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await writePrivateAuditGeneration(rotatedPath, "original-current\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix003",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix003"
    );

    const result = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fix003",
      "rollback_full_rotation",
      readiness.recoveryFingerprint!
    );

    expect(result).toMatchObject({
      requestedAction: "rollback_full_rotation",
      performedAction: "rollback_full_rotation",
      recovered: true,
      mutationPerformed: true,
      stagingRemoved: true,
      durabilityCompleted: true,
      recoveryHandlesClosed: true,
      coordinationLockReleased: true
    });
    expect(await fs.readFile(filePath, "utf8")).toBe("original-current\n");
    expect(await fs.readFile(rotatedPath, "utf8")).toBe("previous-archive\n");
    await expect(fs.access(stagingPath)).rejects.toThrow();
  });

  it("rejects wrong recovery intent and stale fingerprints before mutation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix004",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix004"
    );

    await expect(recoverJsonlAuditRotationStaging(
      filePath,
      "Fix004",
      "rollback_full_rotation",
      readiness.recoveryFingerprint!
    )).rejects.toThrow("does not match current action");
    const staleFingerprintError = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fix004",
      "restore_previous_archive",
      "0".repeat(JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_HEX_LENGTH)
    ).catch((error: unknown) => error);

    expect(staleFingerprintError).toBeInstanceOf(
      JsonlAuditRotationStagingRecoveryError
    );
    expect(staleFingerprintError).toMatchObject({
      message: expect.stringContaining("fingerprint does not match"),
      details: {
        filePath,
        rotatedPath: `${filePath}.1`,
        stagingId: "Fix004",
        stagingPath,
        requestedAction: "restore_previous_archive",
        expectedRecoveryFingerprint: "0".repeat(
          JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_HEX_LENGTH
        ),
        recoveryFingerprint: readiness.recoveryFingerprint,
        stage: "locked_revalidation",
        mutationState: "not_started",
        rollbackAttempted: false,
        coordinationLockPath: getJsonlAuditLockPath(filePath),
        coordinationLockAcquired: true,
        coordinationLockReleased: true,
        postFailureObservationCompleted: true,
        postFailureObservation: {
          observedWhileCoordinationLockHeld: true,
          assessment: "restore_previous_archive",
          eligible: true,
          recommendedAction: "restore_previous_archive",
          recoveryFingerprint: readiness.recoveryFingerprint,
          currentGeneration: {
            entryPath: filePath,
            exists: true,
            entryType: "regular_file"
          },
          rotatedGeneration: {
            entryPath: `${filePath}.1`,
            exists: false
          },
          staging: {
            stagingId: "Fix004",
            stagingPath,
            exists: true,
            layout: "previous_only"
          }
        }
      }
    });

    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
  });

  it("reverses pre-commit recovery renames when injected steps fail", async () => {
    const dir = await createTempDir();

    const rollbackFile = path.join(dir, "rollback.jsonl");
    const rollbackRotated = `${rollbackFile}.1`;
    await writePrivateAuditGeneration(rollbackRotated, "original-current\n");
    const rollbackStaging = await createAuditRotationStagingFixture(
      rollbackFile,
      "Fix005",
      "previous-archive\n"
    );
    const rollbackReadiness = await inspectJsonlAuditRotationRecovery(
      rollbackFile,
      "Fix005"
    );
    const rolledBackError = await recoverJsonlAuditRotationStaging(
      rollbackFile,
      "Fix005",
      "rollback_full_rotation",
      rollbackReadiness.recoveryFingerprint!,
      {
        afterCurrentRestore: () => {
          throw new Error("injected current restore failure");
        }
      }
    ).catch((error: unknown) => error);
    expect(rolledBackError).toBeInstanceOf(
      JsonlAuditRotationStagingRecoveryError
    );
    expect(rolledBackError).toMatchObject({
      message: "injected current restore failure",
      details: {
        stage: "mutation",
        mutationState: "rolled_back",
        rollbackAttempted: true,
        rollbackCompleted: true,
        recoveryFingerprint: rollbackReadiness.recoveryFingerprint,
        recoveryHandlesClosed: true,
        coordinationLockAcquired: true,
        coordinationLockReleased: true,
        postFailureObservationCompleted: true,
        postFailureObservation: {
          observedWhileCoordinationLockHeld: true,
          assessment: "rollback_full_rotation",
          eligible: true,
          recommendedAction: "rollback_full_rotation",
          recoveryFingerprint: expect.stringMatching(/^[0-9a-f]{32}$/u),
          currentGeneration: { exists: false },
          rotatedGeneration: {
            entryPath: rollbackRotated,
            exists: true,
            entryType: "regular_file"
          },
          staging: {
            stagingId: "Fix005",
            stagingPath: rollbackStaging,
            exists: true,
            layout: "previous_only"
          }
        }
      }
    });
    await expect(fs.access(rollbackFile)).rejects.toThrow();
    expect(await fs.readFile(rollbackRotated, "utf8"))
      .toBe("original-current\n");
    expect(await fs.readFile(
      path.join(rollbackStaging, "previous"),
      "utf8"
    )).toBe("previous-archive\n");

    const restoreFile = path.join(dir, "restore.jsonl");
    await writePrivateAuditGeneration(restoreFile, "current-record\n");
    const restoreStaging = await createAuditRotationStagingFixture(
      restoreFile,
      "Fix006",
      "previous-archive\n"
    );
    const restoreReadiness = await inspectJsonlAuditRotationRecovery(
      restoreFile,
      "Fix006"
    );
    await expect(recoverJsonlAuditRotationStaging(
      restoreFile,
      "Fix006",
      "restore_previous_archive",
      restoreReadiness.recoveryFingerprint!,
      {
        afterArchiveRestore: () => {
          throw new Error("injected archive restore failure");
        }
      }
    )).rejects.toThrow("injected archive restore failure");
    expect(await fs.readFile(restoreFile, "utf8")).toBe("current-record\n");
    await expect(fs.access(`${restoreFile}.1`)).rejects.toThrow();
    expect(await fs.readFile(
      path.join(restoreStaging, "previous"),
      "utf8"
    )).toBe("previous-archive\n");
  });

  it("returns post-commit staging residue and accepts a fresh cleanup fingerprint", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix007",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix007"
    );

    const restored = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fix007",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        beforeStagingRemoval: () => {
          throw new Error("injected staging cleanup failure");
        }
      }
    );

    expect(restored).toMatchObject({
      recovered: true,
      mutationPerformed: true,
      stagingRemoved: false,
      durabilityCompleted: true,
      residualStagingPath: stagingPath,
      warning: expect.stringContaining("injected staging cleanup failure")
    });
    expect(await fs.readFile(rotatedPath, "utf8")).toBe("previous-archive\n");
    expect(await fs.readdir(stagingPath)).toEqual([]);

    const cleanupReadiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix007"
    );
    expect(cleanupReadiness.assessment).toBe("cleanup_empty_staging");
    const cleaned = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fix007",
      "cleanup_empty_staging",
      cleanupReadiness.recoveryFingerprint!
    );
    expect(cleaned).toMatchObject({
      recovered: true,
      stagingRemoved: true
    });
    await expect(fs.access(stagingPath)).rejects.toThrow();
  });

  it("validates recovery input, missing state, and lock timeout without mutation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lstat = vi.spyOn(fs, "lstat");
    await expect(recoverJsonlAuditRotationStaging(
      filePath,
      "Fix008",
      "invalid" as "cleanup_empty_staging",
      "0".repeat(JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_HEX_LENGTH)
    )).rejects.toThrow("Invalid audit rotation recovery action");
    await expect(recoverJsonlAuditRotationStaging(
      filePath,
      "Fix008",
      "cleanup_empty_staging",
      "A".repeat(JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_HEX_LENGTH)
    )).rejects.toThrow("lowercase hexadecimal");
    expect(lstat).not.toHaveBeenCalled();
    vi.restoreAllMocks();

    const missing = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fix008",
      "cleanup_empty_staging",
      "0".repeat(JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_HEX_LENGTH)
    );
    expect(missing).toMatchObject({
      existed: false,
      recovered: false,
      mutationPerformed: false,
      stagingRemoved: false,
      durabilityCompleted: true,
      recoveryHandlesClosed: true,
      coordinationLockPath: getJsonlAuditLockPath(filePath),
      coordinationLockReleased: true
    });
    expect(missing.performedAction).toBeUndefined();

    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix009",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix009"
    );
    const heldLock = await acquireJsonlAuditFileLock(filePath);
    let clock = 0;
    const lockTimeoutError = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fix009",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        lockOptions: {
          timeoutMs: 2,
          retryMs: 1,
          now: () => clock,
          wait: async (milliseconds) => {
            clock += milliseconds;
          }
        }
      }
    ).catch((error: unknown) => error);
    expect(lockTimeoutError).toBeInstanceOf(
      JsonlAuditRotationStagingRecoveryError
    );
    expect(lockTimeoutError).toMatchObject({
      message: expect.stringContaining("Timed out waiting for audit file lock"),
      details: {
        filePath,
        rotatedPath: `${filePath}.1`,
        stagingId: "Fix009",
        stagingPath,
        requestedAction: "restore_previous_archive",
        expectedRecoveryFingerprint: readiness.recoveryFingerprint,
        stage: "lock_acquisition",
        mutationState: "not_started",
        rollbackAttempted: false,
        coordinationLockPath: getJsonlAuditLockPath(filePath),
        coordinationLockAcquired: false,
        postFailureObservationCompleted: false
      }
    });
    expect(
      (lockTimeoutError as JsonlAuditRotationStagingRecoveryError)
        .details.coordinationLockReleased
    ).toBeUndefined();
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
    await heldLock.release();
  });

  it("rejects graph drift injected after the first locked fingerprint match", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix010",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix010"
    );

    await expect(recoverJsonlAuditRotationStaging(
      filePath,
      "Fix010",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        beforeMutation: async () => {
          await fs.appendFile(filePath, "external-drift\n");
        }
      }
    )).rejects.toThrow("fingerprint does not match");

    expect(await fs.readFile(filePath, "utf8"))
      .toBe("current-record\nexternal-drift\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
  });

  it("reports an unconfirmed empty-staging removal attempt", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fail01"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fail01"
    );
    const originalRmdir = fs.rmdir.bind(fs);
    let injected = false;
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      if (
        !injected
        && path.basename(String(target)) === path.basename(stagingPath)
      ) {
        injected = true;
        throw new Error("injected staging rmdir failure");
      }
      await originalRmdir(target, options);
    });

    const failure = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fail01",
      "cleanup_empty_staging",
      readiness.recoveryFingerprint!
    ).catch((error: unknown) => error);

    expect(injected).toBe(true);
    expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
    expect(failure).toMatchObject({
      message: "injected staging rmdir failure",
      details: {
        stage: "mutation",
        mutationState: "attempted_unconfirmed",
        rollbackAttempted: false,
        recoveryFingerprint: readiness.recoveryFingerprint,
        recoveryHandlesClosed: true,
        coordinationLockAcquired: true,
        coordinationLockReleased: true,
        postFailureObservationCompleted: true,
        postFailureObservation: {
          observedWhileCoordinationLockHeld: true,
          assessment: "cleanup_empty_staging",
          eligible: true,
          recommendedAction: "cleanup_empty_staging",
          recoveryFingerprint: readiness.recoveryFingerprint,
          staging: {
            stagingId: "Fail01",
            stagingPath,
            exists: true,
            layout: "empty",
            entryCount: 0
          }
        }
      }
    });
    expect((await fs.lstat(stagingPath)).isDirectory()).toBe(true);
  });

  it("preserves the primary error when post-failure observation fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Obs001",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Obs001"
    );
    const originalLstat = fs.lstat.bind(fs);
    let observationFailurePending = false;
    let observationFailureInjected = false;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (
        observationFailurePending
        && String(target) === filePath
      ) {
        observationFailurePending = false;
        observationFailureInjected = true;
        throw new Error("injected post-failure observation failure");
      }
      return originalLstat(target, options);
    });

    const failure = await recoverJsonlAuditRotationStaging(
      filePath,
      "Obs001",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        beforeMutation: () => {
          observationFailurePending = true;
          throw new Error("primary pre-mutation recovery failure");
        }
      }
    ).catch((error: unknown) => error);

    expect(observationFailureInjected).toBe(true);
    expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
    expect(failure).toMatchObject({
      message: "primary pre-mutation recovery failure",
      details: {
        stage: "locked_revalidation",
        mutationState: "not_started",
        rollbackAttempted: false,
        recoveryFingerprint: readiness.recoveryFingerprint,
        coordinationLockAcquired: true,
        coordinationLockReleased: true,
        postFailureObservationCompleted: false,
        postFailureObservationWarning: expect.stringContaining(
          "injected post-failure observation failure"
        )
      }
    });
    expect(
      (failure as JsonlAuditRotationStagingRecoveryError)
        .details.postFailureObservation
    ).toBeUndefined();
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
  });

  it("preserves candidate-open and descriptor-close failure evidence", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fail02",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fail02"
    );
    const originalOpen = fs.open.bind(fs);
    let injectionEnabled = false;
    let parentHandleWrapped = false;
    let candidateOpenRejected = false;
    let stagingOpenCount = 0;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      if (
        injectionEnabled
        && !candidateOpenRejected
        && String(target) === stagingPath
      ) {
        stagingOpenCount += 1;
        if (stagingOpenCount === 2) {
          candidateOpenRejected = true;
          throw new Error("injected candidate open failure");
        }
      }
      const handle = await originalOpen(target, flags, mode);
      if (
        injectionEnabled
        && !parentHandleWrapped
        && String(target) === dir
      ) {
        parentHandleWrapped = true;
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(async () => {
          await close();
          throw new Error("injected candidate close failure");
        });
      }
      return handle;
    });

    const failure = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fail02",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        beforeMutation: () => {
          injectionEnabled = true;
        }
      }
    ).catch((error: unknown) => error);

    expect(parentHandleWrapped).toBe(true);
    expect(candidateOpenRejected).toBe(true);
    expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
    expect(failure).toMatchObject({
      message: "injected candidate open failure",
      details: {
        stage: "candidate_open",
        mutationState: "not_started",
        rollbackAttempted: false,
        recoveryFingerprint: readiness.recoveryFingerprint,
        recoveryHandlesClosed: false,
        recoveryHandleWarning: expect.stringContaining(
          "injected candidate close failure"
        ),
        coordinationLockAcquired: true,
        coordinationLockReleased: true
      }
    });
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
  });

  it("hands a failed candidate parent open to successful outer finalization", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Hnd001",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Hnd001"
    );
    const originalOpen = fs.open.bind(fs);
    let injectionEnabled = false;
    let parentCloseCalls = 0;
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (injectionEnabled && !injected && String(target) === dir) {
        injected = true;
        vi.spyOn(handle, "stat").mockRejectedValue(
          new Error("injected handed-off parent validation failure")
        );
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(async () => {
          parentCloseCalls += 1;
          await close();
        });
      }
      return handle;
    });

    const failure = await recoverJsonlAuditRotationStaging(
      filePath,
      "Hnd001",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        beforeMutation: () => {
          injectionEnabled = true;
        }
      }
    ).catch((error: unknown) => error);

    expect(injected).toBe(true);
    expect(parentCloseCalls).toBe(1);
    expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
    expect(failure).toMatchObject({
      message: "injected handed-off parent validation failure",
      details: {
        stage: "candidate_open",
        mutationState: "not_started",
        recoveryHandlesClosed: true,
        coordinationLockReleased: true
      }
    });
    expect(
      (failure as JsonlAuditRotationStagingRecoveryError)
        .details.recoveryHandleWarning
    ).toBeUndefined();
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
  });

  it("reports a failed handed-off candidate parent close", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Hnd002",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Hnd002"
    );
    const originalOpen = fs.open.bind(fs);
    let injectionEnabled = false;
    let parentCloseCalls = 0;
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (injectionEnabled && !injected && String(target) === dir) {
        injected = true;
        vi.spyOn(handle, "stat").mockRejectedValue(
          new Error("injected handed-off parent validation failure")
        );
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(async () => {
          parentCloseCalls += 1;
          await close();
          throw new Error("injected handed-off parent close failure");
        });
      }
      return handle;
    });

    const failure = await recoverJsonlAuditRotationStaging(
      filePath,
      "Hnd002",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        beforeMutation: () => {
          injectionEnabled = true;
        }
      }
    ).catch((error: unknown) => error);

    expect(injected).toBe(true);
    expect(parentCloseCalls).toBe(1);
    expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
    expect(failure).toMatchObject({
      message: "injected handed-off parent validation failure",
      details: {
        stage: "candidate_open",
        mutationState: "not_started",
        recoveryHandlesClosed: false,
        recoveryHandleWarning: expect.stringContaining(
          "injected handed-off parent close failure"
        ),
        coordinationLockReleased: true
      }
    });
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
  });

  it("finalizes returned parent and handed-off staging handles together", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Hnd003",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Hnd003"
    );
    const originalOpen = fs.open.bind(fs);
    let injectionEnabled = false;
    let stagingOpenCount = 0;
    let parentCloseCalls = 0;
    let stagingCloseCalls = 0;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (injectionEnabled && String(target) === dir) {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(async () => {
          parentCloseCalls += 1;
          await close();
        });
      }
      if (injectionEnabled && String(target) === stagingPath) {
        stagingOpenCount += 1;
        if (stagingOpenCount === 2) {
          vi.spyOn(handle, "stat").mockRejectedValue(
            new Error("injected handed-off staging validation failure")
          );
          const close = handle.close.bind(handle);
          vi.spyOn(handle, "close").mockImplementation(async () => {
            stagingCloseCalls += 1;
            await close();
            throw new Error("injected handed-off staging close failure");
          });
        }
      }
      return handle;
    });

    const failure = await recoverJsonlAuditRotationStaging(
      filePath,
      "Hnd003",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        beforeMutation: () => {
          injectionEnabled = true;
        }
      }
    ).catch((error: unknown) => error);

    expect(stagingOpenCount).toBe(3);
    expect(parentCloseCalls).toBe(1);
    expect(stagingCloseCalls).toBe(1);
    expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
    expect(failure).toMatchObject({
      message: "injected handed-off staging validation failure",
      details: {
        stage: "candidate_open",
        mutationState: "not_started",
        recoveryHandlesClosed: false,
        recoveryHandleWarning: expect.stringContaining(
          "injected handed-off staging close failure"
        ),
        coordinationLockReleased: true
      }
    });
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
  });

  it("reverses both full-rollback renames after an archive-step failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await writePrivateAuditGeneration(rotatedPath, "original-current\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix011",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix011"
    );

    await expect(recoverJsonlAuditRotationStaging(
      filePath,
      "Fix011",
      "rollback_full_rotation",
      readiness.recoveryFingerprint!,
      {
        afterArchiveRestore: () => {
          throw new Error("injected full rollback archive failure");
        }
      }
    )).rejects.toThrow("injected full rollback archive failure");

    await expect(fs.access(filePath)).rejects.toThrow();
    expect(await fs.readFile(rotatedPath, "utf8")).toBe("original-current\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
  });

  it("applies full recovery directory durability and reports sync uncertainty", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix012",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix012"
    );
    const originalOpen = fs.open.bind(fs);
    const syncPaths: string[] = [];
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      vi.spyOn(handle, "sync").mockImplementation(async () => {
        syncPaths.push(String(target));
      });
      return handle;
    });

    const result = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fix012",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      { durability: "full" }
    );

    expect(result.durabilityCompleted).toBe(true);
    expect(syncPaths).toEqual(
      process.platform === "win32" ? [] : [stagingPath, dir]
    );
    vi.restoreAllMocks();

    if (process.platform !== "win32") {
      const uncertainFile = path.join(dir, "uncertain.jsonl");
      await writePrivateAuditGeneration(uncertainFile, "current-record\n");
      const uncertainStaging = await createAuditRotationStagingFixture(
        uncertainFile,
        "Fix013",
        "previous-archive\n"
      );
      const uncertainReadiness = await inspectJsonlAuditRotationRecovery(
        uncertainFile,
        "Fix013"
      );
      const openWithFailure = fs.open.bind(fs);
      vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
        const handle = await openWithFailure(target, flags, mode);
        if (String(target) === uncertainStaging) {
          vi.spyOn(handle, "sync").mockRejectedValue(
            new Error("injected staging sync failure")
          );
        }
        return handle;
      });

      const uncertain = await recoverJsonlAuditRotationStaging(
        uncertainFile,
        "Fix013",
        "restore_previous_archive",
        uncertainReadiness.recoveryFingerprint!,
        { durability: "full" }
      );

      expect(uncertain).toMatchObject({
        recovered: true,
        mutationPerformed: true,
        stagingRemoved: false,
        durabilityCompleted: false,
        residualStagingPath: uncertainStaging,
        warning: expect.stringContaining("injected staging sync failure")
      });
      expect(await fs.readdir(uncertainStaging)).toEqual([]);
    }
  });

  it("rejects a wrong-object staging rmdir that reports success", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix014"
    );
    const detachedPath = `${stagingPath}.detached`;
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix014"
    );
    const originalRmdir = fs.rmdir.bind(fs);
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      if (path.basename(String(target)) === path.basename(stagingPath)) {
        await fs.rename(stagingPath, detachedPath);
        await fs.mkdir(stagingPath, { mode: 0o700 });
        await originalRmdir(target, options);
        return;
      }
      await originalRmdir(target, options);
    });

    await expect(recoverJsonlAuditRotationStaging(
      filePath,
      "Fix014",
      "cleanup_empty_staging",
      readiness.recoveryFingerprint!
    )).rejects.toThrow("changed during empty recovery cleanup");

    expect(await fs.readdir(detachedPath)).toEqual([]);
    await expect(fs.access(stagingPath)).rejects.toThrow();
  });

  it("restores an opaque staged symlink without following its target", async () => {
    if (process.platform === "win32") {
      return;
    }
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const victimPath = path.join(dir, "victim.txt");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    await fs.writeFile(victimPath, "victim-content\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix015"
    );
    await fs.symlink(victimPath, path.join(stagingPath, "previous"));
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix015"
    );

    const result = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fix015",
      "restore_previous_archive",
      readiness.recoveryFingerprint!
    );

    expect(result.recovered).toBe(true);
    expect((await fs.lstat(rotatedPath)).isSymbolicLink()).toBe(true);
    expect(await fs.readlink(rotatedPath)).toBe(victimPath);
    expect(await fs.readFile(victimPath, "utf8")).toBe("victim-content\n");
    await expect(fs.access(stagingPath)).rejects.toThrow();
  });

  it("rejects a wrong-object archive rename that reports success", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix016",
      "previous-archive\n"
    );
    const previousPath = path.join(stagingPath, "previous");
    const detachedPath = path.join(stagingPath, "detached-previous");
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix016"
    );
    const originalRename = fs.rename.bind(fs);
    let injected = false;
    vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
      if (
        !injected
        && path.basename(String(source)) === "previous"
        && path.basename(String(destination)) === path.basename(rotatedPath)
      ) {
        injected = true;
        await originalRename(previousPath, detachedPath);
        await fs.writeFile(previousPath, "replacement-archive\n", { mode: 0o600 });
      }
      await originalRename(source, destination);
    });

    const rollbackFailure = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fix016",
      "restore_previous_archive",
      readiness.recoveryFingerprint!
    ).catch((error: unknown) => error);

    expect(rollbackFailure).toBeInstanceOf(
      JsonlAuditRotationStagingRecoveryError
    );
    expect(rollbackFailure).toMatchObject({
      message: expect.stringContaining(
        "could not restore its initial namespace"
      ),
      details: {
        stage: "rollback",
        mutationState: "uncertain",
        rollbackAttempted: true,
        rollbackCompleted: false,
        recoveryFingerprint: readiness.recoveryFingerprint,
        recoveryHandlesClosed: true,
        coordinationLockAcquired: true,
        coordinationLockReleased: true,
        postFailureObservationCompleted: true,
        postFailureObservation: {
          observedWhileCoordinationLockHeld: true,
          assessment: "invalid_staging_state",
          eligible: false,
          currentGeneration: {
            entryPath: filePath,
            exists: true,
            entryType: "regular_file"
          },
          rotatedGeneration: {
            entryPath: rotatedPath,
            exists: true,
            entryType: "regular_file"
          },
          staging: {
            stagingId: "Fix016",
            stagingPath,
            exists: true,
            layout: "unknown",
            entryCount: 1
          }
        }
      }
    });

    expect(injected).toBe(true);
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(rotatedPath, "utf8")).toBe("replacement-archive\n");
    expect(await fs.readFile(detachedPath, "utf8")).toBe("previous-archive\n");
  });

  it("reports full parent-sync uncertainty after logical recovery completes", async () => {
    if (process.platform === "win32") {
      return;
    }
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix017",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix017"
    );
    const originalOpen = fs.open.bind(fs);
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (String(target) === dir) {
        vi.spyOn(handle, "sync").mockRejectedValue(
          new Error("injected parent sync failure")
        );
      }
      return handle;
    });

    const result = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fix017",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      { durability: "full" }
    );

    expect(result).toMatchObject({
      recovered: true,
      mutationPerformed: true,
      stagingRemoved: true,
      durabilityCompleted: false,
      warning: expect.stringContaining("injected parent sync failure")
    });
    expect(await fs.readFile(rotatedPath, "utf8")).toBe("previous-archive\n");
    await expect(fs.access(stagingPath)).rejects.toThrow();
  });

  it("rejects a copied-owner lock replacement before recovery mutation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fix019",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix019"
    );
    const lockPath = getJsonlAuditLockPath(filePath);
    const detachedLockPath = `${lockPath}.detached`;

    try {
      const lockReplacementError = await recoverJsonlAuditRotationStaging(
        filePath,
        "Fix019",
        "restore_previous_archive",
        readiness.recoveryFingerprint!,
        {
          beforeMutation: async () => {
            await fs.rename(lockPath, detachedLockPath);
            await fs.mkdir(lockPath, { mode: 0o700 });
            const replacementOwnerPath = path.join(lockPath, "owner.json");
            await fs.copyFile(
              path.join(detachedLockPath, "owner.json"),
              replacementOwnerPath
            );
            await fs.chmod(replacementOwnerPath, 0o600);
          }
        }
      ).catch((error: unknown) => error);

      expect(lockReplacementError).toBeInstanceOf(
        JsonlAuditRotationStagingRecoveryError
      );
      expect(lockReplacementError).toMatchObject({
        message: "Audit file lock changed during rotation staging recovery.",
        details: {
          stage: "locked_revalidation",
          mutationState: "not_started",
          rollbackAttempted: false,
          recoveryFingerprint: readiness.recoveryFingerprint,
          coordinationLockPath: lockPath,
          coordinationLockAcquired: true,
          coordinationLockReleased: false,
          residualCoordinationLockPath: lockPath,
          coordinationLockWarning: expect.stringContaining(
            "Audit file lock changed"
          ),
          postFailureObservationCompleted: false,
          postFailureObservationWarning: expect.stringContaining(
            "Audit file lock changed during post-failure"
          )
        }
      });

      expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
      expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
        .toBe("previous-archive\n");
      await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
    } finally {
      await fs.rm(lockPath, { recursive: true, force: true });
      await fs.rm(detachedLockPath, { recursive: true, force: true });
    }
  });

  it("keeps the primary gate error with candidate-close and lock residue evidence", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fail03",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fail03"
    );
    const lockPath = getJsonlAuditLockPath(filePath);
    const detachedLockPath = `${lockPath}.detached`;
    const originalOpen = fs.open.bind(fs);
    let injectionEnabled = false;
    let candidateStarted = false;
    let lockReplaced = false;
    let candidateCloseWrapped = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (
        injectionEnabled
        && !candidateStarted
        && String(target) === dir
      ) {
        candidateStarted = true;
        candidateCloseWrapped = true;
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(async () => {
          await close();
          throw new Error("injected combined candidate close failure");
        });
      } else if (
        candidateStarted
        && !lockReplaced
        && path.basename(String(target)) === path.basename(filePath)
      ) {
        await fs.rename(lockPath, detachedLockPath);
        await fs.mkdir(lockPath, { mode: 0o700 });
        const replacementOwnerPath = path.join(lockPath, "owner.json");
        await fs.copyFile(
          path.join(detachedLockPath, "owner.json"),
          replacementOwnerPath
        );
        await fs.chmod(replacementOwnerPath, 0o600);
        lockReplaced = true;
      }
      return handle;
    });

    try {
      const failure = await recoverJsonlAuditRotationStaging(
        filePath,
        "Fail03",
        "restore_previous_archive",
        readiness.recoveryFingerprint!,
        {
          beforeMutation: () => {
            injectionEnabled = true;
          }
        }
      ).catch((error: unknown) => error);

      expect(candidateCloseWrapped).toBe(true);
      expect(lockReplaced).toBe(true);
      expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
      expect(failure).toMatchObject({
        message: "Audit file lock changed during rotation staging recovery.",
        details: {
          stage: "candidate_revalidation",
          mutationState: "not_started",
          rollbackAttempted: false,
          recoveryHandlesClosed: false,
          recoveryHandleWarning: expect.stringContaining(
            "injected combined candidate close failure"
          ),
          coordinationLockPath: lockPath,
          coordinationLockAcquired: true,
          coordinationLockReleased: false,
          residualCoordinationLockPath: lockPath,
          coordinationLockWarning: expect.stringContaining(
            "Audit file lock changed"
          )
        }
      });
      expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
      expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
        .toBe("previous-archive\n");
    } finally {
      await fs.rm(lockPath, { recursive: true, force: true });
      await fs.rm(detachedLockPath, { recursive: true, force: true });
    }
  });

  it("serializes recovery with same-process audit writers before lock acquisition", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "baseline\n");
    await createAuditRotationStagingFixture(filePath, "Fix018");
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fix018"
    );
    let enterMutation!: () => void;
    const entered = new Promise<void>((resolve) => {
      enterMutation = resolve;
    });
    let continueMutation!: () => void;
    const blocked = new Promise<void>((resolve) => {
      continueMutation = resolve;
    });
    const recovery = recoverJsonlAuditRotationStaging(
      filePath,
      "Fix018",
      "cleanup_empty_staging",
      readiness.recoveryFingerprint!,
      {
        beforeMutation: async () => {
          enterMutation();
          await blocked;
        }
      }
    );
    await entered;
    const mkdir = vi.spyOn(fs, "mkdir");
    let recordSettled = false;
    const record = new JsonlAuditSink(filePath).record(
      createRequestedAuditEvent(dir, "serialized-read")
    ).finally(() => {
      recordSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(recordSettled).toBe(false);
    expect(mkdir).not.toHaveBeenCalled();
    continueMutation();
    await recovery;
    await record;
    expect(mkdir).toHaveBeenCalled();
    expect(await fs.readFile(filePath, "utf8"))
      .toContain("serialized-read");
  });

  it("preserves committed recovery evidence when coordination lock release fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Life01",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Life01"
    );
    const lockPath = getJsonlAuditLockPath(filePath);
    const detachedLockPath = `${lockPath}.detached`;

    try {
      const result = await recoverJsonlAuditRotationStaging(
        filePath,
        "Life01",
        "restore_previous_archive",
        readiness.recoveryFingerprint!,
        {
          beforeStagingRemoval: async () => {
            await fs.rename(lockPath, detachedLockPath);
            await fs.mkdir(lockPath, { mode: 0o700 });
            const replacementOwnerPath = path.join(lockPath, "owner.json");
            await fs.copyFile(
              path.join(detachedLockPath, "owner.json"),
              replacementOwnerPath
            );
            await fs.chmod(replacementOwnerPath, 0o600);
          }
        }
      );

      expect(result).toMatchObject({
        performedAction: "restore_previous_archive",
        recovered: true,
        mutationPerformed: true,
        stagingRemoved: false,
        residualStagingPath: stagingPath,
        recoveryHandlesClosed: true,
        coordinationLockPath: lockPath,
        coordinationLockReleased: false,
        residualCoordinationLockPath: lockPath,
        warning: expect.stringContaining(
          "recovered staging could not be safely removed"
        ),
        coordinationLockWarning: expect.stringContaining(
          "coordination lock release failed: Audit file lock changed before release"
        )
      });
      expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
      expect(await fs.readFile(rotatedPath, "utf8"))
        .toBe("previous-archive\n");
      expect(await fs.readdir(stagingPath)).toEqual([]);
    } finally {
      await fs.rm(lockPath, { recursive: true, force: true });
      await fs.rm(detachedLockPath, { recursive: true, force: true });
    }
  });

  it("bounds pending recovery coordination lock lifecycle settlement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Life11",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Life11"
    );
    const injection = injectAuditLockLifecycleHandlePendingClose(filePath);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const recovery = recoverJsonlAuditRotationStaging(
      filePath,
      "Life11",
      "restore_previous_archive",
      readiness.recoveryFingerprint!
    );

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await Promise.all(injection.otherCloseCompletions);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        recovery,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.rejectClose(
        new Error("late recovery lifecycle close rejection")
      );
      const result = settlement.settled
        ? settlement.value
        : await recovery;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.lockDirectoryCloseCount).toBe(1);
      expect(injection.parentCloseCount).toBe(1);
      expect(result).toMatchObject({
        performedAction: "restore_previous_archive",
        recovered: true,
        mutationPerformed: true,
        stagingRemoved: true,
        recoveryHandlesClosed: true,
        coordinationLockReleased: false,
        coordinationLockWarning:
          "coordination lock release failed: audit lock lifecycle descriptor close timed out after 5000 ms"
      });
      expect(result.residualCoordinationLockPath).toBeUndefined();
      expect(result.coordinationLockWarning).not.toContain(
        "coordination lock handle abandonment failed"
      );
      expect(unhandled).toEqual([]);
      await expect(fs.access(getJsonlAuditLockPath(filePath))).rejects.toThrow();
      expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
      expect(await fs.readFile(rotatedPath, "utf8"))
        .toBe("previous-archive\n");
      await expect(fs.access(stagingPath)).rejects.toThrow();
    } finally {
      injection.resolveClose();
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
      await fs.rm(getJsonlAuditLockPath(filePath), {
        recursive: true,
        force: true
      });
    }
  });

  it("preserves committed recovery evidence when candidate handle close fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Life02",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Life02"
    );
    const originalOpen = fs.open.bind(fs);
    let stagingOpenCount = 0;
    let parentCloseCalls = 0;
    let candidateCloseCompletion: Promise<void> | undefined;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (String(target) === dir) {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(async () => {
          parentCloseCalls += 1;
          await close();
        });
      }
      if (String(target) === stagingPath) {
        stagingOpenCount += 1;
        if (stagingOpenCount === 3) {
          const close = handle.close.bind(handle);
          vi.spyOn(handle, "close").mockImplementation(() => {
            candidateCloseCompletion = close();
            throw new Error("injected recovery handle close failure");
          });
        }
      }
      return handle;
    });

    const result = await recoverJsonlAuditRotationStaging(
      filePath,
      "Life02",
      "restore_previous_archive",
      readiness.recoveryFingerprint!
    );
    await candidateCloseCompletion;

    expect(stagingOpenCount).toBe(3);
    expect(parentCloseCalls).toBe(1);
    expect(result).toMatchObject({
      performedAction: "restore_previous_archive",
      recovered: true,
      mutationPerformed: true,
      stagingRemoved: true,
      recoveryHandlesClosed: false,
      recoveryHandleWarning: expect.stringContaining(
        "injected recovery handle close failure"
      ),
      coordinationLockReleased: true
    });
    await expect(fs.access(stagingPath)).rejects.toThrow();
  });

  it("bounds pending rotation recovery handle close settlement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Life08",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Life08"
    );
    const injection = injectAuditHandlePendingClose(stagingPath, 3, dir);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const recovery = recoverJsonlAuditRotationStaging(
      filePath,
      "Life08",
      "restore_previous_archive",
      readiness.recoveryFingerprint!
    );

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        recovery,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.rejectClose(new Error("late recovery close rejection"));
      await injection.actualCloseCompletion;
      const result = settlement.settled
        ? settlement.value
        : await recovery;
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedOpenCount).toBe(3);
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.observedCloseCount).toBe(1);
      expect(result).toMatchObject({
        performedAction: "restore_previous_archive",
        recovered: true,
        mutationPerformed: true,
        stagingRemoved: true,
        recoveryHandlesClosed: false,
        recoveryHandleWarning:
          "recovery descriptor close failed: recovery descriptor close timed out after 5000 ms",
        coordinationLockReleased: true
      });
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

  it("preserves a mutation primary across recovery handle close timeout", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Life09",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Life09"
    );
    const injection = injectAuditHandlePendingClose(stagingPath, 3, dir);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const failurePromise = recoverJsonlAuditRotationStaging(
      filePath,
      "Life09",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        afterArchiveRestore: () => {
          throw new Error("primary recovery timeout mutation failure");
        }
      }
    ).catch((error: unknown) => error);

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        failurePromise,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.resolveClose();
      const failure = settlement.settled
        ? settlement.value
        : await failurePromise;

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.observedCloseCount).toBe(1);
      expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
      expect(failure).toMatchObject({
        message: "primary recovery timeout mutation failure",
        details: {
          stage: "mutation",
          mutationState: "rolled_back",
          rollbackAttempted: true,
          rollbackCompleted: true,
          recoveryHandlesClosed: false,
          recoveryHandleWarning:
            "recovery descriptor close failed: recovery descriptor close timed out after 5000 ms",
          coordinationLockReleased: true,
          postFailureObservationCompleted: true
        }
      });
      expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
      expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
        .toBe("previous-archive\n");
      await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("preserves candidate-open primary across handed-off close timeout", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Life10",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Life10"
    );
    const injection = injectAuditHandlePendingClose(
      stagingPath,
      3,
      dir,
      "primary pending candidate-open validation failure"
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const failurePromise = recoverJsonlAuditRotationStaging(
      filePath,
      "Life10",
      "restore_previous_archive",
      readiness.recoveryFingerprint!
    ).catch((error: unknown) => error);

    try {
      await injection.closeStarted;
      await injection.actualCloseCompletion;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settlement = await observeAuditPromiseAfterCloseDeadline(
        failurePromise,
        Promise.resolve()
      );
      const settledWithinBound = settlement.settled;
      injection.resolveClose();
      const failure = settlement.settled
        ? settlement.value
        : await failurePromise;

      expect(settledWithinBound).toBe(true);
      expect(injection.selectedOpenCount).toBe(4);
      expect(injection.selectedCloseCount).toBe(1);
      expect(injection.observedCloseCount).toBe(1);
      expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
      expect(failure).toMatchObject({
        message: "primary pending candidate-open validation failure",
        details: {
          stage: "candidate_open",
          mutationState: "not_started",
          rollbackAttempted: false,
          recoveryHandlesClosed: false,
          recoveryHandleWarning:
            "recovery descriptor close failed: recovery descriptor close timed out after 5000 ms",
          coordinationLockReleased: true,
          postFailureObservationCompleted: true
        }
      });
      expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
      expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
        .toBe("previous-archive\n");
      await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
    } finally {
      injection.resolveClose();
      vi.useRealTimers();
    }
  });

  it("preserves the primary recovery error when candidate handle close also fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Life03",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Life03"
    );
    const originalOpen = fs.open.bind(fs);
    let stagingOpenCount = 0;
    let parentCloseCalls = 0;
    let candidateCloseCompletion: Promise<void> | undefined;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (String(target) === dir) {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(async () => {
          parentCloseCalls += 1;
          await close();
        });
      }
      if (String(target) === stagingPath) {
        stagingOpenCount += 1;
        if (stagingOpenCount === 3) {
          const close = handle.close.bind(handle);
          vi.spyOn(handle, "close").mockImplementation(() => {
            candidateCloseCompletion = close();
            throw new Error("secondary recovery handle close failure");
          });
        }
      }
      return handle;
    });

    const failure = await recoverJsonlAuditRotationStaging(
      filePath,
      "Life03",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        afterArchiveRestore: () => {
          throw new Error("primary recovery mutation failure");
        }
      }
    ).catch((error: unknown) => error);
    await candidateCloseCompletion;

    expect(stagingOpenCount).toBe(4);
    expect(parentCloseCalls).toBe(1);
    expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
    expect(failure).toMatchObject({
      message: "primary recovery mutation failure",
      details: {
        stage: "mutation",
        mutationState: "rolled_back",
        rollbackAttempted: true,
        rollbackCompleted: true,
        recoveryHandlesClosed: false,
        recoveryHandleWarning: expect.stringContaining(
          "secondary recovery handle close failure"
        ),
        coordinationLockReleased: true
      }
    });
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
  });

  it("preserves candidate-open validation errors when its close also fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Life07",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Life07"
    );
    const originalOpen = fs.open.bind(fs);
    let stagingOpenCount = 0;
    let parentCloseCalls = 0;
    let candidateCloseCompletion: Promise<void> | undefined;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (String(target) === dir) {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(async () => {
          parentCloseCalls += 1;
          await close();
        });
      }
      if (String(target) === stagingPath) {
        stagingOpenCount += 1;
        if (stagingOpenCount === 3) {
          vi.spyOn(handle, "stat").mockRejectedValue(
            new Error("primary candidate directory validation failure")
          );
          const close = handle.close.bind(handle);
          vi.spyOn(handle, "close").mockImplementation(() => {
            candidateCloseCompletion = close();
            throw new Error("secondary candidate-open close failure");
          });
        }
      }
      return handle;
    });

    const failure = await recoverJsonlAuditRotationStaging(
      filePath,
      "Life07",
      "restore_previous_archive",
      readiness.recoveryFingerprint!
    ).catch((error: unknown) => error);
    await candidateCloseCompletion;

    expect(stagingOpenCount).toBe(4);
    expect(parentCloseCalls).toBe(1);
    expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
    expect(failure).toMatchObject({
      message: "primary candidate directory validation failure",
      details: {
        stage: "candidate_open",
        mutationState: "not_started",
        recoveryHandlesClosed: false,
        recoveryHandleWarning: expect.stringContaining(
          "secondary candidate-open close failure"
        ),
        coordinationLockReleased: true
      }
    });
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
  });

  it("bounds recovery candidate directory stream close before mutation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Str001",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Str001"
    );
    const injection = injectAuditResolvedDirectoryStreamPendingClose(
      stagingPath,
      3,
      undefined,
      false
    );

    const settlement = await captureAuditPendingCloseFailure(
      () => recoverJsonlAuditRotationStaging(
        filePath,
        "Str001",
        "restore_previous_archive",
        readiness.recoveryFingerprint!,
        {
          beforeMutation: () => {
            injection.enable();
          }
        }
      ),
      injection,
      "late recovery candidate stream close rejection"
    );

    expect(settlement.settledWithinBound).toBe(true);
    expect(injection.matchingStreamCount).toBeGreaterThanOrEqual(3);
    expect(injection.selectedCloseCount).toBe(1);
    expect(settlement.failure).toBeInstanceOf(
      JsonlAuditRotationStagingRecoveryError
    );
    expect(settlement.failure).toMatchObject({
      message: "recovery descriptor close timed out after 5000 ms",
      details: {
        stage: "candidate_open",
        mutationState: "not_started",
        rollbackAttempted: false,
        recoveryFingerprint: readiness.recoveryFingerprint,
        recoveryHandlesClosed: true,
        coordinationLockAcquired: true,
        coordinationLockReleased: true,
        postFailureObservationCompleted: true
      }
    });
    expect(settlement.unhandled).toEqual([]);
    expect(JSON.stringify(settlement.failure)).not.toContain(
      "late recovery candidate stream close rejection"
    );
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
  });

  it("preserves recovery candidate stream read primary across close timeout", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Str002",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Str002"
    );
    const injection = injectAuditResolvedDirectoryStreamPendingClose(
      stagingPath,
      3,
      "primary recovery candidate stream read failure",
      false
    );

    const settlement = await captureAuditPendingCloseFailure(
      () => recoverJsonlAuditRotationStaging(
        filePath,
        "Str002",
        "restore_previous_archive",
        readiness.recoveryFingerprint!,
        {
          beforeMutation: () => {
            injection.enable();
          }
        }
      ),
      injection,
      "late recovery candidate primary close rejection"
    );

    expect(settlement.settledWithinBound).toBe(true);
    expect(injection.matchingStreamCount).toBeGreaterThanOrEqual(3);
    expect(injection.selectedCloseCount).toBe(1);
    expect(settlement.failure).toBeInstanceOf(
      JsonlAuditRotationStagingRecoveryError
    );
    expect(settlement.failure).toMatchObject({
      message: "primary recovery candidate stream read failure",
      details: {
        stage: "candidate_open",
        mutationState: "not_started",
        rollbackAttempted: false,
        recoveryHandlesClosed: true,
        coordinationLockReleased: true,
        postFailureObservationCompleted: true
      }
    });
    expect(settlement.unhandled).toEqual([]);
    expect(JSON.stringify(settlement.failure)).not.toContain(
      "late recovery candidate primary close rejection"
    );
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
  });

  it("rolls back recovery when committed-generation scan close times out", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Str003",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Str003"
    );
    const injection = injectAuditResolvedDirectoryStreamPendingClose(
      stagingPath,
      1,
      undefined,
      false
    );

    const settlement = await captureAuditPendingCloseFailure(
      () => recoverJsonlAuditRotationStaging(
        filePath,
        "Str003",
        "restore_previous_archive",
        readiness.recoveryFingerprint!,
        {
          afterArchiveRestore: () => {
            injection.enable();
          }
        }
      ),
      injection,
      "late committed-generation stream close rejection"
    );

    expect(settlement.settledWithinBound).toBe(true);
    expect(injection.matchingStreamCount).toBeGreaterThanOrEqual(1);
    expect(injection.selectedCloseCount).toBe(1);
    expect(settlement.failure).toBeInstanceOf(
      JsonlAuditRotationStagingRecoveryError
    );
    expect(settlement.failure).toMatchObject({
      message: "recovery descriptor close timed out after 5000 ms",
      details: {
        stage: "mutation",
        mutationState: "rolled_back",
        rollbackAttempted: true,
        rollbackCompleted: true,
        recoveryFingerprint: readiness.recoveryFingerprint,
        recoveryHandlesClosed: true,
        coordinationLockAcquired: true,
        coordinationLockReleased: true,
        postFailureObservationCompleted: true
      }
    });
    expect(settlement.unhandled).toEqual([]);
    expect(JSON.stringify(settlement.failure)).not.toContain(
      "late committed-generation stream close rejection"
    );
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
  });

  it("retains committed recovery residue when cleanup scan close times out", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Str004",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Str004"
    );
    const injection = injectAuditResolvedDirectoryStreamPendingClose(
      stagingPath,
      1,
      undefined,
      false
    );

    const settlement = await captureAuditPendingCloseFailure(
      () => recoverJsonlAuditRotationStaging(
        filePath,
        "Str004",
        "restore_previous_archive",
        readiness.recoveryFingerprint!,
        {
          beforeStagingRemoval: () => {
            injection.enable();
          }
        }
      ),
      injection,
      "late recovered-staging cleanup stream close rejection"
    );

    expect(settlement.settledWithinBound).toBe(true);
    expect(injection.matchingStreamCount).toBeGreaterThanOrEqual(1);
    expect(injection.selectedCloseCount).toBe(1);
    expect(settlement.failure).toMatchObject({
      performedAction: "restore_previous_archive",
      recovered: true,
      mutationPerformed: true,
      stagingRemoved: false,
      durabilityCompleted: true,
      residualStagingPath: stagingPath,
      warning:
        "recovered staging could not be safely removed: recovery descriptor close timed out after 5000 ms",
      recoveryHandlesClosed: true,
      coordinationLockReleased: true
    });
    expect(settlement.unhandled).toEqual([]);
    expect(JSON.stringify(settlement.failure)).not.toContain(
      "late recovered-staging cleanup stream close rejection"
    );
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(rotatedPath, "utf8"))
      .toBe("previous-archive\n");
    expect(await fs.readdir(stagingPath)).toEqual([]);
  });

  it("preserves committed recovery when a close reason is unprintable", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fmt001",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fmt001"
    );
    const originalOpen = fs.open.bind(fs);
    let injectionEnabled = false;
    let stagingOpenCount = 0;
    let parentCloseCalls = 0;
    let closeCompletion: Promise<void> | undefined;
    const hostileReason = {
      [Symbol.toPrimitive]() {
        throw new Error("injected error reason formatter failure");
      }
    };
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (injectionEnabled && String(target) === dir) {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(async () => {
          parentCloseCalls += 1;
          await close();
        });
      }
      if (injectionEnabled && String(target) === stagingPath) {
        stagingOpenCount += 1;
        if (stagingOpenCount === 2) {
          const close = handle.close.bind(handle);
          vi.spyOn(handle, "close").mockImplementation(() => {
            closeCompletion = close();
            throw hostileReason;
          });
        }
      }
      return handle;
    });

    const result = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fmt001",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        beforeMutation: () => {
          injectionEnabled = true;
        }
      }
    );
    await closeCompletion;

    expect(parentCloseCalls).toBe(1);
    expect(result).toMatchObject({
      performedAction: "restore_previous_archive",
      recovered: true,
      mutationPerformed: true,
      stagingRemoved: true,
      recoveryHandlesClosed: false,
      recoveryHandleWarning:
        "recovery descriptor close failed: unavailable error detail",
      coordinationLockReleased: true
    });
  });

  it("preserves a primary rollback error with an unreadable Error message", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fmt002",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fmt002"
    );
    const originalOpen = fs.open.bind(fs);
    let injectionEnabled = false;
    let stagingOpenCount = 0;
    let closeCompletion: Promise<void> | undefined;
    const hostileReason = new Error("placeholder");
    Object.defineProperty(hostileReason, "message", {
      configurable: true,
      get() {
        throw new Error("injected Error.message getter failure");
      }
    });
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (injectionEnabled && String(target) === stagingPath) {
        stagingOpenCount += 1;
        if (stagingOpenCount === 2) {
          const close = handle.close.bind(handle);
          vi.spyOn(handle, "close").mockImplementation(() => {
            closeCompletion = close();
            throw hostileReason;
          });
        }
      }
      return handle;
    });

    const failure = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fmt002",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        beforeMutation: () => {
          injectionEnabled = true;
        },
        afterArchiveRestore: () => {
          throw new Error("primary formatting-independent mutation failure");
        }
      }
    ).catch((error: unknown) => error);
    await closeCompletion;

    expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
    expect(failure).toMatchObject({
      message: "primary formatting-independent mutation failure",
      details: {
        stage: "mutation",
        mutationState: "rolled_back",
        rollbackAttempted: true,
        rollbackCompleted: true,
        recoveryHandlesClosed: false,
        recoveryHandleWarning:
          "recovery descriptor close failed: unavailable error detail",
        coordinationLockReleased: true
      }
    });
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
  });

  it("single-lines and bounds recovery close error summaries", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fmt003",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fmt003"
    );
    const originalOpen = fs.open.bind(fs);
    let injectionEnabled = false;
    let stagingOpenCount = 0;
    let closeCompletion: Promise<void> | undefined;
    const hostileMessage = `line1\nline2\0${"x".repeat(600)}`;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (injectionEnabled && String(target) === stagingPath) {
        stagingOpenCount += 1;
        if (stagingOpenCount === 2) {
          const close = handle.close.bind(handle);
          vi.spyOn(handle, "close").mockImplementation(() => {
            closeCompletion = close();
            throw new Error(hostileMessage);
          });
        }
      }
      return handle;
    });

    const result = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fmt003",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        beforeMutation: () => {
          injectionEnabled = true;
        }
      }
    );
    await closeCompletion;

    const prefix = "recovery descriptor close failed: ";
    const warning = result.recoveryHandleWarning!;
    const summary = warning.slice(prefix.length);
    expect(warning.startsWith(prefix)).toBe(true);
    expect(summary).toHaveLength(512);
    expect(summary.startsWith("line1?line2?")).toBe(true);
    expect(summary.endsWith("...")).toBe(true);
    expect(summary).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u);
  });

  it("uses a stable fallback for an unprintable primary recovery reason", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await writePrivateAuditGeneration(filePath, "current-record\n");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Fmt004",
      "previous-archive\n"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Fmt004"
    );
    const hostileReason = {
      [Symbol.toPrimitive]() {
        throw new Error("injected primary formatter failure");
      }
    };

    const failure = await recoverJsonlAuditRotationStaging(
      filePath,
      "Fmt004",
      "restore_previous_archive",
      readiness.recoveryFingerprint!,
      {
        beforeMutation: () => {
          throw hostileReason;
        }
      }
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(JsonlAuditRotationStagingRecoveryError);
    expect(failure).toMatchObject({
      message: "unavailable error detail",
      details: {
        stage: "locked_revalidation",
        mutationState: "not_started",
        rollbackAttempted: false,
        coordinationLockAcquired: true,
        coordinationLockReleased: true
      }
    });
    expect(await fs.readFile(filePath, "utf8")).toBe("current-record\n");
    expect(await fs.readFile(path.join(stagingPath, "previous"), "utf8"))
      .toBe("previous-archive\n");
  });

  it("preserves empty cleanup evidence when lock directory contraction fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Life04"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Life04"
    );
    const lockPath = getJsonlAuditLockPath(filePath);
    const originalRmdir = fs.rmdir.bind(fs);
    let injected = false;
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      if (
        !injected
        && path.basename(String(target)) === path.basename(lockPath)
      ) {
        injected = true;
        throw new Error("injected coordination lock contraction failure");
      }
      await originalRmdir(target, options);
    });

    try {
      const result = await recoverJsonlAuditRotationStaging(
        filePath,
        "Life04",
        "cleanup_empty_staging",
        readiness.recoveryFingerprint!
      );

      expect(injected).toBe(true);
      expect(result).toMatchObject({
        performedAction: "cleanup_empty_staging",
        recovered: true,
        mutationPerformed: true,
        stagingRemoved: true,
        recoveryHandlesClosed: true,
        coordinationLockPath: lockPath,
        coordinationLockReleased: false,
        residualCoordinationLockPath: lockPath,
        coordinationLockWarning: expect.stringContaining(
          "injected coordination lock contraction failure"
        )
      });
      await expect(fs.access(stagingPath)).rejects.toThrow();
    } finally {
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  });

  it("does not invent a lock residual after a post-rmdir release failure", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const stagingPath = await createAuditRotationStagingFixture(
      filePath,
      "Life06"
    );
    const readiness = await inspectJsonlAuditRotationRecovery(
      filePath,
      "Life06"
    );
    const lockPath = getJsonlAuditLockPath(filePath);
    const originalRmdir = fs.rmdir.bind(fs);
    let injected = false;
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      if (
        !injected
        && path.basename(String(target)) === path.basename(lockPath)
      ) {
        injected = true;
        await originalRmdir(target, options);
        throw new Error("injected post-rmdir lock release failure");
      }
      await originalRmdir(target, options);
    });

    const result = await recoverJsonlAuditRotationStaging(
      filePath,
      "Life06",
      "cleanup_empty_staging",
      readiness.recoveryFingerprint!
    );

    expect(injected).toBe(true);
    expect(result).toMatchObject({
      performedAction: "cleanup_empty_staging",
      stagingRemoved: true,
      coordinationLockPath: lockPath,
      coordinationLockReleased: false,
      coordinationLockWarning: expect.stringContaining(
        "injected post-rmdir lock release failure"
      )
    });
    expect(result.residualCoordinationLockPath).toBeUndefined();
    await expect(fs.access(stagingPath)).rejects.toThrow();
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it("aggregates missing no-op lock abandonment and residue inspection failures", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    const originalOpen = fs.open.bind(fs);
    const originalRmdir = fs.rmdir.bind(fs);
    const originalLstat = fs.lstat.bind(fs);
    let releaseFailed = false;
    let lockHandleWrapped = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (
        !lockHandleWrapped
        && path.basename(String(target)) === path.basename(lockPath)
      ) {
        lockHandleWrapped = true;
        const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(async () => {
          await close();
          throw new Error("injected coordination lock abandonment failure");
        });
      }
      return handle;
    });
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      if (
        !releaseFailed
        && path.basename(String(target)) === path.basename(lockPath)
      ) {
        releaseFailed = true;
        throw new Error("injected coordination lock release failure");
      }
      await originalRmdir(target, options);
    });
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (releaseFailed && String(target) === lockPath) {
        const error = new Error("injected lock residue inspection failure") as
          NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      }
      return originalLstat(target, options);
    });

    try {
      const result = await recoverJsonlAuditRotationStaging(
        filePath,
        "Life05",
        "cleanup_empty_staging",
        "0".repeat(32)
      );

      expect(lockHandleWrapped).toBe(true);
      expect(result).toMatchObject({
        existed: false,
        recovered: false,
        mutationPerformed: false,
        recoveryHandlesClosed: true,
        coordinationLockPath: lockPath,
        coordinationLockReleased: false,
        coordinationLockWarning: expect.stringContaining(
          "injected coordination lock release failure"
        )
      });
      expect(result.performedAction).toBeUndefined();
      expect(result.residualCoordinationLockPath).toBeUndefined();
      expect(result.coordinationLockWarning).toContain(
        "injected coordination lock abandonment failure"
      );
      expect(result.coordinationLockWarning).toContain(
        "injected lock residue inspection failure"
      );
    } finally {
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  });

  it("restores current after a failed post-rotation append", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const now = () => new Date("2026-07-22T12:00:00.000Z");
    const firstEvent = createRequestedAuditEvent(dir, "read-1");
    await new JsonlAuditSink(filePath, now).record(firstEvent);
    const baseline = await fs.readFile(filePath, "utf8");
    const maxBytes = Buffer.byteLength(baseline);
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && isJsonlAuditAppendOpen(target, flags, filePath)) {
        injected = true;
        vi.spyOn(handle, "writeFile").mockImplementation(async () => {
          await handle.write(Buffer.from('{"partial":'));
          throw new Error("injected post-rotation append failure");
        });
      }
      return handle;
    });

    await expect(new JsonlAuditSink(
      filePath,
      now,
      maxBytes
    ).record(createRequestedAuditEvent(dir, "read-2")))
      .rejects.toThrow("injected post-rotation append failure");

    expect(injected).toBe(true);
    expect(await fs.readFile(filePath, "utf8")).toBe(baseline);
    await expect(fs.stat(`${filePath}.1`)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await fs.readdir(dir)).filter(
      (entry) => entry.startsWith(".god-code-audit-rotation-")
    )).toEqual([]);
  });

  it("restores current and the previous archive after a failed rotation append", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const now = () => new Date("2026-07-22T12:00:00.000Z");
    await new JsonlAuditSink(filePath, now).record(
      createRequestedAuditEvent(dir, "read-1")
    );
    const baseline = await fs.readFile(filePath, "utf8");
    const oldArchive = "old-archive\n";
    await fs.writeFile(rotatedPath, oldArchive, { mode: 0o600 });
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && isJsonlAuditAppendOpen(target, flags, filePath)) {
        injected = true;
        vi.spyOn(handle, "writeFile").mockImplementation(async () => {
          await handle.write(Buffer.from('{"partial":'));
          throw new Error("injected archived rotation append failure");
        });
      }
      return handle;
    });

    await expect(new JsonlAuditSink(
      filePath,
      now,
      Buffer.byteLength(baseline)
    ).record(createRequestedAuditEvent(dir, "read-2")))
      .rejects.toThrow("injected archived rotation append failure");

    expect(injected).toBe(true);
    expect(await fs.readFile(filePath, "utf8")).toBe(baseline);
    expect(await fs.readFile(rotatedPath, "utf8")).toBe(oldArchive);
    expect((await fs.readdir(dir)).sort()).toEqual([
      "audit.jsonl",
      "audit.jsonl.1"
    ]);
  });

  it("rolls a stable pre-write failure back across the full rotation", async () => {
    if (process.platform === "win32") {
      return;
    }
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const now = () => new Date("2026-07-22T12:00:00.000Z");
    await new JsonlAuditSink(filePath, now).record(
      createRequestedAuditEvent(dir, "read-1")
    );
    const baseline = await fs.readFile(filePath, "utf8");
    const oldArchive = "old-archive\n";
    await fs.writeFile(rotatedPath, oldArchive, { mode: 0o600 });
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && isJsonlAuditAppendOpen(target, flags, filePath)) {
        injected = true;
        vi.spyOn(handle, "chmod").mockRejectedValue(
          new Error("injected post-rotation mode failure")
        );
      }
      return handle;
    });

    await expect(new JsonlAuditSink(
      filePath,
      now,
      Buffer.byteLength(baseline)
    ).record(createRequestedAuditEvent(dir, "read-2")))
      .rejects.toThrow("injected post-rotation mode failure");

    expect(injected).toBe(true);
    expect(await fs.readFile(filePath, "utf8")).toBe(baseline);
    expect(await fs.readFile(rotatedPath, "utf8")).toBe(oldArchive);
    expect((await fs.readdir(dir)).sort()).toEqual([
      "audit.jsonl",
      "audit.jsonl.1"
    ]);
  });

  it("applies the selected durability to a successful append rollback", async () => {
    for (const durability of ["buffered", "data", "full"] as const) {
      const dir = await createTempDir();
      const filePath = path.join(dir, "audit.jsonl");
      const sink = new JsonlAuditSink(
        filePath,
        () => new Date("2026-07-22T12:00:00.000Z"),
        10 * 1024 * 1024,
        [],
        durability
      );
      await sink.record(createRequestedAuditEvent(dir, "read-1"));
      const baseline = await fs.readFile(filePath, "utf8");
      const originalOpen = fs.open.bind(fs);
      let dataSyncCalls = 0;
      let fullSyncCalls = 0;
      let injected = false;
      vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
        const handle = await originalOpen(target, flags, mode);
        if (!injected && isJsonlAuditAppendOpen(target, flags, filePath)) {
          injected = true;
          vi.spyOn(handle, "writeFile").mockImplementation(async () => {
            await handle.write(Buffer.from('{"partial":'));
            throw new Error(`injected ${durability} append failure`);
          });
          vi.spyOn(handle, "datasync").mockImplementation(async () => {
            dataSyncCalls += 1;
          });
          vi.spyOn(handle, "sync").mockImplementation(async () => {
            fullSyncCalls += 1;
          });
        }
        return handle;
      });

      await expect(sink.record(
        createRequestedAuditEvent(dir, "read-2")
      )).rejects.toThrow(`injected ${durability} append failure`);

      expect(await fs.readFile(filePath, "utf8")).toBe(baseline);
      expect(dataSyncCalls).toBe(durability === "data" ? 1 : 0);
      expect(fullSyncCalls).toBe(durability === "full" ? 1 : 0);
      vi.restoreAllMocks();
    }
  });

  it("does not truncate a moved current after a failed append", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const movedPath = path.join(dir, "audit.original.jsonl");
    const sink = new JsonlAuditSink(filePath);
    await sink.record(createRequestedAuditEvent(dir, "read-1"));
    const baseline = await fs.readFile(filePath, "utf8");
    const partial = Buffer.from('{"partial":');
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && isJsonlAuditAppendOpen(target, flags, filePath)) {
        injected = true;
        vi.spyOn(handle, "writeFile").mockImplementation(async () => {
          await handle.write(partial);
          await fs.rename(filePath, movedPath);
          await fs.writeFile(filePath, "replacement\n", { mode: 0o600 });
          throw new Error("injected moved audit append failure");
        });
      }
      return handle;
    });

    await expect(sink.record(
      createRequestedAuditEvent(dir, "read-2")
    )).rejects.toThrow("injected moved audit append failure");

    expect(injected).toBe(true);
    expect(await fs.readFile(filePath, "utf8")).toBe("replacement\n");
    expect(await fs.readFile(movedPath, "utf8")).toBe(
      `${baseline}${partial.toString("utf8")}`
    );
  });

  it("does not truncate growth beyond the failed record bound", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const sink = new JsonlAuditSink(filePath);
    await sink.record(createRequestedAuditEvent(dir, "read-1"));
    const baseline = await fs.readFile(filePath, "utf8");
    const unknownGrowth = Buffer.alloc(4_096, 0x78);
    const originalOpen = fs.open.bind(fs);
    let injected = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (!injected && isJsonlAuditAppendOpen(target, flags, filePath)) {
        injected = true;
        vi.spyOn(handle, "writeFile").mockImplementation(async () => {
          await handle.write(unknownGrowth);
          throw new Error("injected beyond-bound audit append failure");
        });
      }
      return handle;
    });

    await expect(sink.record(
      createRequestedAuditEvent(dir, "read-2")
    )).rejects.toThrow("injected beyond-bound audit append failure");

    expect(injected).toBe(true);
    const content = await fs.readFile(filePath);
    expect(content.subarray(0, Buffer.byteLength(baseline)).toString("utf8")).toBe(
      baseline
    );
    expect(content.subarray(Buffer.byteLength(baseline))).toEqual(unknownGrowth);
  });

  it("revalidates final descriptor capacity after same-inode growth", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const now = () => new Date("2026-07-21T12:00:00.000Z");
    const firstEvent = {
      type: "tool_finished" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: {}
      },
      result: { ok: true as const, output: { marker: "first" } }
    };
    await new JsonlAuditSink(filePath, now).record(firstEvent);
    const firstBytes = (await fs.stat(filePath)).size;
    const originalOpen = fs.open.bind(fs);
    let targetOpenCount = 0;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      if (isJsonlAuditEntryTarget(target, filePath)) {
        targetOpenCount += 1;
        if (targetOpenCount === 2) {
          const growthHandle = await originalOpen(
            filePath,
            fsConstants.O_APPEND | fsConstants.O_WRONLY
          );
          try {
            await growthHandle.writeFile("x", { encoding: "utf8" });
          } finally {
            await growthHandle.close();
          }
        }
      }
      return originalOpen(target, flags, mode);
    });

    await expect(new JsonlAuditSink(filePath, now, firstBytes * 2).record({
      ...firstEvent,
      request: { ...firstEvent.request, tool_call_id: "read-2" },
      result: { ok: true, output: { marker: "other" } }
    })).rejects.toThrow("Audit file capacity changed before append");

    const content = await fs.readFile(filePath, "utf8");
    expect(content.endsWith("x")).toBe(true);
    expect(content).not.toContain('"marker":"other"');
    await expect(fs.access(`${filePath}.1`)).rejects.toThrow();
  });

  it("bounds writer bootstrap directory close settlement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "nested", "deeper", "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    tempDirs.push(lockPath);
    const injection = injectAuditHandlePendingClose(dir, 1);
    const settlement = await captureAuditPendingCloseFailure(
      () => new JsonlAuditSink(filePath).record(
        createRequestedAuditEvent(dir, "writer-bootstrap")
      ),
      injection,
      "late writer bootstrap close rejection"
    );

    expect(settlement.settledWithinBound).toBe(true);
    expect(settlement.failure).toMatchObject({
      name: "Error",
      message: "audit writer descriptor close timed out after 5000 ms"
    });
    expect(injection.selectedOpenCount).toBe(1);
    expect(injection.selectedCloseCount).toBe(1);
    expect(settlement.unhandled).toEqual([]);
    expect((await fs.stat(path.join(dir, "nested"))).isDirectory()).toBe(true);
    await expect(fs.access(path.join(dir, "nested", "deeper"))).rejects
      .toThrow();
    await expect(fs.access(filePath)).rejects.toThrow();
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it("bounds writer generation parent close after committed append", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    tempDirs.push(lockPath);
    const injection = injectAuditWriterParentPendingClose(filePath);
    const settlement = await captureAuditPendingCloseFailure(
      () => new JsonlAuditSink(filePath).record(
        createRequestedAuditEvent(dir, "writer-parent-success")
      ),
      injection,
      "late writer parent close rejection"
    );

    expect(settlement.settledWithinBound).toBe(true);
    expect(settlement.failure).toMatchObject({
      name: "Error",
      message: "audit writer descriptor close timed out after 5000 ms"
    });
    expect(injection.parentOpenCount).toBe(1);
    expect(injection.parentCloseCount).toBe(1);
    expect(injection.appendOpenCount).toBe(1);
    expect(settlement.unhandled).toEqual([]);
    expect(await fs.readFile(filePath, "utf8")).toContain(
      "writer-parent-success"
    );
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it("preserves writer primary across generation parent close timeout", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    tempDirs.push(lockPath);
    const injection = injectAuditWriterParentPendingClose(
      filePath,
      "injected writer append primary failure"
    );
    const settlement = await captureAuditPendingCloseFailure(
      () => new JsonlAuditSink(filePath).record(
        createRequestedAuditEvent(dir, "writer-parent-primary")
      ),
      injection,
      "late writer parent primary close rejection"
    );

    expect(settlement.settledWithinBound).toBe(true);
    expect(settlement.failure).toMatchObject({
      name: "Error",
      message: "injected writer append primary failure"
    });
    expect(injection.parentOpenCount).toBe(1);
    expect(injection.parentCloseCount).toBe(1);
    expect(injection.appendOpenCount).toBe(1);
    expect(settlement.unhandled).toEqual([]);
    await expect(fs.access(filePath)).rejects.toThrow();
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it("bounds writer append handle close after committed record", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    tempDirs.push(lockPath);
    const injection = injectAuditHandlePendingClose(filePath, 1);
    const settlement = await captureAuditPendingCloseFailure(
      () => new JsonlAuditSink(filePath).record(
        createRequestedAuditEvent(dir, "writer-append-success")
      ),
      injection,
      "late writer append close rejection"
    );

    expect(settlement.settledWithinBound).toBe(true);
    expect(settlement.failure).toMatchObject({
      name: "Error",
      message: "audit writer descriptor close timed out after 5000 ms"
    });
    expect(injection.selectedOpenCount).toBe(1);
    expect(injection.selectedCloseCount).toBe(1);
    expect(settlement.unhandled).toEqual([]);
    expect(await fs.readFile(filePath, "utf8")).toContain(
      "writer-append-success"
    );
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it("preserves append primary across writer handle close timeout", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    tempDirs.push(lockPath);
    const injection = injectAuditHandlePendingClose(
      filePath,
      1,
      undefined,
      undefined,
      "injected writer handle primary failure"
    );
    const settlement = await captureAuditPendingCloseFailure(
      () => new JsonlAuditSink(filePath).record(
        createRequestedAuditEvent(dir, "writer-append-primary")
      ),
      injection,
      "late writer append primary close rejection"
    );

    expect(settlement.settledWithinBound).toBe(true);
    expect(settlement.failure).toMatchObject({
      name: "Error",
      message: "injected writer handle primary failure"
    });
    expect(injection.selectedOpenCount).toBe(1);
    expect(injection.selectedCloseCount).toBe(1);
    expect(settlement.unhandled).toEqual([]);
    await expect(fs.access(filePath)).rejects.toThrow();
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it("bounds committed rotation transaction handle settlement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const lockPath = getJsonlAuditLockPath(filePath);
    tempDirs.push(lockPath);
    const now = () => new Date("2026-07-26T08:00:00.000Z");
    await new JsonlAuditSink(filePath, now).record(
      createRequestedAuditEvent(dir, "writer-rotation-baseline-record")
    );
    const baseline = await fs.readFile(filePath, "utf8");
    const injection = injectAuditHandlePendingClose(filePath, 1);
    const settlement = await captureAuditPendingCloseFailure(
      () => new JsonlAuditSink(
        filePath,
        now,
        Buffer.byteLength(baseline)
      ).record(createRequestedAuditEvent(dir, "writer-rotation-next")),
      injection,
      "late writer rotation close rejection"
    );

    expect(settlement.settledWithinBound).toBe(true);
    expect(settlement.failure).toMatchObject({
      name: "Error",
      message: "audit writer descriptor close timed out after 5000 ms"
    });
    expect(injection.selectedOpenCount).toBe(2);
    expect(injection.selectedCloseCount).toBe(1);
    expect(settlement.unhandled).toEqual([]);
    expect(await fs.readFile(rotatedPath, "utf8")).toBe(baseline);
    expect(await fs.readFile(filePath, "utf8")).toContain(
      "writer-rotation-next"
    );
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it("bounds writer rotation staging stream close settlement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const lockPath = getJsonlAuditLockPath(filePath);
    tempDirs.push(lockPath);
    const now = () => new Date("2026-07-26T08:00:00.000Z");
    await new JsonlAuditSink(filePath, now).record(
      createRequestedAuditEvent(dir, "writer-staging-baseline-record")
    );
    const baseline = await fs.readFile(filePath, "utf8");
    const oldArchive = "old-archive\n";
    await fs.writeFile(rotatedPath, oldArchive, { mode: 0o600 });
    const injection = injectAuditMaintenanceDirectoryStreamPendingClose(2);
    const settlement = await captureAuditPendingCloseFailure(
      () => new JsonlAuditSink(
        filePath,
        now,
        Buffer.byteLength(baseline)
      ).record(createRequestedAuditEvent(dir, "writer-staging-next")),
      injection,
      "late writer staging stream close rejection"
    );

    expect(settlement.settledWithinBound).toBe(true);
    expect(settlement.failure).toMatchObject({
      name: "Error",
      message: "audit writer descriptor close timed out after 5000 ms"
    });
    expect(injection.selectedStreamCount).toBeGreaterThanOrEqual(3);
    expect(injection.selectedCloseCount).toBe(1);
    expect(settlement.unhandled).toEqual([]);
    expect(await fs.readFile(filePath, "utf8")).toBe(baseline);
    expect(await fs.readFile(rotatedPath, "utf8")).toBe(oldArchive);
    expect((await fs.readdir(dir)).filter(
      (entry) => entry.startsWith(".god-code-audit-rotation-")
    )).toEqual([]);
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it("bounds failed-open writer generation parent settlement", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const lockPath = getJsonlAuditLockPath(filePath);
    tempDirs.push(lockPath);
    const injection = injectAuditFailedWriterParentPendingClose(
      filePath,
      "injected writer parent validation failure"
    );
    const settlement = await captureAuditPendingCloseFailure(
      () => new JsonlAuditSink(filePath).record(
        createRequestedAuditEvent(dir, "writer-parent-open")
      ),
      injection,
      "late failed-open writer parent close rejection"
    );

    expect(settlement.settledWithinBound).toBe(true);
    expect(settlement.failure).toMatchObject({
      name: "Error",
      message: "injected writer parent validation failure"
    });
    expect(injection.parentOpenCount).toBe(1);
    expect(injection.selectedOpenCount).toBe(1);
    expect(injection.selectedCloseCount).toBe(1);
    expect(settlement.unhandled).toEqual([]);
    await expect(fs.access(filePath)).rejects.toThrow();
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it("persists ordered JSONL audit envelopes", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "nested", "audit.jsonl");
    const sink = new JsonlAuditSink(
      filePath,
      () => new Date("2026-07-21T12:00:00.000Z")
    );
    const request = {
      session_id: "session-1",
      turn_id: "turn-1",
      tool_call_id: "read-1",
      tool_name: "Read" as const,
      input: { path: "note.txt" }
    };

    await Promise.all([
      sink.record({
        type: "tool_requested",
        request,
        context: {
          cwd: dir,
          sessionId: "session-1",
          turnId: "turn-1",
          toolCallId: "read-1"
        }
      }),
      sink.record({
        type: "tool_finished",
        request,
        result: { ok: true, output: { path: "note.txt" } }
      })
    ]);

    const records = (await fs.readFile(filePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records).toEqual([
      {
        recorded_at: "2026-07-21T12:00:00.000Z",
        event: expect.objectContaining({ type: "tool_requested" })
      },
      {
        recorded_at: "2026-07-21T12:00:00.000Z",
        event: expect.objectContaining({ type: "tool_finished" })
      }
    ]);
    if (process.platform !== "win32") {
      expect((await fs.stat(path.dirname(filePath))).mode & 0o777).toBe(0o700);
      expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
    }
  });

  it("redacts structured sensitive keys without mutating audit events", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const input = {
      headers: {
        Authorization: "Bearer top-secret",
        "X-API-Key": "api-key-value",
        Accept: "application/json"
      },
      credentials: {
        password: "password-value",
        refresh_token: "refresh-token-value"
      },
      session_cookie: "cookie-value",
      token_count: 42,
      command: "echo free-form-secret"
    };

    await new JsonlAuditSink(filePath).record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "bash-1",
        tool_name: "Bash",
        input
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "bash-1"
      }
    });

    const raw = await fs.readFile(filePath, "utf8");
    const persisted = JSON.parse(raw).event.request.input;
    expect(persisted).toEqual({
      headers: {
        Authorization: "[REDACTED]",
        "X-API-Key": "[REDACTED]",
        Accept: "application/json"
      },
      credentials: {
        password: "[REDACTED]",
        refresh_token: "[REDACTED]"
      },
      session_cookie: "[REDACTED]",
      token_count: 42,
      command: "echo free-form-secret"
    });
    expect(raw).not.toContain("Bearer top-secret");
    expect(raw).not.toContain("api-key-value");
    expect(raw).not.toContain("password-value");
    expect(raw).not.toContain("refresh-token-value");
    expect(raw).not.toContain("cookie-value");
    expect(input.headers.Authorization).toBe("Bearer top-secret");
    expect(input.credentials.refresh_token).toBe("refresh-token-value");
  });

  it("redacts before custom toJSON or sensitive getters can run", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const headers: Record<string, unknown> = {};
    let sensitiveGetterCalled = false;
    let toJsonCalled = false;
    Object.defineProperty(headers, "Authorization", {
      enumerable: true,
      get() {
        sensitiveGetterCalled = true;
        throw new Error("sensitive getter must not run");
      }
    });
    Object.defineProperty(headers, "toJSON", {
      value() {
        toJsonCalled = true;
        return { leaked: "Bearer bypass-secret" };
      }
    });

    const sink = new JsonlAuditSink(filePath);
    await sink.record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: { headers }
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    });

    const raw = await fs.readFile(filePath, "utf8");
    expect(JSON.parse(raw).event.request.input.headers).toEqual({
      Authorization: "[REDACTED]"
    });
    expect(raw).not.toContain("bypass-secret");
    expect(sensitiveGetterCalled).toBe(false);
    expect(toJsonCalled).toBe(false);

    const accessorInput: Record<string, unknown> = {};
    let accessorCalled = false;
    Object.defineProperty(accessorInput, "visible", {
      enumerable: true,
      get() {
        accessorCalled = true;
        return "value";
      }
    });
    await expect(sink.record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-2",
        tool_name: "Read",
        input: accessorInput
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-2"
      }
    })).rejects.toThrow("must not contain accessor properties");
    expect(accessorCalled).toBe(false);
  });

  it("extends structured redaction with validated custom key suffixes", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const input = {
      service_credential: "credential-value",
      aws_access_key: "access-key-value",
      password: "default-rule-value",
      access_key_count: 3
    };
    const sink = new JsonlAuditSink(
      filePath,
      () => new Date("2026-07-21T12:00:00.000Z"),
      10 * 1024 * 1024,
      ["credential", "access_key"]
    );

    await sink.record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    });

    const persisted = JSON.parse(await fs.readFile(filePath, "utf8")).event.request.input;
    expect(persisted).toEqual({
      service_credential: "[REDACTED]",
      aws_access_key: "[REDACTED]",
      password: "[REDACTED]",
      access_key_count: 3
    });
    expect(input.service_credential).toBe("credential-value");
    expect(parseAuditRedactKeys(" credential, access_key,credential ")).toEqual([
      "credential",
      "accesskey"
    ]);

    for (const value of [",", "valid,", "---", "x".repeat(129)]) {
      expect(() => parseAuditRedactKeys(value)).toThrow(
        "Invalid GOD_CODE_AUDIT_REDACT_KEYS"
      );
    }
    expect(() => parseAuditRedactKeys(
      Array.from({ length: MAX_JSONL_AUDIT_REDACTION_KEYS + 1 }, (_, index) => `key${index}`)
        .join(",")
    )).toThrow("expected at most 64 key suffixes");
  });

  it("normalizes existing audit files to owner-only permissions", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    await fs.writeFile(filePath, "", { mode: 0o666 });
    await fs.chmod(filePath, 0o666);

    await new JsonlAuditSink(filePath).record({
      type: "tool_finished",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: {}
      },
      result: { ok: true }
    });

    if (process.platform !== "win32") {
      expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
    }
  });

  it("returns rejected promises for preparation failures and remains usable", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const sink = new JsonlAuditSink(filePath);
    const cyclicInput: Record<string, unknown> = {};
    cyclicInput.self = cyclicInput;
    let failedRecord: Promise<void> | undefined;

    expect(() => {
      failedRecord = sink.record({
        type: "tool_requested",
        request: {
          session_id: "session-1",
          turn_id: "turn-1",
          tool_call_id: "read-1",
          tool_name: "Read",
          input: cyclicInput as never
        },
        context: {
          cwd: dir,
          sessionId: "session-1",
          turnId: "turn-1",
          toolCallId: "read-1"
        }
      });
    }).not.toThrow();
    await expect(failedRecord).rejects.toThrow("circular structure");

    await sink.record({
      type: "tool_finished",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-2",
        tool_name: "Read",
        input: {}
      },
      result: { ok: true }
    });

    const records = (await fs.readFile(filePath, "utf8")).trim().split("\n");
    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0]!).event.request.tool_call_id).toBe("read-2");
  });

  it("bounds snapshot depth and node count without poisoning later writes", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const sink = new JsonlAuditSink(filePath);
    let deeplyNested: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < 70; index += 1) {
      deeplyNested = { child: deeplyNested };
    }

    await expect(sink.record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-depth",
        tool_name: "Read",
        input: deeplyNested
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-depth"
      }
    })).rejects.toThrow("maximum snapshot depth");

    await expect(sink.record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-width",
        tool_name: "Read",
        input: { values: Array.from({ length: MAX_JSONL_AUDIT_SNAPSHOT_NODES }, () => null) }
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-width"
      }
    })).rejects.toThrow("maximum snapshot nodes");

    await sink.record({
      type: "tool_finished",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-recovery",
        tool_name: "Read",
        input: {}
      },
      result: { ok: true }
    });
    const records = (await fs.readFile(filePath, "utf8")).trim().split("\n");
    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0]!).event.request.tool_call_id).toBe("read-recovery");
  });

  it("resolves explicit audit files and keeps the default disabled", async () => {
    const dir = await createTempDir();
    const configured = createConfiguredAuditSink(
      {
        GOD_CODE_AUDIT_FILE: "logs/tools.jsonl",
        GOD_CODE_AUDIT_MAX_BYTES: "2048",
        GOD_CODE_AUDIT_DURABILITY: "data"
      },
      dir
    );
    const disabled = createConfiguredAuditSink({ GOD_CODE_AUDIT_FILE: "  " }, dir);

    expect(configured).toBeInstanceOf(JsonlAuditSink);
    expect((configured as JsonlAuditSink).filePath).toBe(
      path.join(dir, "logs", "tools.jsonl")
    );
    expect((configured as JsonlAuditSink).maxBytes).toBe(2048);
    expect((configured as JsonlAuditSink).durability).toBe("data");
    expect(parseAuditDurability(undefined)).toBe("buffered");
    expect(parseAuditDurability(" FULL ")).toBe("full");
    expect(() => parseAuditDurability("unsafe-value")).toThrow(
      "Invalid JSONL audit durability"
    );
    expect(disabled).toBeInstanceOf(NoopAuditSink);

    const relativeDirectPath = path.relative(process.cwd(), path.join(dir, "direct.jsonl"));
    expect(new JsonlAuditSink(relativeDirectPath).filePath).toBe(
      path.resolve(process.cwd(), relativeDirectPath)
    );
  });

  it("applies buffered, data, and full append durability policies", async () => {
    const dir = await createTempDir();
    const event = {
      type: "tool_requested" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: {}
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    };

    for (const durability of ["buffered", "data", "full"] as const) {
      const filePath = path.join(dir, `${durability}.jsonl`);
      const originalOpen = fs.open.bind(fs);
      let dataSyncCalls = 0;
      let fullSyncCalls = 0;
      vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
        const handle = await originalOpen(target, flags, mode);
        vi.spyOn(handle, "datasync").mockImplementation(async () => {
          dataSyncCalls += 1;
        });
        vi.spyOn(handle, "sync").mockImplementation(async () => {
          fullSyncCalls += 1;
        });
        return handle;
      });

      await new JsonlAuditSink(
        filePath,
        () => new Date("2026-07-21T12:00:00.000Z"),
        10 * 1024 * 1024,
        [],
        durability
      ).record(event);

      expect(dataSyncCalls).toBe(durability === "data" ? 1 : 0);
      expect(fullSyncCalls).toBe(
        durability === "full" ? (process.platform === "win32" ? 1 : 2) : 0
      );
      vi.restoreAllMocks();
    }
  });

  it("syncs parent metadata only when full durability creates a current file", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const now = () => new Date("2026-07-21T12:00:00.000Z");
    const event = {
      type: "tool_requested" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: {}
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    };
    await new JsonlAuditSink(filePath, now).record(event);
    const originalOpen = fs.open.bind(fs);
    const syncedPaths: string[] = [];
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      vi.spyOn(handle, "sync").mockImplementation(async () => {
        syncedPaths.push(String(target));
      });
      return handle;
    });

    await new JsonlAuditSink(
      filePath,
      now,
      10 * 1024 * 1024,
      [],
      "full"
    ).record({
      ...event,
      request: { ...event.request, tool_call_id: "read-2" }
    });

    expect(syncedPaths).toHaveLength(1);
    expect(isJsonlAuditEntryTarget(syncedPaths[0], filePath)).toBe(true);
  });

  it("syncs current and parent after a full-durability rotation", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const now = () => new Date("2026-07-21T12:00:00.000Z");
    const firstEvent = {
      type: "tool_finished" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: {}
      },
      result: { ok: true as const, output: { marker: "first" } }
    };
    await new JsonlAuditSink(filePath, now).record(firstEvent);
    const firstBytes = (await fs.stat(filePath)).size;
    const originalOpen = fs.open.bind(fs);
    const syncedPaths: string[] = [];
    const parentOpenPaths: string[] = [];
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      if (String(target) === dir) {
        parentOpenPaths.push(String(target));
      }
      const handle = await originalOpen(target, flags, mode);
      vi.spyOn(handle, "sync").mockImplementation(async () => {
        syncedPaths.push(String(target));
      });
      return handle;
    });

    await new JsonlAuditSink(filePath, now, firstBytes, [], "full").record({
      ...firstEvent,
      request: { ...firstEvent.request, tool_call_id: "read-2" },
      result: { ok: true, output: { marker: "other" } }
    });

    expect(syncedPaths).toHaveLength(process.platform === "win32" ? 1 : 2);
    expect(isJsonlAuditEntryTarget(syncedPaths[0], filePath)).toBe(true);
    if (process.platform !== "win32") {
      expect(syncedPaths[1]).toBe(dir);
    }
    expect(parentOpenPaths).toEqual([dir]);
    expect((await fs.stat(`${filePath}.1`)).isFile()).toBe(true);
  });

  it("reports full-durability parent synchronization failures after creation", async () => {
    if (process.platform === "win32") {
      return;
    }
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const originalOpen = fs.open.bind(fs);
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      vi.spyOn(handle, "sync").mockImplementation(async () => {
        if (target === dir) {
          throw new Error("directory sync failed");
        }
      });
      return handle;
    });

    await expect(new JsonlAuditSink(
      filePath,
      () => new Date("2026-07-21T12:00:00.000Z"),
      10 * 1024 * 1024,
      [],
      "full"
    ).record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: {}
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    })).rejects.toThrow("directory sync failed");

    vi.restoreAllMocks();
    expect((await fs.readFile(filePath, "utf8")).trim().length).toBeGreaterThan(0);
  });

  it("rejects parent directory replacement before full metadata sync", async () => {
    if (process.platform === "win32") {
      return;
    }
    const root = await createTempDir();
    const parent = path.join(root, "audit-parent");
    const movedParent = path.join(root, "moved-parent");
    const filePath = path.join(parent, "audit.jsonl");
    await fs.mkdir(parent);
    const originalLstat = fs.lstat.bind(fs);
    let replaced = false;
    let parentInspections = 0;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (target === parent) {
        parentInspections += 1;
      }
      if (!replaced && target === parent && parentInspections === 6) {
        replaced = true;
        await fs.rename(parent, movedParent);
        await fs.mkdir(parent);
      }
      return originalLstat(target, options);
    });

    await expect(new JsonlAuditSink(
      filePath,
      () => new Date("2026-07-21T12:00:00.000Z"),
      10 * 1024 * 1024,
      [],
      "full"
    ).record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: {}
      },
      context: {
        cwd: root,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    })).rejects.toThrow("Audit parent directory changed before metadata sync");

    vi.restoreAllMocks();
    expect(parentInspections).toBe(6);
    expect((await fs.readFile(path.join(movedParent, "audit.jsonl"), "utf8")).trim().length)
      .toBeGreaterThan(0);
    expect(await fs.readdir(parent)).toEqual([]);
  });

  it("rejects parent replacement before exclusive current creation", async () => {
    const root = await createTempDir();
    const parent = path.join(root, "audit-parent");
    const movedParent = path.join(root, "moved-parent");
    const filePath = path.join(parent, "audit.jsonl");
    await fs.mkdir(parent);
    const originalLstat = fs.lstat.bind(fs);
    let parentInspections = 0;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (target === parent) {
        parentInspections += 1;
        if (parentInspections === 4) {
          await fs.rename(parent, movedParent);
          await fs.mkdir(parent);
        }
      }
      return originalLstat(target, options);
    });

    await expect(new JsonlAuditSink(filePath).record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: {}
      },
      context: {
        cwd: root,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    })).rejects.toThrow("Audit parent directory changed before append");

    vi.restoreAllMocks();
    expect(parentInspections).toBe(4);
    expect(await fs.readdir(parent)).toEqual([]);
    expect(await fs.readdir(movedParent)).toEqual([]);
  });

  it("rejects parent replacement after current creation but before record write", async () => {
    const root = await createTempDir();
    const parent = path.join(root, "audit-parent");
    const movedParent = path.join(root, "moved-parent");
    const filePath = path.join(parent, "audit.jsonl");
    await fs.mkdir(parent);
    const originalLstat = fs.lstat.bind(fs);
    let parentInspections = 0;
    vi.spyOn(fs, "lstat").mockImplementation(async (target, options) => {
      if (target === parent) {
        parentInspections += 1;
        if (parentInspections === 5) {
          await fs.rename(parent, movedParent);
          await fs.mkdir(parent);
        }
      }
      return originalLstat(target, options);
    });

    await expect(new JsonlAuditSink(filePath).record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: {}
      },
      context: {
        cwd: root,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    })).rejects.toThrow("Audit parent directory changed before record write");

    vi.restoreAllMocks();
    expect(parentInspections).toBe(6);
    expect(await fs.readdir(parent)).toEqual([]);
    expect(await fs.readdir(movedParent)).toEqual(["audit.jsonl"]);
    expect((await fs.stat(path.join(movedParent, "audit.jsonl"))).size).toBe(0);
  });

  it("keeps descriptor-relative current creation out of a replacement parent", async () => {
    const root = await createTempDir();
    const parent = path.join(root, "audit-parent");
    const movedParent = path.join(root, "moved-parent");
    const filePath = path.join(parent, "audit.jsonl");
    await fs.mkdir(parent);
    if (!await supportsJsonlAuditDescriptorRelativeMutation(parent)) {
      return;
    }
    const originalOpen = fs.open.bind(fs);
    const originalRename = fs.rename.bind(fs);
    let replaced = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      if (
        !replaced
        && isJsonlAuditEntryTarget(target, filePath)
        && typeof flags === "number"
        && (flags & fsConstants.O_CREAT) !== 0
      ) {
        replaced = true;
        await originalRename(parent, movedParent);
        await fs.mkdir(parent);
      }
      return originalOpen(target, flags, mode);
    });

    await expect(new JsonlAuditSink(filePath).record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: {}
      },
      context: {
        cwd: root,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    })).rejects.toThrow("Audit parent directory changed before record write");

    expect(replaced).toBe(true);
    expect(await fs.readdir(parent)).toEqual([]);
    expect(await fs.readdir(movedParent)).toEqual(["audit.jsonl"]);
    expect((await fs.stat(path.join(movedParent, "audit.jsonl"))).size).toBe(0);
  });

  it("keeps descriptor-relative archive staging out of a replacement parent", async () => {
    const root = await createTempDir();
    const parent = path.join(root, "audit-parent");
    const movedParent = path.join(root, "moved-parent");
    const filePath = path.join(parent, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    await fs.mkdir(parent);
    if (!await supportsJsonlAuditDescriptorRelativeMutation(parent)) {
      return;
    }
    const now = () => new Date("2026-07-21T12:00:00.000Z");
    const firstEvent = {
      type: "tool_finished" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: {}
      },
      result: { ok: true as const, output: { marker: "first" } }
    };
    await new JsonlAuditSink(filePath, now).record(firstEvent);
    const firstBytes = (await fs.stat(filePath)).size;
    await fs.writeFile(rotatedPath, "old-rotated", { mode: 0o600 });
    const originalRename = fs.rename.bind(fs);
    let intercepted = false;
    vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
      if (
        !intercepted
        && path.basename(String(source)) === path.basename(rotatedPath)
        && path.basename(String(destination)) === "previous"
      ) {
        intercepted = true;
        await originalRename(parent, movedParent);
        await fs.mkdir(parent);
        await fs.writeFile(filePath, "replacement-current", { mode: 0o600 });
        await fs.writeFile(rotatedPath, "replacement-rotated", { mode: 0o600 });
      }
      await originalRename(source, destination);
    });

    await expect(new JsonlAuditSink(filePath, now, firstBytes).record({
      ...firstEvent,
      request: { ...firstEvent.request, tool_call_id: "read-2" },
      result: { ok: true, output: { marker: "other" } }
    })).rejects.toThrow("Rotated audit path changed during rotation staging");

    expect(intercepted).toBe(true);
    await expect(fs.readFile(filePath, "utf8")).resolves.toBe("replacement-current");
    await expect(fs.readFile(rotatedPath, "utf8")).resolves.toBe("replacement-rotated");
    expect(JSON.parse(
      (await fs.readFile(path.join(movedParent, "audit.jsonl"), "utf8")).trim()
    ).event.result.output.marker).toBe("first");
    await expect(fs.access(path.join(movedParent, "audit.jsonl.1"))).rejects.toThrow();
    const stagingEntries = (await fs.readdir(movedParent))
      .filter((entry) => entry.startsWith(".god-code-audit-rotation-"));
    expect(stagingEntries).toHaveLength(1);
    expect(await fs.readFile(
      path.join(movedParent, stagingEntries[0]!, "previous"),
      "utf8"
    )).toBe("old-rotated");
  });

  it("restores a staged previous archive when the current rotation rename fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const now = () => new Date("2026-07-22T12:00:00.000Z");
    await new JsonlAuditSink(filePath, now).record(
      createRequestedAuditEvent(dir, "read-1")
    );
    const baseline = await fs.readFile(filePath, "utf8");
    const oldArchive = "old-archive\n";
    await fs.writeFile(rotatedPath, oldArchive, { mode: 0o600 });
    const originalRename = fs.rename.bind(fs);
    let injected = false;
    vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
      if (
        !injected
        && path.basename(String(source)) === path.basename(filePath)
        && path.basename(String(destination)) === path.basename(rotatedPath)
      ) {
        injected = true;
        throw new Error("injected current rotation rename failure");
      }
      await originalRename(source, destination);
    });

    await expect(new JsonlAuditSink(
      filePath,
      now,
      Buffer.byteLength(baseline)
    ).record(createRequestedAuditEvent(dir, "read-2")))
      .rejects.toThrow("injected current rotation rename failure");

    expect(injected).toBe(true);
    expect(await fs.readFile(filePath, "utf8")).toBe(baseline);
    expect(await fs.readFile(rotatedPath, "utf8")).toBe(oldArchive);
    expect((await fs.readdir(dir)).sort()).toEqual([
      "audit.jsonl",
      "audit.jsonl.1"
    ]);
  });

  it("retains the previous archive when rotation commit cleanup fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const now = () => new Date("2026-07-22T12:00:00.000Z");
    await new JsonlAuditSink(filePath, now).record(
      createRequestedAuditEvent(dir, "read-1")
    );
    const baseline = await fs.readFile(filePath, "utf8");
    const oldArchive = "old-archive\n";
    await fs.writeFile(rotatedPath, oldArchive, { mode: 0o600 });
    const originalUnlink = fs.unlink.bind(fs);
    let injected = false;
    vi.spyOn(fs, "unlink").mockImplementation(async (target) => {
      if (!injected && path.basename(String(target)) === "previous") {
        injected = true;
        throw new Error("injected rotation commit cleanup failure");
      }
      await originalUnlink(target);
    });

    await expect(new JsonlAuditSink(
      filePath,
      now,
      Buffer.byteLength(baseline)
    ).record(createRequestedAuditEvent(dir, "read-2")))
      .rejects.toThrow("injected rotation commit cleanup failure");

    expect(injected).toBe(true);
    expect(JSON.parse(
      (await fs.readFile(filePath, "utf8")).trim()
    ).event.request.tool_call_id).toBe("read-2");
    expect(await fs.readFile(rotatedPath, "utf8")).toBe(baseline);
    const stagingEntries = (await fs.readdir(dir))
      .filter((entry) => entry.startsWith(".god-code-audit-rotation-"));
    expect(stagingEntries).toHaveLength(1);
    expect(stagingEntries[0]).toMatch(new RegExp(
      `^${path.basename(getJsonlAuditRotationStagingPrefix(filePath))}[A-Za-z0-9]{6}$`,
      "u"
    ));
    const stagingPrefixName = path.basename(
      getJsonlAuditRotationStagingPrefix(filePath)
    );
    const stagingId = stagingEntries[0]!.slice(stagingPrefixName.length);
    expect(await inspectJsonlAuditRotationRecovery(filePath, stagingId))
      .toMatchObject({
        assessment: "ambiguous_record_state",
        eligible: false,
        currentGeneration: { exists: true },
        rotatedGeneration: { exists: true },
        staging: {
          layout: "previous_only",
          previousEntryType: "regular_file"
        }
      });
    expect(await fs.readFile(
      path.join(dir, stagingEntries[0]!, "previous"),
      "utf8"
    )).toBe(oldArchive);
  });

  it("reports cleanup readiness after rotation commits but staging removal fails", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const now = () => new Date("2026-07-22T12:00:00.000Z");
    await new JsonlAuditSink(filePath, now).record(
      createRequestedAuditEvent(dir, "read-1")
    );
    const baseline = await fs.readFile(filePath, "utf8");
    await fs.writeFile(rotatedPath, "old-archive\n", { mode: 0o600 });
    const stagingPrefixName = path.basename(
      getJsonlAuditRotationStagingPrefix(filePath)
    );
    const originalRmdir = fs.rmdir.bind(fs);
    let injected = false;
    vi.spyOn(fs, "rmdir").mockImplementation(async (target, options) => {
      if (
        !injected
        && path.basename(String(target)).startsWith(stagingPrefixName)
      ) {
        injected = true;
        throw new Error("injected rotation staging removal failure");
      }
      await originalRmdir(target, options);
    });

    await expect(new JsonlAuditSink(
      filePath,
      now,
      Buffer.byteLength(baseline)
    ).record(createRequestedAuditEvent(dir, "read-2")))
      .rejects.toThrow("injected rotation staging removal failure");

    expect(injected).toBe(true);
    expect(JSON.parse(
      (await fs.readFile(filePath, "utf8")).trim()
    ).event.request.tool_call_id).toBe("read-2");
    expect(await fs.readFile(rotatedPath, "utf8")).toBe(baseline);
    const stagingEntries = (await fs.readdir(dir))
      .filter((entry) => entry.startsWith(stagingPrefixName));
    expect(stagingEntries).toHaveLength(1);
    const stagingId = stagingEntries[0]!.slice(stagingPrefixName.length);
    const recovery = await inspectJsonlAuditRotationRecovery(filePath, stagingId);
    expect(recovery).toMatchObject({
      assessment: "cleanup_empty_staging",
      eligible: true,
      recommendedAction: "cleanup_empty_staging",
      recoveryFingerprint: expect.stringMatching(/^[0-9a-f]{32}$/u),
      currentGeneration: { exists: true },
      rotatedGeneration: { exists: true },
      staging: {
        layout: "empty",
        entryCount: 0
      }
    });
    expect(await fs.readdir(path.join(dir, stagingEntries[0]!))).toEqual([]);
  });

  it("keeps the previous archive staged until data durability completes", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const now = () => new Date("2026-07-22T12:00:00.000Z");
    await new JsonlAuditSink(filePath, now).record(
      createRequestedAuditEvent(dir, "read-1")
    );
    const baseline = await fs.readFile(filePath, "utf8");
    const oldArchive = "old-archive\n";
    await fs.writeFile(rotatedPath, oldArchive, { mode: 0o600 });
    const originalOpen = fs.open.bind(fs);
    let archivePresentDuringDataSync = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (isJsonlAuditAppendOpen(target, flags, filePath)) {
        vi.spyOn(handle, "datasync").mockImplementation(async () => {
          const stagingEntries = (await fs.readdir(dir))
            .filter((entry) => entry.startsWith(".god-code-audit-rotation-"));
          archivePresentDuringDataSync = stagingEntries.length === 1
            && await fs.readFile(
              path.join(dir, stagingEntries[0]!, "previous"),
              "utf8"
            ) === oldArchive;
        });
      }
      return handle;
    });

    await new JsonlAuditSink(
      filePath,
      now,
      Buffer.byteLength(baseline),
      [],
      "data"
    ).record(createRequestedAuditEvent(dir, "read-2"));

    expect(archivePresentDuringDataSync).toBe(true);
    expect(await fs.readFile(rotatedPath, "utf8")).toBe(baseline);
    expect(JSON.parse(
      (await fs.readFile(filePath, "utf8")).trim()
    ).event.request.tool_call_id).toBe("read-2");
    expect((await fs.readdir(dir)).sort()).toEqual([
      "audit.jsonl",
      "audit.jsonl.1"
    ]);
  });

  it("reports durability synchronization failures after the record write", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const originalOpen = fs.open.bind(fs);
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      vi.spyOn(handle, "datasync").mockRejectedValue(new Error("datasync failed"));
      return handle;
    });

    await expect(new JsonlAuditSink(
      filePath,
      () => new Date("2026-07-21T12:00:00.000Z"),
      10 * 1024 * 1024,
      [],
      "data"
    ).record({
      type: "tool_requested",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: {}
      },
      context: {
        cwd: dir,
        sessionId: "session-1",
        turnId: "turn-1",
        toolCallId: "read-1"
      }
    })).rejects.toThrow("datasync failed");

    vi.restoreAllMocks();
    expect((await fs.readFile(filePath, "utf8")).trim().length).toBeGreaterThan(0);
  });

  it("serializes rotation across sink instances sharing one path", async () => {
    const dir = await createTempDir();
    const probePath = path.join(dir, "probe.jsonl");
    const filePath = path.join(dir, "audit.jsonl");
    const now = () => new Date("2026-07-21T12:00:00.000Z");
    const createEvent = (toolCallId: string, marker: string) => ({
      type: "tool_finished" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: toolCallId,
        tool_name: "Read" as const,
        input: {}
      },
      result: { ok: true as const, output: { marker } }
    });
    await new JsonlAuditSink(probePath, now).record(createEvent("read-a", "first"));
    const oneRecordBytes = (await fs.stat(probePath)).size;
    const firstSink = new JsonlAuditSink(filePath, now, oneRecordBytes);
    const secondSink = new JsonlAuditSink(filePath, now, oneRecordBytes);

    await Promise.all([
      firstSink.record(createEvent("read-a", "first")),
      secondSink.record(createEvent("read-b", "other"))
    ]);

    const current = JSON.parse((await fs.readFile(filePath, "utf8")).trim());
    const rotated = JSON.parse((await fs.readFile(`${filePath}.1`, "utf8")).trim());
    expect(new Set([
      current.event.result.output.marker,
      rotated.event.result.output.marker
    ])).toEqual(new Set(["first", "other"]));
  });

  it("rotates one bounded audit generation before appending", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const now = () => new Date("2026-07-21T12:00:00.000Z");
    const firstSink = new JsonlAuditSink(filePath, now);
    const firstEvent = {
      type: "tool_finished" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: { path: "first.txt" }
      },
      result: { ok: true as const, output: { marker: "first" } }
    };
    await firstSink.record(firstEvent);
    const firstBytes = (await fs.stat(filePath)).size;
    await fs.chmod(filePath, 0o666);

    const rotatingSink = new JsonlAuditSink(filePath, now, firstBytes + 1);
    await rotatingSink.record({
      ...firstEvent,
      request: { ...firstEvent.request, tool_call_id: "read-2" },
      result: { ok: true, output: { marker: "second" } }
    });

    const rotated = JSON.parse((await fs.readFile(`${filePath}.1`, "utf8")).trim());
    const current = JSON.parse((await fs.readFile(filePath, "utf8")).trim());
    expect(rotated.event.result.output.marker).toBe("first");
    expect(current.event.result.output.marker).toBe("second");
    if (process.platform !== "win32") {
      expect((await fs.stat(`${filePath}.1`)).mode & 0o777).toBe(0o600);
      expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
    }
  });

  it("stages a rotated symlink entry without following its target", async () => {
    if (process.platform === "win32") {
      return;
    }
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const victimPath = path.join(dir, "victim.txt");
    const now = () => new Date("2026-07-22T12:00:00.000Z");
    await new JsonlAuditSink(filePath, now).record(
      createRequestedAuditEvent(dir, "read-1")
    );
    const baseline = await fs.readFile(filePath, "utf8");
    await fs.writeFile(victimPath, "victim-content", { mode: 0o600 });
    await fs.symlink(victimPath, rotatedPath);

    await new JsonlAuditSink(
      filePath,
      now,
      Buffer.byteLength(baseline)
    ).record(createRequestedAuditEvent(dir, "read-2"));

    expect(await fs.readFile(victimPath, "utf8")).toBe("victim-content");
    expect(await fs.readFile(rotatedPath, "utf8")).toBe(baseline);
    expect(JSON.parse(
      (await fs.readFile(filePath, "utf8")).trim()
    ).event.request.tool_call_id).toBe("read-2");
    expect((await fs.readdir(dir)).filter(
      (entry) => entry.startsWith(".god-code-audit-rotation-")
    )).toEqual([]);
  });

  it("uses descriptor-relative paths for generation rotation and current creation", async () => {
    const dir = await createTempDir();
    if (!await supportsJsonlAuditDescriptorRelativeMutation(dir)) {
      return;
    }
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const now = () => new Date("2026-07-21T12:00:00.000Z");
    const firstEvent = {
      type: "tool_finished" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: {}
      },
      result: { ok: true as const, output: { marker: "first" } }
    };
    await new JsonlAuditSink(filePath, now).record(firstEvent);
    const firstBytes = (await fs.stat(filePath)).size;
    await fs.writeFile(rotatedPath, "old-rotated", { mode: 0o600 });
    const open = vi.spyOn(fs, "open");
    const mkdtemp = vi.spyOn(fs, "mkdtemp");
    const unlink = vi.spyOn(fs, "unlink");
    const rename = vi.spyOn(fs, "rename");
    const rmdir = vi.spyOn(fs, "rmdir");

    await new JsonlAuditSink(filePath, now, firstBytes).record({
      ...firstEvent,
      request: { ...firstEvent.request, tool_call_id: "read-2" },
      result: { ok: true, output: { marker: "other" } }
    });

    const generationOpenPaths = open.mock.calls
      .map(([target]) => String(target))
      .filter((target) => isJsonlAuditEntryTarget(target, filePath));
    const stagingCreatePaths = mkdtemp.mock.calls
      .map(([target]) => String(target))
      .filter((target) => path.basename(target).startsWith(
        ".god-code-audit-rotation-"
      ));
    const stagingUnlinkPaths = unlink.mock.calls
      .map(([target]) => String(target))
      .filter((target) => path.basename(target) === "previous");
    const generationRenamePaths = rename.mock.calls
      .filter(([source, destination]) => (
        (
          path.basename(String(source)) === path.basename(rotatedPath)
          && path.basename(String(destination)) === "previous"
        )
        || (
          path.basename(String(source)) === path.basename(filePath)
          && path.basename(String(destination)) === path.basename(rotatedPath)
        )
      ))
      .flatMap(([source, destination]) => [String(source), String(destination)]);
    const stagingRmdirPaths = rmdir.mock.calls
      .map(([target]) => String(target))
      .filter((target) => path.basename(target).startsWith(
        ".god-code-audit-rotation-"
      ));
    expect(generationOpenPaths.length).toBeGreaterThanOrEqual(2);
    expect(stagingCreatePaths).toHaveLength(1);
    expect(stagingUnlinkPaths).toHaveLength(1);
    expect(generationRenamePaths).toHaveLength(4);
    expect(stagingRmdirPaths).toHaveLength(1);
    expect([
      ...generationOpenPaths,
      ...stagingCreatePaths,
      ...stagingUnlinkPaths,
      ...generationRenamePaths,
      ...stagingRmdirPaths
    ].every((target) => target.startsWith("/proc/self/fd/"))).toBe(true);
    expect((await fs.readdir(dir)).sort()).toEqual([
      "audit.jsonl",
      "audit.jsonl.1"
    ]);
  });

  it("rejects a wrong-source generation rename after the syscall succeeds", async () => {
    const dir = await createTempDir();
    if (!await supportsJsonlAuditDescriptorRelativeMutation(dir)) {
      return;
    }
    const filePath = path.join(dir, "audit.jsonl");
    const rotatedPath = `${filePath}.1`;
    const movedPath = path.join(dir, "audit.original.jsonl");
    const now = () => new Date("2026-07-21T12:00:00.000Z");
    const firstEvent = {
      type: "tool_finished" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: {}
      },
      result: { ok: true as const, output: { marker: "first" } }
    };
    await new JsonlAuditSink(filePath, now).record(firstEvent);
    const firstBytes = (await fs.stat(filePath)).size;
    const originalRename = fs.rename.bind(fs);
    let intercepted = false;
    vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
      if (
        !intercepted
        && path.basename(String(source)) === path.basename(filePath)
        && path.basename(String(destination)) === path.basename(rotatedPath)
      ) {
        intercepted = true;
        await originalRename(filePath, movedPath);
        await fs.copyFile(movedPath, filePath);
      }
      await originalRename(source, destination);
    });

    await expect(new JsonlAuditSink(filePath, now, firstBytes).record({
      ...firstEvent,
      request: { ...firstEvent.request, tool_call_id: "read-2" },
      result: { ok: true, output: { marker: "other" } }
    })).rejects.toThrow("Rotated audit file changed during rotation");

    expect(intercepted).toBe(true);
    await expect(fs.access(filePath)).rejects.toThrow();
    const movedStatus = await fs.stat(movedPath);
    const rotatedStatus = await fs.stat(rotatedPath);
    expect(movedStatus.ino).not.toBe(rotatedStatus.ino);
  });

  it("refuses rotation when the rotated generation path is a directory", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const now = () => new Date("2026-07-21T12:00:00.000Z");
    const firstEvent = {
      type: "tool_finished" as const,
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read" as const,
        input: {}
      },
      result: { ok: true as const, output: { marker: "first" } }
    };
    await new JsonlAuditSink(filePath, now).record(firstEvent);
    const firstBytes = (await fs.stat(filePath)).size;
    await fs.mkdir(`${filePath}.1`);

    await expect(new JsonlAuditSink(filePath, now, firstBytes).record({
      ...firstEvent,
      request: { ...firstEvent.request, tool_call_id: "read-2" },
      result: { ok: true, output: { marker: "other" } }
    })).rejects.toThrow("Rotated audit path must not be a directory");

    expect(JSON.parse((await fs.readFile(filePath, "utf8")).trim())
      .event.result.output.marker).toBe("first");
    expect((await fs.stat(`${filePath}.1`)).isDirectory()).toBe(true);
  });

  it("rejects oversized records and invalid capacity configuration", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const sink = new JsonlAuditSink(filePath, () => new Date(), 32);

    await expect(sink.record({
      type: "tool_finished",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: {}
      },
      result: { ok: true }
    })).rejects.toThrow("Audit record exceeds GOD_CODE_AUDIT_MAX_BYTES");
    await expect(fs.access(filePath)).rejects.toThrow();
    for (const value of ["0", "-1", "1.5", "unsafe", "9007199254740992"]) {
      expect(() => parseAuditMaxBytes(value)).toThrow(
        "Invalid GOD_CODE_AUDIT_MAX_BYTES"
      );
    }
  });

  it("rejects invalid direct sink construction invariants", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");

    expect(() => new JsonlAuditSink("   ")).toThrow(
      "Audit file path must not be empty"
    );
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => new JsonlAuditSink(filePath, () => new Date(), value)).toThrow(
        "Invalid JSONL audit maxBytes: expected a positive safe integer"
      );
    }
    expect(() => new JsonlAuditSink(
      filePath,
      () => new Date(),
      1024,
      [],
      "unsafe" as never
    )).toThrow("Invalid JSONL audit durability");
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it("honors an explicitly injected sink in host setup", async () => {
    const dir = await createTempDir();
    const sink = new MemoryAuditSink();
    const host = await prepareGodCodeHost({ auditSink: sink });
    try {
      await host.registry.executeRequest({
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: { path: "missing.txt" }
      }, { cwd: dir });
    } finally {
      await host.close();
    }

    expect(sink.events.map((event) => event.type)).toEqual([
      "tool_requested",
      "tool_decision",
      "tool_finished"
    ]);
  });

  it("surfaces capacity failures through tool audit warnings", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "audit.jsonl");
    const host = await prepareGodCodeHost({
      auditSink: new JsonlAuditSink(filePath, () => new Date(), 32)
    });
    let result;
    try {
      result = await host.registry.executeRequest({
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: { path: "missing.txt" }
      }, { cwd: dir });
    } finally {
      await host.close();
    }

    expect(result).toMatchObject({
      ok: false,
      error: { code: "file_not_found" },
      output: {
        audit_warnings: [
          expect.objectContaining({ event_type: "tool_requested" }),
          expect.objectContaining({ event_type: "tool_decision" }),
          expect.objectContaining({ event_type: "tool_finished" })
        ]
      }
    });
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it("refuses symbolic-link audit files and parent directories", async () => {
    const dir = await createTempDir();
    const outside = await createTempDir();
    const victim = path.join(outside, "victim.txt");
    await fs.writeFile(victim, "unchanged", "utf8");

    const linkedFile = path.join(dir, "audit.jsonl");
    await fs.symlink(victim, linkedFile);
    const fileSink = new JsonlAuditSink(linkedFile);
    await expect(fileSink.record({
      type: "tool_finished",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: {}
      },
      result: { ok: true }
    })).rejects.toThrow("Audit path must not contain symbolic links");
    expect(await fs.readFile(victim, "utf8")).toBe("unchanged");

    const linkedParent = path.join(dir, "linked-parent");
    await fs.symlink(outside, linkedParent, "dir");
    const parentSink = new JsonlAuditSink(path.join(linkedParent, "audit.jsonl"));
    await expect(parentSink.record({
      type: "tool_finished",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-2",
        tool_name: "Read",
        input: {}
      },
      result: { ok: true }
    })).rejects.toThrow("Audit path must not contain symbolic links");
    await expect(fs.access(path.join(outside, "audit.jsonl"))).rejects.toThrow();

    const hardLinkedFile = path.join(dir, "hard-linked-audit.jsonl");
    await fs.link(victim, hardLinkedFile);
    const hardLinkSink = new JsonlAuditSink(hardLinkedFile);
    await expect(hardLinkSink.record({
      type: "tool_finished",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-3",
        tool_name: "Read",
        input: {}
      },
      result: { ok: true }
    })).rejects.toThrow("Audit file must be a regular non-linked file");
    expect(await fs.readFile(victim, "utf8")).toBe("unchanged");
  });

  it("refuses non-regular audit targets", async () => {
    const dir = await createTempDir();
    const directoryTarget = path.join(dir, "audit.jsonl");
    await fs.mkdir(directoryTarget);
    const sink = new JsonlAuditSink(directoryTarget);

    await expect(sink.record({
      type: "tool_finished",
      request: {
        session_id: "session-1",
        turn_id: "turn-1",
        tool_call_id: "read-1",
        tool_name: "Read",
        input: {}
      },
      result: { ok: true }
    })).rejects.toThrow("Audit file must be a regular non-linked file");
  });
});
