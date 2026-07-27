import { createHash, randomUUID } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as waitFor } from "node:timers/promises";
import type { AuditEvent, AuditSink } from "./auditSink.js";
import {
  createJsonlAuditDirectoryEntry,
  createJsonlAuditTemporaryDirectoryEntry,
  renameJsonlAuditDirectoryEntry,
  resolveJsonlAuditDirectoryMutationPath,
  rmdirJsonlAuditDirectoryEntry,
  unlinkJsonlAuditDirectoryEntry
} from "./jsonlAuditDirectoryMutation.js";

export const DEFAULT_JSONL_AUDIT_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_JSONL_AUDIT_SNAPSHOT_DEPTH = 64;
export const MAX_JSONL_AUDIT_SNAPSHOT_NODES = 100_000;
export const MAX_JSONL_AUDIT_REDACTION_KEYS = 64;
export const MAX_JSONL_AUDIT_REDACTION_KEY_LENGTH = 128;
export const DEFAULT_JSONL_AUDIT_DURABILITY = "buffered" as const;
export const DEFAULT_JSONL_AUDIT_LOCK_TIMEOUT_MS = 5_000;
export const DEFAULT_JSONL_AUDIT_LOCK_RETRY_MS = 10;
export const JSONL_AUDIT_LOCK_OWNER_FILE_NAME = "owner.json";
export const MAX_JSONL_AUDIT_LOCK_OWNER_BYTES = 4_096;
export const JSONL_AUDIT_LOCK_OWNER_FINGERPRINT_HEX_LENGTH = 32;
export const JSONL_AUDIT_LOCK_EMPTY_DISPOSAL_FINGERPRINT_HEX_LENGTH = 32;
export const JSONL_AUDIT_LOCK_EMPTY_QUARANTINE_FINGERPRINT_HEX_LENGTH = 32;
export const MAX_JSONL_AUDIT_LOCK_QUARANTINE_SCAN_ENTRIES = 4_096;
export const MAX_JSONL_AUDIT_LOCK_QUARANTINE_RESULTS = 128;
export const MAX_JSONL_AUDIT_LOCK_DISPOSAL_SCAN_ENTRIES = 4_096;
export const MAX_JSONL_AUDIT_LOCK_DISPOSAL_RESULTS = 128;
export const MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES = 2;
export const MAX_JSONL_AUDIT_ROTATION_STAGING_SCAN_ENTRIES = 4_096;
export const MAX_JSONL_AUDIT_ROTATION_STAGING_RESULTS = 128;
export const MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES = 2;
export const JSONL_AUDIT_ROTATION_TARGET_HASH_HEX_LENGTH = 32;
export const JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_HEX_LENGTH = 32;
const PRIVATE_AUDIT_FILE_MODE = 0o600;
const PRIVATE_AUDIT_DIRECTORY_MODE = 0o700;
const JSONL_AUDIT_ROTATION_STAGING_BASENAME_PREFIX =
  ".god-code-audit-rotation-";
const JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME = "previous";
const JSONL_AUDIT_LOCK_OWNER_VERSION = 1 as const;
const JSONL_AUDIT_LOCK_OWNER_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const JSONL_AUDIT_LOCK_OWNER_FINGERPRINT_PATTERN = new RegExp(
  `^[0-9a-f]{${JSONL_AUDIT_LOCK_OWNER_FINGERPRINT_HEX_LENGTH}}$`,
  "u"
);
const JSONL_AUDIT_LOCK_EMPTY_DISPOSAL_FINGERPRINT_PATTERN = new RegExp(
  `^[0-9a-f]{${JSONL_AUDIT_LOCK_EMPTY_DISPOSAL_FINGERPRINT_HEX_LENGTH}}$`,
  "u"
);
const JSONL_AUDIT_LOCK_EMPTY_QUARANTINE_FINGERPRINT_PATTERN = new RegExp(
  `^[0-9a-f]{${JSONL_AUDIT_LOCK_EMPTY_QUARANTINE_FINGERPRINT_HEX_LENGTH}}$`,
  "u"
);
const JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_PATTERN = new RegExp(
  `^[0-9a-f]{${JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_HEX_LENGTH}}$`,
  "u"
);
const MAX_JSONL_AUDIT_ROTATION_RECOVERY_ERROR_SUMMARY_LENGTH = 512;
const JSONL_AUDIT_ROTATION_RECOVERY_ERROR_SUMMARY_FALLBACK =
  "unavailable error detail";
const JSONL_AUDIT_ROTATION_RECOVERY_CLOSE_SETTLEMENT_TIMEOUT_MS = 5_000;
const JSONL_AUDIT_LOCK_LIFECYCLE_CLOSE_SETTLEMENT_TIMEOUT_MS = 5_000;
const JSONL_AUDIT_LOCK_ACQUISITION_CLOSE_SETTLEMENT_TIMEOUT_MS = 5_000;
const JSONL_AUDIT_WRITER_CLOSE_SETTLEMENT_TIMEOUT_MS = 5_000;
const JSONL_AUDIT_LOCK_MAINTENANCE_CLOSE_SETTLEMENT_TIMEOUT_MS = 5_000;
const JSONL_AUDIT_INSPECTION_CLOSE_SETTLEMENT_TIMEOUT_MS = 5_000;
const JSONL_AUDIT_LOCK_QUARANTINE_ID_PATTERN = /^[A-Za-z0-9]{6}$/u;
const JSONL_AUDIT_ROTATION_STAGING_ID_PATTERN = /^[A-Za-z0-9]{6}$/u;
const JSONL_AUDIT_ROTATION_LEGACY_STAGING_NAME_PATTERN =
  /^\.god-code-audit-rotation-[A-Za-z0-9]{6}$/u;
const JSONL_AUDIT_LOCK_DISPOSAL_NAME_PATTERN =
  /^([A-Za-z0-9]{6})\.dispose-([A-Za-z0-9]{6})$/u;
const REDACTED_AUDIT_VALUE = "[REDACTED]";
const SENSITIVE_AUDIT_KEY_SUFFIXES = [
  "authorization",
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "privatekey",
  "cookie"
] as const;
const OMIT_AUDIT_VALUE = Symbol("omit-audit-value");
const auditWriteTails = new Map<string, Promise<void>>();
const auditLockHeldAssertions = new WeakMap<
  JsonlAuditFileLock,
  (errorMessage: string) => Promise<void>
>();

export interface JsonlAuditPathInspection {
  filePath: string;
  targetExists: boolean;
  nearestExistingDirectory: string;
  nearestExistingDirectoryIdentity: JsonlAuditFileIdentity;
  missingComponents: readonly string[];
  targetSizeBytes?: number;
  targetIdentity?: JsonlAuditFileIdentity;
  targetMode?: number;
  targetPrivateMode?: boolean;
}

export type JsonlAuditRotationStagingLayout =
  | "empty"
  | "previous_only"
  | "unknown";

export interface JsonlAuditRotationStagingEntryInspection {
  stagingId: string;
  stagingPath: string;
  exists: boolean;
  entryType?: JsonlAuditLockEntryType;
  ageMs?: number;
  layout?: JsonlAuditRotationStagingLayout;
  entryCount?: number;
  entryScanCount?: number;
  entryScanLimit?: number;
  entryScanTruncated?: boolean;
  previousEntryType?: JsonlAuditLockEntryType;
  previousSizeBytes?: number;
  stateChanged?: boolean;
  inspectionErrorCode?: string;
}

export interface JsonlAuditRotationStagingInspection {
  filePath: string;
  stagingPrefix: string;
  scannedEntryCount: number;
  scanLimit: number;
  scanTruncated: boolean;
  matchedEntryCount: number;
  resultLimit: number;
  resultTruncated: boolean;
  legacyUnscopedEntryCount: number;
  entries: JsonlAuditRotationStagingEntryInspection[];
}

export type JsonlAuditRotationRecoveryAction =
  | "cleanup_empty_staging"
  | "restore_previous_archive"
  | "rollback_full_rotation";

export type JsonlAuditRotationRecoveryAssessment =
  | "staging_missing"
  | "coordination_lock_present"
  | "cleanup_empty_staging"
  | "restore_previous_archive"
  | "rollback_full_rotation"
  | "ambiguous_record_state"
  | "invalid_staging_state"
  | "invalid_generation_state"
  | "unsupported_namespace_state"
  | "state_changed";

export interface JsonlAuditRotationRecoveryGenerationInspection {
  entryPath: string;
  exists: boolean;
  entryType?: JsonlAuditLockEntryType;
  sizeBytes?: number;
  mode?: number;
  privateMode?: boolean;
  linkCount?: number;
  stateChanged?: boolean;
}

export interface JsonlAuditRotationRecoveryInspection {
  filePath: string;
  rotatedPath: string;
  stagingId: string;
  stagingPath: string;
  coordinationLockPath: string;
  coordinationLockExists: boolean;
  coordinationLockEntryType?: JsonlAuditLockEntryType;
  coordinationLockAcquirable: boolean;
  coordinationLockEntryCount?: number;
  coordinationLockEntryScanCount?: number;
  coordinationLockEntryScanLimit?: number;
  coordinationLockEntryScanTruncated?: boolean;
  coordinationLockOwnerEntryExclusive?: boolean;
  coordinationLockStateChanged?: boolean;
  coordinationLockInspectionErrorCode?: string;
  currentGeneration: JsonlAuditRotationRecoveryGenerationInspection;
  rotatedGeneration: JsonlAuditRotationRecoveryGenerationInspection;
  staging: JsonlAuditRotationStagingEntryInspection;
  assessment: JsonlAuditRotationRecoveryAssessment;
  eligible: boolean;
  recommendedAction?: JsonlAuditRotationRecoveryAction;
  recoveryFingerprint?: string;
}

export interface JsonlAuditRotationStagingRecoveryOptions {
  durability?: JsonlAuditDurability;
  lockOptions?: JsonlAuditLockOptions;
  beforeMutation?: () => void | Promise<void>;
  afterCurrentRestore?: () => void | Promise<void>;
  afterArchiveRestore?: () => void | Promise<void>;
  beforeStagingRemoval?: () => void | Promise<void>;
}

export interface JsonlAuditRotationStagingRecoveryResult {
  filePath: string;
  rotatedPath: string;
  stagingId: string;
  stagingPath: string;
  requestedAction: JsonlAuditRotationRecoveryAction;
  performedAction?: JsonlAuditRotationRecoveryAction;
  expectedRecoveryFingerprint: string;
  recoveryFingerprint?: string;
  existed: boolean;
  recovered: boolean;
  mutationPerformed: boolean;
  stagingRemoved: boolean;
  durability: JsonlAuditDurability;
  durabilityCompleted: boolean;
  recoveryHandlesClosed: boolean;
  recoveryHandleWarning?: string;
  coordinationLockPath: string;
  coordinationLockReleased: boolean;
  residualCoordinationLockPath?: string;
  coordinationLockWarning?: string;
  residualStagingPath?: string;
  warning?: string;
}

export type JsonlAuditRotationStagingRecoveryFailureStage =
  | "lock_acquisition"
  | "locked_revalidation"
  | "candidate_open"
  | "candidate_revalidation"
  | "mutation"
  | "rollback";

export type JsonlAuditRotationStagingRecoveryMutationState =
  | "not_started"
  | "attempted_unconfirmed"
  | "rolled_back"
  | "uncertain";

export interface JsonlAuditRotationStagingRecoveryFailureObservation {
  observedWhileCoordinationLockHeld: true;
  assessment: JsonlAuditRotationRecoveryAssessment;
  eligible: boolean;
  recommendedAction?: JsonlAuditRotationRecoveryAction;
  recoveryFingerprint?: string;
  currentGeneration: JsonlAuditRotationRecoveryGenerationInspection;
  rotatedGeneration: JsonlAuditRotationRecoveryGenerationInspection;
  staging: JsonlAuditRotationStagingEntryInspection;
}

export interface JsonlAuditRotationStagingRecoveryFailureDetails {
  filePath: string;
  rotatedPath: string;
  stagingId: string;
  stagingPath: string;
  requestedAction: JsonlAuditRotationRecoveryAction;
  expectedRecoveryFingerprint: string;
  recoveryFingerprint?: string;
  stage: JsonlAuditRotationStagingRecoveryFailureStage;
  mutationState: JsonlAuditRotationStagingRecoveryMutationState;
  rollbackAttempted: boolean;
  rollbackCompleted?: boolean;
  recoveryHandlesClosed?: boolean;
  recoveryHandleWarning?: string;
  coordinationLockPath: string;
  coordinationLockAcquired: boolean;
  coordinationLockReleased?: boolean;
  residualCoordinationLockPath?: string;
  coordinationLockWarning?: string;
  postFailureObservationCompleted: boolean;
  postFailureObservation?:
    JsonlAuditRotationStagingRecoveryFailureObservation;
  postFailureObservationWarning?: string;
}

export class JsonlAuditRotationStagingRecoveryError extends Error {
  readonly details: JsonlAuditRotationStagingRecoveryFailureDetails;

  constructor(
    message: string,
    details: JsonlAuditRotationStagingRecoveryFailureDetails,
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = "JsonlAuditRotationStagingRecoveryError";
    this.details = details;
  }
}

export interface JsonlAuditFileIdentity {
  device: number;
  inode: number;
}

export interface JsonlAuditFileLock {
  readonly lockPath: string;
  readonly ownerPath: string;
  readonly ownerToken: string;
  release(): Promise<void>;
  abandon(): Promise<void>;
}

export type JsonlAuditLockMaintenanceOperation =
  | "active_lock_cleanup"
  | "owner_quarantine_cleanup"
  | "empty_quarantine_cleanup"
  | "owner_disposal_cleanup"
  | "empty_disposal_cleanup"
  | "quarantine_recovery";

export interface JsonlAuditLockMaintenanceFailureDetails {
  operation: JsonlAuditLockMaintenanceOperation;
  handlesClosed: boolean;
  handleWarning?: string;
}

export class JsonlAuditLockMaintenanceError extends Error {
  readonly details: JsonlAuditLockMaintenanceFailureDetails;

  constructor(
    message: string,
    details: JsonlAuditLockMaintenanceFailureDetails,
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = "JsonlAuditLockMaintenanceError";
    this.details = details;
  }
}

export type JsonlAuditLockOwnerMetadataStatus = "valid" | "missing" | "invalid";

export interface JsonlAuditLockOwnerMetadata {
  version: 1;
  ownerToken: string;
  pid: number;
  acquiredAt: string;
  acquiredAtMs: number;
}

export type JsonlAuditLockEntryType =
  | "directory"
  | "symbolic_link"
  | "regular_file"
  | "other";

export interface JsonlAuditLockInspection {
  lockPath: string;
  exists: boolean;
  entryType?: JsonlAuditLockEntryType;
  acquirable: boolean;
  ageMs?: number;
  entryCount?: number;
  entryScanCount?: number;
  entryScanLimit?: number;
  entryScanTruncated?: boolean;
  ownerPath?: string;
  ownerMetadataStatus?: JsonlAuditLockOwnerMetadataStatus;
  ownerEntryExclusive?: boolean;
  ownerToken?: string;
  ownerPid?: number;
  ownerAcquiredAt?: string;
  ownerAcquiredAtMs?: number;
  ownerFingerprint?: string;
  stateChanged?: boolean;
  inspectionErrorCode?: string;
}

export interface JsonlAuditLockOptions {
  timeoutMs?: number;
  retryMs?: number;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}

export interface JsonlAuditLockCleanupOptions {
  beforeQuarantine?: () => void | Promise<void>;
}

export interface JsonlAuditLockCleanupResult {
  lockPath: string;
  existed: boolean;
  removed: boolean;
  ownerFingerprint?: string;
  residualQuarantinePath?: string;
  cleanupHandlesClosed?: boolean;
  cleanupHandleWarning?: string;
}

export type JsonlAuditLockQuarantineLayout =
  | "owner_only"
  | "lock_with_owner"
  | "lock_and_owner"
  | "empty"
  | "unknown";

export type JsonlAuditLockQuarantineOwnerLocation = "root" | "lock";

export interface JsonlAuditLockQuarantineEntryInspection {
  quarantineId: string;
  quarantinePath: string;
  exists: boolean;
  entryType?: JsonlAuditLockEntryType;
  ageMs?: number;
  layout?: JsonlAuditLockQuarantineLayout;
  rootEntryCount?: number;
  rootEntryScanCount?: number;
  rootEntryScanLimit?: number;
  rootEntryScanTruncated?: boolean;
  lockEntryType?: JsonlAuditLockEntryType;
  lockEntryCount?: number;
  lockEntryScanCount?: number;
  lockEntryScanLimit?: number;
  lockEntryScanTruncated?: boolean;
  rootOwnerMetadataStatus?: JsonlAuditLockOwnerMetadataStatus;
  lockOwnerMetadataStatus?: JsonlAuditLockOwnerMetadataStatus;
  ownerLocation?: JsonlAuditLockQuarantineOwnerLocation;
  ownerMetadataStatus?: JsonlAuditLockOwnerMetadataStatus;
  ownerToken?: string;
  ownerPid?: number;
  ownerAcquiredAt?: string;
  ownerAcquiredAtMs?: number;
  ownerFingerprint?: string;
  emptyDirectoryFingerprint?: string;
  stateChanged?: boolean;
  inspectionErrorCode?: string;
}

export interface JsonlAuditLockQuarantineCleanupOptions {
  beforeOwnerIsolation?: () => void | Promise<void>;
  afterOwnerIsolation?: () => void | Promise<void>;
}

export interface JsonlAuditLockQuarantineCleanupResult {
  quarantineId: string;
  quarantinePath: string;
  existed: boolean;
  removed: boolean;
  ownerFingerprint?: string;
  residualDisposalPath?: string;
  cleanupHandlesClosed?: boolean;
  cleanupHandleWarning?: string;
}

export interface JsonlAuditEmptyLockQuarantineCleanupOptions {
  beforeRemoval?: () => void | Promise<void>;
}

export interface JsonlAuditEmptyLockQuarantineCleanupResult {
  quarantineId: string;
  quarantinePath: string;
  existed: boolean;
  removed: boolean;
  quarantineFingerprint?: string;
  cleanupHandlesClosed?: boolean;
  cleanupHandleWarning?: string;
}

export type JsonlAuditLockQuarantineRecoveryLayout =
  | "lock_with_owner"
  | "lock_and_owner";

export interface JsonlAuditLockQuarantineRecoveryOptions {
  beforeLockReservation?: () => void | Promise<void>;
  afterOwnerTransfer?: () => void | Promise<void>;
}

export interface JsonlAuditLockQuarantineRecoveryResult {
  quarantineId: string;
  quarantinePath: string;
  lockPath: string;
  existed: boolean;
  recovered: boolean;
  layout?: JsonlAuditLockQuarantineRecoveryLayout;
  ownerFingerprint?: string;
  residualQuarantinePath?: string;
  residualLockPath?: string;
  recoveryHandlesClosed?: boolean;
  recoveryHandleWarning?: string;
}

export interface JsonlAuditLockQuarantineInspection {
  lockPath: string;
  quarantinePrefix: string;
  scannedEntryCount: number;
  scanLimit: number;
  scanTruncated: boolean;
  matchedEntryCount: number;
  resultLimit: number;
  resultTruncated: boolean;
  entries: JsonlAuditLockQuarantineEntryInspection[];
}

export type JsonlAuditLockDisposalLayout =
  | "owner_only"
  | "empty"
  | "unknown";

export interface JsonlAuditLockDisposalEntryInspection {
  quarantineId: string;
  quarantinePath: string;
  sourceQuarantineExists: boolean;
  sourceQuarantineEntryType?: JsonlAuditLockEntryType;
  sourceQuarantineLayout?: JsonlAuditLockQuarantineLayout;
  sourceQuarantineStateChanged?: boolean;
  sourceQuarantineInspectionErrorCode?: string;
  disposalId: string;
  disposalPath: string;
  exists: boolean;
  entryType?: JsonlAuditLockEntryType;
  ageMs?: number;
  layout?: JsonlAuditLockDisposalLayout;
  rootEntryCount?: number;
  rootEntryScanCount?: number;
  rootEntryScanLimit?: number;
  rootEntryScanTruncated?: boolean;
  ownerMetadataStatus?: JsonlAuditLockOwnerMetadataStatus;
  ownerToken?: string;
  ownerPid?: number;
  ownerAcquiredAt?: string;
  ownerAcquiredAtMs?: number;
  ownerFingerprint?: string;
  emptyDirectoryFingerprint?: string;
  stateChanged?: boolean;
  inspectionErrorCode?: string;
}

export interface JsonlAuditLockDisposalInspection {
  lockPath: string;
  disposalNamespacePrefix: string;
  scannedEntryCount: number;
  scanLimit: number;
  scanTruncated: boolean;
  matchedEntryCount: number;
  resultLimit: number;
  resultTruncated: boolean;
  entries: JsonlAuditLockDisposalEntryInspection[];
}

export interface JsonlAuditLockDisposalCleanupOptions {
  beforeOwnerDeletion?: () => void | Promise<void>;
  afterOwnerDeletion?: () => void | Promise<void>;
}

export interface JsonlAuditLockDisposalCleanupResult {
  quarantineId: string;
  quarantinePath: string;
  disposalId: string;
  disposalPath: string;
  existed: boolean;
  removed: boolean;
  ownerFingerprint?: string;
  residualDisposalPath?: string;
  cleanupHandlesClosed?: boolean;
  cleanupHandleWarning?: string;
}

export interface JsonlAuditEmptyLockDisposalCleanupOptions {
  beforeRemoval?: () => void | Promise<void>;
}

export interface JsonlAuditEmptyLockDisposalCleanupResult {
  quarantineId: string;
  quarantinePath: string;
  disposalId: string;
  disposalPath: string;
  existed: boolean;
  removed: boolean;
  disposalFingerprint?: string;
  cleanupHandlesClosed?: boolean;
  cleanupHandleWarning?: string;
}

interface PersistedJsonlAuditLockOwnerMetadata {
  version: 1;
  owner_token: string;
  pid: number;
  acquired_at: string;
  acquired_at_ms: number;
}

interface JsonlAuditLockOwnerInspection {
  ownerPath: string;
  status: JsonlAuditLockOwnerMetadataStatus;
  metadata?: JsonlAuditLockOwnerMetadata;
  identity?: JsonlAuditFileIdentity;
  fileIdentity?: JsonlAuditLockOwnerFileIdentity;
}

interface JsonlAuditLockOwnerFileIdentity {
  device: bigint;
  inode: bigint;
  ctimeNs: bigint;
  birthtimeNs: bigint;
  mtimeNs: bigint;
  size: bigint;
}

type JsonlAuditLockOwnerFingerprintDomain =
  | "active"
  | "quarantine"
  | "disposal";

interface JsonlAuditLockOwnerFingerprintDirectory {
  role: string;
  directoryPath: string;
  identity: JsonlAuditLockEmptyDirectoryIdentity;
}

interface JsonlAuditLockOwnerFingerprintInput {
  domain: JsonlAuditLockOwnerFingerprintDomain;
  candidatePath: string;
  layout: string;
  ownerLocation: string;
  directories: readonly JsonlAuditLockOwnerFingerprintDirectory[];
  ownerPath: string;
  ownerIdentity: JsonlAuditLockOwnerFileIdentity;
  ownerMetadata: JsonlAuditLockOwnerMetadata;
  sourceQuarantinePath?: string;
}

interface JsonlAuditLockPinnedOwnerFile {
  handle: FileHandle;
  identity: JsonlAuditLockOwnerFileIdentity;
}

interface JsonlAuditLockPinnedOwnerMetadata
  extends JsonlAuditLockPinnedOwnerFile {
  metadata: JsonlAuditLockOwnerMetadata;
}

interface JsonlAuditLockPinnedOwnerInspection
  extends JsonlAuditLockOwnerInspection {
  pinnedOwner?: JsonlAuditLockPinnedOwnerMetadata;
}

interface JsonlAuditLockCleanupCandidate {
  directoryHandle: FileHandle;
  directoryIdentity: JsonlAuditLockEmptyDirectoryIdentity;
  lockIdentity: JsonlAuditFileIdentity;
  ownerFile: JsonlAuditLockPinnedOwnerMetadata;
  ownerToken: string;
  ownerFingerprint: string;
  maintenanceFinalizationContext:
    JsonlAuditLockMaintenanceFinalizationContext;
}

interface JsonlAuditLockEmptyDirectoryIdentity {
  device: bigint;
  inode: bigint;
  ctimeNs: bigint;
  birthtimeNs: bigint;
}

interface JsonlAuditLockEmptyDisposalCleanupCandidate {
  handle: FileHandle;
  identity: JsonlAuditLockEmptyDirectoryIdentity;
  fingerprint: string;
  maintenanceFinalizationContext:
    JsonlAuditLockMaintenanceFinalizationContext;
}

interface JsonlAuditLockEmptyQuarantineCleanupCandidate {
  handle: FileHandle;
  identity: JsonlAuditLockEmptyDirectoryIdentity;
  fingerprint: string;
  maintenanceFinalizationContext:
    JsonlAuditLockMaintenanceFinalizationContext;
}

interface JsonlAuditLockMaintenanceFinalizationContext {
  handles: FileHandle[];
  outcome: JsonlAuditLockMaintenanceHandleFinalizationOutcome;
}

interface JsonlAuditLockPinnedDirectory {
  handle: FileHandle;
  identity: JsonlAuditLockEmptyDirectoryIdentity;
  maintenanceFinalizationContext?:
    JsonlAuditLockMaintenanceFinalizationContext;
  inspectionCloseSettlementBounded?: true;
  acquisitionCloseSettlementBounded?: true;
  lifecycleCloseSettlementBounded?: true;
}

interface JsonlAuditLockDirectoryScan {
  entries: string[];
  scannedEntryCount: number;
  scanLimit: number;
  scanTruncated: boolean;
}

interface JsonlAuditLockPinnedTemporaryDirectory
  extends JsonlAuditLockPinnedDirectory {
  path: string;
  name: string;
  parentPath: string;
  parentDirectory: JsonlAuditLockPinnedDirectory;
}

interface JsonlAuditLockQuarantineRecoveryCandidate {
  layout: JsonlAuditLockQuarantineRecoveryLayout;
  ownerLocation: JsonlAuditLockQuarantineOwnerLocation;
  quarantineDirectory: JsonlAuditLockPinnedDirectory;
  nestedLockDirectory: JsonlAuditLockPinnedDirectory;
  ownerFile: JsonlAuditLockPinnedOwnerMetadata;
  ownerToken: string;
  ownerFingerprint: string;
  maintenanceFinalizationContext:
    JsonlAuditLockMaintenanceFinalizationContext;
}

interface JsonlAuditLockQuarantineRecoveryRollbackResult {
  complete: boolean;
  reservationRemoved: boolean;
  residualLockPath?: string;
}

export type JsonlAuditDurability = "buffered" | "data" | "full";

export type JsonlAuditRotationEntryType =
  | "regular_file"
  | "symbolic_link"
  | "directory"
  | "other";

export interface JsonlAuditRotationInspection {
  rotatedPath: string;
  exists: boolean;
  entryType?: JsonlAuditRotationEntryType;
  replaceable: boolean;
}

export interface JsonlAuditCapacityDecision {
  currentBytes: number;
  nextRecordBytes: number;
  maxBytes: number;
  remainingBytes: number;
  recordFits: boolean;
  rotationRequired: boolean;
  overCapacity: boolean;
}

type JsonlAuditAppendExpectation =
  | { kind: "existing"; identity: JsonlAuditFileIdentity }
  | { kind: "missing"; parentIdentity: JsonlAuditFileIdentity };

interface JsonlAuditPinnedMutationDirectory {
  directoryPath: string;
  handle: FileHandle;
  identity: JsonlAuditFileIdentity;
  writerCloseSettlementBounded?: true;
  recoveryCloseSettlementBounded?: true;
}

interface JsonlAuditPinnedTemporaryMutationDirectory
  extends JsonlAuditPinnedMutationDirectory {
  name: string;
}

interface JsonlAuditRotationEntrySnapshot {
  entryType: JsonlAuditRotationEntryType;
  device: bigint;
  inode: bigint;
  mode: bigint;
  nlink: bigint;
  size: bigint;
  mtimeNs: bigint;
  birthtimeNs: bigint;
}

interface JsonlAuditRotationRecoveryEntrySnapshot {
  entryType: JsonlAuditLockEntryType;
  device: bigint;
  inode: bigint;
  mode: bigint;
  linkCount: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
  birthtimeNs: bigint;
}

interface JsonlAuditRotationStagingDetailedInspection {
  inspection: JsonlAuditRotationStagingEntryInspection;
  rootSnapshot?: JsonlAuditRotationRecoveryEntrySnapshot;
  previousSnapshot?: JsonlAuditRotationRecoveryEntrySnapshot;
}

interface JsonlAuditRotationStagingDirectoryScan {
  entries: string[];
  scannedEntryCount: number;
  scanLimit: number;
  scanTruncated: boolean;
  previousMutationPath: string;
}

interface JsonlAuditRotationRecoveryGraphInspection {
  filePath: string;
  rotatedPath: string;
  stagingId: string;
  stagingPath: string;
  currentSnapshot?: JsonlAuditRotationRecoveryEntrySnapshot;
  rotatedSnapshot?: JsonlAuditRotationRecoveryEntrySnapshot;
  currentStable: boolean;
  rotatedStable: boolean;
  currentGeneration: JsonlAuditRotationRecoveryGenerationInspection;
  rotatedGeneration: JsonlAuditRotationRecoveryGenerationInspection;
  stagingDetails: JsonlAuditRotationStagingDetailedInspection;
}

interface JsonlAuditRotationRecoveryClassification {
  assessment: JsonlAuditRotationRecoveryAssessment;
  eligible: boolean;
  recommendedAction?: JsonlAuditRotationRecoveryAction;
  recoveryFingerprint?: string;
}

interface JsonlAuditRotationStagingRecoveryCandidate {
  graph: JsonlAuditRotationRecoveryGraphInspection;
  parentDirectory: JsonlAuditPinnedMutationDirectory;
  stagingDirectory: JsonlAuditPinnedTemporaryMutationDirectory;
  generationHandle?: FileHandle;
  generationIdentity?: JsonlAuditFileIdentity;
  generationSnapshot?: JsonlAuditRotationEntrySnapshot;
  previousSnapshot?: JsonlAuditRotationEntrySnapshot;
}

interface JsonlAuditRotationStagingRecoveryMutationOutcome {
  recovered: boolean;
  mutationPerformed: boolean;
  stagingRemoved: boolean;
  durabilityCompleted: boolean;
  residualStagingPath?: string;
  warning?: string;
}

type JsonlAuditRotationStagingRecoveryOperationResult = Omit<
  JsonlAuditRotationStagingRecoveryResult,
  | "performedAction"
  | "coordinationLockPath"
  | "coordinationLockReleased"
  | "residualCoordinationLockPath"
  | "coordinationLockWarning"
>;

interface JsonlAuditRotationRecoveryHandleFinalizationOutcome {
  closed: boolean;
  warning?: string;
}

interface JsonlAuditRotationRecoveryLockFinalizationOutcome {
  released: boolean;
  residualLockPath?: string;
  warning?: string;
}

interface JsonlAuditRotationStagingRecoveryFailureObservationOutcome {
  completed: boolean;
  observation?: JsonlAuditRotationStagingRecoveryFailureObservation;
  warning?: string;
}

interface JsonlAuditRotationStagingRecoveryOperationFailureDetails {
  stage: Exclude<
    JsonlAuditRotationStagingRecoveryFailureStage,
    "lock_acquisition"
  >;
  mutationState: JsonlAuditRotationStagingRecoveryMutationState;
  rollbackAttempted: boolean;
  rollbackCompleted?: boolean;
  recoveryFingerprint?: string;
  recoveryHandlesClosed?: boolean;
  recoveryHandleWarning?: string;
}

class JsonlAuditRotationStagingRecoveryOperationError extends Error {
  readonly details: JsonlAuditRotationStagingRecoveryOperationFailureDetails;

  constructor(
    message: string,
    details: JsonlAuditRotationStagingRecoveryOperationFailureDetails,
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = "JsonlAuditRotationStagingRecoveryOperationError";
    this.details = details;
  }
}

class JsonlAuditLockLifecycleCloseError extends Error {
  constructor(cause: unknown) {
    super(getJsonlAuditRotationRecoveryErrorMessage(cause), { cause });
    this.name = "JsonlAuditLockLifecycleCloseError";
  }
}

interface JsonlAuditRotationTransaction {
  filePath: string;
  rotatedPath: string;
  currentHandle: FileHandle;
  currentIdentity: JsonlAuditFileIdentity;
  previousRotated?: JsonlAuditRotationEntrySnapshot;
  backupDirectory?: JsonlAuditPinnedTemporaryMutationDirectory;
  finalized: boolean;
}

interface JsonlAuditAppendTransaction {
  expectation: JsonlAuditAppendExpectation;
  rotation?: JsonlAuditRotationTransaction;
  recordWriteCompleted: boolean;
}

export class JsonlAuditSink implements AuditSink {
  public readonly filePath: string;
  public readonly maxBytes: number;
  public readonly durability: JsonlAuditDurability;
  private readonly coordinationKey: string;
  private readonly sensitiveKeySuffixes: readonly string[];

  public constructor(
    filePath: string,
    private readonly now: () => Date = () => new Date(),
    maxBytes: number = DEFAULT_JSONL_AUDIT_MAX_BYTES,
    additionalSensitiveKeySuffixes: readonly string[] = [],
    durability: JsonlAuditDurability = DEFAULT_JSONL_AUDIT_DURABILITY
  ) {
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("Audit file path must not be empty.");
    }
    this.filePath = path.resolve(filePath);
    this.coordinationKey = this.filePath;
    this.maxBytes = validateJsonlAuditMaxBytes(maxBytes);
    this.durability = validateJsonlAuditDurability(durability);
    this.sensitiveKeySuffixes = [
      ...SENSITIVE_AUDIT_KEY_SUFFIXES,
      ...normalizeAdditionalAuditSensitiveKeySuffixes(additionalSensitiveKeySuffixes)
    ];
  }

  public record(event: AuditEvent): Promise<void> {
    let prepared: PreparedAuditLine;
    try {
      prepared = prepareAuditLine(
        event,
        this.now,
        this.maxBytes,
        this.sensitiveKeySuffixes
      );
    } catch (error) {
      return Promise.reject(error);
    }
    const { line, lineBytes } = prepared;
    const previous = auditWriteTails.get(this.coordinationKey) ?? Promise.resolve();
    const write = previous
      .catch(() => undefined)
      .then(async () => {
        if (!evaluateJsonlAuditCapacity(0, lineBytes, this.maxBytes).recordFits) {
          throw new Error("Audit record exceeds GOD_CODE_AUDIT_MAX_BYTES.");
        }
        const initialInspection = await inspectJsonlAuditPath(this.filePath);
        await ensureAuditParentDirectory(this.filePath, initialInspection);
        const lock = await acquireJsonlAuditFileLock(this.filePath);
        let transactionFailed = false;
        try {
          const current = await inspectJsonlAuditPath(this.filePath);
          const parentDirectory = await openAuditGenerationParentDirectory(
            this.filePath,
            current.nearestExistingDirectoryIdentity
          );
          let writerFailure: { reason: unknown } | undefined;
          try {
            const appendTransaction = await this.rotateIfNeeded(
              lineBytes,
              current,
              parentDirectory
            );
            let appendFailed = false;
            try {
              await appendAuditLine(
                this.filePath,
                line,
                lineBytes,
                this.maxBytes,
                this.durability,
                appendTransaction,
                parentDirectory
              );
            } catch (error) {
              appendFailed = true;
              if (
                appendTransaction.rotation !== undefined
                && !appendTransaction.recordWriteCompleted
              ) {
                try {
                  await rollbackJsonlAuditRotationTransaction(
                    appendTransaction.rotation,
                    parentDirectory,
                    this.durability
                  );
                } catch {
                  // Preserve the original pre-commit append failure.
                }
              }
              throw error;
            } finally {
              if (appendTransaction.rotation !== undefined) {
                try {
                  await closeJsonlAuditRotationTransaction(
                    appendTransaction.rotation
                  );
                } catch (error) {
                  if (!appendFailed) {
                    throw error;
                  }
                }
              }
            }
          } catch (error) {
            writerFailure = { reason: error };
          }
          await closeJsonlAuditWriterResourcesPreservingPrimary(
            [parentDirectory.handle],
            writerFailure
          );
        } catch (error) {
          transactionFailed = true;
          throw error;
        } finally {
          let releaseError: unknown;
          try {
            await lock.release();
          } catch (error) {
            releaseError = error;
          }
          try {
            await lock.abandon();
          } catch (error) {
            releaseError ??= error;
          }
          if (!transactionFailed && releaseError !== undefined) {
            throw releaseError;
          }
        }
      });
    auditWriteTails.set(this.coordinationKey, write);
    void write.finally(() => {
      if (auditWriteTails.get(this.coordinationKey) === write) {
        auditWriteTails.delete(this.coordinationKey);
      }
    }).catch(() => undefined);
    return write;
  }

  private async rotateIfNeeded(
    nextLineBytes: number,
    current: JsonlAuditPathInspection,
    parentDirectory: JsonlAuditPinnedMutationDirectory
  ): Promise<JsonlAuditAppendTransaction> {
    let currentBytes = current.targetSizeBytes ?? 0;
    let appendExpectation: JsonlAuditAppendExpectation = {
      kind: "missing",
      parentIdentity: parentDirectory.identity
    };
    let currentHandle: FileHandle | undefined;
    let currentIdentity: JsonlAuditFileIdentity | undefined;
    let rotationTransaction: JsonlAuditRotationTransaction | undefined;
    let keepTransactionHandles = false;
    let rotationFailure: { reason: unknown } | undefined;
    try {
      if (current.targetExists) {
        await assertPinnedAuditMutationDirectory(
          parentDirectory,
          current.nearestExistingDirectoryIdentity,
          "Audit parent directory changed during rotation preparation."
        );
        const currentMutationPath = await resolveJsonlAuditDirectoryMutationPath(
          {
            directoryPath: parentDirectory.directoryPath,
            handle: parentDirectory.handle
          },
          path.basename(this.filePath)
        );
        try {
          currentHandle = await fs.open(
            currentMutationPath.path,
            constants.O_WRONLY
              | ("O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0)
          );
        } catch (error) {
          if (!isNodeError(error) || error.code !== "ENOENT") {
            throw error;
          }
        }
        if (currentHandle !== undefined) {
          const status = await validateAuditFileHandle(currentHandle);
          currentIdentity = { device: status.dev, inode: status.ino };
          if (
            current.targetIdentity === undefined
            || !jsonlAuditFileIdentityMatches(current.targetIdentity, currentIdentity)
          ) {
            throw new Error("Audit file changed during rotation preparation.");
          }
          await assertAuditFilePathIdentity(
            this.filePath,
            currentIdentity,
            "Audit file changed during rotation preparation."
          );
          await enforcePrivateMode(currentHandle);
          currentBytes = status.size;
          appendExpectation = { kind: "existing", identity: currentIdentity };
        } else {
          // A concurrent removal leaves append free to recreate the current generation.
          currentBytes = 0;
        }
      }
      const capacity = evaluateJsonlAuditCapacity(
        currentBytes,
        nextLineBytes,
        this.maxBytes
      );
      if (!capacity.rotationRequired) {
        return {
          expectation: appendExpectation,
          recordWriteCompleted: false
        };
      }
      if (currentHandle === undefined || currentIdentity === undefined) {
        throw new Error("Audit file changed during rotation preparation.");
      }
      const rotatedPath = `${this.filePath}.1`;
      const rotated = await inspectJsonlAuditRotationPath(this.filePath);
      if (!rotated.replaceable) {
        throw new Error("Rotated audit path must not be a directory.");
      }
      const previousRotated = rotated.exists
        ? await readJsonlAuditRotationEntrySnapshot(rotatedPath)
        : undefined;
      if (previousRotated?.entryType === "directory") {
        throw new Error("Rotated audit path must not be a directory.");
      }
      const backupDirectory = previousRotated === undefined
        ? undefined
        : await createJsonlAuditRotationBackupDirectory(
          this.filePath,
          parentDirectory
        );
      rotationTransaction = {
        filePath: this.filePath,
        rotatedPath,
        currentHandle,
        currentIdentity,
        ...(previousRotated === undefined ? {} : { previousRotated }),
        ...(backupDirectory === undefined ? {} : { backupDirectory }),
        finalized: false
      };
      if (previousRotated !== undefined && backupDirectory !== undefined) {
        await stagePreviousJsonlAuditRotationEntry(
          rotationTransaction,
          parentDirectory
        );
      }
      await assertPinnedAuditMutationDirectory(
        parentDirectory,
        current.nearestExistingDirectoryIdentity,
        "Audit parent directory changed during rotation."
      );
      await assertAuditFilePathIdentity(
        this.filePath,
        currentIdentity,
        "Audit file changed during rotation."
      );
      await assertAuditPathMissing(
        rotatedPath,
        "Rotated audit path changed during rotation."
      );
      await assertAuditFilePathIdentity(
        this.filePath,
        currentIdentity,
        "Audit file changed during rotation."
      );
      await renameJsonlAuditDirectoryEntry(
        {
          directoryPath: parentDirectory.directoryPath,
          handle: parentDirectory.handle
        },
        path.basename(this.filePath),
        {
          directoryPath: parentDirectory.directoryPath,
          handle: parentDirectory.handle
        },
        path.basename(rotatedPath)
      );
      await assertPinnedAuditMutationDirectory(
        parentDirectory,
        current.nearestExistingDirectoryIdentity,
        "Audit parent directory changed during rotation."
      );
      await assertAuditPathMissing(
        this.filePath,
        "Audit file changed during rotation."
      );
      await assertAuditFilePathIdentity(
        rotatedPath,
        currentIdentity,
        "Rotated audit file changed during rotation."
      );
      await assertAuditFileHandlePathIdentity(
        rotatedPath,
        currentHandle,
        currentIdentity,
        "Rotated audit file changed during rotation."
      );
      keepTransactionHandles = true;
      return {
        expectation: {
          kind: "missing",
          parentIdentity: parentDirectory.identity
        },
        rotation: rotationTransaction,
        recordWriteCompleted: false
      };
    } catch (error) {
      rotationFailure = { reason: error };
      if (rotationTransaction !== undefined) {
        try {
          await rollbackJsonlAuditRotationTransaction(
            rotationTransaction,
            parentDirectory,
            this.durability
          );
        } catch {
          // Preserve the rotation preparation failure and retain uncertain state.
        }
      }
      throw error;
    } finally {
      if (!keepTransactionHandles) {
        const handles = [
          ...(currentHandle === undefined ? [] : [currentHandle]),
          ...(rotationTransaction?.backupDirectory === undefined
            ? []
            : [rotationTransaction.backupDirectory.handle])
        ];
        if (handles.length > 0) {
          await closeJsonlAuditWriterResourcesPreservingPrimary(
            handles,
            rotationFailure
          );
        }
      }
    }
  }
}

export function validateJsonlAuditMaxBytes(
  value: number,
  source: string = "JSONL audit maxBytes"
): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${source}: expected a positive safe integer.`);
  }
  return value;
}

export function evaluateJsonlAuditCapacity(
  currentBytes: number,
  nextRecordBytes: number,
  maxBytes: number
): JsonlAuditCapacityDecision {
  if (!Number.isSafeInteger(currentBytes) || currentBytes < 0) {
    throw new Error("Invalid JSONL audit current bytes: expected a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(nextRecordBytes) || nextRecordBytes <= 0) {
    throw new Error("Invalid JSONL audit next record bytes: expected a positive safe integer.");
  }
  const validatedMaxBytes = validateJsonlAuditMaxBytes(maxBytes);
  const recordFits = nextRecordBytes <= validatedMaxBytes;
  return {
    currentBytes,
    nextRecordBytes,
    maxBytes: validatedMaxBytes,
    remainingBytes: Math.max(0, validatedMaxBytes - currentBytes),
    recordFits,
    rotationRequired: recordFits
      && currentBytes > 0
      && currentBytes > validatedMaxBytes - nextRecordBytes,
    overCapacity: currentBytes > validatedMaxBytes
  };
}

export function jsonlAuditFileIdentityMatches(
  left: JsonlAuditFileIdentity,
  right: JsonlAuditFileIdentity
): boolean {
  return left.device === right.device && left.inode === right.inode;
}

export function getJsonlAuditRotationStagingPrefix(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const targetHash = createHash("sha256")
    .update(absolutePath)
    .digest("hex")
    .slice(0, JSONL_AUDIT_ROTATION_TARGET_HASH_HEX_LENGTH);
  return path.join(
    path.dirname(absolutePath),
    `${JSONL_AUDIT_ROTATION_STAGING_BASENAME_PREFIX}${targetHash}-`
  );
}

export function getJsonlAuditRotationStagingPath(
  filePath: string,
  stagingId: string
): string {
  validateJsonlAuditRotationStagingId(stagingId);
  return `${getJsonlAuditRotationStagingPrefix(filePath)}${stagingId}`;
}

export function getJsonlAuditLockPath(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const userScope = typeof process.getuid === "function"
    ? String(process.getuid())
    : createHash("sha256").update(os.homedir()).digest("hex").slice(0, 16);
  const pathHash = createHash("sha256").update(absolutePath).digest("hex");
  return path.join(
    os.tmpdir(),
    `god-code-audit-${userScope}-${pathHash}.lock`
  );
}

export function getJsonlAuditLockOwnerPath(lockPath: string): string {
  return path.join(lockPath, JSONL_AUDIT_LOCK_OWNER_FILE_NAME);
}

export function getJsonlAuditLockQuarantinePrefix(filePath: string): string {
  return `${getJsonlAuditLockPath(filePath)}.cleanup-`;
}

export function getJsonlAuditLockQuarantinePath(
  filePath: string,
  quarantineId: string
): string {
  validateJsonlAuditLockQuarantineId(quarantineId);
  return `${getJsonlAuditLockQuarantinePrefix(filePath)}${quarantineId}`;
}

export function getJsonlAuditLockDisposalPrefix(
  filePath: string,
  quarantineId: string
): string {
  return `${getJsonlAuditLockQuarantinePath(filePath, quarantineId)}.dispose-`;
}

export function getJsonlAuditLockDisposalPath(
  filePath: string,
  quarantineId: string,
  disposalId: string
): string {
  validateJsonlAuditLockDisposalId(disposalId);
  return `${getJsonlAuditLockDisposalPrefix(filePath, quarantineId)}${disposalId}`;
}

function getJsonlAuditLockOwnerFingerprint(
  input: JsonlAuditLockOwnerFingerprintInput
): string {
  if (!JSONL_AUDIT_LOCK_OWNER_TOKEN_PATTERN.test(
    input.ownerMetadata.ownerToken
  )) {
    throw new Error("Invalid JSONL audit lock owner token.");
  }
  const hash = createHash("sha256");
  updateJsonlAuditLockOwnerFingerprintField(
    hash,
    "version",
    "god-code-audit-lock-owner-candidate-v2"
  );
  updateJsonlAuditLockOwnerFingerprintField(hash, "domain", input.domain);
  updateJsonlAuditLockOwnerFingerprintField(
    hash,
    "candidate_path",
    path.resolve(input.candidatePath)
  );
  updateJsonlAuditLockOwnerFingerprintField(hash, "layout", input.layout);
  updateJsonlAuditLockOwnerFingerprintField(
    hash,
    "owner_location",
    input.ownerLocation
  );
  for (const directory of input.directories) {
    updateJsonlAuditLockOwnerFingerprintField(
      hash,
      "directory_role",
      directory.role
    );
    updateJsonlAuditLockOwnerFingerprintField(
      hash,
      "directory_path",
      path.resolve(directory.directoryPath)
    );
    updateJsonlAuditLockOwnerFingerprintIdentity(
      hash,
      "directory",
      directory.identity
    );
  }
  updateJsonlAuditLockOwnerFingerprintField(
    hash,
    "owner_path",
    path.resolve(input.ownerPath)
  );
  updateJsonlAuditLockOwnerFingerprintIdentity(
    hash,
    "owner",
    input.ownerIdentity
  );
  updateJsonlAuditLockOwnerFingerprintField(
    hash,
    "owner_version",
    input.ownerMetadata.version.toString()
  );
  updateJsonlAuditLockOwnerFingerprintField(
    hash,
    "owner_token",
    input.ownerMetadata.ownerToken
  );
  updateJsonlAuditLockOwnerFingerprintField(
    hash,
    "owner_pid",
    input.ownerMetadata.pid.toString()
  );
  updateJsonlAuditLockOwnerFingerprintField(
    hash,
    "owner_acquired_at",
    input.ownerMetadata.acquiredAt
  );
  updateJsonlAuditLockOwnerFingerprintField(
    hash,
    "owner_acquired_at_ms",
    input.ownerMetadata.acquiredAtMs.toString()
  );
  if (input.sourceQuarantinePath !== undefined) {
    updateJsonlAuditLockOwnerFingerprintField(
      hash,
      "source_quarantine_path",
      path.resolve(input.sourceQuarantinePath)
    );
    updateJsonlAuditLockOwnerFingerprintField(
      hash,
      "source_quarantine_state",
      "missing"
    );
  }
  return hash.digest("hex").slice(
    0,
    JSONL_AUDIT_LOCK_OWNER_FINGERPRINT_HEX_LENGTH
  );
}

function updateJsonlAuditLockOwnerFingerprintField(
  hash: ReturnType<typeof createHash>,
  role: string,
  value: string
): void {
  hash.update(role).update("\0").update(value).update("\0");
}

function updateJsonlAuditLockOwnerFingerprintIdentity(
  hash: ReturnType<typeof createHash>,
  role: string,
  identity: JsonlAuditLockEmptyDirectoryIdentity | JsonlAuditLockOwnerFileIdentity
): void {
  updateJsonlAuditLockOwnerFingerprintField(
    hash,
    `${role}_device`,
    identity.device.toString()
  );
  updateJsonlAuditLockOwnerFingerprintField(
    hash,
    `${role}_inode`,
    identity.inode.toString()
  );
  updateJsonlAuditLockOwnerFingerprintField(
    hash,
    `${role}_ctime_ns`,
    identity.ctimeNs.toString()
  );
  updateJsonlAuditLockOwnerFingerprintField(
    hash,
    `${role}_birthtime_ns`,
    identity.birthtimeNs.toString()
  );
  if ("mtimeNs" in identity) {
    updateJsonlAuditLockOwnerFingerprintField(
      hash,
      `${role}_mtime_ns`,
      identity.mtimeNs.toString()
    );
    updateJsonlAuditLockOwnerFingerprintField(
      hash,
      `${role}_size`,
      identity.size.toString()
    );
  }
}

export async function cleanupJsonlAuditFileLock(
  filePath: string,
  expectedOwnerFingerprint: string,
  options: JsonlAuditLockCleanupOptions = {}
): Promise<JsonlAuditLockCleanupResult> {
  if (!JSONL_AUDIT_LOCK_OWNER_FINGERPRINT_PATTERN.test(expectedOwnerFingerprint)) {
    throw new Error(
      `Invalid audit lock owner fingerprint: expected ${JSONL_AUDIT_LOCK_OWNER_FINGERPRINT_HEX_LENGTH} lowercase hexadecimal characters.`
    );
  }

  const lockPath = getJsonlAuditLockPath(filePath);
  const candidate = await readJsonlAuditLockCleanupCandidate(
    lockPath,
    "active",
    expectedOwnerFingerprint
  );
  if (candidate === undefined) {
    return {
      lockPath,
      existed: false,
      removed: false
    };
  }

  let resolvedResult: JsonlAuditLockCleanupResult | undefined;
  let rejected = false;
  let rejection: unknown;
  let quarantineDirectory: JsonlAuditLockPinnedTemporaryDirectory | undefined;
  const operationFinalizationContext =
    createJsonlAuditLockMaintenanceFinalizationContext();
  try {
    quarantineDirectory = await createPrivateJsonlAuditTemporaryDirectory(
      getJsonlAuditLockQuarantinePrefix(filePath),
      operationFinalizationContext
    );
    const quarantineRoot = quarantineDirectory.path;
    const quarantineLockPath = path.join(quarantineRoot, "lock");
    const quarantineOwnerPath = getJsonlAuditLockOwnerPath(quarantineRoot);
    const quarantineParentAnchor = {
      directoryPath: quarantineDirectory.parentPath,
      handle: quarantineDirectory.parentDirectory.handle
    };
    const quarantineRootAnchor = {
      directoryPath: quarantineRoot,
      handle: quarantineDirectory.handle
    };
    let lockQuarantined = false;
    let ownerQuarantined = false;
    let committed = false;

    try {
      await options.beforeQuarantine?.();
      await assertJsonlAuditLockPinnedDirectoryEntries(
        quarantineRoot,
        quarantineDirectory,
        [],
        "Audit file lock quarantine root changed during cleanup."
      );
      await assertJsonlAuditLockCleanupCandidate(lockPath, candidate);
      await renameJsonlAuditDirectoryEntry(
        quarantineParentAnchor,
        path.basename(lockPath),
        quarantineRootAnchor,
        "lock"
      );
      lockQuarantined = true;
      await assertJsonlAuditLockPinnedDirectoryEntries(
        quarantineRoot,
        quarantineDirectory,
        ["lock"],
        "Audit file lock quarantine root changed during cleanup."
      );
      await assertJsonlAuditLockCleanupCandidate(quarantineLockPath, candidate);
      await assertJsonlAuditPathMissing(quarantineOwnerPath);
      await renameJsonlAuditDirectoryEntry(
        {
          directoryPath: quarantineLockPath,
          handle: candidate.directoryHandle
        },
        JSONL_AUDIT_LOCK_OWNER_FILE_NAME,
        quarantineRootAnchor,
        JSONL_AUDIT_LOCK_OWNER_FILE_NAME
      );
      ownerQuarantined = true;
      await assertJsonlAuditLockPinnedDirectoryEntries(
        quarantineRoot,
        quarantineDirectory,
        ["lock", JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
        "Audit file lock quarantine root changed during cleanup."
      );
      await assertJsonlAuditQuarantinedOwner(quarantineRoot, candidate);
      await assertJsonlAuditEmptyLockDirectory(quarantineLockPath, candidate);
      await rmdirJsonlAuditDirectoryEntry(quarantineRootAnchor, "lock");
      await assertJsonlAuditLockPinnedDirectoryUnlinked(
        quarantineLockPath,
        candidate.directoryHandle,
        candidate.directoryIdentity,
        "Audit file lock changed during cleanup."
      );
      lockQuarantined = false;
      await assertJsonlAuditLockPinnedDirectoryEntries(
        quarantineRoot,
        quarantineDirectory,
        [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
        "Audit file lock quarantine root changed during cleanup."
      );
      committed = true;
    } catch (error) {
      if (!committed) {
        const restored = await restoreJsonlAuditLockFromQuarantine(
          lockPath,
          quarantineRoot,
          quarantineLockPath,
          quarantineDirectory,
          candidate,
          lockQuarantined,
          ownerQuarantined
        );
        if (!restored) {
          throw new Error(
            `Audit file lock changed during cleanup; no object was deleted; quarantine retained at ${quarantineRoot}.`
          );
        }
      }
      throw error;
    }

    try {
      await assertJsonlAuditLockPinnedDirectoryEntries(
        quarantineRoot,
        quarantineDirectory,
        [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
        "Audit file lock quarantine root changed during cleanup."
      );
      await assertJsonlAuditQuarantinedOwner(quarantineRoot, candidate);
      await unlinkJsonlAuditDirectoryEntry(
        quarantineRootAnchor,
        JSONL_AUDIT_LOCK_OWNER_FILE_NAME
      );
      await assertJsonlAuditPinnedOwnerMetadataUnlinked(
        quarantineOwnerPath,
        candidate.ownerFile,
        "Audit file lock changed during cleanup."
      );
      ownerQuarantined = false;
      await removeJsonlAuditLockPinnedTemporaryDirectory(
        quarantineDirectory,
        "Audit file lock quarantine root changed during cleanup."
      );
      return resolvedResult = {
        lockPath,
        existed: true,
        removed: true,
        ownerFingerprint: candidate.ownerFingerprint
      };
    } catch {
      return resolvedResult = {
        lockPath,
        existed: true,
        removed: true,
        ownerFingerprint: candidate.ownerFingerprint,
        residualQuarantinePath: quarantineRoot
      };
    }
  } catch (error) {
    rejected = true;
    rejection = error;
    throw error;
  } finally {
    const finalization = await finalizeJsonlAuditLockMaintenanceHandles([
      candidate.directoryHandle,
      candidate.ownerFile.handle,
      ...(quarantineDirectory === undefined
        ? []
        : [
            quarantineDirectory.handle,
            quarantineDirectory.parentDirectory.handle
          ])
    ], [
      candidate.maintenanceFinalizationContext,
      operationFinalizationContext
    ]);
    if (resolvedResult !== undefined) {
      resolvedResult.cleanupHandlesClosed = finalization.closed;
      if (finalization.warning !== undefined) {
        resolvedResult.cleanupHandleWarning = finalization.warning;
      }
    } else if (rejected) {
      throw addJsonlAuditLockMaintenanceHandleFinalization(
        rejection,
        "active_lock_cleanup",
        finalization
      );
    }
  }
}

export async function cleanupJsonlAuditLockQuarantine(
  filePath: string,
  quarantineId: string,
  expectedOwnerFingerprint: string,
  options: JsonlAuditLockQuarantineCleanupOptions = {}
): Promise<JsonlAuditLockQuarantineCleanupResult> {
  if (!JSONL_AUDIT_LOCK_OWNER_FINGERPRINT_PATTERN.test(expectedOwnerFingerprint)) {
    throw new Error(
      `Invalid audit lock owner fingerprint: expected ${JSONL_AUDIT_LOCK_OWNER_FINGERPRINT_HEX_LENGTH} lowercase hexadecimal characters.`
    );
  }
  const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
  const candidate = await readJsonlAuditLockCleanupCandidate(
    quarantinePath,
    "quarantine",
    expectedOwnerFingerprint
  );
  if (candidate === undefined) {
    return {
      quarantineId,
      quarantinePath,
      existed: false,
      removed: false
    };
  }

  let resolvedResult: JsonlAuditLockQuarantineCleanupResult | undefined;
  let rejected = false;
  let rejection: unknown;
  let disposalDirectory: JsonlAuditLockPinnedTemporaryDirectory | undefined;
  const operationFinalizationContext =
    createJsonlAuditLockMaintenanceFinalizationContext();
  try {
    disposalDirectory = await createPrivateJsonlAuditTemporaryDirectory(
      `${quarantinePath}.dispose-`,
      operationFinalizationContext
    );
    const disposalRoot = disposalDirectory.path;
    const disposalOwnerPath = getJsonlAuditLockOwnerPath(disposalRoot);
    const disposalParentAnchor = {
      directoryPath: disposalDirectory.parentPath,
      handle: disposalDirectory.parentDirectory.handle
    };
    const disposalRootAnchor = {
      directoryPath: disposalRoot,
      handle: disposalDirectory.handle
    };
    let ownerIsolated = false;
    let committed = false;
    try {
      await options.beforeOwnerIsolation?.();
      await assertJsonlAuditLockPinnedDirectoryEntries(
        disposalRoot,
        disposalDirectory,
        [],
        "Audit lock disposal root changed during cleanup."
      );
      await assertJsonlAuditLockCleanupCandidate(quarantinePath, candidate);
      await assertJsonlAuditPathMissing(disposalOwnerPath);
      await renameJsonlAuditDirectoryEntry(
        {
          directoryPath: quarantinePath,
          handle: candidate.directoryHandle
        },
        JSONL_AUDIT_LOCK_OWNER_FILE_NAME,
        disposalRootAnchor,
        JSONL_AUDIT_LOCK_OWNER_FILE_NAME
      );
      ownerIsolated = true;
      await assertJsonlAuditLockPinnedDirectoryEntries(
        disposalRoot,
        disposalDirectory,
        [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
        "Audit lock disposal root changed during cleanup."
      );
      await options.afterOwnerIsolation?.();
      await assertJsonlAuditLockPinnedDirectoryEntries(
        disposalRoot,
        disposalDirectory,
        [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
        "Audit lock disposal root changed during cleanup."
      );
      await assertJsonlAuditQuarantinedOwner(disposalRoot, candidate);
      await assertJsonlAuditEmptyLockDirectory(quarantinePath, candidate);
      await rmdirJsonlAuditDirectoryEntry(
        disposalParentAnchor,
        path.basename(quarantinePath)
      );
      await assertJsonlAuditLockPinnedDirectoryUnlinked(
        quarantinePath,
        candidate.directoryHandle,
        candidate.directoryIdentity,
        "Audit lock quarantine changed during cleanup."
      );
      committed = true;
    } catch (error) {
      if (!committed) {
        const restored = await restoreJsonlAuditLockQuarantineOwner(
          quarantinePath,
          disposalRoot,
          disposalDirectory,
          candidate,
          ownerIsolated
        );
        if (!restored) {
          throw new Error(
            `Audit lock quarantine changed during cleanup; no directory was deleted; disposal retained at ${disposalRoot}.`
          );
        }
      }
      throw error;
    }

    try {
      await assertJsonlAuditLockPinnedDirectoryEntries(
        disposalRoot,
        disposalDirectory,
        [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
        "Audit lock disposal root changed during cleanup."
      );
      await assertJsonlAuditQuarantinedOwner(disposalRoot, candidate);
      await unlinkJsonlAuditDirectoryEntry(
        disposalRootAnchor,
        JSONL_AUDIT_LOCK_OWNER_FILE_NAME
      );
      await assertJsonlAuditPinnedOwnerMetadataUnlinked(
        disposalOwnerPath,
        candidate.ownerFile,
        "Audit lock quarantine changed during cleanup."
      );
      await removeJsonlAuditLockPinnedTemporaryDirectory(
        disposalDirectory,
        "Audit lock disposal root changed during cleanup."
      );
      return resolvedResult = {
        quarantineId,
        quarantinePath,
        existed: true,
        removed: true,
        ownerFingerprint: candidate.ownerFingerprint
      };
    } catch {
      return resolvedResult = {
        quarantineId,
        quarantinePath,
        existed: true,
        removed: true,
        ownerFingerprint: candidate.ownerFingerprint,
        residualDisposalPath: disposalRoot
      };
    }
  } catch (error) {
    rejected = true;
    rejection = error;
    throw error;
  } finally {
    const finalization = await finalizeJsonlAuditLockMaintenanceHandles([
      candidate.directoryHandle,
      candidate.ownerFile.handle,
      ...(disposalDirectory === undefined
        ? []
        : [
            disposalDirectory.handle,
            disposalDirectory.parentDirectory.handle
          ])
    ], [
      candidate.maintenanceFinalizationContext,
      operationFinalizationContext
    ]);
    if (resolvedResult !== undefined) {
      resolvedResult.cleanupHandlesClosed = finalization.closed;
      if (finalization.warning !== undefined) {
        resolvedResult.cleanupHandleWarning = finalization.warning;
      }
    } else if (rejected) {
      throw addJsonlAuditLockMaintenanceHandleFinalization(
        rejection,
        "owner_quarantine_cleanup",
        finalization
      );
    }
  }
}

export async function cleanupJsonlAuditEmptyLockQuarantine(
  filePath: string,
  quarantineId: string,
  expectedQuarantineFingerprint: string,
  options: JsonlAuditEmptyLockQuarantineCleanupOptions = {}
): Promise<JsonlAuditEmptyLockQuarantineCleanupResult> {
  if (!JSONL_AUDIT_LOCK_EMPTY_QUARANTINE_FINGERPRINT_PATTERN.test(
    expectedQuarantineFingerprint
  )) {
    throw new Error(
      `Invalid audit lock empty quarantine fingerprint: expected ${JSONL_AUDIT_LOCK_EMPTY_QUARANTINE_FINGERPRINT_HEX_LENGTH} lowercase hexadecimal characters.`
    );
  }
  const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
  const candidate = await readJsonlAuditLockEmptyQuarantineCleanupCandidate(
    quarantinePath,
    expectedQuarantineFingerprint
  );
  if (candidate === undefined) {
    return {
      quarantineId,
      quarantinePath,
      existed: false,
      removed: false
    };
  }

  let resolvedResult: JsonlAuditEmptyLockQuarantineCleanupResult | undefined;
  let rejected = false;
  let rejection: unknown;
  let parentDirectory: JsonlAuditLockPinnedDirectory | undefined;
  const operationFinalizationContext =
    createJsonlAuditLockMaintenanceFinalizationContext();
  try {
    parentDirectory = await requireJsonlAuditLockMutationParentDirectory(
      quarantinePath,
      "Audit lock empty quarantine parent changed before cleanup.",
      operationFinalizationContext
    );
    await options.beforeRemoval?.();
    await assertJsonlAuditLockEmptyQuarantineCleanupCandidate(
      quarantinePath,
      candidate,
      operationFinalizationContext
    );
    try {
      await rmdirJsonlAuditDirectoryEntry(
        {
          directoryPath: path.dirname(quarantinePath),
          handle: parentDirectory.handle
        },
        path.basename(quarantinePath)
      );
    } catch (error) {
      if (
        isNodeError(error)
        && (error.code === "ENOENT"
          || error.code === "ENOTDIR"
          || error.code === "ENOTEMPTY")
      ) {
        throw new Error("Audit lock empty quarantine changed before cleanup.");
      }
      throw error;
    }
    await assertJsonlAuditLockPinnedDirectoryUnlinked(
      quarantinePath,
      candidate.handle,
      candidate.identity,
      "Audit lock empty quarantine changed before cleanup."
    );
    return resolvedResult = {
      quarantineId,
      quarantinePath,
      existed: true,
      removed: true,
      quarantineFingerprint: candidate.fingerprint
    };
  } catch (error) {
    rejected = true;
    rejection = error;
    throw error;
  } finally {
    const finalization = await finalizeJsonlAuditLockMaintenanceHandles([
      candidate.handle,
      ...(parentDirectory === undefined ? [] : [parentDirectory.handle])
    ], [
      candidate.maintenanceFinalizationContext,
      operationFinalizationContext
    ]);
    if (resolvedResult !== undefined) {
      resolvedResult.cleanupHandlesClosed = finalization.closed;
      if (finalization.warning !== undefined) {
        resolvedResult.cleanupHandleWarning = finalization.warning;
      }
    } else if (rejected) {
      throw addJsonlAuditLockMaintenanceHandleFinalization(
        rejection,
        "empty_quarantine_cleanup",
        finalization
      );
    }
  }
}

export async function cleanupJsonlAuditLockDisposal(
  filePath: string,
  quarantineId: string,
  disposalId: string,
  expectedOwnerFingerprint: string,
  options: JsonlAuditLockDisposalCleanupOptions = {}
): Promise<JsonlAuditLockDisposalCleanupResult> {
  if (!JSONL_AUDIT_LOCK_OWNER_FINGERPRINT_PATTERN.test(expectedOwnerFingerprint)) {
    throw new Error(
      `Invalid audit lock owner fingerprint: expected ${JSONL_AUDIT_LOCK_OWNER_FINGERPRINT_HEX_LENGTH} lowercase hexadecimal characters.`
    );
  }
  const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
  const disposalPath = getJsonlAuditLockDisposalPath(
    filePath,
    quarantineId,
    disposalId
  );
  const candidate = await readJsonlAuditLockDisposalCleanupCandidate(
    disposalPath,
    quarantinePath,
    expectedOwnerFingerprint
  );
  if (candidate === undefined) {
    return {
      quarantineId,
      quarantinePath,
      disposalId,
      disposalPath,
      existed: false,
      removed: false
    };
  }

  let resolvedResult: JsonlAuditLockDisposalCleanupResult | undefined;
  let rejected = false;
  let rejection: unknown;
  let committed = false;
  let parentDirectory: JsonlAuditLockPinnedDirectory | undefined;
  const operationFinalizationContext =
    createJsonlAuditLockMaintenanceFinalizationContext();
  try {
    parentDirectory = await requireJsonlAuditLockMutationParentDirectory(
      disposalPath,
      "Audit lock disposal parent changed before cleanup.",
      operationFinalizationContext
    );
    const disposalAnchor = {
      directoryPath: disposalPath,
      handle: candidate.directoryHandle
    };
    const parentAnchor = {
      directoryPath: path.dirname(disposalPath),
      handle: parentDirectory.handle
    };
    try {
      await options.beforeOwnerDeletion?.();
      await assertJsonlAuditLockDisposalCleanupCandidate(
        disposalPath,
        quarantinePath,
        candidate
      );
      const disposalOwnerPath = getJsonlAuditLockOwnerPath(disposalPath);
      await unlinkJsonlAuditDirectoryEntry(
        disposalAnchor,
        JSONL_AUDIT_LOCK_OWNER_FILE_NAME
      );
      await assertJsonlAuditPinnedOwnerMetadataUnlinked(
        disposalOwnerPath,
        candidate.ownerFile,
        "Audit lock disposal changed during cleanup."
      );
      committed = true;
      await options.afterOwnerDeletion?.();
      await assertJsonlAuditLockDisposalSourceMissing(quarantinePath);
      await assertJsonlAuditEmptyLockDirectory(disposalPath, candidate);
      await rmdirJsonlAuditDirectoryEntry(
        parentAnchor,
        path.basename(disposalPath)
      );
      await assertJsonlAuditLockPinnedDirectoryUnlinked(
        disposalPath,
        candidate.directoryHandle,
        candidate.directoryIdentity,
        "Audit lock disposal changed during cleanup."
      );
      return resolvedResult = {
        quarantineId,
        quarantinePath,
        disposalId,
        disposalPath,
        existed: true,
        removed: true,
        ownerFingerprint: candidate.ownerFingerprint
      };
    } catch (error) {
      if (!committed) {
        throw error;
      }
      return resolvedResult = {
        quarantineId,
        quarantinePath,
        disposalId,
        disposalPath,
        existed: true,
        removed: true,
        ownerFingerprint: candidate.ownerFingerprint,
        residualDisposalPath: disposalPath
      };
    }
  } catch (error) {
    rejected = true;
    rejection = error;
    throw error;
  } finally {
    const finalization = await finalizeJsonlAuditLockMaintenanceHandles([
      candidate.directoryHandle,
      candidate.ownerFile.handle,
      ...(parentDirectory === undefined
        ? []
        : [parentDirectory.handle])
    ], [
      candidate.maintenanceFinalizationContext,
      operationFinalizationContext
    ]);
    if (resolvedResult !== undefined) {
      resolvedResult.cleanupHandlesClosed = finalization.closed;
      if (finalization.warning !== undefined) {
        resolvedResult.cleanupHandleWarning = finalization.warning;
      }
    } else if (rejected) {
      throw addJsonlAuditLockMaintenanceHandleFinalization(
        rejection,
        "owner_disposal_cleanup",
        finalization
      );
    }
  }
}

export async function cleanupJsonlAuditEmptyLockDisposal(
  filePath: string,
  quarantineId: string,
  disposalId: string,
  expectedDisposalFingerprint: string,
  options: JsonlAuditEmptyLockDisposalCleanupOptions = {}
): Promise<JsonlAuditEmptyLockDisposalCleanupResult> {
  if (!JSONL_AUDIT_LOCK_EMPTY_DISPOSAL_FINGERPRINT_PATTERN.test(
    expectedDisposalFingerprint
  )) {
    throw new Error(
      `Invalid audit lock empty disposal fingerprint: expected ${JSONL_AUDIT_LOCK_EMPTY_DISPOSAL_FINGERPRINT_HEX_LENGTH} lowercase hexadecimal characters.`
    );
  }
  const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
  const disposalPath = getJsonlAuditLockDisposalPath(
    filePath,
    quarantineId,
    disposalId
  );
  const candidate = await readJsonlAuditLockEmptyDisposalCleanupCandidate(
    disposalPath,
    quarantinePath,
    expectedDisposalFingerprint
  );
  if (candidate === undefined) {
    return {
      quarantineId,
      quarantinePath,
      disposalId,
      disposalPath,
      existed: false,
      removed: false
    };
  }

  let resolvedResult: JsonlAuditEmptyLockDisposalCleanupResult | undefined;
  let rejected = false;
  let rejection: unknown;
  let parentDirectory: JsonlAuditLockPinnedDirectory | undefined;
  const operationFinalizationContext =
    createJsonlAuditLockMaintenanceFinalizationContext();
  try {
    parentDirectory = await requireJsonlAuditLockMutationParentDirectory(
      disposalPath,
      "Audit lock empty disposal parent changed before cleanup.",
      operationFinalizationContext
    );
    await options.beforeRemoval?.();
    await assertJsonlAuditLockEmptyDisposalCleanupCandidate(
      disposalPath,
      quarantinePath,
      candidate,
      operationFinalizationContext
    );
    try {
      await rmdirJsonlAuditDirectoryEntry(
        {
          directoryPath: path.dirname(disposalPath),
          handle: parentDirectory.handle
        },
        path.basename(disposalPath)
      );
    } catch (error) {
      if (
        isNodeError(error)
        && (error.code === "ENOENT"
          || error.code === "ENOTDIR"
          || error.code === "ENOTEMPTY")
      ) {
        throw new Error("Audit lock empty disposal changed before cleanup.");
      }
      throw error;
    }
    await assertJsonlAuditLockPinnedDirectoryUnlinked(
      disposalPath,
      candidate.handle,
      candidate.identity,
      "Audit lock empty disposal changed before cleanup."
    );
    return resolvedResult = {
      quarantineId,
      quarantinePath,
      disposalId,
      disposalPath,
      existed: true,
      removed: true,
      disposalFingerprint: candidate.fingerprint
    };
  } catch (error) {
    rejected = true;
    rejection = error;
    throw error;
  } finally {
    const finalization = await finalizeJsonlAuditLockMaintenanceHandles([
      candidate.handle,
      ...(parentDirectory === undefined ? [] : [parentDirectory.handle])
    ], [
      candidate.maintenanceFinalizationContext,
      operationFinalizationContext
    ]);
    if (resolvedResult !== undefined) {
      resolvedResult.cleanupHandlesClosed = finalization.closed;
      if (finalization.warning !== undefined) {
        resolvedResult.cleanupHandleWarning = finalization.warning;
      }
    } else if (rejected) {
      throw addJsonlAuditLockMaintenanceHandleFinalization(
        rejection,
        "empty_disposal_cleanup",
        finalization
      );
    }
  }
}

export async function recoverJsonlAuditLockQuarantine(
  filePath: string,
  quarantineId: string,
  expectedOwnerFingerprint: string,
  options: JsonlAuditLockQuarantineRecoveryOptions = {}
): Promise<JsonlAuditLockQuarantineRecoveryResult> {
  if (!JSONL_AUDIT_LOCK_OWNER_FINGERPRINT_PATTERN.test(expectedOwnerFingerprint)) {
    throw new Error(
      `Invalid audit lock owner fingerprint: expected ${JSONL_AUDIT_LOCK_OWNER_FINGERPRINT_HEX_LENGTH} lowercase hexadecimal characters.`
    );
  }

  const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
  const lockPath = getJsonlAuditLockPath(filePath);
  const candidate = await readJsonlAuditLockQuarantineRecoveryCandidate(
    quarantinePath,
    expectedOwnerFingerprint
  );
  if (candidate === undefined) {
    return {
      quarantineId,
      quarantinePath,
      lockPath,
      existed: false,
      recovered: false
    };
  }

  let resolvedResult: JsonlAuditLockQuarantineRecoveryResult | undefined;
  let rejected = false;
  let rejection: unknown;
  let recoveredLockDirectory: JsonlAuditLockPinnedDirectory | undefined;
  let recoveryParentDirectory: JsonlAuditLockPinnedDirectory | undefined;
  const operationFinalizationContext =
    createJsonlAuditLockMaintenanceFinalizationContext();
  try {
    recoveryParentDirectory = await requireJsonlAuditLockMutationParentDirectory(
      lockPath,
      "Audit lock quarantine recovery parent changed before recovery.",
      operationFinalizationContext
    );
    const recoveryParentAnchor = {
      directoryPath: path.dirname(lockPath),
      handle: recoveryParentDirectory.handle
    };
    let lockReserved = false;
    let ownerTransferred = false;
    let committed = false;
    try {
      await options.beforeLockReservation?.();
      try {
        const reservation = await createJsonlAuditDirectoryEntry(
          recoveryParentAnchor,
          path.basename(lockPath),
          0o700
        );
        lockReserved = true;
        recoveredLockDirectory = await openJsonlAuditLockPinnedDirectory(
          reservation.mutationPath,
          operationFinalizationContext
        );
      } catch (error) {
        if (isNodeError(error) && error.code === "EEXIST") {
          throw new Error(
            "Audit lock quarantine recovery refused: coordination lock entry already exists."
          );
        }
        throw error;
      }

      if (recoveredLockDirectory === undefined) {
        throw new Error(
          "Audit lock quarantine recovery could not bind the coordination lock reservation."
        );
      }
      await assertEmptyJsonlAuditRecoveryPinnedDirectory(
        lockPath,
        recoveredLockDirectory,
        "Recovered audit coordination lock changed during recovery."
      );

      await assertJsonlAuditLockQuarantineRecoveryCandidate(
        quarantinePath,
        candidate
      );
      await assertEmptyJsonlAuditRecoveryPinnedDirectory(
        lockPath,
        recoveredLockDirectory,
        "Recovered audit coordination lock changed during recovery."
      );
      const recoveredOwnerPath = getJsonlAuditLockOwnerPath(lockPath);
      await assertJsonlAuditRecoveryPathMissing(recoveredOwnerPath);
      await assertJsonlAuditLockPinnedDirectoryPath(
        lockPath,
        recoveredLockDirectory.handle,
        recoveredLockDirectory.identity,
        "Recovered audit coordination lock changed during recovery."
      );
      const recoveryOwnerDirectory = candidate.ownerLocation === "root"
        ? quarantinePath
        : path.join(quarantinePath, "lock");
      const recoveryOwnerPinnedDirectory = candidate.ownerLocation === "root"
        ? candidate.quarantineDirectory
        : candidate.nestedLockDirectory;
      await renameJsonlAuditDirectoryEntry(
        {
          directoryPath: recoveryOwnerDirectory,
          handle: recoveryOwnerPinnedDirectory.handle
        },
        JSONL_AUDIT_LOCK_OWNER_FILE_NAME,
        {
          directoryPath: lockPath,
          handle: recoveredLockDirectory.handle
        },
        JSONL_AUDIT_LOCK_OWNER_FILE_NAME
      );
      ownerTransferred = true;
      await options.afterOwnerTransfer?.();
      await assertRecoveredJsonlAuditLock(
        lockPath,
        recoveredLockDirectory,
        candidate
      );
      await assertPostTransferJsonlAuditLockQuarantine(
        quarantinePath,
        candidate
      );
      committed = true;
    } catch (error) {
      if (!committed && lockReserved) {
        if (recoveredLockDirectory === undefined) {
          throw new Error(
            `Audit lock quarantine recovery could not verify its reservation; coordination entry retained at ${lockPath}.`
          );
        }
        const rollback = await rollbackJsonlAuditLockQuarantineRecovery(
          quarantinePath,
          lockPath,
          recoveryParentDirectory,
          recoveredLockDirectory,
          candidate,
          ownerTransferred
        );
        if (rollback.residualLockPath !== undefined) {
          return resolvedResult = {
            quarantineId,
            quarantinePath,
            lockPath,
            existed: true,
            recovered: false,
            layout: candidate.layout,
            ownerFingerprint: candidate.ownerFingerprint,
            residualLockPath: rollback.residualLockPath
          };
        }
        if (!rollback.complete) {
          const reservationNote = rollback.reservationRemoved
            ? ""
            : `; coordination entry retained at ${lockPath}`;
          throw new Error(
            `Audit lock quarantine changed during recovery; rollback could not be fully verified; quarantine retained at ${quarantinePath}${reservationNote}.`
          );
        }
      }
      throw error;
    }

    const residualQuarantinePath = await cleanupRecoveredJsonlAuditLockQuarantine(
      quarantinePath,
      recoveryParentDirectory,
      candidate
    );
    return resolvedResult = {
      quarantineId,
      quarantinePath,
      lockPath,
      existed: true,
      recovered: true,
      layout: candidate.layout,
      ownerFingerprint: candidate.ownerFingerprint,
      ...(residualQuarantinePath === undefined
        ? {}
        : { residualQuarantinePath })
    };
  } catch (error) {
    rejected = true;
    rejection = error;
    throw error;
  } finally {
    const handles = [
      candidate.quarantineDirectory.handle,
      candidate.nestedLockDirectory.handle,
      candidate.ownerFile.handle,
      ...(recoveryParentDirectory === undefined
        ? []
        : [recoveryParentDirectory.handle]),
      ...(recoveredLockDirectory === undefined
        ? []
        : [recoveredLockDirectory.handle])
    ];
    const finalization = await finalizeJsonlAuditLockMaintenanceHandles(
      handles,
      [
        candidate.maintenanceFinalizationContext,
        operationFinalizationContext
      ]
    );
    if (resolvedResult !== undefined) {
      resolvedResult.recoveryHandlesClosed = finalization.closed;
      if (finalization.warning !== undefined) {
        resolvedResult.recoveryHandleWarning = finalization.warning;
      }
    } else if (rejected) {
      throw addJsonlAuditLockMaintenanceHandleFinalization(
        rejection,
        "quarantine_recovery",
        finalization
      );
    }
  }
}

export async function acquireJsonlAuditFileLock(
  filePath: string,
  options: JsonlAuditLockOptions = {}
): Promise<JsonlAuditFileLock> {
  const timeoutMs = validateJsonlAuditLockDuration(
    options.timeoutMs ?? DEFAULT_JSONL_AUDIT_LOCK_TIMEOUT_MS,
    "JSONL audit lock timeout"
  );
  const retryMs = validateJsonlAuditLockDuration(
    options.retryMs ?? DEFAULT_JSONL_AUDIT_LOCK_RETRY_MS,
    "JSONL audit lock retry interval"
  );
  const now = options.now ?? Date.now;
  const wait = options.wait ?? (async (milliseconds: number) => waitFor(milliseconds));
  const lockPath = getJsonlAuditLockPath(filePath);
  const ownerPath = getJsonlAuditLockOwnerPath(lockPath);
  const startedAt = validateJsonlAuditLockClock(now());
  while (true) {
    let lockParentDirectory: JsonlAuditLockPinnedDirectory | undefined;
    let parentTransferred = false;
    try {
      const lockParent = await requireJsonlAuditLockMutationParentDirectory(
        lockPath,
        "Audit file lock parent changed during acquisition.",
        undefined,
        true
      );
      lockParentDirectory = lockParent;
      const lockParentAnchor = {
        directoryPath: path.dirname(lockPath),
        handle: lockParent.handle
      };
      const reservation = await createJsonlAuditDirectoryEntry(
        lockParentAnchor,
        path.basename(lockPath),
        0o700
      );
      let acquiredLockDirectory: JsonlAuditLockPinnedDirectory | undefined;
      let acquiredOwnerToken: string | undefined;
      let acquiredOwnerCreation: JsonlAuditLockPinnedOwnerFile | undefined;
      let acquiredOwnerFile: JsonlAuditLockPinnedOwnerMetadata | undefined;
      try {
        const lockDirectory = await openJsonlAuditLockPinnedDirectory(
          reservation.mutationPath,
          undefined,
          false,
          true
        );
        if (lockDirectory === undefined) {
          throw new Error("Audit file lock changed during acquisition.");
        }
        const acquisitionLockDirectory: JsonlAuditLockPinnedDirectory = {
          ...lockDirectory,
          acquisitionCloseSettlementBounded: true
        };
        acquiredLockDirectory = acquisitionLockDirectory;
        const acquiredAtMs = validateJsonlAuditLockClock(now());
        const ownerToken = randomUUID();
        acquiredOwnerToken = ownerToken;
        const ownerMetadata: JsonlAuditLockOwnerMetadata = {
          version: JSONL_AUDIT_LOCK_OWNER_VERSION,
          ownerToken,
          pid: process.pid,
          acquiredAt: formatJsonlAuditLockTimestamp(acquiredAtMs),
          acquiredAtMs
        };
        const ownerMutationPath = await resolveJsonlAuditDirectoryMutationPath(
          {
            directoryPath: lockPath,
            handle: acquisitionLockDirectory.handle
          },
          JSONL_AUDIT_LOCK_OWNER_FILE_NAME
        );
        const ownerCreation = await createJsonlAuditLockOwnerFile(
          ownerMutationPath.path,
          true
        );
        acquiredOwnerCreation = ownerCreation;
        const ownerFile = await writeJsonlAuditLockOwnerMetadata(
          ownerPath,
          ownerCreation,
          ownerMetadata
        );
        acquiredOwnerFile = ownerFile;
        await assertJsonlAuditLockPinnedDirectoryPath(
          lockPath,
          acquisitionLockDirectory.handle,
          acquisitionLockDirectory.identity,
          "Audit file lock changed during acquisition."
        );
        await assertJsonlAuditPinnedOwnerMetadataPath(
          ownerPath,
          ownerFile,
          "Audit file lock changed during acquisition."
        );
        await assertJsonlAuditLockPinnedDirectoryEntries(
          lockPath,
          acquisitionLockDirectory,
          [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
          "Audit file lock changed during acquisition."
        );
        await assertJsonlAuditPinnedOwnerMetadataPath(
          ownerPath,
          ownerFile,
          "Audit file lock changed during acquisition."
        );
        await assertJsonlAuditLockPinnedDirectoryPath(
          lockPath,
          acquisitionLockDirectory.handle,
          acquisitionLockDirectory.identity,
          "Audit file lock changed during acquisition."
        );
        lockDirectory.lifecycleCloseSettlementBounded = true;

        let lifecycleState: "held" | "released" | "abandoned" = "held";
        let lifecycleTail: Promise<void> = Promise.resolve();
        let lifecycleHandleFinalization: Promise<void> | undefined;
        let ownerRemoved = false;
        const closeLifecycleHandles = (): Promise<void> => {
          if (lifecycleHandleFinalization === undefined) {
            lifecycleHandleFinalization = closeJsonlAuditLockLifecycleResources([
              ownerFile.handle,
              lockDirectory.handle,
              lockParent.handle
            ]).catch((error: unknown) => {
              throw new JsonlAuditLockLifecycleCloseError(error);
            });
          }
          return lifecycleHandleFinalization;
        };
        const enqueueLifecycleOperation = <T>(
          operation: () => Promise<T>
        ): Promise<T> => {
          const result = lifecycleTail.then(operation);
          lifecycleTail = result.then(
            () => undefined,
            () => undefined
          );
          return result;
        };
        const assertHeld = async (errorMessage: string): Promise<void> => {
          if (
            lifecycleState !== "held"
            || lifecycleHandleFinalization !== undefined
            || ownerRemoved
            || !jsonlAuditLockOwnerMetadataMatches(
              ownerMetadata,
              ownerFile.metadata
            )
          ) {
            throw new Error(errorMessage);
          }
          await assertJsonlAuditLockPinnedDirectoryPath(
            lockPath,
            lockDirectory.handle,
            lockDirectory.identity,
            errorMessage
          );
          await assertJsonlAuditPinnedOwnerMetadataPath(
            ownerPath,
            ownerFile,
            errorMessage
          );
          await assertJsonlAuditLockPinnedDirectoryEntries(
            lockPath,
            lockDirectory,
            [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
            errorMessage
          );
          await assertJsonlAuditPinnedOwnerMetadataPath(
            ownerPath,
            ownerFile,
            errorMessage
          );
          await assertJsonlAuditLockPinnedDirectoryPath(
            lockPath,
            lockDirectory.handle,
            lockDirectory.identity,
            errorMessage
          );
        };
        const lock: JsonlAuditFileLock = {
          lockPath,
          ownerPath,
          ownerToken,
          release: () => enqueueLifecycleOperation(async () => {
            if (lifecycleState === "released") {
              await closeLifecycleHandles();
              return;
            }
            if (lifecycleState === "abandoned") {
              throw new Error("Audit file lock was abandoned before release.");
            }
            await assertJsonlAuditLockPinnedDirectoryPath(
              lockPath,
              lockDirectory.handle,
              lockDirectory.identity,
              "Audit file lock changed before release."
            );
            if (!ownerRemoved) {
              if (!jsonlAuditLockOwnerMetadataMatches(
                ownerMetadata,
                ownerFile.metadata
              )) {
                throw new Error("Audit file lock changed before release.");
              }
              await assertJsonlAuditPinnedOwnerMetadataPath(
                ownerPath,
                ownerFile,
                "Audit file lock changed before release."
              );
              await assertJsonlAuditLockPinnedDirectoryEntries(
                lockPath,
                lockDirectory,
                [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
                "Audit file lock changed before release."
              );
              await assertJsonlAuditPinnedOwnerMetadataPath(
                ownerPath,
                ownerFile,
                "Audit file lock changed before release."
              );
              await assertJsonlAuditLockPinnedDirectoryPath(
                lockPath,
                lockDirectory.handle,
                lockDirectory.identity,
                "Audit file lock changed before release."
              );
              try {
                await unlinkJsonlAuditDirectoryEntry(
                  {
                    directoryPath: lockPath,
                    handle: lockDirectory.handle
                  },
                  JSONL_AUDIT_LOCK_OWNER_FILE_NAME
                );
              } catch (error) {
                if (
                  isNodeError(error)
                  && (error.code === "ENOENT"
                    || error.code === "ENOTDIR")
                ) {
                  throw new Error("Audit file lock changed before release.");
                }
                throw error;
              }
              await assertJsonlAuditPinnedOwnerMetadataUnlinked(
                ownerPath,
                ownerFile,
                "Audit file lock changed before release."
              );
              ownerRemoved = true;
            }

            await assertJsonlAuditLockPinnedDirectoryEntries(
              lockPath,
              lockDirectory,
              [],
              "Audit file lock changed before release."
            );
            try {
              await rmdirJsonlAuditDirectoryEntry(
                lockParentAnchor,
                path.basename(lockPath)
              );
            } catch (error) {
              if (
                isNodeError(error)
                && (error.code === "ENOENT"
                  || error.code === "ENOTDIR"
                  || error.code === "ENOTEMPTY")
              ) {
                throw new Error("Audit file lock changed before release.");
              }
              throw error;
            }
            await assertJsonlAuditLockPinnedDirectoryUnlinked(
              lockPath,
              lockDirectory.handle,
              lockDirectory.identity,
              "Audit file lock changed before release."
            );
            lifecycleState = "released";
            await closeLifecycleHandles();
          }),
          abandon: () => enqueueLifecycleOperation(async () => {
            if (lifecycleState === "held") {
              lifecycleState = "abandoned";
            }
            await closeLifecycleHandles();
          })
        };
        auditLockHeldAssertions.set(lock, assertHeld);
        parentTransferred = true;
        return lock;
      } catch (error) {
        if (acquiredLockDirectory !== undefined) {
          await cleanupFailedJsonlAuditLockAcquisition(
            lockPath,
            lockParent,
            acquiredLockDirectory,
            acquiredOwnerToken,
            acquiredOwnerFile ?? acquiredOwnerCreation
          );
        }
        throw error;
      }
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") {
        throw error;
      }
      const elapsedMs = Math.max(0, validateJsonlAuditLockClock(now()) - startedAt);
      if (elapsedMs >= timeoutMs) {
        throw new Error("Timed out waiting for audit file lock.");
      }
      await wait(Math.min(retryMs, timeoutMs - elapsedMs));
    } finally {
      if (!parentTransferred && lockParentDirectory !== undefined) {
        try {
          await closeJsonlAuditLockAcquisitionResources([
            lockParentDirectory.handle
          ]);
        } catch {
          // Preserve the acquisition attempt outcome and retry identity.
        }
      }
    }
  }
}

async function assertAcquiredJsonlAuditFileLockHeld(
  lock: JsonlAuditFileLock,
  errorMessage: string
): Promise<void> {
  const assertion = auditLockHeldAssertions.get(lock);
  if (assertion === undefined) {
    throw new Error(errorMessage);
  }
  await assertion(errorMessage);
}

export async function inspectJsonlAuditFileLock(
  filePath: string,
  now: () => number = Date.now
): Promise<JsonlAuditLockInspection> {
  const lockPath = getJsonlAuditLockPath(filePath);
  let status;
  try {
    status = await fs.lstat(lockPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        lockPath,
        exists: false,
        acquirable: true
      };
    }
    throw error;
  }
  const observedAt = now();
  if (!Number.isFinite(observedAt)) {
    throw new Error("Invalid JSONL audit lock inspection clock.");
  }
  const entryType: JsonlAuditLockEntryType = status.isDirectory()
    ? "directory"
    : status.isSymbolicLink()
      ? "symbolic_link"
      : status.isFile()
        ? "regular_file"
        : "other";
  const inspection: JsonlAuditLockInspection = {
    lockPath,
    exists: true,
    entryType,
    acquirable: false,
    ageMs: Math.max(0, Math.floor(observedAt - status.mtimeMs))
  };
  if (entryType !== "directory") {
    return inspection;
  }
  let lockDirectory: JsonlAuditLockPinnedDirectory | undefined;
  let pinnedOwner: JsonlAuditLockPinnedOwnerMetadata | undefined;
  try {
    lockDirectory = await openJsonlAuditLockPinnedDirectory(
      lockPath,
      undefined,
      true
    );
    if (
      lockDirectory === undefined
      || lockDirectory.identity.device !== BigInt(status.dev)
      || lockDirectory.identity.inode !== BigInt(status.ino)
    ) {
      inspection.stateChanged = true;
      inspection.ownerEntryExclusive = false;
      return inspection;
    }
    const initialScan = await scanJsonlAuditLockDirectoryEntries(
      lockPath,
      lockDirectory
    );
    inspection.entryScanCount = initialScan.scannedEntryCount;
    inspection.entryScanLimit = initialScan.scanLimit;
    inspection.entryScanTruncated = initialScan.scanTruncated;
    if (!initialScan.scanTruncated) {
      inspection.entryCount = initialScan.entries.length;
    }

    const ownerInspection = initialScan.scanTruncated
      ? undefined
      : await inspectJsonlAuditLockPinnedOwnerMetadata(
        lockPath,
        undefined,
        true
      );
    pinnedOwner = ownerInspection?.pinnedOwner;
    const finalScan = await scanJsonlAuditLockDirectoryEntries(
      lockPath,
      lockDirectory
    );
    let stable = jsonlAuditLockDirectoryScansMatch(initialScan, finalScan)
      && await jsonlAuditLockPinnedDirectoryObservationMatches(
        lockPath,
        lockDirectory.handle,
        lockDirectory.identity
      );
    if (stable && pinnedOwner !== undefined) {
      const ownerSnapshot = await readJsonlAuditPinnedOwnerMetadataSnapshot(
        ownerInspection!.ownerPath,
        pinnedOwner.handle,
        pinnedOwner.identity
      );
      stable = ownerSnapshot !== undefined
        && jsonlAuditLockOwnerMetadataMatches(
          pinnedOwner.metadata,
          ownerSnapshot.metadata
        );
      if (stable) {
        stable = await jsonlAuditLockPinnedDirectoryObservationMatches(
          lockPath,
          lockDirectory.handle,
          lockDirectory.identity
        );
      }
    }
    let terminalOwnerInspection = ownerInspection;
    if (stable && ownerInspection !== undefined) {
      const currentOwnerInspection =
        await inspectJsonlAuditLockOwnerMetadata(lockPath);
      stable = jsonlAuditLockOwnerInspectionsMatch(
        ownerInspection,
        currentOwnerInspection
      );
      if (stable) {
        terminalOwnerInspection = currentOwnerInspection;
      }
    }
    if (!stable) {
      inspection.stateChanged = true;
      inspection.ownerEntryExclusive = false;
      return inspection;
    }

    inspection.ownerEntryExclusive = !initialScan.scanTruncated
      && initialScan.entries.length === 1
      && initialScan.entries[0] === JSONL_AUDIT_LOCK_OWNER_FILE_NAME;
    if (terminalOwnerInspection === undefined) {
      return inspection;
    }
    inspection.ownerPath = terminalOwnerInspection.ownerPath;
    inspection.ownerMetadataStatus = terminalOwnerInspection.status;
    if (terminalOwnerInspection.metadata !== undefined) {
      inspection.ownerToken = terminalOwnerInspection.metadata.ownerToken;
      inspection.ownerPid = terminalOwnerInspection.metadata.pid;
      inspection.ownerAcquiredAt = terminalOwnerInspection.metadata.acquiredAt;
      inspection.ownerAcquiredAtMs =
        terminalOwnerInspection.metadata.acquiredAtMs;
      if (
        inspection.ownerEntryExclusive
        && terminalOwnerInspection.fileIdentity !== undefined
      ) {
        inspection.ownerFingerprint = getJsonlAuditLockOwnerFingerprint({
          domain: "active",
          candidatePath: lockPath,
          layout: "owner_only",
          ownerLocation: "root",
          directories: [{
            role: "root",
            directoryPath: lockPath,
            identity: lockDirectory.identity
          }],
          ownerPath: terminalOwnerInspection.ownerPath,
          ownerIdentity: terminalOwnerInspection.fileIdentity,
          ownerMetadata: terminalOwnerInspection.metadata
        });
      }
    }
    return inspection;
  } catch (error) {
    inspection.ownerEntryExclusive = false;
    if (isJsonlAuditLockChangedError(error)) {
      inspection.stateChanged = true;
    } else {
      inspection.inspectionErrorCode = getJsonlAuditInspectionErrorCode(error);
    }
    return inspection;
  } finally {
    const handles = [
      ...(pinnedOwner === undefined ? [] : [pinnedOwner.handle]),
      ...(lockDirectory === undefined ? [] : [lockDirectory.handle])
    ];
    if (handles.length > 0) {
      try {
        await closeJsonlAuditInspectionResources(handles);
      } catch (error) {
        inspection.inspectionErrorCode = getJsonlAuditInspectionErrorCode(error);
        clearJsonlAuditLockInspectionOwnerAuthority(inspection);
      }
    }
  }
}

function clearJsonlAuditLockInspectionOwnerAuthority(
  inspection: JsonlAuditLockInspection
): void {
  inspection.ownerPath = undefined;
  inspection.ownerMetadataStatus = undefined;
  inspection.ownerEntryExclusive = false;
  inspection.ownerToken = undefined;
  inspection.ownerPid = undefined;
  inspection.ownerAcquiredAt = undefined;
  inspection.ownerAcquiredAtMs = undefined;
  inspection.ownerFingerprint = undefined;
}

export async function inspectJsonlAuditRotationStagings(
  filePath: string,
  now: () => number = Date.now
): Promise<JsonlAuditRotationStagingInspection> {
  const observedAt = validateJsonlAuditLockClock(now());
  const absoluteFilePath = path.resolve(filePath);
  const stagingPrefix = getJsonlAuditRotationStagingPrefix(absoluteFilePath);
  const stagingDirectory = path.dirname(stagingPrefix);
  const stagingNamePrefix = path.basename(stagingPrefix);
  const matchedNames: string[] = [];
  let legacyUnscopedEntryCount = 0;
  let scannedEntryCount = 0;
  let scanTruncated = false;
  const directory = await fs.opendir(stagingDirectory);
  let scanFailure: { reason: unknown } | undefined;
  try {
    let reachedEnd = false;
    while (scannedEntryCount < MAX_JSONL_AUDIT_ROTATION_STAGING_SCAN_ENTRIES) {
      const entry = await directory.read();
      if (entry === null) {
        reachedEnd = true;
        break;
      }
      scannedEntryCount += 1;
      if (isJsonlAuditRotationStagingName(entry.name, stagingNamePrefix)) {
        matchedNames.push(entry.name);
      } else if (JSONL_AUDIT_ROTATION_LEGACY_STAGING_NAME_PATTERN.test(entry.name)) {
        legacyUnscopedEntryCount += 1;
      }
    }
    if (!reachedEnd) {
      scanTruncated = await directory.read() !== null;
    }
  } catch (error) {
    scanFailure = { reason: error };
  }
  await closeJsonlAuditInspectionResourcesPreservingPrimary(
    [directory],
    scanFailure
  );

  matchedNames.sort((left, right) => left.localeCompare(right));
  const resultTruncated = matchedNames.length
    > MAX_JSONL_AUDIT_ROTATION_STAGING_RESULTS;
  const entries: JsonlAuditRotationStagingEntryInspection[] = [];
  for (const name of matchedNames.slice(
    0,
    MAX_JSONL_AUDIT_ROTATION_STAGING_RESULTS
  )) {
    const stagingId = name.slice(stagingNamePrefix.length);
    entries.push(await inspectJsonlAuditRotationStagingEntry(
      path.join(stagingDirectory, name),
      stagingId,
      observedAt
    ));
  }

  return {
    filePath: absoluteFilePath,
    stagingPrefix,
    scannedEntryCount,
    scanLimit: MAX_JSONL_AUDIT_ROTATION_STAGING_SCAN_ENTRIES,
    scanTruncated,
    matchedEntryCount: matchedNames.length,
    resultLimit: MAX_JSONL_AUDIT_ROTATION_STAGING_RESULTS,
    resultTruncated,
    legacyUnscopedEntryCount,
    entries
  };
}

export async function inspectJsonlAuditRotationStaging(
  filePath: string,
  stagingId: string,
  now: () => number = Date.now
): Promise<JsonlAuditRotationStagingEntryInspection> {
  return inspectJsonlAuditRotationStagingEntry(
    getJsonlAuditRotationStagingPath(filePath, stagingId),
    stagingId,
    validateJsonlAuditLockClock(now())
  );
}

export async function inspectJsonlAuditRotationRecovery(
  filePath: string,
  stagingId: string,
  now: () => number = Date.now
): Promise<JsonlAuditRotationRecoveryInspection> {
  const observedAt = validateJsonlAuditLockClock(now());
  const absoluteFilePath = path.resolve(filePath);
  const initialLock = await inspectJsonlAuditFileLock(
    absoluteFilePath,
    () => observedAt
  );
  const graph = await inspectJsonlAuditRotationRecoveryGraph(
    absoluteFilePath,
    stagingId,
    observedAt
  );
  const finalLock = await inspectJsonlAuditFileLock(
    absoluteFilePath,
    () => observedAt
  );
  const lockStable = jsonlAuditRotationRecoveryLockInspectionsMatch(
    initialLock,
    finalLock
  );
  const lockUncertain = initialLock.stateChanged === true
    || finalLock.stateChanged === true
    || initialLock.inspectionErrorCode !== undefined
    || finalLock.inspectionErrorCode !== undefined;
  const base: Omit<
    JsonlAuditRotationRecoveryInspection,
    "assessment" | "eligible"
  > = {
    filePath: graph.filePath,
    rotatedPath: graph.rotatedPath,
    stagingId,
    stagingPath: graph.stagingPath,
    coordinationLockPath: finalLock.lockPath,
    coordinationLockExists: finalLock.exists,
    coordinationLockEntryType: finalLock.entryType,
    coordinationLockAcquirable: finalLock.acquirable,
    coordinationLockEntryCount: finalLock.entryCount,
    coordinationLockEntryScanCount: finalLock.entryScanCount,
    coordinationLockEntryScanLimit: finalLock.entryScanLimit,
    coordinationLockEntryScanTruncated: finalLock.entryScanTruncated,
    coordinationLockOwnerEntryExclusive: finalLock.ownerEntryExclusive,
    ...(!lockStable || lockUncertain
      ? { coordinationLockStateChanged: true }
      : {}),
    coordinationLockInspectionErrorCode: finalLock.inspectionErrorCode,
    currentGeneration: graph.currentGeneration,
    rotatedGeneration: graph.rotatedGeneration,
    staging: graph.stagingDetails.inspection
  };

  if (!lockStable || lockUncertain) {
    return {
      ...base,
      assessment: "state_changed",
      eligible: false
    };
  }
  const classification = classifyJsonlAuditRotationRecoveryGraph(graph);
  if (
    classification.assessment === "state_changed"
    || classification.assessment === "staging_missing"
    || classification.assessment === "invalid_staging_state"
  ) {
    return {
      ...base,
      ...classification
    };
  }
  if (initialLock.exists || finalLock.exists) {
    return {
      ...base,
      assessment: "coordination_lock_present",
      eligible: false
    };
  }
  return {
    ...base,
    ...classification
  };
}

async function inspectJsonlAuditRotationRecoveryGraph(
  filePath: string,
  stagingId: string,
  observedAt: number
): Promise<JsonlAuditRotationRecoveryGraphInspection> {
  const absoluteFilePath = path.resolve(filePath);
  const rotatedPath = `${absoluteFilePath}.1`;
  const stagingPath = getJsonlAuditRotationStagingPath(
    absoluteFilePath,
    stagingId
  );
  const initialCurrent = await readJsonlAuditRotationRecoveryEntrySnapshot(
    absoluteFilePath
  );
  const initialRotated = await readJsonlAuditRotationRecoveryEntrySnapshot(
    rotatedPath
  );
  const stagingDetails = await inspectJsonlAuditRotationStagingEntryDetailed(
    stagingPath,
    stagingId,
    observedAt
  );
  const finalCurrent = await readJsonlAuditRotationRecoveryEntrySnapshot(
    absoluteFilePath
  );
  const finalRotated = await readJsonlAuditRotationRecoveryEntrySnapshot(
    rotatedPath
  );
  const currentStable = jsonlAuditOptionalRotationRecoveryEntrySnapshotsMatch(
    initialCurrent,
    finalCurrent
  );
  const rotatedStable = jsonlAuditOptionalRotationRecoveryEntrySnapshotsMatch(
    initialRotated,
    finalRotated
  );
  return {
    filePath: absoluteFilePath,
    rotatedPath,
    stagingId,
    stagingPath,
    currentSnapshot: initialCurrent,
    rotatedSnapshot: initialRotated,
    currentStable,
    rotatedStable,
    currentGeneration: toJsonlAuditRotationRecoveryGenerationInspection(
      absoluteFilePath,
      currentStable ? initialCurrent : finalCurrent,
      !currentStable
    ),
    rotatedGeneration: toJsonlAuditRotationRecoveryGenerationInspection(
      rotatedPath,
      rotatedStable ? initialRotated : finalRotated,
      !rotatedStable
    ),
    stagingDetails
  };
}

function classifyJsonlAuditRotationRecoveryGraph(
  graph: JsonlAuditRotationRecoveryGraphInspection
): JsonlAuditRotationRecoveryClassification {
  const {
    currentSnapshot,
    rotatedSnapshot,
    stagingDetails
  } = graph;
  if (
    !graph.currentStable
    || !graph.rotatedStable
    || stagingDetails.inspection.stateChanged === true
  ) {
    return {
      assessment: "state_changed",
      eligible: false
    };
  }
  if (
    !stagingDetails.inspection.exists
    && stagingDetails.inspection.inspectionErrorCode === undefined
  ) {
    return {
      assessment: "staging_missing",
      eligible: false
    };
  }
  if (!isJsonlAuditRotationRecoveryStagingValid(stagingDetails)) {
    return {
      assessment: "invalid_staging_state",
      eligible: false
    };
  }

  if (stagingDetails.inspection.layout === "empty") {
    const recommendedAction = "cleanup_empty_staging" as const;
    return {
      assessment: recommendedAction,
      eligible: true,
      recommendedAction,
      recoveryFingerprint: getJsonlAuditRotationRecoveryFingerprint({
        filePath: graph.filePath,
        stagingId: graph.stagingId,
        stagingPath: graph.stagingPath,
        action: recommendedAction,
        stagingRoot: stagingDetails.rootSnapshot!,
        current: currentSnapshot,
        rotated: rotatedSnapshot
      })
    };
  }

  const currentValid = isJsonlAuditRotationRecoveryGenerationValid(
    currentSnapshot
  );
  const rotatedValid = isJsonlAuditRotationRecoveryGenerationValid(
    rotatedSnapshot
  );
  if (currentValid && rotatedSnapshot === undefined) {
    const recommendedAction = "restore_previous_archive" as const;
    return {
      assessment: recommendedAction,
      eligible: true,
      recommendedAction,
      recoveryFingerprint: getJsonlAuditRotationRecoveryFingerprint({
        filePath: graph.filePath,
        stagingId: graph.stagingId,
        stagingPath: graph.stagingPath,
        action: recommendedAction,
        stagingRoot: stagingDetails.rootSnapshot!,
        previous: stagingDetails.previousSnapshot!,
        current: currentSnapshot,
        rotated: undefined
      })
    };
  }
  if (currentSnapshot === undefined && rotatedValid) {
    const recommendedAction = "rollback_full_rotation" as const;
    return {
      assessment: recommendedAction,
      eligible: true,
      recommendedAction,
      recoveryFingerprint: getJsonlAuditRotationRecoveryFingerprint({
        filePath: graph.filePath,
        stagingId: graph.stagingId,
        stagingPath: graph.stagingPath,
        action: recommendedAction,
        stagingRoot: stagingDetails.rootSnapshot!,
        previous: stagingDetails.previousSnapshot!,
        current: undefined,
        rotated: rotatedSnapshot
      })
    };
  }
  if (currentValid && rotatedValid) {
    return {
      assessment: "ambiguous_record_state",
      eligible: false
    };
  }
  if (
    (currentSnapshot !== undefined && !currentValid)
    || (rotatedSnapshot !== undefined && !rotatedValid)
  ) {
    return {
      assessment: "invalid_generation_state",
      eligible: false
    };
  }
  return {
    assessment: "unsupported_namespace_state",
    eligible: false
  };
}

export async function recoverJsonlAuditRotationStaging(
  filePath: string,
  stagingId: string,
  expectedAction: JsonlAuditRotationRecoveryAction,
  expectedRecoveryFingerprint: string,
  options: JsonlAuditRotationStagingRecoveryOptions = {}
): Promise<JsonlAuditRotationStagingRecoveryResult> {
  validateJsonlAuditRotationRecoveryAction(expectedAction);
  if (!JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_PATTERN.test(
    expectedRecoveryFingerprint
  )) {
    throw new Error(
      `Invalid audit rotation recovery fingerprint: expected ${JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_HEX_LENGTH} lowercase hexadecimal characters.`
    );
  }
  const absoluteFilePath = path.resolve(filePath);
  const stagingPath = getJsonlAuditRotationStagingPath(
    absoluteFilePath,
    stagingId
  );
  const rotatedPath = `${absoluteFilePath}.1`;
  const coordinationLockPath = getJsonlAuditLockPath(absoluteFilePath);
  const durability = validateJsonlAuditDurability(
    options.durability ?? DEFAULT_JSONL_AUDIT_DURABILITY
  );
  const coordinationKey = absoluteFilePath;
  const previous = auditWriteTails.get(coordinationKey) ?? Promise.resolve();
  const recovery = previous.catch(() => undefined).then(async () => {
    let lock: JsonlAuditFileLock;
    try {
      lock = await acquireJsonlAuditFileLock(
        absoluteFilePath,
        options.lockOptions
      );
    } catch (error) {
      throw new JsonlAuditRotationStagingRecoveryError(
        getJsonlAuditRotationRecoveryErrorMessage(error),
        {
          filePath: absoluteFilePath,
          rotatedPath,
          stagingId,
          stagingPath,
          requestedAction: expectedAction,
          expectedRecoveryFingerprint,
          stage: "lock_acquisition",
          mutationState: "not_started",
          rollbackAttempted: false,
          coordinationLockPath,
          coordinationLockAcquired: false,
          postFailureObservationCompleted: false
        },
        error
      );
    }
    let operationCompleted = false;
    let operationResult!: JsonlAuditRotationStagingRecoveryOperationResult;
    let operationError: unknown;
    try {
      operationResult = await recoverJsonlAuditRotationStagingUnderLock(
        absoluteFilePath,
        stagingId,
        stagingPath,
        expectedAction,
        expectedRecoveryFingerprint,
        durability,
        lock,
        options
      );
      operationCompleted = true;
    } catch (error) {
      operationError = error;
    }
    let postFailureObservation:
      JsonlAuditRotationStagingRecoveryFailureObservationOutcome = {
        completed: false
      };
    if (!operationCompleted) {
      postFailureObservation =
        await inspectJsonlAuditRotationStagingRecoveryFailureUnderLock(
        absoluteFilePath,
        stagingId,
        lock
      );
    }
    const lockFinalization = await finalizeJsonlAuditRotationRecoveryLock(
      lock
    );
    if (!operationCompleted) {
      const failure = createJsonlAuditRotationStagingRecoveryOperationError(
        operationError,
        {
          stage: "locked_revalidation",
          mutationState: "not_started",
          rollbackAttempted: false
        }
      );
      throw new JsonlAuditRotationStagingRecoveryError(
        failure.message,
        {
          filePath: absoluteFilePath,
          rotatedPath,
          stagingId,
          stagingPath,
          requestedAction: expectedAction,
          expectedRecoveryFingerprint,
          ...(failure.details.recoveryFingerprint === undefined
            ? {}
            : {
              recoveryFingerprint: failure.details.recoveryFingerprint
            }),
          stage: failure.details.stage,
          mutationState: failure.details.mutationState,
          rollbackAttempted: failure.details.rollbackAttempted,
          ...(failure.details.rollbackCompleted === undefined
            ? {}
            : { rollbackCompleted: failure.details.rollbackCompleted }),
          ...(failure.details.recoveryHandlesClosed === undefined
            ? {}
            : {
              recoveryHandlesClosed:
                failure.details.recoveryHandlesClosed
            }),
          ...(failure.details.recoveryHandleWarning === undefined
            ? {}
            : {
              recoveryHandleWarning:
                failure.details.recoveryHandleWarning
            }),
          coordinationLockPath: lock.lockPath,
          coordinationLockAcquired: true,
          coordinationLockReleased: lockFinalization.released,
          ...(lockFinalization.residualLockPath === undefined
            ? {}
            : {
              residualCoordinationLockPath:
                lockFinalization.residualLockPath
            }),
          ...(lockFinalization.warning === undefined
            ? {}
            : { coordinationLockWarning: lockFinalization.warning }),
          postFailureObservationCompleted:
            postFailureObservation.completed,
          ...(postFailureObservation.observation === undefined
            ? {}
            : {
              postFailureObservation:
                postFailureObservation.observation
            }),
          ...(postFailureObservation.warning === undefined
            ? {}
            : {
              postFailureObservationWarning:
                postFailureObservation.warning
            })
        },
        failure
      );
    }
    return {
      ...operationResult,
      ...(operationResult.mutationPerformed
        ? { performedAction: expectedAction }
        : {}),
      coordinationLockPath: lock.lockPath,
      coordinationLockReleased: lockFinalization.released,
      ...(lockFinalization.residualLockPath === undefined
        ? {}
        : {
          residualCoordinationLockPath: lockFinalization.residualLockPath
        }),
      ...(lockFinalization.warning === undefined
        ? {}
        : { coordinationLockWarning: lockFinalization.warning })
    };
  });
  const tail = recovery.then(() => undefined);
  auditWriteTails.set(coordinationKey, tail);
  void tail.finally(() => {
    if (auditWriteTails.get(coordinationKey) === tail) {
      auditWriteTails.delete(coordinationKey);
    }
  }).catch(() => undefined);
  return recovery;
}

async function inspectJsonlAuditRotationStagingRecoveryFailureUnderLock(
  filePath: string,
  stagingId: string,
  lock: JsonlAuditFileLock
): Promise<JsonlAuditRotationStagingRecoveryFailureObservationOutcome> {
  const lockError =
    "Audit file lock changed during post-failure rotation staging recovery observation.";
  try {
    await assertAcquiredJsonlAuditFileLockHeld(lock, lockError);
    const graph = await inspectJsonlAuditRotationRecoveryGraph(
      filePath,
      stagingId,
      validateJsonlAuditLockClock(Date.now())
    );
    await assertAcquiredJsonlAuditFileLockHeld(lock, lockError);
    const classification = classifyJsonlAuditRotationRecoveryGraph(graph);
    return {
      completed: true,
      observation: {
        observedWhileCoordinationLockHeld: true,
        assessment: classification.assessment,
        eligible: classification.eligible,
        ...(classification.recommendedAction === undefined
          ? {}
          : { recommendedAction: classification.recommendedAction }),
        ...(classification.recoveryFingerprint === undefined
          ? {}
          : { recoveryFingerprint: classification.recoveryFingerprint }),
        currentGeneration: graph.currentGeneration,
        rotatedGeneration: graph.rotatedGeneration,
        staging: graph.stagingDetails.inspection
      }
    };
  } catch (error) {
    return {
      completed: false,
      warning: `post-failure namespace observation could not be completed: ${getJsonlAuditRotationRecoveryErrorMessage(error)}`
    };
  }
}

async function finalizeJsonlAuditRotationRecoveryLock(
  lock: JsonlAuditFileLock
): Promise<JsonlAuditRotationRecoveryLockFinalizationOutcome> {
  const warnings: string[] = [];
  let releaseFailedDuringLifecycleClose = false;
  try {
    await lock.release();
    return { released: true };
  } catch (error) {
    releaseFailedDuringLifecycleClose =
      error instanceof JsonlAuditLockLifecycleCloseError;
    warnings.push(
      `coordination lock release failed: ${getJsonlAuditRotationRecoveryErrorMessage(error)}`
    );
  }

  if (!releaseFailedDuringLifecycleClose) {
    try {
      await lock.abandon();
    } catch (error) {
      warnings.push(
        `coordination lock handle abandonment failed: ${getJsonlAuditRotationRecoveryErrorMessage(error)}`
      );
    }
  }

  let residualLockPath: string | undefined;
  try {
    await fs.lstat(lock.lockPath);
    residualLockPath = lock.lockPath;
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      warnings.push(
        `coordination lock residue could not be inspected: ${getJsonlAuditRotationRecoveryErrorMessage(error)}`
      );
    }
  }
  return {
    released: false,
    ...(residualLockPath === undefined ? {} : { residualLockPath }),
    warning: warnings.join("; ")
  };
}

async function recoverJsonlAuditRotationStagingUnderLock(
  filePath: string,
  stagingId: string,
  stagingPath: string,
  expectedAction: JsonlAuditRotationRecoveryAction,
  expectedRecoveryFingerprint: string,
  durability: JsonlAuditDurability,
  lock: JsonlAuditFileLock,
  options: JsonlAuditRotationStagingRecoveryOptions
): Promise<JsonlAuditRotationStagingRecoveryOperationResult> {
  const lockError = "Audit file lock changed during rotation staging recovery.";
  let graph!: JsonlAuditRotationRecoveryGraphInspection;
  let classification!: JsonlAuditRotationRecoveryClassification;
  try {
    await assertAcquiredJsonlAuditFileLockHeld(lock, lockError);
    graph = await inspectJsonlAuditRotationRecoveryGraph(
      filePath,
      stagingId,
      validateJsonlAuditLockClock(Date.now())
    );
    await assertAcquiredJsonlAuditFileLockHeld(lock, lockError);
    classification = classifyJsonlAuditRotationRecoveryGraph(graph);
    if (classification.assessment === "staging_missing") {
      return {
        filePath,
        rotatedPath: graph.rotatedPath,
        stagingId,
        stagingPath,
        requestedAction: expectedAction,
        expectedRecoveryFingerprint,
        existed: false,
        recovered: false,
        mutationPerformed: false,
        stagingRemoved: false,
        durability,
        durabilityCompleted: true,
        recoveryHandlesClosed: true
      };
    }
    assertJsonlAuditRotationRecoveryExpectation(
      classification,
      expectedAction,
      expectedRecoveryFingerprint
    );

    await options.beforeMutation?.();
    await assertAcquiredJsonlAuditFileLockHeld(lock, lockError);
    graph = await inspectJsonlAuditRotationRecoveryGraph(
      filePath,
      stagingId,
      validateJsonlAuditLockClock(Date.now())
    );
    await assertAcquiredJsonlAuditFileLockHeld(lock, lockError);
    classification = classifyJsonlAuditRotationRecoveryGraph(graph);
    assertJsonlAuditRotationRecoveryExpectation(
      classification,
      expectedAction,
      expectedRecoveryFingerprint
    );
  } catch (error) {
    throw createJsonlAuditRotationStagingRecoveryOperationError(error, {
      stage: "locked_revalidation",
      mutationState: "not_started",
      rollbackAttempted: false,
      ...(classification?.recoveryFingerprint === undefined
        ? {}
        : { recoveryFingerprint: classification.recoveryFingerprint })
    });
  }

  let candidate: JsonlAuditRotationStagingRecoveryCandidate;
  try {
    candidate = await openJsonlAuditRotationStagingRecoveryCandidate(
      graph,
      expectedAction
    );
  } catch (error) {
    throw createJsonlAuditRotationStagingRecoveryOperationError(error, {
      stage: "candidate_open",
      mutationState: "not_started",
      rollbackAttempted: false,
      ...(classification.recoveryFingerprint === undefined
        ? {}
        : { recoveryFingerprint: classification.recoveryFingerprint })
    });
  }
  let operationCompleted = false;
  let operationResult!: JsonlAuditRotationStagingRecoveryOperationResult;
  let operationError: unknown;
  try {
    try {
      await assertAcquiredJsonlAuditFileLockHeld(lock, lockError);
      await assertJsonlAuditRotationStagingRecoveryCandidate(
        candidate,
        expectedAction,
        "Audit rotation staging changed before recovery mutation."
      );
    } catch (error) {
      throw createJsonlAuditRotationStagingRecoveryOperationError(error, {
        stage: "candidate_revalidation",
        mutationState: "not_started",
        rollbackAttempted: false,
        ...(classification.recoveryFingerprint === undefined
          ? {}
          : { recoveryFingerprint: classification.recoveryFingerprint })
      });
    }
    const outcome = expectedAction === "cleanup_empty_staging"
      ? await cleanupEmptyJsonlAuditRotationStagingCandidate(
        candidate,
        durability,
        lock,
        options
      )
      : await restoreJsonlAuditRotationStagingCandidate(
        candidate,
        expectedAction,
        durability,
        lock,
        options
      );
    operationResult = {
      filePath,
      rotatedPath: graph.rotatedPath,
      stagingId,
      stagingPath,
      requestedAction: expectedAction,
      expectedRecoveryFingerprint,
      recoveryFingerprint: classification.recoveryFingerprint,
      existed: true,
      ...outcome,
      durability,
      recoveryHandlesClosed: true
    };
    operationCompleted = true;
  } catch (error) {
    operationError = createJsonlAuditRotationStagingRecoveryOperationError(
      error,
      {
        stage: "mutation",
        mutationState: "not_started",
        rollbackAttempted: false,
        ...(classification.recoveryFingerprint === undefined
          ? {}
          : { recoveryFingerprint: classification.recoveryFingerprint })
      }
    );
  }
  const handleFinalization = await closeJsonlAuditRotationRecoveryHandles([
    ...(candidate.generationHandle === undefined
      ? []
      : [candidate.generationHandle]),
    candidate.stagingDirectory.handle,
    candidate.parentDirectory.handle
  ]);
  if (!operationCompleted) {
    throw addJsonlAuditRotationRecoveryHandleFinalization(
      operationError,
      {
        stage: "mutation",
        mutationState: "not_started",
        rollbackAttempted: false,
        ...(classification.recoveryFingerprint === undefined
          ? {}
          : { recoveryFingerprint: classification.recoveryFingerprint })
      },
      handleFinalization
    );
  }
  return {
    ...operationResult,
    recoveryHandlesClosed: handleFinalization.closed,
    ...(handleFinalization.warning === undefined
      ? {}
      : { recoveryHandleWarning: handleFinalization.warning })
  };
}

function assertJsonlAuditRotationRecoveryExpectation(
  classification: JsonlAuditRotationRecoveryClassification,
  expectedAction: JsonlAuditRotationRecoveryAction,
  expectedRecoveryFingerprint: string
): void {
  if (
    !classification.eligible
    || classification.recommendedAction === undefined
    || classification.recoveryFingerprint === undefined
  ) {
    throw new Error(
      `Audit rotation staging recovery refused: current assessment is ${classification.assessment}.`
    );
  }
  if (classification.recommendedAction !== expectedAction) {
    throw new Error(
      `Audit rotation staging recovery refused: expected action ${expectedAction} does not match current action ${classification.recommendedAction}.`
    );
  }
  if (classification.recoveryFingerprint !== expectedRecoveryFingerprint) {
    throw new Error(
      "Audit rotation staging recovery refused: recovery fingerprint does not match the current graph."
    );
  }
}

async function openJsonlAuditRotationStagingRecoveryCandidate(
  graph: JsonlAuditRotationRecoveryGraphInspection,
  action: JsonlAuditRotationRecoveryAction
): Promise<JsonlAuditRotationStagingRecoveryCandidate> {
  const errorMessage = "Audit rotation staging changed before recovery mutation.";
  const failedOpenHandles: FileHandle[] = [];
  let parentDirectory: JsonlAuditPinnedMutationDirectory | undefined;
  let stagingDirectory: JsonlAuditPinnedTemporaryMutationDirectory | undefined;
  let generationHandle: FileHandle | undefined;
  try {
    const parentPath = path.dirname(graph.filePath);
    parentDirectory = await openAuditPinnedMutationDirectory(
      parentPath,
      parentPath,
      undefined,
      errorMessage,
      failedOpenHandles,
      false,
      true
    );
    const openedStaging = await openAuditPinnedMutationDirectory(
      graph.stagingPath,
      graph.stagingPath,
      undefined,
      errorMessage,
      failedOpenHandles,
      false,
      true
    );
    stagingDirectory = {
      ...openedStaging,
      name: path.basename(graph.stagingPath)
    };

    let generationIdentity: JsonlAuditFileIdentity | undefined;
    let generationSnapshot: JsonlAuditRotationEntrySnapshot | undefined;
    if (action !== "cleanup_empty_staging") {
      const generationPath = action === "restore_previous_archive"
        ? graph.filePath
        : graph.rotatedPath;
      const expectedGeneration = action === "restore_previous_archive"
        ? graph.currentSnapshot
        : graph.rotatedSnapshot;
      if (expectedGeneration === undefined) {
        throw new Error(errorMessage);
      }
      const mutationPath = await resolveJsonlAuditDirectoryMutationPath(
        {
          directoryPath: parentDirectory.directoryPath,
          handle: parentDirectory.handle
        },
        path.basename(generationPath)
      );
      generationHandle = await fs.open(
        mutationPath.path,
        constants.O_RDONLY
          | ("O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0)
      );
      await assertJsonlAuditRotationRecoveryHandlePathSnapshot(
        generationPath,
        generationHandle,
        expectedGeneration,
        errorMessage
      );
      const status = await generationHandle.stat();
      generationIdentity = { device: status.dev, inode: status.ino };
      generationSnapshot = toJsonlAuditRotationEntrySnapshot(
        expectedGeneration
      );
    }

    const candidate: JsonlAuditRotationStagingRecoveryCandidate = {
      graph,
      parentDirectory,
      stagingDirectory,
      ...(generationHandle === undefined ? {} : { generationHandle }),
      ...(generationIdentity === undefined ? {} : { generationIdentity }),
      ...(generationSnapshot === undefined ? {} : { generationSnapshot }),
      ...(graph.stagingDetails.previousSnapshot === undefined
        ? {}
        : {
          previousSnapshot: toJsonlAuditRotationEntrySnapshot(
            graph.stagingDetails.previousSnapshot
          )
        })
    };
    await assertJsonlAuditRotationStagingRecoveryCandidate(
      candidate,
      action,
      errorMessage
    );
    return candidate;
  } catch (error) {
    const handles = [...new Set([
      ...failedOpenHandles,
      ...(generationHandle === undefined ? [] : [generationHandle]),
      ...(stagingDirectory === undefined ? [] : [stagingDirectory.handle]),
      ...(parentDirectory === undefined ? [] : [parentDirectory.handle])
    ])];
    const handleFinalization = await closeJsonlAuditRotationRecoveryHandles(
      handles
    );
    throw addJsonlAuditRotationRecoveryHandleFinalization(
      error,
      {
        stage: "candidate_open",
        mutationState: "not_started",
        rollbackAttempted: false
      },
      handleFinalization
    );
  }
}

async function assertJsonlAuditRotationStagingRecoveryCandidate(
  candidate: JsonlAuditRotationStagingRecoveryCandidate,
  action: JsonlAuditRotationRecoveryAction,
  errorMessage: string
): Promise<void> {
  const { graph, parentDirectory, stagingDirectory } = candidate;
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    parentDirectory.identity,
    errorMessage
  );
  const rootSnapshot = graph.stagingDetails.rootSnapshot;
  if (rootSnapshot === undefined) {
    throw new Error(errorMessage);
  }
  await assertJsonlAuditRotationRecoveryHandlePathSnapshot(
    graph.stagingPath,
    stagingDirectory.handle,
    rootSnapshot,
    errorMessage
  );
  await assertJsonlAuditOptionalRotationRecoveryEntrySnapshot(
    graph.filePath,
    graph.currentSnapshot,
    errorMessage
  );
  await assertJsonlAuditOptionalRotationRecoveryEntrySnapshot(
    graph.rotatedPath,
    graph.rotatedSnapshot,
    errorMessage
  );

  if (action === "cleanup_empty_staging") {
    await assertPinnedAuditTemporaryDirectoryEntries(
      stagingDirectory,
      [],
      errorMessage
    );
    return;
  }

  await assertPinnedAuditTemporaryDirectoryEntries(
    stagingDirectory,
    [JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME],
    errorMessage
  );
  const previousSnapshot = graph.stagingDetails.previousSnapshot;
  if (
    previousSnapshot === undefined
    || candidate.generationHandle === undefined
    || candidate.generationSnapshot === undefined
    || candidate.generationIdentity === undefined
  ) {
    throw new Error(errorMessage);
  }
  const previousMutationPath = await resolveJsonlAuditDirectoryMutationPath(
    {
      directoryPath: stagingDirectory.directoryPath,
      handle: stagingDirectory.handle
    },
    JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME
  );
  await assertJsonlAuditRotationRecoveryEntrySnapshot(
    previousMutationPath.path,
    previousSnapshot,
    errorMessage
  );
  const generationPath = action === "restore_previous_archive"
    ? graph.filePath
    : graph.rotatedPath;
  const expectedGeneration = action === "restore_previous_archive"
    ? graph.currentSnapshot
    : graph.rotatedSnapshot;
  if (expectedGeneration === undefined) {
    throw new Error(errorMessage);
  }
  await assertJsonlAuditRotationRecoveryHandlePathSnapshot(
    generationPath,
    candidate.generationHandle,
    expectedGeneration,
    errorMessage
  );
}

async function cleanupEmptyJsonlAuditRotationStagingCandidate(
  candidate: JsonlAuditRotationStagingRecoveryCandidate,
  durability: JsonlAuditDurability,
  lock: JsonlAuditFileLock,
  options: JsonlAuditRotationStagingRecoveryOptions
): Promise<JsonlAuditRotationStagingRecoveryMutationOutcome> {
  const errorMessage = "Audit rotation staging changed during empty recovery cleanup.";
  let mutationAttempted = false;
  try {
    await options.beforeStagingRemoval?.();
    await assertAcquiredJsonlAuditFileLockHeld(lock, errorMessage);
    await assertJsonlAuditRotationStagingRecoveryCandidate(
      candidate,
      "cleanup_empty_staging",
      errorMessage
    );
    mutationAttempted = true;
    await removeJsonlAuditRotationBackupDirectory(
      candidate.stagingDirectory,
      candidate.parentDirectory,
      errorMessage
    );
  } catch (error) {
    throw createJsonlAuditRotationStagingRecoveryOperationError(error, {
      stage: "mutation",
      mutationState: mutationAttempted
        ? "attempted_unconfirmed"
        : "not_started",
      rollbackAttempted: false
    });
  }

  if (durability === "full" && process.platform !== "win32") {
    try {
      await syncAuditParentDirectory(
        candidate.parentDirectory,
        candidate.parentDirectory.identity
      );
    } catch (error) {
      return {
        recovered: true,
        mutationPerformed: true,
        stagingRemoved: true,
        durabilityCompleted: false,
        warning: `empty staging was removed, but parent durability could not be confirmed: ${getJsonlAuditRotationRecoveryErrorMessage(error)}`
      };
    }
  }
  return {
    recovered: true,
    mutationPerformed: true,
    stagingRemoved: true,
    durabilityCompleted: true
  };
}

async function restoreJsonlAuditRotationStagingCandidate(
  candidate: JsonlAuditRotationStagingRecoveryCandidate,
  action: Exclude<
    JsonlAuditRotationRecoveryAction,
    "cleanup_empty_staging"
  >,
  durability: JsonlAuditDurability,
  lock: JsonlAuditFileLock,
  options: JsonlAuditRotationStagingRecoveryOptions
): Promise<JsonlAuditRotationStagingRecoveryMutationOutcome> {
  const errorMessage = "Audit rotation staging changed during recovery mutation.";
  if (
    candidate.generationHandle === undefined
    || candidate.generationIdentity === undefined
    || candidate.generationSnapshot === undefined
    || candidate.previousSnapshot === undefined
  ) {
    throw createJsonlAuditRotationStagingRecoveryOperationError(
      new Error(errorMessage),
      {
        stage: "mutation",
        mutationState: "not_started",
        rollbackAttempted: false
      }
    );
  }
  let mutationAttempted = false;
  let currentRestored = false;
  let archiveRestored = false;
  let generationCommitted = false;
  try {
    await assertAcquiredJsonlAuditFileLockHeld(lock, errorMessage);
    await assertJsonlAuditRotationStagingRecoveryCandidate(
      candidate,
      action,
      errorMessage
    );
    if (action === "rollback_full_rotation") {
      mutationAttempted = true;
      await renameJsonlAuditDirectoryEntry(
        {
          directoryPath: candidate.parentDirectory.directoryPath,
          handle: candidate.parentDirectory.handle
        },
        path.basename(candidate.graph.rotatedPath),
        {
          directoryPath: candidate.parentDirectory.directoryPath,
          handle: candidate.parentDirectory.handle
        },
        path.basename(candidate.graph.filePath)
      );
      currentRestored = true;
      await options.afterCurrentRestore?.();
      await assertJsonlAuditRotationRecoveryCurrentRestored(
        candidate,
        errorMessage
      );
    }

    await assertAcquiredJsonlAuditFileLockHeld(lock, errorMessage);
    if (action === "restore_previous_archive") {
      await assertJsonlAuditRotationStagingRecoveryCandidate(
        candidate,
        action,
        errorMessage
      );
    } else {
      await assertJsonlAuditRotationRecoveryCurrentRestored(
        candidate,
        errorMessage
      );
    }
    mutationAttempted = true;
    await renameJsonlAuditDirectoryEntry(
      {
        directoryPath: candidate.stagingDirectory.directoryPath,
        handle: candidate.stagingDirectory.handle
      },
      JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME,
      {
        directoryPath: candidate.parentDirectory.directoryPath,
        handle: candidate.parentDirectory.handle
      },
      path.basename(candidate.graph.rotatedPath)
    );
    archiveRestored = true;
    await options.afterArchiveRestore?.();
    await assertJsonlAuditRotationRecoveryGenerationCommitted(
      candidate,
      action,
      errorMessage
    );
    await assertAcquiredJsonlAuditFileLockHeld(lock, errorMessage);
    generationCommitted = true;
  } catch (error) {
    if (!generationCommitted && (currentRestored || archiveRestored)) {
      const rolledBack = await rollbackJsonlAuditRotationStagingRecovery(
        candidate,
        action,
        currentRestored,
        archiveRestored,
        durability,
        lock
      );
      if (!rolledBack) {
        throw new JsonlAuditRotationStagingRecoveryOperationError(
          `Audit rotation staging recovery could not restore its initial namespace; residue retained at ${candidate.graph.stagingPath}.`,
          {
            stage: "rollback",
            mutationState: "uncertain",
            rollbackAttempted: true,
            rollbackCompleted: false
          },
          error
        );
      }
      throw createJsonlAuditRotationStagingRecoveryOperationError(error, {
        stage: "mutation",
        mutationState: "rolled_back",
        rollbackAttempted: true,
        rollbackCompleted: true
      });
    }
    throw createJsonlAuditRotationStagingRecoveryOperationError(error, {
      stage: "mutation",
      mutationState: mutationAttempted
        ? "attempted_unconfirmed"
        : "not_started",
      rollbackAttempted: false
    });
  }

  return finalizeJsonlAuditRotationStagingRecovery(
    candidate,
    action,
    durability,
    lock,
    options
  );
}

async function assertJsonlAuditRotationRecoveryCurrentRestored(
  candidate: JsonlAuditRotationStagingRecoveryCandidate,
  errorMessage: string
): Promise<void> {
  if (
    candidate.generationHandle === undefined
    || candidate.generationIdentity === undefined
    || candidate.generationSnapshot === undefined
    || candidate.previousSnapshot === undefined
  ) {
    throw new Error(errorMessage);
  }
  await assertPinnedAuditMutationDirectory(
    candidate.parentDirectory,
    candidate.parentDirectory.identity,
    errorMessage
  );
  await assertAuditFileHandlePathIdentity(
    candidate.graph.filePath,
    candidate.generationHandle,
    candidate.generationIdentity,
    errorMessage
  );
  await assertJsonlAuditRotationEntrySnapshot(
    candidate.graph.filePath,
    candidate.generationSnapshot,
    errorMessage
  );
  await assertAuditPathMissing(candidate.graph.rotatedPath, errorMessage);
  await assertPinnedAuditTemporaryDirectoryEntries(
    candidate.stagingDirectory,
    [JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME],
    errorMessage
  );
  const previousMutationPath = await resolveJsonlAuditDirectoryMutationPath(
    {
      directoryPath: candidate.stagingDirectory.directoryPath,
      handle: candidate.stagingDirectory.handle
    },
    JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME
  );
  await assertJsonlAuditRotationEntrySnapshot(
    previousMutationPath.path,
    candidate.previousSnapshot,
    errorMessage
  );
}

async function assertJsonlAuditRotationRecoveryGenerationCommitted(
  candidate: JsonlAuditRotationStagingRecoveryCandidate,
  action: Exclude<
    JsonlAuditRotationRecoveryAction,
    "cleanup_empty_staging"
  >,
  errorMessage: string
): Promise<void> {
  if (
    candidate.generationHandle === undefined
    || candidate.generationIdentity === undefined
    || candidate.generationSnapshot === undefined
    || candidate.previousSnapshot === undefined
  ) {
    throw new Error(errorMessage);
  }
  await assertPinnedAuditMutationDirectory(
    candidate.parentDirectory,
    candidate.parentDirectory.identity,
    errorMessage
  );
  if (action === "restore_previous_archive") {
    const currentSnapshot = candidate.graph.currentSnapshot;
    if (currentSnapshot === undefined) {
      throw new Error(errorMessage);
    }
    await assertJsonlAuditRotationRecoveryHandlePathSnapshot(
      candidate.graph.filePath,
      candidate.generationHandle,
      currentSnapshot,
      errorMessage
    );
  } else {
    await assertAuditFileHandlePathIdentity(
      candidate.graph.filePath,
      candidate.generationHandle,
      candidate.generationIdentity,
      errorMessage
    );
    await assertJsonlAuditRotationEntrySnapshot(
      candidate.graph.filePath,
      candidate.generationSnapshot,
      errorMessage
    );
  }
  await assertJsonlAuditRotationEntrySnapshot(
    candidate.graph.rotatedPath,
    candidate.previousSnapshot,
    errorMessage
  );
  await assertPinnedAuditTemporaryDirectoryEntries(
    candidate.stagingDirectory,
    [],
    errorMessage
  );
}

async function rollbackJsonlAuditRotationStagingRecovery(
  candidate: JsonlAuditRotationStagingRecoveryCandidate,
  action: Exclude<
    JsonlAuditRotationRecoveryAction,
    "cleanup_empty_staging"
  >,
  currentRestored: boolean,
  archiveRestored: boolean,
  durability: JsonlAuditDurability,
  lock: JsonlAuditFileLock
): Promise<boolean> {
  const errorMessage = "Audit rotation staging changed during recovery rollback.";
  try {
    if (
      candidate.generationHandle === undefined
      || candidate.generationIdentity === undefined
      || candidate.generationSnapshot === undefined
      || candidate.previousSnapshot === undefined
    ) {
      return false;
    }
    await assertAcquiredJsonlAuditFileLockHeld(lock, errorMessage);
    await assertPinnedAuditMutationDirectory(
      candidate.parentDirectory,
      candidate.parentDirectory.identity,
      errorMessage
    );
    if (archiveRestored) {
      await assertJsonlAuditRotationEntrySnapshot(
        candidate.graph.rotatedPath,
        candidate.previousSnapshot,
        errorMessage
      );
      await assertPinnedAuditTemporaryDirectoryEntries(
        candidate.stagingDirectory,
        [],
        errorMessage
      );
      if (action === "restore_previous_archive") {
        const currentSnapshot = candidate.graph.currentSnapshot;
        if (currentSnapshot === undefined) {
          return false;
        }
        await assertJsonlAuditRotationRecoveryHandlePathSnapshot(
          candidate.graph.filePath,
          candidate.generationHandle,
          currentSnapshot,
          errorMessage
        );
      } else {
        await assertAuditFileHandlePathIdentity(
          candidate.graph.filePath,
          candidate.generationHandle,
          candidate.generationIdentity,
          errorMessage
        );
        await assertJsonlAuditRotationEntrySnapshot(
          candidate.graph.filePath,
          candidate.generationSnapshot,
          errorMessage
        );
      }
      await renameJsonlAuditDirectoryEntry(
        {
          directoryPath: candidate.parentDirectory.directoryPath,
          handle: candidate.parentDirectory.handle
        },
        path.basename(candidate.graph.rotatedPath),
        {
          directoryPath: candidate.stagingDirectory.directoryPath,
          handle: candidate.stagingDirectory.handle
        },
        JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME
      );
      archiveRestored = false;
      await assertAuditPathMissing(candidate.graph.rotatedPath, errorMessage);
      await assertPinnedAuditTemporaryDirectoryEntries(
        candidate.stagingDirectory,
        [JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME],
        errorMessage
      );
      const previousMutationPath = await resolveJsonlAuditDirectoryMutationPath(
        {
          directoryPath: candidate.stagingDirectory.directoryPath,
          handle: candidate.stagingDirectory.handle
        },
        JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME
      );
      await assertJsonlAuditRotationEntrySnapshot(
        previousMutationPath.path,
        candidate.previousSnapshot,
        errorMessage
      );
    }
    if (currentRestored) {
      await assertAuditFileHandlePathIdentity(
        candidate.graph.filePath,
        candidate.generationHandle,
        candidate.generationIdentity,
        errorMessage
      );
      await assertJsonlAuditRotationEntrySnapshot(
        candidate.graph.filePath,
        candidate.generationSnapshot,
        errorMessage
      );
      await assertAuditPathMissing(candidate.graph.rotatedPath, errorMessage);
      await renameJsonlAuditDirectoryEntry(
        {
          directoryPath: candidate.parentDirectory.directoryPath,
          handle: candidate.parentDirectory.handle
        },
        path.basename(candidate.graph.filePath),
        {
          directoryPath: candidate.parentDirectory.directoryPath,
          handle: candidate.parentDirectory.handle
        },
        path.basename(candidate.graph.rotatedPath)
      );
      currentRestored = false;
      await assertAuditPathMissing(candidate.graph.filePath, errorMessage);
      await assertAuditFileHandlePathIdentity(
        candidate.graph.rotatedPath,
        candidate.generationHandle,
        candidate.generationIdentity,
        errorMessage
      );
      await assertJsonlAuditRotationEntrySnapshot(
        candidate.graph.rotatedPath,
        candidate.generationSnapshot,
        errorMessage
      );
    }
    await assertPinnedAuditTemporaryDirectoryEntries(
      candidate.stagingDirectory,
      [JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME],
      errorMessage
    );
    await assertAcquiredJsonlAuditFileLockHeld(lock, errorMessage);
    if (durability === "full" && process.platform !== "win32") {
      await candidate.stagingDirectory.handle.sync();
      await syncAuditParentDirectory(
        candidate.parentDirectory,
        candidate.parentDirectory.identity
      );
    }
    return !currentRestored && !archiveRestored;
  } catch {
    return false;
  }
}

async function finalizeJsonlAuditRotationStagingRecovery(
  candidate: JsonlAuditRotationStagingRecoveryCandidate,
  action: Exclude<
    JsonlAuditRotationRecoveryAction,
    "cleanup_empty_staging"
  >,
  durability: JsonlAuditDurability,
  lock: JsonlAuditFileLock,
  options: JsonlAuditRotationStagingRecoveryOptions
): Promise<JsonlAuditRotationStagingRecoveryMutationOutcome> {
  const warnings: string[] = [];
  let stagingSyncCompleted = true;
  let stagingRemoved = false;
  const fullDirectoryDurability = durability === "full"
    && process.platform !== "win32";
  if (fullDirectoryDurability) {
    try {
      await candidate.stagingDirectory.handle.sync();
    } catch (error) {
      stagingSyncCompleted = false;
      warnings.push(
        `staging durability could not be confirmed: ${getJsonlAuditRotationRecoveryErrorMessage(error)}`
      );
    }
  }

  if (stagingSyncCompleted) {
    try {
      await options.beforeStagingRemoval?.();
      await assertAcquiredJsonlAuditFileLockHeld(
        lock,
        "Audit file lock changed before recovered staging cleanup."
      );
      await assertJsonlAuditRotationRecoveryGenerationCommitted(
        candidate,
        action,
        "Audit rotation staging changed before recovered staging cleanup."
      );
      await removeJsonlAuditRotationBackupDirectory(
        candidate.stagingDirectory,
        candidate.parentDirectory,
        "Audit rotation staging changed during recovered staging cleanup."
      );
      stagingRemoved = true;
    } catch (error) {
      warnings.push(
        `recovered staging could not be safely removed: ${getJsonlAuditRotationRecoveryErrorMessage(error)}`
      );
    }
  }

  let parentSyncCompleted = true;
  if (fullDirectoryDurability) {
    try {
      await syncAuditParentDirectory(
        candidate.parentDirectory,
        candidate.parentDirectory.identity
      );
    } catch (error) {
      parentSyncCompleted = false;
      warnings.push(
        `parent durability could not be confirmed: ${getJsonlAuditRotationRecoveryErrorMessage(error)}`
      );
    }
  }

  let residualStagingPath: string | undefined;
  if (!stagingRemoved) {
    try {
      if (await readJsonlAuditRotationRecoveryEntrySnapshot(
        candidate.graph.stagingPath
      ) !== undefined) {
        residualStagingPath = candidate.graph.stagingPath;
      }
    } catch (error) {
      warnings.push(
        `residual staging could not be inspected: ${getJsonlAuditRotationRecoveryErrorMessage(error)}`
      );
    }
  }
  const durabilityCompleted = !fullDirectoryDurability
    || (stagingSyncCompleted && parentSyncCompleted);
  return {
    recovered: true,
    mutationPerformed: true,
    stagingRemoved,
    durabilityCompleted,
    ...(residualStagingPath === undefined ? {} : { residualStagingPath }),
    ...(warnings.length === 0 ? {} : { warning: warnings.join("; ") })
  };
}

function getJsonlAuditRotationRecoveryErrorMessage(error: unknown): string {
  let message = JSONL_AUDIT_ROTATION_RECOVERY_ERROR_SUMMARY_FALLBACK;
  try {
    if (typeof error === "string") {
      message = error;
    } else if (error instanceof Error) {
      const candidate = error.message;
      message = typeof candidate === "string"
        ? candidate
        : String(candidate);
    } else {
      message = String(error);
    }
  } catch {
    message = JSONL_AUDIT_ROTATION_RECOVERY_ERROR_SUMMARY_FALLBACK;
  }
  const normalized = message.replace(
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu,
    "?"
  );
  if (
    normalized.length
    <= MAX_JSONL_AUDIT_ROTATION_RECOVERY_ERROR_SUMMARY_LENGTH
  ) {
    return normalized;
  }
  return `${normalized.slice(
    0,
    MAX_JSONL_AUDIT_ROTATION_RECOVERY_ERROR_SUMMARY_LENGTH - 3
  )}...`;
}

function createJsonlAuditRotationStagingRecoveryOperationError(
  error: unknown,
  fallbackDetails: JsonlAuditRotationStagingRecoveryOperationFailureDetails
): JsonlAuditRotationStagingRecoveryOperationError {
  if (error instanceof JsonlAuditRotationStagingRecoveryOperationError) {
    const recoveryFingerprint = error.details.recoveryFingerprint
      ?? fallbackDetails.recoveryFingerprint;
    return new JsonlAuditRotationStagingRecoveryOperationError(
      error.message,
      {
        ...fallbackDetails,
        ...error.details,
        ...(recoveryFingerprint === undefined
          ? {}
          : { recoveryFingerprint })
      },
      error.cause ?? error
    );
  }
  return new JsonlAuditRotationStagingRecoveryOperationError(
    getJsonlAuditRotationRecoveryErrorMessage(error),
    fallbackDetails,
    error
  );
}

function addJsonlAuditRotationRecoveryHandleFinalization(
  error: unknown,
  fallbackDetails: JsonlAuditRotationStagingRecoveryOperationFailureDetails,
  outcome: JsonlAuditRotationRecoveryHandleFinalizationOutcome
): JsonlAuditRotationStagingRecoveryOperationError {
  const failure = createJsonlAuditRotationStagingRecoveryOperationError(
    error,
    fallbackDetails
  );
  const warnings = [failure.details.recoveryHandleWarning, outcome.warning]
    .filter((warning): warning is string => warning !== undefined);
  return new JsonlAuditRotationStagingRecoveryOperationError(
    failure.message,
    {
      ...failure.details,
      recoveryHandlesClosed:
        (failure.details.recoveryHandlesClosed ?? true) && outcome.closed,
      ...(warnings.length === 0
        ? {}
        : { recoveryHandleWarning: warnings.join("; ") })
    },
    failure.cause ?? failure
  );
}

export async function inspectJsonlAuditLockQuarantines(
  filePath: string,
  now: () => number = Date.now
): Promise<JsonlAuditLockQuarantineInspection> {
  const observedAt = validateJsonlAuditLockClock(now());
  const lockPath = getJsonlAuditLockPath(filePath);
  const quarantinePrefix = getJsonlAuditLockQuarantinePrefix(filePath);
  const quarantineDirectory = path.dirname(quarantinePrefix);
  const quarantineNamePrefix = path.basename(quarantinePrefix);
  const matchedNames: string[] = [];
  let scannedEntryCount = 0;
  let scanTruncated = false;
  const directory = await fs.opendir(quarantineDirectory);
  let scanFailure: { reason: unknown } | undefined;
  try {
    let reachedEnd = false;
    while (scannedEntryCount < MAX_JSONL_AUDIT_LOCK_QUARANTINE_SCAN_ENTRIES) {
      const entry = await directory.read();
      if (entry === null) {
        reachedEnd = true;
        break;
      }
      scannedEntryCount += 1;
      if (isJsonlAuditLockQuarantineName(entry.name, quarantineNamePrefix)) {
        matchedNames.push(entry.name);
      }
    }
    if (!reachedEnd) {
      scanTruncated = await directory.read() !== null;
    }
  } catch (error) {
    scanFailure = { reason: error };
  }
  await closeJsonlAuditInspectionResourcesPreservingPrimary(
    [directory],
    scanFailure
  );

  matchedNames.sort((left, right) => left.localeCompare(right));
  const resultTruncated = matchedNames.length
    > MAX_JSONL_AUDIT_LOCK_QUARANTINE_RESULTS;
  const entries: JsonlAuditLockQuarantineEntryInspection[] = [];
  for (const name of matchedNames.slice(
    0,
    MAX_JSONL_AUDIT_LOCK_QUARANTINE_RESULTS
  )) {
    const quarantineId = name.slice(quarantineNamePrefix.length);
    entries.push(await inspectJsonlAuditLockQuarantineEntry(
      path.join(quarantineDirectory, name),
      quarantineId,
      observedAt
    ));
  }

  return {
    lockPath,
    quarantinePrefix,
    scannedEntryCount,
    scanLimit: MAX_JSONL_AUDIT_LOCK_QUARANTINE_SCAN_ENTRIES,
    scanTruncated,
    matchedEntryCount: matchedNames.length,
    resultLimit: MAX_JSONL_AUDIT_LOCK_QUARANTINE_RESULTS,
    resultTruncated,
    entries
  };
}

export async function inspectJsonlAuditLockDisposals(
  filePath: string,
  now: () => number = Date.now
): Promise<JsonlAuditLockDisposalInspection> {
  const observedAt = validateJsonlAuditLockClock(now());
  const lockPath = getJsonlAuditLockPath(filePath);
  const disposalNamespacePrefix = getJsonlAuditLockQuarantinePrefix(filePath);
  const disposalDirectory = path.dirname(disposalNamespacePrefix);
  const disposalNamePrefix = path.basename(disposalNamespacePrefix);
  const matchedEntries: Array<{
    name: string;
    quarantineId: string;
    disposalId: string;
  }> = [];
  let scannedEntryCount = 0;
  let scanTruncated = false;
  const directory = await fs.opendir(disposalDirectory);
  let scanFailure: { reason: unknown } | undefined;
  try {
    let reachedEnd = false;
    while (scannedEntryCount < MAX_JSONL_AUDIT_LOCK_DISPOSAL_SCAN_ENTRIES) {
      const entry = await directory.read();
      if (entry === null) {
        reachedEnd = true;
        break;
      }
      scannedEntryCount += 1;
      const parsed = parseJsonlAuditLockDisposalName(
        entry.name,
        disposalNamePrefix
      );
      if (parsed !== undefined) {
        matchedEntries.push({ name: entry.name, ...parsed });
      }
    }
    if (!reachedEnd) {
      scanTruncated = await directory.read() !== null;
    }
  } catch (error) {
    scanFailure = { reason: error };
  }
  await closeJsonlAuditInspectionResourcesPreservingPrimary(
    [directory],
    scanFailure
  );

  matchedEntries.sort((left, right) => left.name.localeCompare(right.name));
  const resultTruncated = matchedEntries.length
    > MAX_JSONL_AUDIT_LOCK_DISPOSAL_RESULTS;
  const entries: JsonlAuditLockDisposalEntryInspection[] = [];
  for (const matched of matchedEntries.slice(
    0,
    MAX_JSONL_AUDIT_LOCK_DISPOSAL_RESULTS
  )) {
    entries.push(await inspectJsonlAuditLockDisposalEntry(
      filePath,
      matched.quarantineId,
      matched.disposalId,
      observedAt
    ));
  }

  return {
    lockPath,
    disposalNamespacePrefix,
    scannedEntryCount,
    scanLimit: MAX_JSONL_AUDIT_LOCK_DISPOSAL_SCAN_ENTRIES,
    scanTruncated,
    matchedEntryCount: matchedEntries.length,
    resultLimit: MAX_JSONL_AUDIT_LOCK_DISPOSAL_RESULTS,
    resultTruncated,
    entries
  };
}

export async function inspectJsonlAuditLockDisposal(
  filePath: string,
  quarantineId: string,
  disposalId: string,
  now: () => number = Date.now
): Promise<JsonlAuditLockDisposalEntryInspection> {
  return inspectJsonlAuditLockDisposalEntry(
    filePath,
    quarantineId,
    disposalId,
    validateJsonlAuditLockClock(now())
  );
}

export async function inspectJsonlAuditLockQuarantine(
  filePath: string,
  quarantineId: string,
  now: () => number = Date.now
): Promise<JsonlAuditLockQuarantineEntryInspection> {
  return inspectJsonlAuditLockQuarantineEntry(
    getJsonlAuditLockQuarantinePath(filePath, quarantineId),
    quarantineId,
    validateJsonlAuditLockClock(now())
  );
}

async function inspectJsonlAuditRotationStagingEntry(
  stagingPath: string,
  stagingId: string,
  observedAt: number
): Promise<JsonlAuditRotationStagingEntryInspection> {
  return (await inspectJsonlAuditRotationStagingEntryDetailed(
    stagingPath,
    stagingId,
    observedAt
  )).inspection;
}

async function inspectJsonlAuditRotationStagingEntryDetailed(
  stagingPath: string,
  stagingId: string,
  observedAt: number
): Promise<JsonlAuditRotationStagingDetailedInspection> {
  const inspection: JsonlAuditRotationStagingEntryInspection = {
    stagingId,
    stagingPath,
    exists: true
  };
  let initialStatus;
  try {
    initialStatus = await fs.lstat(stagingPath, { bigint: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      inspection.exists = false;
    } else {
      inspection.inspectionErrorCode = getJsonlAuditInspectionErrorCode(error);
    }
    return { inspection };
  }

  const initialSnapshot = getJsonlAuditRotationRecoveryEntrySnapshot(
    initialStatus
  );
  inspection.entryType = classifyJsonlAuditLockEntryType(initialStatus);
  inspection.ageMs = getJsonlAuditRotationStagingAgeMs(
    observedAt,
    initialStatus.mtimeMs
  );
  if (!initialStatus.isDirectory()) {
    try {
      const finalStatus = await fs.lstat(stagingPath, { bigint: true });
      if (
        !jsonlAuditRotationRecoveryEntrySnapshotsMatch(
          initialSnapshot,
          getJsonlAuditRotationRecoveryEntrySnapshot(finalStatus)
        )
      ) {
        inspection.stateChanged = true;
      }
    } catch (error) {
      setJsonlAuditRotationStagingInspectionFailure(inspection, error, true);
    }
    return inspection.stateChanged === true
      || inspection.inspectionErrorCode !== undefined
      ? { inspection }
      : { inspection, rootSnapshot: initialSnapshot };
  }

  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const directoryOnly = "O_DIRECTORY" in constants ? constants.O_DIRECTORY : 0;
  let handle: FileHandle | undefined;
  let rootEntries: string[] | undefined;
  let rootScan: JsonlAuditRotationStagingDirectoryScan | undefined;
  let previousSnapshot: JsonlAuditRotationRecoveryEntrySnapshot | undefined;
  let previousMutationPath: string | undefined;
  try {
    try {
      handle = await fs.open(
        stagingPath,
        constants.O_RDONLY | noFollow | directoryOnly
      );
    } catch (error) {
      setJsonlAuditRotationStagingInspectionFailure(inspection, error);
      inspection.layout = "unknown";
      return { inspection };
    }
    const openedStatus = await handle.stat({ bigint: true });
    if (
      !openedStatus.isDirectory()
      || !jsonlAuditRotationRecoveryEntrySnapshotsMatch(
        initialSnapshot,
        getJsonlAuditRotationRecoveryEntrySnapshot(openedStatus)
      )
    ) {
      inspection.stateChanged = true;
      inspection.layout = "unknown";
      return { inspection };
    }

    rootScan = await scanJsonlAuditRotationStagingDirectoryEntries({
      directoryPath: stagingPath,
      handle
    }, true);
    previousMutationPath = rootScan.previousMutationPath;
    rootEntries = rootScan.entries;
    inspection.entryScanCount = rootScan.scannedEntryCount;
    inspection.entryScanLimit = rootScan.scanLimit;
    inspection.entryScanTruncated = rootScan.scanTruncated;
    if (!rootScan.scanTruncated) {
      inspection.entryCount = rootScan.scannedEntryCount;
    }
    if (
      !rootScan.scanTruncated
      && jsonlAuditStringArraysMatch(
        rootEntries,
        [JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME]
      )
    ) {
      previousSnapshot = await readJsonlAuditRotationRecoveryEntrySnapshot(
        previousMutationPath
      );
      if (previousSnapshot === undefined) {
        inspection.stateChanged = true;
      } else {
        inspection.previousEntryType = previousSnapshot.entryType;
        if (
          previousSnapshot.size >= 0n
          && previousSnapshot.size <= BigInt(Number.MAX_SAFE_INTEGER)
        ) {
          inspection.previousSizeBytes = Number(previousSnapshot.size);
        }
      }
    }

    const finalHandleStatus = await handle.stat({ bigint: true });
    let finalPathStatus;
    try {
      finalPathStatus = await fs.lstat(stagingPath, { bigint: true });
    } catch (error) {
      setJsonlAuditRotationStagingInspectionFailure(inspection, error, true);
      inspection.layout = "unknown";
      return { inspection };
    }
    const finalRootScan = await scanJsonlAuditRotationStagingDirectoryEntries({
      directoryPath: stagingPath,
      handle
    }, true);
    if (
      !finalHandleStatus.isDirectory()
      || !finalPathStatus.isDirectory()
      || !jsonlAuditRotationRecoveryEntrySnapshotsMatch(
        initialSnapshot,
        getJsonlAuditRotationRecoveryEntrySnapshot(finalHandleStatus)
      )
      || !jsonlAuditRotationRecoveryEntrySnapshotsMatch(
        initialSnapshot,
        getJsonlAuditRotationRecoveryEntrySnapshot(finalPathStatus)
      )
      || rootScan.scanTruncated !== finalRootScan.scanTruncated
      || !jsonlAuditStringArraysMatch(rootEntries, finalRootScan.entries)
    ) {
      inspection.stateChanged = true;
    }
    if (previousSnapshot !== undefined && previousMutationPath !== undefined) {
      const finalPrevious = await readJsonlAuditRotationRecoveryEntrySnapshot(
        finalRootScan.previousMutationPath
      );
      if (
        finalPrevious === undefined
        || !jsonlAuditRotationRecoveryEntrySnapshotsMatch(
          previousSnapshot,
          finalPrevious
        )
      ) {
        inspection.stateChanged = true;
      }
    }
  } catch (error) {
    setJsonlAuditRotationStagingInspectionFailure(inspection, error);
  } finally {
    if (handle !== undefined) {
      try {
        await closeJsonlAuditInspectionResources([handle]);
      } catch (error) {
        if (inspection.inspectionErrorCode === undefined) {
          inspection.inspectionErrorCode = getJsonlAuditInspectionErrorCode(error);
        }
      }
    }
  }

  if (
    inspection.stateChanged === true
    || inspection.inspectionErrorCode !== undefined
    || rootEntries === undefined
    || rootScan === undefined
    || rootScan.scanTruncated
  ) {
    inspection.layout = "unknown";
    return { inspection };
  }
  inspection.layout = classifyJsonlAuditRotationStagingLayout(rootEntries);
  return {
    inspection,
    rootSnapshot: initialSnapshot,
    ...(previousSnapshot === undefined ? {} : { previousSnapshot })
  };
}

async function scanJsonlAuditRotationStagingDirectoryEntries(
  directory: Pick<
    JsonlAuditPinnedMutationDirectory,
    | "directoryPath"
    | "handle"
    | "writerCloseSettlementBounded"
    | "recoveryCloseSettlementBounded"
  >,
  inspectionCloseSettlementBounded = false
): Promise<JsonlAuditRotationStagingDirectoryScan> {
  const previousMutation = await resolveJsonlAuditDirectoryMutationPath(
    directory,
    JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME
  );
  const directoryReadPath = path.dirname(previousMutation.path);
  const entries: string[] = [];
  let scanTruncated = false;
  const stream = await fs.opendir(directoryReadPath, {
    bufferSize: MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES
  });
  let scanFailure: { reason: unknown } | undefined;
  try {
    let reachedEnd = false;
    while (
      entries.length
      < MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES
    ) {
      const entry = await stream.read();
      if (entry === null) {
        reachedEnd = true;
        break;
      }
      entries.push(entry.name);
    }
    if (!reachedEnd) {
      scanTruncated = await stream.read() !== null;
    }
  } catch (error) {
    scanFailure = { reason: error };
  }
  if (inspectionCloseSettlementBounded) {
    await closeJsonlAuditInspectionResourcesPreservingPrimary(
      [stream],
      scanFailure
    );
  } else if (directory.writerCloseSettlementBounded === true) {
    await closeJsonlAuditWriterResourcesPreservingPrimary(
      [stream],
      scanFailure
    );
  } else if (directory.recoveryCloseSettlementBounded === true) {
    await closeJsonlAuditRotationRecoveryResourcesPreservingPrimary(
      [stream],
      scanFailure
    );
  } else {
    await stream.close();
    if (scanFailure !== undefined) {
      throw scanFailure.reason;
    }
  }
  entries.sort((left, right) => left.localeCompare(right));
  return {
    entries,
    scannedEntryCount: entries.length,
    scanLimit: MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES,
    scanTruncated,
    previousMutationPath: previousMutation.path
  };
}

async function scanJsonlAuditLockDirectoryEntries(
  directoryPath: string,
  directory: JsonlAuditLockPinnedDirectory
): Promise<JsonlAuditLockDirectoryScan> {
  const ownerMutation = await resolveJsonlAuditDirectoryMutationPath(
    {
      directoryPath,
      handle: directory.handle
    },
    JSONL_AUDIT_LOCK_OWNER_FILE_NAME
  );
  const directoryReadPath = path.dirname(ownerMutation.path);
  const entries: string[] = [];
  let scanTruncated = false;
  const stream = await fs.opendir(directoryReadPath, {
    bufferSize: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES
  });
  let scanFailure: { reason: unknown } | undefined;
  try {
    let reachedEnd = false;
    while (entries.length < MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES) {
      const entry = await stream.read();
      if (entry === null) {
        reachedEnd = true;
        break;
      }
      entries.push(entry.name);
    }
    if (!reachedEnd) {
      scanTruncated = await stream.read() !== null;
    }
  } catch (error) {
    scanFailure = { reason: error };
  }
  const context = directory.maintenanceFinalizationContext;
  if (context !== undefined) {
    recordJsonlAuditLockMaintenanceFinalizationOutcome(
      context,
      await finalizeJsonlAuditLockMaintenanceResources([stream])
    );
    if (scanFailure !== undefined) {
      throw scanFailure.reason;
    }
  } else if (directory.inspectionCloseSettlementBounded === true) {
    await closeJsonlAuditInspectionResourcesPreservingPrimary(
      [stream],
      scanFailure
    );
  } else if (directory.acquisitionCloseSettlementBounded === true) {
    await closeJsonlAuditLockAcquisitionResourcesPreservingPrimary(
      [stream],
      scanFailure
    );
  } else if (directory.lifecycleCloseSettlementBounded === true) {
    await closeJsonlAuditLockLifecycleResourcesPreservingPrimary(
      [stream],
      scanFailure
    );
  } else {
    await stream.close();
    if (scanFailure !== undefined) {
      throw scanFailure.reason;
    }
  }
  entries.sort((left, right) => left.localeCompare(right));
  return {
    entries,
    scannedEntryCount: entries.length,
    scanLimit: MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
    scanTruncated
  };
}

async function inspectJsonlAuditLockQuarantineEntry(
  quarantinePath: string,
  quarantineId: string,
  observedAt: number
): Promise<JsonlAuditLockQuarantineEntryInspection> {
  const inspection: JsonlAuditLockQuarantineEntryInspection = {
    quarantineId,
    quarantinePath,
    exists: true
  };
  let rootStatus;
  try {
    rootStatus = await fs.lstat(quarantinePath);
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      inspection.exists = false;
      inspection.stateChanged = true;
    } else {
      inspection.inspectionErrorCode = getJsonlAuditInspectionErrorCode(error);
    }
    return inspection;
  }
  inspection.entryType = classifyJsonlAuditLockEntryType(rootStatus);
  inspection.ageMs = Math.max(0, Math.floor(observedAt - rootStatus.mtimeMs));
  if (!rootStatus.isDirectory()) {
    return inspection;
  }
  const rootIdentity: JsonlAuditFileIdentity = {
    device: rootStatus.dev,
    inode: rootStatus.ino
  };
  let rootDirectory: JsonlAuditLockPinnedDirectory | undefined;
  let rootScan: JsonlAuditLockDirectoryScan | undefined;
  let rootOwnerInspection: JsonlAuditLockOwnerInspection | undefined;
  const nestedLockPath = path.join(quarantinePath, "lock");
  let nestedLockDirectory: JsonlAuditLockPinnedDirectory | undefined;
  let nestedLockScan: JsonlAuditLockDirectoryScan | undefined;
  let nestedOwnerInspection: JsonlAuditLockOwnerInspection | undefined;
  let validatedLayout: JsonlAuditLockQuarantineLayout | undefined;
  let validatedSelectedOwner: {
    location: JsonlAuditLockQuarantineOwnerLocation;
    inspection: JsonlAuditLockOwnerInspection;
  } | undefined;
  try {
    rootDirectory = await openJsonlAuditLockPinnedDirectory(
      quarantinePath,
      undefined,
      true
    );
    if (
      rootDirectory === undefined
      || rootDirectory.identity.device !== BigInt(rootIdentity.device)
      || rootDirectory.identity.inode !== BigInt(rootIdentity.inode)
    ) {
      inspection.stateChanged = true;
      inspection.layout = "unknown";
      return inspection;
    }

    rootScan = await scanJsonlAuditLockDirectoryEntries(
      quarantinePath,
      rootDirectory
    );
    inspection.rootEntryScanCount = rootScan.scannedEntryCount;
    inspection.rootEntryScanLimit = rootScan.scanLimit;
    inspection.rootEntryScanTruncated = rootScan.scanTruncated;
    if (!rootScan.scanTruncated) {
      inspection.rootEntryCount = rootScan.entries.length;
      rootOwnerInspection = await inspectJsonlAuditLockOwnerMetadata(
        quarantinePath
      );
      inspection.rootOwnerMetadataStatus = rootOwnerInspection.status;

      try {
        const nestedLockStatus = await fs.lstat(nestedLockPath);
        inspection.lockEntryType = classifyJsonlAuditLockEntryType(
          nestedLockStatus
        );
        if (nestedLockStatus.isDirectory()) {
          nestedLockDirectory = await openJsonlAuditLockPinnedDirectory(
            nestedLockPath,
            undefined,
            true
          );
          if (
            nestedLockDirectory === undefined
            || nestedLockDirectory.identity.device
              !== BigInt(nestedLockStatus.dev)
            || nestedLockDirectory.identity.inode
              !== BigInt(nestedLockStatus.ino)
          ) {
            inspection.stateChanged = true;
          } else {
            nestedLockScan = await scanJsonlAuditLockDirectoryEntries(
              nestedLockPath,
              nestedLockDirectory
            );
            inspection.lockEntryScanCount =
              nestedLockScan.scannedEntryCount;
            inspection.lockEntryScanLimit = nestedLockScan.scanLimit;
            inspection.lockEntryScanTruncated = nestedLockScan.scanTruncated;
            if (!nestedLockScan.scanTruncated) {
              inspection.lockEntryCount = nestedLockScan.entries.length;
              nestedOwnerInspection =
                await inspectJsonlAuditLockOwnerMetadata(nestedLockPath);
              inspection.lockOwnerMetadataStatus =
                nestedOwnerInspection.status;
            }
          }
        }
      } catch (error) {
        if (
          !isNodeError(error)
          || error.code !== "ENOENT"
          || rootScan.entries.includes("lock")
        ) {
          throw error;
        }
      }
    }

    if (nestedLockDirectory !== undefined && nestedLockScan !== undefined) {
      const finalNestedScan = await scanJsonlAuditLockDirectoryEntries(
        nestedLockPath,
        nestedLockDirectory
      );
      if (
        !jsonlAuditLockDirectoryScansMatch(
          nestedLockScan,
          finalNestedScan
        )
        || !(await jsonlAuditLockPinnedDirectoryObservationMatches(
          nestedLockPath,
          nestedLockDirectory.handle,
          nestedLockDirectory.identity
        ))
      ) {
        inspection.stateChanged = true;
      }
    }
    const finalRootScan = await scanJsonlAuditLockDirectoryEntries(
      quarantinePath,
      rootDirectory
    );
    if (
      !jsonlAuditLockDirectoryScansMatch(rootScan, finalRootScan)
      || !(await jsonlAuditLockPinnedDirectoryObservationMatches(
        quarantinePath,
        rootDirectory.handle,
        rootDirectory.identity
      ))
    ) {
      inspection.stateChanged = true;
    }

    if (
      !inspection.stateChanged
      && !rootScan.scanTruncated
      && nestedLockScan?.scanTruncated !== true
      && rootOwnerInspection !== undefined
    ) {
      const layout = classifyJsonlAuditLockQuarantineLayout(
        rootScan.entries,
        inspection.lockEntryType,
        nestedLockScan?.entries
      );
      const selectedOwner = selectJsonlAuditLockQuarantineOwner(
        layout,
        rootOwnerInspection,
        nestedOwnerInspection
      );
      if (selectedOwner !== undefined) {
        const finalSelectedOwnerInspection =
          await inspectJsonlAuditLockOwnerMetadata(
            selectedOwner.location === "root"
              ? quarantinePath
              : nestedLockPath
          );
        if (!jsonlAuditLockOwnerInspectionsMatch(
          selectedOwner.inspection,
          finalSelectedOwnerInspection
        )) {
          inspection.stateChanged = true;
        } else {
          validatedSelectedOwner = {
            location: selectedOwner.location,
            inspection: finalSelectedOwnerInspection
          };
        }
      }
      if (
        !inspection.stateChanged
        && nestedLockDirectory !== undefined
        && !(await jsonlAuditLockPinnedDirectoryObservationMatches(
          nestedLockPath,
          nestedLockDirectory.handle,
          nestedLockDirectory.identity
        ))
      ) {
        inspection.stateChanged = true;
      }
      if (
        !inspection.stateChanged
        && !(await jsonlAuditLockPinnedDirectoryObservationMatches(
          quarantinePath,
          rootDirectory.handle,
          rootDirectory.identity
        ))
      ) {
        inspection.stateChanged = true;
      }
      if (!inspection.stateChanged && validatedSelectedOwner !== undefined) {
        const terminalSelectedOwner =
          await inspectJsonlAuditLockOwnerMetadata(
            validatedSelectedOwner.location === "root"
              ? quarantinePath
              : nestedLockPath
          );
        if (!jsonlAuditLockOwnerInspectionsMatch(
          validatedSelectedOwner.inspection,
          terminalSelectedOwner
        )) {
          inspection.stateChanged = true;
        } else {
          validatedSelectedOwner = {
            location: validatedSelectedOwner.location,
            inspection: terminalSelectedOwner
          };
        }
      }
      if (!inspection.stateChanged) {
        validatedLayout = layout;
      }
    }
  } catch (error) {
    setJsonlAuditQuarantineInspectionFailure(inspection, error);
  } finally {
    const finalization = await finalizeJsonlAuditInspectionResources(
      [nestedLockDirectory, rootDirectory]
        .filter((directory): directory is JsonlAuditLockPinnedDirectory => (
          directory !== undefined
        ))
        .map((directory) => directory.handle)
    );
    if (
      !finalization.closed
      && inspection.inspectionErrorCode === undefined
    ) {
      inspection.inspectionErrorCode = getJsonlAuditInspectionErrorCode(
        finalization.failure
      );
    }
  }

  if (
    inspection.stateChanged
    || inspection.inspectionErrorCode !== undefined
    || rootScan === undefined
    || rootScan.scanTruncated
    || nestedLockScan?.scanTruncated === true
    || rootOwnerInspection === undefined
    || validatedLayout === undefined
  ) {
    inspection.layout = "unknown";
    return inspection;
  }

  inspection.layout = validatedLayout;
  if (inspection.layout === "empty") {
    const emptyIdentity = await readJsonlAuditLockEmptyDirectoryIdentity(
      quarantinePath,
      undefined,
      true
    );
    if (emptyIdentity === undefined) {
      inspection.stateChanged = true;
      inspection.layout = "unknown";
      return inspection;
    }
    inspection.emptyDirectoryFingerprint =
      getJsonlAuditLockEmptyQuarantineFingerprint(
        quarantinePath,
        emptyIdentity
      );
  }
  if (validatedSelectedOwner !== undefined) {
    inspection.ownerLocation = validatedSelectedOwner.location;
    inspection.ownerMetadataStatus = validatedSelectedOwner.inspection.status;
    if (validatedSelectedOwner.inspection.metadata !== undefined) {
      inspection.ownerToken =
        validatedSelectedOwner.inspection.metadata.ownerToken;
      inspection.ownerPid = validatedSelectedOwner.inspection.metadata.pid;
      inspection.ownerAcquiredAt =
        validatedSelectedOwner.inspection.metadata.acquiredAt;
      inspection.ownerAcquiredAtMs =
        validatedSelectedOwner.inspection.metadata.acquiredAtMs;
      if (validatedSelectedOwner.inspection.fileIdentity !== undefined) {
        inspection.ownerFingerprint = getJsonlAuditLockOwnerFingerprint({
          domain: "quarantine",
          candidatePath: quarantinePath,
          layout: inspection.layout,
          ownerLocation: validatedSelectedOwner.location,
          directories: [
            {
              role: "root",
              directoryPath: quarantinePath,
              identity: rootDirectory!.identity
            },
            ...(nestedLockDirectory === undefined
              ? []
              : [{
                  role: "lock",
                  directoryPath: nestedLockPath,
                  identity: nestedLockDirectory.identity
                }])
          ],
          ownerPath: validatedSelectedOwner.inspection.ownerPath,
          ownerIdentity: validatedSelectedOwner.inspection.fileIdentity,
          ownerMetadata: validatedSelectedOwner.inspection.metadata
        });
      }
    }
  }
  return inspection;
}

async function inspectJsonlAuditLockDisposalEntry(
  filePath: string,
  quarantineId: string,
  disposalId: string,
  observedAt: number
): Promise<JsonlAuditLockDisposalEntryInspection> {
  const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, quarantineId);
  const disposalPath = getJsonlAuditLockDisposalPath(
    filePath,
    quarantineId,
    disposalId
  );
  const sourceInspection = await inspectJsonlAuditLockQuarantineEntry(
    quarantinePath,
    quarantineId,
    observedAt
  );
  const inspection: JsonlAuditLockDisposalEntryInspection = {
    quarantineId,
    quarantinePath,
    sourceQuarantineExists: sourceInspection.exists,
    sourceQuarantineEntryType: sourceInspection.entryType,
    sourceQuarantineLayout: sourceInspection.layout,
    sourceQuarantineStateChanged: sourceInspection.exists
      ? sourceInspection.stateChanged
      : undefined,
    sourceQuarantineInspectionErrorCode:
      sourceInspection.inspectionErrorCode,
    disposalId,
    disposalPath,
    exists: true
  };

  let rootStatus;
  try {
    rootStatus = await fs.lstat(disposalPath);
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      inspection.exists = false;
      inspection.stateChanged = true;
    } else {
      inspection.inspectionErrorCode = getJsonlAuditInspectionErrorCode(error);
    }
    return inspection;
  }
  inspection.entryType = classifyJsonlAuditLockEntryType(rootStatus);
  inspection.ageMs = Math.max(0, Math.floor(observedAt - rootStatus.mtimeMs));
  if (!rootStatus.isDirectory()) {
    return inspection;
  }
  const rootIdentity: JsonlAuditFileIdentity = {
    device: rootStatus.dev,
    inode: rootStatus.ino
  };
  let rootDirectory: JsonlAuditLockPinnedDirectory | undefined;
  let rootScan: JsonlAuditLockDirectoryScan | undefined;
  let ownerInspection: JsonlAuditLockOwnerInspection | undefined;
  let validatedLayout: JsonlAuditLockDisposalLayout | undefined;
  let validatedOwnerInspection: JsonlAuditLockOwnerInspection | undefined;
  try {
    rootDirectory = await openJsonlAuditLockPinnedDirectory(
      disposalPath,
      undefined,
      true
    );
    if (
      rootDirectory === undefined
      || rootDirectory.identity.device !== BigInt(rootIdentity.device)
      || rootDirectory.identity.inode !== BigInt(rootIdentity.inode)
    ) {
      inspection.stateChanged = true;
      inspection.layout = "unknown";
      return inspection;
    }

    rootScan = await scanJsonlAuditLockDirectoryEntries(
      disposalPath,
      rootDirectory
    );
    inspection.rootEntryScanCount = rootScan.scannedEntryCount;
    inspection.rootEntryScanLimit = rootScan.scanLimit;
    inspection.rootEntryScanTruncated = rootScan.scanTruncated;
    if (!rootScan.scanTruncated) {
      inspection.rootEntryCount = rootScan.entries.length;
      ownerInspection = await inspectJsonlAuditLockOwnerMetadata(disposalPath);
    }

    const finalRootScan = await scanJsonlAuditLockDirectoryEntries(
      disposalPath,
      rootDirectory
    );
    if (
      !jsonlAuditLockDirectoryScansMatch(rootScan, finalRootScan)
      || !(await jsonlAuditLockPinnedDirectoryObservationMatches(
        disposalPath,
        rootDirectory.handle,
        rootDirectory.identity
      ))
    ) {
      inspection.stateChanged = true;
    }

    if (
      !inspection.stateChanged
      && !rootScan.scanTruncated
      && ownerInspection !== undefined
    ) {
      const layout = classifyJsonlAuditLockDisposalLayout(rootScan.entries);
      if (layout === "owner_only") {
        const finalOwnerInspection =
          await inspectJsonlAuditLockOwnerMetadata(disposalPath);
        if (!jsonlAuditLockOwnerInspectionsMatch(
          ownerInspection,
          finalOwnerInspection
        )) {
          inspection.stateChanged = true;
        } else if (!(await jsonlAuditLockPinnedDirectoryObservationMatches(
          disposalPath,
          rootDirectory.handle,
          rootDirectory.identity
        ))) {
          inspection.stateChanged = true;
        } else {
          validatedOwnerInspection = finalOwnerInspection;
        }
      }
      if (!inspection.stateChanged) {
        validatedLayout = layout;
      }
    }
  } catch (error) {
    setJsonlAuditDisposalInspectionFailure(inspection, error);
  } finally {
    if (rootDirectory !== undefined) {
      const finalization = await finalizeJsonlAuditInspectionResources([
        rootDirectory.handle
      ]);
      if (
        !finalization.closed
        && inspection.inspectionErrorCode === undefined
      ) {
        inspection.inspectionErrorCode = getJsonlAuditInspectionErrorCode(
          finalization.failure
        );
      }
    }
  }

  if (
    inspection.stateChanged
    || inspection.inspectionErrorCode !== undefined
    || rootScan === undefined
    || rootScan.scanTruncated
    || ownerInspection === undefined
    || validatedLayout === undefined
  ) {
    inspection.layout = "unknown";
    return inspection;
  }

  inspection.layout = validatedLayout;
  if (inspection.layout === "empty") {
    const emptyIdentity = await readJsonlAuditLockEmptyDirectoryIdentity(
      disposalPath,
      undefined,
      true
    );
    if (emptyIdentity === undefined) {
      inspection.stateChanged = true;
      inspection.layout = "unknown";
      return inspection;
    }
    inspection.emptyDirectoryFingerprint =
      getJsonlAuditLockEmptyDisposalFingerprint(
        disposalPath,
        emptyIdentity
      );
  }
  inspection.ownerMetadataStatus =
    validatedOwnerInspection?.status ?? ownerInspection.status;
  if (
    inspection.layout === "owner_only"
    && validatedOwnerInspection?.metadata !== undefined
  ) {
    inspection.ownerToken = validatedOwnerInspection.metadata.ownerToken;
    inspection.ownerPid = validatedOwnerInspection.metadata.pid;
    inspection.ownerAcquiredAt = validatedOwnerInspection.metadata.acquiredAt;
    inspection.ownerAcquiredAtMs =
      validatedOwnerInspection.metadata.acquiredAtMs;
  }
  if (
    !sourceInspection.exists
    && (inspection.ownerToken !== undefined
      || inspection.emptyDirectoryFingerprint !== undefined)
  ) {
    await finalizeJsonlAuditLockDisposalSourceAbsence(inspection);
  }
  if (
    inspection.layout === "owner_only"
    && validatedOwnerInspection !== undefined
  ) {
    try {
      const terminalOwnerInspection =
        await inspectJsonlAuditLockOwnerMetadata(disposalPath);
      if (!jsonlAuditLockOwnerInspectionsMatch(
        validatedOwnerInspection,
        terminalOwnerInspection
      )) {
        withdrawJsonlAuditLockDisposalAuthority(inspection);
      } else {
        validatedOwnerInspection = terminalOwnerInspection;
        inspection.ownerMetadataStatus = terminalOwnerInspection.status;
        if (terminalOwnerInspection.metadata !== undefined) {
          inspection.ownerToken = terminalOwnerInspection.metadata.ownerToken;
          inspection.ownerPid = terminalOwnerInspection.metadata.pid;
          inspection.ownerAcquiredAt =
            terminalOwnerInspection.metadata.acquiredAt;
          inspection.ownerAcquiredAtMs =
            terminalOwnerInspection.metadata.acquiredAtMs;
        }
      }
    } catch (error) {
      inspection.inspectionErrorCode = getJsonlAuditInspectionErrorCode(error);
      withdrawJsonlAuditLockDisposalAuthority(inspection);
    }
  }
  if (
    inspection.layout === "owner_only"
    && validatedOwnerInspection?.metadata !== undefined
    && validatedOwnerInspection.fileIdentity !== undefined
  ) {
    inspection.ownerFingerprint = getJsonlAuditLockOwnerFingerprint({
      domain: "disposal",
      candidatePath: disposalPath,
      layout: "owner_only",
      ownerLocation: "root",
      directories: [{
        role: "root",
        directoryPath: disposalPath,
        identity: rootDirectory!.identity
      }],
      ownerPath: validatedOwnerInspection.ownerPath,
      ownerIdentity: validatedOwnerInspection.fileIdentity,
      ownerMetadata: validatedOwnerInspection.metadata,
      sourceQuarantinePath: quarantinePath
    });
  }
  return inspection;
}

function isJsonlAuditRotationStagingName(
  name: string,
  prefix: string
): boolean {
  return name.startsWith(prefix)
    && JSONL_AUDIT_ROTATION_STAGING_ID_PATTERN.test(name.slice(prefix.length));
}

function isJsonlAuditLockQuarantineName(
  name: string,
  prefix: string
): boolean {
  return name.startsWith(prefix)
    && JSONL_AUDIT_LOCK_QUARANTINE_ID_PATTERN.test(name.slice(prefix.length));
}

function parseJsonlAuditLockDisposalName(
  name: string,
  prefix: string
): { quarantineId: string; disposalId: string } | undefined {
  if (!name.startsWith(prefix)) {
    return undefined;
  }
  const match = JSONL_AUDIT_LOCK_DISPOSAL_NAME_PATTERN.exec(
    name.slice(prefix.length)
  );
  if (match === null) {
    return undefined;
  }
  return {
    quarantineId: match[1]!,
    disposalId: match[2]!
  };
}

function validateJsonlAuditRotationStagingId(stagingId: string): string {
  if (!JSONL_AUDIT_ROTATION_STAGING_ID_PATTERN.test(stagingId)) {
    throw new Error(
      "Invalid audit rotation staging id: expected six ASCII alphanumeric characters."
    );
  }
  return stagingId;
}

function validateJsonlAuditRotationRecoveryAction(
  action: JsonlAuditRotationRecoveryAction
): JsonlAuditRotationRecoveryAction {
  if (
    action !== "cleanup_empty_staging"
    && action !== "restore_previous_archive"
    && action !== "rollback_full_rotation"
  ) {
    throw new Error(
      "Invalid audit rotation recovery action: expected cleanup_empty_staging, restore_previous_archive, or rollback_full_rotation."
    );
  }
  return action;
}

function validateJsonlAuditLockQuarantineId(quarantineId: string): string {
  if (!JSONL_AUDIT_LOCK_QUARANTINE_ID_PATTERN.test(quarantineId)) {
    throw new Error(
      "Invalid audit lock quarantine id: expected six ASCII alphanumeric characters."
    );
  }
  return quarantineId;
}

function validateJsonlAuditLockDisposalId(disposalId: string): string {
  if (!JSONL_AUDIT_LOCK_QUARANTINE_ID_PATTERN.test(disposalId)) {
    throw new Error(
      "Invalid audit lock disposal id: expected six ASCII alphanumeric characters."
    );
  }
  return disposalId;
}

function classifyJsonlAuditLockEntryType(status: {
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isFile(): boolean;
}): JsonlAuditLockEntryType {
  return status.isDirectory()
    ? "directory"
    : status.isSymbolicLink()
      ? "symbolic_link"
      : status.isFile()
        ? "regular_file"
        : "other";
}

function classifyJsonlAuditRotationStagingLayout(
  rootEntries: readonly string[]
): JsonlAuditRotationStagingLayout {
  if (rootEntries.length === 0) {
    return "empty";
  }
  if (jsonlAuditStringArraysMatch(
    rootEntries,
    [JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME]
  )) {
    return "previous_only";
  }
  return "unknown";
}

function getJsonlAuditRotationStagingAgeMs(
  observedAt: number,
  mtimeMs: bigint
): number | undefined {
  const numericMtimeMs = Number(mtimeMs);
  const ageMs = observedAt - numericMtimeMs;
  return Number.isSafeInteger(numericMtimeMs) && Number.isSafeInteger(ageMs)
    ? Math.max(0, ageMs)
    : undefined;
}

function getJsonlAuditRotationRecoveryEntrySnapshot(status: {
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isFile(): boolean;
  dev: bigint;
  ino: bigint;
  mode: bigint;
  nlink: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
  birthtimeNs: bigint;
}): JsonlAuditRotationRecoveryEntrySnapshot {
  return {
    entryType: classifyJsonlAuditLockEntryType(status),
    device: status.dev,
    inode: status.ino,
    mode: status.mode,
    linkCount: status.nlink,
    size: status.size,
    mtimeNs: status.mtimeNs,
    ctimeNs: status.ctimeNs,
    birthtimeNs: status.birthtimeNs
  };
}

async function readJsonlAuditRotationRecoveryEntrySnapshot(
  entryPath: string
): Promise<JsonlAuditRotationRecoveryEntrySnapshot | undefined> {
  try {
    return getJsonlAuditRotationRecoveryEntrySnapshot(
      await fs.lstat(entryPath, { bigint: true })
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function jsonlAuditRotationRecoveryEntrySnapshotsMatch(
  left: JsonlAuditRotationRecoveryEntrySnapshot,
  right: JsonlAuditRotationRecoveryEntrySnapshot
): boolean {
  return left.entryType === right.entryType
    && left.device === right.device
    && left.inode === right.inode
    && left.mode === right.mode
    && left.linkCount === right.linkCount
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
    && left.birthtimeNs === right.birthtimeNs;
}

function jsonlAuditOptionalRotationRecoveryEntrySnapshotsMatch(
  left: JsonlAuditRotationRecoveryEntrySnapshot | undefined,
  right: JsonlAuditRotationRecoveryEntrySnapshot | undefined
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined
      && jsonlAuditRotationRecoveryEntrySnapshotsMatch(left, right);
}

async function assertJsonlAuditRotationRecoveryEntrySnapshot(
  entryPath: string,
  expected: JsonlAuditRotationRecoveryEntrySnapshot,
  errorMessage: string
): Promise<void> {
  const current = await readJsonlAuditRotationRecoveryEntrySnapshot(entryPath);
  if (
    current === undefined
    || !jsonlAuditRotationRecoveryEntrySnapshotsMatch(expected, current)
  ) {
    throw new Error(errorMessage);
  }
}

async function assertJsonlAuditOptionalRotationRecoveryEntrySnapshot(
  entryPath: string,
  expected: JsonlAuditRotationRecoveryEntrySnapshot | undefined,
  errorMessage: string
): Promise<void> {
  const current = await readJsonlAuditRotationRecoveryEntrySnapshot(entryPath);
  if (!jsonlAuditOptionalRotationRecoveryEntrySnapshotsMatch(expected, current)) {
    throw new Error(errorMessage);
  }
}

async function assertJsonlAuditRotationRecoveryHandlePathSnapshot(
  entryPath: string,
  handle: FileHandle,
  expected: JsonlAuditRotationRecoveryEntrySnapshot,
  errorMessage: string
): Promise<void> {
  let initialHandleStatus;
  let pathStatus;
  let finalHandleStatus;
  try {
    initialHandleStatus = await handle.stat({ bigint: true });
    pathStatus = await fs.lstat(entryPath, { bigint: true });
    finalHandleStatus = await handle.stat({ bigint: true });
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      throw new Error(errorMessage);
    }
    throw error;
  }
  if (
    !jsonlAuditRotationRecoveryEntrySnapshotsMatch(
      expected,
      getJsonlAuditRotationRecoveryEntrySnapshot(initialHandleStatus)
    )
    || !jsonlAuditRotationRecoveryEntrySnapshotsMatch(
      expected,
      getJsonlAuditRotationRecoveryEntrySnapshot(pathStatus)
    )
    || !jsonlAuditRotationRecoveryEntrySnapshotsMatch(
      expected,
      getJsonlAuditRotationRecoveryEntrySnapshot(finalHandleStatus)
    )
  ) {
    throw new Error(errorMessage);
  }
}

function toJsonlAuditRotationEntrySnapshot(
  snapshot: JsonlAuditRotationRecoveryEntrySnapshot
): JsonlAuditRotationEntrySnapshot {
  return {
    entryType: snapshot.entryType,
    device: snapshot.device,
    inode: snapshot.inode,
    mode: snapshot.mode,
    nlink: snapshot.linkCount,
    size: snapshot.size,
    mtimeNs: snapshot.mtimeNs,
    birthtimeNs: snapshot.birthtimeNs
  };
}

function jsonlAuditRotationRecoveryLockInspectionsMatch(
  left: JsonlAuditLockInspection,
  right: JsonlAuditLockInspection
): boolean {
  return left.lockPath === right.lockPath
    && left.exists === right.exists
    && left.entryType === right.entryType
    && left.acquirable === right.acquirable
    && left.entryCount === right.entryCount
    && left.entryScanCount === right.entryScanCount
    && left.entryScanLimit === right.entryScanLimit
    && left.entryScanTruncated === right.entryScanTruncated
    && left.ownerMetadataStatus === right.ownerMetadataStatus
    && left.ownerEntryExclusive === right.ownerEntryExclusive
    && left.ownerToken === right.ownerToken
    && left.ownerPid === right.ownerPid
    && left.ownerAcquiredAt === right.ownerAcquiredAt
    && left.ownerAcquiredAtMs === right.ownerAcquiredAtMs
    && left.ownerFingerprint === right.ownerFingerprint
    && left.stateChanged === right.stateChanged
    && left.inspectionErrorCode === right.inspectionErrorCode;
}

function toJsonlAuditRotationRecoveryGenerationInspection(
  entryPath: string,
  snapshot: JsonlAuditRotationRecoveryEntrySnapshot | undefined,
  stateChanged: boolean
): JsonlAuditRotationRecoveryGenerationInspection {
  if (snapshot === undefined) {
    return {
      entryPath,
      exists: false,
      ...(stateChanged ? { stateChanged: true } : {})
    };
  }
  const mode = Number(snapshot.mode & 0o777n);
  return {
    entryPath,
    exists: true,
    entryType: snapshot.entryType,
    ...(snapshot.size >= 0n
      && snapshot.size <= BigInt(Number.MAX_SAFE_INTEGER)
      ? { sizeBytes: Number(snapshot.size) }
      : {}),
    mode,
    ...(process.platform === "win32"
      ? {}
      : { privateMode: (mode & 0o077) === 0 }),
    ...(snapshot.linkCount >= 0n
      && snapshot.linkCount <= BigInt(Number.MAX_SAFE_INTEGER)
      ? { linkCount: Number(snapshot.linkCount) }
      : {}),
    ...(stateChanged ? { stateChanged: true } : {})
  };
}

function isJsonlAuditRotationRecoveryPrivateSnapshot(
  snapshot: JsonlAuditRotationRecoveryEntrySnapshot
): boolean {
  return process.platform === "win32"
    || (snapshot.mode & 0o077n) === 0n;
}

function isJsonlAuditRotationRecoveryGenerationValid(
  snapshot: JsonlAuditRotationRecoveryEntrySnapshot | undefined
): snapshot is JsonlAuditRotationRecoveryEntrySnapshot {
  return snapshot !== undefined
    && snapshot.entryType === "regular_file"
    && snapshot.linkCount === 1n
    && snapshot.size > 0n
    && isJsonlAuditRotationRecoveryPrivateSnapshot(snapshot);
}

function isJsonlAuditRotationRecoveryStagingValid(
  details: JsonlAuditRotationStagingDetailedInspection
): boolean {
  const { inspection, rootSnapshot, previousSnapshot } = details;
  if (
    !inspection.exists
    || inspection.entryType !== "directory"
    || inspection.stateChanged === true
    || inspection.inspectionErrorCode !== undefined
    || rootSnapshot?.entryType !== "directory"
    || !isJsonlAuditRotationRecoveryPrivateSnapshot(rootSnapshot)
  ) {
    return false;
  }
  if (inspection.layout === "empty") {
    return previousSnapshot === undefined;
  }
  return inspection.layout === "previous_only"
    && previousSnapshot !== undefined
    && previousSnapshot.entryType !== "directory";
}

function getJsonlAuditRotationRecoveryFingerprint(input: {
  filePath: string;
  stagingId: string;
  stagingPath: string;
  action: JsonlAuditRotationRecoveryAction;
  stagingRoot: JsonlAuditRotationRecoveryEntrySnapshot;
  previous?: JsonlAuditRotationRecoveryEntrySnapshot;
  current?: JsonlAuditRotationRecoveryEntrySnapshot;
  rotated?: JsonlAuditRotationRecoveryEntrySnapshot;
}): string {
  const hash = createHash("sha256")
    .update("god-code-audit-rotation-recovery\0")
    .update("1\0")
    .update(input.filePath)
    .update("\0")
    .update(input.stagingId)
    .update("\0")
    .update(input.stagingPath)
    .update("\0")
    .update(input.action)
    .update("\0");
  updateJsonlAuditRotationRecoveryFingerprintSnapshot(
    hash,
    "staging_root",
    input.stagingRoot
  );
  updateJsonlAuditRotationRecoveryFingerprintSnapshot(
    hash,
    "previous",
    input.previous
  );
  updateJsonlAuditRotationRecoveryFingerprintSnapshot(
    hash,
    "current",
    input.current
  );
  updateJsonlAuditRotationRecoveryFingerprintSnapshot(
    hash,
    "rotated",
    input.rotated
  );
  return hash.digest("hex").slice(
    0,
    JSONL_AUDIT_ROTATION_RECOVERY_FINGERPRINT_HEX_LENGTH
  );
}

function updateJsonlAuditRotationRecoveryFingerprintSnapshot(
  hash: ReturnType<typeof createHash>,
  role: string,
  snapshot: JsonlAuditRotationRecoveryEntrySnapshot | undefined
): void {
  hash.update(role).update("\0");
  if (snapshot === undefined) {
    hash.update("missing\0");
    return;
  }
  hash
    .update(snapshot.entryType)
    .update("\0")
    .update(snapshot.device.toString())
    .update("\0")
    .update(snapshot.inode.toString())
    .update("\0")
    .update(snapshot.mode.toString())
    .update("\0")
    .update(snapshot.linkCount.toString())
    .update("\0")
    .update(snapshot.size.toString())
    .update("\0")
    .update(snapshot.mtimeNs.toString())
    .update("\0")
    .update(snapshot.ctimeNs.toString())
    .update("\0")
    .update(snapshot.birthtimeNs.toString())
    .update("\0");
}

function classifyJsonlAuditLockQuarantineLayout(
  rootEntries: readonly string[],
  lockEntryType: JsonlAuditLockEntryType | undefined,
  nestedLockEntries: readonly string[] | undefined
): JsonlAuditLockQuarantineLayout {
  if (rootEntries.length === 0) {
    return "empty";
  }
  if (
    rootEntries.length === 1
    && rootEntries[0] === JSONL_AUDIT_LOCK_OWNER_FILE_NAME
  ) {
    return "owner_only";
  }
  if (
    rootEntries.length === 1
    && rootEntries[0] === "lock"
    && lockEntryType === "directory"
    && nestedLockEntries?.length === 1
    && nestedLockEntries[0] === JSONL_AUDIT_LOCK_OWNER_FILE_NAME
  ) {
    return "lock_with_owner";
  }
  if (
    rootEntries.length === 2
    && rootEntries[0] === "lock"
    && rootEntries[1] === JSONL_AUDIT_LOCK_OWNER_FILE_NAME
    && lockEntryType === "directory"
    && nestedLockEntries?.length === 0
  ) {
    return "lock_and_owner";
  }
  return "unknown";
}

function classifyJsonlAuditLockDisposalLayout(
  rootEntries: readonly string[]
): JsonlAuditLockDisposalLayout {
  if (rootEntries.length === 0) {
    return "empty";
  }
  if (
    rootEntries.length === 1
    && rootEntries[0] === JSONL_AUDIT_LOCK_OWNER_FILE_NAME
  ) {
    return "owner_only";
  }
  return "unknown";
}

function selectJsonlAuditLockQuarantineOwner(
  layout: JsonlAuditLockQuarantineLayout,
  rootOwnerInspection: JsonlAuditLockOwnerInspection,
  nestedOwnerInspection: JsonlAuditLockOwnerInspection | undefined
): {
  location: JsonlAuditLockQuarantineOwnerLocation;
  inspection: JsonlAuditLockOwnerInspection;
} | undefined {
  if (layout === "owner_only" || layout === "lock_and_owner") {
    return { location: "root", inspection: rootOwnerInspection };
  }
  if (layout === "lock_with_owner" && nestedOwnerInspection !== undefined) {
    return { location: "lock", inspection: nestedOwnerInspection };
  }
  return undefined;
}

function jsonlAuditLockOwnerInspectionsMatch(
  left: JsonlAuditLockOwnerInspection,
  right: JsonlAuditLockOwnerInspection
): boolean {
  if (left.ownerPath !== right.ownerPath || left.status !== right.status) {
    return false;
  }
  if (left.status !== "valid") {
    return left.identity === undefined
      && right.identity === undefined
      && left.metadata === undefined
      && right.metadata === undefined;
  }
  return left.identity !== undefined
    && right.identity !== undefined
    && left.identity.device === right.identity.device
    && left.identity.inode === right.identity.inode
    && left.fileIdentity !== undefined
    && right.fileIdentity !== undefined
    && jsonlAuditLockOwnerFileIdentityMatches(
      left.fileIdentity,
      right.fileIdentity
    )
    && left.metadata !== undefined
    && right.metadata !== undefined
    && jsonlAuditLockOwnerMetadataMatches(left.metadata, right.metadata);
}

async function finalizeJsonlAuditLockDisposalSourceAbsence(
  inspection: JsonlAuditLockDisposalEntryInspection
): Promise<void> {
  let sourceStatus;
  try {
    sourceStatus = await fs.lstat(inspection.quarantinePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    inspection.sourceQuarantineStateChanged = true;
    if (!isJsonlAuditLockChangedError(error)) {
      inspection.sourceQuarantineInspectionErrorCode =
        getJsonlAuditInspectionErrorCode(error);
    }
    withdrawJsonlAuditLockDisposalAuthority(inspection);
    return;
  }

  inspection.sourceQuarantineExists = true;
  inspection.sourceQuarantineEntryType = classifyJsonlAuditLockEntryType(
    sourceStatus
  );
  inspection.sourceQuarantineLayout = sourceStatus.isDirectory()
    ? "unknown"
    : undefined;
  inspection.sourceQuarantineStateChanged = true;
  withdrawJsonlAuditLockDisposalAuthority(inspection);
}

function withdrawJsonlAuditLockDisposalAuthority(
  inspection: JsonlAuditLockDisposalEntryInspection
): void {
  inspection.layout = "unknown";
  inspection.ownerMetadataStatus = undefined;
  inspection.ownerToken = undefined;
  inspection.ownerPid = undefined;
  inspection.ownerAcquiredAt = undefined;
  inspection.ownerAcquiredAtMs = undefined;
  inspection.ownerFingerprint = undefined;
  inspection.emptyDirectoryFingerprint = undefined;
  inspection.stateChanged = true;
}

function setJsonlAuditQuarantineInspectionFailure(
  inspection: JsonlAuditLockQuarantineEntryInspection,
  error: unknown
): void {
  if (isJsonlAuditLockChangedError(error)) {
    inspection.stateChanged = true;
    return;
  }
  inspection.inspectionErrorCode = getJsonlAuditInspectionErrorCode(error);
}

function setJsonlAuditRotationStagingInspectionFailure(
  inspection: JsonlAuditRotationStagingEntryInspection,
  error: unknown,
  rootMayHaveDisappeared = false
): void {
  if (isJsonlAuditLockChangedError(error)) {
    inspection.stateChanged = true;
    if (
      rootMayHaveDisappeared
      && isNodeError(error)
      && error.code === "ENOENT"
    ) {
      inspection.exists = false;
    }
    return;
  }
  inspection.inspectionErrorCode = getJsonlAuditInspectionErrorCode(error);
}

function setJsonlAuditDisposalInspectionFailure(
  inspection: JsonlAuditLockDisposalEntryInspection,
  error: unknown
): void {
  if (isJsonlAuditLockChangedError(error)) {
    inspection.stateChanged = true;
    return;
  }
  inspection.inspectionErrorCode = getJsonlAuditInspectionErrorCode(error);
}

function getJsonlAuditInspectionErrorCode(error: unknown): string {
  return isNodeError(error) && typeof error.code === "string"
    ? error.code
    : "inspection_failed";
}

function jsonlAuditStringArraysMatch(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function jsonlAuditLockDirectoryScansMatch(
  left: JsonlAuditLockDirectoryScan,
  right: JsonlAuditLockDirectoryScan
): boolean {
  return left.scanTruncated === right.scanTruncated
    && jsonlAuditStringArraysMatch(left.entries, right.entries);
}

async function readJsonlAuditLockQuarantineRecoveryCandidate(
  quarantinePath: string,
  expectedOwnerFingerprint: string
): Promise<JsonlAuditLockQuarantineRecoveryCandidate | undefined> {
  let quarantineStatus;
  try {
    quarantineStatus = await fs.lstat(quarantinePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  if (!quarantineStatus.isDirectory()) {
    throw new Error(
      "Audit lock quarantine recovery requires a directory residue."
    );
  }

  const maintenanceFinalizationContext =
    createJsonlAuditLockMaintenanceFinalizationContext();
  let quarantineDirectory: JsonlAuditLockPinnedDirectory | undefined;
  const nestedLockPath = path.join(quarantinePath, "lock");
  let nestedLockDirectory: JsonlAuditLockPinnedDirectory | undefined;
  let ownerFile: JsonlAuditLockPinnedOwnerMetadata | undefined;
  let keepHandles = false;
  let rejected = false;
  let rejection: unknown;
  try {
    quarantineDirectory = await openJsonlAuditLockPinnedDirectory(
      quarantinePath,
      maintenanceFinalizationContext
    );
    if (quarantineDirectory === undefined) {
      throw new Error("Audit lock quarantine changed before recovery.");
    }
    let nestedLockStatus;
    try {
      nestedLockStatus = await fs.lstat(nestedLockPath);
    } catch (error) {
      if (isJsonlAuditLockChangedError(error)) {
        throw new Error(
          "Audit lock quarantine recovery requires lock_with_owner or lock_and_owner layout."
        );
      }
      throw error;
    }
    if (!nestedLockStatus.isDirectory()) {
      throw new Error(
        "Audit lock quarantine recovery requires lock_with_owner or lock_and_owner layout."
      );
    }
    nestedLockDirectory = await openJsonlAuditLockPinnedDirectory(
      nestedLockPath,
      maintenanceFinalizationContext
    );
    if (nestedLockDirectory === undefined) {
      throw new Error("Audit lock quarantine changed before recovery.");
    }

    const rootScan = await scanJsonlAuditLockDirectoryEntries(
      quarantinePath,
      quarantineDirectory
    );
    const nestedLockScan = await scanJsonlAuditLockDirectoryEntries(
      nestedLockPath,
      nestedLockDirectory
    );
    if (rootScan.scanTruncated || nestedLockScan.scanTruncated) {
      throw new Error(
        "Audit lock quarantine recovery requires lock_with_owner or lock_and_owner layout."
      );
    }
    const rootEntries = rootScan.entries;
    const nestedLockEntries = nestedLockScan.entries;
    let layout: JsonlAuditLockQuarantineRecoveryLayout;
    let ownerLocation: JsonlAuditLockQuarantineOwnerLocation;
    if (
      jsonlAuditStringArraysMatch(rootEntries, ["lock"])
      && jsonlAuditStringArraysMatch(
        nestedLockEntries,
        [JSONL_AUDIT_LOCK_OWNER_FILE_NAME]
      )
    ) {
      layout = "lock_with_owner";
      ownerLocation = "lock";
    } else if (
      jsonlAuditStringArraysMatch(
        rootEntries,
        ["lock", JSONL_AUDIT_LOCK_OWNER_FILE_NAME]
      )
      && nestedLockEntries.length === 0
    ) {
      layout = "lock_and_owner";
      ownerLocation = "root";
    } else {
      throw new Error(
        "Audit lock quarantine recovery requires lock_with_owner or lock_and_owner layout."
      );
    }

    const ownerDirectory = ownerLocation === "root"
      ? quarantinePath
      : nestedLockPath;
    const ownerInspection = await inspectJsonlAuditLockPinnedOwnerMetadata(
      ownerDirectory,
      maintenanceFinalizationContext
    );
    if (
      ownerInspection.status !== "valid"
      || ownerInspection.metadata === undefined
      || ownerInspection.identity === undefined
      || ownerInspection.pinnedOwner === undefined
    ) {
      throw new Error(
        "Audit lock quarantine recovery requires valid owner metadata."
      );
    }
    ownerFile = ownerInspection.pinnedOwner;
    const ownerFingerprint = getJsonlAuditLockOwnerFingerprint({
      domain: "quarantine",
      candidatePath: quarantinePath,
      layout,
      ownerLocation,
      directories: [
        {
          role: "root",
          directoryPath: quarantinePath,
          identity: quarantineDirectory.identity
        },
        {
          role: "lock",
          directoryPath: nestedLockPath,
          identity: nestedLockDirectory.identity
        }
      ],
      ownerPath: ownerInspection.ownerPath,
      ownerIdentity: ownerInspection.pinnedOwner.identity,
      ownerMetadata: ownerInspection.metadata
    });
    if (ownerFingerprint !== expectedOwnerFingerprint) {
      throw new Error("Audit file lock owner fingerprint does not match.");
    }

    const candidate: JsonlAuditLockQuarantineRecoveryCandidate = {
      layout,
      ownerLocation,
      quarantineDirectory,
      nestedLockDirectory,
      ownerFile,
      ownerToken: ownerInspection.metadata.ownerToken,
      ownerFingerprint,
      maintenanceFinalizationContext
    };
    await assertJsonlAuditLockQuarantineRecoveryCandidate(
      quarantinePath,
      candidate
    );
    keepHandles = true;
    return candidate;
  } catch (error) {
    rejected = true;
    rejection = error;
    throw error;
  } finally {
    if (!keepHandles) {
      const handles = [
        ...(quarantineDirectory === undefined
          ? []
          : [quarantineDirectory.handle]),
        ...(nestedLockDirectory === undefined
          ? []
          : [nestedLockDirectory.handle]),
        ...(ownerFile === undefined ? [] : [ownerFile.handle])
      ];
      if (
        rejected
        && (handles.length > 0
          || maintenanceFinalizationContext.handles.length > 0)
      ) {
        const finalization = await finalizeJsonlAuditLockMaintenanceHandles(
          handles,
          [maintenanceFinalizationContext]
        );
        throw addJsonlAuditLockMaintenanceHandleFinalization(
          rejection,
          "quarantine_recovery",
          finalization
        );
      }
    }
  }
}

function getJsonlAuditLockQuarantineRecoveryOwnerPath(
  quarantinePath: string,
  candidate: JsonlAuditLockQuarantineRecoveryCandidate
): string {
  return getJsonlAuditLockOwnerPath(
    candidate.ownerLocation === "root"
      ? quarantinePath
      : path.join(quarantinePath, "lock")
  );
}

async function assertJsonlAuditLockQuarantineRecoveryCandidate(
  quarantinePath: string,
  candidate: JsonlAuditLockQuarantineRecoveryCandidate
): Promise<void> {
  const nestedLockPath = path.join(quarantinePath, "lock");
  await assertJsonlAuditLockPinnedDirectoryPath(
    quarantinePath,
    candidate.quarantineDirectory.handle,
    candidate.quarantineDirectory.identity,
    "Audit lock quarantine changed before recovery."
  );
  await assertJsonlAuditLockPinnedDirectoryPath(
    nestedLockPath,
    candidate.nestedLockDirectory.handle,
    candidate.nestedLockDirectory.identity,
    "Audit lock quarantine changed before recovery."
  );
  const expectedRootEntries = candidate.layout === "lock_with_owner"
    ? ["lock"]
    : ["lock", JSONL_AUDIT_LOCK_OWNER_FILE_NAME];
  const expectedNestedEntries = candidate.layout === "lock_with_owner"
    ? [JSONL_AUDIT_LOCK_OWNER_FILE_NAME]
    : [];
  await assertJsonlAuditLockPinnedDirectoryEntries(
    quarantinePath,
    candidate.quarantineDirectory,
    expectedRootEntries,
    "Audit lock quarantine changed before recovery."
  );
  await assertJsonlAuditLockPinnedDirectoryEntries(
    nestedLockPath,
    candidate.nestedLockDirectory,
    expectedNestedEntries,
    "Audit lock quarantine changed before recovery."
  );
  await assertJsonlAuditRecoveryOwner(
    candidate.ownerLocation === "root" ? quarantinePath : nestedLockPath,
    candidate,
    "Audit lock quarantine changed before recovery."
  );
  await assertJsonlAuditLockPinnedDirectoryPath(
    quarantinePath,
    candidate.quarantineDirectory.handle,
    candidate.quarantineDirectory.identity,
    "Audit lock quarantine changed before recovery."
  );
  await assertJsonlAuditLockPinnedDirectoryPath(
    nestedLockPath,
    candidate.nestedLockDirectory.handle,
    candidate.nestedLockDirectory.identity,
    "Audit lock quarantine changed before recovery."
  );
}

async function assertRecoveredJsonlAuditLock(
  lockPath: string,
  lockDirectory: JsonlAuditLockPinnedDirectory,
  candidate: JsonlAuditLockQuarantineRecoveryCandidate
): Promise<void> {
  await assertJsonlAuditLockPinnedDirectoryPath(
    lockPath,
    lockDirectory.handle,
    lockDirectory.identity,
    "Recovered audit coordination lock changed during recovery."
  );
  await assertJsonlAuditRecoveryOwner(
    lockPath,
    candidate,
    "Recovered audit coordination lock changed during recovery."
  );
  await assertJsonlAuditLockPinnedDirectoryEntries(
    lockPath,
    lockDirectory,
    [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
    "Recovered audit coordination lock changed during recovery."
  );
  await assertJsonlAuditLockPinnedDirectoryPath(
    lockPath,
    lockDirectory.handle,
    lockDirectory.identity,
    "Recovered audit coordination lock changed during recovery."
  );
}

async function assertPostTransferJsonlAuditLockQuarantine(
  quarantinePath: string,
  candidate: JsonlAuditLockQuarantineRecoveryCandidate
): Promise<void> {
  const nestedLockPath = path.join(quarantinePath, "lock");
  await assertJsonlAuditLockPinnedDirectoryPath(
    quarantinePath,
    candidate.quarantineDirectory.handle,
    candidate.quarantineDirectory.identity,
    "Audit lock quarantine changed during recovery."
  );
  await assertJsonlAuditLockPinnedDirectoryPath(
    nestedLockPath,
    candidate.nestedLockDirectory.handle,
    candidate.nestedLockDirectory.identity,
    "Audit lock quarantine changed during recovery."
  );
  await assertJsonlAuditLockPinnedDirectoryEntries(
    quarantinePath,
    candidate.quarantineDirectory,
    ["lock"],
    "Audit lock quarantine changed during recovery."
  );
  await assertJsonlAuditLockPinnedDirectoryEntries(
    nestedLockPath,
    candidate.nestedLockDirectory,
    [],
    "Audit lock quarantine changed during recovery."
  );
  await assertJsonlAuditLockPinnedDirectoryPath(
    quarantinePath,
    candidate.quarantineDirectory.handle,
    candidate.quarantineDirectory.identity,
    "Audit lock quarantine changed during recovery."
  );
  await assertJsonlAuditLockPinnedDirectoryPath(
    nestedLockPath,
    candidate.nestedLockDirectory.handle,
    candidate.nestedLockDirectory.identity,
    "Audit lock quarantine changed during recovery."
  );
}

async function assertJsonlAuditRecoveryOwner(
  ownerDirectory: string,
  candidate: JsonlAuditLockQuarantineRecoveryCandidate,
  message: string
): Promise<void> {
  await assertJsonlAuditPinnedOwnerMetadata(
    ownerDirectory,
    candidate.ownerFile,
    message
  );
}

async function assertEmptyJsonlAuditRecoveryPinnedDirectory(
  directoryPath: string,
  directory: JsonlAuditLockPinnedDirectory,
  message: string
): Promise<void> {
  await assertJsonlAuditLockPinnedDirectoryPath(
    directoryPath,
    directory.handle,
    directory.identity,
    message
  );
  await assertJsonlAuditLockPinnedDirectoryEntries(
    directoryPath,
    directory,
    [],
    message
  );
}

async function assertJsonlAuditRecoveryPathMissing(
  targetPath: string
): Promise<void> {
  try {
    await fs.lstat(targetPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error("Recovered audit coordination lock changed during recovery.");
}

async function rollbackJsonlAuditLockQuarantineRecovery(
  quarantinePath: string,
  lockPath: string,
  recoveryParentDirectory: JsonlAuditLockPinnedDirectory,
  recoveredLockDirectory: JsonlAuditLockPinnedDirectory,
  candidate: JsonlAuditLockQuarantineRecoveryCandidate,
  ownerTransferred: boolean
): Promise<JsonlAuditLockQuarantineRecoveryRollbackResult> {
  const recoveryParentAnchor = {
    directoryPath: path.dirname(lockPath),
    handle: recoveryParentDirectory.handle
  };
  let ownerRestored = !ownerTransferred;
  if (ownerTransferred) {
    try {
      await assertJsonlAuditLockPinnedDirectoryPath(
        lockPath,
        recoveredLockDirectory.handle,
        recoveredLockDirectory.identity,
        "Recovered audit coordination lock changed during rollback."
      );
      await assertJsonlAuditRecoveryOwner(
        lockPath,
        candidate,
        "Recovered audit coordination lock changed during rollback."
      );
      await assertJsonlAuditLockPinnedDirectoryPath(
        quarantinePath,
        candidate.quarantineDirectory.handle,
        candidate.quarantineDirectory.identity,
        "Audit lock quarantine changed during rollback."
      );
      await assertJsonlAuditLockPinnedDirectoryPath(
        path.join(quarantinePath, "lock"),
        candidate.nestedLockDirectory.handle,
        candidate.nestedLockDirectory.identity,
        "Audit lock quarantine changed during rollback."
      );
      const originalOwnerPath = getJsonlAuditLockQuarantineRecoveryOwnerPath(
        quarantinePath,
        candidate
      );
      await assertJsonlAuditRecoveryPathMissing(originalOwnerPath);
      await assertJsonlAuditLockPinnedDirectoryPath(
        lockPath,
        recoveredLockDirectory.handle,
        recoveredLockDirectory.identity,
        "Recovered audit coordination lock changed during rollback."
      );
      const originalOwnerDirectory = candidate.ownerLocation === "root"
        ? quarantinePath
        : path.join(quarantinePath, "lock");
      const originalOwnerPinnedDirectory = candidate.ownerLocation === "root"
        ? candidate.quarantineDirectory
        : candidate.nestedLockDirectory;
      await assertJsonlAuditLockPinnedDirectoryPath(
        originalOwnerDirectory,
        originalOwnerPinnedDirectory.handle,
        originalOwnerPinnedDirectory.identity,
        "Audit lock quarantine changed during rollback."
      );
      await renameJsonlAuditDirectoryEntry(
        {
          directoryPath: lockPath,
          handle: recoveredLockDirectory.handle
        },
        JSONL_AUDIT_LOCK_OWNER_FILE_NAME,
        {
          directoryPath: originalOwnerDirectory,
          handle: originalOwnerPinnedDirectory.handle
        },
        JSONL_AUDIT_LOCK_OWNER_FILE_NAME
      );
      await assertJsonlAuditRecoveryOwner(
        originalOwnerDirectory,
        candidate,
        "Audit lock quarantine owner could not be restored during rollback."
      );
      ownerRestored = true;
    } catch {
      return {
        complete: false,
        reservationRemoved: false
      };
    }
  }

  let candidateRestored = false;
  try {
    await assertJsonlAuditLockQuarantineRecoveryCandidate(
      quarantinePath,
      candidate
    );
    candidateRestored = true;
  } catch {
    // Preserve externally changed quarantine state for inspection.
  }

  let reservationRemoved = false;
  try {
    await assertEmptyJsonlAuditRecoveryPinnedDirectory(
      lockPath,
      recoveredLockDirectory,
      "Recovered audit coordination lock changed during rollback."
    );
    await rmdirJsonlAuditDirectoryEntry(
      recoveryParentAnchor,
      path.basename(lockPath)
    );
    await assertJsonlAuditLockPinnedDirectoryUnlinked(
      lockPath,
      recoveredLockDirectory.handle,
      recoveredLockDirectory.identity,
      "Recovered audit coordination lock changed during rollback."
    );
    reservationRemoved = true;
  } catch {
    if (await isJsonlAuditRecoveryPinnedDirectoryUnlinked(
      lockPath,
      recoveredLockDirectory
    )) {
      reservationRemoved = true;
    }
  }

  if (ownerRestored && candidateRestored && reservationRemoved) {
    return {
      complete: true,
      reservationRemoved: true
    };
  }
  if (ownerRestored && candidateRestored && !reservationRemoved) {
    try {
      await assertJsonlAuditLockPinnedDirectoryPath(
        lockPath,
        recoveredLockDirectory.handle,
        recoveredLockDirectory.identity,
        "Recovered audit coordination lock changed during rollback."
      );
      return {
        complete: false,
        reservationRemoved: false,
        residualLockPath: lockPath
      };
    } catch {
      // Fall through to an unverified rollback result.
    }
  }
  return {
    complete: false,
    reservationRemoved
  };
}

async function isJsonlAuditRecoveryPinnedDirectoryUnlinked(
  directoryPath: string,
  directory: JsonlAuditLockPinnedDirectory
): Promise<boolean> {
  try {
    return jsonlAuditLockPinnedDirectoryUnlinked(
      directoryPath,
      directory.handle,
      directory.identity
    );
  } catch {
    return false;
  }
}

async function cleanupRecoveredJsonlAuditLockQuarantine(
  quarantinePath: string,
  recoveryParentDirectory: JsonlAuditLockPinnedDirectory,
  candidate: JsonlAuditLockQuarantineRecoveryCandidate
): Promise<string | undefined> {
  const nestedLockPath = path.join(quarantinePath, "lock");
  const quarantineRootAnchor = {
    directoryPath: quarantinePath,
    handle: candidate.quarantineDirectory.handle
  };
  const recoveryParentAnchor = {
    directoryPath: path.dirname(quarantinePath),
    handle: recoveryParentDirectory.handle
  };
  try {
    await assertPostTransferJsonlAuditLockQuarantine(
      quarantinePath,
      candidate
    );
    await assertEmptyJsonlAuditRecoveryPinnedDirectory(
      nestedLockPath,
      candidate.nestedLockDirectory,
      "Audit lock quarantine changed after recovery commit."
    );
    await rmdirJsonlAuditDirectoryEntry(quarantineRootAnchor, "lock");
    await assertJsonlAuditLockPinnedDirectoryUnlinked(
      nestedLockPath,
      candidate.nestedLockDirectory.handle,
      candidate.nestedLockDirectory.identity,
      "Audit lock quarantine changed after recovery commit."
    );
    await assertEmptyJsonlAuditRecoveryPinnedDirectory(
      quarantinePath,
      candidate.quarantineDirectory,
      "Audit lock quarantine changed after recovery commit."
    );
    await rmdirJsonlAuditDirectoryEntry(
      recoveryParentAnchor,
      path.basename(quarantinePath)
    );
    await assertJsonlAuditLockPinnedDirectoryUnlinked(
      quarantinePath,
      candidate.quarantineDirectory.handle,
      candidate.quarantineDirectory.identity,
      "Audit lock quarantine changed after recovery commit."
    );
    return undefined;
  } catch {
    return quarantinePath;
  }
}

async function readJsonlAuditLockEmptyQuarantineCleanupCandidate(
  quarantinePath: string,
  expectedQuarantineFingerprint: string
): Promise<JsonlAuditLockEmptyQuarantineCleanupCandidate | undefined> {
  let quarantineStatus;
  try {
    quarantineStatus = await fs.lstat(quarantinePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  if (!quarantineStatus.isDirectory()) {
    throw new Error(
      "Audit lock empty quarantine cleanup requires a directory quarantine entry."
    );
  }
  const maintenanceFinalizationContext =
    createJsonlAuditLockMaintenanceFinalizationContext();
  let pinned: JsonlAuditLockPinnedDirectory | undefined;
  try {
    pinned = await openJsonlAuditLockPinnedEmptyDirectory(
      quarantinePath,
      maintenanceFinalizationContext
    );
    if (pinned === undefined) {
      throw new Error(
        "Audit lock empty quarantine cleanup requires an exact empty directory."
      );
    }
    const fingerprint = getJsonlAuditLockEmptyQuarantineFingerprint(
      quarantinePath,
      pinned.identity
    );
    if (fingerprint !== expectedQuarantineFingerprint) {
      throw new Error("Audit lock empty quarantine fingerprint does not match.");
    }
    return { ...pinned, fingerprint, maintenanceFinalizationContext };
  } catch (error) {
    const handles = [
      ...(pinned === undefined ? [] : [pinned.handle])
    ];
    if (
      handles.length === 0
      && maintenanceFinalizationContext.handles.length === 0
    ) {
      throw error;
    }
    const finalization = await finalizeJsonlAuditLockMaintenanceHandles(
      handles,
      [maintenanceFinalizationContext]
    );
    throw addJsonlAuditLockMaintenanceHandleFinalization(
      error,
      "empty_quarantine_cleanup",
      finalization
    );
  }
}

async function assertJsonlAuditLockEmptyQuarantineCleanupCandidate(
  quarantinePath: string,
  candidate: JsonlAuditLockEmptyQuarantineCleanupCandidate,
  maintenanceFinalizationContext:
    JsonlAuditLockMaintenanceFinalizationContext
): Promise<void> {
  const descriptorIdentity = await readJsonlAuditLockEmptyDirectoryHandleIdentity(
    candidate.handle
  );
  const identity = await readJsonlAuditLockEmptyDirectoryIdentity(
    quarantinePath,
    maintenanceFinalizationContext
  );
  if (
    descriptorIdentity === undefined
    || identity === undefined
    || !jsonlAuditLockEmptyDirectoryIdentityMatches(
      candidate.identity,
      descriptorIdentity
    )
    || !jsonlAuditLockEmptyDirectoryIdentityMatches(
      candidate.identity,
      identity
    )
    || getJsonlAuditLockEmptyQuarantineFingerprint(quarantinePath, identity)
      !== candidate.fingerprint
  ) {
    throw new Error("Audit lock empty quarantine changed before cleanup.");
  }
  const finalDescriptorIdentity =
    await readJsonlAuditLockEmptyDirectoryHandleIdentity(candidate.handle);
  if (
    finalDescriptorIdentity === undefined
    || !jsonlAuditLockEmptyDirectoryIdentityMatches(
      candidate.identity,
      finalDescriptorIdentity
    )
  ) {
    throw new Error("Audit lock empty quarantine changed before cleanup.");
  }
}

async function readJsonlAuditLockEmptyDisposalCleanupCandidate(
  disposalPath: string,
  quarantinePath: string,
  expectedDisposalFingerprint: string
): Promise<JsonlAuditLockEmptyDisposalCleanupCandidate | undefined> {
  let disposalStatus;
  try {
    disposalStatus = await fs.lstat(disposalPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  if (!disposalStatus.isDirectory()) {
    throw new Error(
      "Audit lock empty disposal cleanup requires a directory disposal entry."
    );
  }
  await assertJsonlAuditLockDisposalSourceMissing(quarantinePath);
  const maintenanceFinalizationContext =
    createJsonlAuditLockMaintenanceFinalizationContext();
  let pinned: JsonlAuditLockPinnedDirectory | undefined;
  try {
    pinned = await openJsonlAuditLockPinnedEmptyDirectory(
      disposalPath,
      maintenanceFinalizationContext
    );
    if (pinned === undefined) {
      throw new Error(
        "Audit lock empty disposal cleanup requires an exact empty directory."
      );
    }
    const fingerprint = getJsonlAuditLockEmptyDisposalFingerprint(
      disposalPath,
      pinned.identity
    );
    if (fingerprint !== expectedDisposalFingerprint) {
      throw new Error("Audit lock empty disposal fingerprint does not match.");
    }
    await assertJsonlAuditLockDisposalSourceMissing(quarantinePath);
    return { ...pinned, fingerprint, maintenanceFinalizationContext };
  } catch (error) {
    const handles = [
      ...(pinned === undefined ? [] : [pinned.handle])
    ];
    if (
      handles.length === 0
      && maintenanceFinalizationContext.handles.length === 0
    ) {
      throw error;
    }
    const finalization = await finalizeJsonlAuditLockMaintenanceHandles(
      handles,
      [maintenanceFinalizationContext]
    );
    throw addJsonlAuditLockMaintenanceHandleFinalization(
      error,
      "empty_disposal_cleanup",
      finalization
    );
  }
}

async function assertJsonlAuditLockEmptyDisposalCleanupCandidate(
  disposalPath: string,
  quarantinePath: string,
  candidate: JsonlAuditLockEmptyDisposalCleanupCandidate,
  maintenanceFinalizationContext:
    JsonlAuditLockMaintenanceFinalizationContext
): Promise<void> {
  await assertJsonlAuditLockDisposalSourceMissing(quarantinePath);
  const descriptorIdentity = await readJsonlAuditLockEmptyDirectoryHandleIdentity(
    candidate.handle
  );
  const identity = await readJsonlAuditLockEmptyDirectoryIdentity(
    disposalPath,
    maintenanceFinalizationContext
  );
  if (
    descriptorIdentity === undefined
    || identity === undefined
    || !jsonlAuditLockEmptyDirectoryIdentityMatches(
      candidate.identity,
      descriptorIdentity
    )
    || !jsonlAuditLockEmptyDirectoryIdentityMatches(
      candidate.identity,
      identity
    )
    || getJsonlAuditLockEmptyDisposalFingerprint(disposalPath, identity)
      !== candidate.fingerprint
  ) {
    throw new Error("Audit lock empty disposal changed before cleanup.");
  }
  const finalDescriptorIdentity =
    await readJsonlAuditLockEmptyDirectoryHandleIdentity(candidate.handle);
  if (
    finalDescriptorIdentity === undefined
    || !jsonlAuditLockEmptyDirectoryIdentityMatches(
      candidate.identity,
      finalDescriptorIdentity
    )
  ) {
    throw new Error("Audit lock empty disposal changed before cleanup.");
  }
  await assertJsonlAuditLockDisposalSourceMissing(quarantinePath);
}

async function readJsonlAuditLockEmptyDirectoryIdentity(
  directoryPath: string,
  failureHandleHandoff?: JsonlAuditLockMaintenanceFinalizationContext,
  inspectionCloseSettlementBounded = false
): Promise<JsonlAuditLockEmptyDirectoryIdentity | undefined> {
  const pinned = await openJsonlAuditLockPinnedEmptyDirectory(
    directoryPath,
    failureHandleHandoff,
    inspectionCloseSettlementBounded
  );
  if (pinned === undefined) {
    return undefined;
  }
  try {
    return pinned.identity;
  } finally {
    if (!handoffJsonlAuditLockMaintenanceHandle(
      failureHandleHandoff,
      pinned.handle
    )) {
      if (inspectionCloseSettlementBounded) {
        await closeJsonlAuditInspectionResources([pinned.handle]);
      } else {
        await pinned.handle.close();
      }
    }
  }
}

async function openJsonlAuditLockPinnedEmptyDirectory(
  directoryPath: string,
  failureHandleHandoff?: JsonlAuditLockMaintenanceFinalizationContext,
  inspectionCloseSettlementBounded = false
): Promise<JsonlAuditLockPinnedDirectory | undefined> {
  const pinned = await openJsonlAuditLockPinnedDirectory(
    directoryPath,
    failureHandleHandoff,
    inspectionCloseSettlementBounded
  );
  if (pinned === undefined) {
    return undefined;
  }
  let keepHandle = false;
  try {
    const initialScan = await scanJsonlAuditLockDirectoryEntries(
      directoryPath,
      pinned
    );
    if (initialScan.scanTruncated || initialScan.entries.length !== 0) {
      return undefined;
    }
    const descriptorIdentity =
      await readJsonlAuditLockEmptyDirectoryHandleIdentity(pinned.handle);
    if (
      descriptorIdentity === undefined
      || !jsonlAuditLockEmptyDirectoryIdentityMatches(
        pinned.identity,
        descriptorIdentity
      )
      || !(await jsonlAuditLockPinnedDirectoryObservationMatches(
        directoryPath,
        pinned.handle,
        pinned.identity
      ))
    ) {
      return undefined;
    }
    const finalScan = await scanJsonlAuditLockDirectoryEntries(
      directoryPath,
      pinned
    );
    if (
      finalScan.scanTruncated
      || finalScan.entries.length !== 0
      || !jsonlAuditLockDirectoryScansMatch(initialScan, finalScan)
    ) {
      return undefined;
    }
    const finalDescriptorIdentity =
      await readJsonlAuditLockEmptyDirectoryHandleIdentity(pinned.handle);
    if (
      finalDescriptorIdentity === undefined
      || !jsonlAuditLockEmptyDirectoryIdentityMatches(
        pinned.identity,
        finalDescriptorIdentity
      )
      || !(await jsonlAuditLockPinnedDirectoryObservationMatches(
        directoryPath,
        pinned.handle,
        pinned.identity
      ))
    ) {
      return undefined;
    }
    keepHandle = true;
    return pinned;
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      return undefined;
    }
    throw error;
  } finally {
    if (!keepHandle) {
      if (!handoffJsonlAuditLockMaintenanceHandle(
        failureHandleHandoff,
        pinned.handle
      )) {
        if (inspectionCloseSettlementBounded) {
          await closeJsonlAuditInspectionResources([pinned.handle]);
        } else {
          await pinned.handle.close();
        }
      }
    }
  }
}

async function openJsonlAuditLockPinnedDirectory(
  directoryPath: string,
  failureHandleHandoff?: JsonlAuditLockMaintenanceFinalizationContext,
  inspectionCloseSettlementBounded = false,
  acquisitionCloseSettlementBounded = false
): Promise<JsonlAuditLockPinnedDirectory | undefined> {
  let initialStatus;
  try {
    initialStatus = await fs.lstat(directoryPath, { bigint: true });
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      return undefined;
    }
    throw error;
  }
  if (!initialStatus.isDirectory()) {
    return undefined;
  }
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const directoryOnly = "O_DIRECTORY" in constants ? constants.O_DIRECTORY : 0;
  let handle: FileHandle;
  try {
    handle = await fs.open(
      directoryPath,
      constants.O_RDONLY | noFollow | directoryOnly
    );
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      return undefined;
    }
    throw error;
  }
  let keepHandle = false;
  try {
    const descriptorIdentity =
      await readJsonlAuditLockEmptyDirectoryHandleIdentity(handle);
    const initialIdentity: JsonlAuditLockEmptyDirectoryIdentity = {
      device: initialStatus.dev,
      inode: initialStatus.ino,
      ctimeNs: initialStatus.ctimeNs,
      birthtimeNs: initialStatus.birthtimeNs
    };
    if (
      descriptorIdentity === undefined
      || !jsonlAuditLockEmptyDirectoryIdentityMatches(
        initialIdentity,
        descriptorIdentity
      )
    ) {
      return undefined;
    }

    const finalStatus = await fs.lstat(directoryPath, { bigint: true });
    const finalDescriptorIdentity =
      await readJsonlAuditLockEmptyDirectoryHandleIdentity(handle);
    if (
      !finalStatus.isDirectory()
      || finalDescriptorIdentity === undefined
      || !jsonlAuditLockEmptyDirectoryIdentityMatches(initialIdentity, {
        device: finalStatus.dev,
        inode: finalStatus.ino,
        ctimeNs: finalStatus.ctimeNs,
        birthtimeNs: finalStatus.birthtimeNs
      })
      || !jsonlAuditLockEmptyDirectoryIdentityMatches(
        initialIdentity,
        finalDescriptorIdentity
      )
    ) {
      return undefined;
    }
    keepHandle = true;
    return {
      handle,
      identity: initialIdentity,
      ...(failureHandleHandoff === undefined
        ? {}
        : { maintenanceFinalizationContext: failureHandleHandoff }),
      ...(inspectionCloseSettlementBounded
        ? { inspectionCloseSettlementBounded: true as const }
        : {})
    };
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      return undefined;
    }
    throw error;
  } finally {
    if (!keepHandle) {
      if (!handoffJsonlAuditLockMaintenanceHandle(
        failureHandleHandoff,
        handle
      )) {
        if (inspectionCloseSettlementBounded) {
          await closeJsonlAuditInspectionResources([handle]);
        } else if (acquisitionCloseSettlementBounded) {
          try {
            await closeJsonlAuditLockAcquisitionResources([handle]);
          } catch {
            // Preserve the acquisition validation outcome.
          }
        } else {
          await handle.close();
        }
      }
    }
  }
}

async function openJsonlAuditLockMutationParentDirectory(
  directoryPath: string,
  failureHandleHandoff?: JsonlAuditLockMaintenanceFinalizationContext,
  acquisitionCloseSettlementBounded = false
): Promise<JsonlAuditLockPinnedDirectory | undefined> {
  let initialStatus;
  try {
    initialStatus = await fs.lstat(directoryPath, { bigint: true });
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      return undefined;
    }
    throw error;
  }
  if (!initialStatus.isDirectory()) {
    return undefined;
  }
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const directoryOnly = "O_DIRECTORY" in constants ? constants.O_DIRECTORY : 0;
  let handle: FileHandle;
  try {
    handle = await fs.open(
      directoryPath,
      constants.O_RDONLY | noFollow | directoryOnly
    );
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      return undefined;
    }
    throw error;
  }
  let keepHandle = false;
  try {
    const initialIdentity: JsonlAuditLockEmptyDirectoryIdentity = {
      device: initialStatus.dev,
      inode: initialStatus.ino,
      ctimeNs: initialStatus.ctimeNs,
      birthtimeNs: initialStatus.birthtimeNs
    };
    const initialDescriptorIdentity =
      await readJsonlAuditLockEmptyDirectoryHandleIdentity(handle);
    const finalStatus = await fs.lstat(directoryPath, { bigint: true });
    const finalDescriptorIdentity =
      await readJsonlAuditLockEmptyDirectoryHandleIdentity(handle);
    if (
      initialDescriptorIdentity === undefined
      || !finalStatus.isDirectory()
      || finalDescriptorIdentity === undefined
      || !jsonlAuditLockDirectoryObjectIdentityMatches(
        initialIdentity,
        initialDescriptorIdentity
      )
      || !jsonlAuditLockDirectoryObjectIdentityMatches(initialIdentity, {
        device: finalStatus.dev,
        inode: finalStatus.ino,
        ctimeNs: finalStatus.ctimeNs,
        birthtimeNs: finalStatus.birthtimeNs
      })
      || !jsonlAuditLockDirectoryObjectIdentityMatches(
        initialIdentity,
        finalDescriptorIdentity
      )
    ) {
      return undefined;
    }
    keepHandle = true;
    return {
      handle,
      identity: initialDescriptorIdentity,
      ...(failureHandleHandoff === undefined
        ? {}
        : { maintenanceFinalizationContext: failureHandleHandoff })
    };
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      return undefined;
    }
    throw error;
  } finally {
    if (!keepHandle) {
      if (!handoffJsonlAuditLockMaintenanceHandle(
        failureHandleHandoff,
        handle
      )) {
        if (acquisitionCloseSettlementBounded) {
          try {
            await closeJsonlAuditLockAcquisitionResources([handle]);
          } catch {
            // Preserve the acquisition validation outcome.
          }
        } else {
          await handle.close();
        }
      }
    }
  }
}

async function requireJsonlAuditLockMutationParentDirectory(
  entryPath: string,
  errorMessage: string,
  failureHandleHandoff?: JsonlAuditLockMaintenanceFinalizationContext,
  acquisitionCloseSettlementBounded = false
): Promise<JsonlAuditLockPinnedDirectory> {
  const parentDirectory = await openJsonlAuditLockMutationParentDirectory(
    path.dirname(entryPath),
    failureHandleHandoff,
    acquisitionCloseSettlementBounded
  );
  if (parentDirectory === undefined) {
    throw new Error(errorMessage);
  }
  return parentDirectory;
}

async function assertJsonlAuditLockPinnedDirectoryPath(
  directoryPath: string,
  handle: FileHandle,
  expectedIdentity: JsonlAuditLockEmptyDirectoryIdentity,
  errorMessage: string
): Promise<void> {
  if (
    !(await jsonlAuditLockPinnedDirectoryPathMatches(
      directoryPath,
      handle,
      expectedIdentity
    ))
  ) {
    throw new Error(errorMessage);
  }
}

async function assertJsonlAuditLockPinnedDirectoryEntries(
  directoryPath: string,
  directory: JsonlAuditLockPinnedDirectory,
  expectedEntries: readonly string[],
  errorMessage: string
): Promise<void> {
  if (expectedEntries.length > MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES) {
    throw new Error(errorMessage);
  }
  await assertJsonlAuditLockPinnedDirectoryPath(
    directoryPath,
    directory.handle,
    directory.identity,
    errorMessage
  );
  let scan: JsonlAuditLockDirectoryScan;
  try {
    scan = await scanJsonlAuditLockDirectoryEntries(directoryPath, directory);
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      throw new Error(errorMessage);
    }
    throw error;
  }
  const expected = [...expectedEntries].sort();
  if (
    scan.scanTruncated
    || scan.entries.length !== expected.length
    || scan.entries.some((entry, index) => entry !== expected[index])
  ) {
    throw new Error(errorMessage);
  }
  await assertJsonlAuditLockPinnedDirectoryPath(
    directoryPath,
    directory.handle,
    directory.identity,
    errorMessage
  );
}

async function removeJsonlAuditLockPinnedTemporaryDirectory(
  directory: JsonlAuditLockPinnedTemporaryDirectory,
  errorMessage: string
): Promise<void> {
  await assertJsonlAuditLockPinnedDirectoryEntries(
    directory.path,
    directory,
    [],
    errorMessage
  );
  try {
    await rmdirJsonlAuditDirectoryEntry(
      {
        directoryPath: directory.parentPath,
        handle: directory.parentDirectory.handle
      },
      directory.name
    );
  } catch (error) {
    if (
      isNodeError(error)
      && (error.code === "ENOENT"
        || error.code === "ENOTDIR"
        || error.code === "ENOTEMPTY")
    ) {
      throw new Error(errorMessage);
    }
    throw error;
  }
  await assertJsonlAuditLockPinnedDirectoryUnlinked(
    directory.path,
    directory.handle,
    directory.identity,
    errorMessage
  );
}

async function assertJsonlAuditLockPinnedDirectoryUnlinked(
  directoryPath: string,
  handle: FileHandle,
  expectedIdentity: JsonlAuditLockEmptyDirectoryIdentity,
  errorMessage: string
): Promise<void> {
  if (
    !(await jsonlAuditLockPinnedDirectoryUnlinked(
      directoryPath,
      handle,
      expectedIdentity
    ))
  ) {
    throw new Error(errorMessage);
  }
}

async function jsonlAuditLockPinnedDirectoryUnlinked(
  directoryPath: string,
  handle: FileHandle,
  expectedIdentity: JsonlAuditLockEmptyDirectoryIdentity
): Promise<boolean> {
  if (!(await jsonlAuditPathIsMissing(directoryPath))) {
    return false;
  }
  try {
    const status = await handle.stat({ bigint: true });
    if (
      !status.isDirectory()
      || status.nlink !== 0n
      || !jsonlAuditLockDirectoryObjectIdentityMatches(expectedIdentity, {
        device: status.dev,
        inode: status.ino,
        ctimeNs: status.ctimeNs,
        birthtimeNs: status.birthtimeNs
      })
    ) {
      return false;
    }
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      return false;
    }
    throw error;
  }
  return jsonlAuditPathIsMissing(directoryPath);
}

async function jsonlAuditLockPinnedDirectoryPathMatches(
  directoryPath: string,
  handle: FileHandle,
  expectedIdentity: JsonlAuditLockEmptyDirectoryIdentity
): Promise<boolean> {
  try {
    const initialDescriptorIdentity =
      await readJsonlAuditLockEmptyDirectoryHandleIdentity(handle);
    const pathStatus = await fs.lstat(directoryPath, { bigint: true });
    const finalDescriptorIdentity =
      await readJsonlAuditLockEmptyDirectoryHandleIdentity(handle);
    if (
      initialDescriptorIdentity === undefined
      || !pathStatus.isDirectory()
      || finalDescriptorIdentity === undefined
    ) {
      return false;
    }
    const pathIdentity: JsonlAuditLockEmptyDirectoryIdentity = {
      device: pathStatus.dev,
      inode: pathStatus.ino,
      ctimeNs: pathStatus.ctimeNs,
      birthtimeNs: pathStatus.birthtimeNs
    };
    return jsonlAuditLockDirectoryObjectIdentityMatches(
      expectedIdentity,
      initialDescriptorIdentity
    )
      && jsonlAuditLockDirectoryObjectIdentityMatches(
        expectedIdentity,
        pathIdentity
      )
      && jsonlAuditLockDirectoryObjectIdentityMatches(
        expectedIdentity,
        finalDescriptorIdentity
      )
      && jsonlAuditLockEmptyDirectoryIdentityMatches(
        initialDescriptorIdentity,
        pathIdentity
      )
      && jsonlAuditLockEmptyDirectoryIdentityMatches(
        initialDescriptorIdentity,
        finalDescriptorIdentity
      );
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      return false;
    }
    throw error;
  }
}

async function jsonlAuditLockPinnedDirectoryObservationMatches(
  directoryPath: string,
  handle: FileHandle,
  expectedIdentity: JsonlAuditLockEmptyDirectoryIdentity
): Promise<boolean> {
  try {
    const initialDescriptorIdentity =
      await readJsonlAuditLockEmptyDirectoryHandleIdentity(handle);
    const pathStatus = await fs.lstat(directoryPath, { bigint: true });
    const finalDescriptorIdentity =
      await readJsonlAuditLockEmptyDirectoryHandleIdentity(handle);
    if (
      initialDescriptorIdentity === undefined
      || !pathStatus.isDirectory()
      || finalDescriptorIdentity === undefined
    ) {
      return false;
    }
    const pathIdentity: JsonlAuditLockEmptyDirectoryIdentity = {
      device: pathStatus.dev,
      inode: pathStatus.ino,
      ctimeNs: pathStatus.ctimeNs,
      birthtimeNs: pathStatus.birthtimeNs
    };
    return jsonlAuditLockEmptyDirectoryIdentityMatches(
      expectedIdentity,
      initialDescriptorIdentity
    )
      && jsonlAuditLockEmptyDirectoryIdentityMatches(
        expectedIdentity,
        pathIdentity
      )
      && jsonlAuditLockEmptyDirectoryIdentityMatches(
        expectedIdentity,
        finalDescriptorIdentity
      );
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      return false;
    }
    throw error;
  }
}

async function readJsonlAuditLockEmptyDirectoryHandleIdentity(
  handle: FileHandle
): Promise<JsonlAuditLockEmptyDirectoryIdentity | undefined> {
  const status = await handle.stat({ bigint: true });
  if (!status.isDirectory()) {
    return undefined;
  }
  return {
    device: status.dev,
    inode: status.ino,
    ctimeNs: status.ctimeNs,
    birthtimeNs: status.birthtimeNs
  };
}

function jsonlAuditLockEmptyDirectoryIdentityMatches(
  left: JsonlAuditLockEmptyDirectoryIdentity,
  right: JsonlAuditLockEmptyDirectoryIdentity
): boolean {
  return left.device === right.device
    && left.inode === right.inode
    && left.ctimeNs === right.ctimeNs
    && left.birthtimeNs === right.birthtimeNs;
}

function jsonlAuditLockDirectoryObjectIdentityMatches(
  left: JsonlAuditLockEmptyDirectoryIdentity,
  right: JsonlAuditLockEmptyDirectoryIdentity
): boolean {
  // Transaction-owned rename/unlink changes ctime; the open handle prevents inode reuse.
  return left.device === right.device && left.inode === right.inode;
}

function getJsonlAuditLockEmptyDisposalFingerprint(
  disposalPath: string,
  identity: JsonlAuditLockEmptyDirectoryIdentity
): string {
  return getJsonlAuditLockEmptyDirectoryFingerprint(
    "god-code-audit-empty-disposal\0",
    disposalPath,
    identity,
    JSONL_AUDIT_LOCK_EMPTY_DISPOSAL_FINGERPRINT_HEX_LENGTH
  );
}

function getJsonlAuditLockEmptyQuarantineFingerprint(
  quarantinePath: string,
  identity: JsonlAuditLockEmptyDirectoryIdentity
): string {
  return getJsonlAuditLockEmptyDirectoryFingerprint(
    "god-code-audit-empty-quarantine\0",
    quarantinePath,
    identity,
    JSONL_AUDIT_LOCK_EMPTY_QUARANTINE_FINGERPRINT_HEX_LENGTH
  );
}

function getJsonlAuditLockEmptyDirectoryFingerprint(
  domain: string,
  directoryPath: string,
  identity: JsonlAuditLockEmptyDirectoryIdentity,
  length: number
): string {
  return createHash("sha256")
    .update(domain)
    .update(path.resolve(directoryPath))
    .update("\0")
    .update(identity.device.toString())
    .update("\0")
    .update(identity.inode.toString())
    .update("\0")
    .update(identity.ctimeNs.toString())
    .update("\0")
    .update(identity.birthtimeNs.toString())
    .digest("hex")
    .slice(0, length);
}

async function readJsonlAuditLockDisposalCleanupCandidate(
  disposalPath: string,
  quarantinePath: string,
  expectedOwnerFingerprint: string
): Promise<JsonlAuditLockCleanupCandidate | undefined> {
  let disposalStatus;
  try {
    disposalStatus = await fs.lstat(disposalPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  if (!disposalStatus.isDirectory()) {
    throw new Error(
      "Audit lock disposal cleanup requires a directory disposal entry."
    );
  }
  await assertJsonlAuditLockDisposalSourceMissing(quarantinePath);

  const maintenanceFinalizationContext =
    createJsonlAuditLockMaintenanceFinalizationContext();
  let pinned: JsonlAuditLockPinnedDirectory | undefined;
  let ownerFile: JsonlAuditLockPinnedOwnerMetadata | undefined;
  try {
    pinned = await openJsonlAuditLockPinnedDirectory(
      disposalPath,
      maintenanceFinalizationContext
    );
    if (pinned === undefined) {
      throw new Error("Audit lock disposal changed before cleanup.");
    }
    const ownerInspection = await inspectJsonlAuditLockPinnedOwnerMetadata(
      disposalPath,
      maintenanceFinalizationContext
    );
    if (
      ownerInspection.status !== "valid"
      || ownerInspection.metadata === undefined
      || ownerInspection.identity === undefined
      || ownerInspection.pinnedOwner === undefined
    ) {
      throw new Error(
        "Audit lock disposal cleanup requires valid owner metadata."
      );
    }
    ownerFile = ownerInspection.pinnedOwner;
    const ownerFingerprint = getJsonlAuditLockOwnerFingerprint({
      domain: "disposal",
      candidatePath: disposalPath,
      layout: "owner_only",
      ownerLocation: "root",
      directories: [{
        role: "root",
        directoryPath: disposalPath,
        identity: pinned.identity
      }],
      ownerPath: ownerInspection.ownerPath,
      ownerIdentity: ownerInspection.pinnedOwner.identity,
      ownerMetadata: ownerInspection.metadata,
      sourceQuarantinePath: quarantinePath
    });
    if (ownerFingerprint !== expectedOwnerFingerprint) {
      throw new Error("Audit lock disposal owner fingerprint does not match.");
    }
    await assertJsonlAuditLockPinnedDirectoryEntries(
      disposalPath,
      pinned,
      [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
      "Audit lock disposal cleanup requires exactly one owner metadata entry."
    );
    await assertJsonlAuditLockPinnedDirectoryPath(
      disposalPath,
      pinned.handle,
      pinned.identity,
      "Audit lock disposal changed before cleanup."
    );
    await assertJsonlAuditPinnedOwnerMetadata(
      disposalPath,
      ownerFile,
      "Audit lock disposal changed before cleanup."
    );
    await assertJsonlAuditLockDisposalSourceMissing(quarantinePath);
    return {
      directoryHandle: pinned.handle,
      directoryIdentity: pinned.identity,
      lockIdentity: {
        device: Number(pinned.identity.device),
        inode: Number(pinned.identity.inode)
      },
      ownerFile,
      ownerToken: ownerInspection.metadata.ownerToken,
      ownerFingerprint,
      maintenanceFinalizationContext
    };
  } catch (error) {
    const handles = [
      ...(pinned === undefined ? [] : [pinned.handle]),
      ...(ownerFile === undefined ? [] : [ownerFile.handle])
    ];
    if (
      handles.length === 0
      && maintenanceFinalizationContext.handles.length === 0
    ) {
      throw error;
    }
    const finalization = await finalizeJsonlAuditLockMaintenanceHandles(
      handles,
      [maintenanceFinalizationContext]
    );
    throw addJsonlAuditLockMaintenanceHandleFinalization(
      error,
      "owner_disposal_cleanup",
      finalization
    );
  }
}

async function assertJsonlAuditLockDisposalCleanupCandidate(
  disposalPath: string,
  quarantinePath: string,
  candidate: JsonlAuditLockCleanupCandidate
): Promise<void> {
  await assertJsonlAuditLockDisposalSourceMissing(quarantinePath);
  await assertJsonlAuditLockPinnedDirectoryPath(
    disposalPath,
    candidate.directoryHandle,
    candidate.directoryIdentity,
    "Audit lock disposal changed before cleanup."
  );
  await assertJsonlAuditPinnedOwnerMetadata(
    disposalPath,
    candidate.ownerFile,
    "Audit lock disposal changed before cleanup."
  );
  await assertJsonlAuditLockPinnedDirectoryEntries(
    disposalPath,
    {
      handle: candidate.directoryHandle,
      identity: candidate.directoryIdentity,
      maintenanceFinalizationContext:
        candidate.maintenanceFinalizationContext
    },
    [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
    "Audit lock disposal changed before cleanup."
  );
  await assertJsonlAuditLockDisposalSourceMissing(quarantinePath);
}

async function assertJsonlAuditLockDisposalSourceMissing(
  quarantinePath: string
): Promise<void> {
  try {
    await fs.lstat(quarantinePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error(
    "Audit lock disposal cleanup requires the source quarantine to be absent."
  );
}

async function readJsonlAuditLockCleanupCandidate(
  lockPath: string,
  domain: "active" | "quarantine",
  expectedOwnerFingerprint: string
): Promise<JsonlAuditLockCleanupCandidate | undefined> {
  let lockStatus;
  try {
    lockStatus = await fs.lstat(lockPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  if (!lockStatus.isDirectory()) {
    throw new Error("Audit file lock cleanup requires a directory lock entry.");
  }

  const maintenanceFinalizationContext =
    createJsonlAuditLockMaintenanceFinalizationContext();
  let pinned: JsonlAuditLockPinnedDirectory | undefined;
  let ownerFile: JsonlAuditLockPinnedOwnerMetadata | undefined;
  try {
    pinned = await openJsonlAuditLockPinnedDirectory(
      lockPath,
      maintenanceFinalizationContext
    );
    if (pinned === undefined) {
      throw new Error("Audit file lock changed before cleanup.");
    }
    const ownerInspection = await inspectJsonlAuditLockPinnedOwnerMetadata(
      lockPath,
      maintenanceFinalizationContext
    );
    if (
      ownerInspection.status !== "valid"
      || ownerInspection.metadata === undefined
      || ownerInspection.identity === undefined
      || ownerInspection.pinnedOwner === undefined
    ) {
      throw new Error("Audit file lock cleanup requires valid owner metadata.");
    }
    ownerFile = ownerInspection.pinnedOwner;
    const ownerFingerprint = getJsonlAuditLockOwnerFingerprint({
      domain,
      candidatePath: lockPath,
      layout: "owner_only",
      ownerLocation: "root",
      directories: [{
        role: "root",
        directoryPath: lockPath,
        identity: pinned.identity
      }],
      ownerPath: ownerInspection.ownerPath,
      ownerIdentity: ownerInspection.pinnedOwner.identity,
      ownerMetadata: ownerInspection.metadata
    });
    if (ownerFingerprint !== expectedOwnerFingerprint) {
      throw new Error("Audit file lock owner fingerprint does not match.");
    }
    await assertJsonlAuditLockPinnedDirectoryEntries(
      lockPath,
      pinned,
      [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
      "Audit file lock cleanup requires exactly one owner metadata entry."
    );
    await assertJsonlAuditLockPinnedDirectoryPath(
      lockPath,
      pinned.handle,
      pinned.identity,
      "Audit file lock changed before cleanup."
    );
    await assertJsonlAuditPinnedOwnerMetadata(
      lockPath,
      ownerFile,
      "Audit file lock changed before cleanup."
    );
    return {
      directoryHandle: pinned.handle,
      directoryIdentity: pinned.identity,
      lockIdentity: {
        device: Number(pinned.identity.device),
        inode: Number(pinned.identity.inode)
      },
      ownerFile,
      ownerToken: ownerInspection.metadata.ownerToken,
      ownerFingerprint,
      maintenanceFinalizationContext
    };
  } catch (error) {
    const handles = [
      ...(pinned === undefined ? [] : [pinned.handle]),
      ...(ownerFile === undefined ? [] : [ownerFile.handle])
    ];
    if (
      handles.length === 0
      && maintenanceFinalizationContext.handles.length === 0
    ) {
      throw error;
    }
    const finalization = await finalizeJsonlAuditLockMaintenanceHandles(
      handles,
      [maintenanceFinalizationContext]
    );
    throw addJsonlAuditLockMaintenanceHandleFinalization(
      error,
      domain === "active"
        ? "active_lock_cleanup"
        : "owner_quarantine_cleanup",
      finalization
    );
  }
}

async function assertJsonlAuditLockCleanupCandidate(
  lockPath: string,
  candidate: JsonlAuditLockCleanupCandidate
): Promise<void> {
  await assertJsonlAuditLockCleanupOwnership(lockPath, candidate);
  await assertJsonlAuditLockPinnedDirectoryEntries(
    lockPath,
    {
      handle: candidate.directoryHandle,
      identity: candidate.directoryIdentity,
      maintenanceFinalizationContext:
        candidate.maintenanceFinalizationContext
    },
    [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
    "Audit file lock changed before cleanup."
  );
}

async function assertJsonlAuditLockCleanupOwnership(
  lockPath: string,
  candidate: JsonlAuditLockCleanupCandidate
): Promise<void> {
  await assertJsonlAuditLockPinnedDirectoryPath(
    lockPath,
    candidate.directoryHandle,
    candidate.directoryIdentity,
    "Audit file lock changed before cleanup."
  );
  await assertJsonlAuditPinnedOwnerMetadata(
    lockPath,
    candidate.ownerFile,
    "Audit file lock changed before cleanup."
  );
  await assertJsonlAuditLockPinnedDirectoryPath(
    lockPath,
    candidate.directoryHandle,
    candidate.directoryIdentity,
    "Audit file lock changed before cleanup."
  );
}

async function assertJsonlAuditQuarantinedOwner(
  quarantineRoot: string,
  candidate: JsonlAuditLockCleanupCandidate
): Promise<void> {
  await assertJsonlAuditPinnedOwnerMetadata(
    quarantineRoot,
    candidate.ownerFile,
    "Audit file lock changed during cleanup."
  );
}

async function assertJsonlAuditEmptyLockDirectory(
  lockPath: string,
  candidate: JsonlAuditLockCleanupCandidate
): Promise<void> {
  await assertJsonlAuditLockDirectoryIdentity(lockPath, candidate.lockIdentity);
  await assertJsonlAuditLockPinnedDirectoryEntries(
    lockPath,
    {
      handle: candidate.directoryHandle,
      identity: candidate.directoryIdentity,
      maintenanceFinalizationContext:
        candidate.maintenanceFinalizationContext
    },
    [],
    "Audit file lock changed during cleanup."
  );
}

async function assertJsonlAuditLockDirectoryIdentity(
  lockPath: string,
  expectedIdentity: JsonlAuditFileIdentity
): Promise<void> {
  let status;
  try {
    status = await fs.lstat(lockPath);
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      throw new Error("Audit file lock changed during cleanup.");
    }
    throw error;
  }
  if (
    !status.isDirectory()
    || !jsonlAuditFileIdentityMatches(expectedIdentity, {
      device: status.dev,
      inode: status.ino
    })
  ) {
    throw new Error("Audit file lock changed during cleanup.");
  }
}

async function assertJsonlAuditPathMissing(targetPath: string): Promise<void> {
  try {
    await fs.lstat(targetPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error("Audit file lock changed during cleanup.");
}

async function jsonlAuditPathIsMissing(targetPath: string): Promise<boolean> {
  try {
    await fs.lstat(targetPath);
    return false;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return true;
    }
    if (isJsonlAuditLockChangedError(error)) {
      return false;
    }
    throw error;
  }
}

interface JsonlAuditLockMaintenanceHandleFinalizationOutcome {
  closed: boolean;
  warning?: string;
}

interface JsonlAuditClosableResource {
  close(): Promise<void>;
}

interface JsonlAuditInspectionResourceFinalizationOutcome {
  closed: boolean;
  failure?: unknown;
}

function createJsonlAuditLockMaintenanceFinalizationContext():
JsonlAuditLockMaintenanceFinalizationContext {
  return {
    handles: [],
    outcome: { closed: true }
  };
}

function mergeJsonlAuditLockMaintenanceFinalizationOutcomes(
  outcomes: readonly JsonlAuditLockMaintenanceHandleFinalizationOutcome[]
): JsonlAuditLockMaintenanceHandleFinalizationOutcome {
  const warnings = outcomes
    .map((outcome) => outcome.warning)
    .filter((warning): warning is string => warning !== undefined);
  return {
    closed: outcomes.every((outcome) => outcome.closed),
    ...(warnings.length === 0
      ? {}
      : {
          warning: getJsonlAuditRotationRecoveryErrorMessage(
            warnings.join("; ")
          )
        })
  };
}

function recordJsonlAuditLockMaintenanceFinalizationOutcome(
  context: JsonlAuditLockMaintenanceFinalizationContext,
  outcome: JsonlAuditLockMaintenanceHandleFinalizationOutcome
): void {
  context.outcome = mergeJsonlAuditLockMaintenanceFinalizationOutcomes([
    context.outcome,
    outcome
  ]);
}

function handoffJsonlAuditLockMaintenanceHandle(
  handoff: JsonlAuditLockMaintenanceFinalizationContext | undefined,
  handle: FileHandle
): boolean {
  if (handoff === undefined) {
    return false;
  }
  if (!handoff.handles.includes(handle)) {
    handoff.handles.push(handle);
  }
  return true;
}

function addJsonlAuditLockMaintenanceHandleFinalization(
  error: unknown,
  operation: JsonlAuditLockMaintenanceOperation,
  outcome: JsonlAuditLockMaintenanceHandleFinalizationOutcome
): JsonlAuditLockMaintenanceError {
  const previous = error instanceof JsonlAuditLockMaintenanceError
    ? error.details
    : undefined;
  const mergedOutcome = mergeJsonlAuditLockMaintenanceFinalizationOutcomes([
    {
      closed: previous?.handlesClosed ?? true,
      ...(previous?.handleWarning === undefined
        ? {}
        : { warning: previous.handleWarning })
    },
    outcome
  ]);
  return new JsonlAuditLockMaintenanceError(
    error instanceof JsonlAuditLockMaintenanceError
      ? error.message
      : getJsonlAuditRotationRecoveryErrorMessage(error),
    {
      operation,
      handlesClosed: mergedOutcome.closed,
      ...(mergedOutcome.warning === undefined
        ? {}
        : { handleWarning: mergedOutcome.warning })
    },
    error instanceof JsonlAuditLockMaintenanceError
      ? error.cause ?? error
      : error
  );
}

async function finalizeJsonlAuditLockMaintenanceHandles(
  handles: readonly FileHandle[],
  contexts: readonly JsonlAuditLockMaintenanceFinalizationContext[] = []
): Promise<JsonlAuditLockMaintenanceHandleFinalizationOutcome> {
  const uniqueContexts = [...new Set(contexts)];
  const uniqueHandles = [...new Set([
    ...handles,
    ...uniqueContexts.flatMap((context) => context.handles)
  ])];
  for (const context of uniqueContexts) {
    context.handles.length = 0;
  }
  const handleOutcome = await finalizeJsonlAuditLockMaintenanceResources(
    uniqueHandles
  );
  return mergeJsonlAuditLockMaintenanceFinalizationOutcomes([
    ...uniqueContexts.map((context) => context.outcome),
    handleOutcome
  ]);
}

async function finalizeJsonlAuditLockMaintenanceResources(
  resources: readonly JsonlAuditClosableResource[]
): Promise<JsonlAuditLockMaintenanceHandleFinalizationOutcome> {
  const uniqueResources = [...new Set(resources)];
  const results = await Promise.allSettled(
    uniqueResources.map((resource) => (
      invokeJsonlAuditLockMaintenanceResourceClose(resource)
    ))
  );
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failures.length === 0) {
    return { closed: true };
  }
  return {
    closed: false,
    warning: getJsonlAuditRotationRecoveryErrorMessage(
      failures.map((failure) => (
        `maintenance descriptor close failed: ${getJsonlAuditRotationRecoveryErrorMessage(failure.reason)}`
      )).join("; ")
    )
  };
}

async function invokeJsonlAuditLockMaintenanceResourceClose(
  resource: JsonlAuditClosableResource
): Promise<void> {
  await invokeJsonlAuditResourceCloseWithSettlementTimeout(
    resource,
    JSONL_AUDIT_LOCK_MAINTENANCE_CLOSE_SETTLEMENT_TIMEOUT_MS,
    "maintenance descriptor close timed out after "
      + `${JSONL_AUDIT_LOCK_MAINTENANCE_CLOSE_SETTLEMENT_TIMEOUT_MS} ms`
  );
}

async function closeJsonlAuditLockAcquisitionResources(
  resources: readonly JsonlAuditClosableResource[]
): Promise<void> {
  const uniqueResources = [...new Set(resources)];
  const results = await Promise.allSettled(
    uniqueResources.map((resource) => (
      invokeJsonlAuditLockAcquisitionResourceClose(resource)
    ))
  );
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failure !== undefined) {
    throw failure.reason;
  }
}

async function closeJsonlAuditLockAcquisitionResourcesPreservingPrimary(
  resources: readonly JsonlAuditClosableResource[],
  primaryFailure: { reason: unknown } | undefined
): Promise<void> {
  let closeFailure: { reason: unknown } | undefined;
  try {
    await closeJsonlAuditLockAcquisitionResources(resources);
  } catch (error) {
    closeFailure = { reason: error };
  }
  if (primaryFailure !== undefined) {
    throw primaryFailure.reason;
  }
  if (closeFailure !== undefined) {
    throw closeFailure.reason;
  }
}

async function invokeJsonlAuditLockAcquisitionResourceClose(
  resource: JsonlAuditClosableResource
): Promise<void> {
  await invokeJsonlAuditResourceCloseWithSettlementTimeout(
    resource,
    JSONL_AUDIT_LOCK_ACQUISITION_CLOSE_SETTLEMENT_TIMEOUT_MS,
    "audit lock acquisition descriptor close timed out after "
      + `${JSONL_AUDIT_LOCK_ACQUISITION_CLOSE_SETTLEMENT_TIMEOUT_MS} ms`
  );
}

async function closeJsonlAuditWriterResources(
  resources: readonly JsonlAuditClosableResource[]
): Promise<void> {
  const uniqueResources = [...new Set(resources)];
  const results = await Promise.allSettled(
    uniqueResources.map((resource) => (
      invokeJsonlAuditWriterResourceClose(resource)
    ))
  );
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failure !== undefined) {
    throw failure.reason;
  }
}

async function closeJsonlAuditWriterResourcesPreservingPrimary(
  resources: readonly JsonlAuditClosableResource[],
  primaryFailure: { reason: unknown } | undefined
): Promise<void> {
  let closeFailure: { reason: unknown } | undefined;
  try {
    await closeJsonlAuditWriterResources(resources);
  } catch (error) {
    closeFailure = { reason: error };
  }
  if (primaryFailure !== undefined) {
    throw primaryFailure.reason;
  }
  if (closeFailure !== undefined) {
    throw closeFailure.reason;
  }
}

async function invokeJsonlAuditWriterResourceClose(
  resource: JsonlAuditClosableResource
): Promise<void> {
  await invokeJsonlAuditResourceCloseWithSettlementTimeout(
    resource,
    JSONL_AUDIT_WRITER_CLOSE_SETTLEMENT_TIMEOUT_MS,
    "audit writer descriptor close timed out after "
      + `${JSONL_AUDIT_WRITER_CLOSE_SETTLEMENT_TIMEOUT_MS} ms`
  );
}

async function finalizeJsonlAuditInspectionResources(
  resources: readonly JsonlAuditClosableResource[]
): Promise<JsonlAuditInspectionResourceFinalizationOutcome> {
  const uniqueResources = [...new Set(resources)];
  const results = await Promise.allSettled(
    uniqueResources.map((resource) => (
      invokeJsonlAuditInspectionResourceClose(resource)
    ))
  );
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  return failure === undefined
    ? { closed: true }
    : { closed: false, failure: failure.reason };
}

async function closeJsonlAuditInspectionResources(
  resources: readonly JsonlAuditClosableResource[]
): Promise<void> {
  const finalization = await finalizeJsonlAuditInspectionResources(resources);
  if (!finalization.closed) {
    throw finalization.failure;
  }
}

async function closeJsonlAuditInspectionResourcesPreservingPrimary(
  resources: readonly JsonlAuditClosableResource[],
  primaryFailure: { reason: unknown } | undefined
): Promise<void> {
  const finalization = await finalizeJsonlAuditInspectionResources(resources);
  if (primaryFailure !== undefined) {
    throw primaryFailure.reason;
  }
  if (!finalization.closed) {
    throw finalization.failure;
  }
}

async function invokeJsonlAuditInspectionResourceClose(
  resource: JsonlAuditClosableResource
): Promise<void> {
  await invokeJsonlAuditResourceCloseWithSettlementTimeout(
    resource,
    JSONL_AUDIT_INSPECTION_CLOSE_SETTLEMENT_TIMEOUT_MS,
    "audit inspection descriptor close timed out after "
      + `${JSONL_AUDIT_INSPECTION_CLOSE_SETTLEMENT_TIMEOUT_MS} ms`
  );
}

async function invokeJsonlAuditResourceCloseWithSettlementTimeout(
  resource: JsonlAuditClosableResource,
  timeoutMs: number,
  timeoutMessage: string
): Promise<void> {
  const closeSettlement = Promise.resolve()
    .then(() => resource.close())
    .then(
      () => ({ status: "fulfilled" as const }),
      (reason: unknown) => ({ status: "rejected" as const, reason })
    );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutSettlement = new Promise<{ status: "timed_out" }>(
    (resolve) => {
      timeout = setTimeout(() => {
        resolve({ status: "timed_out" });
      }, timeoutMs);
    }
  );
  try {
    const settlement = await Promise.race([
      closeSettlement,
      timeoutSettlement
    ]);
    if (settlement.status === "fulfilled") {
      return;
    }
    if (settlement.status === "rejected") {
      throw settlement.reason;
    }
    throw new Error(timeoutMessage);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

async function closeJsonlAuditRotationRecoveryHandles(
  handles: readonly FileHandle[]
): Promise<JsonlAuditRotationRecoveryHandleFinalizationOutcome> {
  const uniqueHandles = [...new Set(handles)];
  const results = await Promise.allSettled(
    uniqueHandles.map((handle) => (
      invokeJsonlAuditRotationRecoveryResourceClose(handle)
    ))
  );
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failures.length === 0) {
    return { closed: true };
  }
  return {
    closed: false,
    warning: failures.map((failure) => (
      `recovery descriptor close failed: ${getJsonlAuditRotationRecoveryErrorMessage(failure.reason)}`
    )).join("; ")
  };
}

async function closeJsonlAuditRotationRecoveryResources(
  resources: readonly JsonlAuditClosableResource[]
): Promise<void> {
  const uniqueResources = [...new Set(resources)];
  const results = await Promise.allSettled(
    uniqueResources.map((resource) => (
      invokeJsonlAuditRotationRecoveryResourceClose(resource)
    ))
  );
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failure !== undefined) {
    throw failure.reason;
  }
}

async function closeJsonlAuditRotationRecoveryResourcesPreservingPrimary(
  resources: readonly JsonlAuditClosableResource[],
  primaryFailure: { reason: unknown } | undefined
): Promise<void> {
  let closeFailure: { reason: unknown } | undefined;
  try {
    await closeJsonlAuditRotationRecoveryResources(resources);
  } catch (error) {
    closeFailure = { reason: error };
  }
  if (primaryFailure !== undefined) {
    throw primaryFailure.reason;
  }
  if (closeFailure !== undefined) {
    throw closeFailure.reason;
  }
}

async function invokeJsonlAuditRotationRecoveryResourceClose(
  resource: JsonlAuditClosableResource
): Promise<void> {
  await invokeJsonlAuditResourceCloseWithSettlementTimeout(
    resource,
    JSONL_AUDIT_ROTATION_RECOVERY_CLOSE_SETTLEMENT_TIMEOUT_MS,
    "recovery descriptor close timed out after "
      + `${JSONL_AUDIT_ROTATION_RECOVERY_CLOSE_SETTLEMENT_TIMEOUT_MS} ms`
  );
}

async function closeJsonlAuditLockLifecycleResources(
  resources: readonly JsonlAuditClosableResource[]
): Promise<void> {
  const uniqueResources = [...new Set(resources)];
  const results = await Promise.allSettled(
    uniqueResources.map((resource) => (
      invokeJsonlAuditLockLifecycleResourceClose(resource)
    ))
  );
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failure !== undefined) {
    throw failure.reason;
  }
}

async function closeJsonlAuditLockLifecycleResourcesPreservingPrimary(
  resources: readonly JsonlAuditClosableResource[],
  primaryFailure: { reason: unknown } | undefined
): Promise<void> {
  let closeFailure: { reason: unknown } | undefined;
  try {
    await closeJsonlAuditLockLifecycleResources(resources);
  } catch (error) {
    closeFailure = { reason: error };
  }
  if (primaryFailure !== undefined) {
    throw primaryFailure.reason;
  }
  if (closeFailure !== undefined) {
    throw closeFailure.reason;
  }
}

async function invokeJsonlAuditLockLifecycleResourceClose(
  resource: JsonlAuditClosableResource
): Promise<void> {
  await invokeJsonlAuditResourceCloseWithSettlementTimeout(
    resource,
    JSONL_AUDIT_LOCK_LIFECYCLE_CLOSE_SETTLEMENT_TIMEOUT_MS,
    "audit lock lifecycle descriptor close timed out after "
      + `${JSONL_AUDIT_LOCK_LIFECYCLE_CLOSE_SETTLEMENT_TIMEOUT_MS} ms`
  );
}

async function restoreJsonlAuditLockFromQuarantine(
  lockPath: string,
  quarantineRoot: string,
  quarantineLockPath: string,
  quarantineDirectory: JsonlAuditLockPinnedTemporaryDirectory,
  candidate: JsonlAuditLockCleanupCandidate,
  lockQuarantined: boolean,
  ownerQuarantined: boolean
): Promise<boolean> {
  const quarantineParentAnchor = {
    directoryPath: quarantineDirectory.parentPath,
    handle: quarantineDirectory.parentDirectory.handle
  };
  const quarantineRootAnchor = {
    directoryPath: quarantineRoot,
    handle: quarantineDirectory.handle
  };
  try {
    if (!lockQuarantined) {
      await removeJsonlAuditLockPinnedTemporaryDirectory(
        quarantineDirectory,
        "Audit file lock quarantine root changed during rollback."
      );
      return true;
    }
    if (ownerQuarantined) {
      await assertJsonlAuditLockPinnedDirectoryEntries(
        quarantineRoot,
        quarantineDirectory,
        ["lock", JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
        "Audit file lock quarantine root changed during rollback."
      );
      await assertJsonlAuditQuarantinedOwner(quarantineRoot, candidate);
      await assertJsonlAuditLockDirectoryIdentity(
        quarantineLockPath,
        candidate.lockIdentity
      );
      await assertJsonlAuditPathMissing(
        getJsonlAuditLockOwnerPath(quarantineLockPath)
      );
      await renameJsonlAuditDirectoryEntry(
        quarantineRootAnchor,
        JSONL_AUDIT_LOCK_OWNER_FILE_NAME,
        {
          directoryPath: quarantineLockPath,
          handle: candidate.directoryHandle
        },
        JSONL_AUDIT_LOCK_OWNER_FILE_NAME
      );
    }
    await assertJsonlAuditLockPinnedDirectoryEntries(
      quarantineRoot,
      quarantineDirectory,
      ["lock"],
      "Audit file lock quarantine root changed during rollback."
    );
    await assertJsonlAuditLockCleanupCandidate(quarantineLockPath, candidate);
    await assertJsonlAuditPathMissing(lockPath);
    await renameJsonlAuditDirectoryEntry(
      quarantineRootAnchor,
      "lock",
      quarantineParentAnchor,
      path.basename(lockPath)
    );
    await assertJsonlAuditLockPinnedDirectoryEntries(
      quarantineRoot,
      quarantineDirectory,
      [],
      "Audit file lock quarantine root changed during rollback."
    );
    await assertJsonlAuditLockCleanupCandidate(lockPath, candidate);
    await removeJsonlAuditLockPinnedTemporaryDirectory(
      quarantineDirectory,
      "Audit file lock quarantine root changed during rollback."
    );
    return true;
  } catch {
    return false;
  }
}

async function restoreJsonlAuditLockQuarantineOwner(
  quarantinePath: string,
  disposalRoot: string,
  disposalDirectory: JsonlAuditLockPinnedTemporaryDirectory,
  candidate: JsonlAuditLockCleanupCandidate,
  ownerIsolated: boolean
): Promise<boolean> {
  const disposalRootAnchor = {
    directoryPath: disposalRoot,
    handle: disposalDirectory.handle
  };
  try {
    if (!ownerIsolated) {
      await removeJsonlAuditLockPinnedTemporaryDirectory(
        disposalDirectory,
        "Audit lock disposal root changed during rollback."
      );
      return true;
    }
    await assertJsonlAuditLockPinnedDirectoryEntries(
      disposalRoot,
      disposalDirectory,
      [JSONL_AUDIT_LOCK_OWNER_FILE_NAME],
      "Audit lock disposal root changed during rollback."
    );
    await assertJsonlAuditQuarantinedOwner(disposalRoot, candidate);
    await assertJsonlAuditLockDirectoryIdentity(
      quarantinePath,
      candidate.lockIdentity
    );
    await assertJsonlAuditPathMissing(
      getJsonlAuditLockOwnerPath(quarantinePath)
    );
    await renameJsonlAuditDirectoryEntry(
      disposalRootAnchor,
      JSONL_AUDIT_LOCK_OWNER_FILE_NAME,
      {
        directoryPath: quarantinePath,
        handle: candidate.directoryHandle
      },
      JSONL_AUDIT_LOCK_OWNER_FILE_NAME
    );
    await assertJsonlAuditLockPinnedDirectoryEntries(
      disposalRoot,
      disposalDirectory,
      [],
      "Audit lock disposal root changed during rollback."
    );
    await assertJsonlAuditLockCleanupOwnership(quarantinePath, candidate);
    await removeJsonlAuditLockPinnedTemporaryDirectory(
      disposalDirectory,
      "Audit lock disposal root changed during rollback."
    );
    return true;
  } catch {
    return false;
  }
}

async function createPrivateJsonlAuditTemporaryDirectory(
  prefix: string,
  failureHandleHandoff?: JsonlAuditLockMaintenanceFinalizationContext
): Promise<JsonlAuditLockPinnedTemporaryDirectory> {
  const parentPath = path.dirname(prefix);
  const parentDirectory = await openJsonlAuditLockMutationParentDirectory(
    parentPath,
    failureHandleHandoff
  );
  if (parentDirectory === undefined) {
    throw new Error("Audit lock private directory parent could not be bound.");
  }
  let directory: JsonlAuditLockPinnedDirectory | undefined;
  let temporaryDirectory: JsonlAuditLockPinnedTemporaryDirectory | undefined;
  let keepHandles = false;
  try {
    const created = await createJsonlAuditTemporaryDirectoryEntry(
      {
        directoryPath: parentPath,
        handle: parentDirectory.handle
      },
      path.basename(prefix)
    );
    directory = await openJsonlAuditLockPinnedDirectory(
      created.mutationPath,
      failureHandleHandoff
    );
    if (directory === undefined) {
      throw new Error(
        `Audit lock private directory could not be bound; retained at ${created.path}.`
      );
    }
    temporaryDirectory = {
      path: created.path,
      name: created.name,
      parentPath,
      parentDirectory,
      ...directory
    };
    await directory.handle.chmod(0o700);
    await assertJsonlAuditLockPinnedDirectoryEntries(
      created.path,
      directory,
      [],
      "Audit lock private directory changed during initialization."
    );
    keepHandles = true;
    return temporaryDirectory;
  } catch (error) {
    if (temporaryDirectory !== undefined) {
      try {
        await removeJsonlAuditLockPinnedTemporaryDirectory(
          temporaryDirectory,
          "Audit lock private directory changed during initialization."
        );
      } catch {
        // Preserve the initialization error and leave uncertain state for diagnostics.
      }
    }
    throw error;
  } finally {
    if (!keepHandles) {
      const handles = [
        ...(directory === undefined ? [] : [directory.handle]),
        parentDirectory.handle
      ];
      if (failureHandleHandoff === undefined) {
        await finalizeJsonlAuditLockMaintenanceHandles(handles);
      } else {
        for (const handle of handles) {
          handoffJsonlAuditLockMaintenanceHandle(
            failureHandleHandoff,
            handle
          );
        }
      }
    }
  }
}

function isJsonlAuditLockChangedError(error: unknown): boolean {
  return isNodeError(error)
    && (error.code === "ENOENT"
      || error.code === "ENOTDIR"
      || error.code === "ELOOP");
}

async function createJsonlAuditLockOwnerFile(
  ownerPath: string,
  acquisitionCloseSettlementBounded = false
): Promise<JsonlAuditLockPinnedOwnerFile> {
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = await fs.open(
    ownerPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | noFollow,
    PRIVATE_AUDIT_FILE_MODE
  );
  let keepHandle = false;
  try {
    const identity = await readJsonlAuditLockOwnerFileHandleIdentity(handle);
    if (identity === undefined || identity.size !== 0n) {
      throw new Error("Audit file lock changed during acquisition.");
    }
    keepHandle = true;
    return { handle, identity };
  } finally {
    if (!keepHandle) {
      if (acquisitionCloseSettlementBounded) {
        try {
          await closeJsonlAuditLockAcquisitionResources([handle]);
        } catch {
          // Preserve the acquisition validation outcome.
        }
      } else {
        await handle.close();
      }
    }
  }
}

async function writeJsonlAuditLockOwnerMetadata(
  ownerPath: string,
  ownerFile: JsonlAuditLockPinnedOwnerFile,
  metadata: JsonlAuditLockOwnerMetadata
): Promise<JsonlAuditLockPinnedOwnerMetadata> {
  await assertJsonlAuditPinnedOwnerFilePath(
    ownerPath,
    ownerFile,
    "Audit file lock changed during acquisition."
  );
  const persisted: PersistedJsonlAuditLockOwnerMetadata = {
    version: metadata.version,
    owner_token: metadata.ownerToken,
    pid: metadata.pid,
    acquired_at: metadata.acquiredAt,
    acquired_at_ms: metadata.acquiredAtMs
  };
  await ownerFile.handle.writeFile(`${JSON.stringify(persisted)}\n`, {
    encoding: "utf8"
  });
  const identity = await readJsonlAuditLockOwnerFileHandleIdentity(
    ownerFile.handle
  );
  if (identity === undefined) {
    throw new Error("Audit file lock changed during acquisition.");
  }
  const pinnedOwner = {
    handle: ownerFile.handle,
    identity,
    metadata
  };
  await assertJsonlAuditPinnedOwnerMetadataPath(
    ownerPath,
    pinnedOwner,
    "Audit file lock changed during acquisition."
  );
  return pinnedOwner;
}

async function inspectJsonlAuditLockOwnerMetadata(
  lockPath: string
): Promise<JsonlAuditLockOwnerInspection> {
  const inspection = await inspectJsonlAuditLockPinnedOwnerMetadata(
    lockPath,
    undefined,
    true
  );
  if (inspection.pinnedOwner === undefined) {
    return inspection;
  }
  try {
    return {
      ownerPath: inspection.ownerPath,
      status: inspection.status,
      metadata: inspection.metadata,
      identity: inspection.identity,
      fileIdentity: inspection.fileIdentity
    };
  } finally {
    await closeJsonlAuditInspectionResources([
      inspection.pinnedOwner.handle
    ]);
  }
}

async function inspectJsonlAuditLockPinnedOwnerMetadata(
  lockPath: string,
  failureHandleHandoff?: JsonlAuditLockMaintenanceFinalizationContext,
  inspectionCloseSettlementBounded = false,
  acquisitionCloseSettlementBounded = false
): Promise<JsonlAuditLockPinnedOwnerInspection> {
  const ownerPath = getJsonlAuditLockOwnerPath(lockPath);
  let pathStatus;
  try {
    pathStatus = await fs.lstat(ownerPath, { bigint: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { ownerPath, status: "missing" };
    }
    throw error;
  }
  if (
    !pathStatus.isFile()
    || pathStatus.nlink !== 1n
    || pathStatus.size > BigInt(MAX_JSONL_AUDIT_LOCK_OWNER_BYTES)
  ) {
    return { ownerPath, status: "invalid" };
  }
  const expectedIdentity: JsonlAuditLockOwnerFileIdentity = {
    device: pathStatus.dev,
    inode: pathStatus.ino,
    ctimeNs: pathStatus.ctimeNs,
    birthtimeNs: pathStatus.birthtimeNs,
    mtimeNs: pathStatus.mtimeNs,
    size: pathStatus.size
  };
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  let handle: FileHandle;
  try {
    handle = await fs.open(ownerPath, constants.O_RDONLY | noFollow);
  } catch (error) {
    if (
      isNodeError(error)
      && (error.code === "ENOENT" || error.code === "ELOOP")
    ) {
      return { ownerPath, status: "invalid" };
    }
    throw error;
  }
  let keepHandle = false;
  try {
    const descriptorIdentity = await readJsonlAuditLockOwnerFileHandleIdentity(
      handle
    );
    if (
      descriptorIdentity === undefined
      || !jsonlAuditLockOwnerFileIdentityMatches(
        expectedIdentity,
        descriptorIdentity
      )
    ) {
      return { ownerPath, status: "invalid" };
    }
    const snapshot = await readJsonlAuditPinnedOwnerMetadataSnapshot(
      ownerPath,
      handle,
      expectedIdentity
    );
    if (snapshot === undefined) {
      return { ownerPath, status: "invalid" };
    }
    keepHandle = true;
    return {
      ownerPath,
      status: "valid",
      metadata: snapshot.metadata,
      identity: {
        device: Number(snapshot.identity.device),
        inode: Number(snapshot.identity.inode)
      },
      fileIdentity: snapshot.identity,
      pinnedOwner: {
        handle,
        identity: snapshot.identity,
        metadata: snapshot.metadata
      }
    };
  } finally {
    if (!keepHandle) {
      if (!handoffJsonlAuditLockMaintenanceHandle(
        failureHandleHandoff,
        handle
      )) {
        if (inspectionCloseSettlementBounded) {
          await closeJsonlAuditInspectionResources([handle]);
        } else if (acquisitionCloseSettlementBounded) {
          try {
            await closeJsonlAuditLockAcquisitionResources([handle]);
          } catch {
            // Preserve the acquisition inspection outcome.
          }
        } else {
          await handle.close();
        }
      }
    }
  }
}

async function assertJsonlAuditPinnedOwnerMetadata(
  ownerDirectory: string,
  pinnedOwner: JsonlAuditLockPinnedOwnerMetadata,
  message: string
): Promise<void> {
  await assertJsonlAuditPinnedOwnerMetadataPath(
    getJsonlAuditLockOwnerPath(ownerDirectory),
    pinnedOwner,
    message
  );
}

async function assertJsonlAuditPinnedOwnerFilePath(
  ownerPath: string,
  pinnedOwner: JsonlAuditLockPinnedOwnerFile,
  message: string
): Promise<void> {
  let initialDescriptorStatus;
  let pathStatus;
  let finalDescriptorStatus;
  try {
    initialDescriptorStatus = await pinnedOwner.handle.stat({ bigint: true });
    pathStatus = await fs.lstat(ownerPath, { bigint: true });
    finalDescriptorStatus = await pinnedOwner.handle.stat({ bigint: true });
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      throw new Error(message);
    }
    throw error;
  }
  if (
    !initialDescriptorStatus.isFile()
    || initialDescriptorStatus.nlink !== 1n
    || !pathStatus.isFile()
    || pathStatus.nlink !== 1n
    || !finalDescriptorStatus.isFile()
    || finalDescriptorStatus.nlink !== 1n
    || initialDescriptorStatus.dev !== pinnedOwner.identity.device
    || initialDescriptorStatus.ino !== pinnedOwner.identity.inode
    || pathStatus.dev !== initialDescriptorStatus.dev
    || pathStatus.ino !== initialDescriptorStatus.ino
    || finalDescriptorStatus.dev !== initialDescriptorStatus.dev
    || finalDescriptorStatus.ino !== initialDescriptorStatus.ino
  ) {
    throw new Error(message);
  }
}

async function assertJsonlAuditPinnedOwnerMetadataPath(
  ownerPath: string,
  pinnedOwner: JsonlAuditLockPinnedOwnerMetadata,
  message: string
): Promise<void> {
  const snapshot = await readJsonlAuditPinnedOwnerMetadataSnapshot(
    ownerPath,
    pinnedOwner.handle,
    pinnedOwner.identity
  );
  if (
    snapshot === undefined
    || !jsonlAuditLockOwnerMetadataMatches(
      pinnedOwner.metadata,
      snapshot.metadata
    )
  ) {
    throw new Error(message);
  }
}

async function assertJsonlAuditPinnedOwnerMetadataUnlinked(
  ownerPath: string,
  pinnedOwner: JsonlAuditLockPinnedOwnerMetadata,
  message: string
): Promise<void> {
  await assertJsonlAuditPinnedOwnerFileUnlinked(
    ownerPath,
    pinnedOwner,
    message
  );
}

async function assertJsonlAuditPinnedOwnerFileUnlinked(
  ownerPath: string,
  pinnedOwner: JsonlAuditLockPinnedOwnerFile,
  message: string
): Promise<void> {
  if (!(await jsonlAuditPinnedOwnerFileUnlinked(ownerPath, pinnedOwner))) {
    throw new Error(message);
  }
}

async function jsonlAuditPinnedOwnerFileUnlinked(
  ownerPath: string,
  pinnedOwner: JsonlAuditLockPinnedOwnerFile
): Promise<boolean> {
  if (!(await jsonlAuditPathIsMissing(ownerPath))) {
    return false;
  }
  try {
    const status = await pinnedOwner.handle.stat({ bigint: true });
    if (
      !status.isFile()
      || status.nlink !== 0n
      || !jsonlAuditLockOwnerFileObjectIdentityMatches(
        pinnedOwner.identity,
        {
          device: status.dev,
          inode: status.ino,
          ctimeNs: status.ctimeNs,
          birthtimeNs: status.birthtimeNs,
          mtimeNs: status.mtimeNs,
          size: status.size
        }
      )
    ) {
      return false;
    }
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      return false;
    }
    throw error;
  }
  return jsonlAuditPathIsMissing(ownerPath);
}

async function readJsonlAuditPinnedOwnerMetadataSnapshot(
  ownerPath: string,
  handle: FileHandle,
  expectedIdentity: JsonlAuditLockOwnerFileIdentity
): Promise<{
  identity: JsonlAuditLockOwnerFileIdentity;
  metadata: JsonlAuditLockOwnerMetadata;
} | undefined> {
  try {
    const initialDescriptorIdentity =
      await readJsonlAuditLockOwnerFileHandleIdentity(handle);
    const initialPathIdentity = await readJsonlAuditLockOwnerFilePathIdentity(
      ownerPath
    );
    if (
      initialDescriptorIdentity === undefined
      || initialPathIdentity === undefined
      || !jsonlAuditLockOwnerFileObjectIdentityMatches(
        expectedIdentity,
        initialDescriptorIdentity
      )
      || !jsonlAuditLockOwnerFileObjectIdentityMatches(
        expectedIdentity,
        initialPathIdentity
      )
      || !jsonlAuditLockOwnerFileIdentityMatches(
        initialDescriptorIdentity,
        initialPathIdentity
      )
    ) {
      return undefined;
    }
    const buffer = Buffer.alloc(MAX_JSONL_AUDIT_LOCK_OWNER_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const finalDescriptorIdentity =
      await readJsonlAuditLockOwnerFileHandleIdentity(handle);
    const finalPathIdentity = await readJsonlAuditLockOwnerFilePathIdentity(
      ownerPath
    );
    if (
      bytesRead === 0
      || bytesRead > MAX_JSONL_AUDIT_LOCK_OWNER_BYTES
      || finalDescriptorIdentity === undefined
      || finalPathIdentity === undefined
      || BigInt(bytesRead) !== finalDescriptorIdentity.size
      || !jsonlAuditLockOwnerFileIdentityMatches(
        initialDescriptorIdentity,
        finalDescriptorIdentity
      )
      || !jsonlAuditLockOwnerFileIdentityMatches(
        initialDescriptorIdentity,
        finalPathIdentity
      )
    ) {
      return undefined;
    }
    const metadata = parseJsonlAuditLockOwnerMetadata(
      buffer.subarray(0, bytesRead).toString("utf8")
    );
    return metadata === undefined
      ? undefined
      : { identity: finalDescriptorIdentity, metadata };
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      return undefined;
    }
    throw error;
  }
}

async function readJsonlAuditLockOwnerFileHandleIdentity(
  handle: FileHandle
): Promise<JsonlAuditLockOwnerFileIdentity | undefined> {
  const status = await handle.stat({ bigint: true });
  if (
    !status.isFile()
    || status.nlink !== 1n
    || status.size > BigInt(MAX_JSONL_AUDIT_LOCK_OWNER_BYTES)
  ) {
    return undefined;
  }
  return {
    device: status.dev,
    inode: status.ino,
    ctimeNs: status.ctimeNs,
    birthtimeNs: status.birthtimeNs,
    mtimeNs: status.mtimeNs,
    size: status.size
  };
}

async function readJsonlAuditLockOwnerFilePathIdentity(
  ownerPath: string
): Promise<JsonlAuditLockOwnerFileIdentity | undefined> {
  const status = await fs.lstat(ownerPath, { bigint: true });
  if (
    !status.isFile()
    || status.nlink !== 1n
    || status.size > BigInt(MAX_JSONL_AUDIT_LOCK_OWNER_BYTES)
  ) {
    return undefined;
  }
  return {
    device: status.dev,
    inode: status.ino,
    ctimeNs: status.ctimeNs,
    birthtimeNs: status.birthtimeNs,
    mtimeNs: status.mtimeNs,
    size: status.size
  };
}

function jsonlAuditLockOwnerFileIdentityMatches(
  left: JsonlAuditLockOwnerFileIdentity,
  right: JsonlAuditLockOwnerFileIdentity
): boolean {
  return left.device === right.device
    && left.inode === right.inode
    && left.ctimeNs === right.ctimeNs
    && left.birthtimeNs === right.birthtimeNs
    && left.mtimeNs === right.mtimeNs
    && left.size === right.size;
}

function jsonlAuditLockOwnerFileObjectIdentityMatches(
  left: JsonlAuditLockOwnerFileIdentity,
  right: JsonlAuditLockOwnerFileIdentity
): boolean {
  return left.device === right.device && left.inode === right.inode;
}

function jsonlAuditPinnedOwnerFileHasMetadata(
  ownerFile: JsonlAuditLockPinnedOwnerFile
): ownerFile is JsonlAuditLockPinnedOwnerMetadata {
  return "metadata" in ownerFile;
}

function jsonlAuditLockOwnerMetadataMatches(
  left: JsonlAuditLockOwnerMetadata,
  right: JsonlAuditLockOwnerMetadata
): boolean {
  return left.version === right.version
    && left.ownerToken === right.ownerToken
    && left.pid === right.pid
    && left.acquiredAt === right.acquiredAt
    && left.acquiredAtMs === right.acquiredAtMs;
}

function parseJsonlAuditLockOwnerMetadata(
  content: string
): JsonlAuditLockOwnerMetadata | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  if (
    record.version !== JSONL_AUDIT_LOCK_OWNER_VERSION
    || typeof record.owner_token !== "string"
    || !JSONL_AUDIT_LOCK_OWNER_TOKEN_PATTERN.test(record.owner_token)
    || !Number.isSafeInteger(record.pid)
    || (record.pid as number) <= 0
    || typeof record.acquired_at !== "string"
    || !Number.isSafeInteger(record.acquired_at_ms)
    || (record.acquired_at_ms as number) < 0
  ) {
    return undefined;
  }
  let canonicalAcquiredAt: string;
  try {
    canonicalAcquiredAt = new Date(record.acquired_at_ms as number).toISOString();
  } catch {
    return undefined;
  }
  if (canonicalAcquiredAt !== record.acquired_at) {
    return undefined;
  }
  return {
    version: JSONL_AUDIT_LOCK_OWNER_VERSION,
    ownerToken: record.owner_token,
    pid: record.pid as number,
    acquiredAt: record.acquired_at,
    acquiredAtMs: record.acquired_at_ms as number
  };
}

async function cleanupFailedJsonlAuditLockAcquisition(
  lockPath: string,
  lockParentDirectory: JsonlAuditLockPinnedDirectory,
  lockDirectory: JsonlAuditLockPinnedDirectory,
  ownerToken: string | undefined,
  acquiredOwnerFile?: JsonlAuditLockPinnedOwnerFile
): Promise<void> {
  const lockAnchor = {
    directoryPath: lockPath,
    handle: lockDirectory.handle
  };
  const lockParentAnchor = {
    directoryPath: path.dirname(lockPath),
    handle: lockParentDirectory.handle
  };
  let ownerFile = acquiredOwnerFile;
  try {
    await assertJsonlAuditLockPinnedDirectoryPath(
      lockPath,
      lockDirectory.handle,
      lockDirectory.identity,
      "Audit file lock changed during acquisition cleanup."
    );
    if (ownerFile === undefined && ownerToken !== undefined) {
      const ownerInspection = await inspectJsonlAuditLockPinnedOwnerMetadata(
        lockPath,
        undefined,
        false,
        true
      );
      if (
        ownerInspection.status === "valid"
        && ownerInspection.metadata?.ownerToken === ownerToken
        && ownerInspection.pinnedOwner !== undefined
      ) {
        ownerFile = ownerInspection.pinnedOwner;
      } else if (ownerInspection.pinnedOwner !== undefined) {
        await closeJsonlAuditLockAcquisitionResources([
          ownerInspection.pinnedOwner.handle
        ]);
      }
    }
    if (
      ownerFile !== undefined
      && (
        ownerToken === undefined
        || !jsonlAuditPinnedOwnerFileHasMetadata(ownerFile)
        || ownerFile.metadata.ownerToken === ownerToken
      )
    ) {
      const ownerPath = getJsonlAuditLockOwnerPath(lockPath);
      if (jsonlAuditPinnedOwnerFileHasMetadata(ownerFile)) {
        await assertJsonlAuditPinnedOwnerMetadata(
          lockPath,
          ownerFile,
          "Audit file lock changed during acquisition cleanup."
        );
      } else {
        await assertJsonlAuditPinnedOwnerFilePath(
          ownerPath,
          ownerFile,
          "Audit file lock changed during acquisition cleanup."
        );
      }
      const scan = await scanJsonlAuditLockDirectoryEntries(
        lockPath,
        lockDirectory
      );
      if (
        !scan.scanTruncated
        && scan.entries.length === 1
        && scan.entries[0] === JSONL_AUDIT_LOCK_OWNER_FILE_NAME
      ) {
        await assertJsonlAuditLockPinnedDirectoryPath(
          lockPath,
          lockDirectory.handle,
          lockDirectory.identity,
          "Audit file lock changed during acquisition cleanup."
        );
        if (jsonlAuditPinnedOwnerFileHasMetadata(ownerFile)) {
          await assertJsonlAuditPinnedOwnerMetadata(
            lockPath,
            ownerFile,
            "Audit file lock changed during acquisition cleanup."
          );
        } else {
          await assertJsonlAuditPinnedOwnerFilePath(
            ownerPath,
            ownerFile,
            "Audit file lock changed during acquisition cleanup."
          );
        }
        await unlinkJsonlAuditDirectoryEntry(
          lockAnchor,
          JSONL_AUDIT_LOCK_OWNER_FILE_NAME
        );
        await assertJsonlAuditPinnedOwnerFileUnlinked(
          ownerPath,
          ownerFile,
          "Audit file lock changed during acquisition cleanup."
        );
      }
    }
    await assertJsonlAuditLockPinnedDirectoryPath(
      lockPath,
      lockDirectory.handle,
      lockDirectory.identity,
      "Audit file lock changed during acquisition cleanup."
    );
    const finalScan = await scanJsonlAuditLockDirectoryEntries(
      lockPath,
      lockDirectory
    );
    if (finalScan.scanTruncated || finalScan.entries.length !== 0) {
      return;
    }
    await assertJsonlAuditLockPinnedDirectoryPath(
      lockPath,
      lockDirectory.handle,
      lockDirectory.identity,
      "Audit file lock changed during acquisition cleanup."
    );
    await rmdirJsonlAuditDirectoryEntry(
      lockParentAnchor,
      path.basename(lockPath)
    );
    await assertJsonlAuditLockPinnedDirectoryUnlinked(
      lockPath,
      lockDirectory.handle,
      lockDirectory.identity,
      "Audit file lock changed during acquisition cleanup."
    );
  } catch {
    // Preserve the acquisition failure and leave uncertain state for diagnostics.
  } finally {
    const handles = [
      lockDirectory.handle,
      ...(ownerFile === undefined ? [] : [ownerFile.handle])
    ];
    try {
      await closeJsonlAuditLockAcquisitionResources(handles);
    } catch {
      // Preserve the acquisition failure.
    }
  }
}

function validateJsonlAuditLockClock(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid JSONL audit lock clock: expected a non-negative safe integer.");
  }
  return value;
}

function formatJsonlAuditLockTimestamp(value: number): string {
  try {
    return new Date(value).toISOString();
  } catch {
    throw new Error("Invalid JSONL audit lock clock: expected a valid epoch millisecond.");
  }
}

function validateJsonlAuditLockDuration(value: number, source: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${source}: expected a positive safe integer.`);
  }
  return value;
}

export function validateJsonlAuditDurability(value: string): JsonlAuditDurability {
  if (value !== "buffered" && value !== "data" && value !== "full") {
    throw new Error(
      "Invalid JSONL audit durability: expected buffered, data, or full."
    );
  }
  return value;
}

export function normalizeAdditionalAuditSensitiveKeySuffixes(
  values: readonly string[],
  source: string = "JSONL audit redaction keys"
): readonly string[] {
  if (!Array.isArray(values) || values.length > MAX_JSONL_AUDIT_REDACTION_KEYS) {
    throw new Error(
      `Invalid ${source}: expected at most ${MAX_JSONL_AUDIT_REDACTION_KEYS} key suffixes.`
    );
  }
  const normalized = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Invalid ${source}: key suffixes must be non-empty strings.`);
    }
    const suffix = normalizeAuditKey(value);
    if (suffix.length === 0 || suffix.length > MAX_JSONL_AUDIT_REDACTION_KEY_LENGTH) {
      throw new Error(
        `Invalid ${source}: normalized key suffixes must contain 1-${MAX_JSONL_AUDIT_REDACTION_KEY_LENGTH} letters or digits.`
      );
    }
    normalized.add(suffix);
  }
  return [...normalized];
}

interface PreparedAuditLine {
  line: string;
  lineBytes: number;
}

interface AuditSnapshotState {
  ancestors: Set<object>;
  nodes: number;
  maxBytes: number;
  sensitiveKeySuffixes: readonly string[];
}

function prepareAuditLine(
  event: AuditEvent,
  now: () => Date,
  maxBytes: number,
  sensitiveKeySuffixes: readonly string[]
): PreparedAuditLine {
  const eventSnapshot = snapshotRedactedAuditValue(event, {
    ancestors: new Set<object>(),
    nodes: 0,
    maxBytes,
    sensitiveKeySuffixes
  }, 0);
  if (eventSnapshot === OMIT_AUDIT_VALUE) {
    throw new TypeError("Audit event must be a JSON object.");
  }
  const line = `${JSON.stringify({
    recorded_at: now().toISOString(),
    event: eventSnapshot
  })}\n`;
  return {
    line,
    lineBytes: Buffer.byteLength(line, "utf8")
  };
}

function snapshotRedactedAuditValue(
  value: unknown,
  state: AuditSnapshotState,
  depth: number
): unknown | typeof OMIT_AUDIT_VALUE {
  if (depth > MAX_JSONL_AUDIT_SNAPSHOT_DEPTH) {
    throw new Error(
      `Audit event exceeds maximum snapshot depth of ${MAX_JSONL_AUDIT_SNAPSHOT_DEPTH}.`
    );
  }
  consumeAuditSnapshotNode(state);
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string") {
      assertAuditStringFits(value, state.maxBytes);
    }
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    return OMIT_AUDIT_VALUE;
  }
  if (typeof value === "bigint") {
    throw new TypeError("Do not know how to serialize a BigInt audit value.");
  }
  if (!Array.isArray(value) && !isPlainAuditObject(value)) {
    throw new TypeError("Audit event must contain only plain JSON objects and arrays.");
  }
  if (state.ancestors.has(value)) {
    throw new TypeError("Converting circular structure to JSON audit event.");
  }

  state.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined) {
          consumeAuditSnapshotNode(state);
          result.push(null);
          continue;
        }
        if (!("value" in descriptor)) {
          throw new TypeError("Audit event must not contain accessor properties.");
        }
        const entry = snapshotRedactedAuditValue(descriptor.value, state, depth + 1);
        result.push(entry === OMIT_AUDIT_VALUE ? null : entry);
      }
      return result;
    }

    const result: Record<string, unknown> = {};
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(value)) {
      assertAuditStringFits(key, state.maxBytes);
      const descriptor = descriptors[key]!;
      if (isSensitiveAuditKey(key, state.sensitiveKeySuffixes)) {
        consumeAuditSnapshotNode(state);
        defineAuditSnapshotProperty(result, key, REDACTED_AUDIT_VALUE);
        continue;
      }
      if (!("value" in descriptor)) {
        throw new TypeError("Audit event must not contain accessor properties.");
      }
      const entry = snapshotRedactedAuditValue(descriptor.value, state, depth + 1);
      if (entry !== OMIT_AUDIT_VALUE) {
        defineAuditSnapshotProperty(result, key, entry);
      }
    }
    return result;
  } finally {
    state.ancestors.delete(value);
  }
}

function consumeAuditSnapshotNode(state: AuditSnapshotState): void {
  state.nodes += 1;
  if (state.nodes > MAX_JSONL_AUDIT_SNAPSHOT_NODES) {
    throw new Error(
      `Audit event exceeds maximum snapshot nodes of ${MAX_JSONL_AUDIT_SNAPSHOT_NODES}.`
    );
  }
}

function assertAuditStringFits(value: string, maxBytes: number): void {
  if (Buffer.byteLength(value, "utf8") > maxBytes) {
    throw new Error("Audit record exceeds GOD_CODE_AUDIT_MAX_BYTES.");
  }
}

function isSensitiveAuditKey(key: string, suffixes: readonly string[]): boolean {
  const normalizedKey = normalizeAuditKey(key);
  return suffixes.some((suffix) => normalizedKey.endsWith(suffix));
}

function normalizeAuditKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isPlainAuditObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function defineAuditSnapshotProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
}

export async function inspectJsonlAuditPath(
  filePath: string
): Promise<JsonlAuditPathInspection> {
  const resolved = path.resolve(filePath);
  const parsed = path.parse(resolved);
  const components = resolved
    .slice(parsed.root.length)
    .split(path.sep)
    .filter((component) => component.length > 0);
  if (components.length === 0) {
    throw new Error("Audit file must be a regular non-linked file.");
  }
  let current = parsed.root;
  let nearestExistingDirectory = parsed.root;
  const rootStatus = await fs.lstat(parsed.root);
  if (!rootStatus.isDirectory()) {
    throw new Error(`Audit parent path must be a directory: ${parsed.root}`);
  }
  let nearestExistingDirectoryIdentity: JsonlAuditFileIdentity = {
    device: rootStatus.dev,
    inode: rootStatus.ino
  };
  let missing = false;
  const missingComponents: string[] = [];
  let targetSizeBytes: number | undefined;
  let targetIdentity: JsonlAuditFileIdentity | undefined;
  let targetMode: number | undefined;
  let targetPrivateMode: boolean | undefined;
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]!);
    if (missing) {
      missingComponents.push(current);
      continue;
    }
    let status;
    try {
      status = await fs.lstat(current);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        missing = true;
        missingComponents.push(current);
        continue;
      }
      throw error;
    }
    if (status.isSymbolicLink()) {
      throw new Error(`Audit path must not contain symbolic links: ${current}`);
    }
    const isTarget = index === components.length - 1;
    if (isTarget) {
      if (!status.isFile() || status.nlink !== 1) {
        throw new Error("Audit file must be a regular non-linked file.");
      }
      targetSizeBytes = status.size;
      targetIdentity = { device: status.dev, inode: status.ino };
      targetMode = status.mode & 0o777;
      if (process.platform !== "win32") {
        targetPrivateMode = (targetMode & 0o077) === 0;
      }
    } else if (!status.isDirectory()) {
      throw new Error(`Audit parent path must be a directory: ${current}`);
    } else {
      nearestExistingDirectory = current;
      nearestExistingDirectoryIdentity = {
        device: status.dev,
        inode: status.ino
      };
    }
  }
  return {
    filePath: resolved,
    targetExists: missingComponents.length === 0,
    nearestExistingDirectory,
    nearestExistingDirectoryIdentity,
    missingComponents,
    targetSizeBytes,
    targetIdentity,
    targetMode,
    targetPrivateMode
  };
}

async function ensureAuditParentDirectory(
  filePath: string,
  inspection: JsonlAuditPathInspection
): Promise<void> {
  const resolvedFilePath = path.resolve(filePath);
  if (inspection.filePath !== resolvedFilePath) {
    throw new Error("Audit parent directory changed during bootstrap.");
  }
  const targetParentPath = path.dirname(resolvedFilePath);
  const components = getAuditParentBootstrapComponents(
    inspection.nearestExistingDirectory,
    targetParentPath
  );
  if (components.length === 0) {
    return;
  }

  let currentDirectory = await openAuditPinnedMutationDirectory(
    inspection.nearestExistingDirectory,
    inspection.nearestExistingDirectory,
    inspection.nearestExistingDirectoryIdentity,
    "Audit parent directory changed during bootstrap.",
    undefined,
    true
  );
  let bootstrapFailure: { reason: unknown } | undefined;
  try {
    for (const component of components) {
      const childPath = path.join(currentDirectory.directoryPath, component);
      let childOpenPath: string;
      try {
        const created = await createJsonlAuditDirectoryEntry(
          {
            directoryPath: currentDirectory.directoryPath,
            handle: currentDirectory.handle
          },
          component,
          0o700
        );
        childOpenPath = created.mutationPath;
      } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
          throw error;
        }
        const existing = await resolveJsonlAuditDirectoryMutationPath(
          {
            directoryPath: currentDirectory.directoryPath,
            handle: currentDirectory.handle
          },
          component
        );
        childOpenPath = existing.path;
      }

      const childDirectory = await openAuditPinnedMutationDirectory(
        childPath,
        childOpenPath,
        undefined,
        "Audit parent directory changed during bootstrap.",
        undefined,
        true
      );
      const previousDirectory = currentDirectory;
      currentDirectory = childDirectory;
      await closeJsonlAuditWriterResources([previousDirectory.handle]);
    }
  } catch (error) {
    bootstrapFailure = { reason: error };
  }
  await closeJsonlAuditWriterResourcesPreservingPrimary(
    [currentDirectory.handle],
    bootstrapFailure
  );
}

function getAuditParentBootstrapComponents(
  nearestExistingDirectory: string,
  targetParentPath: string
): string[] {
  const relativePath = path.relative(
    nearestExistingDirectory,
    targetParentPath
  );
  if (relativePath.length === 0) {
    return [];
  }
  const components = relativePath.split(path.sep);
  if (
    path.isAbsolute(relativePath)
    || components.some((component) => (
      component.length === 0
      || component === "."
      || component === ".."
      || component.includes("\0")
      || path.posix.basename(component) !== component
      || path.win32.basename(component) !== component
    ))
  ) {
    throw new Error("Audit parent directory changed during bootstrap.");
  }
  return components;
}

export async function inspectJsonlAuditRotationPath(
  filePath: string
): Promise<JsonlAuditRotationInspection> {
  const rotatedPath = `${path.resolve(filePath)}.1`;
  try {
    const status = await fs.lstat(rotatedPath);
    const entryType: JsonlAuditRotationEntryType = status.isSymbolicLink()
      ? "symbolic_link"
      : status.isFile()
        ? "regular_file"
        : status.isDirectory()
          ? "directory"
          : "other";
    return {
      rotatedPath,
      exists: true,
      entryType,
      replaceable: entryType !== "directory"
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        rotatedPath,
        exists: false,
        replaceable: true
      };
    }
    throw error;
  }
}

async function readJsonlAuditRotationEntrySnapshot(
  entryPath: string
): Promise<JsonlAuditRotationEntrySnapshot | undefined> {
  let status;
  try {
    status = await fs.lstat(entryPath, { bigint: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  const entryType: JsonlAuditRotationEntryType = status.isSymbolicLink()
    ? "symbolic_link"
    : status.isFile()
      ? "regular_file"
      : status.isDirectory()
        ? "directory"
        : "other";
  return {
    entryType,
    device: status.dev,
    inode: status.ino,
    mode: status.mode,
    nlink: status.nlink,
    size: status.size,
    mtimeNs: status.mtimeNs,
    birthtimeNs: status.birthtimeNs
  };
}

function jsonlAuditRotationEntrySnapshotsMatch(
  left: JsonlAuditRotationEntrySnapshot,
  right: JsonlAuditRotationEntrySnapshot
): boolean {
  return left.entryType === right.entryType
    && left.device === right.device
    && left.inode === right.inode
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.birthtimeNs === right.birthtimeNs;
}

async function jsonlAuditRotationEntrySnapshotMatches(
  entryPath: string,
  expected: JsonlAuditRotationEntrySnapshot
): Promise<boolean> {
  const current = await readJsonlAuditRotationEntrySnapshot(entryPath);
  return current !== undefined
    && jsonlAuditRotationEntrySnapshotsMatch(expected, current);
}

async function assertJsonlAuditRotationEntrySnapshot(
  entryPath: string,
  expected: JsonlAuditRotationEntrySnapshot,
  errorMessage: string
): Promise<void> {
  if (!(await jsonlAuditRotationEntrySnapshotMatches(entryPath, expected))) {
    throw new Error(errorMessage);
  }
}

async function createJsonlAuditRotationBackupDirectory(
  filePath: string,
  parentDirectory: JsonlAuditPinnedMutationDirectory
): Promise<JsonlAuditPinnedTemporaryMutationDirectory> {
  const errorMessage = "Audit rotation staging directory changed during initialization.";
  const stagingPrefix = getJsonlAuditRotationStagingPrefix(filePath);
  if (path.dirname(stagingPrefix) !== parentDirectory.directoryPath) {
    throw new Error("Audit rotation staging prefix escaped its parent directory.");
  }
  const created = await createJsonlAuditTemporaryDirectoryEntry(
    {
      directoryPath: parentDirectory.directoryPath,
      handle: parentDirectory.handle
    },
    path.basename(stagingPrefix)
  );
  let directory: JsonlAuditPinnedMutationDirectory | undefined;
  try {
    directory = await openAuditPinnedMutationDirectory(
      created.path,
      created.mutationPath,
      undefined,
      errorMessage,
      undefined,
      true
    );
    const temporaryDirectory: JsonlAuditPinnedTemporaryMutationDirectory = {
      ...directory,
      name: created.name
    };
    await directory.handle.chmod(PRIVATE_AUDIT_DIRECTORY_MODE);
    await assertPinnedAuditTemporaryDirectoryEntries(
      temporaryDirectory,
      [],
      errorMessage
    );
    return temporaryDirectory;
  } catch (error) {
    if (directory !== undefined) {
      const temporaryDirectory: JsonlAuditPinnedTemporaryMutationDirectory = {
        ...directory,
        name: created.name
      };
      try {
        await removeJsonlAuditRotationBackupDirectory(
          temporaryDirectory,
          parentDirectory,
          errorMessage
        );
      } catch {
        // Preserve initialization failure and retain uncertain staging state.
      }
      await closeJsonlAuditWriterResourcesPreservingPrimary(
        [directory.handle],
        { reason: error }
      );
    }
    throw error;
  }
}

async function assertPinnedAuditTemporaryDirectoryEntries(
  directory: JsonlAuditPinnedTemporaryMutationDirectory,
  expectedEntries: readonly string[],
  errorMessage: string
): Promise<void> {
  if (
    expectedEntries.length
    > MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES
  ) {
    throw new Error(errorMessage);
  }
  await assertPinnedAuditMutationDirectory(
    directory,
    directory.identity,
    errorMessage
  );
  let scan: JsonlAuditRotationStagingDirectoryScan;
  try {
    scan = await scanJsonlAuditRotationStagingDirectoryEntries(directory);
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      throw new Error(errorMessage);
    }
    throw error;
  }
  const expected = [...expectedEntries].sort();
  if (
    scan.scanTruncated
    || scan.entries.length !== expected.length
    || scan.entries.some((entry, index) => entry !== expected[index])
  ) {
    throw new Error(errorMessage);
  }
  await assertPinnedAuditMutationDirectory(
    directory,
    directory.identity,
    errorMessage
  );
}

async function stagePreviousJsonlAuditRotationEntry(
  transaction: JsonlAuditRotationTransaction,
  parentDirectory: JsonlAuditPinnedMutationDirectory
): Promise<void> {
  const previous = transaction.previousRotated;
  const backupDirectory = transaction.backupDirectory;
  if (previous === undefined || backupDirectory === undefined) {
    throw new Error("Audit rotation staging state is incomplete.");
  }
  const errorMessage = "Rotated audit path changed during rotation staging.";
  const backupEntryPath = path.join(
    backupDirectory.directoryPath,
    JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME
  );
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    parentDirectory.identity,
    errorMessage
  );
  await assertJsonlAuditRotationEntrySnapshot(
    transaction.rotatedPath,
    previous,
    errorMessage
  );
  await assertPinnedAuditTemporaryDirectoryEntries(
    backupDirectory,
    [],
    errorMessage
  );
  await renameJsonlAuditDirectoryEntry(
    {
      directoryPath: parentDirectory.directoryPath,
      handle: parentDirectory.handle
    },
    path.basename(transaction.rotatedPath),
    {
      directoryPath: backupDirectory.directoryPath,
      handle: backupDirectory.handle
    },
    JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME
  );
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    parentDirectory.identity,
    errorMessage
  );
  await assertAuditPathMissing(transaction.rotatedPath, errorMessage);
  await assertPinnedAuditTemporaryDirectoryEntries(
    backupDirectory,
    [JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME],
    errorMessage
  );
  await assertJsonlAuditRotationEntrySnapshot(
    backupEntryPath,
    previous,
    errorMessage
  );
}

async function commitJsonlAuditRotationTransaction(
  transaction: JsonlAuditRotationTransaction,
  parentDirectory: JsonlAuditPinnedMutationDirectory,
  appendedCurrentIdentity: JsonlAuditFileIdentity,
  durability: JsonlAuditDurability
): Promise<void> {
  if (transaction.finalized) {
    return;
  }
  const errorMessage = "Audit rotation transaction changed during commit.";
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    parentDirectory.identity,
    errorMessage
  );
  await assertAuditFilePathIdentity(
    transaction.filePath,
    appendedCurrentIdentity,
    errorMessage
  );
  await assertAuditFileHandlePathIdentity(
    transaction.rotatedPath,
    transaction.currentHandle,
    transaction.currentIdentity,
    errorMessage
  );
  if (transaction.previousRotated !== undefined) {
    const backupDirectory = transaction.backupDirectory;
    if (backupDirectory === undefined) {
      throw new Error(errorMessage);
    }
    const backupEntryPath = path.join(
      backupDirectory.directoryPath,
      JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME
    );
    await assertPinnedAuditTemporaryDirectoryEntries(
      backupDirectory,
      [JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME],
      errorMessage
    );
    await assertJsonlAuditRotationEntrySnapshot(
      backupEntryPath,
      transaction.previousRotated,
      errorMessage
    );
    await assertPinnedAuditMutationDirectory(
      parentDirectory,
      parentDirectory.identity,
      errorMessage
    );
    await assertAuditFileHandlePathIdentity(
      transaction.rotatedPath,
      transaction.currentHandle,
      transaction.currentIdentity,
      errorMessage
    );
    await assertAuditFilePathIdentity(
      transaction.filePath,
      appendedCurrentIdentity,
      errorMessage
    );
    await assertPinnedAuditTemporaryDirectoryEntries(
      backupDirectory,
      [JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME],
      errorMessage
    );
    await assertJsonlAuditRotationEntrySnapshot(
      backupEntryPath,
      transaction.previousRotated,
      errorMessage
    );
    await unlinkJsonlAuditDirectoryEntry(
      {
        directoryPath: backupDirectory.directoryPath,
        handle: backupDirectory.handle
      },
      JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME
    );
    await assertAuditPathMissing(backupEntryPath, errorMessage);
    await assertPinnedAuditTemporaryDirectoryEntries(
      backupDirectory,
      [],
      errorMessage
    );
    if (durability === "full" && process.platform !== "win32") {
      await backupDirectory.handle.sync();
    }
    await removeJsonlAuditRotationBackupDirectory(
      backupDirectory,
      parentDirectory,
      errorMessage
    );
  } else if (transaction.backupDirectory !== undefined) {
    throw new Error(errorMessage);
  }
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    parentDirectory.identity,
    errorMessage
  );
  transaction.finalized = true;
}

async function rollbackJsonlAuditRotationTransaction(
  transaction: JsonlAuditRotationTransaction,
  parentDirectory: JsonlAuditPinnedMutationDirectory,
  durability: JsonlAuditDurability
): Promise<void> {
  if (transaction.finalized) {
    return;
  }
  const errorMessage = "Audit rotation transaction changed during rollback.";
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    parentDirectory.identity,
    errorMessage
  );
  if (await jsonlAuditFilePathIdentityMatches(
    transaction.filePath,
    transaction.currentIdentity
  )) {
    await assertAuditFileHandlePathIdentity(
      transaction.filePath,
      transaction.currentHandle,
      transaction.currentIdentity,
      errorMessage
    );
  } else {
    await assertAuditPathMissing(transaction.filePath, errorMessage);
    await assertAuditFileHandlePathIdentity(
      transaction.rotatedPath,
      transaction.currentHandle,
      transaction.currentIdentity,
      errorMessage
    );
    await assertPinnedAuditMutationDirectory(
      parentDirectory,
      parentDirectory.identity,
      errorMessage
    );
    await assertAuditPathMissing(transaction.filePath, errorMessage);
    await renameJsonlAuditDirectoryEntry(
      {
        directoryPath: parentDirectory.directoryPath,
        handle: parentDirectory.handle
      },
      path.basename(transaction.rotatedPath),
      {
        directoryPath: parentDirectory.directoryPath,
        handle: parentDirectory.handle
      },
      path.basename(transaction.filePath)
    );
    await assertPinnedAuditMutationDirectory(
      parentDirectory,
      parentDirectory.identity,
      errorMessage
    );
    await assertAuditPathMissing(transaction.rotatedPath, errorMessage);
    await assertAuditFileHandlePathIdentity(
      transaction.filePath,
      transaction.currentHandle,
      transaction.currentIdentity,
      errorMessage
    );
  }
  if (transaction.previousRotated !== undefined) {
    const backupDirectory = transaction.backupDirectory;
    if (backupDirectory === undefined) {
      throw new Error(errorMessage);
    }
    const backupEntryPath = path.join(
      backupDirectory.directoryPath,
      JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME
    );
    if (await jsonlAuditRotationEntrySnapshotMatches(
      transaction.rotatedPath,
      transaction.previousRotated
    )) {
      await assertPinnedAuditTemporaryDirectoryEntries(
        backupDirectory,
        [],
        errorMessage
      );
    } else {
      await assertAuditPathMissing(transaction.rotatedPath, errorMessage);
      await assertPinnedAuditTemporaryDirectoryEntries(
        backupDirectory,
        [JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME],
        errorMessage
      );
      await assertJsonlAuditRotationEntrySnapshot(
        backupEntryPath,
        transaction.previousRotated,
        errorMessage
      );
      await assertPinnedAuditMutationDirectory(
        parentDirectory,
        parentDirectory.identity,
        errorMessage
      );
      await assertAuditFileHandlePathIdentity(
        transaction.filePath,
        transaction.currentHandle,
        transaction.currentIdentity,
        errorMessage
      );
      await assertAuditPathMissing(transaction.rotatedPath, errorMessage);
      await renameJsonlAuditDirectoryEntry(
        {
          directoryPath: backupDirectory.directoryPath,
          handle: backupDirectory.handle
        },
        JSONL_AUDIT_ROTATION_BACKUP_ENTRY_NAME,
        {
          directoryPath: parentDirectory.directoryPath,
          handle: parentDirectory.handle
        },
        path.basename(transaction.rotatedPath)
      );
      await assertJsonlAuditRotationEntrySnapshot(
        transaction.rotatedPath,
        transaction.previousRotated,
        errorMessage
      );
      await assertPinnedAuditTemporaryDirectoryEntries(
        backupDirectory,
        [],
        errorMessage
      );
    }
    if (durability === "full" && process.platform !== "win32") {
      await backupDirectory.handle.sync();
    }
    await removeJsonlAuditRotationBackupDirectory(
      backupDirectory,
      parentDirectory,
      errorMessage
    );
  } else {
    if (transaction.backupDirectory !== undefined) {
      throw new Error(errorMessage);
    }
    await assertAuditPathMissing(transaction.rotatedPath, errorMessage);
  }
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    parentDirectory.identity,
    errorMessage
  );
  if (durability === "full" && process.platform !== "win32") {
    await syncAuditParentDirectory(parentDirectory, parentDirectory.identity);
  }
  transaction.finalized = true;
}

async function removeJsonlAuditRotationBackupDirectory(
  directory: JsonlAuditPinnedTemporaryMutationDirectory,
  parentDirectory: JsonlAuditPinnedMutationDirectory,
  errorMessage: string
): Promise<void> {
  await assertPinnedAuditTemporaryDirectoryEntries(
    directory,
    [],
    errorMessage
  );
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    parentDirectory.identity,
    errorMessage
  );
  await rmdirJsonlAuditDirectoryEntry(
    {
      directoryPath: parentDirectory.directoryPath,
      handle: parentDirectory.handle
    },
    directory.name
  );
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    parentDirectory.identity,
    errorMessage
  );
  await assertAuditPathMissing(directory.directoryPath, errorMessage);
  const status = await directory.handle.stat();
  if (
    !status.isDirectory()
    || status.nlink !== 0
    || !jsonlAuditFileIdentityMatches(directory.identity, {
      device: status.dev,
      inode: status.ino
    })
  ) {
    throw new Error(errorMessage);
  }
}

async function closeJsonlAuditRotationTransaction(
  transaction: JsonlAuditRotationTransaction
): Promise<void> {
  await closeJsonlAuditWriterResources([
    transaction.currentHandle,
    ...(transaction.backupDirectory === undefined
      ? []
      : [transaction.backupDirectory.handle])
  ]);
}

async function assertAuditFileHandlePathIdentity(
  filePath: string,
  handle: FileHandle,
  expectedIdentity: JsonlAuditFileIdentity,
  errorMessage: string
): Promise<void> {
  let initialDescriptorStatus;
  let pathStatus;
  let finalDescriptorStatus;
  try {
    initialDescriptorStatus = await handle.stat();
    pathStatus = await fs.lstat(filePath);
    finalDescriptorStatus = await handle.stat();
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      throw new Error(errorMessage);
    }
    throw error;
  }
  const initialIdentity = {
    device: initialDescriptorStatus.dev,
    inode: initialDescriptorStatus.ino
  };
  if (
    !initialDescriptorStatus.isFile()
    || initialDescriptorStatus.nlink !== 1
    || !pathStatus.isFile()
    || pathStatus.nlink !== 1
    || !finalDescriptorStatus.isFile()
    || finalDescriptorStatus.nlink !== 1
    || !jsonlAuditFileIdentityMatches(expectedIdentity, initialIdentity)
    || !jsonlAuditFileIdentityMatches(initialIdentity, {
      device: pathStatus.dev,
      inode: pathStatus.ino
    })
    || !jsonlAuditFileIdentityMatches(initialIdentity, {
      device: finalDescriptorStatus.dev,
      inode: finalDescriptorStatus.ino
    })
  ) {
    throw new Error(errorMessage);
  }
}

async function jsonlAuditFilePathIdentityMatches(
  filePath: string,
  expectedIdentity: JsonlAuditFileIdentity
): Promise<boolean> {
  try {
    const status = await fs.lstat(filePath);
    return status.isFile()
      && status.nlink === 1
      && jsonlAuditFileIdentityMatches(expectedIdentity, {
        device: status.dev,
        inode: status.ino
      });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function appendAuditLine(
  filePath: string,
  line: string,
  lineBytes: number,
  maxBytes: number,
  durability: JsonlAuditDurability,
  transaction: JsonlAuditAppendTransaction,
  parentDirectory: JsonlAuditPinnedMutationDirectory
): Promise<void> {
  const { expectation } = transaction;
  const expectedParentIdentity = expectation.kind === "missing"
    ? expectation.parentIdentity
    : parentDirectory.identity;
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    expectedParentIdentity,
    "Audit parent directory changed before append."
  );
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const flags = constants.O_APPEND
    | constants.O_WRONLY
    | noFollow
    | (expectation.kind === "missing" ? constants.O_CREAT | constants.O_EXCL : 0);
  const currentMutationPath = await resolveJsonlAuditDirectoryMutationPath(
    {
      directoryPath: parentDirectory.directoryPath,
      handle: parentDirectory.handle
    },
    path.basename(filePath)
  );
  let handle: FileHandle;
  try {
    handle = await fs.open(
      currentMutationPath.path,
      flags,
      PRIVATE_AUDIT_FILE_MODE
    );
  } catch (error) {
    if (isNodeError(error)) {
      if (expectation.kind === "missing" && error.code === "EEXIST") {
        throw new Error("Audit file appeared before append.");
      }
      if (expectation.kind === "existing" && error.code === "ENOENT") {
        throw new Error("Audit file disappeared before append.");
      }
    }
    throw error;
  }
  let descriptorIdentity: JsonlAuditFileIdentity | undefined;
  let exclusiveCreationBaselineEmpty = false;
  let recordWriteStarted = false;
  let recordWriteCompleted = false;
  let failedWriteRestored = false;
  let appendFailure: { reason: unknown } | undefined;
  try {
    const status = await validateAuditFileHandle(handle);
    descriptorIdentity = {
      device: status.dev,
      inode: status.ino
    };
    exclusiveCreationBaselineEmpty = expectation.kind === "missing"
      && status.size === 0;
    if (
      expectation.kind === "existing"
      && !jsonlAuditFileIdentityMatches(expectation.identity, descriptorIdentity)
    ) {
      throw new Error("Audit file changed before append.");
    }
    if (expectation.kind === "missing") {
      await assertPinnedAuditMutationDirectory(
        parentDirectory,
        expectation.parentIdentity,
        "Audit parent directory changed before record write."
      );
    }
    if (evaluateJsonlAuditCapacity(status.size, lineBytes, maxBytes).rotationRequired) {
      throw new Error("Audit file capacity changed before append.");
    }
    await enforcePrivateMode(handle);
    await assertAuditFilePathIdentity(
      filePath,
      descriptorIdentity,
      "Audit file changed before record write."
    );
    try {
      recordWriteStarted = true;
      await handle.writeFile(line, { encoding: "utf8" });
      recordWriteCompleted = true;
      transaction.recordWriteCompleted = true;
    } catch (error) {
      try {
        failedWriteRestored = await rollbackFailedAuditLineWrite(
          filePath,
          handle,
          descriptorIdentity,
          status.size,
          lineBytes,
          durability
        );
      } catch {
        // Preserve the original append failure even when rollback is uncertain.
      }
      throw error;
    }
    if (durability === "data") {
      await handle.datasync();
    } else if (durability === "full") {
      await handle.sync();
    }
    if (transaction.rotation !== undefined) {
      await commitJsonlAuditRotationTransaction(
        transaction.rotation,
        parentDirectory,
        descriptorIdentity,
        durability
      );
    }
    if (
      durability === "full"
      && expectation.kind === "missing"
      && process.platform !== "win32"
    ) {
      await syncAuditParentDirectory(
        parentDirectory,
        expectation.parentIdentity
      );
    }
    await assertAuditFilePathIdentity(
      filePath,
      descriptorIdentity,
      "Audit file changed after record write."
    );
  } catch (error) {
    appendFailure = { reason: error };
    if (
      expectation.kind === "missing"
      && descriptorIdentity !== undefined
      && exclusiveCreationBaselineEmpty
      && !recordWriteCompleted
      && (!recordWriteStarted || failedWriteRestored)
    ) {
      try {
        await cleanupFailedExclusiveAuditGeneration(
          filePath,
          handle,
          descriptorIdentity,
          parentDirectory,
          expectation.parentIdentity,
          durability
        );
      } catch {
        // Preserve the original pre-commit failure when cleanup is uncertain.
      }
    }
  }
  await closeJsonlAuditWriterResourcesPreservingPrimary(
    [handle],
    appendFailure
  );
}

async function rollbackFailedAuditLineWrite(
  filePath: string,
  handle: FileHandle,
  expectedIdentity: JsonlAuditFileIdentity,
  preWriteBytes: number,
  lineBytes: number,
  durability: JsonlAuditDurability
): Promise<boolean> {
  if (
    !Number.isSafeInteger(preWriteBytes)
    || preWriteBytes < 0
    || !Number.isSafeInteger(lineBytes)
    || lineBytes <= 0
    || preWriteBytes > Number.MAX_SAFE_INTEGER - lineBytes
  ) {
    return false;
  }
  const maximumTransactionBytes = preWriteBytes + lineBytes;
  const status = await validateAuditFileHandle(handle);
  const currentIdentity = {
    device: status.dev,
    inode: status.ino
  };
  if (
    !Number.isSafeInteger(status.size)
    || !jsonlAuditFileIdentityMatches(expectedIdentity, currentIdentity)
    || status.size < preWriteBytes
    || status.size > maximumTransactionBytes
  ) {
    return false;
  }
  await assertAuditFilePathIdentity(
    filePath,
    expectedIdentity,
    "Audit file changed during failed record rollback."
  );
  if (status.size === preWriteBytes) {
    return true;
  }
  await handle.truncate(preWriteBytes);
  if (durability === "data") {
    await handle.datasync();
  } else if (durability === "full") {
    await handle.sync();
  }
  const rolledBackStatus = await validateAuditFileHandle(handle);
  if (
    rolledBackStatus.size !== preWriteBytes
    || !jsonlAuditFileIdentityMatches(expectedIdentity, {
      device: rolledBackStatus.dev,
      inode: rolledBackStatus.ino
    })
  ) {
    throw new Error("Audit file changed during failed record rollback.");
  }
  await assertAuditFilePathIdentity(
    filePath,
    expectedIdentity,
    "Audit file changed during failed record rollback."
  );
  return true;
}

async function cleanupFailedExclusiveAuditGeneration(
  filePath: string,
  handle: FileHandle,
  expectedIdentity: JsonlAuditFileIdentity,
  parentDirectory: JsonlAuditPinnedMutationDirectory,
  expectedParentIdentity: JsonlAuditFileIdentity,
  durability: JsonlAuditDurability
): Promise<void> {
  const errorMessage = "Audit file changed during failed exclusive creation cleanup.";
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    expectedParentIdentity,
    errorMessage
  );
  await assertEmptyAuditFilePathIdentity(
    filePath,
    handle,
    expectedIdentity,
    errorMessage
  );
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    expectedParentIdentity,
    errorMessage
  );
  await assertEmptyAuditFilePathIdentity(
    filePath,
    handle,
    expectedIdentity,
    errorMessage
  );
  await unlinkJsonlAuditDirectoryEntry(
    {
      directoryPath: parentDirectory.directoryPath,
      handle: parentDirectory.handle
    },
    path.basename(filePath)
  );
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    expectedParentIdentity,
    errorMessage
  );
  await assertAuditPathMissing(filePath, errorMessage);
  const detachedStatus = await handle.stat();
  if (
    !detachedStatus.isFile()
    || detachedStatus.nlink !== 0
    || detachedStatus.size !== 0
    || !jsonlAuditFileIdentityMatches(expectedIdentity, {
      device: detachedStatus.dev,
      inode: detachedStatus.ino
    })
  ) {
    throw new Error(errorMessage);
  }
  if (durability === "full" && process.platform !== "win32") {
    await syncAuditParentDirectory(parentDirectory, expectedParentIdentity);
  }
}

async function assertEmptyAuditFilePathIdentity(
  filePath: string,
  handle: FileHandle,
  expectedIdentity: JsonlAuditFileIdentity,
  errorMessage: string
): Promise<void> {
  let initialDescriptorStatus;
  let pathStatus;
  let finalDescriptorStatus;
  try {
    initialDescriptorStatus = await handle.stat();
    pathStatus = await fs.lstat(filePath);
    finalDescriptorStatus = await handle.stat();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(errorMessage);
    }
    throw error;
  }
  const initialIdentity = {
    device: initialDescriptorStatus.dev,
    inode: initialDescriptorStatus.ino
  };
  if (
    !initialDescriptorStatus.isFile()
    || initialDescriptorStatus.nlink !== 1
    || initialDescriptorStatus.size !== 0
    || !pathStatus.isFile()
    || pathStatus.nlink !== 1
    || pathStatus.size !== 0
    || !finalDescriptorStatus.isFile()
    || finalDescriptorStatus.nlink !== 1
    || finalDescriptorStatus.size !== 0
    || !jsonlAuditFileIdentityMatches(expectedIdentity, initialIdentity)
    || !jsonlAuditFileIdentityMatches(initialIdentity, {
      device: pathStatus.dev,
      inode: pathStatus.ino
    })
    || !jsonlAuditFileIdentityMatches(initialIdentity, {
      device: finalDescriptorStatus.dev,
      inode: finalDescriptorStatus.ino
    })
  ) {
    throw new Error(errorMessage);
  }
}

async function assertAuditFilePathIdentity(
  filePath: string,
  expectedIdentity: JsonlAuditFileIdentity,
  errorMessage: string
): Promise<void> {
  let status;
  try {
    status = await fs.lstat(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(errorMessage);
    }
    throw error;
  }
  if (
    !status.isFile()
    || status.nlink !== 1
    || !jsonlAuditFileIdentityMatches(expectedIdentity, {
      device: status.dev,
      inode: status.ino
    })
  ) {
    throw new Error(errorMessage);
  }
}

async function openAuditGenerationParentDirectory(
  filePath: string,
  expectedIdentity: JsonlAuditFileIdentity
): Promise<JsonlAuditPinnedMutationDirectory> {
  const directoryPath = path.dirname(filePath);
  return openAuditPinnedMutationDirectory(
    directoryPath,
    directoryPath,
    expectedIdentity,
    "Audit parent directory changed before generation mutation.",
    undefined,
    true
  );
}

async function openAuditPinnedMutationDirectory(
  directoryPath: string,
  openPath: string,
  expectedIdentity: JsonlAuditFileIdentity | undefined,
  errorMessage: string,
  failureHandleHandoff?: FileHandle[],
  writerCloseSettlementBounded = false,
  recoveryCloseSettlementBounded = false
): Promise<JsonlAuditPinnedMutationDirectory> {
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const directoryOnly = "O_DIRECTORY" in constants ? constants.O_DIRECTORY : 0;
  let handle: FileHandle;
  try {
    handle = await fs.open(
      openPath,
      constants.O_RDONLY | noFollow | directoryOnly
    );
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      throw new Error(errorMessage);
    }
    throw error;
  }
  try {
    const status = await handle.stat();
    if (!status.isDirectory()) {
      throw new Error(errorMessage);
    }
    const identity = {
      device: status.dev,
      inode: status.ino
    };
    if (
      expectedIdentity !== undefined
      && !jsonlAuditFileIdentityMatches(expectedIdentity, identity)
    ) {
      throw new Error(errorMessage);
    }
    const parentDirectory: JsonlAuditPinnedMutationDirectory = {
      directoryPath,
      handle,
      identity,
      ...(writerCloseSettlementBounded
        ? { writerCloseSettlementBounded: true as const }
        : {})
    };
    await assertPinnedAuditMutationDirectory(
      parentDirectory,
      expectedIdentity ?? identity,
      errorMessage
    );
    if (recoveryCloseSettlementBounded) {
      parentDirectory.recoveryCloseSettlementBounded = true;
    }
    return parentDirectory;
  } catch (error) {
    if (failureHandleHandoff !== undefined) {
      failureHandleHandoff.push(handle);
    } else if (writerCloseSettlementBounded) {
      await closeJsonlAuditWriterResourcesPreservingPrimary(
        [handle],
        { reason: error }
      );
    } else if (recoveryCloseSettlementBounded) {
      await closeJsonlAuditRotationRecoveryResourcesPreservingPrimary(
        [handle],
        { reason: error }
      );
    } else {
      try {
        await handle.close();
      } catch {}
    }
    throw error;
  }
}

async function assertPinnedAuditMutationDirectory(
  parentDirectory: JsonlAuditPinnedMutationDirectory,
  expectedIdentity: JsonlAuditFileIdentity,
  errorMessage: string
): Promise<void> {
  let initialDescriptorStatus;
  let pathStatus;
  let finalDescriptorStatus;
  try {
    initialDescriptorStatus = await parentDirectory.handle.stat();
    pathStatus = await fs.lstat(parentDirectory.directoryPath);
    finalDescriptorStatus = await parentDirectory.handle.stat();
  } catch (error) {
    if (isJsonlAuditLockChangedError(error)) {
      throw new Error(errorMessage);
    }
    throw error;
  }
  const initialDescriptorIdentity = {
    device: initialDescriptorStatus.dev,
    inode: initialDescriptorStatus.ino
  };
  const pathIdentity = {
    device: pathStatus.dev,
    inode: pathStatus.ino
  };
  const finalDescriptorIdentity = {
    device: finalDescriptorStatus.dev,
    inode: finalDescriptorStatus.ino
  };
  if (
    !initialDescriptorStatus.isDirectory()
    || !pathStatus.isDirectory()
    || !finalDescriptorStatus.isDirectory()
    || !jsonlAuditFileIdentityMatches(
      parentDirectory.identity,
      initialDescriptorIdentity
    )
    || !jsonlAuditFileIdentityMatches(expectedIdentity, initialDescriptorIdentity)
    || !jsonlAuditFileIdentityMatches(initialDescriptorIdentity, pathIdentity)
    || !jsonlAuditFileIdentityMatches(
      initialDescriptorIdentity,
      finalDescriptorIdentity
    )
  ) {
    throw new Error(errorMessage);
  }
}

async function assertAuditPathMissing(
  targetPath: string,
  errorMessage: string
): Promise<void> {
  try {
    await fs.lstat(targetPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error(errorMessage);
}

async function syncAuditParentDirectory(
  parentDirectory: JsonlAuditPinnedMutationDirectory,
  expectedIdentity: JsonlAuditFileIdentity
): Promise<void> {
  await assertPinnedAuditMutationDirectory(
    parentDirectory,
    expectedIdentity,
    "Audit parent directory changed before metadata sync."
  );
  await parentDirectory.handle.sync();
}

async function validateAuditFileHandle(handle: FileHandle) {
  const status = await handle.stat();
  if (!status.isFile() || status.nlink !== 1) {
    throw new Error("Audit file must be a regular non-linked file.");
  }
  return status;
}

async function enforcePrivateMode(handle: FileHandle): Promise<void> {
  if (process.platform !== "win32") {
    await handle.chmod(PRIVATE_AUDIT_FILE_MODE);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
