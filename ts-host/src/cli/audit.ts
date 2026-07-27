import { constants, promises as fs } from "node:fs";
import path from "node:path";
import {
  parseAuditDurability,
  parseAuditMaxBytes,
  parseAuditRedactKeys
} from "../audit/config.js";
import {
  DEFAULT_JSONL_AUDIT_LOCK_RETRY_MS,
  DEFAULT_JSONL_AUDIT_LOCK_TIMEOUT_MS,
  DEFAULT_JSONL_AUDIT_MAX_BYTES,
  MAX_JSONL_AUDIT_LOCK_DISPOSAL_RESULTS,
  MAX_JSONL_AUDIT_LOCK_DISPOSAL_SCAN_ENTRIES,
  MAX_JSONL_AUDIT_LOCK_QUARANTINE_RESULTS,
  MAX_JSONL_AUDIT_LOCK_QUARANTINE_SCAN_ENTRIES,
  MAX_JSONL_AUDIT_ROTATION_STAGING_RESULTS,
  MAX_JSONL_AUDIT_ROTATION_STAGING_SCAN_ENTRIES,
  JsonlAuditLockMaintenanceError,
  JsonlAuditRotationStagingRecoveryError,
  cleanupJsonlAuditEmptyLockDisposal,
  cleanupJsonlAuditEmptyLockQuarantine,
  cleanupJsonlAuditFileLock,
  cleanupJsonlAuditLockDisposal,
  cleanupJsonlAuditLockQuarantine,
  type JsonlAuditDurability,
  evaluateJsonlAuditCapacity,
  getJsonlAuditLockPath,
  inspectJsonlAuditFileLock,
  inspectJsonlAuditLockDisposal,
  inspectJsonlAuditLockDisposals,
  inspectJsonlAuditLockQuarantine,
  inspectJsonlAuditLockQuarantines,
  inspectJsonlAuditPath,
  inspectJsonlAuditRotationRecovery,
  inspectJsonlAuditRotationStaging,
  inspectJsonlAuditRotationStagings,
  inspectJsonlAuditRotationPath,
  recoverJsonlAuditLockQuarantine,
  recoverJsonlAuditRotationStaging,
  type JsonlAuditLockDisposalEntryInspection,
  type JsonlAuditLockDisposalLayout,
  type JsonlAuditLockEntryType,
  type JsonlAuditLockMaintenanceOperation,
  type JsonlAuditLockOwnerMetadataStatus,
  type JsonlAuditLockQuarantineEntryInspection,
  type JsonlAuditLockQuarantineLayout,
  type JsonlAuditLockQuarantineOwnerLocation,
  type JsonlAuditRotationEntryType,
  type JsonlAuditRotationRecoveryAction,
  type JsonlAuditRotationRecoveryAssessment,
  type JsonlAuditRotationRecoveryGenerationInspection,
  type JsonlAuditRotationStagingRecoveryFailureObservation,
  type JsonlAuditRotationStagingRecoveryFailureStage,
  type JsonlAuditRotationStagingRecoveryMutationState,
  type JsonlAuditRotationStagingEntryInspection,
  type JsonlAuditRotationStagingLayout
} from "../audit/jsonlAuditSink.js";

export type AuditDiagnosticStatus = "ok" | "warn" | "error";

export interface AuditConfigDetails {
  enabled: boolean;
  file_path?: string;
  max_bytes?: number;
  rotation_generations: 1;
  coordination_scope: "process_and_filesystem";
  coordination_lock_path?: string;
  coordination_lock_timeout_ms: number;
  coordination_lock_retry_ms: number;
  durability?: JsonlAuditDurability;
  default_redaction_enabled: true;
  custom_redaction_keys: readonly string[];
}

export interface AuditConfigCheck {
  name: "audit_config";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditConfigDetails;
}

export interface AuditConfigReport {
  ok: boolean;
  checks: AuditConfigCheck[];
}

export interface AuditPathDetails {
  enabled: boolean;
  file_path?: string;
  target_exists?: boolean;
  nearest_existing_directory?: string;
  missing_components?: readonly string[];
  directory_writable?: boolean;
  target_writable?: boolean;
  max_bytes?: number;
  current_generation_bytes?: number;
  remaining_capacity_bytes?: number;
  rotation_expected_on_next_record?: boolean;
  current_generation_over_capacity?: boolean;
  target_mode?: string;
  target_private_mode?: boolean;
  rotation_path?: string;
  rotation_entry_exists?: boolean;
  rotation_entry_type?: JsonlAuditRotationEntryType;
  rotation_entry_replaceable?: boolean;
  coordination_lock_path?: string;
  coordination_lock_exists?: boolean;
  coordination_lock_entry_type?: JsonlAuditLockEntryType;
  coordination_lock_acquirable?: boolean;
  coordination_lock_age_ms?: number;
  coordination_lock_entry_count?: number;
  coordination_lock_entry_scan_count?: number;
  coordination_lock_entry_scan_limit?: number;
  coordination_lock_entry_scan_truncated?: boolean;
  coordination_lock_owner_entry_exclusive?: boolean;
  coordination_lock_owner_metadata_status?: JsonlAuditLockOwnerMetadataStatus;
  coordination_lock_owner_pid?: number;
  coordination_lock_acquired_at?: string;
  coordination_lock_state_changed?: boolean;
  coordination_lock_inspection_error_code?: string;
}

export type AuditAccessCheck = (target: string, mode: number) => Promise<void>;

export interface AuditPathCheck {
  name: "audit_path";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditPathDetails;
}

export interface AuditPathReport {
  ok: boolean;
  checks: AuditPathCheck[];
}

export interface AuditRotationStagingEntryDetails {
  staging_id: string;
  staging_path: string;
  exists: boolean;
  entry_type?: JsonlAuditLockEntryType;
  age_ms?: number;
  layout?: JsonlAuditRotationStagingLayout;
  entry_count?: number;
  entry_scan_count?: number;
  entry_scan_limit?: number;
  entry_scan_truncated?: boolean;
  previous_entry_type?: JsonlAuditLockEntryType;
  previous_size_bytes?: number;
  state_changed?: boolean;
  inspection_error_code?: string;
}

export interface AuditRotationStagingDetails {
  enabled: boolean;
  file_path?: string;
  staging_prefix?: string;
  scanned_entry_count: number;
  scan_limit: number;
  scan_truncated: boolean;
  matched_entry_count: number;
  result_limit: number;
  result_truncated: boolean;
  legacy_unscoped_entry_count: number;
  stagings: AuditRotationStagingEntryDetails[];
}

export interface AuditRotationStagingCheck {
  name: "audit_rotation_stagings";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditRotationStagingDetails;
}

export interface AuditRotationStagingReport {
  ok: boolean;
  checks: AuditRotationStagingCheck[];
}

export interface AuditTargetedRotationStagingDetails {
  enabled: boolean;
  file_path?: string;
  staging_id: string;
  staging?: AuditRotationStagingEntryDetails;
}

export interface AuditTargetedRotationStagingCheck {
  name: "audit_rotation_staging";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditTargetedRotationStagingDetails;
}

export interface AuditTargetedRotationStagingReport {
  ok: boolean;
  checks: AuditTargetedRotationStagingCheck[];
}

export interface AuditRotationRecoveryGenerationDetails {
  entry_path: string;
  exists: boolean;
  entry_type?: JsonlAuditLockEntryType;
  size_bytes?: number;
  mode?: string;
  private_mode?: boolean;
  link_count?: number;
  state_changed?: boolean;
}

export interface AuditRotationRecoveryDetails {
  enabled: boolean;
  file_path?: string;
  rotation_path?: string;
  staging_id: string;
  staging_path?: string;
  coordination_lock_path?: string;
  coordination_lock_exists?: boolean;
  coordination_lock_entry_type?: JsonlAuditLockEntryType;
  coordination_lock_acquirable?: boolean;
  coordination_lock_entry_count?: number;
  coordination_lock_entry_scan_count?: number;
  coordination_lock_entry_scan_limit?: number;
  coordination_lock_entry_scan_truncated?: boolean;
  coordination_lock_owner_entry_exclusive?: boolean;
  coordination_lock_state_changed?: boolean;
  coordination_lock_inspection_error_code?: string;
  current_generation?: AuditRotationRecoveryGenerationDetails;
  rotated_generation?: AuditRotationRecoveryGenerationDetails;
  staging?: AuditRotationStagingEntryDetails;
  assessment?: JsonlAuditRotationRecoveryAssessment;
  eligible: boolean;
  recommended_action?: JsonlAuditRotationRecoveryAction;
  recovery_fingerprint?: string;
  confirmation_required: true;
  mutation_performed: false;
}

export interface AuditRotationRecoveryCheck {
  name: "audit_rotation_recovery";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditRotationRecoveryDetails;
}

export interface AuditRotationRecoveryReport {
  ok: boolean;
  checks: AuditRotationRecoveryCheck[];
}

export interface AuditRotationStagingRecoveryFailureObservationDetails {
  observed_while_coordination_lock_held: true;
  assessment: JsonlAuditRotationRecoveryAssessment;
  eligible: boolean;
  recommended_action?: JsonlAuditRotationRecoveryAction;
  recovery_fingerprint?: string;
  current_generation: AuditRotationRecoveryGenerationDetails;
  rotated_generation: AuditRotationRecoveryGenerationDetails;
  staging: AuditRotationStagingEntryDetails;
}

export interface AuditRotationStagingRecoveryDetails {
  enabled: boolean;
  file_path?: string;
  rotation_path?: string;
  staging_id: string;
  staging_path?: string;
  coordination_lock_path?: string;
  coordination_lock_exists?: boolean;
  coordination_lock_entry_type?: JsonlAuditLockEntryType;
  coordination_lock_acquirable?: boolean;
  current_generation?: AuditRotationRecoveryGenerationDetails;
  rotated_generation?: AuditRotationRecoveryGenerationDetails;
  staging?: AuditRotationStagingEntryDetails;
  assessment?: JsonlAuditRotationRecoveryAssessment;
  eligible?: boolean;
  recommended_action?: JsonlAuditRotationRecoveryAction;
  recovery_fingerprint?: string;
  dry_run: boolean;
  expected_action?: JsonlAuditRotationRecoveryAction;
  performed_action?: JsonlAuditRotationRecoveryAction;
  expected_recovery_fingerprint?: string;
  action_matches?: boolean;
  recovery_fingerprint_matches?: boolean;
  confirmation_required: boolean;
  failure_stage?: JsonlAuditRotationStagingRecoveryFailureStage;
  mutation_state?: JsonlAuditRotationStagingRecoveryMutationState;
  mutation_attempted?: boolean;
  mutation_performed: boolean;
  rollback_attempted?: boolean;
  rollback_completed?: boolean;
  recovered: boolean;
  staging_removed: boolean;
  durability?: JsonlAuditDurability;
  durability_completed?: boolean;
  residual_staging_path?: string;
  recovery_warning?: string;
  recovery_handles_closed?: boolean;
  recovery_handle_warning?: string;
  coordination_lock_acquired?: boolean;
  coordination_lock_released?: boolean;
  residual_coordination_lock_path?: string;
  coordination_lock_warning?: string;
  post_failure_observation_completed?: boolean;
  post_failure_observation?:
    AuditRotationStagingRecoveryFailureObservationDetails;
  post_failure_observation_warning?: string;
}

export interface AuditRotationStagingRecoveryCheck {
  name: "audit_rotation_staging_recovery";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditRotationStagingRecoveryDetails;
}

export interface AuditRotationStagingRecoveryReport {
  ok: boolean;
  checks: AuditRotationStagingRecoveryCheck[];
}

export interface AuditRotationStagingRecoveryOptions {
  dryRun?: boolean;
  expectedAction?: JsonlAuditRotationRecoveryAction;
  expectedRecoveryFingerprint?: string;
}

export interface AuditLockCleanupDetails {
  enabled: boolean;
  file_path?: string;
  coordination_lock_path?: string;
  coordination_lock_exists?: boolean;
  coordination_lock_entry_type?: JsonlAuditLockEntryType;
  coordination_lock_entry_count?: number;
  coordination_lock_entry_scan_count?: number;
  coordination_lock_entry_scan_limit?: number;
  coordination_lock_entry_scan_truncated?: boolean;
  coordination_lock_owner_entry_exclusive?: boolean;
  coordination_lock_owner_metadata_status?: JsonlAuditLockOwnerMetadataStatus;
  coordination_lock_owner_pid?: number;
  coordination_lock_acquired_at?: string;
  coordination_lock_state_changed?: boolean;
  coordination_lock_inspection_error_code?: string;
  coordination_lock_owner_fingerprint?: string;
  owner_fingerprint_matches?: boolean;
  dry_run: boolean;
  confirmation_required: boolean;
  liveness_verified: false;
  removed: boolean;
  residual_quarantine_path?: string;
  cleanup_handles_closed?: boolean;
  cleanup_handle_warning?: string;
}

export interface AuditLockCleanupCheck {
  name: "audit_lock_cleanup";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditLockCleanupDetails;
}

export interface AuditLockCleanupReport {
  ok: boolean;
  checks: AuditLockCleanupCheck[];
}

export interface AuditLockCleanupOptions {
  dryRun?: boolean;
  expectedOwnerFingerprint?: string;
}

export interface AuditLockQuarantineEntryDetails {
  quarantine_id: string;
  quarantine_path: string;
  exists: boolean;
  entry_type?: JsonlAuditLockEntryType;
  age_ms?: number;
  layout?: JsonlAuditLockQuarantineLayout;
  root_entry_count?: number;
  root_entry_scan_count?: number;
  root_entry_scan_limit?: number;
  root_entry_scan_truncated?: boolean;
  lock_entry_type?: JsonlAuditLockEntryType;
  lock_entry_count?: number;
  lock_entry_scan_count?: number;
  lock_entry_scan_limit?: number;
  lock_entry_scan_truncated?: boolean;
  root_owner_metadata_status?: JsonlAuditLockOwnerMetadataStatus;
  lock_owner_metadata_status?: JsonlAuditLockOwnerMetadataStatus;
  owner_location?: JsonlAuditLockQuarantineOwnerLocation;
  owner_metadata_status?: JsonlAuditLockOwnerMetadataStatus;
  owner_pid?: number;
  owner_acquired_at?: string;
  owner_fingerprint?: string;
  empty_directory_fingerprint?: string;
  state_changed?: boolean;
  inspection_error_code?: string;
}

export interface AuditLockQuarantineDetails {
  enabled: boolean;
  file_path?: string;
  coordination_lock_path?: string;
  quarantine_prefix?: string;
  scanned_entry_count: number;
  scan_limit: number;
  scan_truncated: boolean;
  matched_entry_count: number;
  result_limit: number;
  result_truncated: boolean;
  quarantines: AuditLockQuarantineEntryDetails[];
}

export interface AuditLockQuarantineCheck {
  name: "audit_lock_quarantines";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditLockQuarantineDetails;
}

export interface AuditLockQuarantineReport {
  ok: boolean;
  checks: AuditLockQuarantineCheck[];
}

export interface AuditTargetedLockQuarantineDetails {
  enabled: boolean;
  file_path?: string;
  coordination_lock_path?: string;
  quarantine_id: string;
  quarantine?: AuditLockQuarantineEntryDetails;
}

export interface AuditTargetedLockQuarantineCheck {
  name: "audit_lock_quarantine";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditTargetedLockQuarantineDetails;
}

export interface AuditTargetedLockQuarantineReport {
  ok: boolean;
  checks: AuditTargetedLockQuarantineCheck[];
}

export interface AuditLockDisposalEntryDetails {
  quarantine_id: string;
  quarantine_path: string;
  source_quarantine_exists: boolean;
  source_quarantine_entry_type?: JsonlAuditLockEntryType;
  source_quarantine_layout?: JsonlAuditLockQuarantineLayout;
  source_quarantine_state_changed?: boolean;
  source_quarantine_inspection_error_code?: string;
  disposal_id: string;
  disposal_path: string;
  exists: boolean;
  entry_type?: JsonlAuditLockEntryType;
  age_ms?: number;
  layout?: JsonlAuditLockDisposalLayout;
  root_entry_count?: number;
  root_entry_scan_count?: number;
  root_entry_scan_limit?: number;
  root_entry_scan_truncated?: boolean;
  owner_metadata_status?: JsonlAuditLockOwnerMetadataStatus;
  owner_pid?: number;
  owner_acquired_at?: string;
  owner_fingerprint?: string;
  empty_directory_fingerprint?: string;
  state_changed?: boolean;
  inspection_error_code?: string;
}

export interface AuditLockDisposalDetails {
  enabled: boolean;
  file_path?: string;
  coordination_lock_path?: string;
  disposal_namespace_prefix?: string;
  scanned_entry_count: number;
  scan_limit: number;
  scan_truncated: boolean;
  matched_entry_count: number;
  result_limit: number;
  result_truncated: boolean;
  disposals: AuditLockDisposalEntryDetails[];
}

export interface AuditLockDisposalCheck {
  name: "audit_lock_disposals";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditLockDisposalDetails;
}

export interface AuditLockDisposalReport {
  ok: boolean;
  checks: AuditLockDisposalCheck[];
}

export interface AuditTargetedLockDisposalDetails {
  enabled: boolean;
  file_path?: string;
  coordination_lock_path?: string;
  quarantine_id: string;
  disposal_id: string;
  disposal?: AuditLockDisposalEntryDetails;
}

export interface AuditTargetedLockDisposalCheck {
  name: "audit_lock_disposal";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditTargetedLockDisposalDetails;
}

export interface AuditTargetedLockDisposalReport {
  ok: boolean;
  checks: AuditTargetedLockDisposalCheck[];
}

export interface AuditLockDisposalCleanupDetails {
  enabled: boolean;
  file_path?: string;
  coordination_lock_path?: string;
  quarantine_id: string;
  quarantine_path?: string;
  source_quarantine_exists?: boolean;
  source_quarantine_entry_type?: JsonlAuditLockEntryType;
  source_quarantine_layout?: JsonlAuditLockQuarantineLayout;
  source_quarantine_state_changed?: boolean;
  source_quarantine_inspection_error_code?: string;
  disposal_id: string;
  disposal_path?: string;
  disposal_exists?: boolean;
  disposal_entry_type?: JsonlAuditLockEntryType;
  disposal_layout?: JsonlAuditLockDisposalLayout;
  owner_metadata_status?: JsonlAuditLockOwnerMetadataStatus;
  owner_pid?: number;
  owner_acquired_at?: string;
  owner_fingerprint?: string;
  owner_fingerprint_matches?: boolean;
  state_changed?: boolean;
  inspection_error_code?: string;
  dry_run: boolean;
  confirmation_required: boolean;
  liveness_verified: false;
  removed: boolean;
  residual_disposal_path?: string;
  cleanup_handles_closed?: boolean;
  cleanup_handle_warning?: string;
}

export interface AuditLockDisposalCleanupCheck {
  name: "audit_lock_disposal_cleanup";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditLockDisposalCleanupDetails;
}

export interface AuditLockDisposalCleanupReport {
  ok: boolean;
  checks: AuditLockDisposalCleanupCheck[];
}

export interface AuditLockDisposalCleanupOptions {
  dryRun?: boolean;
  expectedOwnerFingerprint?: string;
}

export interface AuditEmptyLockDisposalCleanupDetails {
  enabled: boolean;
  file_path?: string;
  coordination_lock_path?: string;
  quarantine_id: string;
  quarantine_path?: string;
  source_quarantine_exists?: boolean;
  source_quarantine_entry_type?: JsonlAuditLockEntryType;
  source_quarantine_layout?: JsonlAuditLockQuarantineLayout;
  source_quarantine_state_changed?: boolean;
  source_quarantine_inspection_error_code?: string;
  disposal_id: string;
  disposal_path?: string;
  disposal_exists?: boolean;
  disposal_entry_type?: JsonlAuditLockEntryType;
  disposal_layout?: JsonlAuditLockDisposalLayout;
  empty_directory_fingerprint?: string;
  disposal_fingerprint_matches?: boolean;
  state_changed?: boolean;
  inspection_error_code?: string;
  dry_run: boolean;
  confirmation_required: boolean;
  liveness_verified: false;
  removed: boolean;
  cleanup_handles_closed?: boolean;
  cleanup_handle_warning?: string;
}

export interface AuditEmptyLockDisposalCleanupCheck {
  name: "audit_empty_lock_disposal_cleanup";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditEmptyLockDisposalCleanupDetails;
}

export interface AuditEmptyLockDisposalCleanupReport {
  ok: boolean;
  checks: AuditEmptyLockDisposalCleanupCheck[];
}

export interface AuditEmptyLockDisposalCleanupOptions {
  dryRun?: boolean;
  expectedDisposalFingerprint?: string;
}

export interface AuditEmptyLockQuarantineCleanupDetails {
  enabled: boolean;
  file_path?: string;
  coordination_lock_path?: string;
  quarantine_id: string;
  quarantine_path?: string;
  quarantine_exists?: boolean;
  quarantine_entry_type?: JsonlAuditLockEntryType;
  quarantine_layout?: JsonlAuditLockQuarantineLayout;
  empty_directory_fingerprint?: string;
  quarantine_fingerprint_matches?: boolean;
  state_changed?: boolean;
  inspection_error_code?: string;
  dry_run: boolean;
  confirmation_required: boolean;
  liveness_verified: false;
  removed: boolean;
  cleanup_handles_closed?: boolean;
  cleanup_handle_warning?: string;
}

export interface AuditEmptyLockQuarantineCleanupCheck {
  name: "audit_empty_lock_quarantine_cleanup";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditEmptyLockQuarantineCleanupDetails;
}

export interface AuditEmptyLockQuarantineCleanupReport {
  ok: boolean;
  checks: AuditEmptyLockQuarantineCleanupCheck[];
}

export interface AuditEmptyLockQuarantineCleanupOptions {
  dryRun?: boolean;
  expectedQuarantineFingerprint?: string;
}

export interface AuditLockQuarantineCleanupDetails {
  enabled: boolean;
  file_path?: string;
  coordination_lock_path?: string;
  quarantine_id: string;
  quarantine_path?: string;
  quarantine_exists?: boolean;
  quarantine_entry_type?: JsonlAuditLockEntryType;
  quarantine_layout?: JsonlAuditLockQuarantineLayout;
  owner_location?: JsonlAuditLockQuarantineOwnerLocation;
  owner_metadata_status?: JsonlAuditLockOwnerMetadataStatus;
  owner_pid?: number;
  owner_acquired_at?: string;
  owner_fingerprint?: string;
  owner_fingerprint_matches?: boolean;
  state_changed?: boolean;
  inspection_error_code?: string;
  dry_run: boolean;
  confirmation_required: boolean;
  liveness_verified: false;
  removed: boolean;
  residual_disposal_path?: string;
  cleanup_handles_closed?: boolean;
  cleanup_handle_warning?: string;
}

export interface AuditLockQuarantineCleanupCheck {
  name: "audit_lock_quarantine_cleanup";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditLockQuarantineCleanupDetails;
}

export interface AuditLockQuarantineCleanupReport {
  ok: boolean;
  checks: AuditLockQuarantineCleanupCheck[];
}

export interface AuditLockQuarantineCleanupOptions {
  dryRun?: boolean;
  expectedOwnerFingerprint?: string;
}

export interface AuditLockQuarantineRecoveryDetails {
  enabled: boolean;
  file_path?: string;
  coordination_lock_path?: string;
  coordination_lock_exists?: boolean;
  coordination_lock_entry_type?: JsonlAuditLockEntryType;
  coordination_lock_acquirable?: boolean;
  coordination_lock_entry_count?: number;
  coordination_lock_entry_scan_count?: number;
  coordination_lock_entry_scan_limit?: number;
  coordination_lock_entry_scan_truncated?: boolean;
  coordination_lock_owner_entry_exclusive?: boolean;
  coordination_lock_owner_metadata_status?: JsonlAuditLockOwnerMetadataStatus;
  coordination_lock_owner_pid?: number;
  coordination_lock_acquired_at?: string;
  coordination_lock_state_changed?: boolean;
  coordination_lock_inspection_error_code?: string;
  quarantine_id: string;
  quarantine_path?: string;
  quarantine_exists?: boolean;
  quarantine_entry_type?: JsonlAuditLockEntryType;
  quarantine_layout?: JsonlAuditLockQuarantineLayout;
  owner_location?: JsonlAuditLockQuarantineOwnerLocation;
  owner_metadata_status?: JsonlAuditLockOwnerMetadataStatus;
  owner_pid?: number;
  owner_acquired_at?: string;
  owner_fingerprint?: string;
  owner_fingerprint_matches?: boolean;
  state_changed?: boolean;
  inspection_error_code?: string;
  dry_run: boolean;
  confirmation_required: boolean;
  liveness_verified: false;
  recovered: boolean;
  residual_quarantine_path?: string;
  residual_lock_path?: string;
  recovery_handles_closed?: boolean;
  recovery_handle_warning?: string;
}

export interface AuditLockQuarantineRecoveryCheck {
  name: "audit_lock_quarantine_recovery";
  status: AuditDiagnosticStatus;
  message: string;
  details: AuditLockQuarantineRecoveryDetails;
}

export interface AuditLockQuarantineRecoveryReport {
  ok: boolean;
  checks: AuditLockQuarantineRecoveryCheck[];
}

export interface AuditLockQuarantineRecoveryOptions {
  dryRun?: boolean;
  expectedOwnerFingerprint?: string;
}

export function inspectAuditConfig(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd()
): AuditConfigReport {
  const configuredPath = environ.GOD_CODE_AUDIT_FILE?.trim();
  if (!configuredPath) {
    const ignoredSettings = [
      environ.GOD_CODE_AUDIT_MAX_BYTES,
      environ.GOD_CODE_AUDIT_REDACT_KEYS,
      environ.GOD_CODE_AUDIT_DURABILITY
    ].some((value) => value !== undefined && value.trim().length > 0);
    return {
      ok: true,
      checks: [{
        name: "audit_config",
        status: ignoredSettings ? "warn" : "ok",
        message: ignoredSettings
          ? "disabled; audit settings are ignored until GOD_CODE_AUDIT_FILE is set"
          : "disabled",
        details: {
          enabled: false,
          max_bytes: DEFAULT_JSONL_AUDIT_MAX_BYTES,
          rotation_generations: 1,
          coordination_scope: "process_and_filesystem",
          coordination_lock_timeout_ms: DEFAULT_JSONL_AUDIT_LOCK_TIMEOUT_MS,
          coordination_lock_retry_ms: DEFAULT_JSONL_AUDIT_LOCK_RETRY_MS,
          durability: "buffered",
          default_redaction_enabled: true,
          custom_redaction_keys: []
        }
      }]
    };
  }

  const errors: string[] = [];
  let maxBytes: number | undefined;
  let durability: JsonlAuditDurability | undefined;
  let customRedactionKeys: readonly string[] = [];
  try {
    maxBytes = parseAuditMaxBytes(environ.GOD_CODE_AUDIT_MAX_BYTES);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  try {
    durability = parseAuditDurability(environ.GOD_CODE_AUDIT_DURABILITY);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  try {
    customRedactionKeys = parseAuditRedactKeys(environ.GOD_CODE_AUDIT_REDACT_KEYS);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const filePath = path.resolve(cwd, configuredPath);
  const details: AuditConfigDetails = {
    enabled: true,
    file_path: filePath,
    max_bytes: maxBytes,
    rotation_generations: 1,
    coordination_scope: "process_and_filesystem",
    coordination_lock_path: getJsonlAuditLockPath(filePath),
    coordination_lock_timeout_ms: DEFAULT_JSONL_AUDIT_LOCK_TIMEOUT_MS,
    coordination_lock_retry_ms: DEFAULT_JSONL_AUDIT_LOCK_RETRY_MS,
    durability,
    default_redaction_enabled: true,
    custom_redaction_keys: customRedactionKeys
  };
  if (errors.length > 0) {
    return {
      ok: false,
      checks: [{
        name: "audit_config",
        status: "error",
        message: errors.join("; "),
        details
      }]
    };
  }
  return {
    ok: true,
    checks: [{
      name: "audit_config",
      status: "ok",
      message: `enabled; file=${filePath}; max_bytes=${String(maxBytes)}; durability=${String(durability)}; custom_redaction_keys=${customRedactionKeys.length}`,
      details
    }]
  };
}

export function renderAuditConfigReport(report: AuditConfigReport): string {
  const lines = ["GOD-code audit config:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    lines.push(`  enabled: ${String(check.details.enabled)}`);
    if (check.details.file_path !== undefined) {
      lines.push(`  file_path: ${check.details.file_path}`);
    }
    if (check.details.max_bytes !== undefined) {
      lines.push(`  max_bytes: ${String(check.details.max_bytes)}`);
    }
    lines.push(`  rotation_generations: ${String(check.details.rotation_generations)}`);
    lines.push(`  coordination_scope: ${check.details.coordination_scope}`);
    if (check.details.coordination_lock_path !== undefined) {
      lines.push(`  coordination_lock_path: ${check.details.coordination_lock_path}`);
    }
    lines.push(
      `  coordination_lock_timeout_ms: ${String(check.details.coordination_lock_timeout_ms)}`
    );
    lines.push(
      `  coordination_lock_retry_ms: ${String(check.details.coordination_lock_retry_ms)}`
    );
    if (check.details.durability !== undefined) {
      lines.push(`  durability: ${check.details.durability}`);
    }
    lines.push(`  default_redaction_enabled: ${String(check.details.default_redaction_enabled)}`);
    lines.push(
      `  custom_redaction_keys: ${check.details.custom_redaction_keys.length === 0
        ? "(none)"
        : check.details.custom_redaction_keys.join(",")}`
    );
  }
  return lines.join("\n");
}

export function renderAuditConfigReportJson(report: AuditConfigReport): string {
  return JSON.stringify(report, null, 2);
}

export async function inspectAuditPath(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  accessCheck: AuditAccessCheck = async (target, mode) => fs.access(target, mode)
): Promise<AuditPathReport> {
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  if (!configCheck.details.enabled) {
    return {
      ok: true,
      checks: [{
        name: "audit_path",
        status: "warn",
        message: "skipped; persistence is disabled",
        details: { enabled: false }
      }]
    };
  }
  const filePath = configCheck.details.file_path!;
  if (!configReport.ok) {
    return {
      ok: false,
      checks: [{
        name: "audit_path",
        status: "error",
        message: `cannot inspect path: ${configCheck.message}`,
        details: { enabled: true, file_path: filePath }
      }]
    };
  }

  try {
    const inspection = await inspectJsonlAuditPath(filePath);
    const rotationInspection = await inspectJsonlAuditRotationPath(filePath);
    const lockInspection = await inspectJsonlAuditFileLock(filePath);
    const maxBytes = configCheck.details.max_bytes ?? DEFAULT_JSONL_AUDIT_MAX_BYTES;
    const currentGenerationBytes = inspection.targetSizeBytes ?? 0;
    const capacity = evaluateJsonlAuditCapacity(currentGenerationBytes, 1, maxBytes);
    let directoryWritable = true;
    try {
      await accessCheck(inspection.nearestExistingDirectory, constants.W_OK);
    } catch {
      directoryWritable = false;
    }
    let targetWritable: boolean | undefined;
    if (inspection.targetExists) {
      targetWritable = true;
      try {
        await accessCheck(inspection.filePath, constants.W_OK);
      } catch {
        targetWritable = false;
      }
    }
    const details: AuditPathDetails = {
      enabled: true,
      file_path: inspection.filePath,
      target_exists: inspection.targetExists,
      nearest_existing_directory: inspection.nearestExistingDirectory,
      missing_components: inspection.missingComponents,
      directory_writable: directoryWritable,
      target_writable: targetWritable,
      max_bytes: maxBytes,
      current_generation_bytes: currentGenerationBytes,
      remaining_capacity_bytes: capacity.remainingBytes,
      rotation_expected_on_next_record: capacity.rotationRequired,
      current_generation_over_capacity: capacity.overCapacity,
      target_mode: inspection.targetMode === undefined
        ? undefined
        : `0${inspection.targetMode.toString(8).padStart(3, "0")}`,
      target_private_mode: inspection.targetPrivateMode,
      rotation_path: rotationInspection.rotatedPath,
      rotation_entry_exists: rotationInspection.exists,
      rotation_entry_type: rotationInspection.entryType,
      rotation_entry_replaceable: rotationInspection.replaceable,
      coordination_lock_path: lockInspection.lockPath,
      coordination_lock_exists: lockInspection.exists,
      coordination_lock_entry_type: lockInspection.entryType,
      coordination_lock_acquirable: lockInspection.acquirable,
      coordination_lock_age_ms: lockInspection.ageMs,
      coordination_lock_entry_count: lockInspection.entryCount,
      coordination_lock_entry_scan_count: lockInspection.entryScanCount,
      coordination_lock_entry_scan_limit: lockInspection.entryScanLimit,
      coordination_lock_entry_scan_truncated:
        lockInspection.entryScanTruncated,
      coordination_lock_owner_entry_exclusive:
        lockInspection.ownerEntryExclusive,
      coordination_lock_owner_metadata_status: lockInspection.ownerMetadataStatus,
      coordination_lock_owner_pid: lockInspection.ownerPid,
      coordination_lock_acquired_at: lockInspection.ownerAcquiredAt,
      coordination_lock_state_changed: lockInspection.stateChanged,
      coordination_lock_inspection_error_code:
        lockInspection.inspectionErrorCode
    };
    const accessErrors: string[] = [];
    if (!directoryWritable) {
      accessErrors.push(
        `nearest existing directory is not writable: ${inspection.nearestExistingDirectory}`
      );
    }
    if (targetWritable === false) {
      accessErrors.push(`existing audit target is not writable: ${inspection.filePath}`);
    }
    if (!rotationInspection.replaceable) {
      accessErrors.push(`rotated audit path must not be a directory: ${rotationInspection.rotatedPath}`);
    }
    if (lockInspection.exists && lockInspection.entryType !== "directory") {
      accessErrors.push(
        `audit coordination lock path must be a directory: ${lockInspection.lockPath}`
      );
    }
    if (accessErrors.length > 0) {
      return {
        ok: false,
        checks: [{
          name: "audit_path",
          status: "error",
          message: accessErrors.join("; "),
          details
        }]
      };
    }
    const warnings: string[] = [];
    if (inspection.targetPrivateMode === false) {
      warnings.push("existing target permissions will be normalized to owner-only on write");
    }
    if (capacity.overCapacity) {
      warnings.push(
        "current generation exceeds configured capacity and will rotate before the next record"
      );
    } else if (capacity.rotationRequired) {
      warnings.push("current generation is at capacity and will rotate before the next record");
    }
    if (rotationInspection.entryType === "symbolic_link") {
      warnings.push("rotated symbolic link entry will be replaced without following it");
    } else if (rotationInspection.entryType === "other") {
      warnings.push("rotated non-directory entry will be replaced on rotation");
    }
    if (lockInspection.entryType === "directory") {
      warnings.push("coordination lock is currently held; writers may wait or time out");
      if (lockInspection.stateChanged === true) {
        warnings.push("coordination lock state changed during inspection");
      }
      if (lockInspection.inspectionErrorCode !== undefined) {
        warnings.push(
          `coordination lock inspection failed: ${lockInspection.inspectionErrorCode}`
        );
      }
      if (lockInspection.entryScanTruncated === true) {
        warnings.push("coordination lock child scan was truncated");
      } else if (lockInspection.ownerEntryExclusive === false) {
        warnings.push(
          "coordination lock directory does not contain exactly one owner metadata entry"
        );
      }
      if (lockInspection.ownerMetadataStatus === "missing") {
        warnings.push("coordination lock owner metadata is missing");
      } else if (lockInspection.ownerMetadataStatus === "invalid") {
        warnings.push("coordination lock owner metadata is invalid");
      }
    }
    return {
      ok: true,
      checks: [{
        name: "audit_path",
        status: warnings.length > 0 ? "warn" : "ok",
        message: warnings.length > 0
          ? `ready; ${warnings.join("; ")}`
          : inspection.targetExists
            ? "ready; existing target passed safety checks"
            : `ready; target will be created under ${inspection.nearestExistingDirectory}`,
        details
      }]
    };
  } catch (error) {
    return {
      ok: false,
      checks: [{
        name: "audit_path",
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        details: { enabled: true, file_path: filePath }
      }]
    };
  }
}

export function renderAuditPathReport(report: AuditPathReport): string {
  const lines = ["GOD-code audit path:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    for (const [key, value] of Object.entries(check.details)) {
      if (value === undefined) {
        continue;
      }
      lines.push(`  ${key}: ${Array.isArray(value) ? value.join(",") || "(none)" : String(value)}`);
    }
  }
  return lines.join("\n");
}

export function renderAuditPathReportJson(report: AuditPathReport): string {
  return JSON.stringify(report, null, 2);
}

export async function inspectAuditRotationStagings(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd()
): Promise<AuditRotationStagingReport> {
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditRotationStagingDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    scanned_entry_count: 0,
    scan_limit: MAX_JSONL_AUDIT_ROTATION_STAGING_SCAN_ENTRIES,
    scan_truncated: false,
    matched_entry_count: 0,
    result_limit: MAX_JSONL_AUDIT_ROTATION_STAGING_RESULTS,
    result_truncated: false,
    legacy_unscoped_entry_count: 0,
    stagings: []
  };
  if (!configReport.ok) {
    return auditRotationStagingError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }
  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return {
      ok: true,
      checks: [{
        name: "audit_rotation_stagings",
        status: "warn",
        message: "skipped; persistence is disabled",
        details
      }]
    };
  }

  try {
    const inspection = await inspectJsonlAuditRotationStagings(
      configCheck.details.file_path
    );
    details.file_path = inspection.filePath;
    details.staging_prefix = inspection.stagingPrefix;
    details.scanned_entry_count = inspection.scannedEntryCount;
    details.scan_limit = inspection.scanLimit;
    details.scan_truncated = inspection.scanTruncated;
    details.matched_entry_count = inspection.matchedEntryCount;
    details.result_limit = inspection.resultLimit;
    details.result_truncated = inspection.resultTruncated;
    details.legacy_unscoped_entry_count = inspection.legacyUnscopedEntryCount;
    details.stagings = inspection.entries.map(
      toAuditRotationStagingEntryDetails
    );

    const warnings: string[] = [];
    if (inspection.scanTruncated) {
      warnings.push("audit parent scan reached its bounded entry limit");
    }
    if (inspection.resultTruncated) {
      warnings.push("rotation staging results reached their bounded output limit");
    }
    if (inspection.legacyUnscopedEntryCount > 0) {
      warnings.push("legacy unscoped rotation staging residue requires manual attribution");
    }
    if (inspection.entries.length > 0) {
      warnings.push("target-bound rotation staging residue requires manual review");
    }
    if (inspection.entries.some(isAuditRotationStagingEntryUncertain)) {
      warnings.push("one or more rotation staging entries have uncertain or invalid state");
    }
    return {
      ok: true,
      checks: [{
        name: "audit_rotation_stagings",
        status: warnings.length === 0 ? "ok" : "warn",
        message: warnings.length === 0
          ? "no target-bound or legacy rotation staging residue found"
          : warnings.join("; "),
        details
      }]
    };
  } catch (error) {
    return auditRotationStagingError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditRotationStagingReport(
  report: AuditRotationStagingReport
): string {
  const lines = ["GOD-code audit rotation stagings:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    const { stagings, ...summary } = check.details;
    for (const [key, value] of Object.entries(summary)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
    for (const [index, staging] of stagings.entries()) {
      lines.push(`  staging[${String(index)}]:`);
      for (const [key, value] of Object.entries(staging)) {
        if (value !== undefined) {
          lines.push(`    ${key}: ${String(value)}`);
        }
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditRotationStagingReportJson(
  report: AuditRotationStagingReport
): string {
  return JSON.stringify(report, null, 2);
}

export async function inspectAuditRotationStaging(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  stagingId: string
): Promise<AuditTargetedRotationStagingReport> {
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditTargetedRotationStagingDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    staging_id: stagingId
  };
  if (!/^[A-Za-z0-9]{6}$/u.test(stagingId)) {
    return auditTargetedRotationStagingError(
      "Invalid audit rotation staging id: expected six ASCII alphanumeric characters.",
      details
    );
  }
  if (!configReport.ok) {
    return auditTargetedRotationStagingError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }
  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return {
      ok: true,
      checks: [{
        name: "audit_rotation_staging",
        status: "warn",
        message: "skipped; persistence is disabled",
        details
      }]
    };
  }

  try {
    const inspection = await inspectJsonlAuditRotationStaging(
      configCheck.details.file_path,
      stagingId
    );
    details.staging = toAuditRotationStagingEntryDetails(inspection);
    if (!inspection.exists) {
      details.staging.state_changed = undefined;
      return {
        ok: true,
        checks: [{
          name: "audit_rotation_staging",
          status: "ok",
          message: "selected rotation staging residue does not exist",
          details
        }]
      };
    }

    const warnings = ["selected rotation staging residue requires manual review"];
    if (isAuditRotationStagingEntryUncertain(inspection)) {
      warnings.push("selected rotation staging has uncertain or invalid state");
    }
    return {
      ok: true,
      checks: [{
        name: "audit_rotation_staging",
        status: "warn",
        message: warnings.join("; "),
        details
      }]
    };
  } catch (error) {
    return auditTargetedRotationStagingError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditTargetedRotationStagingReport(
  report: AuditTargetedRotationStagingReport
): string {
  const lines = ["GOD-code audit targeted rotation staging:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    const { staging, ...summary } = check.details;
    for (const [key, value] of Object.entries(summary)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
    if (staging !== undefined) {
      lines.push("  staging:");
      for (const [key, value] of Object.entries(staging)) {
        if (value !== undefined) {
          lines.push(`    ${key}: ${String(value)}`);
        }
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditTargetedRotationStagingReportJson(
  report: AuditTargetedRotationStagingReport
): string {
  return JSON.stringify(report, null, 2);
}

export async function inspectAuditRotationRecovery(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  stagingId: string
): Promise<AuditRotationRecoveryReport> {
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditRotationRecoveryDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    coordination_lock_path: configCheck.details.coordination_lock_path,
    staging_id: stagingId,
    eligible: false,
    confirmation_required: true,
    mutation_performed: false
  };
  if (!/^[A-Za-z0-9]{6}$/u.test(stagingId)) {
    return auditRotationRecoveryError(
      "Invalid audit rotation staging id: expected six ASCII alphanumeric characters.",
      details
    );
  }
  if (!configReport.ok) {
    return auditRotationRecoveryError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }
  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return {
      ok: true,
      checks: [{
        name: "audit_rotation_recovery",
        status: "warn",
        message: "skipped; persistence is disabled",
        details
      }]
    };
  }

  try {
    const inspection = await inspectJsonlAuditRotationRecovery(
      configCheck.details.file_path,
      stagingId
    );
    details.file_path = inspection.filePath;
    details.rotation_path = inspection.rotatedPath;
    details.staging_path = inspection.stagingPath;
    details.coordination_lock_path = inspection.coordinationLockPath;
    details.coordination_lock_exists = inspection.coordinationLockExists;
    details.coordination_lock_entry_type = inspection.coordinationLockEntryType;
    details.coordination_lock_acquirable = inspection.coordinationLockAcquirable;
    details.coordination_lock_entry_count =
      inspection.coordinationLockEntryCount;
    details.coordination_lock_entry_scan_count =
      inspection.coordinationLockEntryScanCount;
    details.coordination_lock_entry_scan_limit =
      inspection.coordinationLockEntryScanLimit;
    details.coordination_lock_entry_scan_truncated =
      inspection.coordinationLockEntryScanTruncated;
    details.coordination_lock_owner_entry_exclusive =
      inspection.coordinationLockOwnerEntryExclusive;
    details.coordination_lock_state_changed =
      inspection.coordinationLockStateChanged;
    details.coordination_lock_inspection_error_code =
      inspection.coordinationLockInspectionErrorCode;
    details.current_generation = toAuditRotationRecoveryGenerationDetails(
      inspection.currentGeneration
    );
    details.rotated_generation = toAuditRotationRecoveryGenerationDetails(
      inspection.rotatedGeneration
    );
    details.staging = toAuditRotationStagingEntryDetails(inspection.staging);
    details.assessment = inspection.assessment;
    details.eligible = inspection.eligible;
    details.recommended_action = inspection.recommendedAction;
    details.recovery_fingerprint = inspection.recoveryFingerprint;

    return {
      ok: true,
      checks: [{
        name: "audit_rotation_recovery",
        status: inspection.assessment === "staging_missing" ? "ok" : "warn",
        message: getAuditRotationRecoveryMessage(inspection.assessment),
        details
      }]
    };
  } catch (error) {
    return auditRotationRecoveryError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditRotationRecoveryReport(
  report: AuditRotationRecoveryReport
): string {
  const lines = ["GOD-code audit rotation recovery readiness:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    const {
      current_generation: currentGeneration,
      rotated_generation: rotatedGeneration,
      staging,
      ...summary
    } = check.details;
    for (const [key, value] of Object.entries(summary)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
    if (currentGeneration !== undefined) {
      lines.push("  current_generation:");
      for (const [key, value] of Object.entries(currentGeneration)) {
        if (value !== undefined) {
          lines.push(`    ${key}: ${String(value)}`);
        }
      }
    }
    if (rotatedGeneration !== undefined) {
      lines.push("  rotated_generation:");
      for (const [key, value] of Object.entries(rotatedGeneration)) {
        if (value !== undefined) {
          lines.push(`    ${key}: ${String(value)}`);
        }
      }
    }
    if (staging !== undefined) {
      lines.push("  staging:");
      for (const [key, value] of Object.entries(staging)) {
        if (value !== undefined) {
          lines.push(`    ${key}: ${String(value)}`);
        }
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditRotationRecoveryReportJson(
  report: AuditRotationRecoveryReport
): string {
  return JSON.stringify(report, null, 2);
}

export async function recoverAuditRotationStaging(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  stagingId: string,
  options: AuditRotationStagingRecoveryOptions = {}
): Promise<AuditRotationStagingRecoveryReport> {
  const dryRun = options.dryRun ?? true;
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditRotationStagingRecoveryDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    staging_id: stagingId,
    dry_run: dryRun,
    expected_action: options.expectedAction,
    expected_recovery_fingerprint: options.expectedRecoveryFingerprint,
    confirmation_required: dryRun,
    mutation_performed: false,
    recovered: false,
    staging_removed: false,
    durability: configCheck.details.durability
  };
  if (!/^[A-Za-z0-9]{6}$/u.test(stagingId)) {
    return auditRotationStagingRecoveryError(
      "Invalid audit rotation staging id: expected six ASCII alphanumeric characters.",
      details
    );
  }
  if (!configReport.ok) {
    return auditRotationStagingRecoveryError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }

  if (dryRun) {
    const readiness = await inspectAuditRotationRecovery(
      environ,
      cwd,
      stagingId
    );
    const readinessCheck = readiness.checks[0]!;
    const readinessDetails = readinessCheck.details;
    details.file_path = readinessDetails.file_path;
    details.rotation_path = readinessDetails.rotation_path;
    details.staging_path = readinessDetails.staging_path;
    details.coordination_lock_path = readinessDetails.coordination_lock_path;
    details.coordination_lock_exists = readinessDetails.coordination_lock_exists;
    details.coordination_lock_entry_type =
      readinessDetails.coordination_lock_entry_type;
    details.coordination_lock_acquirable =
      readinessDetails.coordination_lock_acquirable;
    details.current_generation = readinessDetails.current_generation;
    details.rotated_generation = readinessDetails.rotated_generation;
    details.staging = readinessDetails.staging;
    details.assessment = readinessDetails.assessment;
    details.eligible = readinessDetails.eligible;
    details.recommended_action = readinessDetails.recommended_action;
    details.recovery_fingerprint = readinessDetails.recovery_fingerprint;
    return {
      ok: readiness.ok,
      checks: [{
        name: "audit_rotation_staging_recovery",
        status: readinessCheck.status,
        message: readinessDetails.eligible
          ? "dry run; recovery candidate was not mutated; use --yes --expect-action <action> --expect-recovery <fingerprint>"
          : `dry run; recovery was not attempted: ${readinessCheck.message}`,
        details
      }]
    };
  }

  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return auditRotationStagingRecoveryError(
      "audit persistence is disabled; GOD_CODE_AUDIT_FILE is required for rotation staging recovery",
      details
    );
  }
  if (options.expectedAction === undefined) {
    return auditRotationStagingRecoveryError(
      "rotation staging recovery refused: --yes requires --expect-action <action>",
      details
    );
  }
  if (options.expectedRecoveryFingerprint === undefined) {
    return auditRotationStagingRecoveryError(
      "rotation staging recovery refused: --yes requires --expect-recovery <fingerprint>",
      details
    );
  }
  if (!isAuditRotationRecoveryAction(options.expectedAction)) {
    return auditRotationStagingRecoveryError(
      "rotation staging recovery refused: invalid expected action",
      details
    );
  }
  if (!/^[0-9a-f]{32}$/u.test(options.expectedRecoveryFingerprint)) {
    return auditRotationStagingRecoveryError(
      "rotation staging recovery refused: expected fingerprint must be 32 lowercase hexadecimal characters",
      details
    );
  }

  try {
    const result = await recoverJsonlAuditRotationStaging(
      configCheck.details.file_path,
      stagingId,
      options.expectedAction,
      options.expectedRecoveryFingerprint,
      { durability: configCheck.details.durability ?? "buffered" }
    );
    details.file_path = result.filePath;
    details.rotation_path = result.rotatedPath;
    details.staging_path = result.stagingPath;
    details.recovery_fingerprint = result.recoveryFingerprint;
    details.performed_action = result.performedAction;
    details.action_matches = result.existed;
    details.recovery_fingerprint_matches = result.existed;
    details.mutation_performed = result.mutationPerformed;
    details.recovered = result.recovered;
    details.staging_removed = result.stagingRemoved;
    details.durability = result.durability;
    details.durability_completed = result.durabilityCompleted;
    details.residual_staging_path = result.residualStagingPath;
    details.recovery_warning = result.warning;
    details.recovery_handles_closed = result.recoveryHandlesClosed;
    details.recovery_handle_warning = result.recoveryHandleWarning;
    details.coordination_lock_path = result.coordinationLockPath;
    details.coordination_lock_released = result.coordinationLockReleased;
    details.residual_coordination_lock_path =
      result.residualCoordinationLockPath;
    details.coordination_lock_warning = result.coordinationLockWarning;
    const uncertain = result.warning !== undefined
      || result.residualStagingPath !== undefined
      || !result.durabilityCompleted
      || result.recoveryHandleWarning !== undefined
      || !result.recoveryHandlesClosed
      || result.coordinationLockWarning !== undefined
      || !result.coordinationLockReleased
      || result.residualCoordinationLockPath !== undefined;
    if (!result.existed) {
      return {
        ok: true,
        checks: [{
          name: "audit_rotation_staging_recovery",
          status: uncertain ? "warn" : "ok",
          message: uncertain
            ? "selected rotation staging is missing; no staging mutation occurred, but recovery lifecycle finalization requires review"
            : "selected rotation staging is missing; nothing was mutated",
          details
        }]
      };
    }
    return {
      ok: true,
      checks: [{
        name: "audit_rotation_staging_recovery",
        status: uncertain ? "warn" : "ok",
        message: uncertain
          ? "rotation generations recovered, but residual cleanup, resource finalization, or durability requires review"
          : "rotation staging recovered after lock-held fingerprint revalidation",
        details
      }]
    };
  } catch (error) {
    if (error instanceof JsonlAuditRotationStagingRecoveryError) {
      const failure = error.details;
      details.file_path = failure.filePath;
      details.rotation_path = failure.rotatedPath;
      details.staging_path = failure.stagingPath;
      details.recovery_fingerprint = failure.recoveryFingerprint;
      details.failure_stage = failure.stage;
      details.mutation_state = failure.mutationState;
      details.mutation_attempted = failure.mutationState !== "not_started";
      details.mutation_performed = failure.mutationState === "rolled_back"
        || failure.mutationState === "uncertain";
      details.rollback_attempted = failure.rollbackAttempted;
      details.rollback_completed = failure.rollbackCompleted;
      details.recovered = false;
      details.recovery_handles_closed = failure.recoveryHandlesClosed;
      details.recovery_handle_warning = failure.recoveryHandleWarning;
      details.coordination_lock_path = failure.coordinationLockPath;
      details.coordination_lock_acquired = failure.coordinationLockAcquired;
      details.coordination_lock_released = failure.coordinationLockReleased;
      details.residual_coordination_lock_path =
        failure.residualCoordinationLockPath;
      details.coordination_lock_warning = failure.coordinationLockWarning;
      details.post_failure_observation_completed =
        failure.postFailureObservationCompleted;
      details.post_failure_observation =
        failure.postFailureObservation === undefined
          ? undefined
          : toAuditRotationStagingRecoveryFailureObservationDetails(
            failure.postFailureObservation
          );
      details.post_failure_observation_warning =
        failure.postFailureObservationWarning;
      return auditRotationStagingRecoveryError(error.message, details);
    }
    return auditRotationStagingRecoveryError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditRotationStagingRecoveryReport(
  report: AuditRotationStagingRecoveryReport
): string {
  const lines = ["GOD-code audit rotation staging recovery:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    const {
      current_generation: currentGeneration,
      rotated_generation: rotatedGeneration,
      staging,
      post_failure_observation: postFailureObservation,
      ...summary
    } = check.details;
    for (const [key, value] of Object.entries(summary)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
    if (currentGeneration !== undefined) {
      lines.push("  current_generation:");
      for (const [key, value] of Object.entries(currentGeneration)) {
        if (value !== undefined) {
          lines.push(`    ${key}: ${String(value)}`);
        }
      }
    }
    if (rotatedGeneration !== undefined) {
      lines.push("  rotated_generation:");
      for (const [key, value] of Object.entries(rotatedGeneration)) {
        if (value !== undefined) {
          lines.push(`    ${key}: ${String(value)}`);
        }
      }
    }
    if (staging !== undefined) {
      lines.push("  staging:");
      for (const [key, value] of Object.entries(staging)) {
        if (value !== undefined) {
          lines.push(`    ${key}: ${String(value)}`);
        }
      }
    }
    if (postFailureObservation !== undefined) {
      const {
        current_generation: postFailureCurrentGeneration,
        rotated_generation: postFailureRotatedGeneration,
        staging: postFailureStaging,
        ...postFailureSummary
      } = postFailureObservation;
      lines.push("  post_failure_observation:");
      for (const [key, value] of Object.entries(postFailureSummary)) {
        if (value !== undefined) {
          lines.push(`    ${key}: ${String(value)}`);
        }
      }
      lines.push("    current_generation:");
      for (const [key, value] of Object.entries(
        postFailureCurrentGeneration
      )) {
        if (value !== undefined) {
          lines.push(`      ${key}: ${String(value)}`);
        }
      }
      lines.push("    rotated_generation:");
      for (const [key, value] of Object.entries(
        postFailureRotatedGeneration
      )) {
        if (value !== undefined) {
          lines.push(`      ${key}: ${String(value)}`);
        }
      }
      lines.push("    staging:");
      for (const [key, value] of Object.entries(postFailureStaging)) {
        if (value !== undefined) {
          lines.push(`      ${key}: ${String(value)}`);
        }
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditRotationStagingRecoveryReportJson(
  report: AuditRotationStagingRecoveryReport
): string {
  return JSON.stringify(report, null, 2);
}

export async function inspectAuditLockQuarantines(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd()
): Promise<AuditLockQuarantineReport> {
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditLockQuarantineDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    coordination_lock_path: configCheck.details.coordination_lock_path,
    scanned_entry_count: 0,
    scan_limit: MAX_JSONL_AUDIT_LOCK_QUARANTINE_SCAN_ENTRIES,
    scan_truncated: false,
    matched_entry_count: 0,
    result_limit: MAX_JSONL_AUDIT_LOCK_QUARANTINE_RESULTS,
    result_truncated: false,
    quarantines: []
  };
  if (!configReport.ok) {
    return auditLockQuarantineError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }
  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return {
      ok: true,
      checks: [{
        name: "audit_lock_quarantines",
        status: "warn",
        message: "skipped; persistence is disabled",
        details
      }]
    };
  }

  try {
    const inspection = await inspectJsonlAuditLockQuarantines(
      configCheck.details.file_path
    );
    details.coordination_lock_path = inspection.lockPath;
    details.quarantine_prefix = inspection.quarantinePrefix;
    details.scanned_entry_count = inspection.scannedEntryCount;
    details.scan_limit = inspection.scanLimit;
    details.scan_truncated = inspection.scanTruncated;
    details.matched_entry_count = inspection.matchedEntryCount;
    details.result_limit = inspection.resultLimit;
    details.result_truncated = inspection.resultTruncated;
    details.quarantines = inspection.entries.map(
      toAuditLockQuarantineEntryDetails
    );

    const warnings: string[] = [];
    if (inspection.scanTruncated) {
      warnings.push("temp directory scan reached its bounded entry limit");
    }
    if (inspection.resultTruncated) {
      warnings.push("quarantine results reached their bounded output limit");
    }
    if (inspection.entries.length > 0) {
      warnings.push("quarantine residue requires manual review");
    }
    if (inspection.entries.some(isAuditLockQuarantineEntryUncertain)) {
      warnings.push("one or more quarantine entries have uncertain or invalid state");
    }
    return {
      ok: true,
      checks: [{
        name: "audit_lock_quarantines",
        status: warnings.length === 0 ? "ok" : "warn",
        message: warnings.length === 0
          ? "no quarantine residue found"
          : warnings.join("; "),
        details
      }]
    };
  } catch (error) {
    return auditLockQuarantineError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditLockQuarantineReport(
  report: AuditLockQuarantineReport
): string {
  const lines = ["GOD-code audit lock quarantines:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    const { quarantines, ...summary } = check.details;
    for (const [key, value] of Object.entries(summary)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
    for (const [index, quarantine] of quarantines.entries()) {
      lines.push(`  quarantine[${String(index)}]:`);
      for (const [key, value] of Object.entries(quarantine)) {
        if (value !== undefined) {
          lines.push(`    ${key}: ${String(value)}`);
        }
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditLockQuarantineReportJson(
  report: AuditLockQuarantineReport
): string {
  return JSON.stringify(report, null, 2);
}

export async function inspectAuditLockQuarantine(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  quarantineId: string
): Promise<AuditTargetedLockQuarantineReport> {
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditTargetedLockQuarantineDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    coordination_lock_path: configCheck.details.coordination_lock_path,
    quarantine_id: quarantineId
  };
  if (!configReport.ok) {
    return auditTargetedLockQuarantineError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }
  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return {
      ok: true,
      checks: [{
        name: "audit_lock_quarantine",
        status: "warn",
        message: "skipped; persistence is disabled",
        details
      }]
    };
  }

  try {
    const inspection = await inspectJsonlAuditLockQuarantine(
      configCheck.details.file_path,
      quarantineId
    );
    const quarantine = toAuditLockQuarantineEntryDetails(inspection);
    if (!inspection.exists) {
      quarantine.state_changed = undefined;
    }
    details.quarantine = quarantine;
    if (!inspection.exists) {
      return {
        ok: true,
        checks: [{
          name: "audit_lock_quarantine",
          status: "ok",
          message: "selected quarantine residue does not exist",
          details
        }]
      };
    }

    const warnings = ["selected quarantine residue requires manual review"];
    if (isAuditLockQuarantineEntryUncertain(inspection)) {
      warnings.push("selected quarantine has uncertain or invalid state");
    }
    return {
      ok: true,
      checks: [{
        name: "audit_lock_quarantine",
        status: "warn",
        message: warnings.join("; "),
        details
      }]
    };
  } catch (error) {
    return auditTargetedLockQuarantineError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditTargetedLockQuarantineReport(
  report: AuditTargetedLockQuarantineReport
): string {
  const lines = ["GOD-code audit targeted lock quarantine:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    const { quarantine, ...summary } = check.details;
    for (const [key, value] of Object.entries(summary)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
    if (quarantine !== undefined) {
      lines.push("  quarantine:");
      for (const [key, value] of Object.entries(quarantine)) {
        if (value !== undefined) {
          lines.push(`    ${key}: ${String(value)}`);
        }
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditTargetedLockQuarantineReportJson(
  report: AuditTargetedLockQuarantineReport
): string {
  return JSON.stringify(report, null, 2);
}

export async function inspectAuditLockDisposals(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd()
): Promise<AuditLockDisposalReport> {
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditLockDisposalDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    coordination_lock_path: configCheck.details.coordination_lock_path,
    scanned_entry_count: 0,
    scan_limit: MAX_JSONL_AUDIT_LOCK_DISPOSAL_SCAN_ENTRIES,
    scan_truncated: false,
    matched_entry_count: 0,
    result_limit: MAX_JSONL_AUDIT_LOCK_DISPOSAL_RESULTS,
    result_truncated: false,
    disposals: []
  };
  if (!configReport.ok) {
    return auditLockDisposalError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }
  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return {
      ok: true,
      checks: [{
        name: "audit_lock_disposals",
        status: "warn",
        message: "skipped; persistence is disabled",
        details
      }]
    };
  }

  try {
    const inspection = await inspectJsonlAuditLockDisposals(
      configCheck.details.file_path
    );
    details.coordination_lock_path = inspection.lockPath;
    details.disposal_namespace_prefix = inspection.disposalNamespacePrefix;
    details.scanned_entry_count = inspection.scannedEntryCount;
    details.scan_limit = inspection.scanLimit;
    details.scan_truncated = inspection.scanTruncated;
    details.matched_entry_count = inspection.matchedEntryCount;
    details.result_limit = inspection.resultLimit;
    details.result_truncated = inspection.resultTruncated;
    details.disposals = inspection.entries.map(
      toAuditLockDisposalEntryDetails
    );

    const warnings: string[] = [];
    if (inspection.scanTruncated) {
      warnings.push("temp directory scan reached its bounded entry limit");
    }
    if (inspection.resultTruncated) {
      warnings.push("disposal results reached their bounded output limit");
    }
    if (inspection.entries.length > 0) {
      warnings.push("disposal residue requires manual review");
    }
    if (inspection.entries.some(isAuditLockDisposalEntryUncertain)) {
      warnings.push("one or more disposal entries have uncertain or invalid state");
    }
    return {
      ok: true,
      checks: [{
        name: "audit_lock_disposals",
        status: warnings.length === 0 ? "ok" : "warn",
        message: warnings.length === 0
          ? "no disposal residue found"
          : warnings.join("; "),
        details
      }]
    };
  } catch (error) {
    return auditLockDisposalError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditLockDisposalReport(
  report: AuditLockDisposalReport
): string {
  const lines = ["GOD-code audit lock disposals:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    const { disposals, ...summary } = check.details;
    for (const [key, value] of Object.entries(summary)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
    for (const [index, disposal] of disposals.entries()) {
      lines.push(`  disposal[${String(index)}]:`);
      for (const [key, value] of Object.entries(disposal)) {
        if (value !== undefined) {
          lines.push(`    ${key}: ${String(value)}`);
        }
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditLockDisposalReportJson(
  report: AuditLockDisposalReport
): string {
  return JSON.stringify(report, null, 2);
}

export async function inspectAuditLockDisposal(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  quarantineId: string,
  disposalId: string
): Promise<AuditTargetedLockDisposalReport> {
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditTargetedLockDisposalDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    coordination_lock_path: configCheck.details.coordination_lock_path,
    quarantine_id: quarantineId,
    disposal_id: disposalId
  };
  if (!configReport.ok) {
    return auditTargetedLockDisposalError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }
  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return {
      ok: true,
      checks: [{
        name: "audit_lock_disposal",
        status: "warn",
        message: "skipped; persistence is disabled",
        details
      }]
    };
  }

  try {
    const inspection = await inspectJsonlAuditLockDisposal(
      configCheck.details.file_path,
      quarantineId,
      disposalId
    );
    const disposal = toAuditLockDisposalEntryDetails(inspection);
    if (!inspection.exists) {
      disposal.state_changed = undefined;
    }
    details.disposal = disposal;
    if (!inspection.exists) {
      return {
        ok: true,
        checks: [{
          name: "audit_lock_disposal",
          status: "ok",
          message: "selected disposal residue does not exist",
          details
        }]
      };
    }

    const warnings = ["selected disposal residue requires manual review"];
    if (isAuditLockDisposalEntryUncertain(inspection)) {
      warnings.push("selected disposal has uncertain or invalid state");
    }
    return {
      ok: true,
      checks: [{
        name: "audit_lock_disposal",
        status: "warn",
        message: warnings.join("; "),
        details
      }]
    };
  } catch (error) {
    return auditTargetedLockDisposalError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditTargetedLockDisposalReport(
  report: AuditTargetedLockDisposalReport
): string {
  const lines = ["GOD-code audit targeted lock disposal:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    const { disposal, ...summary } = check.details;
    for (const [key, value] of Object.entries(summary)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
    if (disposal !== undefined) {
      lines.push("  disposal:");
      for (const [key, value] of Object.entries(disposal)) {
        if (value !== undefined) {
          lines.push(`    ${key}: ${String(value)}`);
        }
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditTargetedLockDisposalReportJson(
  report: AuditTargetedLockDisposalReport
): string {
  return JSON.stringify(report, null, 2);
}

export async function cleanupAuditLockDisposal(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  quarantineId: string,
  disposalId: string,
  options: AuditLockDisposalCleanupOptions = {}
): Promise<AuditLockDisposalCleanupReport> {
  const dryRun = options.dryRun ?? true;
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditLockDisposalCleanupDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    coordination_lock_path: configCheck.details.coordination_lock_path,
    quarantine_id: quarantineId,
    disposal_id: disposalId,
    dry_run: dryRun,
    confirmation_required: false,
    liveness_verified: false,
    removed: false
  };
  if (!configReport.ok) {
    return auditLockDisposalCleanupError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }
  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return auditLockDisposalCleanupError(
      "audit persistence is disabled; GOD_CODE_AUDIT_FILE is required for disposal cleanup",
      details
    );
  }

  const filePath = configCheck.details.file_path;
  try {
    const inspection = await inspectJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId
    );
    details.quarantine_path = inspection.quarantinePath;
    details.source_quarantine_exists = inspection.sourceQuarantineExists;
    details.source_quarantine_entry_type = inspection.sourceQuarantineEntryType;
    details.source_quarantine_layout = inspection.sourceQuarantineLayout;
    details.source_quarantine_state_changed =
      inspection.sourceQuarantineStateChanged;
    details.source_quarantine_inspection_error_code =
      inspection.sourceQuarantineInspectionErrorCode;
    details.disposal_path = inspection.disposalPath;
    details.disposal_exists = inspection.exists;
    details.disposal_entry_type = inspection.entryType;
    details.disposal_layout = inspection.layout;
    details.owner_metadata_status = inspection.ownerMetadataStatus;
    details.owner_pid = inspection.ownerPid;
    details.owner_acquired_at = inspection.ownerAcquiredAt;
    details.state_changed = inspection.stateChanged;
    details.inspection_error_code = inspection.inspectionErrorCode;

    if (!inspection.exists) {
      return {
        ok: true,
        checks: [{
          name: "audit_lock_disposal_cleanup",
          status: "ok",
          message: "selected disposal residue does not exist; nothing to clean",
          details
        }]
      };
    }
    if (inspection.sourceQuarantineExists) {
      return auditLockDisposalCleanupError(
        "disposal cleanup refused: source quarantine must be absent",
        details
      );
    }
    if (
      inspection.entryType !== "directory"
      || inspection.layout !== "owner_only"
    ) {
      return auditLockDisposalCleanupError(
        "disposal cleanup refused: only owner_only directory residue is eligible",
        details
      );
    }
    if (
      inspection.ownerMetadataStatus !== "valid"
      || inspection.ownerToken === undefined
      || inspection.ownerFingerprint === undefined
    ) {
      return auditLockDisposalCleanupError(
        "disposal cleanup refused: valid root owner metadata is required",
        details
      );
    }

    const ownerFingerprint = inspection.ownerFingerprint;
    if (dryRun) {
      details.owner_fingerprint = ownerFingerprint;
      details.confirmation_required = true;
      return {
        ok: true,
        checks: [{
          name: "audit_lock_disposal_cleanup",
          status: "warn",
          message: "dry run; owner_only disposal residue was not removed; cleanup requires --yes --expect-owner <fingerprint>",
          details
        }]
      };
    }
    if (options.expectedOwnerFingerprint === undefined) {
      return auditLockDisposalCleanupError(
        "disposal cleanup refused: --yes requires --expect-owner <fingerprint>",
        details
      );
    }
    if (options.expectedOwnerFingerprint !== ownerFingerprint) {
      details.owner_fingerprint_matches = false;
      return auditLockDisposalCleanupError(
        "disposal cleanup refused: owner fingerprint does not match current metadata",
        details
      );
    }

    const cleanup = await cleanupJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      options.expectedOwnerFingerprint
    );
    details.removed = cleanup.removed;
    details.residual_disposal_path = cleanup.residualDisposalPath;
    if (cleanup.cleanupHandlesClosed !== undefined) {
      details.cleanup_handles_closed = cleanup.cleanupHandlesClosed;
    }
    if (cleanup.cleanupHandleWarning !== undefined) {
      details.cleanup_handle_warning = cleanup.cleanupHandleWarning;
    }
    if (!cleanup.existed) {
      withdrawAuditRuntimeMissingDisposalSnapshot(details);
      details.disposal_exists = false;
      return {
        ok: true,
        checks: [{
          name: "audit_lock_disposal_cleanup",
          status: "warn",
          message: "selected disposal residue disappeared before cleanup; nothing was removed",
          details
        }]
      };
    }
    details.owner_fingerprint = requireAuditRuntimeConfirmedFingerprint(
      options.expectedOwnerFingerprint,
      cleanup.ownerFingerprint,
      "Audit lock disposal cleanup"
    );
    details.owner_fingerprint_matches = true;
    details.disposal_exists = cleanup.residualDisposalPath === undefined
      ? false
      : undefined;
    const cleanupFinalizationUncertain = cleanup.cleanupHandlesClosed === false
      || cleanup.cleanupHandleWarning !== undefined;
    return {
      ok: true,
      checks: [{
        name: "audit_lock_disposal_cleanup",
        status: cleanup.residualDisposalPath === undefined
          && !cleanupFinalizationUncertain
          ? "ok"
          : "warn",
        message: cleanup.residualDisposalPath !== undefined
          ? cleanupFinalizationUncertain
            ? "owner metadata removed, but disposal root cleanup and descriptor finalization require review"
            : "owner metadata removed, but disposal root cleanup could not be safely confirmed"
          : cleanupFinalizationUncertain
            ? "owner_only disposal residue removed, but descriptor finalization requires review"
            : "owner_only disposal residue removed after identity-bound owner deletion",
        details
      }]
    };
  } catch (error) {
    projectAuditLockMaintenanceFailure(
      error,
      "owner_disposal_cleanup",
      details,
      "cleanup"
    );
    return auditLockDisposalCleanupError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditLockDisposalCleanupReport(
  report: AuditLockDisposalCleanupReport
): string {
  const lines = ["GOD-code audit lock disposal cleanup:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    for (const [key, value] of Object.entries(check.details)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditLockDisposalCleanupReportJson(
  report: AuditLockDisposalCleanupReport
): string {
  return JSON.stringify(report, null, 2);
}

export async function cleanupAuditEmptyLockDisposal(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  quarantineId: string,
  disposalId: string,
  options: AuditEmptyLockDisposalCleanupOptions = {}
): Promise<AuditEmptyLockDisposalCleanupReport> {
  const dryRun = options.dryRun ?? true;
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditEmptyLockDisposalCleanupDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    coordination_lock_path: configCheck.details.coordination_lock_path,
    quarantine_id: quarantineId,
    disposal_id: disposalId,
    dry_run: dryRun,
    confirmation_required: false,
    liveness_verified: false,
    removed: false
  };
  if (!configReport.ok) {
    return auditEmptyLockDisposalCleanupError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }
  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return auditEmptyLockDisposalCleanupError(
      "audit persistence is disabled; GOD_CODE_AUDIT_FILE is required for empty disposal cleanup",
      details
    );
  }

  const filePath = configCheck.details.file_path;
  try {
    const inspection = await inspectJsonlAuditLockDisposal(
      filePath,
      quarantineId,
      disposalId
    );
    details.quarantine_path = inspection.quarantinePath;
    details.source_quarantine_exists = inspection.sourceQuarantineExists;
    details.source_quarantine_entry_type = inspection.sourceQuarantineEntryType;
    details.source_quarantine_layout = inspection.sourceQuarantineLayout;
    details.source_quarantine_state_changed =
      inspection.sourceQuarantineStateChanged;
    details.source_quarantine_inspection_error_code =
      inspection.sourceQuarantineInspectionErrorCode;
    details.disposal_path = inspection.disposalPath;
    details.disposal_exists = inspection.exists;
    details.disposal_entry_type = inspection.entryType;
    details.disposal_layout = inspection.layout;
    details.state_changed = inspection.stateChanged;
    details.inspection_error_code = inspection.inspectionErrorCode;

    if (!inspection.exists) {
      return {
        ok: true,
        checks: [{
          name: "audit_empty_lock_disposal_cleanup",
          status: "ok",
          message: "selected empty disposal residue does not exist; nothing to clean",
          details
        }]
      };
    }
    if (inspection.sourceQuarantineExists) {
      return auditEmptyLockDisposalCleanupError(
        "empty disposal cleanup refused: source quarantine must be absent",
        details
      );
    }
    if (
      inspection.entryType !== "directory"
      || inspection.layout !== "empty"
      || inspection.emptyDirectoryFingerprint === undefined
    ) {
      return auditEmptyLockDisposalCleanupError(
        "empty disposal cleanup refused: an exact empty directory residue is required",
        details
      );
    }

    const disposalFingerprint = inspection.emptyDirectoryFingerprint;
    if (dryRun) {
      details.empty_directory_fingerprint = disposalFingerprint;
      details.confirmation_required = true;
      return {
        ok: true,
        checks: [{
          name: "audit_empty_lock_disposal_cleanup",
          status: "warn",
          message: "dry run; empty disposal residue was not removed; cleanup requires --yes --expect-disposal <fingerprint>",
          details
        }]
      };
    }
    if (options.expectedDisposalFingerprint === undefined) {
      return auditEmptyLockDisposalCleanupError(
        "empty disposal cleanup refused: --yes requires --expect-disposal <fingerprint>",
        details
      );
    }
    if (options.expectedDisposalFingerprint !== disposalFingerprint) {
      details.disposal_fingerprint_matches = false;
      return auditEmptyLockDisposalCleanupError(
        "empty disposal cleanup refused: disposal fingerprint does not match current directory identity",
        details
      );
    }

    const cleanup = await cleanupJsonlAuditEmptyLockDisposal(
      filePath,
      quarantineId,
      disposalId,
      options.expectedDisposalFingerprint
    );
    details.removed = cleanup.removed;
    if (cleanup.cleanupHandlesClosed !== undefined) {
      details.cleanup_handles_closed = cleanup.cleanupHandlesClosed;
    }
    if (cleanup.cleanupHandleWarning !== undefined) {
      details.cleanup_handle_warning = cleanup.cleanupHandleWarning;
    }
    if (!cleanup.existed) {
      withdrawAuditRuntimeMissingDisposalSnapshot(details);
      details.disposal_exists = false;
      return {
        ok: true,
        checks: [{
          name: "audit_empty_lock_disposal_cleanup",
          status: "warn",
          message: "selected empty disposal residue disappeared before cleanup; nothing was removed",
          details
        }]
      };
    }
    details.empty_directory_fingerprint = requireAuditRuntimeConfirmedFingerprint(
      options.expectedDisposalFingerprint,
      cleanup.disposalFingerprint,
      "Audit empty lock disposal cleanup"
    );
    details.disposal_fingerprint_matches = true;
    details.disposal_exists = false;
    const cleanupFinalizationUncertain = cleanup.cleanupHandlesClosed === false
      || cleanup.cleanupHandleWarning !== undefined;
    return {
      ok: true,
      checks: [{
        name: "audit_empty_lock_disposal_cleanup",
        status: cleanupFinalizationUncertain ? "warn" : "ok",
        message: cleanupFinalizationUncertain
          ? "empty disposal residue removed, but descriptor finalization requires review"
          : "empty disposal residue removed after identity-bound confirmation",
        details
      }]
    };
  } catch (error) {
    projectAuditLockMaintenanceFailure(
      error,
      "empty_disposal_cleanup",
      details,
      "cleanup"
    );
    return auditEmptyLockDisposalCleanupError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditEmptyLockDisposalCleanupReport(
  report: AuditEmptyLockDisposalCleanupReport
): string {
  const lines = ["GOD-code audit empty lock disposal cleanup:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    for (const [key, value] of Object.entries(check.details)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditEmptyLockDisposalCleanupReportJson(
  report: AuditEmptyLockDisposalCleanupReport
): string {
  return JSON.stringify(report, null, 2);
}

export async function cleanupAuditEmptyLockQuarantine(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  quarantineId: string,
  options: AuditEmptyLockQuarantineCleanupOptions = {}
): Promise<AuditEmptyLockQuarantineCleanupReport> {
  const dryRun = options.dryRun ?? true;
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditEmptyLockQuarantineCleanupDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    coordination_lock_path: configCheck.details.coordination_lock_path,
    quarantine_id: quarantineId,
    dry_run: dryRun,
    confirmation_required: false,
    liveness_verified: false,
    removed: false
  };
  if (!configReport.ok) {
    return auditEmptyLockQuarantineCleanupError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }
  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return auditEmptyLockQuarantineCleanupError(
      "audit persistence is disabled; GOD_CODE_AUDIT_FILE is required for empty quarantine cleanup",
      details
    );
  }

  const filePath = configCheck.details.file_path;
  try {
    const inspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );
    details.quarantine_path = inspection.quarantinePath;
    details.quarantine_exists = inspection.exists;
    details.quarantine_entry_type = inspection.entryType;
    details.quarantine_layout = inspection.layout;
    details.state_changed = inspection.stateChanged;
    details.inspection_error_code = inspection.inspectionErrorCode;

    if (!inspection.exists) {
      return {
        ok: true,
        checks: [{
          name: "audit_empty_lock_quarantine_cleanup",
          status: "ok",
          message: "selected empty quarantine residue does not exist; nothing to clean",
          details
        }]
      };
    }
    if (
      inspection.entryType !== "directory"
      || inspection.layout !== "empty"
      || inspection.emptyDirectoryFingerprint === undefined
    ) {
      return auditEmptyLockQuarantineCleanupError(
        "empty quarantine cleanup refused: an exact empty directory residue is required",
        details
      );
    }

    const quarantineFingerprint = inspection.emptyDirectoryFingerprint;
    if (dryRun) {
      details.empty_directory_fingerprint = quarantineFingerprint;
      details.confirmation_required = true;
      return {
        ok: true,
        checks: [{
          name: "audit_empty_lock_quarantine_cleanup",
          status: "warn",
          message: "dry run; empty quarantine residue was not removed; cleanup requires --yes --expect-quarantine <fingerprint>",
          details
        }]
      };
    }
    if (options.expectedQuarantineFingerprint === undefined) {
      return auditEmptyLockQuarantineCleanupError(
        "empty quarantine cleanup refused: --yes requires --expect-quarantine <fingerprint>",
        details
      );
    }
    if (options.expectedQuarantineFingerprint !== quarantineFingerprint) {
      details.quarantine_fingerprint_matches = false;
      return auditEmptyLockQuarantineCleanupError(
        "empty quarantine cleanup refused: quarantine fingerprint does not match current directory identity",
        details
      );
    }

    const cleanup = await cleanupJsonlAuditEmptyLockQuarantine(
      filePath,
      quarantineId,
      options.expectedQuarantineFingerprint
    );
    details.removed = cleanup.removed;
    if (cleanup.cleanupHandlesClosed !== undefined) {
      details.cleanup_handles_closed = cleanup.cleanupHandlesClosed;
    }
    if (cleanup.cleanupHandleWarning !== undefined) {
      details.cleanup_handle_warning = cleanup.cleanupHandleWarning;
    }
    if (!cleanup.existed) {
      withdrawAuditRuntimeMissingQuarantineSnapshot(details);
      details.quarantine_exists = false;
      return {
        ok: true,
        checks: [{
          name: "audit_empty_lock_quarantine_cleanup",
          status: "warn",
          message: "selected empty quarantine residue disappeared before cleanup; nothing was removed",
          details
        }]
      };
    }
    details.empty_directory_fingerprint = requireAuditRuntimeConfirmedFingerprint(
      options.expectedQuarantineFingerprint,
      cleanup.quarantineFingerprint,
      "Audit empty lock quarantine cleanup"
    );
    details.quarantine_fingerprint_matches = true;
    details.quarantine_exists = false;
    const cleanupFinalizationUncertain = cleanup.cleanupHandlesClosed === false
      || cleanup.cleanupHandleWarning !== undefined;
    return {
      ok: true,
      checks: [{
        name: "audit_empty_lock_quarantine_cleanup",
        status: cleanupFinalizationUncertain ? "warn" : "ok",
        message: cleanupFinalizationUncertain
          ? "empty quarantine residue removed, but descriptor finalization requires review"
          : "empty quarantine residue removed after descriptor-bound identity confirmation",
        details
      }]
    };
  } catch (error) {
    projectAuditLockMaintenanceFailure(
      error,
      "empty_quarantine_cleanup",
      details,
      "cleanup"
    );
    return auditEmptyLockQuarantineCleanupError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditEmptyLockQuarantineCleanupReport(
  report: AuditEmptyLockQuarantineCleanupReport
): string {
  const lines = ["GOD-code audit empty lock quarantine cleanup:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    for (const [key, value] of Object.entries(check.details)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditEmptyLockQuarantineCleanupReportJson(
  report: AuditEmptyLockQuarantineCleanupReport
): string {
  return JSON.stringify(report, null, 2);
}

export async function cleanupAuditLockQuarantine(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  quarantineId: string,
  options: AuditLockQuarantineCleanupOptions = {}
): Promise<AuditLockQuarantineCleanupReport> {
  const dryRun = options.dryRun ?? true;
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditLockQuarantineCleanupDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    coordination_lock_path: configCheck.details.coordination_lock_path,
    quarantine_id: quarantineId,
    dry_run: dryRun,
    confirmation_required: false,
    liveness_verified: false,
    removed: false
  };
  if (!configReport.ok) {
    return auditLockQuarantineCleanupError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }
  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return auditLockQuarantineCleanupError(
      "audit persistence is disabled; GOD_CODE_AUDIT_FILE is required for quarantine cleanup",
      details
    );
  }

  const filePath = configCheck.details.file_path;
  try {
    const inspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );
    details.quarantine_path = inspection.quarantinePath;
    details.quarantine_exists = inspection.exists;
    details.quarantine_entry_type = inspection.entryType;
    details.quarantine_layout = inspection.layout;
    details.owner_location = inspection.ownerLocation;
    details.owner_metadata_status = inspection.ownerMetadataStatus;
    details.owner_pid = inspection.ownerPid;
    details.owner_acquired_at = inspection.ownerAcquiredAt;
    details.state_changed = inspection.stateChanged;
    details.inspection_error_code = inspection.inspectionErrorCode;

    if (!inspection.exists) {
      return {
        ok: true,
        checks: [{
          name: "audit_lock_quarantine_cleanup",
          status: "ok",
          message: "selected quarantine residue does not exist; nothing to clean",
          details
        }]
      };
    }
    if (
      inspection.entryType !== "directory"
      || inspection.layout !== "owner_only"
    ) {
      return auditLockQuarantineCleanupError(
        "quarantine cleanup refused: only owner_only directory residue is eligible",
        details
      );
    }
    if (
      inspection.ownerLocation !== "root"
      || inspection.ownerMetadataStatus !== "valid"
      || inspection.ownerToken === undefined
      || inspection.ownerFingerprint === undefined
    ) {
      return auditLockQuarantineCleanupError(
        "quarantine cleanup refused: valid root owner metadata is required",
        details
      );
    }

    const ownerFingerprint = inspection.ownerFingerprint;
    if (dryRun) {
      details.owner_fingerprint = ownerFingerprint;
      details.confirmation_required = true;
      return {
        ok: true,
        checks: [{
          name: "audit_lock_quarantine_cleanup",
          status: "warn",
          message: "dry run; owner_only quarantine residue was not removed; cleanup requires --yes --expect-owner <fingerprint>",
          details
        }]
      };
    }
    if (options.expectedOwnerFingerprint === undefined) {
      return auditLockQuarantineCleanupError(
        "quarantine cleanup refused: --yes requires --expect-owner <fingerprint>",
        details
      );
    }
    if (options.expectedOwnerFingerprint !== ownerFingerprint) {
      details.owner_fingerprint_matches = false;
      return auditLockQuarantineCleanupError(
        "quarantine cleanup refused: owner fingerprint does not match current metadata",
        details
      );
    }

    const cleanup = await cleanupJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      options.expectedOwnerFingerprint
    );
    details.removed = cleanup.removed;
    details.residual_disposal_path = cleanup.residualDisposalPath;
    if (cleanup.cleanupHandlesClosed !== undefined) {
      details.cleanup_handles_closed = cleanup.cleanupHandlesClosed;
    }
    if (cleanup.cleanupHandleWarning !== undefined) {
      details.cleanup_handle_warning = cleanup.cleanupHandleWarning;
    }
    if (!cleanup.existed) {
      withdrawAuditRuntimeMissingQuarantineSnapshot(details);
      details.quarantine_exists = false;
      return {
        ok: true,
        checks: [{
          name: "audit_lock_quarantine_cleanup",
          status: "warn",
          message: "selected quarantine residue disappeared before cleanup; nothing was removed",
          details
        }]
      };
    }
    details.quarantine_exists = false;
    details.owner_fingerprint = requireAuditRuntimeConfirmedFingerprint(
      options.expectedOwnerFingerprint,
      cleanup.ownerFingerprint,
      "Audit lock quarantine cleanup"
    );
    details.owner_fingerprint_matches = true;
    const cleanupFinalizationUncertain = cleanup.cleanupHandlesClosed === false
      || cleanup.cleanupHandleWarning !== undefined;
    return {
      ok: true,
      checks: [{
        name: "audit_lock_quarantine_cleanup",
        status: cleanup.residualDisposalPath === undefined
          && !cleanupFinalizationUncertain
          ? "ok"
          : "warn",
        message: cleanup.residualDisposalPath !== undefined
          ? cleanupFinalizationUncertain
            ? "quarantine residue removed, but disposal residue and descriptor finalization require review"
            : "quarantine residue removed, but disposal residue could not be safely deleted"
          : cleanupFinalizationUncertain
            ? "owner_only quarantine residue removed, but descriptor finalization requires review"
            : "owner_only quarantine residue removed after identity-bound owner isolation",
        details
      }]
    };
  } catch (error) {
    projectAuditLockMaintenanceFailure(
      error,
      "owner_quarantine_cleanup",
      details,
      "cleanup"
    );
    return auditLockQuarantineCleanupError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditLockQuarantineCleanupReport(
  report: AuditLockQuarantineCleanupReport
): string {
  const lines = ["GOD-code audit lock quarantine cleanup:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    for (const [key, value] of Object.entries(check.details)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditLockQuarantineCleanupReportJson(
  report: AuditLockQuarantineCleanupReport
): string {
  return JSON.stringify(report, null, 2);
}

export async function recoverAuditLockQuarantine(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  quarantineId: string,
  options: AuditLockQuarantineRecoveryOptions = {}
): Promise<AuditLockQuarantineRecoveryReport> {
  const dryRun = options.dryRun ?? true;
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditLockQuarantineRecoveryDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    coordination_lock_path: configCheck.details.coordination_lock_path,
    quarantine_id: quarantineId,
    dry_run: dryRun,
    confirmation_required: false,
    liveness_verified: false,
    recovered: false
  };
  if (!configReport.ok) {
    return auditLockQuarantineRecoveryError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }
  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return auditLockQuarantineRecoveryError(
      "audit persistence is disabled; GOD_CODE_AUDIT_FILE is required for quarantine recovery",
      details
    );
  }

  const filePath = configCheck.details.file_path;
  try {
    const inspection = await inspectJsonlAuditLockQuarantine(
      filePath,
      quarantineId
    );
    details.quarantine_path = inspection.quarantinePath;
    details.quarantine_exists = inspection.exists;
    details.quarantine_entry_type = inspection.entryType;
    details.quarantine_layout = inspection.layout;
    details.owner_location = inspection.ownerLocation;
    details.owner_metadata_status = inspection.ownerMetadataStatus;
    details.owner_pid = inspection.ownerPid;
    details.owner_acquired_at = inspection.ownerAcquiredAt;
    details.state_changed = inspection.stateChanged;
    details.inspection_error_code = inspection.inspectionErrorCode;

    if (!inspection.exists) {
      return {
        ok: true,
        checks: [{
          name: "audit_lock_quarantine_recovery",
          status: "ok",
          message: "selected quarantine residue does not exist; nothing to recover",
          details
        }]
      };
    }
    if (
      inspection.entryType !== "directory"
      || (
        inspection.layout !== "lock_with_owner"
        && inspection.layout !== "lock_and_owner"
      )
    ) {
      return auditLockQuarantineRecoveryError(
        "quarantine recovery refused: only lock_with_owner or lock_and_owner directory residue is eligible",
        details
      );
    }
    if (
      (inspection.ownerLocation !== "root"
        && inspection.ownerLocation !== "lock")
      || inspection.ownerMetadataStatus !== "valid"
      || inspection.ownerToken === undefined
    ) {
      return auditLockQuarantineRecoveryError(
        "quarantine recovery refused: valid layout-selected owner metadata is required",
        details
      );
    }

    const lockInspection = await inspectJsonlAuditFileLock(filePath);
    details.coordination_lock_path = lockInspection.lockPath;
    details.coordination_lock_exists = lockInspection.exists;
    details.coordination_lock_entry_type = lockInspection.entryType;
    details.coordination_lock_acquirable = lockInspection.acquirable;
    details.coordination_lock_entry_count = lockInspection.entryCount;
    details.coordination_lock_entry_scan_count = lockInspection.entryScanCount;
    details.coordination_lock_entry_scan_limit = lockInspection.entryScanLimit;
    details.coordination_lock_entry_scan_truncated =
      lockInspection.entryScanTruncated;
    details.coordination_lock_owner_entry_exclusive =
      lockInspection.ownerEntryExclusive;
    details.coordination_lock_owner_metadata_status =
      lockInspection.ownerMetadataStatus;
    details.coordination_lock_owner_pid = lockInspection.ownerPid;
    details.coordination_lock_acquired_at = lockInspection.ownerAcquiredAt;
    details.coordination_lock_state_changed = lockInspection.stateChanged;
    details.coordination_lock_inspection_error_code =
      lockInspection.inspectionErrorCode;
    if (
      lockInspection.stateChanged === true
      || lockInspection.inspectionErrorCode !== undefined
    ) {
      return auditLockQuarantineRecoveryError(
        "quarantine recovery refused: coordination lock inspection was uncertain",
        details
      );
    }
    if (lockInspection.exists) {
      return auditLockQuarantineRecoveryError(
        "quarantine recovery refused: coordination lock entry already exists",
        details
      );
    }

    if (inspection.ownerFingerprint === undefined) {
      return auditLockQuarantineRecoveryError(
        "quarantine recovery refused: owner confirmation fingerprint is unavailable",
        details
      );
    }
    const ownerFingerprint = inspection.ownerFingerprint;
    if (dryRun) {
      details.owner_fingerprint = ownerFingerprint;
      details.confirmation_required = true;
      return {
        ok: true,
        checks: [{
          name: "audit_lock_quarantine_recovery",
          status: "warn",
          message: "dry run; pre-commit quarantine residue was not recovered; recovery requires --yes --expect-owner <fingerprint>",
          details
        }]
      };
    }
    if (options.expectedOwnerFingerprint === undefined) {
      return auditLockQuarantineRecoveryError(
        "quarantine recovery refused: --yes requires --expect-owner <fingerprint>",
        details
      );
    }
    if (options.expectedOwnerFingerprint !== ownerFingerprint) {
      details.owner_fingerprint_matches = false;
      return auditLockQuarantineRecoveryError(
        "quarantine recovery refused: owner fingerprint does not match current metadata",
        details
      );
    }

    const recovery = await recoverJsonlAuditLockQuarantine(
      filePath,
      quarantineId,
      options.expectedOwnerFingerprint
    );
    details.recovered = recovery.recovered;
    details.residual_quarantine_path = recovery.residualQuarantinePath;
    details.residual_lock_path = recovery.residualLockPath;
    if (recovery.recoveryHandlesClosed !== undefined) {
      details.recovery_handles_closed = recovery.recoveryHandlesClosed;
    }
    if (recovery.recoveryHandleWarning !== undefined) {
      details.recovery_handle_warning = recovery.recoveryHandleWarning;
    }
    if (!recovery.existed) {
      withdrawAuditRuntimeMissingQuarantineSnapshot(details);
      withdrawAuditRuntimeMissingCoordinationLockSnapshot(details);
      details.quarantine_exists = false;
      return {
        ok: true,
        checks: [{
          name: "audit_lock_quarantine_recovery",
          status: "warn",
          message: "selected quarantine residue disappeared before recovery; no coordination lock was created",
          details
        }]
      };
    }
    details.owner_fingerprint = requireAuditRuntimeConfirmedFingerprint(
      options.expectedOwnerFingerprint,
      recovery.ownerFingerprint,
      "Audit lock quarantine recovery"
    );
    details.owner_fingerprint_matches = true;
    if (!recovery.recovered) {
      if (recovery.residualLockPath !== undefined) {
        details.coordination_lock_exists = true;
        details.coordination_lock_entry_type = "directory";
        details.coordination_lock_acquirable = false;
      }
      return auditLockQuarantineRecoveryError(
        recovery.residualLockPath === undefined
          ? "quarantine recovery did not commit"
          : "quarantine recovery aborted; owner metadata was restored, but unexpected coordination lock contents were preserved",
        details
      );
    }

    details.coordination_lock_exists = true;
    details.coordination_lock_entry_type = "directory";
    details.coordination_lock_acquirable = false;
    details.coordination_lock_owner_metadata_status = "valid";
    details.coordination_lock_owner_pid = inspection.ownerPid;
    details.coordination_lock_acquired_at = inspection.ownerAcquiredAt;
    details.quarantine_exists = recovery.residualQuarantinePath === undefined
      ? false
      : undefined;
    const recoveryFinalizationUncertain = recovery.recoveryHandlesClosed === false
      || recovery.recoveryHandleWarning !== undefined;
    return {
      ok: true,
      checks: [{
        name: "audit_lock_quarantine_recovery",
        status: "warn",
        message: recovery.residualQuarantinePath !== undefined
          ? recoveryFinalizationUncertain
            ? "coordination lock recovered, but old quarantine cleanup and descriptor finalization require review; owner liveness was not verified"
            : "coordination lock recovered, but old quarantine cleanup could not be safely confirmed; owner liveness was not verified"
          : recoveryFinalizationUncertain
            ? "pre-commit quarantine residue recovered as the coordination lock, but descriptor finalization requires review; owner liveness was not verified"
            : "pre-commit quarantine residue recovered as the coordination lock; owner liveness was not verified; inspect the lock and use cleanup-lock separately if removal is intended",
        details
      }]
    };
  } catch (error) {
    projectAuditLockMaintenanceFailure(
      error,
      "quarantine_recovery",
      details,
      "recovery"
    );
    return auditLockQuarantineRecoveryError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditLockQuarantineRecoveryReport(
  report: AuditLockQuarantineRecoveryReport
): string {
  const lines = ["GOD-code audit lock quarantine recovery:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    for (const [key, value] of Object.entries(check.details)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditLockQuarantineRecoveryReportJson(
  report: AuditLockQuarantineRecoveryReport
): string {
  return JSON.stringify(report, null, 2);
}

export async function cleanupAuditLock(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  options: AuditLockCleanupOptions = {}
): Promise<AuditLockCleanupReport> {
  const dryRun = options.dryRun ?? true;
  const configReport = inspectAuditConfig(environ, cwd);
  const configCheck = configReport.checks[0]!;
  const details: AuditLockCleanupDetails = {
    enabled: configCheck.details.enabled,
    file_path: configCheck.details.file_path,
    coordination_lock_path: configCheck.details.coordination_lock_path,
    dry_run: dryRun,
    confirmation_required: false,
    liveness_verified: false,
    removed: false
  };
  if (!configReport.ok) {
    return auditLockCleanupError(
      `audit configuration is invalid: ${configCheck.message}`,
      details
    );
  }
  if (
    !configCheck.details.enabled
    || configCheck.details.file_path === undefined
  ) {
    return auditLockCleanupError(
      "audit persistence is disabled; GOD_CODE_AUDIT_FILE is required for lock cleanup",
      details
    );
  }

  const filePath = configCheck.details.file_path;
  try {
    const inspection = await inspectJsonlAuditFileLock(filePath);
    details.coordination_lock_path = inspection.lockPath;
    details.coordination_lock_exists = inspection.exists;
    details.coordination_lock_entry_type = inspection.entryType;
    details.coordination_lock_entry_count = inspection.entryCount;
    details.coordination_lock_entry_scan_count = inspection.entryScanCount;
    details.coordination_lock_entry_scan_limit = inspection.entryScanLimit;
    details.coordination_lock_entry_scan_truncated =
      inspection.entryScanTruncated;
    details.coordination_lock_owner_entry_exclusive =
      inspection.ownerEntryExclusive;
    details.coordination_lock_owner_metadata_status = inspection.ownerMetadataStatus;
    details.coordination_lock_owner_pid = inspection.ownerPid;
    details.coordination_lock_acquired_at = inspection.ownerAcquiredAt;
    details.coordination_lock_state_changed = inspection.stateChanged;
    details.coordination_lock_inspection_error_code =
      inspection.inspectionErrorCode;

    if (!inspection.exists) {
      return {
        ok: true,
        checks: [{
          name: "audit_lock_cleanup",
          status: "ok",
          message: "no coordination lock exists; nothing to clean",
          details
        }]
      };
    }
    if (inspection.entryType !== "directory") {
      return auditLockCleanupError(
        "coordination lock cleanup refused: lock entry is not a directory",
        details
      );
    }
    if (inspection.stateChanged === true) {
      return auditLockCleanupError(
        "coordination lock cleanup refused: lock state changed during inspection",
        details
      );
    }
    if (inspection.inspectionErrorCode !== undefined) {
      return auditLockCleanupError(
        `coordination lock cleanup refused: lock inspection failed (${inspection.inspectionErrorCode})`,
        details
      );
    }
    if (inspection.entryScanTruncated === true) {
      return auditLockCleanupError(
        "coordination lock cleanup refused: lock directory child scan was truncated",
        details
      );
    }
    if (
      inspection.entryCount !== undefined
      && inspection.entryCount > 1
    ) {
      return auditLockCleanupError(
        "coordination lock cleanup refused: lock directory must contain exactly one owner metadata entry",
        details
      );
    }
    if (
      inspection.ownerMetadataStatus !== "valid"
      || inspection.ownerToken === undefined
      || inspection.ownerFingerprint === undefined
    ) {
      return auditLockCleanupError(
        "coordination lock cleanup refused: valid owner metadata is required",
        details
      );
    }
    if (!inspection.ownerEntryExclusive) {
      return auditLockCleanupError(
        "coordination lock cleanup refused: lock directory must contain exactly one owner metadata entry",
        details
      );
    }

    const ownerFingerprint = inspection.ownerFingerprint;
    if (dryRun) {
      details.coordination_lock_owner_fingerprint = ownerFingerprint;
      details.confirmation_required = true;
      return {
        ok: true,
        checks: [{
          name: "audit_lock_cleanup",
          status: "warn",
          message: "dry run; candidate lock was not removed; cleanup may interrupt a live writer and requires --yes --expect-owner <fingerprint>",
          details
        }]
      };
    }

    if (options.expectedOwnerFingerprint === undefined) {
      return auditLockCleanupError(
        "coordination lock cleanup refused: --yes requires --expect-owner <fingerprint>",
        details
      );
    }
    if (options.expectedOwnerFingerprint !== ownerFingerprint) {
      details.owner_fingerprint_matches = false;
      return auditLockCleanupError(
        "coordination lock cleanup refused: owner fingerprint does not match current metadata",
        details
      );
    }

    const cleanup = await cleanupJsonlAuditFileLock(
      filePath,
      options.expectedOwnerFingerprint
    );
    details.removed = cleanup.removed;
    details.residual_quarantine_path = cleanup.residualQuarantinePath;
    if (cleanup.cleanupHandlesClosed !== undefined) {
      details.cleanup_handles_closed = cleanup.cleanupHandlesClosed;
    }
    if (cleanup.cleanupHandleWarning !== undefined) {
      details.cleanup_handle_warning = cleanup.cleanupHandleWarning;
    }
    if (!cleanup.existed) {
      withdrawAuditRuntimeMissingCoordinationLockSnapshot(details);
      details.coordination_lock_exists = false;
      return {
        ok: true,
        checks: [{
          name: "audit_lock_cleanup",
          status: "warn",
          message: "coordination lock disappeared before cleanup; nothing was removed",
          details
        }]
      };
    }
    details.coordination_lock_exists = false;
    details.coordination_lock_owner_fingerprint =
      requireAuditRuntimeConfirmedFingerprint(
        options.expectedOwnerFingerprint,
        cleanup.ownerFingerprint,
        "Audit file lock cleanup"
      );
    details.owner_fingerprint_matches = true;
    const cleanupFinalizationUncertain = cleanup.cleanupHandlesClosed === false
      || cleanup.cleanupHandleWarning !== undefined;
    return {
      ok: true,
      checks: [{
        name: "audit_lock_cleanup",
        status: cleanup.residualQuarantinePath === undefined
          && !cleanupFinalizationUncertain
          ? "ok"
          : "warn",
        message: cleanup.residualQuarantinePath !== undefined
          ? cleanupFinalizationUncertain
            ? "coordination lock removed, but quarantine residue and descriptor finalization require review"
            : "coordination lock removed, but quarantine residue could not be safely deleted"
          : cleanupFinalizationUncertain
            ? "coordination lock removed after identity-bound revalidation, but descriptor finalization requires review"
            : "coordination lock removed after identity-bound revalidation; active-writer liveness was not verified",
        details
      }]
    };
  } catch (error) {
    projectAuditLockMaintenanceFailure(
      error,
      "active_lock_cleanup",
      details,
      "cleanup"
    );
    return auditLockCleanupError(
      error instanceof Error ? error.message : String(error),
      details
    );
  }
}

export function renderAuditLockCleanupReport(
  report: AuditLockCleanupReport
): string {
  const lines = ["GOD-code audit lock cleanup:"];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix} ${check.name}: ${check.message}`);
    for (const [key, value] of Object.entries(check.details)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${String(value)}`);
      }
    }
  }
  return lines.join("\n");
}

export function renderAuditLockCleanupReportJson(
  report: AuditLockCleanupReport
): string {
  return JSON.stringify(report, null, 2);
}

function toAuditRotationStagingEntryDetails(
  entry: JsonlAuditRotationStagingEntryInspection
): AuditRotationStagingEntryDetails {
  return {
    staging_id: entry.stagingId,
    staging_path: entry.stagingPath,
    exists: entry.exists,
    entry_type: entry.entryType,
    age_ms: entry.ageMs,
    layout: entry.layout,
    entry_count: entry.entryCount,
    entry_scan_count: entry.entryScanCount,
    entry_scan_limit: entry.entryScanLimit,
    entry_scan_truncated: entry.entryScanTruncated,
    previous_entry_type: entry.previousEntryType,
    previous_size_bytes: entry.previousSizeBytes,
    state_changed: entry.stateChanged,
    inspection_error_code: entry.inspectionErrorCode
  };
}

function toAuditRotationRecoveryGenerationDetails(
  entry: JsonlAuditRotationRecoveryGenerationInspection
): AuditRotationRecoveryGenerationDetails {
  return {
    entry_path: entry.entryPath,
    exists: entry.exists,
    entry_type: entry.entryType,
    size_bytes: entry.sizeBytes,
    mode: entry.mode === undefined
      ? undefined
      : `0${entry.mode.toString(8).padStart(3, "0")}`,
    private_mode: entry.privateMode,
    link_count: entry.linkCount,
    state_changed: entry.stateChanged
  };
}

function toAuditRotationStagingRecoveryFailureObservationDetails(
  observation: JsonlAuditRotationStagingRecoveryFailureObservation
): AuditRotationStagingRecoveryFailureObservationDetails {
  return {
    observed_while_coordination_lock_held:
      observation.observedWhileCoordinationLockHeld,
    assessment: observation.assessment,
    eligible: observation.eligible,
    recommended_action: observation.recommendedAction,
    recovery_fingerprint: observation.recoveryFingerprint,
    current_generation: toAuditRotationRecoveryGenerationDetails(
      observation.currentGeneration
    ),
    rotated_generation: toAuditRotationRecoveryGenerationDetails(
      observation.rotatedGeneration
    ),
    staging: toAuditRotationStagingEntryDetails(observation.staging)
  };
}

function getAuditRotationRecoveryMessage(
  assessment: JsonlAuditRotationRecoveryAssessment
): string {
  switch (assessment) {
    case "staging_missing":
      return "selected rotation staging residue does not exist";
    case "coordination_lock_present":
      return "recovery readiness refused; coordination lock is present";
    case "cleanup_empty_staging":
      return "dry run; exact-empty staging cleanup candidate; no filesystem mutation was performed";
    case "restore_previous_archive":
      return "dry run; previous archive restore candidate; no filesystem mutation was performed";
    case "rollback_full_rotation":
      return "dry run; full rotation rollback candidate; no filesystem mutation was performed";
    case "ambiguous_record_state":
      return "recovery readiness refused; current and rotated generations cannot prove record commit state";
    case "invalid_staging_state":
      return "recovery readiness refused; selected staging state is invalid or uncertain";
    case "invalid_generation_state":
      return "recovery readiness refused; current or rotated generation is invalid";
    case "unsupported_namespace_state":
      return "recovery readiness refused; generation namespace has no safe recovery action";
    case "state_changed":
      return "recovery readiness refused; lock or filesystem state changed during inspection";
  }
}

function isAuditRotationStagingEntryUncertain(
  entry: JsonlAuditRotationStagingEntryInspection
): boolean {
  return !entry.exists
    || entry.entryType !== "directory"
    || entry.layout === undefined
    || entry.layout === "unknown"
    || entry.stateChanged === true
    || entry.inspectionErrorCode !== undefined
    || (entry.layout === "previous_only" && entry.previousEntryType === undefined);
}

function toAuditLockQuarantineEntryDetails(
  entry: JsonlAuditLockQuarantineEntryInspection
): AuditLockQuarantineEntryDetails {
  return {
    quarantine_id: entry.quarantineId,
    quarantine_path: entry.quarantinePath,
    exists: entry.exists,
    entry_type: entry.entryType,
    age_ms: entry.ageMs,
    layout: entry.layout,
    root_entry_count: entry.rootEntryCount,
    root_entry_scan_count: entry.rootEntryScanCount,
    root_entry_scan_limit: entry.rootEntryScanLimit,
    root_entry_scan_truncated: entry.rootEntryScanTruncated,
    lock_entry_type: entry.lockEntryType,
    lock_entry_count: entry.lockEntryCount,
    lock_entry_scan_count: entry.lockEntryScanCount,
    lock_entry_scan_limit: entry.lockEntryScanLimit,
    lock_entry_scan_truncated: entry.lockEntryScanTruncated,
    root_owner_metadata_status: entry.rootOwnerMetadataStatus,
    lock_owner_metadata_status: entry.lockOwnerMetadataStatus,
    owner_location: entry.ownerLocation,
    owner_metadata_status: entry.ownerMetadataStatus,
    owner_pid: entry.ownerPid,
    owner_acquired_at: entry.ownerAcquiredAt,
    owner_fingerprint: entry.ownerFingerprint,
    empty_directory_fingerprint: entry.emptyDirectoryFingerprint,
    state_changed: entry.stateChanged,
    inspection_error_code: entry.inspectionErrorCode
  };
}

function isAuditLockQuarantineEntryUncertain(
  entry: JsonlAuditLockQuarantineEntryInspection
): boolean {
  return !entry.exists
    || entry.entryType !== "directory"
    || entry.layout === "unknown"
    || entry.stateChanged === true
    || entry.inspectionErrorCode !== undefined
    || (entry.ownerLocation !== undefined && entry.ownerMetadataStatus !== "valid");
}

function toAuditLockDisposalEntryDetails(
  entry: JsonlAuditLockDisposalEntryInspection
): AuditLockDisposalEntryDetails {
  return {
    quarantine_id: entry.quarantineId,
    quarantine_path: entry.quarantinePath,
    source_quarantine_exists: entry.sourceQuarantineExists,
    source_quarantine_entry_type: entry.sourceQuarantineEntryType,
    source_quarantine_layout: entry.sourceQuarantineLayout,
    source_quarantine_state_changed: entry.sourceQuarantineStateChanged,
    source_quarantine_inspection_error_code:
      entry.sourceQuarantineInspectionErrorCode,
    disposal_id: entry.disposalId,
    disposal_path: entry.disposalPath,
    exists: entry.exists,
    entry_type: entry.entryType,
    age_ms: entry.ageMs,
    layout: entry.layout,
    root_entry_count: entry.rootEntryCount,
    root_entry_scan_count: entry.rootEntryScanCount,
    root_entry_scan_limit: entry.rootEntryScanLimit,
    root_entry_scan_truncated: entry.rootEntryScanTruncated,
    owner_metadata_status: entry.ownerMetadataStatus,
    owner_pid: entry.ownerPid,
    owner_acquired_at: entry.ownerAcquiredAt,
    owner_fingerprint: entry.ownerFingerprint,
    empty_directory_fingerprint: entry.emptyDirectoryFingerprint,
    state_changed: entry.stateChanged,
    inspection_error_code: entry.inspectionErrorCode
  };
}

function isAuditLockDisposalEntryUncertain(
  entry: JsonlAuditLockDisposalEntryInspection
): boolean {
  return !entry.exists
    || entry.entryType !== "directory"
    || entry.layout === "unknown"
    || entry.stateChanged === true
    || entry.inspectionErrorCode !== undefined
    || (entry.layout === "owner_only" && entry.ownerMetadataStatus !== "valid")
    || (entry.sourceQuarantineExists && (
      entry.sourceQuarantineEntryType !== "directory"
      || entry.sourceQuarantineLayout === "unknown"
      || entry.sourceQuarantineStateChanged === true
      || entry.sourceQuarantineInspectionErrorCode !== undefined
    ));
}

type AuditRuntimeMissingCoordinationLockSnapshot = {
  coordination_lock_exists?: boolean;
  coordination_lock_entry_type?: JsonlAuditLockEntryType;
  coordination_lock_acquirable?: boolean;
  coordination_lock_entry_count?: number;
  coordination_lock_entry_scan_count?: number;
  coordination_lock_entry_scan_limit?: number;
  coordination_lock_entry_scan_truncated?: boolean;
  coordination_lock_owner_entry_exclusive?: boolean;
  coordination_lock_owner_metadata_status?: JsonlAuditLockOwnerMetadataStatus;
  coordination_lock_owner_pid?: number;
  coordination_lock_acquired_at?: string;
  coordination_lock_state_changed?: boolean;
  coordination_lock_inspection_error_code?: string;
  coordination_lock_owner_fingerprint?: string;
  owner_fingerprint_matches?: boolean;
};

function withdrawAuditRuntimeMissingCoordinationLockSnapshot(
  details: AuditRuntimeMissingCoordinationLockSnapshot
): void {
  delete details.coordination_lock_exists;
  delete details.coordination_lock_entry_type;
  delete details.coordination_lock_acquirable;
  delete details.coordination_lock_entry_count;
  delete details.coordination_lock_entry_scan_count;
  delete details.coordination_lock_entry_scan_limit;
  delete details.coordination_lock_entry_scan_truncated;
  delete details.coordination_lock_owner_entry_exclusive;
  delete details.coordination_lock_owner_metadata_status;
  delete details.coordination_lock_owner_pid;
  delete details.coordination_lock_acquired_at;
  delete details.coordination_lock_state_changed;
  delete details.coordination_lock_inspection_error_code;
  delete details.coordination_lock_owner_fingerprint;
  delete details.owner_fingerprint_matches;
}

type AuditRuntimeMissingQuarantineSnapshot = {
  quarantine_exists?: boolean;
  quarantine_entry_type?: JsonlAuditLockEntryType;
  quarantine_layout?: JsonlAuditLockQuarantineLayout;
  owner_location?: JsonlAuditLockQuarantineOwnerLocation;
  owner_metadata_status?: JsonlAuditLockOwnerMetadataStatus;
  owner_pid?: number;
  owner_acquired_at?: string;
  owner_fingerprint?: string;
  owner_fingerprint_matches?: boolean;
  empty_directory_fingerprint?: string;
  quarantine_fingerprint_matches?: boolean;
  state_changed?: boolean;
  inspection_error_code?: string;
};

function withdrawAuditRuntimeMissingQuarantineSnapshot(
  details: AuditRuntimeMissingQuarantineSnapshot
): void {
  delete details.quarantine_exists;
  delete details.quarantine_entry_type;
  delete details.quarantine_layout;
  delete details.owner_location;
  delete details.owner_metadata_status;
  delete details.owner_pid;
  delete details.owner_acquired_at;
  delete details.owner_fingerprint;
  delete details.owner_fingerprint_matches;
  delete details.empty_directory_fingerprint;
  delete details.quarantine_fingerprint_matches;
  delete details.state_changed;
  delete details.inspection_error_code;
}

type AuditRuntimeMissingDisposalSnapshot = {
  source_quarantine_exists?: boolean;
  source_quarantine_entry_type?: JsonlAuditLockEntryType;
  source_quarantine_layout?: JsonlAuditLockQuarantineLayout;
  source_quarantine_state_changed?: boolean;
  source_quarantine_inspection_error_code?: string;
  disposal_exists?: boolean;
  disposal_entry_type?: JsonlAuditLockEntryType;
  disposal_layout?: JsonlAuditLockDisposalLayout;
  owner_metadata_status?: JsonlAuditLockOwnerMetadataStatus;
  owner_pid?: number;
  owner_acquired_at?: string;
  owner_fingerprint?: string;
  owner_fingerprint_matches?: boolean;
  empty_directory_fingerprint?: string;
  disposal_fingerprint_matches?: boolean;
  state_changed?: boolean;
  inspection_error_code?: string;
};

function withdrawAuditRuntimeMissingDisposalSnapshot(
  details: AuditRuntimeMissingDisposalSnapshot
): void {
  delete details.source_quarantine_exists;
  delete details.source_quarantine_entry_type;
  delete details.source_quarantine_layout;
  delete details.source_quarantine_state_changed;
  delete details.source_quarantine_inspection_error_code;
  delete details.disposal_exists;
  delete details.disposal_entry_type;
  delete details.disposal_layout;
  delete details.owner_metadata_status;
  delete details.owner_pid;
  delete details.owner_acquired_at;
  delete details.owner_fingerprint;
  delete details.owner_fingerprint_matches;
  delete details.empty_directory_fingerprint;
  delete details.disposal_fingerprint_matches;
  delete details.state_changed;
  delete details.inspection_error_code;
}

function requireAuditRuntimeConfirmedFingerprint(
  expectedFingerprint: string,
  runtimeFingerprint: string | undefined,
  operation: string
): string {
  if (
    runtimeFingerprint === undefined
    || runtimeFingerprint !== expectedFingerprint
  ) {
    throw new Error(
      `${operation} returned inconsistent fingerprint confirmation.`
    );
  }
  return runtimeFingerprint;
}

function auditLockCleanupError(
  message: string,
  details: AuditLockCleanupDetails
): AuditLockCleanupReport {
  return {
    ok: false,
    checks: [{
      name: "audit_lock_cleanup",
      status: "error",
      message,
      details
    }]
  };
}

function auditRotationStagingError(
  message: string,
  details: AuditRotationStagingDetails
): AuditRotationStagingReport {
  return {
    ok: false,
    checks: [{
      name: "audit_rotation_stagings",
      status: "error",
      message,
      details
    }]
  };
}

function auditRotationRecoveryError(
  message: string,
  details: AuditRotationRecoveryDetails
): AuditRotationRecoveryReport {
  return {
    ok: false,
    checks: [{
      name: "audit_rotation_recovery",
      status: "error",
      message,
      details
    }]
  };
}

function isAuditRotationRecoveryAction(
  value: string
): value is JsonlAuditRotationRecoveryAction {
  return value === "cleanup_empty_staging"
    || value === "restore_previous_archive"
    || value === "rollback_full_rotation";
}

function auditRotationStagingRecoveryError(
  message: string,
  details: AuditRotationStagingRecoveryDetails
): AuditRotationStagingRecoveryReport {
  return {
    ok: false,
    checks: [{
      name: "audit_rotation_staging_recovery",
      status: "error",
      message,
      details
    }]
  };
}

function auditTargetedRotationStagingError(
  message: string,
  details: AuditTargetedRotationStagingDetails
): AuditTargetedRotationStagingReport {
  return {
    ok: false,
    checks: [{
      name: "audit_rotation_staging",
      status: "error",
      message,
      details
    }]
  };
}

function auditLockQuarantineError(
  message: string,
  details: AuditLockQuarantineDetails
): AuditLockQuarantineReport {
  return {
    ok: false,
    checks: [{
      name: "audit_lock_quarantines",
      status: "error",
      message,
      details
    }]
  };
}

function auditLockDisposalError(
  message: string,
  details: AuditLockDisposalDetails
): AuditLockDisposalReport {
  return {
    ok: false,
    checks: [{
      name: "audit_lock_disposals",
      status: "error",
      message,
      details
    }]
  };
}

function auditTargetedLockQuarantineError(
  message: string,
  details: AuditTargetedLockQuarantineDetails
): AuditTargetedLockQuarantineReport {
  return {
    ok: false,
    checks: [{
      name: "audit_lock_quarantine",
      status: "error",
      message,
      details
    }]
  };
}

function auditTargetedLockDisposalError(
  message: string,
  details: AuditTargetedLockDisposalDetails
): AuditTargetedLockDisposalReport {
  return {
    ok: false,
    checks: [{
      name: "audit_lock_disposal",
      status: "error",
      message,
      details
    }]
  };
}

interface AuditLockMaintenanceLifecycleProjectionDetails {
  cleanup_handles_closed?: boolean;
  cleanup_handle_warning?: string;
  recovery_handles_closed?: boolean;
  recovery_handle_warning?: string;
}

function projectAuditLockMaintenanceFailure(
  error: unknown,
  operation: JsonlAuditLockMaintenanceOperation,
  details: AuditLockMaintenanceLifecycleProjectionDetails,
  kind: "cleanup" | "recovery"
): void {
  if (
    !(error instanceof JsonlAuditLockMaintenanceError)
    || error.details.operation !== operation
  ) {
    return;
  }
  if (kind === "cleanup") {
    details.cleanup_handles_closed = error.details.handlesClosed;
    if (error.details.handleWarning !== undefined) {
      details.cleanup_handle_warning = error.details.handleWarning;
    }
    return;
  }
  details.recovery_handles_closed = error.details.handlesClosed;
  if (error.details.handleWarning !== undefined) {
    details.recovery_handle_warning = error.details.handleWarning;
  }
}

function auditLockDisposalCleanupError(
  message: string,
  details: AuditLockDisposalCleanupDetails
): AuditLockDisposalCleanupReport {
  return {
    ok: false,
    checks: [{
      name: "audit_lock_disposal_cleanup",
      status: "error",
      message,
      details
    }]
  };
}

function auditEmptyLockDisposalCleanupError(
  message: string,
  details: AuditEmptyLockDisposalCleanupDetails
): AuditEmptyLockDisposalCleanupReport {
  return {
    ok: false,
    checks: [{
      name: "audit_empty_lock_disposal_cleanup",
      status: "error",
      message,
      details
    }]
  };
}

function auditEmptyLockQuarantineCleanupError(
  message: string,
  details: AuditEmptyLockQuarantineCleanupDetails
): AuditEmptyLockQuarantineCleanupReport {
  return {
    ok: false,
    checks: [{
      name: "audit_empty_lock_quarantine_cleanup",
      status: "error",
      message,
      details
    }]
  };
}

function auditLockQuarantineCleanupError(
  message: string,
  details: AuditLockQuarantineCleanupDetails
): AuditLockQuarantineCleanupReport {
  return {
    ok: false,
    checks: [{
      name: "audit_lock_quarantine_cleanup",
      status: "error",
      message,
      details
    }]
  };
}

function auditLockQuarantineRecoveryError(
  message: string,
  details: AuditLockQuarantineRecoveryDetails
): AuditLockQuarantineRecoveryReport {
  return {
    ok: false,
    checks: [{
      name: "audit_lock_quarantine_recovery",
      status: "error",
      message,
      details
    }]
  };
}
