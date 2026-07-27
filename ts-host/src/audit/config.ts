import path from "node:path";
import type { AuditSink } from "./auditSink.js";
import {
  DEFAULT_JSONL_AUDIT_DURABILITY,
  DEFAULT_JSONL_AUDIT_MAX_BYTES,
  JsonlAuditSink,
  normalizeAdditionalAuditSensitiveKeySuffixes,
  type JsonlAuditDurability,
  validateJsonlAuditDurability,
  validateJsonlAuditMaxBytes
} from "./jsonlAuditSink.js";
import { NoopAuditSink } from "./noopAuditSink.js";

export function createConfiguredAuditSink(
  environ: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd()
): AuditSink {
  const configuredPath = environ.GOD_CODE_AUDIT_FILE?.trim();
  if (!configuredPath) {
    return new NoopAuditSink();
  }
  return new JsonlAuditSink(
    path.resolve(cwd, configuredPath),
    () => new Date(),
    parseAuditMaxBytes(environ.GOD_CODE_AUDIT_MAX_BYTES),
    parseAuditRedactKeys(environ.GOD_CODE_AUDIT_REDACT_KEYS),
    parseAuditDurability(environ.GOD_CODE_AUDIT_DURABILITY)
  );
}

export function parseAuditDurability(value: string | undefined): JsonlAuditDurability {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_JSONL_AUDIT_DURABILITY;
  }
  return validateJsonlAuditDurability(value.trim().toLowerCase());
}

export function parseAuditRedactKeys(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim().length === 0) {
    return [];
  }
  return normalizeAdditionalAuditSensitiveKeySuffixes(
    value.split(",").map((entry) => entry.trim()),
    "GOD_CODE_AUDIT_REDACT_KEYS"
  );
}

export function parseAuditMaxBytes(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_JSONL_AUDIT_MAX_BYTES;
  }
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(
      "Invalid GOD_CODE_AUDIT_MAX_BYTES: expected a positive safe integer."
    );
  }
  const parsed = Number(normalized);
  return validateJsonlAuditMaxBytes(parsed, "GOD_CODE_AUDIT_MAX_BYTES");
}
