#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"
CLI="${REPO_ROOT}/ts-host/dist/cli/main.js"

if [[ ! -f "${CLI}" ]]; then
  echo "Missing built CLI: ${CLI}" >&2
  echo "Run first: cd ts-host && npm run build" >&2
  exit 2
fi

SMOKE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/god-code-smoke.XXXXXX")"
export SMOKE_ROOT
export REPO_ROOT
MCP_HTTP_PID=""
LOCAL_MODELS_PID=""
unset GOD_CODE_MCP_CONTEXT
unset GOD_CODE_MCP_CONTEXT_FILE
unset GOD_CODE_PROVIDER_MAX_RETRIES
unset GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS
unset GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS
unset GOD_CODE_PROVIDER_FALLBACKS
unset GOD_CODE_PROVIDER_MAX_INPUT_TOKENS
unset GOD_CODE_PROVIDER_MAX_OUTPUT_TOKENS
unset GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS
unset GOD_CODE_PROVIDER_REQUIRE_USAGE
unset GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED
unset GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND
unset GOD_CODE_LOCAL_PROVIDER_DAEMON_ARGS
unset GOD_CODE_LOCAL_PROVIDER_DAEMON_CWD
unset GOD_CODE_LOCAL_PROVIDER_DAEMON_READY_URL
unset GOD_CODE_LOCAL_PROVIDER_DAEMON_READY_TIMEOUT_MS
unset GOD_CODE_LOCAL_PROVIDER_DAEMON_PID_FILE
unset GOD_CODE_LOCAL_PROVIDER_DAEMON_LOG_FILE
unset GOD_CODE_LOCAL_PROVIDER_DAEMON_ENV_ALLOWLIST
unset GOD_CODE_LOCAL_PROVIDER_MODELS_URL
unset GOD_CODE_LOCAL_PROVIDER_MODELS_TIMEOUT_S
unset GOD_CODE_LOCAL_PROVIDER_MODELS_MAX_RESULTS
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_CWD
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_TIMEOUT_MS
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_LOG_FILE
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENV_ALLOWLIST
unset GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED
unset GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND
unset GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE
unset GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_CWD
unset GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_TIMEOUT_MS
unset GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_LOG_FILE
unset GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENV_ALLOWLIST
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_CWD
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_TIMEOUT_MS
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_LOG_FILE
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENV_ALLOWLIST
unset GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS
unset GOD_CODE_ANTHROPIC_VERSION
unset GOD_CODE_CONTEXT_COMPACTION
unset GOD_CODE_CONTEXT_MAX_CHARS
unset GOD_CODE_CONTEXT_KEEP_RECENT_MESSAGES
unset GOD_CODE_CONTEXT_SUMMARY_MAX_CHARS
unset GOD_CODE_SYSTEM_PROMPT_ENABLED
unset GOD_CODE_SYSTEM_PROMPT
unset GOD_CODE_SYSTEM_PROMPT_FILE
unset GOD_CODE_SYSTEM_PROMPT_EXTRA
unset GOD_CODE_APPROVAL_MODE
trap 'if [[ -n "${MCP_HTTP_PID}" ]]; then kill "${MCP_HTTP_PID}" >/dev/null 2>&1 || true; fi; if [[ -n "${LOCAL_MODELS_PID}" ]]; then kill "${LOCAL_MODELS_PID}" >/dev/null 2>&1 || true; fi; rm -rf "${SMOKE_ROOT}"' EXIT

run_cli() {
  env \
    -u GOD_CODE_PROVIDER \
    -u GOD_CODE_MODEL \
    -u GOD_CODE_API_KEY_ENV \
    -u GOD_CODE_BASE_URL \
    -u GOD_CODE_PROVIDER_TIMEOUT_S \
    -u GOD_CODE_PROVIDER_MAX_RETRIES \
    -u GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS \
    -u GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS \
    -u GOD_CODE_PROVIDER_FALLBACKS \
    -u GOD_CODE_PROVIDER_MAX_INPUT_TOKENS \
    -u GOD_CODE_PROVIDER_MAX_OUTPUT_TOKENS \
    -u GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS \
    -u GOD_CODE_PROVIDER_REQUIRE_USAGE \
    -u GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED \
    -u GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND \
    -u GOD_CODE_LOCAL_PROVIDER_DAEMON_ARGS \
    -u GOD_CODE_LOCAL_PROVIDER_DAEMON_CWD \
    -u GOD_CODE_LOCAL_PROVIDER_DAEMON_READY_URL \
    -u GOD_CODE_LOCAL_PROVIDER_DAEMON_READY_TIMEOUT_MS \
    -u GOD_CODE_LOCAL_PROVIDER_DAEMON_PID_FILE \
    -u GOD_CODE_LOCAL_PROVIDER_DAEMON_LOG_FILE \
    -u GOD_CODE_LOCAL_PROVIDER_DAEMON_ENV_ALLOWLIST \
    -u GOD_CODE_LOCAL_PROVIDER_MODELS_URL \
    -u GOD_CODE_LOCAL_PROVIDER_MODELS_TIMEOUT_S \
    -u GOD_CODE_LOCAL_PROVIDER_MODELS_MAX_RESULTS \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_CWD \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_TIMEOUT_MS \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_LOG_FILE \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENV_ALLOWLIST \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_CWD \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_TIMEOUT_MS \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_LOG_FILE \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENV_ALLOWLIST \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_CWD \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_TIMEOUT_MS \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_LOG_FILE \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENV_ALLOWLIST \
    -u GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS \
    -u GOD_CODE_ANTHROPIC_VERSION \
    -u GOD_CODE_CONTEXT_COMPACTION \
    -u GOD_CODE_CONTEXT_MAX_CHARS \
    -u GOD_CODE_CONTEXT_KEEP_RECENT_MESSAGES \
    -u GOD_CODE_CONTEXT_SUMMARY_MAX_CHARS \
    -u GOD_CODE_SYSTEM_PROMPT_ENABLED \
    -u GOD_CODE_SYSTEM_PROMPT \
    -u GOD_CODE_SYSTEM_PROMPT_FILE \
    -u GOD_CODE_SYSTEM_PROMPT_EXTRA \
    -u GOD_CODE_APPROVAL_MODE \
    -u GOD_CODE_AUDIT_FILE \
    -u GOD_CODE_AUDIT_MAX_BYTES \
    -u GOD_CODE_AUDIT_REDACT_KEYS \
    -u GOD_CODE_AUDIT_DURABILITY \
    -u GOD_CODE_MCP_SERVERS \
    -u GOD_CODE_MCP_CONFIG_FILE \
    -u GOD_CODE_MCP_CONTEXT \
    -u GOD_CODE_MCP_CONTEXT_FILE \
    -u GOD_CODE_PLUGIN_DIRS \
    -u GOD_CODE_PLUGIN_CONFIG_FILE \
    -u GOD_CODE_PLUGIN_ENABLED_IDS \
    -u GOD_CODE_PLUGIN_REGISTRY_FILE \
    GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/transcripts" \
    node "${CLI}" "$@"
}

cd "${REPO_ROOT}"

echo "==> doctor"
run_cli doctor >/dev/null

echo "==> doctor --json"
run_cli doctor --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
if (report.ok !== true) {
  throw new Error("doctor --json did not report ok=true");
}
if (!Array.isArray(report.checks) || report.checks.length === 0) {
  throw new Error("doctor --json did not return checks");
}
'

echo "==> doctor provider-health"
run_cli doctor provider-health >/dev/null

echo "==> doctor provider-health --json"
run_cli doctor provider-health --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const providerHealth = report.checks.find((check) => check.name === "provider_health");
if (report.ok !== true || providerHealth?.status !== "ok") {
  throw new Error("doctor provider-health --json did not report ok provider_health");
}
'

AUDIT_SMOKE_FILE="${SMOKE_ROOT}/audit/audit.jsonl"
mkdir -p "$(dirname -- "${AUDIT_SMOKE_FILE}")"

echo "==> audit inspect-rotation-stagings --json"
env \
  -u GOD_CODE_AUDIT_MAX_BYTES \
  -u GOD_CODE_AUDIT_REDACT_KEYS \
  -u GOD_CODE_AUDIT_DURABILITY \
  GOD_CODE_AUDIT_FILE="${AUDIT_SMOKE_FILE}" \
  node "${CLI}" audit inspect-rotation-stagings --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "audit_rotation_stagings");
if (report.ok !== true || check?.status !== "ok") {
  throw new Error("audit inspect-rotation-stagings --json did not report an empty ok state");
}
if (!/\.god-code-audit-rotation-[0-9a-f]{32}-$/.test(check?.details?.staging_prefix ?? "")) {
  throw new Error("audit inspect-rotation-stagings --json did not expose a target-bound prefix");
}
'

echo "==> audit inspect-rotation-staging --json"
env \
  -u GOD_CODE_AUDIT_MAX_BYTES \
  -u GOD_CODE_AUDIT_REDACT_KEYS \
  -u GOD_CODE_AUDIT_DURABILITY \
  GOD_CODE_AUDIT_FILE="${AUDIT_SMOKE_FILE}" \
  node "${CLI}" audit inspect-rotation-staging Ab12Z9 --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "audit_rotation_staging");
if (report.ok !== true || check?.status !== "ok" || check?.details?.staging?.exists !== false) {
  throw new Error("audit inspect-rotation-staging --json did not report a missing selected residue");
}
'

echo "==> audit inspect-rotation-recovery --json"
env \
  -u GOD_CODE_AUDIT_MAX_BYTES \
  -u GOD_CODE_AUDIT_REDACT_KEYS \
  -u GOD_CODE_AUDIT_DURABILITY \
  GOD_CODE_AUDIT_FILE="${AUDIT_SMOKE_FILE}" \
  node "${CLI}" audit inspect-rotation-recovery Ab12Z9 --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "audit_rotation_recovery");
if (
  report.ok !== true
  || check?.status !== "ok"
  || check?.details?.assessment !== "staging_missing"
  || check?.details?.eligible !== false
  || check?.details?.mutation_performed !== false
) {
  throw new Error("audit inspect-rotation-recovery --json did not report missing read-only readiness");
}
'

echo "==> audit recover-rotation-staging --dry-run --json"
env \
  -u GOD_CODE_AUDIT_MAX_BYTES \
  -u GOD_CODE_AUDIT_REDACT_KEYS \
  -u GOD_CODE_AUDIT_DURABILITY \
  GOD_CODE_AUDIT_FILE="${AUDIT_SMOKE_FILE}" \
  node "${CLI}" audit recover-rotation-staging Ab12Z9 --dry-run --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "audit_rotation_staging_recovery");
if (
  report.ok !== true
  || check?.status !== "ok"
  || check?.details?.assessment !== "staging_missing"
  || check?.details?.dry_run !== true
  || check?.details?.mutation_performed !== false
) {
  throw new Error("audit recover-rotation-staging dry run did not report missing readiness");
}
'

echo "==> audit recover-rotation-staging --yes --json missing no-op"
env \
  -u GOD_CODE_AUDIT_MAX_BYTES \
  -u GOD_CODE_AUDIT_REDACT_KEYS \
  -u GOD_CODE_AUDIT_DURABILITY \
  GOD_CODE_AUDIT_FILE="${AUDIT_SMOKE_FILE}" \
  node "${CLI}" audit recover-rotation-staging Ab12Z9 \
    --yes \
    --expect-action cleanup_empty_staging \
    --expect-recovery 00000000000000000000000000000000 \
    --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "audit_rotation_staging_recovery");
if (
  report.ok !== true
  || check?.status !== "ok"
  || check?.details?.dry_run !== false
  || check?.details?.mutation_performed !== false
  || check?.details?.recovered !== false
  || check?.details?.performed_action !== undefined
  || check?.details?.recovery_handles_closed !== true
  || check?.details?.coordination_lock_released !== true
  || typeof check?.details?.coordination_lock_path !== "string"
) {
  throw new Error("audit recover-rotation-staging confirmed missing no-op contract failed");
}
'

AUDIT_RECOVERY_STAGING_ID="RcV001"
AUDIT_RECOVERY_STAGING_PATH="$(
  node --input-type=module -e '
import { pathToFileURL } from "node:url";
const { getJsonlAuditRotationStagingPath } = await import(
  pathToFileURL(process.argv[1]).href
);
process.stdout.write(getJsonlAuditRotationStagingPath(process.argv[2], process.argv[3]));
' \
    "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
    "${AUDIT_SMOKE_FILE}" \
    "${AUDIT_RECOVERY_STAGING_ID}"
)"
mkdir -m 700 -- "${AUDIT_RECOVERY_STAGING_PATH}"
AUDIT_RECOVERY_PLAN="${SMOKE_ROOT}/audit-rotation-recovery-plan.json"

echo "==> audit recover-rotation-staging confirmed empty cleanup"
env \
  -u GOD_CODE_AUDIT_MAX_BYTES \
  -u GOD_CODE_AUDIT_REDACT_KEYS \
  -u GOD_CODE_AUDIT_DURABILITY \
  GOD_CODE_AUDIT_FILE="${AUDIT_SMOKE_FILE}" \
  node "${CLI}" audit recover-rotation-staging \
    "${AUDIT_RECOVERY_STAGING_ID}" \
    --dry-run \
    --json > "${AUDIT_RECOVERY_PLAN}"
read -r AUDIT_RECOVERY_ACTION AUDIT_RECOVERY_FINGERPRINT < <(
  node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const check = report.checks.find((item) => item.name === "audit_rotation_staging_recovery");
if (
  report.ok !== true
  || check?.status !== "warn"
  || check?.details?.recommended_action !== "cleanup_empty_staging"
  || !/^[0-9a-f]{32}$/.test(check?.details?.recovery_fingerprint ?? "")
) {
  throw new Error("audit recovery dry run did not produce an empty cleanup confirmation");
}
process.stdout.write(`${check.details.recommended_action} ${check.details.recovery_fingerprint}\n`);
' "${AUDIT_RECOVERY_PLAN}"
)
env \
  -u GOD_CODE_AUDIT_MAX_BYTES \
  -u GOD_CODE_AUDIT_REDACT_KEYS \
  -u GOD_CODE_AUDIT_DURABILITY \
  GOD_CODE_AUDIT_FILE="${AUDIT_SMOKE_FILE}" \
  node "${CLI}" audit recover-rotation-staging \
    "${AUDIT_RECOVERY_STAGING_ID}" \
    --yes \
    --expect-action "${AUDIT_RECOVERY_ACTION}" \
    --expect-recovery "${AUDIT_RECOVERY_FINGERPRINT}" \
    --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "audit_rotation_staging_recovery");
if (
  report.ok !== true
  || check?.status !== "ok"
  || check?.details?.mutation_performed !== true
  || check?.details?.performed_action !== "cleanup_empty_staging"
  || check?.details?.recovered !== true
  || check?.details?.staging_removed !== true
  || check?.details?.durability_completed !== true
  || check?.details?.recovery_handles_closed !== true
  || check?.details?.coordination_lock_released !== true
  || typeof check?.details?.coordination_lock_path !== "string"
) {
  throw new Error("audit recover-rotation-staging did not complete confirmed empty cleanup");
}
'
if [[ -e "${AUDIT_RECOVERY_STAGING_PATH}" ]]; then
  echo "Confirmed audit rotation staging cleanup left a residue." >&2
  exit 1
fi

AUDIT_FAILURE_STAGING_ID="RcV002"
AUDIT_FAILURE_STAGING_PATH="$(
  node --input-type=module -e '
import { pathToFileURL } from "node:url";
const { getJsonlAuditRotationStagingPath } = await import(
  pathToFileURL(process.argv[1]).href
);
process.stdout.write(getJsonlAuditRotationStagingPath(process.argv[2], process.argv[3]));
' \
    "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
    "${AUDIT_SMOKE_FILE}" \
    "${AUDIT_FAILURE_STAGING_ID}"
)"
mkdir -m 700 -- "${AUDIT_FAILURE_STAGING_PATH}"
AUDIT_FAILURE_PLAN="${SMOKE_ROOT}/audit-rotation-recovery-failure-plan.json"
AUDIT_FAILURE_REPORT="${SMOKE_ROOT}/audit-rotation-recovery-failure.json"

echo "==> audit recover-rotation-staging stale confirmation failure evidence"
env \
  -u GOD_CODE_AUDIT_MAX_BYTES \
  -u GOD_CODE_AUDIT_REDACT_KEYS \
  -u GOD_CODE_AUDIT_DURABILITY \
  GOD_CODE_AUDIT_FILE="${AUDIT_SMOKE_FILE}" \
  node "${CLI}" audit recover-rotation-staging \
    "${AUDIT_FAILURE_STAGING_ID}" \
    --dry-run \
    --json > "${AUDIT_FAILURE_PLAN}"
read -r AUDIT_FAILURE_ACTION AUDIT_FAILURE_FINGERPRINT < <(
  node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const check = report.checks.find((item) => item.name === "audit_rotation_staging_recovery");
if (
  report.ok !== true
  || check?.details?.recommended_action !== "cleanup_empty_staging"
  || !/^[0-9a-f]{32}$/.test(check?.details?.recovery_fingerprint ?? "")
) {
  throw new Error("audit recovery failure smoke did not produce a confirmation plan");
}
process.stdout.write(`${check.details.recommended_action} ${check.details.recovery_fingerprint}\n`);
' "${AUDIT_FAILURE_PLAN}"
)
printf '%s\n' "confirmation drift" > "${AUDIT_FAILURE_STAGING_PATH}/unexpected"
if env \
  -u GOD_CODE_AUDIT_MAX_BYTES \
  -u GOD_CODE_AUDIT_REDACT_KEYS \
  -u GOD_CODE_AUDIT_DURABILITY \
  GOD_CODE_AUDIT_FILE="${AUDIT_SMOKE_FILE}" \
  node "${CLI}" audit recover-rotation-staging \
    "${AUDIT_FAILURE_STAGING_ID}" \
    --yes \
    --expect-action "${AUDIT_FAILURE_ACTION}" \
    --expect-recovery "${AUDIT_FAILURE_FINGERPRINT}" \
    --json > "${AUDIT_FAILURE_REPORT}"; then
  echo "Stale audit rotation recovery confirmation unexpectedly succeeded." >&2
  exit 1
fi
node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const check = report.checks.find((item) => item.name === "audit_rotation_staging_recovery");
if (
  report.ok !== false
  || check?.status !== "error"
  || check?.details?.failure_stage !== "locked_revalidation"
  || check?.details?.mutation_state !== "not_started"
  || check?.details?.mutation_attempted !== false
  || check?.details?.mutation_performed !== false
  || check?.details?.rollback_attempted !== false
  || check?.details?.recovered !== false
  || check?.details?.coordination_lock_acquired !== true
  || check?.details?.coordination_lock_released !== true
  || typeof check?.details?.coordination_lock_path !== "string"
) {
  throw new Error("audit recovery failure smoke did not preserve structured failure evidence");
}
' "${AUDIT_FAILURE_REPORT}"

AUDIT_HANDOFF_FILE="${SMOKE_ROOT}/audit/handoff.jsonl"
echo "==> built audit recovery failed-open handle handoff"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  getJsonlAuditLockPath,
  getJsonlAuditRotationStagingPath,
  inspectJsonlAuditRotationRecovery,
  recoverJsonlAuditRotationStaging
} = await import(pathToFileURL(process.argv[1]).href);
const filePath = process.argv[2];
const parentPath = path.dirname(filePath);
const stagingId = "HndS01";
const stagingPath = getJsonlAuditRotationStagingPath(filePath, stagingId);
await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
await fs.mkdir(stagingPath, { mode: 0o700 });
await fs.writeFile(
  path.join(stagingPath, "previous"),
  "previous-archive\n",
  { mode: 0o600 }
);
const readiness = await inspectJsonlAuditRotationRecovery(filePath, stagingId);
const originalOpen = fs.open.bind(fs);
let injectionEnabled = false;
let injected = false;
let closeCalls = 0;
try {
  fs.open = async (target, flags, mode) => {
    const handle = await originalOpen(target, flags, mode);
    if (injectionEnabled && !injected && String(target) === parentPath) {
      injected = true;
      handle.stat = async () => {
        throw new Error("built candidate parent validation failure");
      };
      const close = handle.close.bind(handle);
      handle.close = async () => {
        closeCalls += 1;
        await close();
        throw new Error("built handed-off candidate close failure");
      };
    }
    return handle;
  };
  let failure;
  try {
    await recoverJsonlAuditRotationStaging(
      filePath,
      stagingId,
      "restore_previous_archive",
      readiness.recoveryFingerprint,
      { beforeMutation: () => { injectionEnabled = true; } }
    );
  } catch (error) {
    failure = error;
  }
  if (
    !injected
    || closeCalls !== 1
    || failure?.message !== "built candidate parent validation failure"
    || failure?.details?.stage !== "candidate_open"
    || failure?.details?.mutationState !== "not_started"
    || failure?.details?.recoveryHandlesClosed !== false
    || !failure?.details?.recoveryHandleWarning?.includes(
      "built handed-off candidate close failure"
    )
    || failure?.details?.coordinationLockAcquired !== true
    || failure?.details?.coordinationLockReleased !== true
  ) {
    throw new Error("built recovery failed-open handle handoff contract failed");
  }
  try {
    await fs.access(getJsonlAuditLockPath(filePath));
    throw new Error("built recovery handle handoff left a coordination lock");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
} finally {
  fs.open = originalOpen;
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${AUDIT_HANDOFF_FILE}"

AUDIT_CLOSE_FILE="${SMOKE_ROOT}/audit/close-settlement.jsonl"
echo "==> built audit recovery synchronous close settlement"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  getJsonlAuditLockPath,
  getJsonlAuditRotationStagingPath,
  inspectJsonlAuditRotationRecovery,
  recoverJsonlAuditRotationStaging
} = await import(pathToFileURL(process.argv[1]).href);
const filePath = process.argv[2];
const parentPath = path.dirname(filePath);
const stagingId = "SynS01";
const stagingPath = getJsonlAuditRotationStagingPath(filePath, stagingId);
await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
await fs.mkdir(stagingPath, { mode: 0o700 });
await fs.writeFile(
  path.join(stagingPath, "previous"),
  "previous-archive\n",
  { mode: 0o600 }
);
const readiness = await inspectJsonlAuditRotationRecovery(filePath, stagingId);
const originalOpen = fs.open.bind(fs);
let injectionEnabled = false;
let stagingOpenCount = 0;
let stagingCloseCalls = 0;
let parentCloseCalls = 0;
let closeCompletion;
try {
  fs.open = async (target, flags, mode) => {
    const handle = await originalOpen(target, flags, mode);
    if (injectionEnabled && String(target) === parentPath) {
      const close = handle.close.bind(handle);
      handle.close = async () => {
        parentCloseCalls += 1;
        await close();
      };
    }
    if (injectionEnabled && String(target) === stagingPath) {
      stagingOpenCount += 1;
      if (stagingOpenCount === 2) {
        const close = handle.close.bind(handle);
        handle.close = () => {
          stagingCloseCalls += 1;
          closeCompletion = close();
          throw new Error("built synchronous candidate close failure");
        };
      }
    }
    return handle;
  };
  const result = await recoverJsonlAuditRotationStaging(
    filePath,
    stagingId,
    "restore_previous_archive",
    readiness.recoveryFingerprint,
    { beforeMutation: () => { injectionEnabled = true; } }
  );
  await closeCompletion;
  if (
    stagingOpenCount !== 2
    || stagingCloseCalls !== 1
    || parentCloseCalls !== 1
    || result.performedAction !== "restore_previous_archive"
    || result.mutationPerformed !== true
    || result.recovered !== true
    || result.stagingRemoved !== true
    || result.recoveryHandlesClosed !== false
    || !result.recoveryHandleWarning?.includes(
      "built synchronous candidate close failure"
    )
    || result.coordinationLockReleased !== true
  ) {
    throw new Error("built recovery synchronous close settlement contract failed");
  }
  try {
    await fs.access(getJsonlAuditLockPath(filePath));
    throw new Error("built synchronous close settlement left a coordination lock");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
} finally {
  fs.open = originalOpen;
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${AUDIT_CLOSE_FILE}"

AUDIT_ERROR_SUMMARY_FILE="${SMOKE_ROOT}/audit/error-summary.jsonl"
echo "==> built audit recovery hostile error summary normalization"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  getJsonlAuditLockPath,
  getJsonlAuditRotationStagingPath,
  inspectJsonlAuditRotationRecovery,
  recoverJsonlAuditRotationStaging
} = await import(pathToFileURL(process.argv[1]).href);
const filePath = process.argv[2];
const stagingId = "FmtS01";
const stagingPath = getJsonlAuditRotationStagingPath(filePath, stagingId);
await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
await fs.mkdir(stagingPath, { mode: 0o700 });
await fs.writeFile(
  path.join(stagingPath, "previous"),
  "previous-archive\n",
  { mode: 0o600 }
);
const readiness = await inspectJsonlAuditRotationRecovery(filePath, stagingId);
const originalOpen = fs.open.bind(fs);
let injectionEnabled = false;
let stagingOpenCount = 0;
let closeCompletion;
const hostileReason = {
  [Symbol.toPrimitive]() {
    throw new Error("built secondary formatter failure");
  }
};
try {
  fs.open = async (target, flags, mode) => {
    const handle = await originalOpen(target, flags, mode);
    if (injectionEnabled && String(target) === stagingPath) {
      stagingOpenCount += 1;
      if (stagingOpenCount === 2) {
        const close = handle.close.bind(handle);
        handle.close = () => {
          closeCompletion = close();
          throw hostileReason;
        };
      }
    }
    return handle;
  };
  const result = await recoverJsonlAuditRotationStaging(
    filePath,
    stagingId,
    "restore_previous_archive",
    readiness.recoveryFingerprint,
    { beforeMutation: () => { injectionEnabled = true; } }
  );
  await closeCompletion;
  if (
    result.performedAction !== "restore_previous_archive"
    || result.mutationPerformed !== true
    || result.recoveryHandlesClosed !== false
    || result.recoveryHandleWarning
      !== "recovery descriptor close failed: unavailable error detail"
    || result.coordinationLockReleased !== true
  ) {
    throw new Error("built recovery hostile error summary contract failed");
  }
  try {
    await fs.access(getJsonlAuditLockPath(filePath));
    throw new Error("built hostile error summary left a coordination lock");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
} finally {
  fs.open = originalOpen;
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${AUDIT_ERROR_SUMMARY_FILE}"

AUDIT_POST_FAILURE_OBSERVATION_FILE="${SMOKE_ROOT}/audit/post-failure-observation.jsonl"
echo "==> built audit recovery post-failure namespace observation"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  JsonlAuditRotationStagingRecoveryError,
  getJsonlAuditLockPath,
  getJsonlAuditRotationStagingPath,
  inspectJsonlAuditRotationRecovery,
  recoverJsonlAuditRotationStaging
} = await import(pathToFileURL(process.argv[1]).href);
const filePath = process.argv[2];
const rotatedPath = `${filePath}.1`;
const stagingId = "ObsS01";
const stagingPath = getJsonlAuditRotationStagingPath(filePath, stagingId);
const previousPath = path.join(stagingPath, "previous");
const detachedPath = path.join(stagingPath, "detached-previous");
await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
await fs.mkdir(stagingPath, { mode: 0o700 });
await fs.writeFile(previousPath, "previous-archive\n", { mode: 0o600 });
const readiness = await inspectJsonlAuditRotationRecovery(filePath, stagingId);
const originalRename = fs.rename.bind(fs);
let injected = false;
try {
  fs.rename = async (source, destination) => {
    if (
      !injected
      && path.basename(String(source)) === "previous"
      && path.basename(String(destination)) === path.basename(rotatedPath)
    ) {
      injected = true;
      await originalRename(previousPath, detachedPath);
      await fs.writeFile(
        previousPath,
        "replacement-archive\n",
        { mode: 0o600 }
      );
    }
    await originalRename(source, destination);
  };
  const failure = await recoverJsonlAuditRotationStaging(
    filePath,
    stagingId,
    "restore_previous_archive",
    readiness.recoveryFingerprint
  ).catch((error) => error);
  const observation = failure?.details?.postFailureObservation;
  if (
    !injected
    || !(failure instanceof JsonlAuditRotationStagingRecoveryError)
    || failure.details.stage !== "rollback"
    || failure.details.mutationState !== "uncertain"
    || failure.details.rollbackCompleted !== false
    || failure.details.recoveryFingerprint !== readiness.recoveryFingerprint
    || failure.details.postFailureObservationCompleted !== true
    || observation?.observedWhileCoordinationLockHeld !== true
    || observation?.assessment !== "invalid_staging_state"
    || observation?.eligible !== false
    || observation?.recoveryFingerprint !== undefined
    || observation?.currentGeneration?.exists !== true
    || observation?.rotatedGeneration?.exists !== true
    || observation?.staging?.layout !== "unknown"
    || observation?.staging?.entryCount !== 1
    || failure.details.postFailureObservationWarning !== undefined
    || failure.details.coordinationLockReleased !== true
  ) {
    throw new Error(
      "built recovery post-failure namespace observation contract failed"
    );
  }
  if (
    await fs.readFile(filePath, "utf8") !== "current-record\n"
    || await fs.readFile(rotatedPath, "utf8") !== "replacement-archive\n"
    || await fs.readFile(detachedPath, "utf8") !== "previous-archive\n"
  ) {
    throw new Error("built post-failure namespace evidence was inaccurate");
  }
  try {
    await fs.access(getJsonlAuditLockPath(filePath));
    throw new Error("built post-failure observation left a coordination lock");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
} finally {
  fs.rename = originalRename;
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${AUDIT_POST_FAILURE_OBSERVATION_FILE}"

AUDIT_STAGING_CHILD_SCAN_FILE="${SMOKE_ROOT}/audit/staging-child-scan.jsonl"
echo "==> built audit rotation staging bounded child scan"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  JsonlAuditRotationStagingRecoveryError,
  MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES,
  getJsonlAuditLockPath,
  getJsonlAuditRotationStagingPath,
  inspectJsonlAuditRotationRecovery,
  recoverJsonlAuditRotationStaging
} = await import(pathToFileURL(process.argv[1]).href);
const filePath = process.argv[2];
const stagingId = "BndS01";
const stagingPath = getJsonlAuditRotationStagingPath(filePath, stagingId);
const overflowNames = ["overflow-secret-a", "overflow-secret-b"];
await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
await fs.mkdir(stagingPath, { mode: 0o700 });
await fs.writeFile(
  path.join(stagingPath, "previous"),
  "previous-archive\n",
  { mode: 0o600 }
);
for (const name of overflowNames) {
  await fs.writeFile(path.join(stagingPath, name), "overflow\n", {
    mode: 0o600
  });
}
const originalOpendir = fs.opendir.bind(fs);
const originalReaddir = fs.readdir.bind(fs);
let opendirCalls = 0;
let readCalls = 0;
let forbiddenReaddirCalls = 0;
const resolveTarget = async (target) => {
  try {
    return path.resolve(await fs.realpath(target));
  } catch {
    return path.resolve(String(target));
  }
};
try {
  fs.opendir = async (target, options) => {
    const directory = await originalOpendir(target, options);
    if (await resolveTarget(target) === path.resolve(stagingPath)) {
      opendirCalls += 1;
      const read = directory.read.bind(directory);
      directory.read = async () => {
        readCalls += 1;
        return read();
      };
    }
    return directory;
  };
  fs.readdir = async (target, options) => {
    if (await resolveTarget(target) === path.resolve(stagingPath)) {
      forbiddenReaddirCalls += 1;
      throw new Error("built staging scan used unbounded readdir");
    }
    return originalReaddir(target, options);
  };
  const inspection = await inspectJsonlAuditRotationRecovery(
    filePath,
    stagingId
  );
  const failure = await recoverJsonlAuditRotationStaging(
    filePath,
    stagingId,
    "restore_previous_archive",
    "0".repeat(32)
  ).catch((error) => error);
  const observation = failure?.details?.postFailureObservation;
  const serialized = JSON.stringify({ inspection, observation });
  if (
    MAX_JSONL_AUDIT_ROTATION_STAGING_CHILD_SCAN_ENTRIES !== 2
    || forbiddenReaddirCalls !== 0
    || opendirCalls !== 6
    || readCalls !== 18
    || inspection.assessment !== "invalid_staging_state"
    || inspection.eligible !== false
    || inspection.recoveryFingerprint !== undefined
    || inspection.staging.entryCount !== undefined
    || inspection.staging.entryScanCount !== 2
    || inspection.staging.entryScanLimit !== 2
    || inspection.staging.entryScanTruncated !== true
    || !(failure instanceof JsonlAuditRotationStagingRecoveryError)
    || failure.details.stage !== "locked_revalidation"
    || failure.details.mutationState !== "not_started"
    || failure.details.postFailureObservationCompleted !== true
    || observation?.assessment !== "invalid_staging_state"
    || observation?.staging?.entryScanTruncated !== true
    || failure.details.coordinationLockReleased !== true
    || overflowNames.some((name) => serialized.includes(name))
  ) {
    throw new Error("built bounded staging child scan contract failed");
  }
  try {
    await fs.access(getJsonlAuditLockPath(filePath));
    throw new Error("built bounded staging scan left a coordination lock");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
} finally {
  fs.opendir = originalOpendir;
  fs.readdir = originalReaddir;
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${AUDIT_STAGING_CHILD_SCAN_FILE}"

AUDIT_LOCK_CHILD_SCAN_FILE="${SMOKE_ROOT}/audit/lock-child-scan.jsonl"
echo "==> built audit lock maintenance bounded child scan"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
  cleanupJsonlAuditLockDisposal,
  getJsonlAuditLockDisposalPath,
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockQuarantinePath,
  inspectJsonlAuditLockDisposal,
  inspectJsonlAuditLockQuarantine
} = await import(pathToFileURL(process.argv[1]).href);
const filePath = process.argv[2];
const quarantinePath = getJsonlAuditLockQuarantinePath(filePath, "QbS001");
const disposalPath = getJsonlAuditLockDisposalPath(
  filePath,
  "DbS001",
  "DdS001"
);
const cleanupDisposalPath = getJsonlAuditLockDisposalPath(
  filePath,
  "MbS001",
  "MdS001"
);
const overflowNames = ["overflow-secret-a", "overflow-secret-b"];
for (const residuePath of [quarantinePath, disposalPath]) {
  await fs.mkdir(residuePath, { recursive: true, mode: 0o700 });
  await fs.writeFile(
    getJsonlAuditLockOwnerPath(residuePath),
    "invalid-owner\n",
    { mode: 0o600 }
  );
  for (const name of overflowNames) {
    await fs.writeFile(path.join(residuePath, name), "overflow\n", {
      mode: 0o600
    });
  }
}
await fs.mkdir(cleanupDisposalPath, { recursive: true, mode: 0o700 });
const ownerToken = "00000000-0000-4000-8000-000000000001";
const acquiredAt = "2026-07-23T05:00:00.000Z";
await fs.writeFile(
  getJsonlAuditLockOwnerPath(cleanupDisposalPath),
  `${JSON.stringify({
    version: 1,
    owner_token: ownerToken,
    pid: process.pid,
    acquired_at: acquiredAt,
    acquired_at_ms: Date.parse(acquiredAt)
  })}\n`,
  { mode: 0o600 }
);
const cleanupInspection = await inspectJsonlAuditLockDisposal(
  filePath,
  "MbS001",
  "MdS001"
);
if (cleanupInspection.ownerFingerprint === undefined) {
  throw new Error("built cleanup disposal fingerprint unavailable");
}
const selectedPaths = new Set([
  quarantinePath,
  disposalPath,
  cleanupDisposalPath
].map((target) => path.resolve(target)));
const scanCounts = new Map([...selectedPaths].map((target) => [target, {
  opens: 0,
  reads: 0
}]));
const originalOpendir = fs.opendir.bind(fs);
const originalReaddir = fs.readdir.bind(fs);
const originalUnlink = fs.unlink.bind(fs);
let forbiddenReaddirCalls = 0;
let unlinkCalls = 0;
const resolveTarget = async (target) => {
  try {
    return path.resolve(await fs.realpath(target));
  } catch {
    return path.resolve(String(target));
  }
};
try {
  fs.opendir = async (target, options) => {
    const resolvedTarget = await resolveTarget(target);
    const directory = await originalOpendir(target, options);
    const counts = scanCounts.get(resolvedTarget);
    if (counts !== undefined) {
      counts.opens += 1;
      const read = directory.read.bind(directory);
      directory.read = async () => {
        counts.reads += 1;
        return read();
      };
    }
    return directory;
  };
  fs.readdir = async (target, options) => {
    if (selectedPaths.has(await resolveTarget(target))) {
      forbiddenReaddirCalls += 1;
      throw new Error("built lock child scan used unbounded readdir");
    }
    return originalReaddir(target, options);
  };
  fs.unlink = async (target) => {
    unlinkCalls += 1;
    return originalUnlink(target);
  };
  const quarantine = await inspectJsonlAuditLockQuarantine(
    filePath,
    "QbS001"
  );
  const disposal = await inspectJsonlAuditLockDisposal(
    filePath,
    "DbS001",
    "DdS001"
  );
  const cleanupFailure = await cleanupJsonlAuditLockDisposal(
    filePath,
    "MbS001",
    "MdS001",
    cleanupInspection.ownerFingerprint,
    {
      beforeOwnerDeletion: async () => {
        for (const name of overflowNames) {
          await fs.writeFile(
            path.join(cleanupDisposalPath, name),
            "preserved\n",
            { mode: 0o600 }
          );
        }
      }
    }
  ).catch((error) => error);
  const quarantineCounts = scanCounts.get(path.resolve(quarantinePath));
  const disposalCounts = scanCounts.get(path.resolve(disposalPath));
  const cleanupCounts = scanCounts.get(path.resolve(cleanupDisposalPath));
  const serialized = JSON.stringify({ quarantine, disposal });
  if (
    MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES !== 2
    || forbiddenReaddirCalls !== 0
    || quarantineCounts?.opens !== 2
    || quarantineCounts?.reads !== 6
    || disposalCounts?.opens !== 2
    || disposalCounts?.reads !== 6
    || cleanupCounts?.opens !== 2
    || cleanupCounts?.reads !== 5
    || quarantine.layout !== "unknown"
    || quarantine.rootEntryCount !== undefined
    || quarantine.rootEntryScanCount !== 2
    || quarantine.rootEntryScanLimit !== 2
    || quarantine.rootEntryScanTruncated !== true
    || quarantine.ownerToken !== undefined
    || disposal.layout !== "unknown"
    || disposal.rootEntryCount !== undefined
    || disposal.rootEntryScanCount !== 2
    || disposal.rootEntryScanLimit !== 2
    || disposal.rootEntryScanTruncated !== true
    || disposal.ownerToken !== undefined
    || cleanupFailure?.message !== "Audit lock disposal changed before cleanup."
    || unlinkCalls !== 0
    || overflowNames.some((name) => serialized.includes(name))
  ) {
    throw new Error("built bounded lock child scan contract failed");
  }
  await fs.access(getJsonlAuditLockOwnerPath(cleanupDisposalPath));
  for (const name of overflowNames) {
    if (
      await fs.readFile(path.join(cleanupDisposalPath, name), "utf8")
        !== "preserved\n"
    ) {
      throw new Error("built bounded lock child scan changed overflow state");
    }
  }
} finally {
  fs.opendir = originalOpendir;
  fs.readdir = originalReaddir;
  fs.unlink = originalUnlink;
  await Promise.all([
    quarantinePath,
    disposalPath,
    cleanupDisposalPath
  ].map((target) => fs.rm(target, { recursive: true, force: true })));
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${AUDIT_LOCK_CHILD_SCAN_FILE}"

AUDIT_ACTIVE_LOCK_STABLE_SCAN_FILE="${SMOKE_ROOT}/audit/active-lock-stable-scan.jsonl"
echo "==> built audit active lock stable bounded observation"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
  acquireJsonlAuditFileLock
} = await import(pathToFileURL(process.argv[1]).href);
const { cleanupAuditLock } = await import(pathToFileURL(process.argv[2]).href);
const filePath = process.argv[3];
await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
const lock = await acquireJsonlAuditFileLock(filePath);
const extraName = "late-overflow-secret";
const extraPath = path.join(lock.lockPath, extraName);
const selectedLockPath = path.resolve(lock.lockPath);
const originalOpen = fs.open.bind(fs);
const originalOpendir = fs.opendir.bind(fs);
const originalReaddir = fs.readdir.bind(fs);
const originalUnlink = fs.unlink.bind(fs);
let injected = false;
let opendirCalls = 0;
let readCalls = 0;
let forbiddenReaddirCalls = 0;
let unlinkCalls = 0;
const resolveTarget = async (target) => {
  try {
    return path.resolve(await fs.realpath(target));
  } catch {
    return path.resolve(String(target));
  }
};
try {
  fs.open = async (target, ...args) => {
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
  };
  fs.opendir = async (target, options) => {
    const directory = await originalOpendir(target, options);
    if (await resolveTarget(target) === selectedLockPath) {
      opendirCalls += 1;
      const read = directory.read.bind(directory);
      directory.read = async () => {
        readCalls += 1;
        return read();
      };
    }
    return directory;
  };
  fs.readdir = async (target, options) => {
    if (await resolveTarget(target) === selectedLockPath) {
      forbiddenReaddirCalls += 1;
      throw new Error("built active lock scan used unbounded readdir");
    }
    return originalReaddir(target, options);
  };
  fs.unlink = async (target) => {
    unlinkCalls += 1;
    return originalUnlink(target);
  };
  const report = await cleanupAuditLock(
    { GOD_CODE_AUDIT_FILE: filePath },
    path.dirname(filePath)
  );
  const check = report.checks[0];
  const details = check?.details;
  const serialized = JSON.stringify(report);
  if (
    MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES !== 2
    || injected !== true
    || forbiddenReaddirCalls !== 0
    || opendirCalls !== 2
    || readCalls !== 5
    || unlinkCalls !== 0
    || report.ok !== false
    || check?.status !== "error"
    || !check?.message?.includes("state changed during inspection")
    || details?.coordination_lock_entry_count !== 1
    || details?.coordination_lock_entry_scan_count !== 1
    || details?.coordination_lock_entry_scan_limit !== 2
    || details?.coordination_lock_entry_scan_truncated !== false
    || details?.coordination_lock_owner_entry_exclusive !== false
    || details?.coordination_lock_state_changed !== true
    || details?.coordination_lock_owner_metadata_status !== undefined
    || details?.coordination_lock_owner_fingerprint !== undefined
    || details?.confirmation_required !== false
    || details?.removed !== false
    || serialized.includes(lock.ownerToken)
    || serialized.includes(extraName)
  ) {
    throw new Error("built active lock stable observation contract failed");
  }
  if (await fs.readFile(extraPath, "utf8") !== "preserved\n") {
    throw new Error("built active lock observation changed late child state");
  }
  await fs.access(lock.ownerPath);
} finally {
  fs.open = originalOpen;
  fs.opendir = originalOpendir;
  fs.readdir = originalReaddir;
  fs.unlink = originalUnlink;
  await lock.abandon();
  await fs.rm(lock.lockPath, { recursive: true, force: true });
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_ACTIVE_LOCK_STABLE_SCAN_FILE}"

AUDIT_ACTIVE_LOCK_TERMINAL_BINDING_FILE="${SMOKE_ROOT}/audit/active-lock-terminal-binding.jsonl"
echo "==> built audit active lock terminal directory binding"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { acquireJsonlAuditFileLock } = await import(
  pathToFileURL(process.argv[1]).href
);
const { cleanupAuditLock } = await import(pathToFileURL(process.argv[2]).href);
const filePath = process.argv[3];
await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
const lock = await acquireJsonlAuditFileLock(filePath);
const hiddenName = "terminal-hidden-secret";
const hiddenPath = `${lock.lockPath}.${hiddenName}`;
const originalLstat = fs.lstat.bind(fs);
const originalRename = fs.rename.bind(fs);
const originalSymlink = fs.symlink.bind(fs);
const originalUnlink = fs.unlink.bind(fs);
const originalRmdir = fs.rmdir.bind(fs);
let ownerPathReads = 0;
let lockPathReads = 0;
let injected = false;
let unlinkCalls = 0;
let rmdirCalls = 0;
try {
  fs.lstat = async (target, options) => {
    const resolvedTarget = path.resolve(String(target));
    if (resolvedTarget === path.resolve(lock.ownerPath)) {
      ownerPathReads += 1;
      if (ownerPathReads === 4) {
        await originalRename(lock.lockPath, hiddenPath);
        await originalSymlink(hiddenPath, lock.lockPath, "dir");
        injected = true;
      }
    } else if (resolvedTarget === path.resolve(lock.lockPath)) {
      lockPathReads += 1;
    }
    return originalLstat(target, options);
  };
  fs.unlink = async (target) => {
    unlinkCalls += 1;
    return originalUnlink(target);
  };
  fs.rmdir = async (target, options) => {
    rmdirCalls += 1;
    return originalRmdir(target, options);
  };
  const report = await cleanupAuditLock(
    { GOD_CODE_AUDIT_FILE: filePath },
    path.dirname(filePath)
  );
  const check = report.checks[0];
  const details = check?.details;
  const serialized = JSON.stringify(report);
  const lockStatus = await originalLstat(lock.lockPath);
  if (
    injected !== true
    || ownerPathReads !== 5
    || lockPathReads !== 5
    || !lockStatus.isSymbolicLink()
    || unlinkCalls !== 0
    || rmdirCalls !== 0
    || report.ok !== false
    || check?.status !== "error"
    || !check?.message?.includes("state changed during inspection")
    || details?.coordination_lock_entry_count !== 1
    || details?.coordination_lock_entry_scan_count !== 1
    || details?.coordination_lock_entry_scan_limit !== 2
    || details?.coordination_lock_entry_scan_truncated !== false
    || details?.coordination_lock_owner_entry_exclusive !== false
    || details?.coordination_lock_state_changed !== true
    || details?.coordination_lock_owner_metadata_status !== undefined
    || details?.coordination_lock_owner_fingerprint !== undefined
    || details?.confirmation_required !== false
    || details?.removed !== false
    || serialized.includes(lock.ownerToken)
    || serialized.includes(hiddenName)
  ) {
    throw new Error("built active lock terminal binding contract failed");
  }
  await fs.access(path.join(hiddenPath, "owner.json"));
} finally {
  fs.lstat = originalLstat;
  fs.unlink = originalUnlink;
  fs.rmdir = originalRmdir;
  try {
    if ((await originalLstat(lock.lockPath)).isSymbolicLink()) {
      await originalUnlink(lock.lockPath);
    }
  } catch {}
  try {
    await originalRename(hiddenPath, lock.lockPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  try {
    await lock.release();
  } catch (error) {
    await lock.abandon();
    await Promise.all([
      fs.rm(lock.lockPath, { recursive: true, force: true }),
      fs.rm(hiddenPath, { recursive: true, force: true })
    ]);
    throw error;
  } finally {
    await fs.rm(path.dirname(filePath), { recursive: true, force: true });
  }
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_ACTIVE_LOCK_TERMINAL_BINDING_FILE}"

AUDIT_ACTIVE_LOCK_GENERATION_FILE="${SMOKE_ROOT}/audit/active-lock-generation.jsonl"
echo "==> built audit active lock directory generation continuity"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
  acquireJsonlAuditFileLock
} = await import(pathToFileURL(process.argv[1]).href);
const { cleanupAuditLock } = await import(pathToFileURL(process.argv[2]).href);
const filePath = process.argv[3];
await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
const lock = await acquireJsonlAuditFileLock(filePath);
const extraName = "terminal-late-secret";
const extraPath = path.join(lock.lockPath, extraName);
const selectedLockPath = path.resolve(lock.lockPath);
const originalLstat = fs.lstat.bind(fs);
const originalOpen = fs.open.bind(fs);
const originalOpendir = fs.opendir.bind(fs);
const originalReaddir = fs.readdir.bind(fs);
const originalUnlink = fs.unlink.bind(fs);
const originalRmdir = fs.rmdir.bind(fs);
let ownerPathReads = 0;
let lockPathReads = 0;
let opendirCalls = 0;
let readCalls = 0;
let forbiddenReaddirCalls = 0;
let unlinkCalls = 0;
let rmdirCalls = 0;
let injected = false;
const resolveTarget = async (target) => {
  try {
    return path.resolve(await fs.realpath(target));
  } catch {
    return path.resolve(String(target));
  }
};
try {
  fs.lstat = async (target, options) => {
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
    } else if (resolvedTarget === selectedLockPath) {
      lockPathReads += 1;
    }
    return originalLstat(target, options);
  };
  fs.opendir = async (target, options) => {
    const directory = await originalOpendir(target, options);
    if (await resolveTarget(target) === selectedLockPath) {
      opendirCalls += 1;
      const read = directory.read.bind(directory);
      directory.read = async () => {
        readCalls += 1;
        return read();
      };
    }
    return directory;
  };
  fs.readdir = async (target, options) => {
    if (await resolveTarget(target) === selectedLockPath) {
      forbiddenReaddirCalls += 1;
      throw new Error("built active lock generation used unbounded readdir");
    }
    return originalReaddir(target, options);
  };
  fs.unlink = async (target) => {
    unlinkCalls += 1;
    return originalUnlink(target);
  };
  fs.rmdir = async (target, options) => {
    rmdirCalls += 1;
    return originalRmdir(target, options);
  };
  const report = await cleanupAuditLock(
    { GOD_CODE_AUDIT_FILE: filePath },
    path.dirname(filePath)
  );
  const check = report.checks[0];
  const details = check?.details;
  const serialized = JSON.stringify(report);
  if (
    MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES !== 2
    || injected !== true
    || ownerPathReads !== 5
    || lockPathReads !== 5
    || opendirCalls !== 2
    || readCalls !== 4
    || forbiddenReaddirCalls !== 0
    || unlinkCalls !== 0
    || rmdirCalls !== 0
    || report.ok !== false
    || check?.status !== "error"
    || !check?.message?.includes("state changed during inspection")
    || details?.coordination_lock_entry_count !== 1
    || details?.coordination_lock_entry_scan_count !== 1
    || details?.coordination_lock_entry_scan_limit !== 2
    || details?.coordination_lock_entry_scan_truncated !== false
    || details?.coordination_lock_owner_entry_exclusive !== false
    || details?.coordination_lock_state_changed !== true
    || details?.coordination_lock_owner_metadata_status !== undefined
    || details?.coordination_lock_owner_fingerprint !== undefined
    || details?.confirmation_required !== false
    || details?.removed !== false
    || serialized.includes(lock.ownerToken)
    || serialized.includes(extraName)
  ) {
    throw new Error("built active lock generation continuity contract failed");
  }
  if (await fs.readFile(extraPath, "utf8") !== "preserved\n") {
    throw new Error("built active lock generation changed late child state");
  }
} finally {
  fs.lstat = originalLstat;
  fs.opendir = originalOpendir;
  fs.readdir = originalReaddir;
  fs.unlink = originalUnlink;
  fs.rmdir = originalRmdir;
  await fs.rm(extraPath, { force: true });
  try {
    await lock.release();
  } catch (error) {
    await lock.abandon();
    await fs.rm(lock.lockPath, { recursive: true, force: true });
    throw error;
  } finally {
    await fs.rm(path.dirname(filePath), { recursive: true, force: true });
  }
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_ACTIVE_LOCK_GENERATION_FILE}"

AUDIT_LOCK_RESIDUE_STABLE_AUTHORITY_FILE="${SMOKE_ROOT}/audit/residue-stable-authority.jsonl"
echo "==> built audit lock residue stable authority observation"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES,
  acquireJsonlAuditFileLock,
  getJsonlAuditLockDisposalPath,
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockQuarantinePath
} = await import(pathToFileURL(process.argv[1]).href);
const {
  cleanupAuditLockDisposal,
  cleanupAuditLockQuarantine
} = await import(pathToFileURL(process.argv[2]).href);
const filePath = process.argv[3];
await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
const lock = await acquireJsonlAuditFileLock(filePath);
const quarantineId = "Rq0001";
const quarantinePath = getJsonlAuditLockQuarantinePath(
  filePath,
  quarantineId
);
const quarantineOwnerPath = getJsonlAuditLockOwnerPath(quarantinePath);
const disposalQuarantineId = "Rd0001";
const disposalId = "Re0001";
const disposalPath = getJsonlAuditLockDisposalPath(
  filePath,
  disposalQuarantineId,
  disposalId
);
const disposalOwnerPath = getJsonlAuditLockOwnerPath(disposalPath);
const quarantineReplacementToken = "00000000-0000-4000-8000-000000000021";
const disposalReplacementToken = "00000000-0000-4000-8000-000000000022";
await fs.mkdir(quarantinePath, { mode: 0o700 });
await fs.copyFile(lock.ownerPath, quarantineOwnerPath);
await fs.mkdir(disposalPath, { mode: 0o700 });
await fs.copyFile(lock.ownerPath, disposalOwnerPath);
const selected = new Map([
  [path.resolve(quarantinePath), {
    ownerPath: quarantineOwnerPath,
    replacementToken: quarantineReplacementToken,
    scans: 0,
    reads: 0
  }],
  [path.resolve(disposalPath), {
    ownerPath: disposalOwnerPath,
    replacementToken: disposalReplacementToken,
    scans: 0,
    reads: 0
  }]
]);
const originalOpendir = fs.opendir.bind(fs);
const originalReaddir = fs.readdir.bind(fs);
const originalUnlink = fs.unlink.bind(fs);
const originalRmdir = fs.rmdir.bind(fs);
let forbiddenReaddirCalls = 0;
let unlinkCalls = 0;
let rmdirCalls = 0;
const resolveTarget = async (target) => {
  try {
    return path.resolve(await fs.realpath(target));
  } catch {
    return path.resolve(String(target));
  }
};
try {
  fs.opendir = async (target, options) => {
    const resolvedTarget = await resolveTarget(target);
    const state = selected.get(resolvedTarget);
    if (state !== undefined) {
      state.scans += 1;
      if (state.scans === 2) {
        const persisted = JSON.parse(await fs.readFile(state.ownerPath, "utf8"));
        persisted.owner_token = state.replacementToken;
        await fs.writeFile(
          state.ownerPath,
          `${JSON.stringify(persisted)}\n`,
          { encoding: "utf8" }
        );
      }
    }
    const directory = await originalOpendir(target, options);
    if (state !== undefined) {
      const read = directory.read.bind(directory);
      directory.read = async () => {
        state.reads += 1;
        return read();
      };
    }
    return directory;
  };
  fs.readdir = async (target, options) => {
    if (selected.has(await resolveTarget(target))) {
      forbiddenReaddirCalls += 1;
      throw new Error("built residue observation used unbounded readdir");
    }
    return originalReaddir(target, options);
  };
  fs.unlink = async (target) => {
    unlinkCalls += 1;
    return originalUnlink(target);
  };
  fs.rmdir = async (target, options) => {
    rmdirCalls += 1;
    return originalRmdir(target, options);
  };
  const quarantineReport = await cleanupAuditLockQuarantine(
    { GOD_CODE_AUDIT_FILE: filePath },
    path.dirname(filePath),
    quarantineId
  );
  const disposalReport = await cleanupAuditLockDisposal(
    { GOD_CODE_AUDIT_FILE: filePath },
    path.dirname(filePath),
    disposalQuarantineId,
    disposalId
  );
  const quarantineCheck = quarantineReport.checks[0];
  const quarantineDetails = quarantineCheck?.details;
  const disposalCheck = disposalReport.checks[0];
  const disposalDetails = disposalCheck?.details;
  const serialized = JSON.stringify({ quarantineReport, disposalReport });
  const quarantineState = selected.get(path.resolve(quarantinePath));
  const disposalState = selected.get(path.resolve(disposalPath));
  if (
    MAX_JSONL_AUDIT_LOCK_CHILD_SCAN_ENTRIES !== 2
    || quarantineState?.scans !== 2
    || quarantineState?.reads !== 4
    || disposalState?.scans !== 2
    || disposalState?.reads !== 4
    || forbiddenReaddirCalls !== 0
    || unlinkCalls !== 0
    || rmdirCalls !== 0
    || quarantineReport.ok !== false
    || quarantineCheck?.status !== "error"
    || !quarantineCheck?.message?.includes("only owner_only")
    || quarantineDetails?.quarantine_layout !== "unknown"
    || quarantineDetails?.state_changed !== true
    || quarantineDetails?.owner_fingerprint !== undefined
    || quarantineDetails?.confirmation_required !== false
    || quarantineDetails?.removed !== false
    || disposalReport.ok !== false
    || disposalCheck?.status !== "error"
    || !disposalCheck?.message?.includes("only owner_only")
    || disposalDetails?.source_quarantine_exists !== false
    || disposalDetails?.disposal_layout !== "unknown"
    || disposalDetails?.state_changed !== true
    || disposalDetails?.owner_fingerprint !== undefined
    || disposalDetails?.confirmation_required !== false
    || disposalDetails?.removed !== false
    || serialized.includes(lock.ownerToken)
    || serialized.includes(quarantineReplacementToken)
    || serialized.includes(disposalReplacementToken)
  ) {
    throw new Error("built lock residue stable authority contract failed");
  }
  const quarantineOwner = JSON.parse(
    await fs.readFile(quarantineOwnerPath, "utf8")
  );
  const disposalOwner = JSON.parse(
    await fs.readFile(disposalOwnerPath, "utf8")
  );
  if (
    quarantineOwner.owner_token !== quarantineReplacementToken
    || disposalOwner.owner_token !== disposalReplacementToken
  ) {
    throw new Error("built residue observation changed rewritten owner state");
  }
} finally {
  fs.opendir = originalOpendir;
  fs.readdir = originalReaddir;
  fs.unlink = originalUnlink;
  fs.rmdir = originalRmdir;
  await lock.abandon();
  await fs.rm(lock.lockPath, { recursive: true, force: true });
  await fs.rm(quarantinePath, { recursive: true, force: true });
  await fs.rm(disposalPath, { recursive: true, force: true });
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_LOCK_RESIDUE_STABLE_AUTHORITY_FILE}"

AUDIT_DISPOSAL_SOURCE_TERMINAL_FILE="${SMOKE_ROOT}/audit/disposal-source-terminal.jsonl"
echo "==> built audit disposal source quarantine terminal continuity"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  acquireJsonlAuditFileLock,
  getJsonlAuditLockDisposalPath,
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockQuarantinePath
} = await import(pathToFileURL(process.argv[1]).href);
const {
  cleanupAuditEmptyLockDisposal,
  cleanupAuditLockDisposal
} = await import(pathToFileURL(process.argv[2]).href);
const filePath = process.argv[3];
await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
const lock = await acquireJsonlAuditFileLock(filePath);
const ownerQuarantineId = "Rs0001";
const ownerDisposalId = "Rt0001";
const ownerSourcePath = getJsonlAuditLockQuarantinePath(
  filePath,
  ownerQuarantineId
);
const ownerDisposalPath = getJsonlAuditLockDisposalPath(
  filePath,
  ownerQuarantineId,
  ownerDisposalId
);
const ownerPath = getJsonlAuditLockOwnerPath(ownerDisposalPath);
const emptyQuarantineId = "Ru0001";
const emptyDisposalId = "Rv0001";
const emptySourcePath = getJsonlAuditLockQuarantinePath(
  filePath,
  emptyQuarantineId
);
const emptyDisposalPath = getJsonlAuditLockDisposalPath(
  filePath,
  emptyQuarantineId,
  emptyDisposalId
);
await fs.mkdir(ownerDisposalPath, { mode: 0o700 });
await fs.copyFile(lock.ownerPath, ownerPath);
await fs.mkdir(emptyDisposalPath, { mode: 0o700 });
const sourceStates = new Map([
  [path.resolve(ownerSourcePath), {
    path: ownerSourcePath,
    reads: 0,
    created: false
  }],
  [path.resolve(emptySourcePath), {
    path: emptySourcePath,
    reads: 0,
    created: false
  }]
]);
const disposalStates = new Map([
  [path.resolve(ownerDisposalPath), { scans: 0, reads: 0 }],
  [path.resolve(emptyDisposalPath), { scans: 0, reads: 0 }]
]);
const originalLstat = fs.lstat.bind(fs);
const originalOpendir = fs.opendir.bind(fs);
const originalReaddir = fs.readdir.bind(fs);
const originalUnlink = fs.unlink.bind(fs);
const originalRmdir = fs.rmdir.bind(fs);
let sourceOpendirCalls = 0;
let forbiddenReaddirCalls = 0;
let unlinkCalls = 0;
let rmdirCalls = 0;
const resolveTarget = async (target) => {
  try {
    return path.resolve(await fs.realpath(target));
  } catch {
    return path.resolve(String(target));
  }
};
try {
  fs.lstat = async (target, options) => {
    const state = sourceStates.get(path.resolve(String(target)));
    if (state !== undefined) {
      state.reads += 1;
      if (state.reads === 2) {
        await fs.mkdir(state.path, { mode: 0o700 });
        state.created = true;
      }
    }
    return originalLstat(target, options);
  };
  fs.opendir = async (target, options) => {
    const resolvedTarget = await resolveTarget(target);
    if (sourceStates.has(resolvedTarget)) {
      sourceOpendirCalls += 1;
      throw new Error("built terminal source observation scanned late source");
    }
    const directory = await originalOpendir(target, options);
    const state = disposalStates.get(resolvedTarget);
    if (state !== undefined) {
      state.scans += 1;
      const read = directory.read.bind(directory);
      directory.read = async () => {
        state.reads += 1;
        return read();
      };
    }
    return directory;
  };
  fs.readdir = async (target, options) => {
    const resolvedTarget = await resolveTarget(target);
    if (
      disposalStates.has(resolvedTarget)
      || sourceStates.has(resolvedTarget)
    ) {
      forbiddenReaddirCalls += 1;
      throw new Error("built terminal source observation used readdir");
    }
    return originalReaddir(target, options);
  };
  fs.unlink = async (target) => {
    unlinkCalls += 1;
    return originalUnlink(target);
  };
  fs.rmdir = async (target, options) => {
    rmdirCalls += 1;
    return originalRmdir(target, options);
  };
  const ownerReport = await cleanupAuditLockDisposal(
    { GOD_CODE_AUDIT_FILE: filePath },
    path.dirname(filePath),
    ownerQuarantineId,
    ownerDisposalId
  );
  const emptyReport = await cleanupAuditEmptyLockDisposal(
    { GOD_CODE_AUDIT_FILE: filePath },
    path.dirname(filePath),
    emptyQuarantineId,
    emptyDisposalId
  );
  const ownerCheck = ownerReport.checks[0];
  const ownerDetails = ownerCheck?.details;
  const emptyCheck = emptyReport.checks[0];
  const emptyDetails = emptyCheck?.details;
  const ownerSourceState = sourceStates.get(path.resolve(ownerSourcePath));
  const emptySourceState = sourceStates.get(path.resolve(emptySourcePath));
  const ownerDisposalState = disposalStates.get(path.resolve(ownerDisposalPath));
  const emptyDisposalState = disposalStates.get(path.resolve(emptyDisposalPath));
  const serialized = JSON.stringify({ ownerReport, emptyReport });
  if (
    ownerSourceState?.reads !== 2
    || ownerSourceState?.created !== true
    || emptySourceState?.reads !== 2
    || emptySourceState?.created !== true
    || ownerDisposalState?.scans !== 2
    || ownerDisposalState?.reads !== 4
    || emptyDisposalState?.scans !== 4
    || emptyDisposalState?.reads !== 4
    || sourceOpendirCalls !== 0
    || forbiddenReaddirCalls !== 0
    || unlinkCalls !== 0
    || rmdirCalls !== 0
    || ownerReport.ok !== false
    || ownerCheck?.status !== "error"
    || !ownerCheck?.message?.includes("source quarantine must be absent")
    || ownerDetails?.source_quarantine_exists !== true
    || ownerDetails?.source_quarantine_entry_type !== "directory"
    || ownerDetails?.source_quarantine_layout !== "unknown"
    || ownerDetails?.source_quarantine_state_changed !== true
    || ownerDetails?.disposal_layout !== "unknown"
    || ownerDetails?.state_changed !== true
    || ownerDetails?.owner_fingerprint !== undefined
    || ownerDetails?.confirmation_required !== false
    || ownerDetails?.removed !== false
    || emptyReport.ok !== false
    || emptyCheck?.status !== "error"
    || !emptyCheck?.message?.includes("source quarantine must be absent")
    || emptyDetails?.source_quarantine_exists !== true
    || emptyDetails?.source_quarantine_entry_type !== "directory"
    || emptyDetails?.source_quarantine_layout !== "unknown"
    || emptyDetails?.source_quarantine_state_changed !== true
    || emptyDetails?.disposal_layout !== "unknown"
    || emptyDetails?.state_changed !== true
    || emptyDetails?.empty_directory_fingerprint !== undefined
    || emptyDetails?.confirmation_required !== false
    || emptyDetails?.removed !== false
    || serialized.includes(lock.ownerToken)
    || serialized.includes("owner_fingerprint")
    || serialized.includes("empty_directory_fingerprint")
  ) {
    throw new Error("built disposal source terminal continuity contract failed");
  }
  await fs.access(ownerSourcePath);
  await fs.access(emptySourcePath);
  await fs.access(ownerPath);
  if ((await originalReaddir(emptyDisposalPath)).length !== 0) {
    throw new Error("built terminal source observation changed empty disposal");
  }
} finally {
  fs.lstat = originalLstat;
  fs.opendir = originalOpendir;
  fs.readdir = originalReaddir;
  fs.unlink = originalUnlink;
  fs.rmdir = originalRmdir;
  await lock.abandon();
  await fs.rm(lock.lockPath, { recursive: true, force: true });
  await fs.rm(ownerSourcePath, { recursive: true, force: true });
  await fs.rm(ownerDisposalPath, { recursive: true, force: true });
  await fs.rm(emptySourcePath, { recursive: true, force: true });
  await fs.rm(emptyDisposalPath, { recursive: true, force: true });
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_DISPOSAL_SOURCE_TERMINAL_FILE}"

AUDIT_TERMINAL_OWNER_GENERATION_FILE="${SMOKE_ROOT}/audit/terminal-owner-generation.jsonl"
echo "==> built audit terminal owner file generation continuity"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  acquireJsonlAuditFileLock,
  getJsonlAuditLockDisposalPath,
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockQuarantinePath
} = await import(pathToFileURL(process.argv[1]).href);
const {
  cleanupAuditLock,
  cleanupAuditLockDisposal,
  cleanupAuditLockQuarantine
} = await import(pathToFileURL(process.argv[2]).href);
const filePath = process.argv[3];
const activeFilePath = `${filePath}.active`;
const residueFilePath = `${filePath}.residue`;
await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
const activeLock = await acquireJsonlAuditFileLock(activeFilePath);
const residueLock = await acquireJsonlAuditFileLock(residueFilePath);
const quarantineId = "Rw0001";
const quarantinePath = getJsonlAuditLockQuarantinePath(
  residueFilePath,
  quarantineId
);
const quarantineOwnerPath = getJsonlAuditLockOwnerPath(quarantinePath);
const disposalQuarantineId = "Rx0001";
const disposalId = "Ry0001";
const disposalSourcePath = getJsonlAuditLockQuarantinePath(
  residueFilePath,
  disposalQuarantineId
);
const disposalPath = getJsonlAuditLockDisposalPath(
  residueFilePath,
  disposalQuarantineId,
  disposalId
);
const disposalOwnerPath = getJsonlAuditLockOwnerPath(disposalPath);
const activeReplacementToken = "00000000-0000-4000-8000-000000000051";
const quarantineReplacementToken = "00000000-0000-4000-8000-000000000052";
const disposalReplacementToken = "00000000-0000-4000-8000-000000000053";
await fs.mkdir(quarantinePath, { mode: 0o700 });
await fs.copyFile(residueLock.ownerPath, quarantineOwnerPath);
await fs.mkdir(disposalPath, { mode: 0o700 });
await fs.copyFile(residueLock.ownerPath, disposalOwnerPath);
const pathStates = new Map([
  [path.resolve(activeLock.lockPath), {
    ownerPath: activeLock.ownerPath,
    replacementToken: activeReplacementToken,
    targetRead: 5,
    reads: 0,
    rewritten: false
  }],
  [path.resolve(quarantinePath), {
    ownerPath: quarantineOwnerPath,
    replacementToken: quarantineReplacementToken,
    targetRead: 5,
    reads: 0,
    rewritten: false
  }],
  [path.resolve(disposalSourcePath), {
    ownerPath: disposalOwnerPath,
    replacementToken: disposalReplacementToken,
    targetRead: 2,
    reads: 0,
    rewritten: false
  }]
]);
const selectedDirectories = new Map([
  [path.resolve(activeLock.lockPath), { scans: 0, reads: 0 }],
  [path.resolve(quarantinePath), { scans: 0, reads: 0 }],
  [path.resolve(disposalPath), { scans: 0, reads: 0 }]
]);
const originalLstat = fs.lstat.bind(fs);
const originalOpendir = fs.opendir.bind(fs);
const originalReaddir = fs.readdir.bind(fs);
const originalUnlink = fs.unlink.bind(fs);
const originalRmdir = fs.rmdir.bind(fs);
let forbiddenReaddirCalls = 0;
let unlinkCalls = 0;
let rmdirCalls = 0;
const resolveTarget = async (target) => {
  try {
    return path.resolve(await fs.realpath(target));
  } catch {
    return path.resolve(String(target));
  }
};
try {
  fs.lstat = async (target, options) => {
    const state = pathStates.get(path.resolve(String(target)));
    if (state !== undefined) {
      state.reads += 1;
      if (state.reads === state.targetRead) {
        const persisted = JSON.parse(await fs.readFile(state.ownerPath, "utf8"));
        persisted.owner_token = state.replacementToken;
        await fs.writeFile(
          state.ownerPath,
          `${JSON.stringify(persisted)}\n`,
          { encoding: "utf8" }
        );
        state.rewritten = true;
      }
    }
    return originalLstat(target, options);
  };
  fs.opendir = async (target, options) => {
    const resolvedTarget = await resolveTarget(target);
    const directory = await originalOpendir(target, options);
    const state = selectedDirectories.get(resolvedTarget);
    if (state !== undefined) {
      state.scans += 1;
      const read = directory.read.bind(directory);
      directory.read = async () => {
        state.reads += 1;
        return read();
      };
    }
    return directory;
  };
  fs.readdir = async (target, options) => {
    if (selectedDirectories.has(await resolveTarget(target))) {
      forbiddenReaddirCalls += 1;
      throw new Error("built terminal owner observation used readdir");
    }
    return originalReaddir(target, options);
  };
  fs.unlink = async (target) => {
    unlinkCalls += 1;
    return originalUnlink(target);
  };
  fs.rmdir = async (target, options) => {
    rmdirCalls += 1;
    return originalRmdir(target, options);
  };

  const activeReport = await cleanupAuditLock(
    { GOD_CODE_AUDIT_FILE: activeFilePath },
    path.dirname(activeFilePath)
  );
  const quarantineReport = await cleanupAuditLockQuarantine(
    { GOD_CODE_AUDIT_FILE: residueFilePath },
    path.dirname(residueFilePath),
    quarantineId
  );
  const disposalReport = await cleanupAuditLockDisposal(
    { GOD_CODE_AUDIT_FILE: residueFilePath },
    path.dirname(residueFilePath),
    disposalQuarantineId,
    disposalId
  );
  const activeCheck = activeReport.checks[0];
  const activeDetails = activeCheck?.details;
  const quarantineCheck = quarantineReport.checks[0];
  const quarantineDetails = quarantineCheck?.details;
  const disposalCheck = disposalReport.checks[0];
  const disposalDetails = disposalCheck?.details;
  const activePathState = pathStates.get(path.resolve(activeLock.lockPath));
  const quarantinePathState = pathStates.get(path.resolve(quarantinePath));
  const disposalSourceState = pathStates.get(path.resolve(disposalSourcePath));
  const activeDirectoryState = selectedDirectories.get(
    path.resolve(activeLock.lockPath)
  );
  const quarantineDirectoryState = selectedDirectories.get(
    path.resolve(quarantinePath)
  );
  const disposalDirectoryState = selectedDirectories.get(
    path.resolve(disposalPath)
  );
  const serialized = JSON.stringify({
    activeReport,
    quarantineReport,
    disposalReport
  });
  const secrets = [
    activeLock.ownerToken,
    residueLock.ownerToken,
    activeReplacementToken,
    quarantineReplacementToken,
    disposalReplacementToken
  ];
  if (
    activePathState?.reads !== 5
    || activePathState?.rewritten !== true
    || quarantinePathState?.reads !== 5
    || quarantinePathState?.rewritten !== true
    || disposalSourceState?.reads !== 2
    || disposalSourceState?.rewritten !== true
    || activeDirectoryState?.scans !== 2
    || activeDirectoryState?.reads !== 4
    || quarantineDirectoryState?.scans !== 2
    || quarantineDirectoryState?.reads !== 4
    || disposalDirectoryState?.scans !== 2
    || disposalDirectoryState?.reads !== 4
    || forbiddenReaddirCalls !== 0
    || unlinkCalls !== 0
    || rmdirCalls !== 0
    || activeReport.ok !== false
    || activeCheck?.status !== "error"
    || !activeCheck?.message?.includes("state changed during inspection")
    || activeDetails?.coordination_lock_state_changed !== true
    || activeDetails?.coordination_lock_owner_fingerprint !== undefined
    || activeDetails?.confirmation_required !== false
    || activeDetails?.removed !== false
    || quarantineReport.ok !== false
    || quarantineCheck?.status !== "error"
    || !quarantineCheck?.message?.includes("only owner_only")
    || quarantineDetails?.quarantine_layout !== "unknown"
    || quarantineDetails?.state_changed !== true
    || quarantineDetails?.owner_fingerprint !== undefined
    || quarantineDetails?.confirmation_required !== false
    || quarantineDetails?.removed !== false
    || disposalReport.ok !== false
    || disposalCheck?.status !== "error"
    || !disposalCheck?.message?.includes("only owner_only")
    || disposalDetails?.source_quarantine_exists !== false
    || disposalDetails?.disposal_layout !== "unknown"
    || disposalDetails?.state_changed !== true
    || disposalDetails?.owner_fingerprint !== undefined
    || disposalDetails?.confirmation_required !== false
    || disposalDetails?.removed !== false
    || secrets.some((secret) => serialized.includes(secret))
  ) {
    throw new Error("built terminal owner generation continuity contract failed");
  }
  const persistedActiveOwner = JSON.parse(
    await fs.readFile(activeLock.ownerPath, "utf8")
  );
  const persistedQuarantineOwner = JSON.parse(
    await fs.readFile(quarantineOwnerPath, "utf8")
  );
  const persistedDisposalOwner = JSON.parse(
    await fs.readFile(disposalOwnerPath, "utf8")
  );
  if (
    persistedActiveOwner.owner_token !== activeReplacementToken
    || persistedQuarantineOwner.owner_token !== quarantineReplacementToken
    || persistedDisposalOwner.owner_token !== disposalReplacementToken
  ) {
    throw new Error("built terminal owner generation rewrite did not persist");
  }
} finally {
  fs.lstat = originalLstat;
  fs.opendir = originalOpendir;
  fs.readdir = originalReaddir;
  fs.unlink = originalUnlink;
  fs.rmdir = originalRmdir;
  await Promise.all([activeLock.abandon(), residueLock.abandon()]);
  await fs.rm(activeLock.lockPath, { recursive: true, force: true });
  await fs.rm(residueLock.lockPath, { recursive: true, force: true });
  await fs.rm(quarantinePath, { recursive: true, force: true });
  await fs.rm(disposalSourcePath, { recursive: true, force: true });
  await fs.rm(disposalPath, { recursive: true, force: true });
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_TERMINAL_OWNER_GENERATION_FILE}"

AUDIT_CANDIDATE_BOUND_OWNER_FILE="${SMOKE_ROOT}/audit/candidate-bound-owner.jsonl"
echo "==> built audit candidate-bound owner confirmation fingerprint"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  acquireJsonlAuditFileLock,
  getJsonlAuditLockDisposalPath,
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockQuarantinePath,
  inspectJsonlAuditFileLock,
  inspectJsonlAuditLockDisposal,
  inspectJsonlAuditLockQuarantine
} = await import(pathToFileURL(process.argv[1]).href);
const {
  cleanupAuditLock,
  cleanupAuditLockDisposal,
  cleanupAuditLockQuarantine,
  recoverAuditLockQuarantine
} = await import(pathToFileURL(process.argv[2]).href);
const filePath = process.argv[3];
const activeFilePath = `${filePath}.active`;
const quarantineFilePath = `${filePath}.quarantine`;
const disposalFilePath = `${filePath}.disposal`;
const recoveryFilePath = `${filePath}.recovery`;
await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
const lock = await acquireJsonlAuditFileLock(activeFilePath);
const quarantineId = "Vq9001";
const disposalQuarantineId = "Vd9001";
const disposalId = "Ve9001";
const recoveryId = "Vr9001";
const quarantinePath = getJsonlAuditLockQuarantinePath(
  quarantineFilePath,
  quarantineId
);
const disposalPath = getJsonlAuditLockDisposalPath(
  disposalFilePath,
  disposalQuarantineId,
  disposalId
);
const recoveryPath = getJsonlAuditLockQuarantinePath(
  recoveryFilePath,
  recoveryId
);
const recoveryLockPath = path.join(recoveryPath, "lock");
const movedActivePath = `${lock.lockPath}.phase571-original`;
const movedQuarantinePath = `${quarantinePath}.phase571-original`;
const movedDisposalPath = `${disposalPath}.phase571-original`;
const movedRecoveryPath = `${recoveryPath}.phase571-original`;
const movedRecoveryLockPath = path.join(movedRecoveryPath, "lock");
await fs.mkdir(quarantinePath, { mode: 0o700 });
await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(quarantinePath));
await fs.mkdir(disposalPath, { mode: 0o700 });
await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(disposalPath));
await fs.mkdir(recoveryLockPath, { recursive: true, mode: 0o700 });
await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(recoveryLockPath));
const envFor = (target) => ({ GOD_CODE_AUDIT_FILE: target });
const activeDryRun = await cleanupAuditLock(
  envFor(activeFilePath),
  path.dirname(activeFilePath)
);
const quarantineDryRun = await cleanupAuditLockQuarantine(
  envFor(quarantineFilePath),
  path.dirname(quarantineFilePath),
  quarantineId
);
const disposalDryRun = await cleanupAuditLockDisposal(
  envFor(disposalFilePath),
  path.dirname(disposalFilePath),
  disposalQuarantineId,
  disposalId
);
const recoveryDryRun = await recoverAuditLockQuarantine(
  envFor(recoveryFilePath),
  path.dirname(recoveryFilePath),
  recoveryId
);
const fingerprints = [
  activeDryRun.checks[0]?.details?.coordination_lock_owner_fingerprint,
  quarantineDryRun.checks[0]?.details?.owner_fingerprint,
  disposalDryRun.checks[0]?.details?.owner_fingerprint,
  recoveryDryRun.checks[0]?.details?.owner_fingerprint
];
if (
  [activeDryRun, quarantineDryRun, disposalDryRun, recoveryDryRun]
    .some((report) => report.ok !== true)
  || fingerprints.some((fingerprint) =>
    typeof fingerprint !== "string" || !/^[0-9a-f]{32}$/.test(fingerprint)
  )
  || new Set(fingerprints).size !== fingerprints.length
) {
  throw new Error("built candidate-bound owner dry-run contract failed");
}
await fs.rename(lock.lockPath, movedActivePath);
await fs.mkdir(lock.lockPath, { mode: 0o700 });
await fs.copyFile(
  getJsonlAuditLockOwnerPath(movedActivePath),
  getJsonlAuditLockOwnerPath(lock.lockPath)
);
await fs.rename(quarantinePath, movedQuarantinePath);
await fs.mkdir(quarantinePath, { mode: 0o700 });
await fs.copyFile(
  getJsonlAuditLockOwnerPath(movedQuarantinePath),
  getJsonlAuditLockOwnerPath(quarantinePath)
);
await fs.rename(disposalPath, movedDisposalPath);
await fs.mkdir(disposalPath, { mode: 0o700 });
await fs.copyFile(
  getJsonlAuditLockOwnerPath(movedDisposalPath),
  getJsonlAuditLockOwnerPath(disposalPath)
);
await fs.rename(recoveryPath, movedRecoveryPath);
await fs.mkdir(recoveryLockPath, { recursive: true, mode: 0o700 });
await fs.copyFile(
  getJsonlAuditLockOwnerPath(movedRecoveryLockPath),
  getJsonlAuditLockOwnerPath(recoveryLockPath)
);
const replacementFingerprints = [
  (await inspectJsonlAuditFileLock(activeFilePath)).ownerFingerprint,
  (await inspectJsonlAuditLockQuarantine(
    quarantineFilePath,
    quarantineId
  )).ownerFingerprint,
  (await inspectJsonlAuditLockDisposal(
    disposalFilePath,
    disposalQuarantineId,
    disposalId
  )).ownerFingerprint,
  (await inspectJsonlAuditLockQuarantine(
    recoveryFilePath,
    recoveryId
  )).ownerFingerprint
];
if (replacementFingerprints.some((fingerprint, index) =>
  typeof fingerprint !== "string"
  || !/^[0-9a-f]{32}$/.test(fingerprint)
  || fingerprint === fingerprints[index]
)) {
  throw new Error("built candidate replacement fingerprint did not change");
}
const originalMkdir = fs.mkdir.bind(fs);
const originalRename = fs.rename.bind(fs);
const originalUnlink = fs.unlink.bind(fs);
const originalRmdir = fs.rmdir.bind(fs);
const mutationCalls = { mkdir: 0, rename: 0, unlink: 0, rmdir: 0 };
try {
  fs.mkdir = async (...args) => {
    mutationCalls.mkdir += 1;
    return originalMkdir(...args);
  };
  fs.rename = async (...args) => {
    mutationCalls.rename += 1;
    return originalRename(...args);
  };
  fs.unlink = async (...args) => {
    mutationCalls.unlink += 1;
    return originalUnlink(...args);
  };
  fs.rmdir = async (...args) => {
    mutationCalls.rmdir += 1;
    return originalRmdir(...args);
  };
  const activeMismatch = await cleanupAuditLock(
    envFor(activeFilePath),
    path.dirname(activeFilePath),
    { dryRun: false, expectedOwnerFingerprint: fingerprints[0] }
  );
  const quarantineMismatch = await cleanupAuditLockQuarantine(
    envFor(quarantineFilePath),
    path.dirname(quarantineFilePath),
    quarantineId,
    { dryRun: false, expectedOwnerFingerprint: fingerprints[1] }
  );
  const disposalMismatch = await cleanupAuditLockDisposal(
    envFor(disposalFilePath),
    path.dirname(disposalFilePath),
    disposalQuarantineId,
    disposalId,
    { dryRun: false, expectedOwnerFingerprint: fingerprints[2] }
  );
  const recoveryMismatch = await recoverAuditLockQuarantine(
    envFor(recoveryFilePath),
    path.dirname(recoveryFilePath),
    recoveryId,
    { dryRun: false, expectedOwnerFingerprint: fingerprints[3] }
  );
  const mismatchReports = [
    activeMismatch,
    quarantineMismatch,
    disposalMismatch,
    recoveryMismatch
  ];
  const mismatchSerialized = JSON.stringify(mismatchReports);
  if (
    mismatchReports.some((report) =>
      report.ok !== false
      || report.checks[0]?.status !== "error"
      || report.checks[0]?.details?.owner_fingerprint_matches !== false
    )
    || activeMismatch.checks[0]?.details?.removed !== false
    || quarantineMismatch.checks[0]?.details?.removed !== false
    || disposalMismatch.checks[0]?.details?.removed !== false
    || recoveryMismatch.checks[0]?.details?.recovered !== false
    || Object.values(mutationCalls).some((count) => count !== 0)
    || mismatchSerialized.includes(lock.ownerToken)
    || replacementFingerprints.some((fingerprint) =>
      mismatchSerialized.includes(fingerprint)
    )
    || ["owner_token", "inode", "ctime_ns", "birthtime_ns", "mtime_ns"]
      .some((field) => mismatchSerialized.includes(field))
  ) {
    throw new Error("built candidate-bound owner mismatch contract failed");
  }
  for (const candidatePath of [
    lock.lockPath,
    movedActivePath,
    quarantinePath,
    movedQuarantinePath,
    disposalPath,
    movedDisposalPath,
    recoveryPath,
    movedRecoveryPath
  ]) {
    if (!(await fs.stat(candidatePath)).isDirectory()) {
      throw new Error("built candidate-bound owner state was not preserved");
    }
  }
} finally {
  fs.mkdir = originalMkdir;
  fs.rename = originalRename;
  fs.unlink = originalUnlink;
  fs.rmdir = originalRmdir;
  await lock.abandon();
  await Promise.all([
    lock.lockPath,
    movedActivePath,
    quarantinePath,
    movedQuarantinePath,
    disposalPath,
    movedDisposalPath,
    recoveryPath,
    movedRecoveryPath
  ].map((target) => fs.rm(target, { recursive: true, force: true })));
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_CANDIDATE_BOUND_OWNER_FILE}"

AUDIT_RUNTIME_CONFIRMED_FINGERPRINT_FILE="${SMOKE_ROOT}/audit/runtime-confirmed-fingerprint.jsonl"
echo "==> built audit runtime-confirmed maintenance fingerprint projection"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  acquireJsonlAuditFileLock,
  getJsonlAuditLockDisposalPath,
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockQuarantinePath,
  inspectJsonlAuditFileLock,
  inspectJsonlAuditLockDisposal,
  inspectJsonlAuditLockQuarantine
} = await import(pathToFileURL(process.argv[1]).href);
const {
  cleanupAuditEmptyLockDisposal,
  cleanupAuditEmptyLockQuarantine,
  cleanupAuditLock,
  cleanupAuditLockDisposal,
  cleanupAuditLockQuarantine,
  recoverAuditLockQuarantine,
  renderAuditEmptyLockDisposalCleanupReport,
  renderAuditEmptyLockDisposalCleanupReportJson,
  renderAuditEmptyLockQuarantineCleanupReport,
  renderAuditEmptyLockQuarantineCleanupReportJson,
  renderAuditLockCleanupReport,
  renderAuditLockCleanupReportJson,
  renderAuditLockDisposalCleanupReport,
  renderAuditLockDisposalCleanupReportJson,
  renderAuditLockQuarantineCleanupReport,
  renderAuditLockQuarantineCleanupReportJson,
  renderAuditLockQuarantineRecoveryReport,
  renderAuditLockQuarantineRecoveryReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const basePath = process.argv[3];
await fs.mkdir(path.dirname(basePath), { recursive: true, mode: 0o700 });
const envFor = (target) => ({ GOD_CODE_AUDIT_FILE: target });
const activeFilePath = `${basePath}.active`;
const quarantineFilePath = `${basePath}.quarantine`;
const disposalFilePath = `${basePath}.disposal`;
const recoveryFilePath = `${basePath}.recovery`;
const emptyQuarantineFilePath = `${basePath}.empty-quarantine`;
const emptyDisposalFilePath = `${basePath}.empty-disposal`;
const activeLock = await acquireJsonlAuditFileLock(activeFilePath);
const quarantineId = "Xq9001";
const disposalQuarantineId = "Xd9001";
const disposalId = "Xd9002";
const recoveryId = "Xr9001";
const emptyQuarantineId = "Xe9001";
const emptyDisposalQuarantineId = "Xe9002";
const emptyDisposalId = "Xe9003";
const quarantinePath = getJsonlAuditLockQuarantinePath(
  quarantineFilePath,
  quarantineId
);
const disposalPath = getJsonlAuditLockDisposalPath(
  disposalFilePath,
  disposalQuarantineId,
  disposalId
);
const recoveryPath = getJsonlAuditLockQuarantinePath(
  recoveryFilePath,
  recoveryId
);
const recoveryLockPath = path.join(recoveryPath, "lock");
const emptyQuarantinePath = getJsonlAuditLockQuarantinePath(
  emptyQuarantineFilePath,
  emptyQuarantineId
);
const emptyDisposalPath = getJsonlAuditLockDisposalPath(
  emptyDisposalFilePath,
  emptyDisposalQuarantineId,
  emptyDisposalId
);
await fs.mkdir(quarantinePath, { recursive: true, mode: 0o700 });
await fs.copyFile(
  activeLock.ownerPath,
  getJsonlAuditLockOwnerPath(quarantinePath)
);
await fs.mkdir(disposalPath, { recursive: true, mode: 0o700 });
await fs.copyFile(
  activeLock.ownerPath,
  getJsonlAuditLockOwnerPath(disposalPath)
);
await fs.mkdir(recoveryLockPath, { recursive: true, mode: 0o700 });
await fs.copyFile(
  activeLock.ownerPath,
  getJsonlAuditLockOwnerPath(recoveryLockPath)
);
await fs.mkdir(emptyQuarantinePath, { recursive: true, mode: 0o700 });
await fs.mkdir(emptyDisposalPath, { recursive: true, mode: 0o700 });

async function countPathReads(targetPath, inspect) {
  const originalLstat = fs.lstat.bind(fs);
  let reads = 0;
  try {
    fs.lstat = async (...args) => {
      if (path.resolve(String(args[0])) === path.resolve(targetPath)) {
        reads += 1;
      }
      return originalLstat(...args);
    };
    await inspect();
  } finally {
    fs.lstat = originalLstat;
  }
  return reads;
}

async function verifyRuntimeReplacement(testCase) {
  const dryRun = await testCase.dryRun();
  const expectedFingerprint = testCase.getDryRunFingerprint(dryRun);
  if (
    dryRun.ok !== true
    || typeof expectedFingerprint !== "string"
    || !/^[0-9a-f]{32}$/.test(expectedFingerprint)
  ) {
    throw new Error(`${testCase.name} dry-run fingerprint contract failed`);
  }
  const preflightReads = await countPathReads(
    testCase.candidatePath,
    testCase.inspect
  );
  if (preflightReads < 1) {
    throw new Error(`${testCase.name} preflight read count was empty`);
  }

  const originalLstat = fs.lstat.bind(fs);
  const originalMkdir = fs.mkdir.bind(fs);
  const originalRename = fs.rename.bind(fs);
  const originalCopyFile = fs.copyFile.bind(fs);
  const originalUnlink = fs.unlink.bind(fs);
  const originalRmdir = fs.rmdir.bind(fs);
  const mutationCalls = { mkdir: 0, rename: 0, unlink: 0, rmdir: 0 };
  let pathReads = 0;
  let replaced = false;
  try {
    fs.lstat = async (...args) => {
      if (
        path.resolve(String(args[0]))
        === path.resolve(testCase.candidatePath)
      ) {
        pathReads += 1;
        if (pathReads === preflightReads + 1) {
          await originalRename(testCase.candidatePath, testCase.movedPath);
          if (testCase.ownerRelativePath === undefined) {
            await originalMkdir(testCase.candidatePath, { mode: 0o700 });
          } else {
            const replacementOwnerPath = path.join(
              testCase.candidatePath,
              testCase.ownerRelativePath
            );
            await originalMkdir(path.dirname(replacementOwnerPath), {
              recursive: true,
              mode: 0o700
            });
            await originalCopyFile(
              path.join(testCase.movedPath, testCase.ownerRelativePath),
              replacementOwnerPath
            );
          }
          replaced = true;
        }
      }
      return originalLstat(...args);
    };
    fs.mkdir = async (...args) => {
      mutationCalls.mkdir += 1;
      return originalMkdir(...args);
    };
    fs.rename = async (...args) => {
      mutationCalls.rename += 1;
      return originalRename(...args);
    };
    fs.unlink = async (...args) => {
      mutationCalls.unlink += 1;
      return originalUnlink(...args);
    };
    fs.rmdir = async (...args) => {
      mutationCalls.rmdir += 1;
      return originalRmdir(...args);
    };

    const report = await testCase.execute(expectedFingerprint);
    const replacementInspection = await testCase.inspect();
    const replacementFingerprint = testCase.getRuntimeFingerprint(
      replacementInspection
    );
    const details = report.checks[0]?.details;
    const rendered = `${testCase.render(report)}\n${testCase.renderJson(report)}`;
    if (
      !replaced
      || report.ok !== false
      || report.checks[0]?.status !== "error"
      || !report.checks[0]?.message?.includes("fingerprint does not match")
      || details?.[testCase.stateField] !== false
      || details?.[testCase.matchField] !== undefined
      || details?.[testCase.fingerprintField] !== undefined
      || typeof replacementFingerprint !== "string"
      || replacementFingerprint === expectedFingerprint
      || Object.values(mutationCalls).some((count) => count !== 0)
      || rendered.includes(activeLock.ownerToken)
      || rendered.includes(expectedFingerprint)
      || rendered.includes(replacementFingerprint)
      || ["owner_token", "inode", "ctime_ns", "birthtime_ns", "mtime_ns"]
        .some((field) => rendered.includes(field))
      || !(await fs.stat(testCase.candidatePath)).isDirectory()
      || !(await fs.stat(testCase.movedPath)).isDirectory()
    ) {
      throw new Error(`${testCase.name} runtime-confirmed projection failed`);
    }
  } finally {
    fs.lstat = originalLstat;
    fs.mkdir = originalMkdir;
    fs.rename = originalRename;
    fs.unlink = originalUnlink;
    fs.rmdir = originalRmdir;
  }
}

const cases = [
  {
    name: "active cleanup",
    candidatePath: activeLock.lockPath,
    movedPath: `${activeLock.lockPath}.phase572-original`,
    ownerRelativePath: path.relative(activeLock.lockPath, activeLock.ownerPath),
    inspect: () => inspectJsonlAuditFileLock(activeFilePath),
    dryRun: () => cleanupAuditLock(
      envFor(activeFilePath),
      path.dirname(activeFilePath)
    ),
    execute: (fingerprint) => cleanupAuditLock(
      envFor(activeFilePath),
      path.dirname(activeFilePath),
      { dryRun: false, expectedOwnerFingerprint: fingerprint }
    ),
    getDryRunFingerprint: (report) => report.checks[0]?.details
      ?.coordination_lock_owner_fingerprint,
    getRuntimeFingerprint: (inspection) => inspection.ownerFingerprint,
    matchField: "owner_fingerprint_matches",
    fingerprintField: "coordination_lock_owner_fingerprint",
    stateField: "removed",
    render: renderAuditLockCleanupReport,
    renderJson: renderAuditLockCleanupReportJson
  },
  {
    name: "quarantine cleanup",
    candidatePath: quarantinePath,
    movedPath: `${quarantinePath}.phase572-original`,
    ownerRelativePath: path.relative(
      quarantinePath,
      getJsonlAuditLockOwnerPath(quarantinePath)
    ),
    inspect: () => inspectJsonlAuditLockQuarantine(
      quarantineFilePath,
      quarantineId
    ),
    dryRun: () => cleanupAuditLockQuarantine(
      envFor(quarantineFilePath),
      path.dirname(quarantineFilePath),
      quarantineId
    ),
    execute: (fingerprint) => cleanupAuditLockQuarantine(
      envFor(quarantineFilePath),
      path.dirname(quarantineFilePath),
      quarantineId,
      { dryRun: false, expectedOwnerFingerprint: fingerprint }
    ),
    getDryRunFingerprint: (report) => report.checks[0]?.details
      ?.owner_fingerprint,
    getRuntimeFingerprint: (inspection) => inspection.ownerFingerprint,
    matchField: "owner_fingerprint_matches",
    fingerprintField: "owner_fingerprint",
    stateField: "removed",
    render: renderAuditLockQuarantineCleanupReport,
    renderJson: renderAuditLockQuarantineCleanupReportJson
  },
  {
    name: "disposal cleanup",
    candidatePath: disposalPath,
    movedPath: `${disposalPath}.phase572-original`,
    ownerRelativePath: path.relative(
      disposalPath,
      getJsonlAuditLockOwnerPath(disposalPath)
    ),
    inspect: () => inspectJsonlAuditLockDisposal(
      disposalFilePath,
      disposalQuarantineId,
      disposalId
    ),
    dryRun: () => cleanupAuditLockDisposal(
      envFor(disposalFilePath),
      path.dirname(disposalFilePath),
      disposalQuarantineId,
      disposalId
    ),
    execute: (fingerprint) => cleanupAuditLockDisposal(
      envFor(disposalFilePath),
      path.dirname(disposalFilePath),
      disposalQuarantineId,
      disposalId,
      { dryRun: false, expectedOwnerFingerprint: fingerprint }
    ),
    getDryRunFingerprint: (report) => report.checks[0]?.details
      ?.owner_fingerprint,
    getRuntimeFingerprint: (inspection) => inspection.ownerFingerprint,
    matchField: "owner_fingerprint_matches",
    fingerprintField: "owner_fingerprint",
    stateField: "removed",
    render: renderAuditLockDisposalCleanupReport,
    renderJson: renderAuditLockDisposalCleanupReportJson
  },
  {
    name: "quarantine recovery",
    candidatePath: recoveryPath,
    movedPath: `${recoveryPath}.phase572-original`,
    ownerRelativePath: path.relative(
      recoveryPath,
      getJsonlAuditLockOwnerPath(recoveryLockPath)
    ),
    inspect: () => inspectJsonlAuditLockQuarantine(
      recoveryFilePath,
      recoveryId
    ),
    dryRun: () => recoverAuditLockQuarantine(
      envFor(recoveryFilePath),
      path.dirname(recoveryFilePath),
      recoveryId
    ),
    execute: (fingerprint) => recoverAuditLockQuarantine(
      envFor(recoveryFilePath),
      path.dirname(recoveryFilePath),
      recoveryId,
      { dryRun: false, expectedOwnerFingerprint: fingerprint }
    ),
    getDryRunFingerprint: (report) => report.checks[0]?.details
      ?.owner_fingerprint,
    getRuntimeFingerprint: (inspection) => inspection.ownerFingerprint,
    matchField: "owner_fingerprint_matches",
    fingerprintField: "owner_fingerprint",
    stateField: "recovered",
    render: renderAuditLockQuarantineRecoveryReport,
    renderJson: renderAuditLockQuarantineRecoveryReportJson
  },
  {
    name: "empty quarantine cleanup",
    candidatePath: emptyQuarantinePath,
    movedPath: `${emptyQuarantinePath}.phase572-original`,
    inspect: () => inspectJsonlAuditLockQuarantine(
      emptyQuarantineFilePath,
      emptyQuarantineId
    ),
    dryRun: () => cleanupAuditEmptyLockQuarantine(
      envFor(emptyQuarantineFilePath),
      path.dirname(emptyQuarantineFilePath),
      emptyQuarantineId
    ),
    execute: (fingerprint) => cleanupAuditEmptyLockQuarantine(
      envFor(emptyQuarantineFilePath),
      path.dirname(emptyQuarantineFilePath),
      emptyQuarantineId,
      { dryRun: false, expectedQuarantineFingerprint: fingerprint }
    ),
    getDryRunFingerprint: (report) => report.checks[0]?.details
      ?.empty_directory_fingerprint,
    getRuntimeFingerprint: (inspection) => inspection.emptyDirectoryFingerprint,
    matchField: "quarantine_fingerprint_matches",
    fingerprintField: "empty_directory_fingerprint",
    stateField: "removed",
    render: renderAuditEmptyLockQuarantineCleanupReport,
    renderJson: renderAuditEmptyLockQuarantineCleanupReportJson
  },
  {
    name: "empty disposal cleanup",
    candidatePath: emptyDisposalPath,
    movedPath: `${emptyDisposalPath}.phase572-original`,
    inspect: () => inspectJsonlAuditLockDisposal(
      emptyDisposalFilePath,
      emptyDisposalQuarantineId,
      emptyDisposalId
    ),
    dryRun: () => cleanupAuditEmptyLockDisposal(
      envFor(emptyDisposalFilePath),
      path.dirname(emptyDisposalFilePath),
      emptyDisposalQuarantineId,
      emptyDisposalId
    ),
    execute: (fingerprint) => cleanupAuditEmptyLockDisposal(
      envFor(emptyDisposalFilePath),
      path.dirname(emptyDisposalFilePath),
      emptyDisposalQuarantineId,
      emptyDisposalId,
      { dryRun: false, expectedDisposalFingerprint: fingerprint }
    ),
    getDryRunFingerprint: (report) => report.checks[0]?.details
      ?.empty_directory_fingerprint,
    getRuntimeFingerprint: (inspection) => inspection.emptyDirectoryFingerprint,
    matchField: "disposal_fingerprint_matches",
    fingerprintField: "empty_directory_fingerprint",
    stateField: "removed",
    render: renderAuditEmptyLockDisposalCleanupReport,
    renderJson: renderAuditEmptyLockDisposalCleanupReportJson
  }
];

try {
  for (const testCase of cases) {
    await verifyRuntimeReplacement(testCase);
  }
} finally {
  await activeLock.abandon();
  await Promise.all(cases.flatMap((testCase) => [
    testCase.candidatePath,
    testCase.movedPath
  ]).map((target) => fs.rm(target, { recursive: true, force: true })));
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_RUNTIME_CONFIRMED_FINGERPRINT_FILE}"

AUDIT_RUNTIME_TARGET_ABSENCE_FILE="${SMOKE_ROOT}/audit/runtime-target-absence.jsonl"
echo "==> built audit runtime-confirmed cleanup target absence projection"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  acquireJsonlAuditFileLock,
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockQuarantinePath,
  getJsonlAuditLockQuarantinePrefix
} = await import(pathToFileURL(process.argv[1]).href);
const {
  cleanupAuditLock,
  cleanupAuditLockQuarantine,
  renderAuditLockCleanupReport,
  renderAuditLockCleanupReportJson,
  renderAuditLockQuarantineCleanupReport,
  renderAuditLockQuarantineCleanupReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const basePath = process.argv[3];
await fs.mkdir(path.dirname(basePath), { recursive: true, mode: 0o700 });
const cleanupPaths = new Set();
const envFor = (target) => ({ GOD_CODE_AUDIT_FILE: target });
const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

async function runWrongObjectContraction(prefix, action) {
  const parent = path.dirname(prefix);
  const namePrefix = path.basename(prefix);
  const originalRmdir = fs.rmdir.bind(fs);
  const originalRename = fs.rename.bind(fs);
  const originalMkdir = fs.mkdir.bind(fs);
  let detachedPath;
  try {
    fs.rmdir = async (...args) => {
      const targetPath = String(args[0]);
      const targetName = path.basename(targetPath);
      if (detachedPath === undefined && targetName.startsWith(namePrefix)) {
        const logicalTargetPath = path.join(parent, targetName);
        detachedPath = `${logicalTargetPath}.phase573-detached`;
        cleanupPaths.add(logicalTargetPath);
        cleanupPaths.add(detachedPath);
        await originalRename(logicalTargetPath, detachedPath);
        await originalMkdir(logicalTargetPath, { mode: 0o700 });
        await originalRmdir(targetPath);
        return;
      }
      return originalRmdir(...args);
    };
    const report = await action();
    return { report, detachedPath, namePrefix };
  } finally {
    fs.rmdir = originalRmdir;
  }
}

const stableActiveFile = `${basePath}.stable-active`;
const residualActiveFile = `${basePath}.residual-active`;
const quarantineFile = `${basePath}.quarantine`;
const stableActiveLock = await acquireJsonlAuditFileLock(stableActiveFile);
const residualActiveLock = await acquireJsonlAuditFileLock(residualActiveFile);
const quarantineSeedLock = await acquireJsonlAuditFileLock(quarantineFile);
cleanupPaths.add(stableActiveLock.lockPath);
cleanupPaths.add(residualActiveLock.lockPath);
cleanupPaths.add(quarantineSeedLock.lockPath);
const stableQuarantineId = "Ya9001";
const residualQuarantineId = "Ya9002";
const stableQuarantinePath = getJsonlAuditLockQuarantinePath(
  quarantineFile,
  stableQuarantineId
);
const residualQuarantinePath = getJsonlAuditLockQuarantinePath(
  quarantineFile,
  residualQuarantineId
);
cleanupPaths.add(stableQuarantinePath);
cleanupPaths.add(residualQuarantinePath);
await fs.mkdir(stableQuarantinePath, { mode: 0o700 });
await fs.copyFile(
  quarantineSeedLock.ownerPath,
  getJsonlAuditLockOwnerPath(stableQuarantinePath)
);
await fs.mkdir(residualQuarantinePath, { mode: 0o700 });
await fs.copyFile(
  quarantineSeedLock.ownerPath,
  getJsonlAuditLockOwnerPath(residualQuarantinePath)
);

try {
  const stableActiveDryRun = await cleanupAuditLock(
    envFor(stableActiveFile),
    path.dirname(stableActiveFile)
  );
  const stableActiveFingerprint = stableActiveDryRun.checks[0]?.details
    ?.coordination_lock_owner_fingerprint;
  const stableActiveReport = await cleanupAuditLock(
    envFor(stableActiveFile),
    path.dirname(stableActiveFile),
    { dryRun: false, expectedOwnerFingerprint: stableActiveFingerprint }
  );
  const stableActiveRendered = `${renderAuditLockCleanupReport(stableActiveReport)}\n${renderAuditLockCleanupReportJson(stableActiveReport)}`;
  if (
    typeof stableActiveFingerprint !== "string"
    || stableActiveReport.ok !== true
    || stableActiveReport.checks[0]?.status !== "ok"
    || stableActiveReport.checks[0]?.details?.removed !== true
    || stableActiveReport.checks[0]?.details?.coordination_lock_exists !== false
    || await pathExists(stableActiveLock.lockPath)
    || stableActiveRendered.includes(stableActiveLock.ownerToken)
  ) {
    throw new Error("built stable active target absence contract failed");
  }

  const stableQuarantineDryRun = await cleanupAuditLockQuarantine(
    envFor(quarantineFile),
    path.dirname(quarantineFile),
    stableQuarantineId
  );
  const stableQuarantineFingerprint = stableQuarantineDryRun.checks[0]
    ?.details?.owner_fingerprint;
  const stableQuarantineReport = await cleanupAuditLockQuarantine(
    envFor(quarantineFile),
    path.dirname(quarantineFile),
    stableQuarantineId,
    { dryRun: false, expectedOwnerFingerprint: stableQuarantineFingerprint }
  );
  const stableQuarantineRendered = `${renderAuditLockQuarantineCleanupReport(stableQuarantineReport)}\n${renderAuditLockQuarantineCleanupReportJson(stableQuarantineReport)}`;
  if (
    typeof stableQuarantineFingerprint !== "string"
    || stableQuarantineReport.ok !== true
    || stableQuarantineReport.checks[0]?.status !== "ok"
    || stableQuarantineReport.checks[0]?.details?.removed !== true
    || stableQuarantineReport.checks[0]?.details?.quarantine_exists !== false
    || await pathExists(stableQuarantinePath)
    || stableQuarantineRendered.includes(quarantineSeedLock.ownerToken)
  ) {
    throw new Error("built stable quarantine target absence contract failed");
  }

  const residualActiveDryRun = await cleanupAuditLock(
    envFor(residualActiveFile),
    path.dirname(residualActiveFile)
  );
  const residualActiveFingerprint = residualActiveDryRun.checks[0]?.details
    ?.coordination_lock_owner_fingerprint;
  const residualActive = await runWrongObjectContraction(
    getJsonlAuditLockQuarantinePrefix(residualActiveFile),
    () => cleanupAuditLock(
      envFor(residualActiveFile),
      path.dirname(residualActiveFile),
      { dryRun: false, expectedOwnerFingerprint: residualActiveFingerprint }
    )
  );
  const residualActiveDetails = residualActive.report.checks[0]?.details;
  const residualActiveRendered = `${renderAuditLockCleanupReport(residualActive.report)}\n${renderAuditLockCleanupReportJson(residualActive.report)}`;
  if (
    typeof residualActiveFingerprint !== "string"
    || residualActive.report.ok !== true
    || residualActive.report.checks[0]?.status !== "warn"
    || residualActiveDetails?.removed !== true
    || residualActiveDetails?.coordination_lock_exists !== false
    || typeof residualActiveDetails?.residual_quarantine_path !== "string"
    || residualActive.detachedPath === undefined
    || await pathExists(residualActiveLock.lockPath)
    || await pathExists(residualActiveDetails.residual_quarantine_path)
    || !(await fs.stat(residualActive.detachedPath)).isDirectory()
    || (await fs.readdir(residualActive.detachedPath)).length !== 0
    || residualActiveRendered.includes(residualActiveLock.ownerToken)
  ) {
    throw new Error("built residual active target absence contract failed");
  }

  const residualQuarantineDryRun = await cleanupAuditLockQuarantine(
    envFor(quarantineFile),
    path.dirname(quarantineFile),
    residualQuarantineId
  );
  const residualQuarantineFingerprint = residualQuarantineDryRun.checks[0]
    ?.details?.owner_fingerprint;
  const residualQuarantine = await runWrongObjectContraction(
    `${residualQuarantinePath}.dispose-`,
    () => cleanupAuditLockQuarantine(
      envFor(quarantineFile),
      path.dirname(quarantineFile),
      residualQuarantineId,
      {
        dryRun: false,
        expectedOwnerFingerprint: residualQuarantineFingerprint
      }
    )
  );
  const residualQuarantineDetails = residualQuarantine.report.checks[0]
    ?.details;
  const residualQuarantineRendered = `${renderAuditLockQuarantineCleanupReport(residualQuarantine.report)}\n${renderAuditLockQuarantineCleanupReportJson(residualQuarantine.report)}`;
  if (
    typeof residualQuarantineFingerprint !== "string"
    || residualQuarantine.report.ok !== true
    || residualQuarantine.report.checks[0]?.status !== "warn"
    || residualQuarantineDetails?.removed !== true
    || residualQuarantineDetails?.quarantine_exists !== false
    || typeof residualQuarantineDetails?.residual_disposal_path !== "string"
    || residualQuarantine.detachedPath === undefined
    || await pathExists(residualQuarantinePath)
    || await pathExists(residualQuarantineDetails.residual_disposal_path)
    || !(await fs.stat(residualQuarantine.detachedPath)).isDirectory()
    || (await fs.readdir(residualQuarantine.detachedPath)).length !== 0
    || residualQuarantineRendered.includes(quarantineSeedLock.ownerToken)
  ) {
    throw new Error("built residual quarantine target absence contract failed");
  }
} finally {
  await Promise.all([
    stableActiveLock.abandon(),
    residualActiveLock.abandon(),
    quarantineSeedLock.abandon()
  ]);
  await Promise.all([...cleanupPaths].map((target) =>
    fs.rm(target, { recursive: true, force: true })
  ));
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_RUNTIME_TARGET_ABSENCE_FILE}"

AUDIT_RESIDUAL_EXISTENCE_UNCERTAINTY_FILE="${SMOKE_ROOT}/audit/residual-existence-uncertainty.jsonl"
echo "==> built audit residual locator existence uncertainty projection"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  acquireJsonlAuditFileLock,
  getJsonlAuditLockDisposalPath,
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockQuarantinePath
} = await import(pathToFileURL(process.argv[1]).href);
const {
  cleanupAuditLockDisposal,
  recoverAuditLockQuarantine,
  renderAuditLockDisposalCleanupReport,
  renderAuditLockDisposalCleanupReportJson,
  renderAuditLockQuarantineRecoveryReport,
  renderAuditLockQuarantineRecoveryReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const basePath = process.argv[3];
await fs.mkdir(path.dirname(basePath), { recursive: true, mode: 0o700 });
const envFor = (target) => ({ GOD_CODE_AUDIT_FILE: target });
const cleanupPaths = new Set();
const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

async function withPresentResidual(observedPath, extraPath, action) {
  const observedName = path.basename(observedPath);
  const originalRmdir = fs.rmdir.bind(fs);
  let injected = false;
  try {
    fs.rmdir = async (...args) => {
      if (!injected && path.basename(String(args[0])) === observedName) {
        await fs.writeFile(extraPath, "preserved", { mode: 0o600 });
        injected = true;
      }
      return originalRmdir(...args);
    };
    return { report: await action(), injected };
  } finally {
    fs.rmdir = originalRmdir;
  }
}

async function withMissingResidual(observedPath, movedPath, action) {
  const observedName = path.basename(observedPath);
  const originalRmdir = fs.rmdir.bind(fs);
  const originalRename = fs.rename.bind(fs);
  const originalMkdir = fs.mkdir.bind(fs);
  let replaced = false;
  try {
    fs.rmdir = async (...args) => {
      if (!replaced && path.basename(String(args[0])) === observedName) {
        await originalRename(observedPath, movedPath);
        await originalMkdir(observedPath, { mode: 0o700 });
        await originalRmdir(...args);
        replaced = true;
        return;
      }
      return originalRmdir(...args);
    };
    return { report: await action(), replaced };
  } finally {
    fs.rmdir = originalRmdir;
  }
}

const disposalFile = `${basePath}.disposal`;
const recoveryPresentFile = `${basePath}.recovery-present`;
const recoveryMissingFile = `${basePath}.recovery-missing`;
const disposalSeedLock = await acquireJsonlAuditFileLock(disposalFile);
const recoveryPresentLock = await acquireJsonlAuditFileLock(recoveryPresentFile);
const recoveryMissingLock = await acquireJsonlAuditFileLock(recoveryMissingFile);
cleanupPaths.add(disposalSeedLock.lockPath);
cleanupPaths.add(recoveryPresentLock.lockPath);
cleanupPaths.add(recoveryMissingLock.lockPath);
const presentDisposalQuarantineId = "Yw9001";
const presentDisposalId = "Yw9002";
const missingDisposalQuarantineId = "Yw9003";
const missingDisposalId = "Yw9004";
const recoveryPresentId = "Yw9005";
const recoveryMissingId = "Yw9006";
const presentDisposalPath = getJsonlAuditLockDisposalPath(
  disposalFile,
  presentDisposalQuarantineId,
  presentDisposalId
);
const missingDisposalPath = getJsonlAuditLockDisposalPath(
  disposalFile,
  missingDisposalQuarantineId,
  missingDisposalId
);
const movedDisposalPath = `${missingDisposalPath}.phase574-detached`;
const presentDisposalExtraPath = path.join(
  presentDisposalPath,
  "unexpected"
);
const recoveryPresentPath = getJsonlAuditLockQuarantinePath(
  recoveryPresentFile,
  recoveryPresentId
);
const recoveryMissingPath = getJsonlAuditLockQuarantinePath(
  recoveryMissingFile,
  recoveryMissingId
);
const recoveryPresentNestedPath = path.join(recoveryPresentPath, "lock");
const recoveryMissingNestedPath = path.join(recoveryMissingPath, "lock");
const recoveryPresentExtraPath = path.join(
  recoveryPresentNestedPath,
  "unexpected"
);
const movedRecoveryPath = `${recoveryMissingPath}.phase574-detached`;
for (const target of [
  presentDisposalPath,
  missingDisposalPath,
  movedDisposalPath,
  recoveryPresentPath,
  recoveryMissingPath,
  movedRecoveryPath
]) {
  cleanupPaths.add(target);
}
await fs.mkdir(presentDisposalPath, { mode: 0o700 });
await fs.copyFile(
  disposalSeedLock.ownerPath,
  getJsonlAuditLockOwnerPath(presentDisposalPath)
);
await fs.mkdir(missingDisposalPath, { mode: 0o700 });
await fs.copyFile(
  disposalSeedLock.ownerPath,
  getJsonlAuditLockOwnerPath(missingDisposalPath)
);
await fs.mkdir(recoveryPresentPath, { mode: 0o700 });
await fs.rename(recoveryPresentLock.lockPath, recoveryPresentNestedPath);
await fs.mkdir(recoveryMissingPath, { mode: 0o700 });
await fs.rename(recoveryMissingLock.lockPath, recoveryMissingNestedPath);

try {
  const presentDisposalDryRun = await cleanupAuditLockDisposal(
    envFor(disposalFile),
    path.dirname(disposalFile),
    presentDisposalQuarantineId,
    presentDisposalId
  );
  const presentDisposalFingerprint = presentDisposalDryRun.checks[0]
    ?.details?.owner_fingerprint;
  const presentDisposal = await withPresentResidual(
    presentDisposalPath,
    presentDisposalExtraPath,
    () => cleanupAuditLockDisposal(
      envFor(disposalFile),
      path.dirname(disposalFile),
      presentDisposalQuarantineId,
      presentDisposalId,
      { dryRun: false, expectedOwnerFingerprint: presentDisposalFingerprint }
    )
  );
  const presentDisposalDetails = presentDisposal.report.checks[0]?.details;
  const presentDisposalRendered = `${renderAuditLockDisposalCleanupReport(presentDisposal.report)}\n${renderAuditLockDisposalCleanupReportJson(presentDisposal.report)}`;
  if (
    typeof presentDisposalFingerprint !== "string"
    || !presentDisposal.injected
    || presentDisposal.report.ok !== true
    || presentDisposal.report.checks[0]?.status !== "warn"
    || presentDisposalDetails?.removed !== true
    || presentDisposalDetails?.disposal_exists !== undefined
    || presentDisposalDetails?.residual_disposal_path !== presentDisposalPath
    || !(await pathExists(presentDisposalPath))
    || await fs.readFile(presentDisposalExtraPath, "utf8") !== "preserved"
    || presentDisposalRendered.includes("disposal_exists")
    || presentDisposalRendered.includes(disposalSeedLock.ownerToken)
  ) {
    throw new Error("built present disposal residual uncertainty failed");
  }

  const missingDisposalDryRun = await cleanupAuditLockDisposal(
    envFor(disposalFile),
    path.dirname(disposalFile),
    missingDisposalQuarantineId,
    missingDisposalId
  );
  const missingDisposalFingerprint = missingDisposalDryRun.checks[0]
    ?.details?.owner_fingerprint;
  const missingDisposal = await withMissingResidual(
    missingDisposalPath,
    movedDisposalPath,
    () => cleanupAuditLockDisposal(
      envFor(disposalFile),
      path.dirname(disposalFile),
      missingDisposalQuarantineId,
      missingDisposalId,
      { dryRun: false, expectedOwnerFingerprint: missingDisposalFingerprint }
    )
  );
  const missingDisposalDetails = missingDisposal.report.checks[0]?.details;
  const missingDisposalRendered = `${renderAuditLockDisposalCleanupReport(missingDisposal.report)}\n${renderAuditLockDisposalCleanupReportJson(missingDisposal.report)}`;
  if (
    typeof missingDisposalFingerprint !== "string"
    || !missingDisposal.replaced
    || missingDisposal.report.ok !== true
    || missingDisposal.report.checks[0]?.status !== "warn"
    || missingDisposalDetails?.removed !== true
    || missingDisposalDetails?.disposal_exists !== undefined
    || missingDisposalDetails?.residual_disposal_path !== missingDisposalPath
    || await pathExists(missingDisposalPath)
    || !(await fs.stat(movedDisposalPath)).isDirectory()
    || (await fs.readdir(movedDisposalPath)).length !== 0
    || missingDisposalRendered.includes("disposal_exists")
    || missingDisposalRendered.includes(disposalSeedLock.ownerToken)
  ) {
    throw new Error("built missing disposal residual uncertainty failed");
  }

  const presentRecoveryDryRun = await recoverAuditLockQuarantine(
    envFor(recoveryPresentFile),
    path.dirname(recoveryPresentFile),
    recoveryPresentId
  );
  const presentRecoveryFingerprint = presentRecoveryDryRun.checks[0]
    ?.details?.owner_fingerprint;
  const presentRecovery = await withPresentResidual(
    recoveryPresentNestedPath,
    recoveryPresentExtraPath,
    () => recoverAuditLockQuarantine(
      envFor(recoveryPresentFile),
      path.dirname(recoveryPresentFile),
      recoveryPresentId,
      { dryRun: false, expectedOwnerFingerprint: presentRecoveryFingerprint }
    )
  );
  const presentRecoveryDetails = presentRecovery.report.checks[0]?.details;
  const presentRecoveryRendered = `${renderAuditLockQuarantineRecoveryReport(presentRecovery.report)}\n${renderAuditLockQuarantineRecoveryReportJson(presentRecovery.report)}`;
  if (
    typeof presentRecoveryFingerprint !== "string"
    || !presentRecovery.injected
    || presentRecovery.report.ok !== true
    || presentRecovery.report.checks[0]?.status !== "warn"
    || presentRecoveryDetails?.recovered !== true
    || presentRecoveryDetails?.coordination_lock_exists !== true
    || presentRecoveryDetails?.quarantine_exists !== undefined
    || presentRecoveryDetails?.residual_quarantine_path !== recoveryPresentPath
    || !(await pathExists(recoveryPresentPath))
    || !(await pathExists(recoveryPresentLock.lockPath))
    || await fs.readFile(recoveryPresentExtraPath, "utf8") !== "preserved"
    || presentRecoveryRendered.includes("quarantine_exists")
    || presentRecoveryRendered.includes(recoveryPresentLock.ownerToken)
  ) {
    throw new Error("built present recovery residual uncertainty failed");
  }

  const missingRecoveryDryRun = await recoverAuditLockQuarantine(
    envFor(recoveryMissingFile),
    path.dirname(recoveryMissingFile),
    recoveryMissingId
  );
  const missingRecoveryFingerprint = missingRecoveryDryRun.checks[0]
    ?.details?.owner_fingerprint;
  const missingRecovery = await withMissingResidual(
    recoveryMissingPath,
    movedRecoveryPath,
    () => recoverAuditLockQuarantine(
      envFor(recoveryMissingFile),
      path.dirname(recoveryMissingFile),
      recoveryMissingId,
      { dryRun: false, expectedOwnerFingerprint: missingRecoveryFingerprint }
    )
  );
  const missingRecoveryDetails = missingRecovery.report.checks[0]?.details;
  const missingRecoveryRendered = `${renderAuditLockQuarantineRecoveryReport(missingRecovery.report)}\n${renderAuditLockQuarantineRecoveryReportJson(missingRecovery.report)}`;
  if (
    typeof missingRecoveryFingerprint !== "string"
    || !missingRecovery.replaced
    || missingRecovery.report.ok !== true
    || missingRecovery.report.checks[0]?.status !== "warn"
    || missingRecoveryDetails?.recovered !== true
    || missingRecoveryDetails?.coordination_lock_exists !== true
    || missingRecoveryDetails?.quarantine_exists !== undefined
    || missingRecoveryDetails?.residual_quarantine_path !== recoveryMissingPath
    || await pathExists(recoveryMissingPath)
    || !(await pathExists(recoveryMissingLock.lockPath))
    || !(await fs.stat(movedRecoveryPath)).isDirectory()
    || (await fs.readdir(movedRecoveryPath)).length !== 0
    || missingRecoveryRendered.includes("quarantine_exists")
    || missingRecoveryRendered.includes(recoveryMissingLock.ownerToken)
  ) {
    throw new Error("built missing recovery residual uncertainty failed");
  }
} finally {
  await Promise.all([
    disposalSeedLock.abandon(),
    recoveryPresentLock.abandon(),
    recoveryMissingLock.abandon()
  ]);
  await Promise.all([...cleanupPaths].map((target) =>
    fs.rm(target, { recursive: true, force: true })
  ));
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_RESIDUAL_EXISTENCE_UNCERTAINTY_FILE}"

AUDIT_RUNTIME_MISSING_SNAPSHOT_FILE="${SMOKE_ROOT}/audit/runtime-missing-snapshot.jsonl"
echo "==> built audit runtime-missing preflight snapshot withdrawal"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  acquireJsonlAuditFileLock,
  getJsonlAuditLockDisposalPath,
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockQuarantinePath,
  inspectJsonlAuditFileLock,
  inspectJsonlAuditLockDisposal,
  inspectJsonlAuditLockQuarantine
} = await import(pathToFileURL(process.argv[1]).href);
const {
  cleanupAuditLock,
  cleanupAuditLockDisposal,
  recoverAuditLockQuarantine,
  renderAuditLockCleanupReport,
  renderAuditLockCleanupReportJson,
  renderAuditLockDisposalCleanupReport,
  renderAuditLockDisposalCleanupReportJson,
  renderAuditLockQuarantineRecoveryReport,
  renderAuditLockQuarantineRecoveryReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const basePath = process.argv[3];
await fs.mkdir(path.dirname(basePath), { recursive: true, mode: 0o700 });
const envFor = (target) => ({ GOD_CODE_AUDIT_FILE: target });
const cleanupPaths = new Set();
const acquiredLocks = [];
const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

async function countPathReads(targetPath, inspect) {
  const originalLstat = fs.lstat.bind(fs);
  let reads = 0;
  try {
    fs.lstat = async (...args) => {
      if (path.resolve(String(args[0])) === path.resolve(targetPath)) {
        reads += 1;
      }
      return originalLstat(...args);
    };
    await inspect();
  } finally {
    fs.lstat = originalLstat;
  }
  return reads;
}

async function runWithRuntimeMissingCandidate({
  candidatePath,
  movedPath,
  inspect,
  afterMove = async () => undefined,
  execute
}) {
  const preflightReads = await countPathReads(candidatePath, inspect);
  if (preflightReads < 1) {
    throw new Error(`built runtime-missing probe had no preflight reads for ${candidatePath}`);
  }
  const originalLstat = fs.lstat.bind(fs);
  const originalRename = fs.rename.bind(fs);
  let pathReads = 0;
  let injected = false;
  let sideEffect;
  try {
    fs.lstat = async (...args) => {
      if (path.resolve(String(args[0])) === path.resolve(candidatePath)) {
        pathReads += 1;
        if (pathReads === preflightReads + 1) {
          await originalRename(candidatePath, movedPath);
          sideEffect = await afterMove();
          injected = true;
        }
      }
      return originalLstat(...args);
    };
    return {
      report: await execute(),
      injected,
      sideEffect
    };
  } finally {
    fs.lstat = originalLstat;
  }
}

function assertFieldsWithdrawn(details, rendered, fields, name) {
  for (const field of fields) {
    if (
      Object.prototype.hasOwnProperty.call(details, field)
      || rendered.includes(field)
    ) {
      throw new Error(`${name} retained stale ${field}`);
    }
  }
}

const activeFile = `${basePath}.active`;
const disposalFile = `${basePath}.disposal`;
const recoveryFile = `${basePath}.recovery`;
const activeLock = await acquireJsonlAuditFileLock(activeFile);
const disposalSeedLock = await acquireJsonlAuditFileLock(disposalFile);
const recoverySeedLock = await acquireJsonlAuditFileLock(recoveryFile);
acquiredLocks.push(activeLock, disposalSeedLock, recoverySeedLock);
cleanupPaths.add(activeLock.lockPath);
cleanupPaths.add(disposalSeedLock.lockPath);
cleanupPaths.add(recoverySeedLock.lockPath);

const movedActivePath = `${activeLock.lockPath}.phase575-missing`;
cleanupPaths.add(movedActivePath);

const disposalQuarantineId = "Yx9001";
const disposalId = "Yx9002";
const disposalQuarantinePath = getJsonlAuditLockQuarantinePath(
  disposalFile,
  disposalQuarantineId
);
const disposalPath = getJsonlAuditLockDisposalPath(
  disposalFile,
  disposalQuarantineId,
  disposalId
);
const movedDisposalPath = `${disposalPath}.phase575-missing`;
cleanupPaths.add(disposalQuarantinePath);
cleanupPaths.add(disposalPath);
cleanupPaths.add(movedDisposalPath);
await fs.mkdir(disposalPath, { recursive: true, mode: 0o700 });
await fs.copyFile(
  disposalSeedLock.ownerPath,
  getJsonlAuditLockOwnerPath(disposalPath)
);

const recoveryId = "Yx9003";
const recoveryPath = getJsonlAuditLockQuarantinePath(
  recoveryFile,
  recoveryId
);
const recoveryNestedPath = path.join(recoveryPath, "lock");
const movedRecoveryPath = `${recoveryPath}.phase575-missing`;
cleanupPaths.add(recoveryPath);
cleanupPaths.add(movedRecoveryPath);
await fs.mkdir(recoveryPath, { recursive: true, mode: 0o700 });
await fs.rename(recoverySeedLock.lockPath, recoveryNestedPath);

try {
  const activeDryRun = await cleanupAuditLock(
    envFor(activeFile),
    path.dirname(activeFile)
  );
  const activeFingerprint = activeDryRun.checks[0]?.details
    ?.coordination_lock_owner_fingerprint;
  const activeMissing = await runWithRuntimeMissingCandidate({
    candidatePath: activeLock.lockPath,
    movedPath: movedActivePath,
    inspect: () => inspectJsonlAuditFileLock(activeFile),
    execute: () => cleanupAuditLock(
      envFor(activeFile),
      path.dirname(activeFile),
      { dryRun: false, expectedOwnerFingerprint: activeFingerprint }
    )
  });
  const activeDetails = activeMissing.report.checks[0]?.details;
  const activeRendered = `${renderAuditLockCleanupReport(activeMissing.report)}\n${renderAuditLockCleanupReportJson(activeMissing.report)}`;
  if (
    typeof activeFingerprint !== "string"
    || !activeMissing.injected
    || activeMissing.report.ok !== true
    || activeMissing.report.checks[0]?.status !== "warn"
    || activeDetails?.coordination_lock_exists !== false
    || activeDetails?.removed !== false
    || await pathExists(activeLock.lockPath)
    || !(await fs.stat(movedActivePath)).isDirectory()
    || activeRendered.includes(activeFingerprint)
    || activeRendered.includes(activeLock.ownerToken)
  ) {
    throw new Error("built active runtime-missing outcome failed");
  }
  assertFieldsWithdrawn(activeDetails, activeRendered, [
    "coordination_lock_entry_type",
    "coordination_lock_entry_count",
    "coordination_lock_entry_scan_count",
    "coordination_lock_entry_scan_limit",
    "coordination_lock_entry_scan_truncated",
    "coordination_lock_owner_entry_exclusive",
    "coordination_lock_owner_metadata_status",
    "coordination_lock_owner_pid",
    "coordination_lock_acquired_at",
    "coordination_lock_state_changed",
    "coordination_lock_inspection_error_code",
    "coordination_lock_owner_fingerprint",
    "owner_fingerprint_matches"
  ], "built active runtime-missing report");

  const disposalDryRun = await cleanupAuditLockDisposal(
    envFor(disposalFile),
    path.dirname(disposalFile),
    disposalQuarantineId,
    disposalId
  );
  const disposalFingerprint = disposalDryRun.checks[0]?.details
    ?.owner_fingerprint;
  const disposalMissing = await runWithRuntimeMissingCandidate({
    candidatePath: disposalPath,
    movedPath: movedDisposalPath,
    inspect: () => inspectJsonlAuditLockDisposal(
      disposalFile,
      disposalQuarantineId,
      disposalId
    ),
    afterMove: async () => fs.mkdir(disposalQuarantinePath, { mode: 0o700 }),
    execute: () => cleanupAuditLockDisposal(
      envFor(disposalFile),
      path.dirname(disposalFile),
      disposalQuarantineId,
      disposalId,
      { dryRun: false, expectedOwnerFingerprint: disposalFingerprint }
    )
  });
  const disposalDetails = disposalMissing.report.checks[0]?.details;
  const disposalRendered = `${renderAuditLockDisposalCleanupReport(disposalMissing.report)}\n${renderAuditLockDisposalCleanupReportJson(disposalMissing.report)}`;
  if (
    typeof disposalFingerprint !== "string"
    || !disposalMissing.injected
    || disposalMissing.report.ok !== true
    || disposalMissing.report.checks[0]?.status !== "warn"
    || disposalDetails?.disposal_exists !== false
    || disposalDetails?.removed !== false
    || !(await pathExists(disposalQuarantinePath))
    || await pathExists(disposalPath)
    || !(await fs.stat(movedDisposalPath)).isDirectory()
    || disposalRendered.includes(disposalFingerprint)
    || disposalRendered.includes(disposalSeedLock.ownerToken)
  ) {
    throw new Error("built disposal runtime-missing outcome failed");
  }
  assertFieldsWithdrawn(disposalDetails, disposalRendered, [
    "source_quarantine_exists",
    "source_quarantine_entry_type",
    "source_quarantine_layout",
    "source_quarantine_state_changed",
    "source_quarantine_inspection_error_code",
    "disposal_entry_type",
    "disposal_layout",
    "owner_metadata_status",
    "owner_pid",
    "owner_acquired_at",
    "owner_fingerprint",
    "owner_fingerprint_matches",
    "state_changed",
    "inspection_error_code"
  ], "built disposal runtime-missing report");

  const recoveryDryRun = await recoverAuditLockQuarantine(
    envFor(recoveryFile),
    path.dirname(recoveryFile),
    recoveryId
  );
  const recoveryFingerprint = recoveryDryRun.checks[0]?.details
    ?.owner_fingerprint;
  const recoveryMissing = await runWithRuntimeMissingCandidate({
    candidatePath: recoveryPath,
    movedPath: movedRecoveryPath,
    inspect: () => inspectJsonlAuditLockQuarantine(recoveryFile, recoveryId),
    afterMove: async () => {
      const concurrentLock = await acquireJsonlAuditFileLock(recoveryFile);
      acquiredLocks.push(concurrentLock);
      cleanupPaths.add(concurrentLock.lockPath);
      return concurrentLock;
    },
    execute: () => recoverAuditLockQuarantine(
      envFor(recoveryFile),
      path.dirname(recoveryFile),
      recoveryId,
      { dryRun: false, expectedOwnerFingerprint: recoveryFingerprint }
    )
  });
  const concurrentLock = recoveryMissing.sideEffect;
  const recoveryDetails = recoveryMissing.report.checks[0]?.details;
  const recoveryRendered = `${renderAuditLockQuarantineRecoveryReport(recoveryMissing.report)}\n${renderAuditLockQuarantineRecoveryReportJson(recoveryMissing.report)}`;
  if (
    typeof recoveryFingerprint !== "string"
    || concurrentLock === undefined
    || !recoveryMissing.injected
    || recoveryMissing.report.ok !== true
    || recoveryMissing.report.checks[0]?.status !== "warn"
    || recoveryDetails?.quarantine_exists !== false
    || recoveryDetails?.recovered !== false
    || await pathExists(recoveryPath)
    || !(await pathExists(recoverySeedLock.lockPath))
    || !(await fs.stat(movedRecoveryPath)).isDirectory()
    || recoveryRendered.includes(recoveryFingerprint)
    || recoveryRendered.includes(recoverySeedLock.ownerToken)
    || recoveryRendered.includes(concurrentLock.ownerToken)
  ) {
    throw new Error("built recovery runtime-missing outcome failed");
  }
  assertFieldsWithdrawn(recoveryDetails, recoveryRendered, [
    "quarantine_entry_type",
    "quarantine_layout",
    "owner_location",
    "owner_metadata_status",
    "owner_pid",
    "owner_acquired_at",
    "owner_fingerprint",
    "owner_fingerprint_matches",
    "state_changed",
    "inspection_error_code",
    "coordination_lock_exists",
    "coordination_lock_entry_type",
    "coordination_lock_acquirable",
    "coordination_lock_entry_count",
    "coordination_lock_entry_scan_count",
    "coordination_lock_entry_scan_limit",
    "coordination_lock_entry_scan_truncated",
    "coordination_lock_owner_entry_exclusive",
    "coordination_lock_owner_metadata_status",
    "coordination_lock_owner_pid",
    "coordination_lock_acquired_at",
    "coordination_lock_state_changed",
    "coordination_lock_inspection_error_code"
  ], "built recovery runtime-missing report");
} finally {
  for (const lock of acquiredLocks.reverse()) {
    await lock.abandon();
  }
  await Promise.all([...cleanupPaths].map((target) =>
    fs.rm(target, { recursive: true, force: true })
  ));
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_RUNTIME_MISSING_SNAPSHOT_FILE}"

AUDIT_MAINTENANCE_HANDLE_FINALIZATION_FILE="${SMOKE_ROOT}/audit/maintenance-handle-finalization.jsonl"
echo "==> built audit maintenance result-preserving handle finalization"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  acquireJsonlAuditFileLock,
  getJsonlAuditLockDisposalPath,
  getJsonlAuditLockQuarantinePath
} = await import(pathToFileURL(process.argv[1]).href);
const {
  cleanupAuditEmptyLockDisposal,
  cleanupAuditLock,
  recoverAuditLockQuarantine,
  renderAuditEmptyLockDisposalCleanupReport,
  renderAuditEmptyLockDisposalCleanupReportJson,
  renderAuditLockCleanupReport,
  renderAuditLockCleanupReportJson,
  renderAuditLockQuarantineRecoveryReport,
  renderAuditLockQuarantineRecoveryReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const basePath = process.argv[3];
await fs.mkdir(path.dirname(basePath), { recursive: true, mode: 0o700 });
const envFor = (target) => ({ GOD_CODE_AUDIT_FILE: target });
const cleanupPaths = new Set();
const acquiredLocks = [];
const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

async function countSelectedOpens(targetPath, execute) {
  const savedOpen = fs.open;
  const invokeOpen = savedOpen.bind(fs);
  let selectedOpenCount = 0;
  try {
    fs.open = async (...args) => {
      const handle = await invokeOpen(...args);
      if (path.resolve(String(args[0])) === path.resolve(targetPath)) {
        selectedOpenCount += 1;
      }
      return handle;
    };
    return { result: await execute(), selectedOpenCount };
  } finally {
    fs.open = savedOpen;
  }
}

async function runWithCloseFailure({
  targetPath,
  targetOpen,
  message,
  execute
}) {
  const savedOpen = fs.open;
  const invokeOpen = savedOpen.bind(fs);
  let selectedOpenCount = 0;
  let closeCompletion;
  try {
    fs.open = async (...args) => {
      const handle = await invokeOpen(...args);
      if (path.resolve(String(args[0])) === path.resolve(targetPath)) {
        selectedOpenCount += 1;
        if (selectedOpenCount === targetOpen) {
          const close = handle.close.bind(handle);
          handle.close = () => {
            closeCompletion = close();
            throw new Error(message);
          };
        }
      }
      return handle;
    };
    const result = await execute();
    if (closeCompletion !== undefined) {
      await closeCompletion;
    }
    return { result, selectedOpenCount, closeInjected: closeCompletion !== undefined };
  } finally {
    fs.open = savedOpen;
  }
}

const activeFile = `${basePath}.active`;
const disposalFile = `${basePath}.empty-disposal`;
const recoveryFile = `${basePath}.recovery`;
const activeLock = await acquireJsonlAuditFileLock(activeFile);
const recoveryLock = await acquireJsonlAuditFileLock(recoveryFile);
acquiredLocks.push(activeLock, recoveryLock);
cleanupPaths.add(activeLock.lockPath);
cleanupPaths.add(recoveryLock.lockPath);

const disposalQuarantineId = "Fz9001";
const disposalId = "Fz9002";
const disposalPath = getJsonlAuditLockDisposalPath(
  disposalFile,
  disposalQuarantineId,
  disposalId
);
cleanupPaths.add(disposalPath);
await fs.mkdir(disposalPath, { recursive: true, mode: 0o700 });

const recoveryId = "Fz9003";
const recoveryPath = getJsonlAuditLockQuarantinePath(recoveryFile, recoveryId);
const recoveryNestedPath = path.join(recoveryPath, "lock");
cleanupPaths.add(recoveryPath);
await fs.mkdir(recoveryPath, { recursive: true, mode: 0o700 });
await fs.rename(recoveryLock.lockPath, recoveryNestedPath);

try {
  const activePreflight = await countSelectedOpens(
    activeLock.lockPath,
    () => cleanupAuditLock(envFor(activeFile), path.dirname(activeFile))
  );
  const activeFingerprint = activePreflight.result.checks[0]?.details
    ?.coordination_lock_owner_fingerprint;
  const activeCloseMessage = "built active cleanup handle close failure";
  const activeRun = await runWithCloseFailure({
    targetPath: activeLock.lockPath,
    targetOpen: activePreflight.selectedOpenCount + 1,
    message: activeCloseMessage,
    execute: () => cleanupAuditLock(
      envFor(activeFile),
      path.dirname(activeFile),
      { dryRun: false, expectedOwnerFingerprint: activeFingerprint }
    )
  });
  const activeReport = activeRun.result;
  const activeDetails = activeReport.checks[0]?.details;
  const activeRendered = `${renderAuditLockCleanupReport(activeReport)}\n${renderAuditLockCleanupReportJson(activeReport)}`;
  if (
    typeof activeFingerprint !== "string"
    || activePreflight.selectedOpenCount < 1
    || !activeRun.closeInjected
    || activeReport.ok !== true
    || activeReport.checks[0]?.status !== "warn"
    || activeDetails?.coordination_lock_exists !== false
    || activeDetails?.removed !== true
    || activeDetails?.cleanup_handles_closed !== false
    || !activeDetails?.cleanup_handle_warning?.includes(activeCloseMessage)
    || await pathExists(activeLock.lockPath)
    || !activeRendered.includes("cleanup_handles_closed")
    || !activeRendered.includes("descriptor finalization")
    || activeRendered.includes(activeLock.ownerToken)
  ) {
    throw new Error("built active cleanup result-preserving finalization failed");
  }

  const disposalPreflight = await countSelectedOpens(
    disposalPath,
    () => cleanupAuditEmptyLockDisposal(
      envFor(disposalFile),
      path.dirname(disposalFile),
      disposalQuarantineId,
      disposalId
    )
  );
  const disposalFingerprint = disposalPreflight.result.checks[0]?.details
    ?.empty_directory_fingerprint;
  const disposalCloseMessage = "built empty disposal handle close failure";
  const disposalRun = await runWithCloseFailure({
    targetPath: disposalPath,
    targetOpen: disposalPreflight.selectedOpenCount + 1,
    message: disposalCloseMessage,
    execute: () => cleanupAuditEmptyLockDisposal(
      envFor(disposalFile),
      path.dirname(disposalFile),
      disposalQuarantineId,
      disposalId,
      { dryRun: false, expectedDisposalFingerprint: disposalFingerprint }
    )
  });
  const disposalReport = disposalRun.result;
  const disposalDetails = disposalReport.checks[0]?.details;
  const disposalRendered = `${renderAuditEmptyLockDisposalCleanupReport(disposalReport)}\n${renderAuditEmptyLockDisposalCleanupReportJson(disposalReport)}`;
  if (
    typeof disposalFingerprint !== "string"
    || disposalPreflight.selectedOpenCount < 1
    || !disposalRun.closeInjected
    || disposalReport.ok !== true
    || disposalReport.checks[0]?.status !== "warn"
    || disposalDetails?.disposal_exists !== false
    || disposalDetails?.removed !== true
    || disposalDetails?.cleanup_handles_closed !== false
    || !disposalDetails?.cleanup_handle_warning?.includes(disposalCloseMessage)
    || await pathExists(disposalPath)
    || !disposalRendered.includes("cleanup_handle_warning")
    || !disposalRendered.includes("descriptor finalization")
  ) {
    throw new Error("built empty disposal result-preserving finalization failed");
  }

  const recoveryPreflight = await countSelectedOpens(
    recoveryPath,
    () => recoverAuditLockQuarantine(
      envFor(recoveryFile),
      path.dirname(recoveryFile),
      recoveryId
    )
  );
  const recoveryFingerprint = recoveryPreflight.result.checks[0]?.details
    ?.owner_fingerprint;
  const recoveryCloseMessage = "built quarantine recovery handle close failure";
  const recoveryRun = await runWithCloseFailure({
    targetPath: recoveryPath,
    targetOpen: recoveryPreflight.selectedOpenCount + 1,
    message: recoveryCloseMessage,
    execute: () => recoverAuditLockQuarantine(
      envFor(recoveryFile),
      path.dirname(recoveryFile),
      recoveryId,
      { dryRun: false, expectedOwnerFingerprint: recoveryFingerprint }
    )
  });
  const recoveryReport = recoveryRun.result;
  const recoveryDetails = recoveryReport.checks[0]?.details;
  const recoveryRendered = `${renderAuditLockQuarantineRecoveryReport(recoveryReport)}\n${renderAuditLockQuarantineRecoveryReportJson(recoveryReport)}`;
  if (
    typeof recoveryFingerprint !== "string"
    || recoveryPreflight.selectedOpenCount < 1
    || !recoveryRun.closeInjected
    || recoveryReport.ok !== true
    || recoveryReport.checks[0]?.status !== "warn"
    || recoveryDetails?.coordination_lock_exists !== true
    || recoveryDetails?.quarantine_exists !== false
    || recoveryDetails?.recovered !== true
    || recoveryDetails?.recovery_handles_closed !== false
    || !recoveryDetails?.recovery_handle_warning?.includes(recoveryCloseMessage)
    || !(await pathExists(recoveryLock.lockPath))
    || await pathExists(recoveryPath)
    || !recoveryRendered.includes("recovery_handle_warning")
    || !recoveryRendered.includes("descriptor finalization")
    || recoveryRendered.includes(recoveryLock.ownerToken)
  ) {
    throw new Error("built quarantine recovery result-preserving finalization failed");
  }
} finally {
  for (const lock of acquiredLocks.reverse()) {
    await lock.abandon();
  }
  await Promise.all([...cleanupPaths].map((target) =>
    fs.rm(target, { recursive: true, force: true })
  ));
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_MAINTENANCE_HANDLE_FINALIZATION_FILE}"

AUDIT_MAINTENANCE_REJECTION_FINALIZATION_FILE="${SMOKE_ROOT}/audit/maintenance-rejection-finalization.jsonl"
echo "==> built audit maintenance rejection handle finalization evidence"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  JsonlAuditLockMaintenanceError,
  acquireJsonlAuditFileLock,
  cleanupJsonlAuditFileLock,
  getJsonlAuditLockQuarantinePath,
  inspectJsonlAuditFileLock,
  inspectJsonlAuditLockQuarantine
} = await import(pathToFileURL(process.argv[1]).href);
const {
  cleanupAuditLock,
  recoverAuditLockQuarantine,
  renderAuditLockCleanupReport,
  renderAuditLockCleanupReportJson,
  renderAuditLockQuarantineRecoveryReport,
  renderAuditLockQuarantineRecoveryReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const basePath = process.argv[3];
await fs.mkdir(path.dirname(basePath), { recursive: true, mode: 0o700 });
const envFor = (target) => ({ GOD_CODE_AUDIT_FILE: target });
const cleanupPaths = new Set();
const acquiredLocks = [];
const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

async function countSelectedOpens(targetPath, execute) {
  const savedOpen = fs.open;
  const invokeOpen = savedOpen.bind(fs);
  let selectedOpenCount = 0;
  try {
    fs.open = async (...args) => {
      const handle = await invokeOpen(...args);
      if (path.resolve(String(args[0])) === path.resolve(targetPath)) {
        selectedOpenCount += 1;
      }
      return handle;
    };
    return { result: await execute(), selectedOpenCount };
  } finally {
    fs.open = savedOpen;
  }
}

async function runWithCloseFailure({
  targetPath,
  targetOpen,
  message,
  observedClosePath,
  execute,
  expectRejection = false
}) {
  const savedOpen = fs.open;
  const invokeOpen = savedOpen.bind(fs);
  let selectedOpenCount = 0;
  let observedCloseCount = 0;
  let closeCompletion;
  let observedCloseCompletion;
  try {
    fs.open = async (...args) => {
      const handle = await invokeOpen(...args);
      const openedPath = path.resolve(String(args[0]));
      if (openedPath === path.resolve(targetPath)) {
        selectedOpenCount += 1;
        if (selectedOpenCount === targetOpen) {
          const close = handle.close.bind(handle);
          handle.close = () => {
            closeCompletion = close();
            throw new Error(message);
          };
        }
      } else if (
        observedClosePath !== undefined
        && openedPath === path.resolve(observedClosePath)
      ) {
        const close = handle.close.bind(handle);
        handle.close = async () => {
          observedCloseCount += 1;
          observedCloseCompletion = close();
          await observedCloseCompletion;
        };
      }
      return handle;
    };
    if (expectRejection) {
      let failure;
      try {
        await execute();
      } catch (error) {
        failure = error;
      }
      if (failure === undefined) {
        throw new Error("built maintenance rejection probe unexpectedly resolved");
      }
      if (closeCompletion !== undefined) {
        await closeCompletion;
      }
      if (observedCloseCompletion !== undefined) {
        await observedCloseCompletion;
      }
      return {
        failure,
        selectedOpenCount,
        observedCloseCount,
        closeInjected: closeCompletion !== undefined
      };
    }
    const result = await execute();
    if (closeCompletion !== undefined) {
      await closeCompletion;
    }
    if (observedCloseCompletion !== undefined) {
      await observedCloseCompletion;
    }
    return {
      result,
      selectedOpenCount,
      observedCloseCount,
      closeInjected: closeCompletion !== undefined
    };
  } finally {
    fs.open = savedOpen;
  }
}

const candidateFile = `${basePath}.candidate`;
const cleanupFile = `${basePath}.cleanup`;
const recoveryFile = `${basePath}.recovery`;
const candidateLock = await acquireJsonlAuditFileLock(candidateFile);
const cleanupLock = await acquireJsonlAuditFileLock(cleanupFile);
const recoveryLock = await acquireJsonlAuditFileLock(recoveryFile);
acquiredLocks.push(candidateLock, cleanupLock, recoveryLock);
cleanupPaths.add(candidateLock.lockPath);
cleanupPaths.add(cleanupLock.lockPath);
cleanupPaths.add(recoveryLock.lockPath);

const recoveryId = "Fg9001";
const recoveryPath = getJsonlAuditLockQuarantinePath(recoveryFile, recoveryId);
const recoveryNestedPath = path.join(recoveryPath, "lock");
cleanupPaths.add(recoveryPath);
await fs.mkdir(recoveryPath, { recursive: true, mode: 0o700 });
await fs.rename(recoveryLock.lockPath, recoveryNestedPath);

try {
  const candidateInspection = await inspectJsonlAuditFileLock(candidateFile);
  const candidateFingerprint = candidateInspection.ownerFingerprint;
  if (typeof candidateFingerprint !== "string") {
    throw new Error("built candidate rejection fingerprint unavailable");
  }
  const mismatchedFingerprint = `${candidateFingerprint[0] === "0" ? "1" : "0"}${candidateFingerprint.slice(1)}`;
  const candidateCloseMessage = "built candidate rejection close failure";
  const candidateRun = await runWithCloseFailure({
    targetPath: candidateLock.lockPath,
    targetOpen: 1,
    message: candidateCloseMessage,
    observedClosePath: candidateLock.ownerPath,
    expectRejection: true,
    execute: () => cleanupJsonlAuditFileLock(
      candidateFile,
      mismatchedFingerprint
    )
  });
  const candidateFailure = candidateRun.failure;
  const candidateSerialized = JSON.stringify({
    name: candidateFailure?.name,
    message: candidateFailure?.message,
    details: candidateFailure?.details
  });
  if (
    !(candidateFailure instanceof JsonlAuditLockMaintenanceError)
    || !candidateRun.closeInjected
    || candidateRun.observedCloseCount !== 1
    || candidateFailure.message !== "Audit file lock owner fingerprint does not match."
    || candidateFailure.details.operation !== "active_lock_cleanup"
    || candidateFailure.details.handlesClosed !== false
    || !candidateFailure.details.handleWarning?.includes(candidateCloseMessage)
    || !(await pathExists(candidateLock.lockPath))
    || candidateSerialized.includes(candidateLock.ownerToken)
  ) {
    throw new Error("built candidate rejection finalization evidence failed");
  }

  const cleanupPreflight = await countSelectedOpens(
    cleanupLock.lockPath,
    () => cleanupAuditLock(envFor(cleanupFile), path.dirname(cleanupFile))
  );
  const cleanupFingerprint = cleanupPreflight.result.checks[0]?.details
    ?.coordination_lock_owner_fingerprint;
  const cleanupCloseMessage = "built rejected cleanup close failure";
  const savedMkdtemp = fs.mkdtemp;
  let cleanupRun;
  try {
    fs.mkdtemp = async () => {
      throw new Error("built rejected cleanup primary failure");
    };
    cleanupRun = await runWithCloseFailure({
      targetPath: cleanupLock.lockPath,
      targetOpen: cleanupPreflight.selectedOpenCount + 1,
      message: cleanupCloseMessage,
      execute: () => cleanupAuditLock(
        envFor(cleanupFile),
        path.dirname(cleanupFile),
        { dryRun: false, expectedOwnerFingerprint: cleanupFingerprint }
      )
    });
  } finally {
    fs.mkdtemp = savedMkdtemp;
  }
  const cleanupReport = cleanupRun.result;
  const cleanupDetails = cleanupReport.checks[0]?.details;
  const cleanupRendered = `${renderAuditLockCleanupReport(cleanupReport)}\n${renderAuditLockCleanupReportJson(cleanupReport)}`;
  if (
    typeof cleanupFingerprint !== "string"
    || cleanupPreflight.selectedOpenCount < 1
    || !cleanupRun.closeInjected
    || cleanupReport.ok !== false
    || cleanupReport.checks[0]?.status !== "error"
    || cleanupReport.checks[0]?.message !== "built rejected cleanup primary failure"
    || cleanupDetails?.coordination_lock_exists !== true
    || cleanupDetails?.removed !== false
    || cleanupDetails?.cleanup_handles_closed !== false
    || !cleanupDetails?.cleanup_handle_warning?.includes(cleanupCloseMessage)
    || !(await pathExists(cleanupLock.lockPath))
    || !cleanupRendered.includes("cleanup_handle_warning")
    || cleanupRendered.includes(cleanupLock.ownerToken)
  ) {
    throw new Error("built rejected cleanup CLI projection failed");
  }

  const recoveryPreflight = await countSelectedOpens(
    recoveryPath,
    () => recoverAuditLockQuarantine(
      envFor(recoveryFile),
      path.dirname(recoveryFile),
      recoveryId
    )
  );
  const recoveryFingerprint = recoveryPreflight.result.checks[0]?.details
    ?.owner_fingerprint;
  const recoveryCloseMessage = "built rejected recovery close failure";
  const savedMkdir = fs.mkdir;
  const invokeMkdir = savedMkdir.bind(fs);
  let recoveryRun;
  try {
    fs.mkdir = async (...args) => {
      if (path.basename(String(args[0])) === path.basename(recoveryLock.lockPath)) {
        throw new Error("built rejected recovery primary failure");
      }
      return invokeMkdir(...args);
    };
    recoveryRun = await runWithCloseFailure({
      targetPath: recoveryPath,
      targetOpen: recoveryPreflight.selectedOpenCount + 1,
      message: recoveryCloseMessage,
      execute: () => recoverAuditLockQuarantine(
        envFor(recoveryFile),
        path.dirname(recoveryFile),
        recoveryId,
        { dryRun: false, expectedOwnerFingerprint: recoveryFingerprint }
      )
    });
  } finally {
    fs.mkdir = savedMkdir;
  }
  const recoveryReport = recoveryRun.result;
  const recoveryDetails = recoveryReport.checks[0]?.details;
  const recoveryRendered = `${renderAuditLockQuarantineRecoveryReport(recoveryReport)}\n${renderAuditLockQuarantineRecoveryReportJson(recoveryReport)}`;
  if (
    typeof recoveryFingerprint !== "string"
    || recoveryPreflight.selectedOpenCount < 1
    || !recoveryRun.closeInjected
    || recoveryReport.ok !== false
    || recoveryReport.checks[0]?.status !== "error"
    || recoveryReport.checks[0]?.message !== "built rejected recovery primary failure"
    || recoveryDetails?.coordination_lock_exists !== false
    || recoveryDetails?.quarantine_exists !== true
    || recoveryDetails?.recovered !== false
    || recoveryDetails?.recovery_handles_closed !== false
    || !recoveryDetails?.recovery_handle_warning?.includes(recoveryCloseMessage)
    || await pathExists(recoveryLock.lockPath)
    || !(await pathExists(recoveryPath))
    || !recoveryRendered.includes("recovery_handle_warning")
    || recoveryRendered.includes(recoveryLock.ownerToken)
  ) {
    throw new Error("built rejected recovery CLI projection failed");
  }
} finally {
  for (const lock of acquiredLocks.reverse()) {
    await lock.abandon();
  }
  await Promise.all([...cleanupPaths].map((target) =>
    fs.rm(target, { recursive: true, force: true })
  ));
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_MAINTENANCE_REJECTION_FINALIZATION_FILE}"

AUDIT_MAINTENANCE_TRANSIENT_OPENER_FILE="${SMOKE_ROOT}/audit/maintenance-transient-opener.jsonl"
echo "==> built audit maintenance transient opener handle handoff"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  JsonlAuditLockMaintenanceError,
  acquireJsonlAuditFileLock,
  cleanupJsonlAuditFileLock,
  getJsonlAuditLockQuarantinePath,
  inspectJsonlAuditFileLock,
  inspectJsonlAuditLockQuarantine
} = await import(pathToFileURL(process.argv[1]).href);
const {
  cleanupAuditEmptyLockQuarantine,
  renderAuditEmptyLockQuarantineCleanupReport,
  renderAuditEmptyLockQuarantineCleanupReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const basePath = process.argv[3];
await fs.mkdir(path.dirname(basePath), { recursive: true, mode: 0o700 });
const cleanupPaths = new Set();
const acquiredLocks = [];
const envFor = (target) => ({ GOD_CODE_AUDIT_FILE: target });
const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

async function countSelectedOpens(targetPath, execute) {
  const savedOpen = fs.open;
  const invokeOpen = savedOpen.bind(fs);
  let selectedOpenCount = 0;
  try {
    fs.open = async (...args) => {
      const handle = await invokeOpen(...args);
      if (path.resolve(String(args[0])) === path.resolve(targetPath)) {
        selectedOpenCount += 1;
      }
      return handle;
    };
    return { result: await execute(), selectedOpenCount };
  } finally {
    fs.open = savedOpen;
  }
}

try {
  const candidateFile = `${basePath}.candidate`;
  cleanupPaths.add(candidateFile);
  const candidateLock = await acquireJsonlAuditFileLock(candidateFile);
  acquiredLocks.push(candidateLock);
  cleanupPaths.add(candidateLock.lockPath);
  const candidateFingerprint = (await inspectJsonlAuditFileLock(candidateFile))
    .ownerFingerprint;
  const savedCandidateOpen = fs.open;
  const invokeCandidateOpen = savedCandidateOpen.bind(fs);
  let candidateInjected = false;
  let candidateCloseCount = 0;
  let candidateCloseCompletion;
  let candidateFailure;
  try {
    fs.open = async (...args) => {
      const handle = await invokeCandidateOpen(...args);
      if (
        !candidateInjected
        && path.resolve(String(args[0])) === path.resolve(candidateLock.lockPath)
      ) {
        candidateInjected = true;
        handle.stat = async () => {
          throw new Error("built transient candidate opener primary failure");
        };
        const close = handle.close.bind(handle);
        handle.close = () => {
          candidateCloseCount += 1;
          candidateCloseCompletion = close();
          throw new Error("built transient candidate opener close failure");
        };
      }
      return handle;
    };
    try {
      await cleanupJsonlAuditFileLock(candidateFile, candidateFingerprint);
    } catch (error) {
      candidateFailure = error;
    }
  } finally {
    fs.open = savedCandidateOpen;
    await candidateCloseCompletion;
  }
  if (
    typeof candidateFingerprint !== "string"
    || !candidateInjected
    || candidateCloseCount !== 1
    || !(candidateFailure instanceof JsonlAuditLockMaintenanceError)
    || candidateFailure.message
      !== "built transient candidate opener primary failure"
    || candidateFailure.details.operation !== "active_lock_cleanup"
    || candidateFailure.details.handlesClosed !== false
    || !candidateFailure.details.handleWarning?.includes(
      "built transient candidate opener close failure"
    )
    || !(await pathExists(candidateLock.lockPath))
    || `${candidateFailure.message} ${candidateFailure.details.handleWarning}`
      .includes(candidateLock.ownerToken)
  ) {
    throw new Error("built transient candidate opener handoff failed");
  }

  const emptyFile = `${basePath}.empty`;
  const quarantineId = "P57801";
  const quarantinePath = getJsonlAuditLockQuarantinePath(
    emptyFile,
    quarantineId
  );
  cleanupPaths.add(emptyFile);
  cleanupPaths.add(quarantinePath);
  await fs.mkdir(quarantinePath, { mode: 0o700 });
  const emptyFingerprint = (await inspectJsonlAuditLockQuarantine(
    emptyFile,
    quarantineId
  )).emptyDirectoryFingerprint;
  const preflight = await countSelectedOpens(
    quarantinePath,
    () => cleanupAuditEmptyLockQuarantine(
      envFor(emptyFile),
      path.dirname(emptyFile),
      quarantineId
    )
  );
  const savedEmptyOpen = fs.open;
  const invokeEmptyOpen = savedEmptyOpen.bind(fs);
  let selectedOpenCount = 0;
  let emptyCloseInjected = false;
  let emptyCloseCompletion;
  let emptyReport;
  try {
    fs.open = async (...args) => {
      const handle = await invokeEmptyOpen(...args);
      if (path.resolve(String(args[0])) === path.resolve(quarantinePath)) {
        selectedOpenCount += 1;
        if (selectedOpenCount === preflight.selectedOpenCount + 2) {
          emptyCloseInjected = true;
          const close = handle.close.bind(handle);
          handle.close = () => {
            emptyCloseCompletion = close();
            throw new Error("built transient assertion close failure");
          };
        }
      }
      return handle;
    };
    emptyReport = await cleanupAuditEmptyLockQuarantine(
      envFor(emptyFile),
      path.dirname(emptyFile),
      quarantineId,
      { dryRun: false, expectedQuarantineFingerprint: emptyFingerprint }
    );
  } finally {
    fs.open = savedEmptyOpen;
    await emptyCloseCompletion;
  }
  const emptyDetails = emptyReport.checks[0]?.details;
  const emptyRendered = `${renderAuditEmptyLockQuarantineCleanupReport(emptyReport)}\n${renderAuditEmptyLockQuarantineCleanupReportJson(emptyReport)}`;
  if (
    typeof emptyFingerprint !== "string"
    || preflight.selectedOpenCount < 1
    || !emptyCloseInjected
    || emptyReport.ok !== true
    || emptyReport.checks[0]?.status !== "warn"
    || emptyDetails?.quarantine_exists !== false
    || emptyDetails?.removed !== true
    || emptyDetails?.cleanup_handles_closed !== false
    || !emptyDetails?.cleanup_handle_warning?.includes(
      "built transient assertion close failure"
    )
    || await pathExists(quarantinePath)
    || !emptyRendered.includes("descriptor finalization")
    || !emptyRendered.includes("cleanup_handle_warning")
  ) {
    throw new Error("built transient assertion result preservation failed");
  }
} finally {
  for (const lock of acquiredLocks.reverse()) {
    await lock.abandon();
  }
  await Promise.all([...cleanupPaths].map((target) =>
    fs.rm(target, { recursive: true, force: true })
  ));
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_MAINTENANCE_TRANSIENT_OPENER_FILE}"

AUDIT_MAINTENANCE_DIRECTORY_STREAM_FILE="${SMOKE_ROOT}/audit/maintenance-directory-stream.jsonl"
echo "==> built audit maintenance directory stream finalization evidence"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  JsonlAuditLockMaintenanceError,
  acquireJsonlAuditFileLock,
  cleanupJsonlAuditFileLock,
  inspectJsonlAuditFileLock
} = await import(pathToFileURL(process.argv[1]).href);
const {
  cleanupAuditLock,
  renderAuditLockCleanupReport,
  renderAuditLockCleanupReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const basePath = process.argv[3];
await fs.mkdir(path.dirname(basePath), { recursive: true, mode: 0o700 });
const cleanupPaths = new Set();
const acquiredLocks = [];
const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

function injectDirectoryStreamFailure(targetStream, closeMessage, readMessage) {
  const savedOpendir = fs.opendir;
  const invokeOpendir = savedOpendir.bind(fs);
  const state = {
    selectedStreamCount: 0,
    selectedCloseCount: 0,
    closeCompletion: undefined
  };
  fs.opendir = async (...args) => {
    const stream = await invokeOpendir(...args);
    state.selectedStreamCount += 1;
    if (state.selectedStreamCount === targetStream) {
      if (readMessage !== undefined) {
        stream.read = async () => {
          throw new Error(readMessage);
        };
      }
      const close = stream.close.bind(stream);
      stream.close = () => {
        state.selectedCloseCount += 1;
        state.closeCompletion = close();
        throw new Error(closeMessage);
      };
    }
    return stream;
  };
  return {
    state,
    restore: () => {
      fs.opendir = savedOpendir;
    }
  };
}

try {
  const runtimeFile = `${basePath}.runtime`;
  cleanupPaths.add(runtimeFile);
  const runtimeLock = await acquireJsonlAuditFileLock(runtimeFile);
  acquiredLocks.push(runtimeLock);
  cleanupPaths.add(runtimeLock.lockPath);
  const runtimeFingerprint = (await inspectJsonlAuditFileLock(runtimeFile))
    .ownerFingerprint;
  const runtimeCloseMessage = "built candidate stream secondary close failure";
  const runtimeReadMessage = "built candidate stream primary read failure";
  const runtimeInjection = injectDirectoryStreamFailure(
    1,
    runtimeCloseMessage,
    runtimeReadMessage
  );
  let runtimeFailure;
  try {
    await cleanupJsonlAuditFileLock(runtimeFile, runtimeFingerprint);
  } catch (error) {
    runtimeFailure = error;
  } finally {
    runtimeInjection.restore();
    await runtimeInjection.state.closeCompletion;
  }
  if (
    typeof runtimeFingerprint !== "string"
    || runtimeInjection.state.selectedStreamCount !== 1
    || runtimeInjection.state.selectedCloseCount !== 1
    || !(runtimeFailure instanceof JsonlAuditLockMaintenanceError)
    || runtimeFailure.message !== runtimeReadMessage
    || runtimeFailure.details.operation !== "active_lock_cleanup"
    || runtimeFailure.details.handlesClosed !== false
    || !runtimeFailure.details.handleWarning?.includes(runtimeCloseMessage)
    || !(await pathExists(runtimeLock.lockPath))
    || `${runtimeFailure.message} ${runtimeFailure.details.handleWarning}`
      .includes(runtimeLock.ownerToken)
  ) {
    throw new Error("built candidate stream primary preservation failed");
  }

  const cliFile = `${basePath}.cli`;
  cleanupPaths.add(cliFile);
  const cliLock = await acquireJsonlAuditFileLock(cliFile);
  acquiredLocks.push(cliLock);
  cleanupPaths.add(cliLock.lockPath);
  const cliFingerprint = (await inspectJsonlAuditFileLock(cliFile))
    .ownerFingerprint;
  const cliCloseMessage = "built CLI candidate stream close failure";
  const cliInjection = injectDirectoryStreamFailure(3, cliCloseMessage);
  let cliReport;
  try {
    cliReport = await cleanupAuditLock(
      { GOD_CODE_AUDIT_FILE: cliFile },
      path.dirname(cliFile),
      { dryRun: false, expectedOwnerFingerprint: cliFingerprint }
    );
  } finally {
    cliInjection.restore();
    await cliInjection.state.closeCompletion;
  }
  const cliDetails = cliReport.checks[0]?.details;
  const cliRendered = `${renderAuditLockCleanupReport(cliReport)}\n${renderAuditLockCleanupReportJson(cliReport)}`;
  if (
    typeof cliFingerprint !== "string"
    || cliInjection.state.selectedStreamCount <= 3
    || cliInjection.state.selectedCloseCount !== 1
    || cliReport.ok !== true
    || cliReport.checks[0]?.status !== "warn"
    || cliDetails?.coordination_lock_exists !== false
    || cliDetails?.removed !== true
    || cliDetails?.cleanup_handles_closed !== false
    || !cliDetails?.cleanup_handle_warning?.includes(cliCloseMessage)
    || await pathExists(cliLock.lockPath)
    || !cliRendered.includes("descriptor finalization")
    || !cliRendered.includes("cleanup_handle_warning")
    || cliRendered.includes(cliLock.ownerToken)
  ) {
    throw new Error("built CLI candidate stream result preservation failed");
  }
} finally {
  for (const lock of acquiredLocks.reverse()) {
    await lock.abandon();
  }
  await Promise.all([...cleanupPaths].map((target) =>
    fs.rm(target, { recursive: true, force: true })
  ));
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_MAINTENANCE_DIRECTORY_STREAM_FILE}"

AUDIT_MAINTENANCE_CLOSE_TIMEOUT_FILE="${SMOKE_ROOT}/audit/maintenance-close-timeout.jsonl"
echo "==> built audit maintenance descriptor close settlement timeout"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  acquireJsonlAuditFileLock,
  inspectJsonlAuditFileLock
} = await import(pathToFileURL(process.argv[1]).href);
const {
  cleanupAuditLock,
  renderAuditLockCleanupReport,
  renderAuditLockCleanupReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const filePath = process.argv[3];
await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
const lock = await acquireJsonlAuditFileLock(filePath);
const ownerFingerprint = (await inspectJsonlAuditFileLock(filePath))
  .ownerFingerprint;
const savedOpendir = fs.opendir;
const invokeOpendir = savedOpendir.bind(fs);
const savedSetTimeout = globalThis.setTimeout;
let resolvePendingClose;
let rejectPendingClose;
const pendingClose = new Promise((resolve, reject) => {
  resolvePendingClose = resolve;
  rejectPendingClose = reject;
});
let selectedStreamCount = 0;
let selectedCloseCount = 0;
let actualCloseCompletion;
const unhandledRejections = [];
const onUnhandledRejection = (reason) => {
  unhandledRejections.push(reason);
};
process.on("unhandledRejection", onUnhandledRejection);
try {
  fs.opendir = async (...args) => {
    const stream = await invokeOpendir(...args);
    selectedStreamCount += 1;
    if (selectedStreamCount === 3) {
      const close = stream.close.bind(stream);
      stream.close = () => {
        selectedCloseCount += 1;
        actualCloseCompletion = close();
        return pendingClose;
      };
    }
    return stream;
  };
  globalThis.setTimeout = (callback, delay, ...args) => savedSetTimeout(
    callback,
    delay === 5_000 ? 25 : delay,
    ...args
  );
  const report = await cleanupAuditLock(
    { GOD_CODE_AUDIT_FILE: filePath },
    path.dirname(filePath),
    { dryRun: false, expectedOwnerFingerprint: ownerFingerprint }
  );
  globalThis.setTimeout = savedSetTimeout;
  rejectPendingClose(new Error("built late close rejection"));
  await actualCloseCompletion;
  await new Promise((resolve) => savedSetTimeout(resolve, 25));
  const details = report.checks[0]?.details;
  const rendered = `${renderAuditLockCleanupReport(report)}\n${renderAuditLockCleanupReportJson(report)}`;
  let lockExists = true;
  try {
    await fs.access(lock.lockPath);
  } catch {
    lockExists = false;
  }
  if (
    typeof ownerFingerprint !== "string"
    || selectedStreamCount <= 3
    || selectedCloseCount !== 1
    || report.ok !== true
    || report.checks[0]?.status !== "warn"
    || details?.coordination_lock_exists !== false
    || details?.removed !== true
    || details?.cleanup_handles_closed !== false
    || !details?.cleanup_handle_warning?.includes(
      "maintenance descriptor close timed out after 5000 ms"
    )
    || details?.cleanup_handle_warning?.includes("built late close rejection")
    || lockExists
    || unhandledRejections.length !== 0
    || !rendered.includes("descriptor finalization")
    || !rendered.includes("cleanup_handle_warning")
    || rendered.includes(lock.ownerToken)
  ) {
    throw new Error("built maintenance close settlement timeout failed");
  }
} finally {
  fs.opendir = savedOpendir;
  globalThis.setTimeout = savedSetTimeout;
  resolvePendingClose?.();
  await actualCloseCompletion;
  process.off("unhandledRejection", onUnhandledRejection);
  await lock.abandon();
  await fs.rm(filePath, { force: true });
  await fs.rm(lock.lockPath, { recursive: true, force: true });
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_MAINTENANCE_CLOSE_TIMEOUT_FILE}"

AUDIT_INSPECTION_CLOSE_TIMEOUT_FILE="${SMOKE_ROOT}/audit/inspection-close-timeout.jsonl"
echo "==> built audit inspection descriptor close settlement timeout"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  acquireJsonlAuditFileLock,
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockQuarantinePath
} = await import(pathToFileURL(process.argv[1]).href);
const {
  inspectAuditLockQuarantine,
  inspectAuditRotationStagings,
  renderAuditRotationStagingReport,
  renderAuditRotationStagingReportJson,
  renderAuditTargetedLockQuarantineReport,
  renderAuditTargetedLockQuarantineReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const basePath = process.argv[3];
await fs.mkdir(path.dirname(basePath), { recursive: true, mode: 0o700 });
const savedSetTimeout = globalThis.setTimeout;
const unhandledRejections = [];
const onUnhandledRejection = (reason) => {
  unhandledRejections.push(reason);
};
process.on("unhandledRejection", onUnhandledRejection);

async function runWithPendingInspectionStream(execute, lateMessage) {
  const savedOpendir = fs.opendir;
  const invokeOpendir = savedOpendir.bind(fs);
  let resolvePendingClose;
  let rejectPendingClose;
  const pendingClose = new Promise((resolve, reject) => {
    resolvePendingClose = resolve;
    rejectPendingClose = reject;
  });
  const state = {
    selectedStreamCount: 0,
    selectedCloseCount: 0,
    actualCloseCompletion: undefined
  };
  try {
    fs.opendir = async (...args) => {
      const stream = await invokeOpendir(...args);
      state.selectedStreamCount += 1;
      if (state.selectedStreamCount === 1) {
        const close = stream.close.bind(stream);
        stream.close = () => {
          state.selectedCloseCount += 1;
          state.actualCloseCompletion = close();
          return pendingClose;
        };
      }
      return stream;
    };
    const result = await execute();
    fs.opendir = savedOpendir;
    rejectPendingClose(new Error(lateMessage));
    await state.actualCloseCompletion;
    await new Promise((resolve) => savedSetTimeout(resolve, 25));
    return { result, state };
  } finally {
    fs.opendir = savedOpendir;
    resolvePendingClose?.();
    await state.actualCloseCompletion;
  }
}

let lock;
const cleanupPaths = new Set([basePath]);
try {
  globalThis.setTimeout = (callback, delay, ...args) => savedSetTimeout(
    callback,
    delay === 5_000 ? 25 : delay,
    ...args
  );

  const parentFile = `${basePath}.parent`;
  cleanupPaths.add(parentFile);
  const parentEntriesBefore = await fs.readdir(path.dirname(parentFile));
  const parentRun = await runWithPendingInspectionStream(
    () => inspectAuditRotationStagings(
      { GOD_CODE_AUDIT_FILE: parentFile },
      path.dirname(parentFile)
    ),
    "built late parent inspection close rejection"
  );
  const parentReport = parentRun.result;
  const parentRendered = `${renderAuditRotationStagingReport(parentReport)}\n${renderAuditRotationStagingReportJson(parentReport)}`;
  if (
    parentRun.state.selectedStreamCount !== 1
    || parentRun.state.selectedCloseCount !== 1
    || parentReport.ok !== false
    || parentReport.checks[0]?.status !== "error"
    || parentReport.checks[0]?.message
      !== "audit inspection descriptor close timed out after 5000 ms"
    || parentReport.checks[0]?.details?.scanned_entry_count !== 0
    || parentReport.checks[0]?.details?.stagings?.length !== 0
    || !parentRendered.includes("ERROR audit_rotation_stagings")
    || parentRendered.includes("built late parent inspection close rejection")
    || JSON.stringify(await fs.readdir(path.dirname(parentFile)))
      !== JSON.stringify(parentEntriesBefore)
  ) {
    throw new Error("built parent inspection close timeout failed");
  }

  const quarantineFile = `${basePath}.quarantine`;
  cleanupPaths.add(quarantineFile);
  lock = await acquireJsonlAuditFileLock(quarantineFile);
  cleanupPaths.add(lock.lockPath);
  const quarantineId = "P58104";
  const quarantinePath = getJsonlAuditLockQuarantinePath(
    quarantineFile,
    quarantineId
  );
  cleanupPaths.add(quarantinePath);
  await fs.mkdir(quarantinePath, { mode: 0o700 });
  await fs.copyFile(lock.ownerPath, getJsonlAuditLockOwnerPath(quarantinePath));
  const quarantineRun = await runWithPendingInspectionStream(
    () => inspectAuditLockQuarantine(
      { GOD_CODE_AUDIT_FILE: quarantineFile },
      path.dirname(quarantineFile),
      quarantineId
    ),
    "built late quarantine inspection close rejection"
  );
  const quarantineReport = quarantineRun.result;
  const quarantineDetails = quarantineReport.checks[0]?.details?.quarantine;
  const quarantineRendered = `${renderAuditTargetedLockQuarantineReport(quarantineReport)}\n${renderAuditTargetedLockQuarantineReportJson(quarantineReport)}`;
  if (
    quarantineRun.state.selectedCloseCount !== 1
    || quarantineReport.ok !== true
    || quarantineReport.checks[0]?.status !== "warn"
    || quarantineDetails?.exists !== true
    || quarantineDetails?.layout !== "unknown"
    || quarantineDetails?.inspection_error_code !== "inspection_failed"
    || quarantineDetails?.owner_fingerprint !== undefined
    || quarantineRendered.includes(lock.ownerToken)
    || quarantineRendered.includes(
      "built late quarantine inspection close rejection"
    )
    || !(await fs.stat(quarantinePath)).isDirectory()
    || !(await fs.stat(getJsonlAuditLockOwnerPath(quarantinePath))).isFile()
  ) {
    throw new Error("built targeted inspection close timeout failed");
  }
  if (unhandledRejections.length !== 0) {
    throw new Error("built inspection timeout produced unhandled rejection");
  }
} finally {
  globalThis.setTimeout = savedSetTimeout;
  process.off("unhandledRejection", onUnhandledRejection);
  await lock?.abandon();
  await Promise.all([...cleanupPaths].map((target) =>
    fs.rm(target, { recursive: true, force: true })
  ));
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_INSPECTION_CLOSE_TIMEOUT_FILE}"

AUDIT_RECOVERY_CLOSE_TIMEOUT_FILE="${SMOKE_ROOT}/audit/recovery-close-timeout.jsonl"
echo "==> built audit rotation recovery candidate close settlement timeout"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  getJsonlAuditLockPath,
  getJsonlAuditRotationStagingPath
} = await import(pathToFileURL(process.argv[1]).href);
const {
  recoverAuditRotationStaging,
  renderAuditRotationStagingRecoveryReport,
  renderAuditRotationStagingRecoveryReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const filePath = process.argv[3];
const parentPath = path.dirname(filePath);
const rotatedPath = `${filePath}.1`;
const stagingId = "P58201";
const stagingPath = getJsonlAuditRotationStagingPath(filePath, stagingId);
await fs.mkdir(parentPath, { recursive: true, mode: 0o700 });
await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
await fs.mkdir(stagingPath, { mode: 0o700 });
await fs.writeFile(
  path.join(stagingPath, "previous"),
  "previous-archive\n",
  { mode: 0o600 }
);
const dryRun = await recoverAuditRotationStaging(
  { GOD_CODE_AUDIT_FILE: filePath },
  parentPath,
  stagingId
);
const fingerprint = dryRun.checks[0]?.details?.recovery_fingerprint;
if (typeof fingerprint !== "string") {
  throw new Error("built recovery close timeout dry run lacked fingerprint");
}

const savedOpen = fs.open;
const invokeOpen = savedOpen.bind(fs);
const savedSetTimeout = globalThis.setTimeout;
let resolvePendingClose;
let rejectPendingClose;
const pendingClose = new Promise((resolve, reject) => {
  resolvePendingClose = resolve;
  rejectPendingClose = reject;
});
let selectedOpenCount = 0;
let selectedCloseCount = 0;
let parentCloseCount = 0;
let actualCloseCompletion;
const unhandledRejections = [];
const onUnhandledRejection = (reason) => {
  unhandledRejections.push(reason);
};
process.on("unhandledRejection", onUnhandledRejection);
try {
  globalThis.setTimeout = (callback, delay, ...args) => savedSetTimeout(
    callback,
    delay === 5_000 ? 25 : delay,
    ...args
  );
  fs.open = async (target, flags, mode) => {
    const handle = await invokeOpen(target, flags, mode);
    const targetPath = String(target);
    if (path.resolve(targetPath) === path.resolve(stagingPath)) {
      selectedOpenCount += 1;
      if (selectedOpenCount === 3) {
        const close = handle.close.bind(handle);
        handle.close = () => {
          selectedCloseCount += 1;
          actualCloseCompletion = close();
          return pendingClose;
        };
      }
    } else if (path.resolve(targetPath) === path.resolve(parentPath)) {
      const close = handle.close.bind(handle);
      handle.close = async () => {
        parentCloseCount += 1;
        await close();
      };
    }
    return handle;
  };

  const report = await recoverAuditRotationStaging(
    { GOD_CODE_AUDIT_FILE: filePath },
    parentPath,
    stagingId,
    {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    }
  );
  fs.open = savedOpen;
  rejectPendingClose(new Error("built late recovery close rejection"));
  await actualCloseCompletion;
  await new Promise((resolve) => savedSetTimeout(resolve, 25));
  const check = report.checks[0];
  const details = check?.details;
  const rendered = `${renderAuditRotationStagingRecoveryReport(report)}\n${renderAuditRotationStagingRecoveryReportJson(report)}`;
  let lockExists = true;
  try {
    await fs.access(getJsonlAuditLockPath(filePath));
  } catch (error) {
    if (error?.code === "ENOENT") {
      lockExists = false;
    } else {
      throw error;
    }
  }
  if (
    selectedOpenCount !== 3
    || selectedCloseCount !== 1
    || parentCloseCount !== 1
    || report.ok !== true
    || check?.status !== "warn"
    || details?.performed_action !== "restore_previous_archive"
    || details?.mutation_performed !== true
    || details?.recovered !== true
    || details?.staging_removed !== true
    || details?.recovery_handles_closed !== false
    || details?.recovery_handle_warning
      !== "recovery descriptor close failed: recovery descriptor close timed out after 5000 ms"
    || details?.coordination_lock_released !== true
    || lockExists
    || unhandledRejections.length !== 0
    || rendered.includes("built late recovery close rejection")
    || await fs.readFile(filePath, "utf8") !== "current-record\n"
    || await fs.readFile(rotatedPath, "utf8") !== "previous-archive\n"
  ) {
    throw new Error("built recovery candidate close timeout failed");
  }
  try {
    await fs.access(stagingPath);
    throw new Error("built recovery close timeout retained committed staging");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
} finally {
  fs.open = savedOpen;
  globalThis.setTimeout = savedSetTimeout;
  resolvePendingClose?.();
  await actualCloseCompletion;
  process.off("unhandledRejection", onUnhandledRejection);
  await fs.rm(filePath, { force: true });
  await fs.rm(rotatedPath, { force: true });
  await fs.rm(stagingPath, { recursive: true, force: true });
  await fs.rm(getJsonlAuditLockPath(filePath), { recursive: true, force: true });
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_RECOVERY_CLOSE_TIMEOUT_FILE}"

AUDIT_LOCK_LIFECYCLE_CLOSE_TIMEOUT_FILE="${SMOKE_ROOT}/audit/lock-lifecycle-close-timeout.jsonl"
echo "==> built audit cooperative lock lifecycle close settlement timeout"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockPath,
  getJsonlAuditRotationStagingPath
} = await import(pathToFileURL(process.argv[1]).href);
const {
  recoverAuditRotationStaging,
  renderAuditRotationStagingRecoveryReport,
  renderAuditRotationStagingRecoveryReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const filePath = process.argv[3];
const parentPath = path.dirname(filePath);
const rotatedPath = `${filePath}.1`;
const stagingId = "P58301";
const stagingPath = getJsonlAuditRotationStagingPath(filePath, stagingId);
const lockPath = getJsonlAuditLockPath(filePath);
const ownerPath = getJsonlAuditLockOwnerPath(lockPath);
await fs.mkdir(parentPath, { recursive: true, mode: 0o700 });
await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
await fs.mkdir(stagingPath, { mode: 0o700 });
await fs.writeFile(
  path.join(stagingPath, "previous"),
  "previous-archive\n",
  { mode: 0o600 }
);
const dryRun = await recoverAuditRotationStaging(
  { GOD_CODE_AUDIT_FILE: filePath },
  parentPath,
  stagingId
);
const fingerprint = dryRun.checks[0]?.details?.recovery_fingerprint;
if (typeof fingerprint !== "string") {
  throw new Error("built lock lifecycle timeout dry run lacked fingerprint");
}

const savedOpen = fs.open;
const invokeOpen = savedOpen.bind(fs);
const savedSetTimeout = globalThis.setTimeout;
let resolvePendingClose;
let rejectPendingClose;
const pendingClose = new Promise((resolve, reject) => {
  resolvePendingClose = resolve;
  rejectPendingClose = reject;
});
let resolveCloseStarted;
const closeStarted = new Promise((resolve) => {
  resolveCloseStarted = resolve;
});
let selectedOpenCount = 0;
let selectedCloseCount = 0;
let lockDirectoryCloseCount = 0;
let actualCloseCompletion;
const unhandledRejections = [];
const onUnhandledRejection = (reason) => {
  unhandledRejections.push(reason);
};
const isOpenTarget = (target, targetPath) => {
  const openedPath = String(target);
  return path.resolve(openedPath) === path.resolve(targetPath)
    || (openedPath.startsWith("/proc/self/fd/")
      && path.basename(openedPath) === path.basename(targetPath));
};
process.on("unhandledRejection", onUnhandledRejection);
try {
  globalThis.setTimeout = (callback, delay, ...args) => savedSetTimeout(
    callback,
    delay === 5_000 ? 25 : delay,
    ...args
  );
  fs.open = async (target, flags, mode) => {
    const handle = await invokeOpen(target, flags, mode);
    if (isOpenTarget(target, ownerPath)) {
      selectedOpenCount += 1;
      if (selectedOpenCount === 1) {
        const close = handle.close.bind(handle);
        handle.close = () => {
          selectedCloseCount += 1;
          actualCloseCompletion = close();
          resolveCloseStarted();
          return pendingClose;
        };
      }
    } else if (isOpenTarget(target, lockPath)) {
      const close = handle.close.bind(handle);
      handle.close = async () => {
        lockDirectoryCloseCount += 1;
        await close();
      };
    }
    return handle;
  };

  const reportPromise = recoverAuditRotationStaging(
    { GOD_CODE_AUDIT_FILE: filePath },
    parentPath,
    stagingId,
    {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    }
  );
  await closeStarted;
  const report = await reportPromise;
  fs.open = savedOpen;
  rejectPendingClose(new Error("built late lock lifecycle close rejection"));
  await actualCloseCompletion;
  await new Promise((resolve) => savedSetTimeout(resolve, 25));
  const check = report.checks[0];
  const details = check?.details;
  const rendered = `${renderAuditRotationStagingRecoveryReport(report)}\n${renderAuditRotationStagingRecoveryReportJson(report)}`;
  let lockExists = true;
  try {
    await fs.access(lockPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      lockExists = false;
    } else {
      throw error;
    }
  }
  if (
    selectedOpenCount !== 1
    || selectedCloseCount !== 1
    || lockDirectoryCloseCount !== 1
    || report.ok !== true
    || check?.status !== "warn"
    || details?.performed_action !== "restore_previous_archive"
    || details?.mutation_performed !== true
    || details?.recovered !== true
    || details?.staging_removed !== true
    || details?.recovery_handles_closed !== true
    || details?.coordination_lock_released !== false
    || details?.coordination_lock_warning
      !== "coordination lock release failed: audit lock lifecycle descriptor close timed out after 5000 ms"
    || details?.residual_coordination_lock_path !== undefined
    || lockExists
    || unhandledRejections.length !== 0
    || rendered.includes("coordination lock handle abandonment failed")
    || rendered.includes("built late lock lifecycle close rejection")
    || await fs.readFile(filePath, "utf8") !== "current-record\n"
    || await fs.readFile(rotatedPath, "utf8") !== "previous-archive\n"
  ) {
    throw new Error("built cooperative lock lifecycle close timeout failed");
  }
  try {
    await fs.access(stagingPath);
    throw new Error("built lock lifecycle close timeout retained committed staging");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
} finally {
  fs.open = savedOpen;
  globalThis.setTimeout = savedSetTimeout;
  resolvePendingClose?.();
  await actualCloseCompletion;
  process.off("unhandledRejection", onUnhandledRejection);
  await fs.rm(filePath, { force: true });
  await fs.rm(rotatedPath, { force: true });
  await fs.rm(stagingPath, { recursive: true, force: true });
  await fs.rm(lockPath, { recursive: true, force: true });
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_LOCK_LIFECYCLE_CLOSE_TIMEOUT_FILE}"

AUDIT_ACQUISITION_CLOSE_TIMEOUT_FILE="${SMOKE_ROOT}/audit/acquisition-close-timeout.jsonl"
echo "==> built audit lock acquisition descriptor close settlement timeout"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  getJsonlAuditLockPath,
  getJsonlAuditRotationStagingPath
} = await import(pathToFileURL(process.argv[1]).href);
const {
  recoverAuditRotationStaging,
  renderAuditRotationStagingRecoveryReport,
  renderAuditRotationStagingRecoveryReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const filePath = process.argv[3];
const parentPath = path.dirname(filePath);
const rotatedPath = `${filePath}.1`;
const stagingId = "P58401";
const stagingPath = getJsonlAuditRotationStagingPath(filePath, stagingId);
const lockPath = getJsonlAuditLockPath(filePath);
await fs.mkdir(parentPath, { recursive: true, mode: 0o700 });
await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
await fs.mkdir(stagingPath, { mode: 0o700 });
await fs.writeFile(
  path.join(stagingPath, "previous"),
  "previous-archive\n",
  { mode: 0o600 }
);
const dryRun = await recoverAuditRotationStaging(
  { GOD_CODE_AUDIT_FILE: filePath },
  parentPath,
  stagingId
);
const fingerprint = dryRun.checks[0]?.details?.recovery_fingerprint;
if (typeof fingerprint !== "string") {
  throw new Error("built acquisition close timeout dry run lacked fingerprint");
}

const savedOpendir = fs.opendir;
const invokeOpendir = savedOpendir.bind(fs);
const savedSetTimeout = globalThis.setTimeout;
let resolvePendingClose;
let rejectPendingClose;
const pendingClose = new Promise((resolve, reject) => {
  resolvePendingClose = resolve;
  rejectPendingClose = reject;
});
let resolveCloseStarted;
const closeStarted = new Promise((resolve) => {
  resolveCloseStarted = resolve;
});
let selectedStreamCount = 0;
let selectedCloseCount = 0;
let actualCloseCompletion;
const unhandledRejections = [];
const onUnhandledRejection = (reason) => {
  unhandledRejections.push(reason);
};
process.on("unhandledRejection", onUnhandledRejection);
try {
  globalThis.setTimeout = (callback, delay, ...args) => savedSetTimeout(
    callback,
    delay === 5_000 ? 25 : delay,
    ...args
  );
  fs.opendir = async (target, options) => {
    const stream = await invokeOpendir(target, options);
    selectedStreamCount += 1;
    if (selectedStreamCount === 1) {
      const close = stream.close.bind(stream);
      stream.close = () => {
        selectedCloseCount += 1;
        actualCloseCompletion = close();
        resolveCloseStarted();
        return pendingClose;
      };
    }
    return stream;
  };

  const reportPromise = recoverAuditRotationStaging(
    { GOD_CODE_AUDIT_FILE: filePath },
    parentPath,
    stagingId,
    {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    }
  );
  await closeStarted;
  const report = await reportPromise;
  fs.opendir = savedOpendir;
  rejectPendingClose(new Error("built late acquisition close rejection"));
  await actualCloseCompletion;
  await new Promise((resolve) => savedSetTimeout(resolve, 25));
  const check = report.checks[0];
  const details = check?.details;
  const rendered = `${renderAuditRotationStagingRecoveryReport(report)}\n${renderAuditRotationStagingRecoveryReportJson(report)}`;
  let lockExists = true;
  try {
    await fs.access(lockPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      lockExists = false;
    } else {
      throw error;
    }
  }
  let rotatedExists = true;
  try {
    await fs.access(rotatedPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      rotatedExists = false;
    } else {
      throw error;
    }
  }
  if (
    selectedStreamCount < 2
    || selectedCloseCount !== 1
    || report.ok !== false
    || check?.status !== "error"
    || check?.message
      !== "audit lock acquisition descriptor close timed out after 5000 ms"
    || details?.failure_stage !== "lock_acquisition"
    || details?.mutation_state !== "not_started"
    || details?.mutation_attempted !== false
    || details?.rollback_attempted !== false
    || details?.recovered !== false
    || details?.coordination_lock_acquired !== false
    || lockExists
    || rotatedExists
    || unhandledRejections.length !== 0
    || rendered.includes("built late acquisition close rejection")
    || await fs.readFile(filePath, "utf8") !== "current-record\n"
    || await fs.readFile(path.join(stagingPath, "previous"), "utf8")
      !== "previous-archive\n"
  ) {
    throw new Error("built audit acquisition close timeout failed");
  }
} finally {
  fs.opendir = savedOpendir;
  globalThis.setTimeout = savedSetTimeout;
  resolvePendingClose?.();
  await actualCloseCompletion;
  process.off("unhandledRejection", onUnhandledRejection);
  await fs.rm(filePath, { force: true });
  await fs.rm(rotatedPath, { force: true });
  await fs.rm(stagingPath, { recursive: true, force: true });
  await fs.rm(lockPath, { recursive: true, force: true });
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_ACQUISITION_CLOSE_TIMEOUT_FILE}"

AUDIT_WRITER_CLOSE_TIMEOUT_FILE="${SMOKE_ROOT}/audit/writer-close-timeout.jsonl"
echo "==> built audit writer descriptor close settlement timeout"
node --input-type=module -e '
import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  JsonlAuditSink,
  getJsonlAuditLockPath
} = await import(pathToFileURL(process.argv[1]).href);
const filePath = process.argv[2];
const parentPath = path.dirname(filePath);
const lockPath = getJsonlAuditLockPath(filePath);
await fs.mkdir(parentPath, { recursive: true, mode: 0o700 });

const savedOpen = fs.open;
const invokeOpen = savedOpen.bind(fs);
const savedSetTimeout = globalThis.setTimeout;
let resolvePendingClose;
let rejectPendingClose;
const pendingClose = new Promise((resolve, reject) => {
  resolvePendingClose = resolve;
  rejectPendingClose = reject;
});
let resolveCloseStarted;
const closeStarted = new Promise((resolve) => {
  resolveCloseStarted = resolve;
});
let selectedOpenCount = 0;
let selectedCloseCount = 0;
let actualCloseCompletion;
const unhandledRejections = [];
const onUnhandledRejection = (reason) => {
  unhandledRejections.push(reason);
};
const isOpenTarget = (target, targetPath) => {
  const openedPath = String(target);
  return path.resolve(openedPath) === path.resolve(targetPath)
    || (openedPath.startsWith("/proc/self/fd/")
      && path.basename(openedPath) === path.basename(targetPath));
};
const createEvent = (toolCallId) => ({
  type: "tool_requested",
  request: {
    session_id: "built-writer-session",
    turn_id: "built-writer-turn",
    tool_call_id: toolCallId,
    tool_name: "Read",
    input: { path: "built-writer.txt" }
  },
  context: {
    cwd: parentPath,
    provider: "fake",
    model: "fake-model"
  }
});
process.on("unhandledRejection", onUnhandledRejection);
try {
  globalThis.setTimeout = (callback, delay, ...args) => savedSetTimeout(
    callback,
    delay === 5_000 ? 25 : delay,
    ...args
  );
  fs.open = async (target, flags, mode) => {
    const handle = await invokeOpen(target, flags, mode);
    if (
      selectedOpenCount === 0
      && isOpenTarget(target, filePath)
      && typeof flags === "number"
      && (flags & constants.O_APPEND) === constants.O_APPEND
    ) {
      selectedOpenCount += 1;
      const close = handle.close.bind(handle);
      handle.close = () => {
        selectedCloseCount += 1;
        actualCloseCompletion = close();
        resolveCloseStarted();
        return pendingClose;
      };
    }
    return handle;
  };

  const sink = new JsonlAuditSink(
    filePath,
    () => new Date("2026-07-26T08:00:00.000Z")
  );
  const recordPromise = sink.record(createEvent("built-writer-first"))
    .catch((error) => error);
  await closeStarted;
  const failure = await recordPromise;
  fs.open = savedOpen;
  globalThis.setTimeout = savedSetTimeout;
  rejectPendingClose(new Error("built late writer close rejection"));
  await actualCloseCompletion;
  await new Promise((resolve) => savedSetTimeout(resolve, 25));

  let lockExists = true;
  try {
    await fs.access(lockPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      lockExists = false;
    } else {
      throw error;
    }
  }
  const committedLines = (await fs.readFile(filePath, "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  if (
    selectedOpenCount !== 1
    || selectedCloseCount !== 1
    || failure?.message
      !== "audit writer descriptor close timed out after 5000 ms"
    || committedLines.length !== 1
    || committedLines[0]?.event?.request?.tool_call_id !== "built-writer-first"
    || lockExists
    || unhandledRejections.length !== 0
    || JSON.stringify(failure).includes("built late writer close rejection")
  ) {
    throw new Error("built audit writer close timeout failed");
  }

  await sink.record(createEvent("built-writer-second"));
  const finalLines = (await fs.readFile(filePath, "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  if (
    finalLines.length !== 2
    || finalLines[0]?.event?.request?.tool_call_id !== "built-writer-first"
    || finalLines[1]?.event?.request?.tool_call_id !== "built-writer-second"
    || unhandledRejections.length !== 0
  ) {
    throw new Error("built audit writer tail recovery failed");
  }
} finally {
  fs.open = savedOpen;
  globalThis.setTimeout = savedSetTimeout;
  resolvePendingClose?.();
  await actualCloseCompletion;
  process.off("unhandledRejection", onUnhandledRejection);
  await fs.rm(filePath, { force: true });
  await fs.rm(lockPath, { recursive: true, force: true });
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${AUDIT_WRITER_CLOSE_TIMEOUT_FILE}"

AUDIT_LIFECYCLE_STREAM_CLOSE_TIMEOUT_FILE="${SMOKE_ROOT}/audit/lifecycle-stream-close-timeout.jsonl"
echo "==> built audit cooperative lock lifecycle stream close settlement timeout"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  getJsonlAuditLockOwnerPath,
  getJsonlAuditLockPath,
  getJsonlAuditRotationStagingPath
} = await import(pathToFileURL(process.argv[1]).href);
const {
  recoverAuditRotationStaging,
  renderAuditRotationStagingRecoveryReport,
  renderAuditRotationStagingRecoveryReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const filePath = process.argv[3];
const parentPath = path.dirname(filePath);
const rotatedPath = `${filePath}.1`;
const stagingId = "P58601";
const stagingPath = getJsonlAuditRotationStagingPath(filePath, stagingId);
const lockPath = getJsonlAuditLockPath(filePath);
const ownerPath = getJsonlAuditLockOwnerPath(lockPath);
await fs.mkdir(parentPath, { recursive: true, mode: 0o700 });
await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
await fs.mkdir(stagingPath, { mode: 0o700 });
await fs.writeFile(
  path.join(stagingPath, "previous"),
  "previous-archive\n",
  { mode: 0o600 }
);
const dryRun = await recoverAuditRotationStaging(
  { GOD_CODE_AUDIT_FILE: filePath },
  parentPath,
  stagingId
);
const fingerprint = dryRun.checks[0]?.details?.recovery_fingerprint;
if (typeof fingerprint !== "string") {
  throw new Error("built lifecycle stream timeout dry run lacked fingerprint");
}

const savedOpendir = fs.opendir;
const invokeOpendir = savedOpendir.bind(fs);
const invokeRealpath = fs.realpath.bind(fs);
const invokeLstat = fs.lstat.bind(fs);
const savedSetTimeout = globalThis.setTimeout;
let resolvePendingClose;
let rejectPendingClose;
const pendingClose = new Promise((resolve, reject) => {
  resolvePendingClose = resolve;
  rejectPendingClose = reject;
});
let resolveCloseStarted;
const closeStarted = new Promise((resolve) => {
  resolveCloseStarted = resolve;
});
let lockStreamCount = 0;
let selectedCloseCount = 0;
let actualCloseCompletion;
const unhandledRejections = [];
const onUnhandledRejection = (reason) => {
  unhandledRejections.push(reason);
};
process.on("unhandledRejection", onUnhandledRejection);
try {
  globalThis.setTimeout = (callback, delay, ...args) => savedSetTimeout(
    callback,
    delay === 5_000 ? 25 : delay,
    ...args
  );
  fs.opendir = async (target, options) => {
    const stream = await invokeOpendir(target, options);
    let resolvedTarget;
    try {
      resolvedTarget = await invokeRealpath(String(target));
    } catch {
      resolvedTarget = path.resolve(String(target));
    }
    if (path.resolve(resolvedTarget) === path.resolve(lockPath)) {
      lockStreamCount += 1;
      let ownerMissing = false;
      try {
        await invokeLstat(ownerPath);
      } catch (error) {
        if (error?.code === "ENOENT") {
          ownerMissing = true;
        } else {
          throw error;
        }
      }
      if (ownerMissing && selectedCloseCount === 0) {
        const close = stream.close.bind(stream);
        stream.close = () => {
          selectedCloseCount += 1;
          actualCloseCompletion = close();
          resolveCloseStarted();
          return pendingClose;
        };
      }
    }
    return stream;
  };

  const reportPromise = recoverAuditRotationStaging(
    { GOD_CODE_AUDIT_FILE: filePath },
    parentPath,
    stagingId,
    {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    }
  );
  await closeStarted;
  const report = await reportPromise;
  fs.opendir = savedOpendir;
  globalThis.setTimeout = savedSetTimeout;
  rejectPendingClose(
    new Error("built late lifecycle stream close rejection")
  );
  await actualCloseCompletion;
  await new Promise((resolve) => savedSetTimeout(resolve, 25));

  const check = report.checks[0];
  const details = check?.details;
  const rendered = `${renderAuditRotationStagingRecoveryReport(report)}\n${renderAuditRotationStagingRecoveryReportJson(report)}`;
  let ownerExists = true;
  try {
    await fs.access(ownerPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      ownerExists = false;
    } else {
      throw error;
    }
  }
  if (
    lockStreamCount < 3
    || selectedCloseCount !== 1
    || report.ok !== true
    || check?.status !== "warn"
    || details?.performed_action !== "restore_previous_archive"
    || details?.mutation_performed !== true
    || details?.recovered !== true
    || details?.staging_removed !== true
    || details?.recovery_handles_closed !== true
    || details?.coordination_lock_released !== false
    || details?.residual_coordination_lock_path !== lockPath
    || details?.coordination_lock_warning
      !== "coordination lock release failed: audit lock lifecycle descriptor close timed out after 5000 ms"
    || ownerExists
    || (await fs.readdir(lockPath)).length !== 0
    || unhandledRejections.length !== 0
    || rendered.includes("coordination lock handle abandonment failed")
    || rendered.includes("built late lifecycle stream close rejection")
    || await fs.readFile(filePath, "utf8") !== "current-record\n"
    || await fs.readFile(rotatedPath, "utf8") !== "previous-archive\n"
  ) {
    throw new Error("built cooperative lock lifecycle stream timeout failed");
  }
  try {
    await fs.access(stagingPath);
    throw new Error("built lifecycle stream timeout retained committed staging");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
} finally {
  fs.opendir = savedOpendir;
  globalThis.setTimeout = savedSetTimeout;
  resolvePendingClose?.();
  await actualCloseCompletion;
  process.off("unhandledRejection", onUnhandledRejection);
  await fs.rm(filePath, { force: true });
  await fs.rm(rotatedPath, { force: true });
  await fs.rm(stagingPath, { recursive: true, force: true });
  await fs.rm(lockPath, { recursive: true, force: true });
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_LIFECYCLE_STREAM_CLOSE_TIMEOUT_FILE}"

AUDIT_RECOVERY_STREAM_CLOSE_TIMEOUT_FILE="${SMOKE_ROOT}/audit/recovery-stream-close-timeout.jsonl"
echo "==> built audit rotation recovery candidate stream close settlement timeout"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  getJsonlAuditLockPath,
  getJsonlAuditRotationStagingPath
} = await import(pathToFileURL(process.argv[1]).href);
const {
  recoverAuditRotationStaging,
  renderAuditRotationStagingRecoveryReport,
  renderAuditRotationStagingRecoveryReportJson
} = await import(pathToFileURL(process.argv[2]).href);
const filePath = process.argv[3];
const parentPath = path.dirname(filePath);
const rotatedPath = `${filePath}.1`;
const stagingId = "P58701";
const stagingPath = getJsonlAuditRotationStagingPath(filePath, stagingId);
const lockPath = getJsonlAuditLockPath(filePath);
await fs.mkdir(parentPath, { recursive: true, mode: 0o700 });
await fs.writeFile(filePath, "current-record\n", { mode: 0o600 });
await fs.mkdir(stagingPath, { mode: 0o700 });
await fs.writeFile(
  path.join(stagingPath, "previous"),
  "previous-archive\n",
  { mode: 0o600 }
);
const dryRun = await recoverAuditRotationStaging(
  { GOD_CODE_AUDIT_FILE: filePath },
  parentPath,
  stagingId
);
const fingerprint = dryRun.checks[0]?.details?.recovery_fingerprint;
if (typeof fingerprint !== "string") {
  throw new Error("built recovery stream timeout dry run lacked fingerprint");
}

const savedOpendir = fs.opendir;
const invokeOpendir = savedOpendir.bind(fs);
const invokeRealpath = fs.realpath.bind(fs);
const invokeLstat = fs.lstat.bind(fs);
const invokeReaddir = fs.readdir.bind(fs);
const savedSetTimeout = globalThis.setTimeout;
let resolvePendingClose;
let rejectPendingClose;
const pendingClose = new Promise((resolve, reject) => {
  resolvePendingClose = resolve;
  rejectPendingClose = reject;
});
let resolveCloseStarted;
const closeStarted = new Promise((resolve) => {
  resolveCloseStarted = resolve;
});
let committedStreamCount = 0;
let selectedCloseCount = 0;
let actualCloseCompletion;
const unhandledRejections = [];
const onUnhandledRejection = (reason) => {
  unhandledRejections.push(reason);
};
process.on("unhandledRejection", onUnhandledRejection);
try {
  globalThis.setTimeout = (callback, delay, ...args) => savedSetTimeout(
    callback,
    delay === 5_000 ? 25 : delay,
    ...args
  );
  fs.opendir = async (target, options) => {
    const stream = await invokeOpendir(target, options);
    let resolvedTarget;
    try {
      resolvedTarget = await invokeRealpath(String(target));
    } catch {
      resolvedTarget = path.resolve(String(target));
    }
    if (path.resolve(resolvedTarget) !== path.resolve(stagingPath)) {
      return stream;
    }
    try {
      const [rotatedStatus, stagingEntries] = await Promise.all([
        invokeLstat(rotatedPath),
        invokeReaddir(stagingPath)
      ]);
      if (!rotatedStatus.isFile() || stagingEntries.length !== 0) {
        return stream;
      }
    } catch {
      return stream;
    }
    committedStreamCount += 1;
    if (committedStreamCount === 2) {
      const close = stream.close.bind(stream);
      stream.close = () => {
        selectedCloseCount += 1;
        actualCloseCompletion = close();
        resolveCloseStarted();
        return pendingClose;
      };
    }
    return stream;
  };

  const reportPromise = recoverAuditRotationStaging(
    { GOD_CODE_AUDIT_FILE: filePath },
    parentPath,
    stagingId,
    {
      dryRun: false,
      expectedAction: "restore_previous_archive",
      expectedRecoveryFingerprint: fingerprint
    }
  );
  await closeStarted;
  const report = await reportPromise;
  fs.opendir = savedOpendir;
  globalThis.setTimeout = savedSetTimeout;
  rejectPendingClose(
    new Error("built late recovery stream close rejection")
  );
  await actualCloseCompletion;
  await new Promise((resolve) => savedSetTimeout(resolve, 25));

  const check = report.checks[0];
  const details = check?.details;
  const rendered = `${renderAuditRotationStagingRecoveryReport(report)}\n${renderAuditRotationStagingRecoveryReportJson(report)}`;
  let lockExists = true;
  try {
    await fs.access(lockPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      lockExists = false;
    } else {
      throw error;
    }
  }
  if (
    committedStreamCount < 2
    || selectedCloseCount !== 1
    || report.ok !== true
    || check?.status !== "warn"
    || details?.performed_action !== "restore_previous_archive"
    || details?.mutation_performed !== true
    || details?.recovered !== true
    || details?.staging_removed !== false
    || details?.durability_completed !== true
    || details?.residual_staging_path !== stagingPath
    || details?.recovery_warning
      !== "recovered staging could not be safely removed: recovery descriptor close timed out after 5000 ms"
    || details?.recovery_handles_closed !== true
    || details?.coordination_lock_released !== true
    || lockExists
    || unhandledRejections.length !== 0
    || rendered.includes("built late recovery stream close rejection")
    || await fs.readFile(filePath, "utf8") !== "current-record\n"
    || await fs.readFile(rotatedPath, "utf8") !== "previous-archive\n"
    || (await fs.readdir(stagingPath)).length !== 0
  ) {
    throw new Error("built recovery candidate stream timeout failed");
  }
} finally {
  fs.opendir = savedOpendir;
  globalThis.setTimeout = savedSetTimeout;
  resolvePendingClose?.();
  await actualCloseCompletion;
  process.off("unhandledRejection", onUnhandledRejection);
  await fs.rm(filePath, { force: true });
  await fs.rm(rotatedPath, { force: true });
  await fs.rm(stagingPath, { recursive: true, force: true });
  await fs.rm(lockPath, { recursive: true, force: true });
}
' \
  "${REPO_ROOT}/ts-host/dist/audit/jsonlAuditSink.js" \
  "${REPO_ROOT}/ts-host/dist/cli/audit.js" \
  "${AUDIT_RECOVERY_STREAM_CLOSE_TIMEOUT_FILE}"

echo "==> provider inspect-config"
run_cli provider inspect-config | node -e '
const fs = require("node:fs");
const output = fs.readFileSync(0, "utf8");
if (!output.includes("OK provider_config: using fake provider")) {
  throw new Error("provider inspect-config did not report fake provider");
}
'

echo "==> provider inspect-config --json"
run_cli provider inspect-config --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const provider = report.checks.find((check) => check.name === "provider_config");
if (report.ok !== true || provider?.status !== "ok") {
  throw new Error("provider inspect-config --json did not report ok provider_config");
}
if (provider?.details?.provider !== "fake") {
  throw new Error("provider inspect-config --json did not include sanitized fake provider details");
}
'

echo "==> provider inspect-config --json retry metadata"
env \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  GOD_CODE_PROVIDER=openai \
  GOD_CODE_MODEL=gpt-test \
  GOD_CODE_API_KEY_ENV=SMOKE_PROVIDER_KEY \
  SMOKE_PROVIDER_KEY=smoke-secret \
  GOD_CODE_PROVIDER_MAX_RETRIES=2 \
  GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS=10 \
  GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS=40 \
  GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS=120 \
  GOD_CODE_PROVIDER_REQUIRE_USAGE=true \
  GOD_CODE_PROVIDER_FALLBACKS='[{"provider":"openai-compatible","model":"fallback-model","api_key_env":"SMOKE_FALLBACK_PROVIDER_KEY","base_url":"https://fallback.example.test/v1","timeout_s":20,"max_retries":1,"retry_base_delay_ms":10,"retry_max_delay_ms":40}]' \
  SMOKE_FALLBACK_PROVIDER_KEY=smoke-fallback-secret \
  node "${CLI}" provider inspect-config --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const provider = report.checks.find((check) => check.name === "provider_config");
const retry = provider?.details?.retry;
const budget = provider?.details?.budget;
const fallback = provider?.details?.fallbacks?.[0];
if (report.ok !== true || provider?.status !== "ok") {
  throw new Error("provider inspect-config --json retry metadata did not report ok provider_config");
}
if (retry?.max_retries !== 2 || retry?.base_delay_ms !== 10 || retry?.max_delay_ms !== 40) {
  throw new Error("provider inspect-config --json did not expose retry metadata");
}
if (budget?.max_total_tokens !== 120 || budget?.require_usage !== true) {
  throw new Error("provider inspect-config --json did not expose budget metadata");
}
if (fallback?.provider !== "openai-compatible" || fallback?.model !== "fallback-model") {
  throw new Error("provider inspect-config --json did not expose fallback metadata");
}
if (fallback?.api_key_env !== "SMOKE_FALLBACK_PROVIDER_KEY" || fallback?.api_key_present !== true) {
  throw new Error("provider inspect-config --json did not expose sanitized fallback credential metadata");
}
if (fallback?.retry?.max_retries !== 1 || fallback?.retry?.base_delay_ms !== 10 || fallback?.retry?.max_delay_ms !== 40) {
  throw new Error("provider inspect-config --json did not expose fallback retry metadata");
}
if (JSON.stringify(report).includes("smoke-secret") || JSON.stringify(report).includes("smoke-fallback-secret")) {
  throw new Error("provider inspect-config --json retry metadata leaked provider credentials");
}
'

echo "==> provider inspect-config --json anthropic metadata"
env \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_ANTHROPIC_VERSION \
  GOD_CODE_PROVIDER=anthropic \
  GOD_CODE_MODEL=claude-test \
  GOD_CODE_API_KEY_ENV=SMOKE_ANTHROPIC_KEY \
  SMOKE_ANTHROPIC_KEY=smoke-anthropic-secret \
  node "${CLI}" provider inspect-config --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const provider = report.checks.find((check) => check.name === "provider_config");
if (report.ok !== true || provider?.status !== "ok") {
  throw new Error("provider inspect-config --json anthropic metadata did not report ok provider_config");
}
if (provider?.details?.provider !== "anthropic" || provider?.details?.known_family !== true) {
  throw new Error("provider inspect-config --json did not report anthropic as a known provider");
}
if (provider?.details?.effective_base_url !== "https://api.anthropic.com") {
  throw new Error("provider inspect-config --json did not expose anthropic effective base URL");
}
if (JSON.stringify(report).includes("smoke-anthropic-secret")) {
  throw new Error("provider inspect-config --json anthropic metadata leaked provider credentials");
}
'

echo "==> provider inspect-config --json local metadata"
env \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  GOD_CODE_PROVIDER=local-openai-compatible \
  GOD_CODE_MODEL=local-model \
  node "${CLI}" provider inspect-config --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const provider = report.checks.find((check) => check.name === "provider_config");
if (report.ok !== true || provider?.status !== "ok") {
  throw new Error("provider inspect-config --json local metadata did not report ok provider_config");
}
if (provider?.details?.provider !== "local-openai-compatible" || provider?.details?.known_family !== true) {
  throw new Error("provider inspect-config --json did not report local provider as a known provider");
}
if (provider?.details?.api_key_required !== false || provider?.details?.api_key_present !== false) {
  throw new Error("provider inspect-config --json did not expose local no-key metadata");
}
if (provider?.details?.effective_base_url !== "http://127.0.0.1:11434/v1") {
  throw new Error("provider inspect-config --json did not expose local effective base URL");
}
'

echo "==> provider local-daemon status --json disabled"
run_cli provider local-daemon status --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "local_provider_daemon");
if (report.ok !== true || check?.status !== "ok" || check?.details?.enabled !== false) {
  throw new Error("provider local-daemon status --json did not report disabled ok state");
}
'

echo "==> provider local-daemon start --dry-run --json"
env \
  GOD_CODE_PROVIDER=local-openai-compatible \
  GOD_CODE_MODEL=local-model \
  GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED=true \
  GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND="$(command -v node)" \
  GOD_CODE_LOCAL_PROVIDER_DAEMON_ARGS='["-e","console.log(\"smoke-secret-arg\")"]' \
  GOD_CODE_LOCAL_PROVIDER_DAEMON_PID_FILE=.god-code/smoke-local-provider-daemon.json \
  GOD_CODE_LOCAL_PROVIDER_DAEMON_LOG_FILE=.god-code/smoke-local-provider-daemon.log \
  node "${CLI}" provider local-daemon start --dry-run --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "local_provider_daemon");
if (report.ok !== true || check?.status !== "ok" || !check?.message.includes("dry-run")) {
  throw new Error("provider local-daemon start --dry-run --json did not report dry-run ok state");
}
if (JSON.stringify(report).includes("smoke-secret-arg")) {
  throw new Error("provider local-daemon start --dry-run --json leaked command arguments");
}
'

echo "==> provider local-daemon stop --dry-run --json"
env \
  GOD_CODE_PROVIDER=local-openai-compatible \
  GOD_CODE_MODEL=local-model \
  GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED=true \
  GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND="$(command -v node)" \
  GOD_CODE_LOCAL_PROVIDER_DAEMON_PID_FILE=.god-code/smoke-missing-local-provider-daemon.json \
  GOD_CODE_LOCAL_PROVIDER_DAEMON_LOG_FILE=.god-code/smoke-missing-local-provider-daemon.log \
  node "${CLI}" provider local-daemon stop --dry-run --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "local_provider_daemon");
if (report.ok !== true || check?.status !== "ok" || !check?.message.includes("no GOD-code local provider daemon marker")) {
  throw new Error("provider local-daemon stop --dry-run --json did not report missing marker ok state");
}
'

echo "==> provider local-models list --require-configured-model --json"
LOCAL_MODELS_PORT_FILE="${SMOKE_ROOT}/local-models-port"
LOCAL_MODELS_PORT_FILE="${LOCAL_MODELS_PORT_FILE}" node -e 'const fs = require("node:fs"); const http = require("node:http"); const server = http.createServer((req, res) => { if (req.method !== "GET" || req.url !== "/v1/models") { res.writeHead(404, {"content-type":"application/json"}); res.end(JSON.stringify({error:"not_found"})); return; } if (req.headers.authorization) { res.writeHead(500, {"content-type":"application/json"}); res.end(JSON.stringify({error:"unexpected_authorization"})); return; } res.writeHead(200, {"content-type":"application/json"}); res.end(JSON.stringify({object:"list", data:[{id:"smoke-local-model", object:"model", owned_by:"smoke"}, {id:"smoke-helper-model", object:"model", owned_by:"smoke"}]})); }); server.listen(0, "127.0.0.1", () => { fs.writeFileSync(process.env.LOCAL_MODELS_PORT_FILE, String(server.address().port)); });' &
LOCAL_MODELS_PID=$!
for _ in {1..50}; do
  if [[ -s "${LOCAL_MODELS_PORT_FILE}" ]]; then
    break
  fi
  sleep 0.1
done
if [[ ! -s "${LOCAL_MODELS_PORT_FILE}" ]]; then
  echo "Timed out waiting for local models fixture server." >&2
  exit 1
fi
LOCAL_MODELS_PORT="$(cat "${LOCAL_MODELS_PORT_FILE}")"
env \
  -u GOD_CODE_API_KEY_ENV \
  GOD_CODE_PROVIDER=local-openai-compatible \
  GOD_CODE_MODEL=smoke-local-model \
  GOD_CODE_BASE_URL="http://127.0.0.1:${LOCAL_MODELS_PORT}/v1" \
  GOD_CODE_LOCAL_PROVIDER_MODELS_MAX_RESULTS=10 \
  node "${CLI}" provider local-models list --require-configured-model --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "local_provider_models");
if (report.ok !== true || check?.status !== "ok") {
  throw new Error("provider local-models list --json did not report ok state");
}
if (check?.details?.models_url === undefined || !check.details.models_url.endsWith("/v1/models")) {
  throw new Error("provider local-models list --json did not derive /models URL");
}
if (check?.details?.configured_model_present !== true) {
  throw new Error("provider local-models list --json did not validate configured model");
}
const ids = new Set((check?.details?.models ?? []).map((model) => model.id));
if (!ids.has("smoke-local-model") || !ids.has("smoke-helper-model")) {
  throw new Error("provider local-models list --json did not expose fixture model ids");
}
if (JSON.stringify(report).includes("Authorization")) {
  throw new Error("provider local-models list --json leaked auth headers");
}
'

echo "==> provider local-models pull --dry-run --json"
env \
  GOD_CODE_PROVIDER=local-openai-compatible \
  GOD_CODE_MODEL=smoke-local-model \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED=true \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND="$(command -v node)" \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE='["-e","console.log(\"smoke-secret-pull-arg\")","{model}"]' \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_LOG_FILE=.god-code/smoke-local-provider-model-pull.log \
  node "${CLI}" provider local-models pull smoke-local-model --dry-run --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "local_provider_model_pull");
if (report.ok !== true || check?.status !== "ok" || !check?.message.includes("dry-run")) {
  throw new Error("provider local-models pull --dry-run --json did not report dry-run ok state");
}
if (check?.details?.command_configured !== true || check?.details?.args_count !== 3) {
  throw new Error("provider local-models pull --dry-run --json did not expose sanitized command shape");
}
if (JSON.stringify(report).includes("smoke-secret-pull-arg")) {
  throw new Error("provider local-models pull --dry-run --json leaked command arguments");
}
'

echo "==> provider local-models pull --yes --json"
rm -f .god-code/smoke-local-provider-model-pull.log
env \
  GOD_CODE_PROVIDER=local-openai-compatible \
  GOD_CODE_MODEL=smoke-local-model \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED=true \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND="$(command -v node)" \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE='["-e","process.stdout.write(process.argv[1])","{model}"]' \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_LOG_FILE=.god-code/smoke-local-provider-model-pull.log \
  node "${CLI}" provider local-models pull smoke-local-model --yes --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "local_provider_model_pull");
if (report.ok !== true || check?.status !== "ok" || !check?.message.includes("completed")) {
  throw new Error("provider local-models pull --yes --json did not report completed ok state");
}
if (check?.details?.exit_code !== 0 || check?.details?.log_file !== ".god-code/smoke-local-provider-model-pull.log") {
  throw new Error("provider local-models pull --yes --json did not expose exit code and log path");
}
if (JSON.stringify(report).includes("process.stdout.write")) {
  throw new Error("provider local-models pull --yes --json leaked command arguments");
}
'
if [[ "$(cat .god-code/smoke-local-provider-model-pull.log)" != "smoke-local-model" ]]; then
  echo "provider local-models pull --yes did not substitute the model into the fixture command." >&2
  exit 1
fi

echo "==> provider local-models remove --dry-run --json"
env \
  GOD_CODE_PROVIDER=local-openai-compatible \
  GOD_CODE_MODEL=smoke-local-model \
  GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED=true \
  GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND="$(command -v node)" \
  GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE='["-e","console.log(\"smoke-secret-remove-arg\")","{model}"]' \
  GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_LOG_FILE=.god-code/smoke-local-provider-model-remove.log \
  node "${CLI}" provider local-models remove smoke-local-model --dry-run --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "local_provider_model_remove");
if (report.ok !== true || check?.status !== "ok" || !check?.message.includes("dry-run")) {
  throw new Error("provider local-models remove --dry-run --json did not report dry-run ok state");
}
if (check?.details?.command_configured !== true || check?.details?.args_count !== 3) {
  throw new Error("provider local-models remove --dry-run --json did not expose sanitized command shape");
}
if (JSON.stringify(report).includes("smoke-secret-remove-arg")) {
  throw new Error("provider local-models remove --dry-run --json leaked command arguments");
}
'

echo "==> provider local-models remove --yes --json"
rm -f .god-code/smoke-local-provider-model-remove.log
env \
  GOD_CODE_PROVIDER=local-openai-compatible \
  GOD_CODE_MODEL=smoke-local-model \
  GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED=true \
  GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND="$(command -v node)" \
  GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE='["-e","process.stdout.write(process.argv[1])","{model}"]' \
  GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_LOG_FILE=.god-code/smoke-local-provider-model-remove.log \
  node "${CLI}" provider local-models remove smoke-local-model --yes --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "local_provider_model_remove");
if (report.ok !== true || check?.status !== "ok" || !check?.message.includes("completed")) {
  throw new Error("provider local-models remove --yes --json did not report completed ok state");
}
if (check?.details?.exit_code !== 0 || check?.details?.log_file !== ".god-code/smoke-local-provider-model-remove.log") {
  throw new Error("provider local-models remove --yes --json did not expose exit code and log path");
}
if (JSON.stringify(report).includes("process.stdout.write")) {
  throw new Error("provider local-models remove --yes --json leaked command arguments");
}
'
if [[ "$(cat .god-code/smoke-local-provider-model-remove.log)" != "smoke-local-model" ]]; then
  echo "provider local-models remove --yes did not substitute the model into the fixture command." >&2
  exit 1
fi

echo "==> provider local-models prune --dry-run --json"
env \
  GOD_CODE_PROVIDER=local-openai-compatible \
  GOD_CODE_MODEL=smoke-local-model \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED=true \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND="$(command -v node)" \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE='["-e","console.log(\"smoke-secret-prune-arg\")","{target}"]' \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_LOG_FILE=.god-code/smoke-local-provider-model-prune.log \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS=unused \
  node "${CLI}" provider local-models prune --target unused --dry-run --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "local_provider_model_prune");
if (report.ok !== true || check?.status !== "ok" || !check?.message.includes("dry-run")) {
  throw new Error("provider local-models prune --dry-run --json did not report dry-run ok state");
}
if (check?.details?.command_configured !== true || check?.details?.args_count !== 3 || check?.details?.target_allowed !== true) {
  throw new Error("provider local-models prune --dry-run --json did not expose sanitized command shape");
}
if (JSON.stringify(report).includes("smoke-secret-prune-arg")) {
  throw new Error("provider local-models prune --dry-run --json leaked command arguments");
}
'

echo "==> provider local-models prune --yes --json"
rm -f .god-code/smoke-local-provider-model-prune.log
env \
  GOD_CODE_PROVIDER=local-openai-compatible \
  GOD_CODE_MODEL=smoke-local-model \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED=true \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND="$(command -v node)" \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE='["-e","process.stdout.write(process.argv[1])","{target}"]' \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_LOG_FILE=.god-code/smoke-local-provider-model-prune.log \
  GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS=unused \
  node "${CLI}" provider local-models prune --target unused --yes --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const check = report.checks.find((item) => item.name === "local_provider_model_prune");
if (report.ok !== true || check?.status !== "ok" || !check?.message.includes("completed")) {
  throw new Error("provider local-models prune --yes --json did not report completed ok state");
}
if (check?.details?.exit_code !== 0 || check?.details?.log_file !== ".god-code/smoke-local-provider-model-prune.log") {
  throw new Error("provider local-models prune --yes --json did not expose exit code and log path");
}
if (JSON.stringify(report).includes("process.stdout.write")) {
  throw new Error("provider local-models prune --yes --json leaked command arguments");
}
'
if [[ "$(cat .god-code/smoke-local-provider-model-prune.log)" != "unused" ]]; then
  echo "provider local-models prune --yes did not substitute the target into the fixture command." >&2
  exit 1
fi

echo "==> provider contract-test"
run_cli provider contract-test | node -e '
const fs = require("node:fs");
const output = fs.readFileSync(0, "utf8");
if (!output.includes("OK openai_compatible_request_body:")) {
  throw new Error("provider contract-test did not report OpenAI-compatible request body check");
}
if (!output.includes("OK local_openai_compatible_request_body:")) {
  throw new Error("provider contract-test did not report local OpenAI-compatible request body check");
}
if (!output.includes("OK anthropic_messages_request_body:")) {
  throw new Error("provider contract-test did not report Anthropic Messages request body check");
}
if (!output.includes("OK provider_usage_budget_guard:")) {
  throw new Error("provider contract-test did not report provider usage budget guard check");
}
if (!output.includes("OK system_prompt_builder_default:")) {
  throw new Error("provider contract-test did not report system prompt builder check");
}
if (!output.includes("OK openai_compatible_system_prompt_request:")) {
  throw new Error("provider contract-test did not report OpenAI-compatible system prompt check");
}
if (!output.includes("OK openai_responses_system_prompt_request:")) {
  throw new Error("provider contract-test did not report OpenAI Responses system prompt check");
}
if (!output.includes("OK anthropic_messages_system_prompt_request:")) {
  throw new Error("provider contract-test did not report Anthropic system prompt check");
}
if (!output.includes("OK provider_error_mapping_openai:")) {
  throw new Error("provider contract-test did not report OpenAI provider error mapping check");
}
if (!output.includes("OK provider_error_mapping_anthropic:")) {
  throw new Error("provider contract-test did not report Anthropic provider error mapping check");
}
if (!output.includes("OK provider_error_mapping_retry_metadata:")) {
  throw new Error("provider contract-test did not report provider error retry metadata check");
}
if (!output.includes("OK real_provider_adapter_contract:")) {
  throw new Error("provider contract-test did not report real provider adapter check");
}
'

echo "==> provider contract-test --json"
run_cli provider contract-test --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const names = new Set(report.checks.map((check) => check.name));
if (report.ok !== true) {
  throw new Error("provider contract-test --json did not report ok=true");
}
for (const name of ["openai_compatible_request_body", "local_openai_compatible_request_body", "openai_compatible_usage_payload", "openai_compatible_system_prompt_request", "openai_responses_context", "openai_responses_usage_payload", "openai_responses_system_prompt_request", "anthropic_messages_request_body", "anthropic_messages_usage_payload", "anthropic_messages_system_prompt_request", "system_prompt_builder_default", "provider_usage_budget_guard", "provider_error_mapping_openai", "provider_error_mapping_anthropic", "provider_error_mapping_retry_metadata", "real_provider_adapter_contract"]) {
  if (!names.has(name)) {
    throw new Error(`provider contract-test --json missing ${name}`);
  }
}
if (JSON.stringify(report).includes("contract-secret") || JSON.stringify(report).includes("Authorization") || JSON.stringify(report).includes("x-api-key")) {
  throw new Error("provider contract-test --json leaked provider credentials");
}
'

echo "==> provider inspect-config --json provider config error"
set +e
bad_provider_inspect_output="$(
  env \
    GOD_CODE_PROVIDER=openai \
    GOD_CODE_API_KEY_ENV=DEMO_API_KEY \
    node "${CLI}" provider inspect-config --json
)"
bad_provider_inspect_status=$?
set -e
if [[ "${bad_provider_inspect_status}" -eq 0 ]]; then
  echo "Expected bad provider inspect-config to return non-zero." >&2
  exit 1
fi
printf '%s' "${bad_provider_inspect_output}" | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const provider = report.checks.find((check) => check.name === "provider_config");
if (report.ok !== false || provider?.status !== "error") {
  throw new Error("bad provider inspect-config did not report provider_config error");
}
if (JSON.stringify(report).includes("secret")) {
  throw new Error("bad provider inspect-config leaked a secret-like value");
}
'

echo "==> doctor --json provider config error"
set +e
bad_provider_output="$(
  env \
    GOD_CODE_PROVIDER=openai \
    GOD_CODE_API_KEY_ENV=DEMO_API_KEY \
    GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/bad-provider-transcripts" \
    node "${CLI}" doctor --json
)"
bad_provider_status=$?
set -e
if [[ "${bad_provider_status}" -eq 0 ]]; then
  echo "Expected bad provider doctor check to return non-zero." >&2
  exit 1
fi
printf '%s' "${bad_provider_output}" | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const provider = report.checks.find((check) => check.name === "provider_config");
const engine = report.checks.find((check) => check.name === "python_engine");
if (report.ok !== false || provider?.status !== "error") {
  throw new Error("bad provider config did not report provider_config error");
}
if (engine?.status !== "warn" || !engine.message.includes("skipped")) {
  throw new Error("python_engine was not skipped after provider_config error");
}
if (JSON.stringify(report).includes("JSON-RPC input stream ended")) {
  throw new Error("doctor leaked derived JSON-RPC stream error");
}
'

echo "==> doctor provider-health --json provider config error"
set +e
bad_provider_health_output="$(
  env \
    GOD_CODE_PROVIDER=openai \
    GOD_CODE_API_KEY_ENV=DEMO_API_KEY \
    GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/bad-provider-health-transcripts" \
    node "${CLI}" doctor provider-health --json
)"
bad_provider_health_status=$?
set -e
if [[ "${bad_provider_health_status}" -eq 0 ]]; then
  echo "Expected bad provider health check to return non-zero." >&2
  exit 1
fi
printf '%s' "${bad_provider_health_output}" | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const provider = report.checks.find((check) => check.name === "provider_config");
const health = report.checks.find((check) => check.name === "provider_health");
if (report.ok !== false || provider?.status !== "error") {
  throw new Error("bad provider health did not preserve provider_config error");
}
if (health?.status !== "warn" || !health.message.includes("skipped")) {
  throw new Error("bad provider health was not skipped after provider_config error");
}
'

echo "==> tools list"
run_cli tools list >/dev/null

echo "==> tools list --json"
run_cli tools list --json | node -e '
const fs = require("node:fs");
const tools = JSON.parse(fs.readFileSync(0, "utf8"));
const names = new Set(tools.map((tool) => tool.name));
for (const name of ["Read", "Edit", "Bash", "ListFiles", "Search", "Write"]) {
  if (!names.has(name)) {
    throw new Error(`missing built-in tool: ${name}`);
  }
}
'

echo "==> tools inspect Read --json"
run_cli tools inspect Read --json | node -e '
const fs = require("node:fs");
const tool = JSON.parse(fs.readFileSync(0, "utf8"));
if (tool.name !== "Read") {
  throw new Error(`unexpected inspected tool: ${tool.name}`);
}
if (tool.input_schema?.required?.[0] !== "path") {
  throw new Error("Read input schema did not declare required path");
}
'

echo "==> built MCP runtime close settlement timeout"
node --input-type=module -e '
import { pathToFileURL } from "node:url";
const { SdkMcpStdioRuntime } = await import(
  pathToFileURL(process.argv[1]).href
);
const runtime = new SdkMcpStdioRuntime([]);
const savedSetTimeout = globalThis.setTimeout;
let resolvePendingClose;
let rejectPendingClose;
const pendingClose = new Promise((resolve, reject) => {
  resolvePendingClose = resolve;
  rejectPendingClose = reject;
});
let resolveCloseStarted;
const closeStarted = new Promise((resolve) => {
  resolveCloseStarted = resolve;
});
let pendingClientCloseCount = 0;
let pendingTransportCloseCount = 0;
let settledClientCloseCount = 0;
let settledTransportCloseCount = 0;
const unhandledRejections = [];
const onUnhandledRejection = (reason) => {
  unhandledRejections.push(reason);
};
process.on("unhandledRejection", onUnhandledRejection);
runtime.servers.push(
  {
    id: "settled",
    client: {
      async close() {
        settledClientCloseCount += 1;
      }
    },
    transport: {
      async close() {
        settledTransportCloseCount += 1;
      }
    }
  },
  {
    id: "pending",
    client: {
      close() {
        pendingClientCloseCount += 1;
        resolveCloseStarted();
        return pendingClose;
      }
    },
    transport: {
      async close() {
        pendingTransportCloseCount += 1;
      }
    }
  }
);
runtime.tools.set("mcp.test.placeholder", {});
let firstClose;
let secondClose;
try {
  globalThis.setTimeout = (callback, delay, ...args) => savedSetTimeout(
    callback,
    delay === 5_000 ? 25 : delay,
    ...args
  );
  firstClose = runtime.close();
  await closeStarted;
  const settledStartedBeforeRepeatedClose = settledClientCloseCount === 1;
  let secondSettledBeforeDeadline = false;
  secondClose = runtime.close().then(() => {
    secondSettledBeforeDeadline = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  if (secondSettledBeforeDeadline) {
    throw new Error("built repeated MCP close returned before lifecycle settlement");
  }
  await Promise.all([firstClose, secondClose]);
  globalThis.setTimeout = savedSetTimeout;
  rejectPendingClose(new Error("built late MCP client close rejection"));
  await new Promise((resolve) => savedSetTimeout(resolve, 25));
  if (
    !settledStartedBeforeRepeatedClose
    || pendingClientCloseCount !== 1
    || pendingTransportCloseCount !== 1
    || settledClientCloseCount !== 1
    || settledTransportCloseCount !== 0
    || runtime.servers.length !== 0
    || runtime.tools.size !== 0
    || unhandledRejections.length !== 0
  ) {
    throw new Error("built MCP runtime close settlement timeout failed");
  }
} finally {
  globalThis.setTimeout = savedSetTimeout;
  resolvePendingClose?.();
  process.off("unhandledRejection", onUnhandledRejection);
  await Promise.allSettled([
    ...(firstClose === undefined ? [] : [firstClose]),
    ...(secondClose === undefined ? [] : [secondClose])
  ]);
}
' \
  "${REPO_ROOT}/ts-host/dist/mcp/runtime.js"

echo "==> built prepared host runtime lifecycle finalization"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { prepareGodCodeHost } = await import(pathToFileURL(process.argv[1]).href);
const { SdkMcpStdioRuntime } = await import(pathToFileURL(process.argv[2]).href);
const { PluginSkillRuntime } = await import(pathToFileURL(process.argv[3]).href);
const fixturePath = process.argv[4];
const smokeRoot = process.argv[5];
const rollbackPluginDir = path.join(smokeRoot, "host-lifecycle-rollback-plugin");
const stablePluginDir = path.join(smokeRoot, "host-lifecycle-stable-plugin");
await fs.mkdir(rollbackPluginDir, { recursive: true });
await fs.mkdir(stablePluginDir, { recursive: true });
await fs.writeFile(
  path.join(rollbackPluginDir, "plugin.json"),
  JSON.stringify({
    id: "built-host-rollback",
    name: "Built host rollback",
    version: "0.1.0",
    tools: [{ name: "Read", description: "built conflict" }]
  }),
  "utf8"
);
await fs.writeFile(
  path.join(stablePluginDir, "plugin.json"),
  JSON.stringify({
    id: "built-host-stable",
    name: "Built host stable",
    version: "0.1.0"
  }),
  "utf8"
);
const envKeys = [
  "GOD_CODE_MCP_SERVERS",
  "GOD_CODE_MCP_CONFIG_FILE",
  "GOD_CODE_MCP_CONTEXT",
  "GOD_CODE_MCP_CONTEXT_FILE",
  "GOD_CODE_PLUGIN_DIRS",
  "GOD_CODE_PLUGIN_CONFIG_FILE",
  "GOD_CODE_PLUGIN_ENABLED_IDS",
  "GOD_CODE_PLUGIN_REGISTRY_FILE"
];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const configure = (pluginDir) => {
  for (const key of envKeys) {
    delete process.env[key];
  }
  process.env.GOD_CODE_MCP_SERVERS = JSON.stringify([
    { id: "built-host-lifecycle", command: "python3", args: [fixturePath] }
  ]);
  process.env.GOD_CODE_PLUGIN_DIRS = JSON.stringify([pluginDir]);
};
const restoreEnv = () => {
  for (const key of envKeys) {
    const value = previousEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};
const originalMcpClose = SdkMcpStdioRuntime.prototype.close;
const originalPluginClose = PluginSkillRuntime.prototype.close;
let rollbackRuntime;
let rollbackMcpCloseCount = 0;
let rollbackPluginCloseCount = 0;
let stableHost;
let firstClose;
let secondClose;
let resolvePluginGate;
const pluginGate = new Promise((resolve) => {
  resolvePluginGate = resolve;
});
try {
  configure(rollbackPluginDir);
  SdkMcpStdioRuntime.prototype.close = async function () {
    rollbackRuntime = this;
    const serverCount = this.servers.length;
    await originalMcpClose.call(this);
    if (serverCount > 0) {
      rollbackMcpCloseCount += 1;
      throw new Error("built injected MCP rollback close failure");
    }
  };
  PluginSkillRuntime.prototype.close = async function () {
    rollbackPluginCloseCount += 1;
    await originalPluginClose.call(this);
    throw new Error("built injected plugin rollback close failure");
  };
  let rollbackFailure;
  try {
    await prepareGodCodeHost();
  } catch (error) {
    rollbackFailure = error;
  }
  if (
    rollbackFailure?.message !== "Plugin tool cannot override built-in tool: Read"
    || rollbackMcpCloseCount !== 1
    || rollbackPluginCloseCount !== 1
  ) {
    throw new Error("built prepared host setup rollback failed");
  }

  SdkMcpStdioRuntime.prototype.close = originalMcpClose;
  PluginSkillRuntime.prototype.close = originalPluginClose;
  configure(stablePluginDir);
  stableHost = await prepareGodCodeHost();
  let pluginCloseCount = 0;
  let mcpCloseCount = 0;
  PluginSkillRuntime.prototype.close = async function () {
    pluginCloseCount += 1;
    await pluginGate;
    await originalPluginClose.call(this);
  };
  SdkMcpStdioRuntime.prototype.close = async function () {
    mcpCloseCount += 1;
    await originalMcpClose.call(this);
  };
  firstClose = stableHost.close();
  secondClose = stableHost.close();
  await Promise.resolve();
  await Promise.resolve();
  const sharedLifecycle = firstClose === secondClose;
  const concurrentStart = pluginCloseCount === 1 && mcpCloseCount === 1;
  resolvePluginGate();
  await Promise.all([firstClose, secondClose]);
  const thirdClose = stableHost.close();
  await thirdClose;
  if (
    !sharedLifecycle
    || !concurrentStart
    || thirdClose !== firstClose
    || pluginCloseCount !== 1
    || mcpCloseCount !== 1
  ) {
    throw new Error("built prepared host terminal close lifecycle failed");
  }
} finally {
  resolvePluginGate?.();
  await Promise.allSettled([
    ...(firstClose === undefined ? [] : [firstClose]),
    ...(secondClose === undefined ? [] : [secondClose])
  ]);
  SdkMcpStdioRuntime.prototype.close = originalMcpClose;
  PluginSkillRuntime.prototype.close = originalPluginClose;
  if (stableHost) {
    await stableHost.close().catch(() => undefined);
  }
  if (rollbackRuntime?.servers?.length > 0) {
    await originalMcpClose.call(rollbackRuntime);
  }
  restoreEnv();
}
' \
  "${REPO_ROOT}/ts-host/dist/headless/godCodeHostSetup.js" \
  "${REPO_ROOT}/ts-host/dist/mcp/runtime.js" \
  "${REPO_ROOT}/ts-host/dist/plugins/runtime.js" \
  "${REPO_ROOT}/ts-host/test/fixtures/mcp-demo-server.py" \
  "${SMOKE_ROOT}"

echo "==> built headless composite finalization continuity"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { runGodCodeSession } = await import(pathToFileURL(process.argv[1]).href);
const { GodCodeEngineProcess } = await import(pathToFileURL(process.argv[2]).href);
const { PluginSkillRuntime } = await import(pathToFileURL(process.argv[3]).href);
const smokeRoot = process.argv[4];
const pluginDir = path.join(smokeRoot, "headless-finalization-plugin");
await fs.mkdir(pluginDir, { recursive: true });
await fs.writeFile(
  path.join(pluginDir, "plugin.json"),
  JSON.stringify({
    id: "built-headless-finalization",
    name: "Built headless finalization",
    version: "0.1.0"
  }),
  "utf8"
);
const envKeys = [
  "GOD_CODE_MCP_SERVERS",
  "GOD_CODE_MCP_CONFIG_FILE",
  "GOD_CODE_MCP_CONTEXT",
  "GOD_CODE_MCP_CONTEXT_FILE",
  "GOD_CODE_PLUGIN_DIRS",
  "GOD_CODE_PLUGIN_CONFIG_FILE",
  "GOD_CODE_PLUGIN_ENABLED_IDS",
  "GOD_CODE_PLUGIN_REGISTRY_FILE"
];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
for (const key of envKeys) {
  delete process.env[key];
}
process.env.GOD_CODE_PLUGIN_DIRS = JSON.stringify([pluginDir]);
const originalStart = GodCodeEngineProcess.prototype.start;
const originalInitialize = GodCodeEngineProcess.prototype.initialize;
const originalCreateSession = GodCodeEngineProcess.prototype.createSession;
const originalSubmitTurn = GodCodeEngineProcess.prototype.submitTurn;
const originalStop = GodCodeEngineProcess.prototype.stop;
const originalPluginClose = PluginSkillRuntime.prototype.close;
let resolvePluginGate;
const pluginGate = new Promise((resolve) => {
  resolvePluginGate = resolve;
});
let firstRun;
try {
  let pluginCloseStarted = false;
  let engineStopStartedAtPluginClose = false;
  let resolvePluginCloseStarted;
  const pluginCloseStartedPromise = new Promise((resolve) => {
    resolvePluginCloseStarted = resolve;
  });
  let pluginCloseCount = 0;
  let engineStopStarted = false;
  let engineStopCount = 0;
  let rendererFinishCount = 0;
  PluginSkillRuntime.prototype.close = async function () {
    pluginCloseCount += 1;
    pluginCloseStarted = true;
    engineStopStartedAtPluginClose = engineStopStarted;
    resolvePluginCloseStarted();
    await pluginGate;
    await originalPluginClose.call(this);
  };
  GodCodeEngineProcess.prototype.start = async function () {
    throw new Error("built headless start primary");
  };
  GodCodeEngineProcess.prototype.stop = async function () {
    engineStopCount += 1;
    engineStopStarted = true;
    throw new Error("built headless stop secondary");
  };
  firstRun = runGodCodeSession("ignored", process.cwd(), {
    renderer: {
      onAssistantDelta() {},
      onAssistantMessage() {},
      onToolCallRequested() {},
      finish() {
        rendererFinishCount += 1;
      }
    }
  }).then(
    () => undefined,
    (error) => error
  );
  const pluginCloseObserved = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 1000);
    pluginCloseStartedPromise.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  let firstRunSettled = false;
  firstRun.then(() => {
    firstRunSettled = true;
  });
  await Promise.resolve();
  const concurrentStart = pluginCloseObserved
    && pluginCloseStarted
    && engineStopStartedAtPluginClose;
  const pendingBeforePluginSettlement = !firstRunSettled;
  resolvePluginGate();
  const firstFailure = await firstRun;
  if (
    firstFailure?.message !== "built headless start primary"
    || !concurrentStart
    || !pendingBeforePluginSettlement
    || pluginCloseCount !== 1
    || engineStopCount !== 1
    || rendererFinishCount !== 1
  ) {
    throw new Error("built headless primary finalization continuity failed");
  }

  GodCodeEngineProcess.prototype.start = originalStart;
  GodCodeEngineProcess.prototype.initialize = originalInitialize;
  GodCodeEngineProcess.prototype.createSession = originalCreateSession;
  GodCodeEngineProcess.prototype.submitTurn = originalSubmitTurn;
  GodCodeEngineProcess.prototype.stop = originalStop;
  PluginSkillRuntime.prototype.close = originalPluginClose;
  let observedEngine;
  let successfulPluginCloseCount = 0;
  let successfulEngineStopCount = 0;
  const rendererFailure = new Error("built renderer cleanup failure");
  PluginSkillRuntime.prototype.close = async function () {
    successfulPluginCloseCount += 1;
    await originalPluginClose.call(this);
  };
  GodCodeEngineProcess.prototype.start = async function () {
    observedEngine = this;
  };
  GodCodeEngineProcess.prototype.initialize = async function () {
    return {};
  };
  GodCodeEngineProcess.prototype.createSession = async function (request) {
    return { session_id: request.session_id, status: "created" };
  };
  GodCodeEngineProcess.prototype.submitTurn = async function (request) {
    queueMicrotask(() => this.emit("god_code_event", {
      event_type: "turn_finished",
      session_id: request.session_id,
      turn_id: "built-synthetic-turn",
      sequence: 1,
      payload: {
        status: "success",
        assistant_message: { role: "assistant", content: "done" }
      }
    }));
    return {
      session_id: request.session_id,
      turn_id: "built-synthetic-turn",
      status: "accepted"
    };
  };
  GodCodeEngineProcess.prototype.stop = async function () {
    successfulEngineStopCount += 1;
    throw new Error("built successful-turn engine cleanup failure");
  };
  const secondFailure = await runGodCodeSession("synthetic", process.cwd(), {
    renderer: {
      onAssistantDelta() {},
      onAssistantMessage() {},
      onToolCallRequested() {},
      finish() {
        throw rendererFailure;
      }
    }
  }).then(
    () => undefined,
    (error) => error
  );
  if (
    secondFailure !== rendererFailure
    || successfulPluginCloseCount !== 1
    || successfulEngineStopCount !== 1
    || observedEngine?.listenerCount("god_code_event") !== 0
    || observedEngine?.listenerCount("exit") !== 0
  ) {
    throw new Error("built headless successful cleanup priority failed");
  }
} finally {
  resolvePluginGate?.();
  await Promise.allSettled(firstRun === undefined ? [] : [firstRun]);
  GodCodeEngineProcess.prototype.start = originalStart;
  GodCodeEngineProcess.prototype.initialize = originalInitialize;
  GodCodeEngineProcess.prototype.createSession = originalCreateSession;
  GodCodeEngineProcess.prototype.submitTurn = originalSubmitTurn;
  GodCodeEngineProcess.prototype.stop = originalStop;
  PluginSkillRuntime.prototype.close = originalPluginClose;
  for (const key of envKeys) {
    const value = previousEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
' \
  "${REPO_ROOT}/ts-host/dist/headless/godCodeRunSession.js" \
  "${REPO_ROOT}/ts-host/dist/ipc/godCodeEngineProcess.js" \
  "${REPO_ROOT}/ts-host/dist/plugins/runtime.js" \
  "${SMOKE_ROOT}"

echo "==> built REPL composite cleanup lifecycle"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { GodCodeReplSession } = await import(pathToFileURL(process.argv[1]).href);
const { GodCodeEngineProcess } = await import(pathToFileURL(process.argv[2]).href);
const { PluginSkillRuntime } = await import(pathToFileURL(process.argv[3]).href);
const smokeRoot = process.argv[4];
const pluginDir = path.join(smokeRoot, "repl-finalization-plugin");
await fs.mkdir(pluginDir, { recursive: true });
await fs.writeFile(
  path.join(pluginDir, "plugin.json"),
  JSON.stringify({
    id: "built-repl-finalization",
    name: "Built REPL finalization",
    version: "0.1.0"
  }),
  "utf8"
);
const envKeys = [
  "GOD_CODE_MCP_SERVERS",
  "GOD_CODE_MCP_CONFIG_FILE",
  "GOD_CODE_MCP_CONTEXT",
  "GOD_CODE_MCP_CONTEXT_FILE",
  "GOD_CODE_PLUGIN_DIRS",
  "GOD_CODE_PLUGIN_CONFIG_FILE",
  "GOD_CODE_PLUGIN_ENABLED_IDS",
  "GOD_CODE_PLUGIN_REGISTRY_FILE"
];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
for (const key of envKeys) {
  delete process.env[key];
}
process.env.GOD_CODE_PLUGIN_DIRS = JSON.stringify([pluginDir]);
const originalStart = GodCodeEngineProcess.prototype.start;
const originalInitialize = GodCodeEngineProcess.prototype.initialize;
const originalCreateSession = GodCodeEngineProcess.prototype.createSession;
const originalSubmitTurn = GodCodeEngineProcess.prototype.submitTurn;
const originalCancelTurn = GodCodeEngineProcess.prototype.cancelTurn;
const originalStop = GodCodeEngineProcess.prototype.stop;
const originalPluginClose = PluginSkillRuntime.prototype.close;
const unhandledRejections = [];
const onUnhandledRejection = (reason) => {
  unhandledRejections.push(reason);
};
process.on("unhandledRejection", onUnhandledRejection);
let resolvePluginGate;
const pluginGate = new Promise((resolve) => {
  resolvePluginGate = resolve;
});
let resolvePluginCloseStarted;
const pluginCloseStarted = new Promise((resolve) => {
  resolvePluginCloseStarted = resolve;
});
let rejectLateCancellation;
const lateCancellation = new Promise((resolve, reject) => {
  rejectLateCancellation = reject;
});
let failedSession;
let activeSession;
let firstStart;
let firstStop;
try {
  let primaryPluginCloseCount = 0;
  let primaryEngineStopCount = 0;
  let primaryEngineStopStarted = false;
  let primaryRendererFinishCount = 0;
  PluginSkillRuntime.prototype.close = async function () {
    primaryPluginCloseCount += 1;
    resolvePluginCloseStarted();
    await pluginGate;
    await originalPluginClose.call(this);
  };
  GodCodeEngineProcess.prototype.start = async function () {
    throw new Error("built REPL start primary");
  };
  GodCodeEngineProcess.prototype.stop = async function () {
    primaryEngineStopCount += 1;
    primaryEngineStopStarted = true;
    throw new Error("built REPL engine cleanup secondary");
  };
  failedSession = new GodCodeReplSession(process.cwd(), {
    renderer: {
      onAssistantDelta() {},
      onAssistantMessage() {},
      onToolCallRequested() {},
      finish() {
        primaryRendererFinishCount += 1;
      }
    }
  });
  firstStart = failedSession.start();
  const repeatedStart = failedSession.start();
  const observedStart = firstStart.then(
    () => undefined,
    (error) => error
  );
  const pluginCloseObserved = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 1000);
    pluginCloseStarted.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  let startSettledBeforePlugin = false;
  observedStart.then(() => {
    startSettledBeforePlugin = true;
  });
  await Promise.resolve();
  if (
    repeatedStart !== firstStart
    || !pluginCloseObserved
    || !primaryEngineStopStarted
    || startSettledBeforePlugin
  ) {
    throw new Error("built REPL start lifecycle memoization failed");
  }
  resolvePluginGate();
  const startFailure = await observedStart;
  if (
    startFailure?.message !== "built REPL start primary"
    || primaryPluginCloseCount !== 1
    || primaryEngineStopCount !== 1
    || primaryRendererFinishCount !== 1
  ) {
    throw new Error("built REPL start primary continuity failed");
  }
  await failedSession.stop().catch(() => undefined);

  let generationStartCount = 0;
  let generationInitializeCount = 0;
  let generationCreateCount = 0;
  let generationCancelCount = 0;
  let generationEngineStopCount = 0;
  let generationPluginCloseCount = 0;
  let generationRendererFinishCount = 0;
  PluginSkillRuntime.prototype.close = async function () {
    generationPluginCloseCount += 1;
    await originalPluginClose.call(this);
  };
  GodCodeEngineProcess.prototype.start = async function () {
    generationStartCount += 1;
  };
  GodCodeEngineProcess.prototype.initialize = async function () {
    generationInitializeCount += 1;
    return {};
  };
  GodCodeEngineProcess.prototype.createSession = async function (request) {
    generationCreateCount += 1;
    return { session_id: request.session_id, status: "created" };
  };
  GodCodeEngineProcess.prototype.submitTurn = async function (request) {
    return {
      session_id: request.session_id,
      turn_id: "built-pending-repl-turn",
      status: "accepted"
    };
  };
  GodCodeEngineProcess.prototype.cancelTurn = function () {
    generationCancelCount += 1;
    return lateCancellation;
  };
  GodCodeEngineProcess.prototype.stop = async function () {
    generationEngineStopCount += 1;
  };
  activeSession = new GodCodeReplSession(process.cwd(), {
    renderer: {
      onAssistantDelta() {},
      onAssistantMessage() {},
      onToolCallRequested() {},
      finish() {
        generationRendererFinishCount += 1;
      }
    }
  });
  await activeSession.start();
  const activeTurn = activeSession.submit("pending").then(
    () => undefined,
    (error) => error
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  firstStop = activeSession.stop();
  const repeatedStop = activeSession.stop();
  const stopSettled = await Promise.race([
    firstStop.then(() => true, () => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 1000))
  ]);
  const turnFailure = await activeTurn;
  if (
    repeatedStop !== firstStop
    || activeSession.stop() !== firstStop
    || !stopSettled
    || turnFailure?.message !== "GOD-code REPL session stopped during an active turn."
    || generationCancelCount !== 1
    || generationPluginCloseCount !== 1
    || generationEngineStopCount !== 1
    || generationRendererFinishCount !== 1
  ) {
    throw new Error("built REPL active-turn cleanup lifecycle failed");
  }

  const restart = activeSession.start();
  if (restart === firstStart) {
    throw new Error("built REPL restart reused an old start lifecycle");
  }
  await restart;
  rejectLateCancellation(new Error("built late REPL cancellation rejection"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (activeSession.getStatus() !== "idle" || unhandledRejections.length !== 0) {
    throw new Error("built REPL late cancellation isolation failed");
  }
  const finalStop = activeSession.stop();
  if (finalStop === firstStop) {
    throw new Error("built REPL restart did not create a new stop lifecycle");
  }
  await finalStop;
  if (
    generationStartCount !== 2
    || generationInitializeCount !== 2
    || generationCreateCount !== 2
    || generationPluginCloseCount !== 2
    || generationEngineStopCount !== 2
    || generationRendererFinishCount !== 2
  ) {
    throw new Error("built REPL restart generation finalization failed");
  }
} finally {
  resolvePluginGate?.();
  rejectLateCancellation?.(new Error("built final REPL cancellation release"));
  await Promise.allSettled([
    ...(firstStart === undefined ? [] : [firstStart]),
    ...(firstStop === undefined ? [] : [firstStop]),
    ...(failedSession === undefined ? [] : [failedSession.stop()]),
    ...(activeSession === undefined ? [] : [activeSession.stop()])
  ]);
  GodCodeEngineProcess.prototype.start = originalStart;
  GodCodeEngineProcess.prototype.initialize = originalInitialize;
  GodCodeEngineProcess.prototype.createSession = originalCreateSession;
  GodCodeEngineProcess.prototype.submitTurn = originalSubmitTurn;
  GodCodeEngineProcess.prototype.cancelTurn = originalCancelTurn;
  GodCodeEngineProcess.prototype.stop = originalStop;
  PluginSkillRuntime.prototype.close = originalPluginClose;
  process.off("unhandledRejection", onUnhandledRejection);
  for (const key of envKeys) {
    const value = previousEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
' \
  "${REPO_ROOT}/ts-host/dist/cli/repl.js" \
  "${REPO_ROOT}/ts-host/dist/ipc/godCodeEngineProcess.js" \
  "${REPO_ROOT}/ts-host/dist/plugins/runtime.js" \
  "${SMOKE_ROOT}"

echo "==> built engine process terminal stop lifecycle"
node --input-type=module -e '
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";
const { GodCodeEngineProcess } = await import(pathToFileURL(process.argv[1]).href);
const savedSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay, ...args) => savedSetTimeout(
  callback,
  delay === 5_000 || delay === 2_000 ? 25 : delay,
  ...args
);
const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};
const createChild = (exitOnEnd = false) => {
  const child = new EventEmitter();
  let stdinEndCount = 0;
  let killCount = 0;
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.stdin = {
    destroyed: false,
    writableEnded: false,
    end() {
      stdinEndCount += 1;
      this.writableEnded = true;
      if (exitOnEnd) {
        child.emitExit(0, null);
      }
    }
  };
  child.kill = (signal) => {
    killCount += 1;
    child.killed = true;
    child.lastKillSignal = signal;
    return true;
  };
  child.emitExit = (code, signal) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    child.exitCode = code;
    child.signalCode = signal;
    child.emit("exit", code, signal);
  };
  child.counts = () => ({ stdinEndCount, killCount });
  return child;
};
const createPeer = (requestImpl, closeImpl = () => undefined) => {
  let closed = false;
  let requestCount = 0;
  let closeCount = 0;
  return {
    peer: {
      isClosed() {
        return closed;
      },
      request(...args) {
        requestCount += 1;
        return requestImpl(...args);
      },
      close(error) {
        closeCount += 1;
        closed = true;
        return closeImpl(error);
      }
    },
    counts: () => ({ requestCount, closeCount })
  };
};
const install = (engine, child, peer) => {
  engine.child = child;
  engine.peer = peer;
};
const unhandledRejections = [];
const onUnhandledRejection = (reason) => {
  unhandledRejections.push(reason);
};
process.on("unhandledRejection", onUnhandledRejection);
const pendingShutdown = createDeferred();
let pendingEngine;
let pendingStop;
let killEngine;
let killStop;
let timeoutEngine;
let timeoutStop;
let realEngine;
try {
  const pendingChild = createChild(true);
  const pendingPeer = createPeer(() => pendingShutdown.promise);
  pendingEngine = new GodCodeEngineProcess();
  install(pendingEngine, pendingChild, pendingPeer.peer);
  pendingStop = pendingEngine.stop();
  const repeatedPendingStop = pendingEngine.stop();
  if (
    repeatedPendingStop !== pendingStop
    || pendingEngine.child !== undefined
    || pendingEngine.peer !== undefined
  ) {
    throw new Error("built engine stop memoization/state transfer failed");
  }
  await pendingStop;
  if (
    pendingEngine.stop() !== pendingStop
    || pendingChild.counts().stdinEndCount !== 1
    || pendingPeer.counts().requestCount !== 1
    || pendingPeer.counts().closeCount !== 1
  ) {
    throw new Error("built engine shutdown deadline lifecycle failed");
  }
  pendingShutdown.reject(new Error("built late engine shutdown rejection"));
  await new Promise((resolve) => savedSetTimeout(resolve, 0));
  if (unhandledRejections.length !== 0) {
    throw new Error("built engine late shutdown observation failed");
  }

  const killChild = createChild(false);
  const killPeer = createPeer(async () => ({ status: "shutting_down" }));
  killEngine = new GodCodeEngineProcess();
  install(killEngine, killChild, killPeer.peer);
  killStop = killEngine.stop();
  let killStopSettled = false;
  killStop.then(
    () => {
      killStopSettled = true;
    },
    () => {
      killStopSettled = true;
    }
  );
  await new Promise((resolve) => savedSetTimeout(resolve, 35));
  if (
    killChild.counts().killCount !== 1
    || killChild.lastKillSignal !== "SIGKILL"
    || killStopSettled
    || killPeer.counts().closeCount !== 0
  ) {
    throw new Error("built engine SIGKILL exit wait failed");
  }
  killChild.emitExit(null, "SIGKILL");
  await killStop;
  if (killPeer.counts().closeCount !== 1) {
    throw new Error("built engine post-exit peer close failed");
  }

  const timeoutChild = createChild(false);
  const timeoutPeer = createPeer(async () => ({ status: "shutting_down" }));
  timeoutEngine = new GodCodeEngineProcess();
  install(timeoutEngine, timeoutChild, timeoutPeer.peer);
  timeoutStop = timeoutEngine.stop();
  const timeoutFailure = await timeoutStop.then(
    () => undefined,
    (error) => error
  );
  if (
    timeoutFailure?.message !== "GOD-code engine process did not exit after SIGKILL within 2000 ms."
    || timeoutEngine.stop() !== timeoutStop
    || timeoutPeer.counts().closeCount !== 1
  ) {
    throw new Error("built engine forced-exit timeout lifecycle failed");
  }
  const restartFailure = await timeoutEngine.start().then(
    () => undefined,
    (error) => error
  );
  if (restartFailure !== timeoutFailure) {
    throw new Error("built engine forced-exit restart gate failed");
  }

  globalThis.setTimeout = savedSetTimeout;
  realEngine = new GodCodeEngineProcess();
  const firstStart = realEngine.start();
  const repeatedStart = realEngine.start();
  if (repeatedStart !== firstStart) {
    throw new Error("built engine start memoization failed");
  }
  await firstStart;
  const firstRealStop = realEngine.stop();
  if (realEngine.stop() !== firstRealStop) {
    throw new Error("built engine real stop memoization failed");
  }
  await firstRealStop;
  const restart = realEngine.start();
  if (restart === firstStart) {
    throw new Error("built engine restart reused old start lifecycle");
  }
  await restart;
  if (realEngine.getLastExitInfo() !== undefined) {
    throw new Error("built engine restart retained old exit diagnostics");
  }
  const finalRealStop = realEngine.stop();
  if (finalRealStop === firstRealStop) {
    throw new Error("built engine restart reused old stop lifecycle");
  }
  await finalRealStop;
} finally {
  globalThis.setTimeout = savedSetTimeout;
  pendingShutdown.reject(new Error("built final engine shutdown release"));
  killEngine?.child?.emitExit?.(null, "SIGKILL");
  timeoutEngine?.child?.emitExit?.(null, "SIGKILL");
  await Promise.allSettled([
    ...(pendingStop === undefined ? [] : [pendingStop]),
    ...(killStop === undefined ? [] : [killStop]),
    ...(timeoutStop === undefined ? [] : [timeoutStop]),
    ...(pendingEngine === undefined ? [] : [pendingEngine.stop()]),
    ...(killEngine === undefined ? [] : [killEngine.stop()]),
    ...(timeoutEngine === undefined ? [] : [timeoutEngine.stop()]),
    ...(realEngine === undefined ? [] : [realEngine.stop()])
  ]);
  process.off("unhandledRejection", onUnhandledRejection);
}
' \
  "${REPO_ROOT}/ts-host/dist/ipc/godCodeEngineProcess.js"

echo "==> built doctor engine cleanup primary continuity"
node --input-type=module -e '
import { pathToFileURL } from "node:url";
const { runGodCodeDoctor } = await import(pathToFileURL(process.argv[1]).href);
const { GodCodeEngineProcess } = await import(pathToFileURL(process.argv[2]).href);
const envKeys = [
  "GOD_CODE_PROVIDER",
  "GOD_CODE_MODEL",
  "GOD_CODE_API_KEY_ENV",
  "GOD_CODE_BASE_URL",
  "GOD_CODE_PROVIDER_TIMEOUT_S",
  "DEMO_API_KEY",
  "GOD_CODE_AUDIT_FILE",
  "GOD_CODE_AUDIT_MAX_BYTES",
  "GOD_CODE_AUDIT_REDACT_KEYS",
  "GOD_CODE_MCP_SERVERS",
  "GOD_CODE_MCP_CONFIG_FILE",
  "GOD_CODE_MCP_CONTEXT",
  "GOD_CODE_MCP_CONTEXT_FILE",
  "GOD_CODE_PLUGIN_DIRS",
  "GOD_CODE_PLUGIN_CONFIG_FILE",
  "GOD_CODE_PLUGIN_ENABLED_IDS",
  "GOD_CODE_PLUGIN_REGISTRY_FILE"
];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const resetEnv = () => {
  for (const key of envKeys) {
    delete process.env[key];
  }
};
const originalStart = GodCodeEngineProcess.prototype.start;
const originalInitialize = GodCodeEngineProcess.prototype.initialize;
const originalCreateSession = GodCodeEngineProcess.prototype.createSession;
const originalSubmitTurn = GodCodeEngineProcess.prototype.submitTurn;
const originalStop = GodCodeEngineProcess.prototype.stop;
try {
  resetEnv();
  GodCodeEngineProcess.prototype.start = async function () {};
  GodCodeEngineProcess.prototype.initialize = async function () {
    return { supported_model_adapters: ["fake"] };
  };
  GodCodeEngineProcess.prototype.stop = async function () {
    throw new Error("built python cleanup secondary");
  };
  const cleanupReport = await runGodCodeDoctor(process.cwd());
  const cleanupChecks = cleanupReport.checks.filter((check) => check.name === "python_engine");
  const cleanupJson = JSON.stringify(cleanupReport);
  if (
    cleanupChecks.length !== 1
    || cleanupChecks[0].status !== "error"
    || cleanupChecks[0].message !== "initialized but engine cleanup failed"
    || cleanupJson.includes("built python cleanup secondary")
  ) {
    throw new Error("built doctor python cleanup projection failed");
  }

  GodCodeEngineProcess.prototype.initialize = async function () {
    throw new Error("built python initialize primary");
  };
  GodCodeEngineProcess.prototype.stop = async function () {
    throw new Error("built python cleanup replacement");
  };
  const primaryReport = await runGodCodeDoctor(process.cwd());
  const primaryCheck = primaryReport.checks.find((check) => check.name === "python_engine");
  const primaryJson = JSON.stringify(primaryReport);
  if (
    primaryCheck?.message !== "built python initialize primary"
    || primaryJson.includes("built python cleanup replacement")
  ) {
    throw new Error("built doctor python primary continuity failed");
  }

  resetEnv();
  process.env.GOD_CODE_PROVIDER = "demo";
  process.env.GOD_CODE_MODEL = "demo-model";
  process.env.GOD_CODE_API_KEY_ENV = "DEMO_API_KEY";
  process.env.DEMO_API_KEY = "built-secret";
  let startCalls = 0;
  let healthOffCount = 0;
  GodCodeEngineProcess.prototype.start = async function () {
    startCalls += 1;
    if (startCalls === 2) {
      const originalOff = this.off.bind(this);
      this.off = (eventName, listener) => {
        healthOffCount += 1;
        originalOff(eventName, listener);
        return this;
      };
    }
  };
  GodCodeEngineProcess.prototype.initialize = async function () {
    return { supported_model_adapters: ["fake", "demo"] };
  };
  GodCodeEngineProcess.prototype.createSession = async function (request) {
    return { session_id: request.session_id, status: "created" };
  };
  GodCodeEngineProcess.prototype.submitTurn = async function (request) {
    setImmediate(() => this.emit("god_code_event", {
      event_type: "turn_finished",
      session_id: request.session_id,
      turn_id: "built-doctor-health-turn",
      sequence: 1,
      payload: {
        status: "success",
        assistant_message: { role: "assistant", content: "healthy" }
      }
    }));
    return {
      session_id: request.session_id,
      turn_id: "built-doctor-health-turn",
      status: "accepted"
    };
  };
  let stopCalls = 0;
  GodCodeEngineProcess.prototype.stop = async function () {
    stopCalls += 1;
    if (stopCalls === 2) {
      throw new Error("built provider cleanup secondary");
    }
  };
  const healthCleanupReport = await runGodCodeDoctor(process.cwd(), { providerHealth: true });
  const healthCleanupCheck = healthCleanupReport.checks.find(
    (check) => check.name === "provider_health"
  );
  const healthCleanupJson = JSON.stringify(healthCleanupReport);
  if (
    healthCleanupCheck?.status !== "error"
    || healthCleanupCheck?.message !== "demo: health check cleanup failed"
    || stopCalls !== 2
    || healthOffCount !== 2
    || healthCleanupJson.includes("built provider cleanup secondary")
    || healthCleanupJson.includes("built-secret")
  ) {
    throw new Error("built doctor provider cleanup projection failed");
  }

  startCalls = 0;
  stopCalls = 0;
  GodCodeEngineProcess.prototype.start = async function () {
    startCalls += 1;
    if (startCalls === 2) {
      this.off = () => {
        throw new Error("built provider waiter cleanup secondary");
      };
    }
  };
  GodCodeEngineProcess.prototype.submitTurn = async function () {
    throw new Error("built provider submit primary");
  };
  GodCodeEngineProcess.prototype.stop = async function () {
    stopCalls += 1;
    if (stopCalls === 2) {
      throw new Error("built provider engine cleanup secondary");
    }
  };
  const healthPrimaryReport = await runGodCodeDoctor(process.cwd(), { providerHealth: true });
  const healthPrimaryCheck = healthPrimaryReport.checks.find(
    (check) => check.name === "provider_health"
  );
  const healthPrimaryJson = JSON.stringify(healthPrimaryReport);
  if (
    healthPrimaryCheck?.message !== "demo: built provider submit primary"
    || stopCalls !== 2
    || healthPrimaryJson.includes("built provider waiter cleanup secondary")
    || healthPrimaryJson.includes("built provider engine cleanup secondary")
    || healthPrimaryJson.includes("built-secret")
  ) {
    throw new Error("built doctor provider primary continuity failed");
  }
} finally {
  GodCodeEngineProcess.prototype.start = originalStart;
  GodCodeEngineProcess.prototype.initialize = originalInitialize;
  GodCodeEngineProcess.prototype.createSession = originalCreateSession;
  GodCodeEngineProcess.prototype.submitTurn = originalSubmitTurn;
  GodCodeEngineProcess.prototype.stop = originalStop;
  for (const key of envKeys) {
    const value = previousEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
' \
  "${REPO_ROOT}/ts-host/dist/cli/doctor.js" \
  "${REPO_ROOT}/ts-host/dist/ipc/godCodeEngineProcess.js"

echo "==> built doctor tool catalog cleanup primary continuity"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const doctorPath = process.argv[1];
const hostSetupPath = process.argv[2];
const enginePath = process.argv[3];
const smokeRoot = process.argv[4];
const doctorUrl = pathToFileURL(doctorPath);
const hostSetupUrl = pathToFileURL(hostSetupPath).href;
const mockHostSetupPath = path.join(smokeRoot, "doctor-host-setup-phase594.mjs");
const isolatedDoctorPath = path.join(smokeRoot, "doctor-phase594.mjs");
await fs.writeFile(
  mockHostSetupPath,
  [
    `export { buildGodCodeCreateSessionRequest, buildGodCodeInitializeRequest } from ${JSON.stringify(hostSetupUrl)};`,
    "export async function prepareGodCodeHost() {",
    "  return globalThis.__godCodeDoctorHostFactory();",
    "}"
  ].join("\n"),
  "utf8"
);
const mockHostSetupUrl = pathToFileURL(mockHostSetupPath).href;
let doctorSource = await fs.readFile(doctorPath, "utf8");
doctorSource = doctorSource.replace(
  `from "../headless/godCodeHostSetup.js"`,
  `from ${JSON.stringify(mockHostSetupUrl)}`
);
doctorSource = doctorSource.replace(
  /from "(\.{1,2}\/[^\"]+)"/g,
  (_match, specifier) => `from ${JSON.stringify(new URL(specifier, doctorUrl).href)}`
);
if (!doctorSource.includes(mockHostSetupUrl)) {
  throw new Error("built doctor host setup injection failed");
}
await fs.writeFile(isolatedDoctorPath, doctorSource, "utf8");
const { runGodCodeDoctor } = await import(pathToFileURL(isolatedDoctorPath).href);
const { GodCodeEngineProcess } = await import(pathToFileURL(enginePath).href);
const envKeys = [
  "GOD_CODE_PROVIDER",
  "GOD_CODE_MODEL",
  "GOD_CODE_API_KEY_ENV",
  "GOD_CODE_BASE_URL",
  "GOD_CODE_PROVIDER_TIMEOUT_S",
  "GOD_CODE_AUDIT_FILE",
  "GOD_CODE_AUDIT_MAX_BYTES",
  "GOD_CODE_AUDIT_REDACT_KEYS",
  "GOD_CODE_MCP_SERVERS",
  "GOD_CODE_MCP_CONFIG_FILE",
  "GOD_CODE_MCP_CONTEXT",
  "GOD_CODE_MCP_CONTEXT_FILE",
  "GOD_CODE_PLUGIN_DIRS",
  "GOD_CODE_PLUGIN_CONFIG_FILE",
  "GOD_CODE_PLUGIN_ENABLED_IDS",
  "GOD_CODE_PLUGIN_REGISTRY_FILE"
];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalStart = GodCodeEngineProcess.prototype.start;
const originalInitialize = GodCodeEngineProcess.prototype.initialize;
const originalStop = GodCodeEngineProcess.prototype.stop;
try {
  for (const key of envKeys) {
    delete process.env[key];
  }
  GodCodeEngineProcess.prototype.start = async function () {};
  GodCodeEngineProcess.prototype.initialize = async function () {
    return { supported_model_adapters: ["fake"] };
  };
  GodCodeEngineProcess.prototype.stop = async function () {};

  let rejectedCloseCalls = 0;
  globalThis.__godCodeDoctorHostFactory = async () => ({
    registry: {},
    toolCatalog: Array.from({ length: 8 }, () => ({})),
    initialMessages: [],
    close: async () => {
      rejectedCloseCalls += 1;
      throw new Error("built prepared host cleanup secondary");
    }
  });
  const cleanupReport = await runGodCodeDoctor(process.cwd());
  const cleanupChecks = cleanupReport.checks.filter(
    (check) => check.name === "tool_catalog"
  );
  const cleanupJson = JSON.stringify(cleanupReport);
  if (
    cleanupChecks.length !== 1
    || cleanupChecks[0].status !== "error"
    || cleanupChecks[0].message !== "tool catalog loaded but host cleanup failed"
    || rejectedCloseCalls !== 1
    || cleanupJson.includes("built prepared host cleanup secondary")
  ) {
    throw new Error("built doctor tool catalog cleanup projection failed");
  }

  let primaryCloseCalls = 0;
  const primaryHost = {
    registry: {},
    initialMessages: [],
    close: async () => {
      primaryCloseCalls += 1;
      throw new Error("built host cleanup replacement");
    }
  };
  Object.defineProperty(primaryHost, "toolCatalog", {
    get() {
      throw new Error("built tool catalog primary");
    }
  });
  globalThis.__godCodeDoctorHostFactory = async () => primaryHost;
  const primaryReport = await runGodCodeDoctor(process.cwd());
  const primaryChecks = primaryReport.checks.filter(
    (check) => check.name === "tool_catalog"
  );
  const primaryJson = JSON.stringify(primaryReport);
  if (
    primaryChecks.length !== 1
    || primaryChecks[0].status !== "error"
    || primaryChecks[0].message !== "built tool catalog primary"
    || primaryCloseCalls !== 1
    || primaryJson.includes("built host cleanup replacement")
  ) {
    throw new Error("built doctor tool catalog primary continuity failed");
  }

  let syncCloseCalls = 0;
  globalThis.__godCodeDoctorHostFactory = async () => ({
    registry: {},
    toolCatalog: Array.from({ length: 9 }, () => ({})),
    initialMessages: [],
    close: () => {
      syncCloseCalls += 1;
      throw new Error("built synchronous host cleanup secondary");
    }
  });
  const syncReport = await runGodCodeDoctor(process.cwd());
  const syncChecks = syncReport.checks.filter((check) => check.name === "tool_catalog");
  const syncJson = JSON.stringify(syncReport);
  if (
    syncChecks.length !== 1
    || syncChecks[0].message !== "tool catalog loaded but host cleanup failed"
    || syncCloseCalls !== 1
    || syncJson.includes("built synchronous host cleanup secondary")
  ) {
    throw new Error("built doctor synchronous host cleanup projection failed");
  }
} finally {
  delete globalThis.__godCodeDoctorHostFactory;
  GodCodeEngineProcess.prototype.start = originalStart;
  GodCodeEngineProcess.prototype.initialize = originalInitialize;
  GodCodeEngineProcess.prototype.stop = originalStop;
  for (const key of envKeys) {
    const value = previousEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
' \
  "${REPO_ROOT}/ts-host/dist/cli/doctor.js" \
  "${REPO_ROOT}/ts-host/dist/headless/godCodeHostSetup.js" \
  "${REPO_ROOT}/ts-host/dist/ipc/godCodeEngineProcess.js" \
  "${SMOKE_ROOT}"

echo "==> built CLI tools catalog cleanup primary continuity"
node --input-type=module -e '
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const toolsPath = process.argv[1];
const smokeRoot = process.argv[2];
const toolsUrl = pathToFileURL(toolsPath);
const mockHostSetupPath = path.join(smokeRoot, "tools-host-setup-phase595.mjs");
const isolatedToolsPath = path.join(smokeRoot, "tools-phase595.mjs");
await fs.writeFile(
  mockHostSetupPath,
  [
    "export async function prepareGodCodeHost() {",
    "  return globalThis.__godCodeToolsHostFactory();",
    "}"
  ].join("\n"),
  "utf8"
);
const mockHostSetupUrl = pathToFileURL(mockHostSetupPath).href;
let toolsSource = await fs.readFile(toolsPath, "utf8");
toolsSource = toolsSource.replace(
  `from "../headless/godCodeHostSetup.js"`,
  `from ${JSON.stringify(mockHostSetupUrl)}`
);
toolsSource = toolsSource.replace(
  /from "(\.{1,2}\/[^\"]+)"/g,
  (_match, specifier) => `from ${JSON.stringify(new URL(specifier, toolsUrl).href)}`
);
if (!toolsSource.includes(mockHostSetupUrl)) {
  throw new Error("built CLI tools host setup injection failed");
}
await fs.writeFile(isolatedToolsPath, toolsSource, "utf8");
const { listHostTools } = await import(pathToFileURL(isolatedToolsPath).href);
const captureFailure = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("built CLI tools operation unexpectedly succeeded");
};
try {
  const stableTools = [{ name: "BuiltStable", description: "stable" }];
  let stableCloseCalls = 0;
  globalThis.__godCodeToolsHostFactory = async () => ({
    registry: {},
    toolCatalog: stableTools,
    initialMessages: [],
    close: async () => {
      stableCloseCalls += 1;
    }
  });
  const stableResult = await listHostTools();
  if (stableResult !== stableTools || stableCloseCalls !== 1) {
    throw new Error("built CLI tools stable catalog lifecycle failed");
  }

  let rejectedCloseCalls = 0;
  globalThis.__godCodeToolsHostFactory = async () => ({
    registry: {},
    toolCatalog: [{ name: "BuiltReject", description: "reject" }],
    initialMessages: [],
    close: async () => {
      rejectedCloseCalls += 1;
      throw new Error("built CLI tools cleanup secondary");
    }
  });
  const cleanupFailure = await captureFailure(listHostTools());
  if (
    cleanupFailure?.message !== "tool catalog loaded but host cleanup failed"
    || cleanupFailure?.message.includes("built CLI tools cleanup secondary")
    || rejectedCloseCalls !== 1
  ) {
    throw new Error("built CLI tools cleanup projection failed");
  }

  let primaryCloseCalls = 0;
  const primary = new Error("built CLI tools catalog primary");
  const primaryHost = {
    registry: {},
    initialMessages: [],
    close: async () => {
      primaryCloseCalls += 1;
      throw new Error("built CLI tools cleanup replacement");
    }
  };
  Object.defineProperty(primaryHost, "toolCatalog", {
    get() {
      throw primary;
    }
  });
  globalThis.__godCodeToolsHostFactory = async () => primaryHost;
  const primaryFailure = await captureFailure(listHostTools());
  if (primaryFailure !== primary || primaryCloseCalls !== 1) {
    throw new Error("built CLI tools primary continuity failed");
  }

  let syncCloseCalls = 0;
  globalThis.__godCodeToolsHostFactory = async () => ({
    registry: {},
    toolCatalog: [{ name: "BuiltSync", description: "sync" }],
    initialMessages: [],
    close: () => {
      syncCloseCalls += 1;
      throw new Error("built synchronous CLI tools cleanup secondary");
    }
  });
  const syncFailure = await captureFailure(listHostTools());
  if (
    syncFailure?.message !== "tool catalog loaded but host cleanup failed"
    || syncFailure?.message.includes("built synchronous CLI tools cleanup secondary")
    || syncCloseCalls !== 1
  ) {
    throw new Error("built CLI tools synchronous cleanup projection failed");
  }
} finally {
  delete globalThis.__godCodeToolsHostFactory;
}
' \
  "${REPO_ROOT}/ts-host/dist/cli/tools.js" \
  "${SMOKE_ROOT}"

echo "==> built plugin diagnostic runtime cleanup primary continuity"
node --input-type=module -e '
import { pathToFileURL } from "node:url";
const {
  inspectPluginConfig,
  listConfiguredPlugins
} = await import(pathToFileURL(process.argv[1]).href);
const { PluginSkillRuntime } = await import(pathToFileURL(process.argv[2]).href);
const pluginDir = process.argv[3];
const options = {
  environ: {
    GOD_CODE_PLUGIN_DIRS: JSON.stringify([pluginDir]),
    GOD_CODE_PLUGIN_CONFIG_FILE: undefined,
    GOD_CODE_PLUGIN_ENABLED_IDS: undefined,
    GOD_CODE_PLUGIN_REGISTRY_FILE: undefined
  }
};
const originalLoad = PluginSkillRuntime.prototype.load;
const originalClose = PluginSkillRuntime.prototype.close;
try {
  let rejectedCloseCalls = 0;
  PluginSkillRuntime.prototype.close = async function () {
    rejectedCloseCalls += 1;
    throw new Error("built plugin diagnostic cleanup secondary");
  };
  const cleanupReport = await inspectPluginConfig(options);
  const cleanupChecks = cleanupReport.checks.filter(
    (check) => check.name === "plugin_runtime"
  );
  const cleanupJson = JSON.stringify(cleanupReport);
  if (
    cleanupChecks.length !== 1
    || cleanupChecks[0].status !== "error"
    || cleanupChecks[0].message !== "plugin runtime cleanup failed"
    || rejectedCloseCalls !== 1
    || cleanupJson.includes("built plugin diagnostic cleanup secondary")
  ) {
    throw new Error("built plugin diagnostic cleanup projection failed");
  }

  let primaryCloseCalls = 0;
  PluginSkillRuntime.prototype.load = async function () {
    throw new Error("built plugin diagnostic load primary");
  };
  PluginSkillRuntime.prototype.close = function () {
    primaryCloseCalls += 1;
    throw new Error("built plugin cleanup replacement");
  };
  const primaryReport = await inspectPluginConfig(options);
  const primaryChecks = primaryReport.checks.filter(
    (check) => check.name === "plugin_runtime"
  );
  const primaryJson = JSON.stringify(primaryReport);
  if (
    primaryChecks.length !== 1
    || primaryChecks[0].message !== "built plugin diagnostic load primary"
    || primaryCloseCalls !== 1
    || primaryJson.includes("built plugin cleanup replacement")
  ) {
    throw new Error("built plugin diagnostic primary continuity failed");
  }

  let listCloseCalls = 0;
  PluginSkillRuntime.prototype.load = originalLoad;
  PluginSkillRuntime.prototype.close = function () {
    listCloseCalls += 1;
    throw new Error("built plugin list cleanup secondary");
  };
  const listReport = await listConfiguredPlugins(options);
  const listChecks = listReport.checks.filter((check) => check.name === "plugin_list");
  const listJson = JSON.stringify(listReport);
  if (
    listChecks.length !== 1
    || listChecks[0].status !== "error"
    || listChecks[0].message !== "plugin runtime cleanup failed"
    || listCloseCalls !== 1
    || listJson.includes("built plugin list cleanup secondary")
  ) {
    throw new Error("built plugin list cleanup projection failed");
  }
} finally {
  PluginSkillRuntime.prototype.load = originalLoad;
  PluginSkillRuntime.prototype.close = originalClose;
}
' \
  "${REPO_ROOT}/ts-host/dist/cli/plugins.js" \
  "${REPO_ROOT}/ts-host/dist/plugins/runtime.js" \
  "${REPO_ROOT}/examples/plugins/executable-plugin"

echo "==> built MCP diagnostic runtime cleanup primary continuity"
node --input-type=module -e '
import { pathToFileURL } from "node:url";
const {
  inspectMcpConfig,
  inspectMcpContext,
  readMcpResource
} = await import(pathToFileURL(process.argv[1]).href);
const { SdkMcpStdioRuntime } = await import(pathToFileURL(process.argv[2]).href);
const configEnviron = {
  GOD_CODE_MCP_SERVERS: JSON.stringify([{
    id: "built-demo",
    command: "python3",
    args: ["unused-built-mcp-fixture.py"]
  }]),
  GOD_CODE_MCP_CONFIG_FILE: undefined
};
const resourceRead = {
  server_id: "built-demo",
  uri: "memory://built/readme",
  contents: [{
    uri: "memory://built/readme",
    mime_type: "text/plain",
    text: "built context"
  }]
};
const originalConnect = SdkMcpStdioRuntime.prototype.connect;
const originalListTools = SdkMcpStdioRuntime.prototype.listTools;
const originalListResources = SdkMcpStdioRuntime.prototype.listResources;
const originalListResourceTemplates = SdkMcpStdioRuntime.prototype.listResourceTemplates;
const originalListPrompts = SdkMcpStdioRuntime.prototype.listPrompts;
const originalReadResource = SdkMcpStdioRuntime.prototype.readResource;
const originalClose = SdkMcpStdioRuntime.prototype.close;
try {
  SdkMcpStdioRuntime.prototype.connect = async function () {};
  SdkMcpStdioRuntime.prototype.listTools = async function () { return []; };
  SdkMcpStdioRuntime.prototype.readResource = async function () {
    return resourceRead;
  };

  let genericCloseCalls = 0;
  SdkMcpStdioRuntime.prototype.close = async function () {
    genericCloseCalls += 1;
    throw new Error("built MCP generic cleanup secondary");
  };
  const genericReport = await readMcpResource({
    uri: resourceRead.uri,
    serverId: "built-demo",
    environ: configEnviron
  });
  const genericChecks = genericReport.checks.filter(
    (check) => check.name === "mcp_read_resource"
  );
  const genericJson = JSON.stringify(genericReport);
  if (
    genericChecks.length !== 1
    || genericChecks[0].status !== "error"
    || genericChecks[0].message !== "MCP runtime cleanup failed"
    || genericCloseCalls !== 1
    || genericJson.includes("built MCP generic cleanup secondary")
  ) {
    throw new Error("built MCP generic cleanup projection failed");
  }

  let primaryCloseCalls = 0;
  SdkMcpStdioRuntime.prototype.readResource = async function () {
    throw new Error("built MCP generic operation primary");
  };
  SdkMcpStdioRuntime.prototype.close = function () {
    primaryCloseCalls += 1;
    throw new Error("built MCP generic cleanup replacement");
  };
  const primaryReport = await readMcpResource({
    uri: resourceRead.uri,
    serverId: "built-demo",
    environ: configEnviron
  });
  const primaryChecks = primaryReport.checks.filter(
    (check) => check.name === "mcp_read_resource"
  );
  const primaryJson = JSON.stringify(primaryReport);
  if (
    primaryChecks.length !== 1
    || primaryChecks[0].message !== "built MCP generic operation primary"
    || primaryCloseCalls !== 1
    || primaryJson.includes("built MCP generic cleanup replacement")
  ) {
    throw new Error("built MCP generic primary continuity failed");
  }

  SdkMcpStdioRuntime.prototype.listResources = async function () { return []; };
  SdkMcpStdioRuntime.prototype.listResourceTemplates = async function () { return []; };
  SdkMcpStdioRuntime.prototype.listPrompts = async function () { return []; };
  let connectionCloseCalls = 0;
  SdkMcpStdioRuntime.prototype.close = async function () {
    connectionCloseCalls += 1;
    throw new Error("built MCP connection cleanup secondary");
  };
  const connectionReport = await inspectMcpConfig({
    environ: configEnviron,
    connect: true,
    resources: true,
    resourceTemplates: true,
    prompts: true
  });
  const connectionChecks = connectionReport.checks.filter(
    (check) => check.name !== "mcp_config"
  );
  const connectionJson = JSON.stringify(connectionReport);
  if (
    connectionChecks.length !== 4
    || connectionChecks[0].name !== "mcp_connect"
    || connectionChecks[0].status !== "error"
    || connectionChecks[0].message !== "MCP runtime cleanup failed"
    || connectionChecks.slice(1).some((check) => check.status !== "ok")
    || connectionCloseCalls !== 1
    || connectionJson.includes("built MCP connection cleanup secondary")
  ) {
    throw new Error("built MCP connection cleanup projection failed");
  }

  SdkMcpStdioRuntime.prototype.readResource = async function () {
    return resourceRead;
  };
  let contextCloseCalls = 0;
  SdkMcpStdioRuntime.prototype.close = async function () {
    contextCloseCalls += 1;
    throw new Error("built MCP context cleanup secondary");
  };
  const contextReport = await inspectMcpContext({
    environ: {
      ...configEnviron,
      GOD_CODE_MCP_CONTEXT: JSON.stringify([{
        type: "resource",
        uri: resourceRead.uri,
        server_id: "built-demo"
      }])
    }
  });
  const contextChecks = contextReport.checks.filter(
    (check) => check.name === "mcp_context"
  );
  const contextJson = JSON.stringify(contextReport);
  if (
    contextChecks.length !== 1
    || contextChecks[0].status !== "error"
    || contextChecks[0].message !== "MCP runtime cleanup failed"
    || contextCloseCalls !== 1
    || contextJson.includes("built MCP context cleanup secondary")
  ) {
    throw new Error("built MCP context cleanup projection failed");
  }
} finally {
  SdkMcpStdioRuntime.prototype.connect = originalConnect;
  SdkMcpStdioRuntime.prototype.listTools = originalListTools;
  SdkMcpStdioRuntime.prototype.listResources = originalListResources;
  SdkMcpStdioRuntime.prototype.listResourceTemplates = originalListResourceTemplates;
  SdkMcpStdioRuntime.prototype.listPrompts = originalListPrompts;
  SdkMcpStdioRuntime.prototype.readResource = originalReadResource;
  SdkMcpStdioRuntime.prototype.close = originalClose;
}
' \
  "${REPO_ROOT}/ts-host/dist/cli/mcp.js" \
  "${REPO_ROOT}/ts-host/dist/mcp/runtime.js"

echo "==> built synchronous CLI finalizer primary continuity"
node --input-type=module -e '
import readline from "node:readline";
import { pathToFileURL } from "node:url";
const { TerminalApprovalPrompt } = await import(pathToFileURL(process.argv[1]).href);
const { runTuiPtySmoke } = await import(pathToFileURL(process.argv[2]).href);
const originalCreateInterface = readline.createInterface;
const approvalRequest = {
  toolName: "Bash",
  reason: "Bash requires interactive approval in prompt mode.",
  cwd: "/workspace",
  sessionId: "built-phase598-session",
  turnId: "built-phase598-turn",
  toolCallId: "built-phase598-tool",
  inputSummary: {
    lines: [{ label: "command", value: "printf built-phase598" }],
    truncated: false,
    redacted: false
  }
};
const approvalInput = { isTTY: true };
const approvalOutput = { isTTY: true, write() {} };
try {
  let allowQuestionReturned = false;
  let allowCloseCalls = 0;
  readline.createInterface = () => ({
    question(_query, callback) {
      callback("yes");
      allowQuestionReturned = true;
    },
    close() {
      allowCloseCalls += 1;
      if (allowQuestionReturned) {
        throw new Error("built approval cleanup secret");
      }
    }
  });
  const allowDecision = await new TerminalApprovalPrompt({
    input: approvalInput,
    output: approvalOutput
  }).requestApproval(approvalRequest);
  const allowJson = JSON.stringify(allowDecision);
  if (
    allowDecision.action !== "deny"
    || allowDecision.source !== "unavailable"
    || allowDecision.reason !== "Interactive approval input cleanup failed."
    || allowCloseCalls !== 1
    || allowJson.includes("built approval cleanup secret")
  ) {
    throw new Error("built approval cleanup projection failed");
  }

  let denyQuestionReturned = false;
  let denyCloseCalls = 0;
  readline.createInterface = () => ({
    question(_query, callback) {
      callback("no");
      denyQuestionReturned = true;
    },
    close() {
      denyCloseCalls += 1;
      if (denyQuestionReturned) {
        throw new Error("built approval deny cleanup secondary");
      }
    }
  });
  const denyDecision = await new TerminalApprovalPrompt({
    input: approvalInput,
    output: approvalOutput
  }).requestApproval(approvalRequest);
  if (
    denyDecision.action !== "deny"
    || denyDecision.source !== "interactive"
    || denyDecision.reason !== "User denied tool execution."
    || denyCloseCalls !== 1
  ) {
    throw new Error("built approval denial primary continuity failed");
  }

  const questionPrimary = { kind: "built approval question primary" };
  let questionCloseCalls = 0;
  readline.createInterface = () => ({
    question() {
      throw questionPrimary;
    },
    close() {
      questionCloseCalls += 1;
      throw new Error("built approval question cleanup secondary");
    }
  });
  let questionCaught;
  try {
    await new TerminalApprovalPrompt({
      input: approvalInput,
      output: approvalOutput
    }).requestApproval(approvalRequest);
  } catch (error) {
    questionCaught = error;
  }
  if (questionCaught !== questionPrimary || questionCloseCalls !== 1) {
    throw new Error("built approval question primary continuity failed");
  }
} finally {
  readline.createInterface = originalCreateInterface;
}

function runTuiProbe(failures) {
  const output = {
    isTTY: true,
    columns: 72,
    rows: 20,
    writeCalls: 0,
    write() {
      this.writeCalls += 1;
      if (failures.has(this.writeCalls)) {
        throw failures.get(this.writeCalls);
      }
    }
  };
  let caught;
  try {
    runTuiPtySmoke({
      output,
      now: () => "2026-07-26T00:00:00.000Z"
    });
  } catch (error) {
    caught = error;
  }
  return { caught, writeCalls: output.writeCalls };
}

const tuiCleanupRaw = new Error("built TUI cleanup secret");
const cleanupProbe = runTuiProbe(new Map([[3, tuiCleanupRaw]]));
if (
  !(cleanupProbe.caught instanceof Error)
  || cleanupProbe.caught.message !== "TUI PTY smoke cleanup failed"
  || cleanupProbe.caught.message.includes(tuiCleanupRaw.message)
  || cleanupProbe.writeCalls !== 3
) {
  throw new Error("built TUI cleanup projection failed");
}

const renderPrimary = { kind: "built TUI render primary" };
const renderProbe = runTuiProbe(new Map([
  [2, renderPrimary],
  [3, new Error("built TUI cleanup replacement")]
]));
if (renderProbe.caught !== renderPrimary || renderProbe.writeCalls !== 3) {
  throw new Error("built TUI render primary continuity failed");
}
' \
  "${REPO_ROOT}/ts-host/dist/cli/approval.js" \
  "${REPO_ROOT}/ts-host/dist/cli/tuiPtySmoke.js"

echo "==> built TUI controller composite lifecycle"
node --input-type=module -e '
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
const { TuiController } = await import(pathToFileURL(process.argv[1]).href);
const { TUI_SCREEN_SEQUENCE } = await import(pathToFileURL(process.argv[2]).href);
const transcriptDir = process.argv[3];

class BuiltSession {
  constructor(id, startHook = async () => undefined, stopHook = async () => undefined) {
    this.id = id;
    this.startHook = startHook;
    this.stopHook = stopHook;
    this.startCalls = 0;
    this.stopCalls = 0;
  }
  start() {
    this.startCalls += 1;
    return this.startHook();
  }
  async submit() {
    return { status: "success", messages: [] };
  }
  async cancelCurrentTurn() {
    return true;
  }
  stop() {
    this.stopCalls += 1;
    return this.stopHook();
  }
  getSessionId() {
    return this.id;
  }
}

class BuiltOutput {
  constructor(stopFailure) {
    this.isTTY = true;
    this.columns = 80;
    this.rows = 24;
    this.stopFailure = stopFailure;
    this.stopAttempts = 0;
  }
  write(text) {
    if (text.includes(TUI_SCREEN_SEQUENCE.showCursor + TUI_SCREEN_SEQUENCE.leaveAlternate)) {
      this.stopAttempts += 1;
      if (this.stopFailure !== undefined) {
        throw this.stopFailure;
      }
    }
  }
}

function builtInput(rawModeHook = () => undefined) {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = function (mode) {
    rawModeHook(mode);
    return this;
  };
  return input;
}

async function captureRejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected built TUI lifecycle probe to reject");
}

const startPrimary = { kind: "built TUI start primary" };
const startSession = new BuiltSession(
  "built-start-session",
  () => Promise.reject(startPrimary),
  () => Promise.reject(new Error("built TUI start cleanup secondary"))
);
const startController = new TuiController(transcriptDir, {
  interactive: true,
  transcriptDir,
  output: { isTTY: false, write() {} },
  sessionFactory: () => startSession
});
const startCaught = await captureRejection(startController.start());
if (startCaught !== startPrimary || startSession.stopCalls !== 1) {
  throw new Error("built TUI start primary continuity failed");
}

const stopRaw = new Error("built TUI stop cleanup secret");
const stopOutput = new BuiltOutput(stopRaw);
const stopFirst = new BuiltSession("built-stop-first", async () => undefined, () => {
  throw new Error("built TUI first stop secret");
});
const stopSecond = new BuiltSession(
  "built-stop-second",
  async () => undefined,
  () => Promise.reject(new Error("built TUI second stop secret"))
);
const stopSessions = [stopFirst, stopSecond];
const stopController = new TuiController(transcriptDir, {
  interactive: true,
  transcriptDir,
  input: builtInput(),
  output: stopOutput,
  sessionFactory: () => stopSessions.shift()
});
await stopController.start();
await stopController.createLiveSession();
const firstStop = stopController.stop();
const repeatedStop = stopController.stop();
if (repeatedStop !== firstStop) {
  throw new Error("built TUI stop Promise identity failed");
}
const stopCaught = await captureRejection(firstStop);
if (
  !(stopCaught instanceof Error)
  || stopCaught.message !== "GOD-code TUI cleanup failed."
  || stopCaught.message.includes("secret")
  || stopFirst.stopCalls !== 1
  || stopSecond.stopCalls !== 1
  || stopOutput.stopAttempts !== 1
  || stopController.stop() !== firstStop
) {
  throw new Error("built TUI all-settled cleanup projection failed");
}

const inactivePrimary = { kind: "built TUI inactive stop primary" };
const inactiveFirst = new BuiltSession("built-inactive-first", async () => undefined, () => {
  throw inactivePrimary;
});
const inactiveSecond = new BuiltSession("built-inactive-second");
const inactiveActive = new BuiltSession("built-inactive-active");
const inactiveSessions = [inactiveFirst, inactiveSecond, inactiveActive];
const inactiveController = new TuiController(transcriptDir, {
  interactive: true,
  transcriptDir,
  output: { isTTY: false, write() {} },
  sessionFactory: () => inactiveSessions.shift()
});
await inactiveController.start();
await inactiveController.createLiveSession();
await inactiveController.createLiveSession();
const inactiveCaught = await captureRejection(inactiveController.closeInactiveLiveSessions());
if (
  inactiveCaught !== inactivePrimary
  || inactiveFirst.stopCalls !== 1
  || inactiveSecond.stopCalls !== 1
  || inactiveActive.stopCalls !== 0
) {
  throw new Error("built TUI inactive session fan-out failed");
}
await inactiveController.stop().catch(() => undefined);

const inputPrimary = { kind: "built TUI input primary" };
const inputSession = new BuiltSession("built-input-session");
const inputOutput = new BuiltOutput();
const inputController = new TuiController(transcriptDir, {
  interactive: true,
  transcriptDir,
  input: builtInput((mode) => {
    if (mode) {
      throw inputPrimary;
    }
  }),
  output: inputOutput,
  sessionFactory: () => inputSession
});
const inputCaught = await captureRejection(inputController.run());
if (
  inputCaught !== inputPrimary
  || inputSession.stopCalls !== 1
  || inputOutput.stopAttempts !== 1
) {
  throw new Error("built TUI input primary cleanup continuity failed");
}
' \
  "${REPO_ROOT}/ts-host/dist/cli/tuiSession.js" \
  "${REPO_ROOT}/ts-host/dist/cli/tuiScreen.js" \
  "${SMOKE_ROOT}/phase599-transcripts"

echo "==> built transcript watcher finalization continuity"
node --input-type=module -e '
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  renderTranscriptWatchJson,
  resolveTranscriptArchiveDir,
  watchTranscriptSessions
} = await import(pathToFileURL(process.argv[1]).href);
const smokeRoot = process.argv[2];
const prototypeDir = path.join(smokeRoot, "phase600-prototype");
fs.mkdirSync(prototypeDir, { recursive: true });
const prototypeWatcher = fs.watch(prototypeDir, { persistent: false }, () => undefined);
const watcherPrototype = Object.getPrototypeOf(prototypeWatcher);
const originalClose = watcherPrototype.close;
prototypeWatcher.close();

const cleanupRoot = path.join(smokeRoot, "phase600-cleanup-root");
fs.mkdirSync(resolveTranscriptArchiveDir(cleanupRoot), { recursive: true });
const cleanupRaw = new Error("built transcript watcher cleanup secret");
let cleanupCloseCalls = 0;
watcherPrototype.close = function (...args) {
  cleanupCloseCalls += 1;
  const result = originalClose.apply(this, args);
  if (cleanupCloseCalls === 1) {
    throw cleanupRaw;
  }
  return result;
};
let cleanupResult;
try {
  cleanupResult = await watchTranscriptSessions({
    cwd: smokeRoot,
    roots: [cleanupRoot],
    includeArchive: true,
    maxEvents: 1,
    timeoutMs: 10
  });
} finally {
  watcherPrototype.close = originalClose;
}
const cleanupJson = renderTranscriptWatchJson(cleanupResult);
if (
  cleanupResult.roots[0]?.ok !== false
  || cleanupResult.roots[0]?.error !== "transcript watcher cleanup failed"
  || cleanupResult.roots[0]?.watchedScopes?.join(",") !== "active,archive"
  || cleanupCloseCalls !== 2
  || cleanupJson.includes(cleanupRaw.message)
) {
  throw new Error("built transcript watcher cleanup projection failed");
}

const primaryRoot = path.join(smokeRoot, "phase600-primary-root");
fs.mkdirSync(primaryRoot, { recursive: true });
fs.writeFileSync(resolveTranscriptArchiveDir(primaryRoot), "archive blocker", "utf8");
let primaryCloseCalls = 0;
watcherPrototype.close = function (...args) {
  primaryCloseCalls += 1;
  const result = originalClose.apply(this, args);
  throw new Error("built transcript watcher cleanup replacement");
};
let primaryResult;
try {
  primaryResult = await watchTranscriptSessions({
    cwd: smokeRoot,
    roots: [primaryRoot],
    includeArchive: true,
    maxEvents: 1,
    timeoutMs: 10
  });
} finally {
  watcherPrototype.close = originalClose;
}
const primaryJson = renderTranscriptWatchJson(primaryResult);
if (
  primaryResult.roots[0]?.ok !== false
  || !primaryResult.roots[0]?.error?.includes("Transcript archive root is not a directory")
  || primaryResult.roots[0]?.error === "transcript watcher cleanup failed"
  || primaryCloseCalls !== 1
  || primaryJson.includes("built transcript watcher cleanup replacement")
) {
  throw new Error("built transcript watcher setup primary continuity failed");
}
' \
  "${REPO_ROOT}/ts-host/dist/transcripts/history.js" \
  "${SMOKE_ROOT}"

echo "==> built provider log descriptor finalization continuity"
node --input-type=module -e '
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const {
  pruneLocalProviderModels,
  pullLocalProviderModel,
  removeLocalProviderModel,
  renderLocalProviderDaemonReportJson,
  startLocalProviderDaemon
} = await import(pathToFileURL(process.argv[1]).href);
const smokeRoot = process.argv[2];
const fixedMessage = "local provider log cleanup failed";

async function withThrowingClose(rawFailure, run) {
  const originalClose = fs.closeSync;
  const descriptors = new Set();
  let attempts = 0;
  fs.closeSync = (fd) => {
    attempts += 1;
    descriptors.add(fd);
    throw rawFailure;
  };
  try {
    return { value: await run(), attempts };
  } finally {
    fs.closeSync = originalClose;
    for (const fd of descriptors) {
      originalClose(fd);
    }
  }
}

async function captureWithThrowingClose(rawFailure, run) {
  const originalClose = fs.closeSync;
  const descriptors = new Set();
  let attempts = 0;
  fs.closeSync = (fd) => {
    attempts += 1;
    descriptors.add(fd);
    throw rawFailure;
  };
  let outcome;
  try {
    outcome = { kind: "fulfilled", value: await run() };
  } catch (reason) {
    outcome = { kind: "rejected", reason };
  } finally {
    fs.closeSync = originalClose;
    for (const fd of descriptors) {
      originalClose(fd);
    }
  }
  return { outcome, attempts };
}

function daemonEnv(name) {
  return {
    GOD_CODE_PROVIDER: "local-openai-compatible",
    GOD_CODE_MODEL: "local-model",
    GOD_CODE_LOCAL_PROVIDER_DAEMON_ENABLED: "true",
    GOD_CODE_LOCAL_PROVIDER_DAEMON_COMMAND: process.execPath,
    GOD_CODE_LOCAL_PROVIDER_DAEMON_ARGS: JSON.stringify(["-e", "process.exit(0)"]),
    GOD_CODE_LOCAL_PROVIDER_DAEMON_PID_FILE: path.join(smokeRoot, `${name}.json`),
    GOD_CODE_LOCAL_PROVIDER_DAEMON_LOG_FILE: path.join(smokeRoot, `${name}.log`)
  };
}

const daemonRaw = new Error("built provider daemon log cleanup secret");
const daemonCleanup = await withThrowingClose(daemonRaw, () => startLocalProviderDaemon({
  cwd: smokeRoot,
  environ: daemonEnv("phase601-daemon-cleanup"),
  dryRun: false,
  yes: true
}));
const daemonCheck = daemonCleanup.value.checks[0];
if (
  daemonCleanup.value.ok !== false
  || daemonCheck?.status !== "error"
  || daemonCheck?.message !== fixedMessage
  || typeof daemonCheck?.details?.marker_pid !== "number"
  || daemonCleanup.attempts !== 1
  || renderLocalProviderDaemonReportJson(daemonCleanup.value).includes(daemonRaw.message)
) {
  throw new Error("built provider daemon cleanup projection failed");
}

const markerPrimary = { kind: "built provider daemon marker primary" };
const originalWriteFile = fsp.writeFile;
fsp.writeFile = async () => {
  throw markerPrimary;
};
let markerCaught;
let markerResult;
try {
  markerResult = await captureWithThrowingClose(
    new Error("built provider daemon marker cleanup secondary"),
    () => startLocalProviderDaemon({
      cwd: smokeRoot,
      environ: daemonEnv("phase601-daemon-primary"),
      dryRun: false,
      yes: true
    })
  );
  markerCaught = markerResult.outcome.reason;
} finally {
  fsp.writeFile = originalWriteFile;
}
if (
  markerResult?.outcome.kind !== "rejected"
  || markerCaught !== markerPrimary
  || markerResult.attempts !== 1
) {
  throw new Error("built provider daemon primary continuity failed");
}

const modelRaw = new Error("built provider model log cleanup secret");
const modelOperations = [
  {
    name: "local_provider_model_pull",
    run: () => pullLocalProviderModel("fixture-model", {
      cwd: smokeRoot,
      environ: {
        GOD_CODE_PROVIDER: "local-openai-compatible",
        GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ENABLED: "true",
        GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_COMMAND: process.execPath,
        GOD_CODE_LOCAL_PROVIDER_MODEL_PULL_ARGS_TEMPLATE: JSON.stringify(["-e", "process.exit(0)", "{model}"])
      },
      dryRun: false,
      yes: true
    })
  },
  {
    name: "local_provider_model_remove",
    run: () => removeLocalProviderModel("fixture-model", {
      cwd: smokeRoot,
      environ: {
        GOD_CODE_PROVIDER: "local-openai-compatible",
        GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ENABLED: "true",
        GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_COMMAND: process.execPath,
        GOD_CODE_LOCAL_PROVIDER_MODEL_REMOVE_ARGS_TEMPLATE: JSON.stringify(["-e", "process.exit(0)", "{model}"])
      },
      dryRun: false,
      yes: true
    })
  },
  {
    name: "local_provider_model_prune",
    run: () => pruneLocalProviderModels("unused", {
      cwd: smokeRoot,
      environ: {
        GOD_CODE_PROVIDER: "local-openai-compatible",
        GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ENABLED: "true",
        GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_COMMAND: process.execPath,
        GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ARGS_TEMPLATE: JSON.stringify(["-e", "process.exit(0)", "{target}"]),
        GOD_CODE_LOCAL_PROVIDER_MODEL_PRUNE_ALLOWED_TARGETS: "unused"
      },
      dryRun: false,
      yes: true
    })
  }
];
const modelResult = await withThrowingClose(modelRaw, async () => {
  const reports = [];
  for (const operation of modelOperations) {
    const report = await operation.run();
    const check = report.checks[0];
    if (
      report.ok !== false
      || check?.name !== operation.name
      || check?.status !== "error"
      || check?.message !== fixedMessage
      || check?.details?.exit_code !== 0
      || JSON.stringify(report).includes(modelRaw.message)
    ) {
      throw new Error(`built provider ${operation.name} cleanup projection failed`);
    }
    reports.push(report);
  }
  return reports;
});
if (modelResult.value.length !== 3 || modelResult.attempts !== 3) {
  throw new Error("built provider model callback settlement failed");
}
' \
  "${REPO_ROOT}/ts-host/dist/cli/provider.js" \
  "${SMOKE_ROOT}"

echo "==> mcp inspect-config --json"
run_cli mcp inspect-config --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const config = report.checks.find((check) => check.name === "mcp_config");
if (report.ok !== true || config?.status !== "ok") {
  throw new Error("mcp inspect-config --json did not report ok mcp_config");
}
'

echo "==> mcp inspect-config --connect --resources --resource-templates --prompts --json config file"
MCP_CONFIG_FILE="${SMOKE_ROOT}/mcp-servers.json"
MCP_FIXTURE="${REPO_ROOT}/ts-host/test/fixtures/mcp-demo-server.py"
MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" MCP_FIXTURE="${MCP_FIXTURE}" node -e '
const fs = require("node:fs");
const configPath = process.env.MCP_CONFIG_FILE;
const fixture = process.env.MCP_FIXTURE;
fs.writeFileSync(configPath, JSON.stringify([{ id: "demo-file", command: "python3", args: [fixture] }]));
'
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-file-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" mcp inspect-config --connect --resources --resource-templates --prompts --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const config = report.checks.find((check) => check.name === "mcp_config");
const connect = report.checks.find((check) => check.name === "mcp_connect");
const resources = report.checks.find((check) => check.name === "mcp_resources");
const resourceTemplates = report.checks.find((check) => check.name === "mcp_resource_templates");
const prompts = report.checks.find((check) => check.name === "mcp_prompts");
if (report.ok !== true || config?.details?.source !== "file") {
  throw new Error("mcp inspect-config --json did not load MCP config file");
}
if (connect?.status !== "ok" || !connect?.details?.tools?.some((tool) => tool.name === "mcp.demo-file.echo")) {
  throw new Error("mcp inspect-config --connect --json did not connect file-configured MCP server");
}
const echo = connect?.details?.tools?.find((tool) => tool.name === "mcp.demo-file.echo");
if (echo?.input_schema?.properties?.value?.type !== "string") {
  throw new Error("mcp inspect-config --connect --json did not expose MCP tool input schema");
}
if (resources?.status !== "ok" || resources?.details?.resources?.[0]?.uri !== "memory://demo/readme") {
  throw new Error("mcp inspect-config --resources --json did not expose MCP resources");
}
if (resourceTemplates?.status !== "ok" || resourceTemplates?.details?.resource_templates?.[0]?.uri_template !== "memory://demo/item/{id}") {
  throw new Error("mcp inspect-config --resource-templates --json did not expose MCP resource templates");
}
if (prompts?.status !== "ok" || prompts?.details?.prompts?.[0]?.name !== "summarize") {
  throw new Error("mcp inspect-config --prompts --json did not expose MCP prompts");
}
'

echo "==> mcp read-resource --json config file"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-read-resource-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" mcp read-resource memory://demo/readme --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const read = report.checks.find((check) => check.name === "mcp_read_resource");
if (report.ok !== true || read?.details?.contents?.[0]?.text !== "Demo README resource body.") {
  throw new Error("mcp read-resource --json did not read MCP resource content");
}
'

echo "==> mcp get-prompt --json config file"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-get-prompt-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" mcp get-prompt summarize '{"text":"hello"}' --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const prompt = report.checks.find((check) => check.name === "mcp_get_prompt");
if (report.ok !== true || prompt?.details?.messages?.[0]?.content?.text !== "Summarize: hello") {
  throw new Error("mcp get-prompt --json did not get MCP prompt messages");
}
'

echo "==> mcp inspect-context --json config file"
MCP_CONTEXT='[{"type":"resource","uri":"memory://demo/readme"},{"type":"resource","uri":"memory://demo/readme"},{"type":"prompt","name":"summarize","arguments":{"text":"hello"}}]'
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-inspect-context-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  GOD_CODE_MCP_CONTEXT="${MCP_CONTEXT}" \
  node "${CLI}" mcp inspect-context --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const context = report.checks.find((check) => check.name === "mcp_context");
const messages = context?.details?.messages ?? [];
const rendered = JSON.stringify(messages);
if (report.ok !== true || context?.details?.requested_entry_count !== 3 || context?.details?.entry_count !== 2 || context?.details?.message_count !== 2) {
  throw new Error("mcp inspect-context --json did not build MCP context messages");
}
if (context?.details?.skipped_duplicate_count !== 1 || context?.details?.limits?.dedupe !== true) {
  throw new Error("mcp inspect-context --json did not apply default MCP context dedupe");
}
if (!rendered.includes("Demo README resource body.") || !rendered.includes("Summarize: hello")) {
  throw new Error("mcp inspect-context --json did not include MCP resource and prompt content");
}
'

echo "==> mcp subscribe-resource --json config file"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-subscribe-resource-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" mcp subscribe-resource memory://demo/readme --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const subscription = report.checks.find((check) => check.name === "mcp_subscribe_resource");
if (report.ok !== true || subscription?.details?.subscribed !== true) {
  throw new Error("mcp subscribe-resource --json did not subscribe MCP resource");
}
'

echo "==> mcp unsubscribe-resource --json config file"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-unsubscribe-resource-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" mcp unsubscribe-resource memory://demo/readme --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const subscription = report.checks.find((check) => check.name === "mcp_unsubscribe_resource");
if (report.ok !== true || subscription?.details?.subscribed !== false) {
  throw new Error("mcp unsubscribe-resource --json did not unsubscribe MCP resource");
}
'

echo "==> mcp wait-resource-update --json config file"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-resource-update-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" mcp wait-resource-update memory://demo/readme --timeout-ms 1000 --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const update = report.checks.find((check) => check.name === "mcp_resource_update");
if (report.ok !== true || update?.details?.updated !== true || update?.details?.timed_out !== false) {
  throw new Error("mcp wait-resource-update --json did not observe MCP resource update");
}
'

echo "==> mcp watch-resource-updates --json config file"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-resource-update-watch-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" mcp watch-resource-updates memory://demo/readme --max-events 3 --timeout-ms 1000 --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const watch = report.checks.find((check) => check.name === "mcp_resource_update_watch");
if (report.ok !== true || watch?.details?.event_count !== 3 || watch?.details?.timed_out !== false) {
  throw new Error("mcp watch-resource-updates --json did not observe multiple MCP resource updates");
}
'

echo "==> mcp loop-resource-updates --json config file"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-resource-update-loop-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" mcp loop-resource-updates memory://demo/readme --max-events 3 --timeout-ms 1000 --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const loop = report.checks.find((check) => check.name === "mcp_resource_update_loop");
if (report.ok !== true || loop?.details?.subscription_count !== 1 || loop?.details?.event_count !== 3 || loop?.details?.timed_out !== false) {
  throw new Error("mcp loop-resource-updates --json did not observe the MCP resource update event loop");
}
'

echo "==> mcp complete-prompt --json config file"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-complete-prompt-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" mcp complete-prompt summarize text alph --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const completion = report.checks.find((check) => check.name === "mcp_complete_prompt");
if (report.ok !== true || completion?.details?.values?.join(",") !== "alpha,alphabet") {
  throw new Error("mcp complete-prompt --json did not return prompt completions");
}
'

echo "==> mcp complete-prompt --values-only config file"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-complete-prompt-values-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" mcp complete-prompt summarize text alph --values-only | node -e '
const fs = require("node:fs");
const values = fs.readFileSync(0, "utf8").trim().split(/\r?\n/);
if (values.join(",") !== "alpha,alphabet") {
  throw new Error("mcp complete-prompt --values-only did not return one completion per line");
}
'

echo "==> mcp complete-prompt --jsonl config file"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-complete-prompt-jsonl-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" mcp complete-prompt summarize text alph --jsonl | node -e '
const fs = require("node:fs");
const rows = fs.readFileSync(0, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
if (rows.map((row) => row.value).join(",") !== "alpha,alphabet" || rows[0]?.ref !== "summarize") {
  throw new Error("mcp complete-prompt --jsonl did not return structured completion candidates");
}
'

echo "==> mcp complete-resource-template --json config file"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-complete-resource-template-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" mcp complete-resource-template 'memory://demo/item/{id}' id item --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const completion = report.checks.find((check) => check.name === "mcp_complete_resource_template");
if (report.ok !== true || completion?.details?.values?.join(",") !== "item-1,item-2") {
  throw new Error("mcp complete-resource-template --json did not return template completions");
}
'

echo "==> mcp complete-resource-template --values-only config file"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-complete-resource-template-values-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" mcp complete-resource-template 'memory://demo/item/{id}' id item --values-only | node -e '
const fs = require("node:fs");
const values = fs.readFileSync(0, "utf8").trim().split(/\r?\n/);
if (values.join(",") !== "item-1,item-2") {
  throw new Error("mcp complete-resource-template --values-only did not return one completion per line");
}
'

echo "==> mcp completion-script bash"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-completion-script-transcripts" \
  node "${CLI}" mcp completion-script bash --program god-code-test | node -e '
const fs = require("node:fs");
const script = fs.readFileSync(0, "utf8");
if (!script.includes("complete -F _god_code_mcp_completion -- '\''god-code-test'\''")) {
  throw new Error("mcp completion-script bash did not register the requested program");
}
if (!script.includes("complete-prompt") || !script.includes("--values-only")) {
  throw new Error("mcp completion-script bash did not include MCP completion candidate hooks");
}
'

echo "==> mcp completion-install bash"
MCP_COMPLETION_RC="${SMOKE_ROOT}/mcp-completion.bashrc"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-completion-install-transcripts" \
  node "${CLI}" mcp completion-install bash --program god-code-test --rc-file "${MCP_COMPLETION_RC}" --yes --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
if (report.action !== "create" || report.dry_run !== false || report.changed !== true) {
  throw new Error("mcp completion-install bash did not report a real create action");
}
'
node -e '
const fs = require("node:fs");
const file = process.argv[1];
const content = fs.readFileSync(file, "utf8");
if (!content.includes("# >>> GOD-code MCP completion >>>")) {
  throw new Error("mcp completion-install bash did not write a managed block");
}
if (!content.includes("complete -F _god_code_mcp_completion -- '\''god-code-test'\''")) {
  throw new Error("mcp completion-install bash did not install the requested program");
}
' "${MCP_COMPLETION_RC}"

env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-file-transcripts" \
  GOD_CODE_MCP_CONFIG_FILE="${MCP_CONFIG_FILE}" \
  node "${CLI}" tools inspect mcp.demo-file.echo --json | node -e '
const fs = require("node:fs");
const tool = JSON.parse(fs.readFileSync(0, "utf8"));
if (tool.name !== "mcp.demo-file.echo") {
  throw new Error(`unexpected MCP tool name: ${tool.name}`);
}
if (tool.input_schema?.properties?.value?.type !== "string") {
  throw new Error("tools inspect MCP tool did not expose the MCP input schema");
}
'

echo "==> mcp inspect-config --connect --json"
MCP_FIXTURE="${REPO_ROOT}/ts-host/test/fixtures/mcp-demo-server.py"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_CONFIG_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-transcripts" \
  GOD_CODE_MCP_SERVERS="[{\"id\":\"demo\",\"command\":\"python3\",\"args\":[\"${MCP_FIXTURE}\"]}]" \
  node "${CLI}" mcp inspect-config --connect --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const connect = report.checks.find((check) => check.name === "mcp_connect");
const tools = connect?.details?.tools ?? [];
if (report.ok !== true || connect?.status !== "ok") {
  throw new Error("mcp inspect-config --connect --json did not report ok mcp_connect");
}
if (!tools.some((tool) => tool.name === "mcp.demo.echo")) {
  throw new Error("mcp inspect-config --connect --json did not load demo MCP tool");
}
'

echo "==> mcp inspect-config --connect --json runtime error"
set +e
broken_mcp_output="$(
  env \
    -u GOD_CODE_PROVIDER \
    -u GOD_CODE_MODEL \
    -u GOD_CODE_API_KEY_ENV \
    -u GOD_CODE_BASE_URL \
    -u GOD_CODE_PROVIDER_TIMEOUT_S \
    -u GOD_CODE_MCP_CONFIG_FILE \
    GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-broken-transcripts" \
    GOD_CODE_MCP_SERVERS="[{\"id\":\"broken\",\"command\":\"__god_code_missing_mcp_command__\",\"env\":{\"SECRET_VALUE\":\"not-rendered\"}}]" \
    node "${CLI}" mcp inspect-config --connect --json
)"
broken_mcp_status=$?
set -e
if [[ "${broken_mcp_status}" -eq 0 ]]; then
  echo "Expected broken MCP connect diagnostics to return non-zero." >&2
  exit 1
fi
printf '%s' "${broken_mcp_output}" | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const connect = report.checks.find((check) => check.name === "mcp_connect");
if (report.ok !== false || connect?.status !== "error") {
  throw new Error("broken MCP diagnostics did not report mcp_connect error");
}
if (connect?.details?.error_code !== "connect_failed" || connect?.details?.server_id !== "broken") {
  throw new Error("broken MCP diagnostics did not include structured runtime error details");
}
if (!Array.isArray(connect?.details?.server?.env_keys) || !connect.details.server.env_keys.includes("SECRET_VALUE")) {
  throw new Error("broken MCP diagnostics did not include sanitized env key metadata");
}
if (JSON.stringify(report).includes("not-rendered")) {
  throw new Error("broken MCP diagnostics leaked env values");
}
'

echo "==> mcp inspect-config --json streamable-http"
MCP_HTTP_URL_FILE="${SMOKE_ROOT}/mcp-http-url.txt"
MCP_HTTP_ERR_FILE="${SMOKE_ROOT}/mcp-http-stderr.txt"
node "${REPO_ROOT}/ts-host/test/fixtures/mcp-streamable-http-server.mjs" >"${MCP_HTTP_URL_FILE}" 2>"${MCP_HTTP_ERR_FILE}" &
MCP_HTTP_PID=$!
for _ in $(seq 1 50); do
  if [[ -s "${MCP_HTTP_URL_FILE}" ]]; then
    break
  fi
  sleep 0.1
done
if [[ ! -s "${MCP_HTTP_URL_FILE}" ]]; then
  echo "Streamable HTTP MCP fixture did not print a URL" >&2
  cat "${MCP_HTTP_ERR_FILE}" >&2 || true
  exit 1
fi
MCP_HTTP_URL="$(head -n 1 "${MCP_HTTP_URL_FILE}")"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_CONFIG_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-http-transcripts" \
  GOD_CODE_MCP_SERVERS="[{\"id\":\"remote\",\"transport\":\"streamable-http\",\"url\":\"${MCP_HTTP_URL}\",\"headers\":{\"Authorization\":\"Bearer not-rendered\"}}]" \
  node "${CLI}" mcp inspect-config --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const config = report.checks.find((check) => check.name === "mcp_config");
const server = config?.details?.servers?.[0];
if (report.ok !== true || server?.transport !== "streamable-http" || !server?.url?.startsWith("http://127.0.0.1:")) {
  throw new Error("mcp inspect-config --json did not report streamable-http metadata");
}
if (!Array.isArray(server.header_keys) || !server.header_keys.includes("Authorization")) {
  throw new Error("mcp inspect-config --json did not sanitize HTTP header keys");
}
if (JSON.stringify(report).includes("not-rendered")) {
  throw new Error("mcp inspect-config --json leaked HTTP header values");
}
'

echo "==> mcp inspect-config --connect --resources --resource-templates --prompts --json streamable-http"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_CONFIG_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-http-connect-transcripts" \
  GOD_CODE_MCP_SERVERS="[{\"id\":\"remote\",\"transport\":\"streamable-http\",\"url\":\"${MCP_HTTP_URL}\",\"headers\":{\"Authorization\":\"Bearer not-rendered\"}}]" \
  node "${CLI}" mcp inspect-config --connect --resources --resource-templates --prompts --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const connect = report.checks.find((check) => check.name === "mcp_connect");
const resources = report.checks.find((check) => check.name === "mcp_resources");
const resourceTemplates = report.checks.find((check) => check.name === "mcp_resource_templates");
const prompts = report.checks.find((check) => check.name === "mcp_prompts");
if (report.ok !== true || connect?.status !== "ok") {
  throw new Error("streamable-http MCP diagnostics did not connect successfully");
}
if (!connect?.details?.tools?.some((tool) => tool.name === "mcp.remote.echo")) {
  throw new Error("streamable-http MCP diagnostics did not list HTTP MCP tools");
}
if (resources?.status !== "ok" || resources?.details?.resources?.[0]?.uri !== "memory://remote/http-readme") {
  throw new Error("streamable-http MCP diagnostics did not list HTTP MCP resources");
}
if (resourceTemplates?.status !== "ok" || resourceTemplates?.details?.resource_templates?.[0]?.uri_template !== "memory://remote/item/{id}") {
  throw new Error("streamable-http MCP diagnostics did not list HTTP MCP resource templates");
}
if (prompts?.status !== "ok" || prompts?.details?.prompts?.[0]?.name !== "httpSummarize") {
  throw new Error("streamable-http MCP diagnostics did not list HTTP MCP prompts");
}
if (JSON.stringify(report).includes("not-rendered")) {
  throw new Error("streamable-http MCP diagnostics leaked HTTP header values");
}
'

echo "==> mcp read-resource --json streamable-http"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_CONFIG_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-http-read-resource-transcripts" \
  GOD_CODE_MCP_SERVERS="[{\"id\":\"remote\",\"transport\":\"streamable-http\",\"url\":\"${MCP_HTTP_URL}\",\"headers\":{\"Authorization\":\"Bearer not-rendered\"}}]" \
  node "${CLI}" mcp read-resource memory://remote/http-readme --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const read = report.checks.find((check) => check.name === "mcp_read_resource");
if (report.ok !== true || read?.details?.contents?.[0]?.text !== "HTTP Demo README resource body.") {
  throw new Error("streamable-http MCP read-resource did not read resource content");
}
if (JSON.stringify(report).includes("not-rendered")) {
  throw new Error("streamable-http MCP read-resource leaked HTTP header values");
}
'

echo "==> mcp get-prompt --json streamable-http"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_CONFIG_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-http-get-prompt-transcripts" \
  GOD_CODE_MCP_SERVERS="[{\"id\":\"remote\",\"transport\":\"streamable-http\",\"url\":\"${MCP_HTTP_URL}\",\"headers\":{\"Authorization\":\"Bearer not-rendered\"}}]" \
  node "${CLI}" mcp get-prompt httpSummarize '{"text":"hello"}' --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const prompt = report.checks.find((check) => check.name === "mcp_get_prompt");
if (report.ok !== true || prompt?.details?.messages?.[0]?.content?.text !== "HTTP summarize: hello") {
  throw new Error("streamable-http MCP get-prompt did not get prompt messages");
}
if (JSON.stringify(report).includes("not-rendered")) {
  throw new Error("streamable-http MCP get-prompt leaked HTTP header values");
}
'

echo "==> mcp subscribe-resource --json streamable-http"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_CONFIG_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-http-subscribe-resource-transcripts" \
  GOD_CODE_MCP_SERVERS="[{\"id\":\"remote\",\"transport\":\"streamable-http\",\"url\":\"${MCP_HTTP_URL}\",\"headers\":{\"Authorization\":\"Bearer not-rendered\"}}]" \
  node "${CLI}" mcp subscribe-resource memory://remote/http-readme --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const subscription = report.checks.find((check) => check.name === "mcp_subscribe_resource");
if (report.ok !== true || subscription?.details?.subscribed !== true) {
  throw new Error("streamable-http MCP subscribe-resource did not subscribe resource");
}
if (JSON.stringify(report).includes("not-rendered")) {
  throw new Error("streamable-http MCP subscribe-resource leaked HTTP header values");
}
'

echo "==> mcp unsubscribe-resource --json streamable-http"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_CONFIG_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-http-unsubscribe-resource-transcripts" \
  GOD_CODE_MCP_SERVERS="[{\"id\":\"remote\",\"transport\":\"streamable-http\",\"url\":\"${MCP_HTTP_URL}\",\"headers\":{\"Authorization\":\"Bearer not-rendered\"}}]" \
  node "${CLI}" mcp unsubscribe-resource memory://remote/http-readme --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const subscription = report.checks.find((check) => check.name === "mcp_unsubscribe_resource");
if (report.ok !== true || subscription?.details?.subscribed !== false) {
  throw new Error("streamable-http MCP unsubscribe-resource did not unsubscribe resource");
}
if (JSON.stringify(report).includes("not-rendered")) {
  throw new Error("streamable-http MCP unsubscribe-resource leaked HTTP header values");
}
'

echo "==> mcp complete-prompt --json streamable-http"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_CONFIG_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-http-complete-prompt-transcripts" \
  GOD_CODE_MCP_SERVERS="[{\"id\":\"remote\",\"transport\":\"streamable-http\",\"url\":\"${MCP_HTTP_URL}\",\"headers\":{\"Authorization\":\"Bearer not-rendered\"}}]" \
  node "${CLI}" mcp complete-prompt httpSummarize text http-alph --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const completion = report.checks.find((check) => check.name === "mcp_complete_prompt");
if (report.ok !== true || completion?.details?.values?.join(",") !== "http-alpha,http-alphabet") {
  throw new Error("streamable-http MCP complete-prompt did not return completions");
}
if (JSON.stringify(report).includes("not-rendered")) {
  throw new Error("streamable-http MCP complete-prompt leaked HTTP header values");
}
'

echo "==> mcp complete-prompt --values-only streamable-http"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_CONFIG_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-http-complete-prompt-values-transcripts" \
  GOD_CODE_MCP_SERVERS="[{\"id\":\"remote\",\"transport\":\"streamable-http\",\"url\":\"${MCP_HTTP_URL}\",\"headers\":{\"Authorization\":\"Bearer not-rendered\"}}]" \
  node "${CLI}" mcp complete-prompt httpSummarize text http-alph --values-only | node -e '
const fs = require("node:fs");
const output = fs.readFileSync(0, "utf8");
const values = output.trim().split(/\r?\n/);
if (values.join(",") !== "http-alpha,http-alphabet") {
  throw new Error("streamable-http MCP complete-prompt --values-only did not return one completion per line");
}
if (output.includes("not-rendered")) {
  throw new Error("streamable-http MCP complete-prompt --values-only leaked HTTP header values");
}
'

echo "==> mcp complete-resource-template --json streamable-http"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_CONFIG_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-http-complete-resource-template-transcripts" \
  GOD_CODE_MCP_SERVERS="[{\"id\":\"remote\",\"transport\":\"streamable-http\",\"url\":\"${MCP_HTTP_URL}\",\"headers\":{\"Authorization\":\"Bearer not-rendered\"}}]" \
  node "${CLI}" mcp complete-resource-template 'memory://remote/item/{id}' id remote --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const completion = report.checks.find((check) => check.name === "mcp_complete_resource_template");
if (report.ok !== true || completion?.details?.values?.join(",") !== "remote-1,remote-2") {
  throw new Error("streamable-http MCP complete-resource-template did not return completions");
}
if (JSON.stringify(report).includes("not-rendered")) {
  throw new Error("streamable-http MCP complete-resource-template leaked HTTP header values");
}
'

echo "==> mcp inspect-config --connect --json streamable-http bearer token env"
if [[ -n "${MCP_HTTP_PID}" ]]; then
  kill "${MCP_HTTP_PID}" >/dev/null 2>&1 || true
  MCP_HTTP_PID=""
fi
MCP_AUTH_HTTP_URL_FILE="${SMOKE_ROOT}/mcp-auth-http-url.txt"
MCP_AUTH_HTTP_ERR_FILE="${SMOKE_ROOT}/mcp-auth-http-stderr.txt"
MCP_EXPECT_AUTHORIZATION="Bearer smoke-token" \
  node "${REPO_ROOT}/ts-host/test/fixtures/mcp-streamable-http-server.mjs" >"${MCP_AUTH_HTTP_URL_FILE}" 2>"${MCP_AUTH_HTTP_ERR_FILE}" &
MCP_HTTP_PID=$!
for _ in $(seq 1 50); do
  if [[ -s "${MCP_AUTH_HTTP_URL_FILE}" ]]; then
    break
  fi
  sleep 0.1
done
if [[ ! -s "${MCP_AUTH_HTTP_URL_FILE}" ]]; then
  echo "Auth Streamable HTTP MCP fixture did not print a URL" >&2
  cat "${MCP_AUTH_HTTP_ERR_FILE}" >&2 || true
  exit 1
fi
MCP_AUTH_HTTP_URL="$(head -n 1 "${MCP_AUTH_HTTP_URL_FILE}")"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_CONFIG_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-http-auth-transcripts" \
  SMOKE_MCP_TOKEN="smoke-token" \
  GOD_CODE_MCP_SERVERS="[{\"id\":\"remote-auth\",\"transport\":\"streamable-http\",\"url\":\"${MCP_AUTH_HTTP_URL}\",\"bearer_token_env\":\"SMOKE_MCP_TOKEN\"}]" \
  node "${CLI}" mcp inspect-config --connect --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const config = report.checks.find((check) => check.name === "mcp_config");
const connect = report.checks.find((check) => check.name === "mcp_connect");
const server = config?.details?.servers?.[0];
if (report.ok !== true || connect?.status !== "ok") {
  throw new Error("streamable-http MCP bearer token env diagnostics did not connect");
}
if (server?.bearer_token_env !== "SMOKE_MCP_TOKEN" || !server?.header_keys?.includes("Authorization")) {
  throw new Error("streamable-http MCP bearer token env diagnostics did not expose sanitized auth metadata");
}
if (JSON.stringify(report).includes("smoke-token")) {
  throw new Error("streamable-http MCP bearer token env diagnostics leaked token value");
}
'

echo "==> mcp inspect-config --connect --resources --resource-templates --prompts --json legacy sse"
if [[ -n "${MCP_HTTP_PID}" ]]; then
  kill "${MCP_HTTP_PID}" >/dev/null 2>&1 || true
  MCP_HTTP_PID=""
fi
MCP_SSE_URL_FILE="${SMOKE_ROOT}/mcp-sse-url.txt"
MCP_SSE_ERR_FILE="${SMOKE_ROOT}/mcp-sse-stderr.txt"
MCP_EXPECT_AUTHORIZATION="Bearer sse-smoke-token" \
  node "${REPO_ROOT}/ts-host/test/fixtures/mcp-sse-server.mjs" >"${MCP_SSE_URL_FILE}" 2>"${MCP_SSE_ERR_FILE}" &
MCP_HTTP_PID=$!
for _ in $(seq 1 50); do
  if [[ -s "${MCP_SSE_URL_FILE}" ]]; then
    break
  fi
  sleep 0.1
done
if [[ ! -s "${MCP_SSE_URL_FILE}" ]]; then
  echo "Legacy SSE MCP fixture did not print a URL" >&2
  cat "${MCP_SSE_ERR_FILE}" >&2 || true
  exit 1
fi
MCP_SSE_URL="$(head -n 1 "${MCP_SSE_URL_FILE}")"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_CONFIG_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/mcp-sse-transcripts" \
  SMOKE_SSE_MCP_TOKEN="sse-smoke-token" \
  GOD_CODE_MCP_SERVERS="[{\"id\":\"legacy\",\"transport\":\"sse\",\"url\":\"${MCP_SSE_URL}\",\"bearer_token_env\":\"SMOKE_SSE_MCP_TOKEN\"}]" \
  node "${CLI}" mcp inspect-config --connect --resources --resource-templates --prompts --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const config = report.checks.find((check) => check.name === "mcp_config");
const connect = report.checks.find((check) => check.name === "mcp_connect");
const resources = report.checks.find((check) => check.name === "mcp_resources");
const resourceTemplates = report.checks.find((check) => check.name === "mcp_resource_templates");
const prompts = report.checks.find((check) => check.name === "mcp_prompts");
const server = config?.details?.servers?.[0];
if (report.ok !== true || connect?.status !== "ok") {
  throw new Error("legacy SSE MCP diagnostics did not connect successfully");
}
if (server?.transport !== "sse" || !server?.url?.startsWith("http://127.0.0.1:")) {
  throw new Error("legacy SSE MCP diagnostics did not expose SSE transport metadata");
}
if (server?.bearer_token_env !== "SMOKE_SSE_MCP_TOKEN" || !server?.header_keys?.includes("Authorization")) {
  throw new Error("legacy SSE MCP diagnostics did not expose sanitized auth metadata");
}
if (!connect?.details?.tools?.some((tool) => tool.name === "mcp.legacy.echo")) {
  throw new Error("legacy SSE MCP diagnostics did not list SSE MCP tools");
}
if (resources?.status !== "ok" || resources?.details?.resources?.[0]?.uri !== "memory://sse/readme") {
  throw new Error("legacy SSE MCP diagnostics did not list SSE MCP resources");
}
if (resourceTemplates?.status !== "ok" || resourceTemplates?.details?.resource_templates?.[0]?.uri_template !== "memory://sse/item/{id}") {
  throw new Error("legacy SSE MCP diagnostics did not list SSE MCP resource templates");
}
if (prompts?.status !== "ok" || prompts?.details?.prompts?.[0]?.name !== "sseSummarize") {
  throw new Error("legacy SSE MCP diagnostics did not list SSE MCP prompts");
}
if (JSON.stringify(report).includes("sse-smoke-token")) {
  throw new Error("legacy SSE MCP diagnostics leaked token value");
}
'

echo "==> plugins validate --json"
run_cli plugins validate "${REPO_ROOT}/examples/plugins/demo-plugin/plugin.json" --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const manifest = report.checks.find((check) => check.name === "plugin_manifest");
if (report.ok !== true || manifest?.details?.id !== "demo-plugin") {
  throw new Error("plugins validate demo plugin did not report ok manifest");
}
'

echo "==> plugins validate packaged demo plugin --json"
run_cli plugins validate "${REPO_ROOT}/examples/plugins/demo-plugin" --json | node -e '
const fs = require("node:fs");
const path = require("node:path");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const manifest = report.checks.find((check) => check.name === "plugin_manifest");
if (report.ok !== true || manifest?.details?.id !== "demo-plugin") {
  throw new Error("plugins validate packaged demo plugin did not report ok manifest");
}
if (manifest?.details?.tools?.[0]?.name !== "plugin.demo.echo") {
  throw new Error("packaged demo plugin did not expose the expected tool");
}
const packageDir = path.join(process.env.REPO_ROOT, "examples", "plugins", "demo-plugin");
const readme = fs.readFileSync(path.join(packageDir, "README.md"), "utf8");
const input = JSON.parse(fs.readFileSync(path.join(packageDir, "fixtures", "echo-input.json"), "utf8"));
const output = JSON.parse(fs.readFileSync(path.join(packageDir, "fixtures", "echo-output.json"), "utf8"));
if (!readme.includes("manifest-only GOD-code plugin package")) {
  throw new Error("packaged demo plugin README did not describe the package boundary");
}
if (output.echoed !== input.value) {
  throw new Error("packaged demo plugin fixtures are inconsistent");
}
'

echo "==> plugins validate executable plugin --json"
GOD_CODE_EXECUTABLE_PLUGIN_TOKEN="not-rendered" run_cli plugins validate "${REPO_ROOT}/examples/plugins/executable-plugin" --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const manifest = report.checks.find((check) => check.name === "plugin_manifest");
if (report.ok !== true || manifest?.details?.id !== "executable-plugin") {
  throw new Error("plugins validate executable plugin did not report ok manifest");
}
if (manifest?.details?.runtime?.kind !== "node-subprocess" || manifest?.details?.runtime?.entry !== "handler.mjs") {
  throw new Error("executable plugin runtime metadata was not reported");
}
if (JSON.stringify(report).includes("not-rendered")) {
  throw new Error("executable plugin diagnostics leaked env values");
}
'

PLUGIN_CONFIG_FILE="${SMOKE_ROOT}/plugins.json"
printf '{"plugin_dirs":["%s"],"enabled_plugin_ids":["executable-plugin"]}\n' "${REPO_ROOT}/examples/plugins/executable-plugin" >"${PLUGIN_CONFIG_FILE}"

echo "==> plugins inspect-config --json executable plugin"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  -u GOD_CODE_MCP_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_DIRS \
  -u GOD_CODE_PLUGIN_ENABLED_IDS \
  -u GOD_CODE_PLUGIN_REGISTRY_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/plugin-config-transcripts" \
  GOD_CODE_PLUGIN_CONFIG_FILE="${PLUGIN_CONFIG_FILE}" \
  GOD_CODE_EXECUTABLE_PLUGIN_TOKEN="not-rendered" \
  node "${CLI}" plugins inspect-config --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const runtime = report.checks.find((check) => check.name === "plugin_runtime");
if (report.ok !== true || runtime?.details?.tools?.[0]?.name !== "plugin.executable.echo") {
  throw new Error("plugins inspect-config did not load executable plugin tool");
}
if (JSON.stringify(report).includes("not-rendered")) {
  throw new Error("plugins inspect-config leaked env values");
}
'

echo "==> tools list --json executable plugin"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  -u GOD_CODE_MCP_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_DIRS \
  -u GOD_CODE_PLUGIN_ENABLED_IDS \
  -u GOD_CODE_PLUGIN_REGISTRY_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/plugin-tools-transcripts" \
  GOD_CODE_PLUGIN_CONFIG_FILE="${PLUGIN_CONFIG_FILE}" \
  node "${CLI}" tools list --json | node -e '
const fs = require("node:fs");
const tools = JSON.parse(fs.readFileSync(0, "utf8"));
if (!tools.some((tool) => tool.name === "plugin.executable.echo")) {
  throw new Error("tools list did not include executable plugin tool");
}
'

echo "==> run --json executable plugin"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  -u GOD_CODE_MCP_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_DIRS \
  -u GOD_CODE_PLUGIN_ENABLED_IDS \
  -u GOD_CODE_PLUGIN_REGISTRY_FILE \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/plugin-run-transcripts" \
  GOD_CODE_PLUGIN_CONFIG_FILE="${PLUGIN_CONFIG_FILE}" \
  GOD_CODE_EXECUTABLE_PLUGIN_TOKEN="not-rendered" \
  node "${CLI}" run --json --raw-events 'tool plugin.executable.echo {"value":"smoke"}' | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
const toolResult = result.events?.find((event) => event.event_type === "tool_result_received")?.payload?.result;
if (result.status !== "success" || toolResult?.output?.echoed !== "smoke" || toolResult?.output?.token_present !== true) {
  throw new Error("run --json did not execute executable plugin tool");
}
if (JSON.stringify(result).includes("not-rendered")) {
  throw new Error("plugin run leaked env values");
}
'

echo "==> plugins list --json local registry"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  -u GOD_CODE_MCP_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_DIRS \
  -u GOD_CODE_PLUGIN_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_ENABLED_IDS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/plugin-registry-transcripts" \
  GOD_CODE_PLUGIN_REGISTRY_FILE="${REPO_ROOT}/examples/config/plugin-registry.json" \
  node "${CLI}" plugins list --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const plugins = report.checks?.[0]?.details?.plugins ?? [];
if (report.ok !== true || plugins.length !== 2 || plugins[0]?.id !== "executable-plugin" || plugins[1]?.enabled !== false) {
  throw new Error("plugins list did not report local registry entries");
}
'

echo "==> plugins inspect --json local registry"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  -u GOD_CODE_MCP_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_DIRS \
  -u GOD_CODE_PLUGIN_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_ENABLED_IDS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/plugin-registry-inspect-transcripts" \
  GOD_CODE_PLUGIN_REGISTRY_FILE="${REPO_ROOT}/examples/config/plugin-registry.json" \
  node "${CLI}" plugins inspect demo-skill --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const plugin = report.checks?.[0]?.details?.plugin;
if (report.ok !== true || plugin?.id !== "demo-skill" || plugin?.enabled !== false) {
  throw new Error("plugins inspect did not report disabled registry entry");
}
'

PLUGIN_INSTALL_REGISTRY="${SMOKE_ROOT}/plugin-install-registry.json"

echo "==> plugins install --dry-run --json local registry"
run_cli plugins install "${REPO_ROOT}/examples/plugins/demo-plugin" --registry-file "${PLUGIN_INSTALL_REGISTRY}" --dry-run --tag smoke --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "plugin_local_registry_install" || result.id !== "demo-plugin" || result.action !== "create_registry") {
  throw new Error("plugins install dry-run did not report planned registry creation");
}
if (result.dry_run !== true || result.changed !== true || result.tags?.[0] !== "smoke") {
  throw new Error("plugins install dry-run did not expose stable dry-run metadata");
}
'
if [[ -f "${PLUGIN_INSTALL_REGISTRY}" ]]; then
  echo "plugins install --dry-run unexpectedly wrote registry file" >&2
  exit 1
fi

echo "==> plugins install --yes --json local registry"
run_cli plugins install "${REPO_ROOT}/examples/plugins/demo-plugin" --registry-file "${PLUGIN_INSTALL_REGISTRY}" --yes --tag smoke --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "plugin_local_registry_install" || result.id !== "demo-plugin" || result.action !== "create_registry") {
  throw new Error("plugins install --yes did not report registry creation");
}
if (result.dry_run !== false || result.changed !== true) {
  throw new Error("plugins install --yes did not expose confirmed write metadata");
}
'

echo "==> plugins list --json installed registry"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  -u GOD_CODE_MCP_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_DIRS \
  -u GOD_CODE_PLUGIN_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_ENABLED_IDS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/plugin-install-registry-transcripts" \
  GOD_CODE_PLUGIN_REGISTRY_FILE="${PLUGIN_INSTALL_REGISTRY}" \
  node "${CLI}" plugins list --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const plugin = report.checks?.[0]?.details?.plugins?.[0];
if (report.ok !== true || plugin?.id !== "demo-plugin" || plugin?.enabled !== true) {
  throw new Error("plugins list did not read installed local registry entry");
}
'

echo "==> plugins tags --dry-run --json local registry"
run_cli plugins tags demo-plugin --registry-file "${PLUGIN_INSTALL_REGISTRY}" --add tagged --dry-run --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "plugin_local_registry_tags" || result.id !== "demo-plugin" || result.action !== "add_tags") {
  throw new Error("plugins tags dry-run did not report planned tag add");
}
if (result.dry_run !== true || result.changed !== true || !result.tags?.includes("tagged") || result.added_tags?.[0] !== "tagged") {
  throw new Error("plugins tags dry-run did not expose stable tag metadata");
}
'

echo "==> plugins tags --yes --json local registry"
run_cli plugins tags demo-plugin --registry-file "${PLUGIN_INSTALL_REGISTRY}" --add tagged --yes --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "plugin_local_registry_tags" || result.id !== "demo-plugin" || result.action !== "add_tags") {
  throw new Error("plugins tags --yes did not report tag add");
}
if (result.dry_run !== false || result.changed !== true || !result.tags?.includes("tagged")) {
  throw new Error("plugins tags --yes did not expose confirmed tag metadata");
}
'

echo "==> plugins inspect --json installed registry tags"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  -u GOD_CODE_MCP_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_DIRS \
  -u GOD_CODE_PLUGIN_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_ENABLED_IDS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/plugin-tags-registry-transcripts" \
  GOD_CODE_PLUGIN_REGISTRY_FILE="${PLUGIN_INSTALL_REGISTRY}" \
  node "${CLI}" plugins inspect demo-plugin --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const plugin = report.checks?.[0]?.details?.plugin;
if (report.ok !== true || plugin?.id !== "demo-plugin" || !plugin?.tags?.includes("tagged")) {
  throw new Error("plugins inspect did not report updated local registry tags");
}
'

echo "==> plugins tags remove --yes --json local registry"
run_cli plugins tags demo-plugin --registry-file "${PLUGIN_INSTALL_REGISTRY}" --remove tagged --yes --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "plugin_local_registry_tags" || result.id !== "demo-plugin" || result.action !== "remove_tags") {
  throw new Error("plugins tags remove --yes did not report tag removal");
}
if (result.dry_run !== false || result.changed !== true || result.tags?.includes("tagged") || result.removed_tags?.[0] !== "tagged") {
  throw new Error("plugins tags remove --yes did not expose confirmed tag metadata");
}
'

echo "==> plugins disable --dry-run --json local registry"
run_cli plugins disable demo-plugin --registry-file "${PLUGIN_INSTALL_REGISTRY}" --dry-run --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "plugin_local_registry_set_enabled" || result.id !== "demo-plugin" || result.action !== "disable_entry") {
  throw new Error("plugins disable dry-run did not report planned registry state change");
}
if (result.previous_enabled !== true || result.enabled !== false || result.dry_run !== true || result.changed !== true) {
  throw new Error("plugins disable dry-run did not expose stable state metadata");
}
'

echo "==> plugins disable --yes --json local registry"
run_cli plugins disable demo-plugin --registry-file "${PLUGIN_INSTALL_REGISTRY}" --yes --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "plugin_local_registry_set_enabled" || result.id !== "demo-plugin" || result.action !== "disable_entry") {
  throw new Error("plugins disable --yes did not report registry state change");
}
if (result.previous_enabled !== true || result.enabled !== false || result.dry_run !== false || result.changed !== true) {
  throw new Error("plugins disable --yes did not expose confirmed state metadata");
}
'

echo "==> plugins list --json installed registry after disable"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  -u GOD_CODE_MCP_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_DIRS \
  -u GOD_CODE_PLUGIN_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_ENABLED_IDS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/plugin-disable-registry-transcripts" \
  GOD_CODE_PLUGIN_REGISTRY_FILE="${PLUGIN_INSTALL_REGISTRY}" \
  node "${CLI}" plugins list --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const plugin = report.checks?.[0]?.details?.plugins?.[0];
if (report.ok !== true || plugin?.id !== "demo-plugin" || plugin?.enabled !== false) {
  throw new Error("plugins list did not report disabled local registry entry");
}
'

echo "==> plugins enable --yes --json local registry"
run_cli plugins enable demo-plugin --registry-file "${PLUGIN_INSTALL_REGISTRY}" --yes --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "plugin_local_registry_set_enabled" || result.id !== "demo-plugin" || result.action !== "enable_entry") {
  throw new Error("plugins enable --yes did not report registry state change");
}
if (result.previous_enabled !== false || result.enabled !== true || result.dry_run !== false || result.changed !== true) {
  throw new Error("plugins enable --yes did not expose confirmed state metadata");
}
'

echo "==> plugins uninstall --dry-run --json local registry"
run_cli plugins uninstall demo-plugin --registry-file "${PLUGIN_INSTALL_REGISTRY}" --dry-run --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "plugin_local_registry_uninstall" || result.id !== "demo-plugin" || result.action !== "remove_entry") {
  throw new Error("plugins uninstall dry-run did not report planned registry removal");
}
if (result.dry_run !== true || result.changed !== true || result.removed_path === null) {
  throw new Error("plugins uninstall dry-run did not expose stable dry-run metadata");
}
'

echo "==> plugins uninstall --yes --json local registry"
run_cli plugins uninstall demo-plugin --registry-file "${PLUGIN_INSTALL_REGISTRY}" --yes --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "plugin_local_registry_uninstall" || result.id !== "demo-plugin" || result.action !== "remove_entry") {
  throw new Error("plugins uninstall --yes did not report registry removal");
}
if (result.dry_run !== false || result.changed !== true) {
  throw new Error("plugins uninstall --yes did not expose confirmed write metadata");
}
'

echo "==> plugins list --json installed registry after uninstall"
env \
  -u GOD_CODE_PROVIDER \
  -u GOD_CODE_MODEL \
  -u GOD_CODE_API_KEY_ENV \
  -u GOD_CODE_BASE_URL \
  -u GOD_CODE_PROVIDER_TIMEOUT_S \
  -u GOD_CODE_MCP_SERVERS \
  -u GOD_CODE_MCP_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_DIRS \
  -u GOD_CODE_PLUGIN_CONFIG_FILE \
  -u GOD_CODE_PLUGIN_ENABLED_IDS \
  GOD_CODE_TRANSCRIPT_DIR="${SMOKE_ROOT}/plugin-uninstall-registry-transcripts" \
  GOD_CODE_PLUGIN_REGISTRY_FILE="${PLUGIN_INSTALL_REGISTRY}" \
  node "${CLI}" plugins list --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const plugins = report.checks?.[0]?.details?.plugins ?? [];
if (report.ok !== true || plugins.length !== 0) {
  throw new Error("plugins list still reported removed local registry entry");
}
'

echo "==> plugins validate skill --json"
run_cli plugins validate "${REPO_ROOT}/examples/plugins/demo-skill" --json | node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(0, "utf8"));
const manifest = report.checks.find((check) => check.name === "plugin_manifest");
if (report.ok !== true || manifest?.details?.id !== "demo-skill") {
  throw new Error("plugins validate demo skill did not report ok manifest");
}
'

echo "==> plugins schema --json"
run_cli plugins schema --json | node -e '
const fs = require("node:fs");
const schema = JSON.parse(fs.readFileSync(0, "utf8"));
if (!Array.isArray(schema.required) || schema.required.join(",") !== "id,name,version") {
  throw new Error("plugins schema --json did not expose required manifest fields");
}
const tool = schema.properties?.tools?.items;
if (!Array.isArray(tool?.required) || tool.required.join(",") !== "name,description") {
  throw new Error("plugins schema --json did not expose required tool fields");
}
if (tool?.properties?.input_schema?.type !== "object") {
  throw new Error("plugins schema --json did not document tool input_schema");
}
const runtime = schema.properties?.runtime;
if (!Array.isArray(runtime?.properties?.kind?.enum) || !runtime.properties.kind.enum.includes("node-subprocess")) {
  throw new Error("plugins schema --json did not document node-subprocess runtime");
}
'

echo "==> usage exit code"
set +e
run_cli tools inspect >/dev/null 2>&1
usage_status=$?
set -e
if [[ "${usage_status}" -ne 2 ]]; then
  echo "Expected usage error exit code 2, got ${usage_status}" >&2
  exit 1
fi

echo "==> run --json"
run_cli run --json "bash printf ok" | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.status !== "success") {
  throw new Error(`run --json failed: ${result.status}`);
}
if (!result.assistant_message?.content?.includes("ok")) {
  throw new Error("run --json output did not include ok");
}
'

echo "==> run --json --approval-mode prompt non-interactive deny"
approval_json="${SMOKE_ROOT}/approval-noninteractive.json"
approval_err="${SMOKE_ROOT}/approval-noninteractive.err"
set +e
run_cli run --json --approval-mode prompt "bash printf denied" >"${approval_json}" 2>"${approval_err}"
approval_status=$?
set -e
if [[ "${approval_status}" -ne 1 ]]; then
  echo "Expected approval-mode prompt non-interactive denial exit code 1, got ${approval_status}" >&2
  exit 1
fi
node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (result.status !== "error" || result.error?.code !== "permission_denied") {
  throw new Error("run --json --approval-mode prompt did not fail closed with permission_denied");
}
if (!String(result.error?.message ?? "").includes("Interactive approval requires a TTY")) {
  throw new Error("run --json --approval-mode prompt did not report non-interactive approval denial");
}
' "${approval_json}"

echo "==> run --json --raw-events"
run_cli run --json --raw-events "bash printf ok" | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.status !== "success") {
  throw new Error(`run --json --raw-events failed: ${result.status}`);
}
const events = Array.isArray(result.events) ? result.events : [];
for (const eventType of ["session_started", "turn_started", "tool_call_requested", "tool_result_received", "assistant_message", "turn_finished"]) {
  if (!events.some((event) => event.event_type === eventType)) {
    throw new Error(`missing raw event: ${eventType}`);
  }
}
'

echo "==> sessions list/search/replay/delete"
session_list="$(run_cli sessions list)"
session_id="$(
  printf '%s\n' "${session_list}" | node -e '
const fs = require("node:fs");
const raw = fs.readFileSync(0, "utf8");
const match = raw.match(/^([0-9a-f-]{36})\s/m);
if (!match) {
  throw new Error(`missing session id in sessions list:\n${raw}`);
}
process.stdout.write(match[1]);
'
)"
export SMOKE_SESSION_ID="${session_id}"

run_cli sessions search bash >/dev/null
run_cli sessions search bash --json | node -e '
const fs = require("node:fs");
const results = JSON.parse(fs.readFileSync(0, "utf8"));
if (!Array.isArray(results) || results.length === 0) {
  throw new Error("sessions search --json returned no results");
}
if (!results.some((result) => result.summary?.sessionId === process.env.SMOKE_SESSION_ID)) {
  throw new Error("sessions search --json did not include selected session");
}
'

echo "==> sessions global-search --json explicit root"
run_cli sessions global-search bash --root "${SMOKE_ROOT}/transcripts" --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "transcript_global_search" || result.query !== "bash") {
  throw new Error("sessions global-search --json returned unexpected metadata");
}
if (!Array.isArray(result.roots) || result.roots.length !== 1 || result.roots[0].ok !== true) {
  throw new Error("sessions global-search --json did not report the explicit root");
}
if (!result.roots[0].active_matches?.some((match) => match.summary?.sessionId === process.env.SMOKE_SESSION_ID)) {
  throw new Error("sessions global-search --json did not include the selected active session");
}
'

echo "==> sessions global-search --json env root"
GOD_CODE_TRANSCRIPT_SEARCH_DIRS="[\"${SMOKE_ROOT}/transcripts\"]" run_cli sessions global-search bash --max-results 1 --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "transcript_global_search" || result.max_results !== 1) {
  throw new Error("sessions global-search env root did not preserve max result metadata");
}
if (result.total_matches !== 1 || result.roots?.[0]?.active_matches?.length !== 1) {
  throw new Error("sessions global-search env root did not return the capped match");
}
'

echo "==> sessions global-search --json include-current dedupe"
run_cli sessions global-search bash --include-current --root "${SMOKE_ROOT}/transcripts" --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "transcript_global_search" || result.roots?.length !== 1) {
  throw new Error("sessions global-search did not dedupe include-current and explicit root");
}
if (!result.roots[0].active_matches?.some((match) => match.summary?.sessionId === process.env.SMOKE_SESSION_ID)) {
  throw new Error("sessions global-search include-current did not include the selected session");
}
'

echo "==> sessions global-search --json discovery search root"
run_cli sessions global-search bash --root "${SMOKE_ROOT}/transcripts" --search-root "${SMOKE_ROOT}/transcripts" --discovery-limit 1 --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "transcript_global_search" || result.discovery === null) {
  throw new Error("sessions global-search discovery did not include discovery metadata");
}
if (result.roots?.length !== 1) {
  throw new Error("sessions global-search discovery did not dedupe direct and discovered roots");
}
if (result.discovery.limit !== 1 || result.discovery.discovered_roots?.length !== 1) {
  throw new Error("sessions global-search discovery did not preserve discovery limit metadata");
}
if (!result.roots[0].active_matches?.some((match) => match.summary?.sessionId === process.env.SMOKE_SESSION_ID)) {
  throw new Error("sessions global-search discovery did not search the discovered transcript root");
}
'

echo "==> sessions roots --json direct root"
run_cli sessions roots --search-root "${SMOKE_ROOT}/transcripts" --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "transcript_root_discovery" || result.search_roots?.[0]?.ok !== true) {
  throw new Error("sessions roots --json did not report a successful direct search root");
}
if (!result.roots?.some((root) => root.active_file_count > 0 && root.root?.endsWith("transcripts"))) {
  throw new Error("sessions roots --json did not discover the direct transcript root");
}
'

echo "==> sessions roots --json env root include-empty"
GOD_CODE_TRANSCRIPT_ROOT_SEARCH_DIRS="[\"${SMOKE_ROOT}/transcripts\"]" run_cli sessions roots --include-empty --limit 1 --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "transcript_root_discovery" || result.limit !== 1 || result.include_empty !== true) {
  throw new Error("sessions roots env root did not preserve discovery metadata");
}
if (result.roots?.length !== 1 || result.roots[0].active_file_count < 1) {
  throw new Error("sessions roots env root did not discover the capped transcript root");
}
'

echo "==> sessions watch --json include-current timeout"
run_cli sessions watch --include-current --max-events 1 --timeout-ms 25 --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "transcript_watch" || result.max_events !== 1 || result.timeout_ms !== 25) {
  throw new Error("sessions watch --json did not preserve watch metadata");
}
if (result.timed_out !== true || result.event_count !== 0) {
  throw new Error("sessions watch --json did not return the expected timeout diagnostic");
}
if (!Array.isArray(result.roots) || result.roots.length !== 1 || result.roots[0].ok !== true) {
  throw new Error("sessions watch --json did not watch the current transcript root");
}
if (!result.roots[0].watched_scopes?.includes("active")) {
  throw new Error("sessions watch --json did not report active scope");
}
'

echo "==> sessions index watch-refresh --json refresh-on-timeout"
run_cli sessions index watch-refresh --include-current --max-events 1 --timeout-ms 25 --debounce-ms 1 --refresh-on-timeout --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "transcript_index_watch_refresh" || result.max_events !== 1 || result.timeout_ms !== 25) {
  throw new Error("sessions index watch-refresh --json did not preserve watch-refresh metadata");
}
if (result.refresh_on_timeout !== true || result.timed_out !== true) {
  throw new Error("sessions index watch-refresh --json did not report timeout refresh mode");
}
if (result.refresh_count !== 1 || result.roots?.[0]?.refresh_count !== 1) {
  throw new Error("sessions index watch-refresh --json did not refresh the current transcript root");
}
if (!result.roots[0].last_refresh || result.roots[0].last_refresh.session_count < 1) {
  throw new Error("sessions index watch-refresh --json did not include refresh diagnostics");
}
'

run_cli sessions replay "${session_id}" --json | node -e '
const fs = require("node:fs");
const replay = JSON.parse(fs.readFileSync(0, "utf8"));
if (replay.session_id !== process.env.SMOKE_SESSION_ID) {
  throw new Error(`unexpected replay session id: ${replay.session_id}`);
}
if (!Array.isArray(replay.entries) || replay.entry_count !== replay.entries.length) {
  throw new Error("sessions replay --json returned an invalid entry list");
}
'

run_cli sessions timeline "${session_id}" --json | node -e '
const fs = require("node:fs");
const timeline = JSON.parse(fs.readFileSync(0, "utf8"));
if (timeline.session_id !== process.env.SMOKE_SESSION_ID || timeline.scope !== "active") {
  throw new Error("sessions timeline --json returned the wrong active session");
}
if (!(timeline.entry_count > 0) || !Array.isArray(timeline.entries) || timeline.entries.length !== timeline.entry_count) {
  throw new Error("sessions timeline --json returned an invalid entry list");
}
if (!(timeline.tool_event_count > 0) || typeof timeline.duration_ms !== "number") {
  throw new Error("sessions timeline --json did not expose timeline summary metadata");
}
if (!timeline.entries.some((entry) => typeof entry.preview === "string")) {
  throw new Error("sessions timeline --json did not include bounded previews");
}
'

run_cli sessions timeline "${session_id}" --no-preview | node -e '
const fs = require("node:fs");
const output = fs.readFileSync(0, "utf8");
if (!output.includes("GOD-code session timeline:")) {
  throw new Error("sessions timeline --no-preview did not render text output");
}
if (output.includes("preview=")) {
  throw new Error("sessions timeline --no-preview rendered previews");
}
'

set +e
timeline_bad_preview="$(run_cli sessions timeline "${session_id}" --preview-chars 0 2>&1 >/dev/null)"
timeline_bad_preview_status=$?
set -e
if [[ "${timeline_bad_preview_status}" -ne 2 ]]; then
  echo "Expected sessions timeline invalid preview to exit 2, got ${timeline_bad_preview_status}" >&2
  exit 1
fi
if [[ "${timeline_bad_preview}" != *"--preview-chars"* ]]; then
  echo "sessions timeline invalid preview did not mention --preview-chars" >&2
  exit 1
fi

resume_output="$(
  run_cli sessions resume "${session_id}" --json --raw-events "bash printf resumed"
)"
resumed_session_id="$(
  printf '%s' "${resume_output}" | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.status !== "success") {
  throw new Error(`sessions resume failed: ${result.status}`);
}
if (result.resumed_from_session_id !== process.env.SMOKE_SESSION_ID) {
  throw new Error("sessions resume did not report the source session id");
}
if (!(result.restored_message_count > 0)) {
  throw new Error("sessions resume did not restore transcript messages");
}
if (!result.assistant_message?.content?.includes("resumed")) {
  throw new Error("sessions resume output did not include resumed command output");
}
const events = Array.isArray(result.events) ? result.events : [];
if (!events.some((event) => event.event_type === "turn_finished")) {
  throw new Error("sessions resume --raw-events did not include turn_finished");
}
process.stdout.write(events[0]?.session_id ?? "");
'
)"
if [[ -z "${resumed_session_id}" || "${resumed_session_id}" == "${session_id}" ]]; then
  echo "sessions resume did not create a fresh session id" >&2
  exit 1
fi
export SMOKE_RESUMED_SESSION_ID="${resumed_session_id}"

run_cli sessions recover "${session_id}" --json --dry-run | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.type !== "transcript_recovery" || result.session_id !== process.env.SMOKE_SESSION_ID) {
  throw new Error("sessions recover --dry-run did not report recovery plan metadata");
}
if (result.strategy !== "strict" || result.recoverable !== true) {
  throw new Error("sessions recover --dry-run did not report a recoverable strict plan");
}
if (!(result.restored_message_count > 0)) {
  throw new Error("sessions recover --dry-run did not restore transcript messages");
}
'

recover_output="$(
  run_cli sessions recover "${session_id}" --json --raw-events "bash printf recovered"
)"
recovered_session_id="$(
  printf '%s' "${recover_output}" | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.status !== "success") {
  throw new Error(`sessions recover failed: ${result.status}`);
}
if (result.recovered_from_session_id !== process.env.SMOKE_SESSION_ID) {
  throw new Error("sessions recover did not report the source session id");
}
if (result.recovery_strategy !== "strict" || !(result.restored_message_count > 0)) {
  throw new Error("sessions recover did not expose recovery metadata");
}
if (!result.assistant_message?.content?.includes("recovered")) {
  throw new Error("sessions recover output did not include recovered command output");
}
const events = Array.isArray(result.events) ? result.events : [];
if (!events.some((event) => event.event_type === "turn_finished")) {
  throw new Error("sessions recover --raw-events did not include turn_finished");
}
process.stdout.write(events[0]?.session_id ?? "");
'
)"
if [[ -z "${recovered_session_id}" || "${recovered_session_id}" == "${session_id}" || "${recovered_session_id}" == "${resumed_session_id}" ]]; then
  echo "sessions recover did not create a fresh session id" >&2
  exit 1
fi
export SMOKE_RECOVERED_SESSION_ID="${recovered_session_id}"

set +e
resume_without_prompt="$(run_cli sessions resume "${session_id}" 2>&1 >/dev/null)"
resume_without_prompt_status=$?
set -e
if [[ "${resume_without_prompt_status}" -ne 2 ]]; then
  echo "Expected sessions resume without prompt to exit 2, got ${resume_without_prompt_status}" >&2
  exit 1
fi
if [[ "${resume_without_prompt}" != *"Missing prompt"* ]]; then
  echo "sessions resume without prompt did not explain missing prompt" >&2
  exit 1
fi

set +e
recover_without_prompt="$(run_cli sessions recover "${session_id}" 2>&1 >/dev/null)"
recover_without_prompt_status=$?
set -e
if [[ "${recover_without_prompt_status}" -ne 2 ]]; then
  echo "Expected sessions recover without prompt to exit 2, got ${recover_without_prompt_status}" >&2
  exit 1
fi
if [[ "${recover_without_prompt}" != *"Missing prompt"* ]]; then
  echo "sessions recover without prompt did not explain missing prompt" >&2
  exit 1
fi

echo "==> sessions cleanup"
node -e '
const fs = require("node:fs");
const path = require("node:path");
const transcriptDir = path.join(process.env.SMOKE_ROOT, "transcripts");
fs.mkdirSync(transcriptDir, { recursive: true });
for (const [sessionId, timestamp, prompt] of [
  ["old-archive", "2000-01-01T00:00:00.000Z", "old archive prompt"],
  ["new-active", "2999-01-01T00:00:00.000Z", "new active prompt"],
]) {
  const entry = {
    session_id: sessionId,
    turn_id: "t1",
    type: "user",
    timestamp,
    payload: {
      type: "user",
      turn_id: "t1",
      message: { role: "user", content: prompt },
    },
  };
  fs.writeFileSync(path.join(transcriptDir, `${sessionId}.jsonl`), JSON.stringify(entry) + "\n");
}
'

run_cli sessions cleanup --older-than-days 30 --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.action !== "dry-run" || result.matched_count !== 1 || result.affected_count !== 0) {
  throw new Error("sessions cleanup dry-run did not report the expected counts");
}
if (result.sessions[0]?.session_id !== "old-archive") {
  throw new Error("sessions cleanup dry-run selected the wrong session");
}
'

set +e
cleanup_without_yes="$(run_cli sessions cleanup --older-than-days 30 --archive 2>&1 >/dev/null)"
cleanup_without_yes_status=$?
set -e
if [[ "${cleanup_without_yes_status}" -ne 2 ]]; then
  echo "Expected sessions cleanup archive without --yes to exit 2, got ${cleanup_without_yes_status}" >&2
  exit 1
fi
if [[ "${cleanup_without_yes}" != *"requires --yes"* ]]; then
  echo "sessions cleanup archive without --yes did not explain confirmation requirement" >&2
  exit 1
fi

run_cli sessions cleanup --older-than-days 30 --archive --yes --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.action !== "archive" || result.matched_count !== 1 || result.affected_count !== 1) {
  throw new Error("sessions cleanup archive did not report the expected counts");
}
if (!fs.existsSync(result.sessions[0]?.archive_path)) {
  throw new Error("sessions cleanup archive did not move the transcript");
}
'

run_cli sessions archive list --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (!Array.isArray(result) || result.length !== 1 || result[0]?.sessionId !== "old-archive") {
  throw new Error("sessions archive list --json did not list the archived session");
}
'

run_cli sessions archive replay old-archive --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.session_id !== "old-archive" || result.entry_count !== 1) {
  throw new Error("sessions archive replay --json did not return the archived transcript");
}
'

run_cli sessions archive timeline old-archive --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.session_id !== "old-archive" || result.scope !== "archive" || result.entry_count !== 1) {
  throw new Error("sessions archive timeline --json did not return the archived timeline");
}
if (!result.entries[0]?.preview?.includes("old archive")) {
  throw new Error("sessions archive timeline --json did not include a bounded archived preview");
}
'

run_cli sessions archive search "old archive" --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (!Array.isArray(result) || result.length !== 1 || result[0]?.summary?.sessionId !== "old-archive") {
  throw new Error("sessions archive search --json did not find the archived transcript");
}
'

run_cli sessions search "old archive" --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (!Array.isArray(result) || result.length !== 0) {
  throw new Error("active sessions search unexpectedly included an archived transcript");
}
'

set +e
archive_compress_without_yes="$(run_cli sessions archive compress old-archive 2>&1 >/dev/null)"
archive_compress_without_yes_status=$?
set -e
if [[ "${archive_compress_without_yes_status}" -ne 2 ]]; then
  echo "Expected sessions archive compress without --yes to exit 2, got ${archive_compress_without_yes_status}" >&2
  exit 1
fi
if [[ "${archive_compress_without_yes}" != *"requires --yes"* ]]; then
  echo "sessions archive compress without --yes did not explain confirmation requirement" >&2
  exit 1
fi

run_cli sessions archive compress old-archive --yes --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.session_id !== "old-archive" || result.compressed !== true) {
  throw new Error("sessions archive compress --json did not confirm compression");
}
if (!result.compressed_path.endsWith(".jsonl.gz")) {
  throw new Error("sessions archive compress did not write a .jsonl.gz target");
}
if (fs.existsSync(result.source_path) || !fs.existsSync(result.compressed_path)) {
  throw new Error("sessions archive compress did not replace the JSONL source with gzip output");
}
if (!(result.original_bytes > 0) || !(result.compressed_bytes > 0)) {
  throw new Error("sessions archive compress did not report byte counts");
}
'

run_cli sessions archive replay old-archive --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.session_id !== "old-archive" || result.entry_count !== 1) {
  throw new Error("sessions archive replay --json did not read the compressed transcript");
}
'

run_cli sessions archive timeline old-archive --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.session_id !== "old-archive" || result.scope !== "archive" || result.entry_count !== 1) {
  throw new Error("sessions archive timeline --json did not read the compressed transcript");
}
if (!result.file_path.endsWith(".jsonl.gz")) {
  throw new Error("sessions archive timeline --json did not preserve compressed file metadata");
}
'

run_cli sessions archive search "old archive" --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (!Array.isArray(result) || result.length !== 1 || !result[0]?.summary?.filePath?.endsWith(".jsonl.gz")) {
  throw new Error("sessions archive search --json did not find the compressed archived transcript");
}
'

run_cli sessions index build --include-archive --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.include_archive !== true || result.session_count < 2) {
  throw new Error("sessions index build --json did not include active and archive sessions");
}
const sessions = Array.isArray(result.sessions) ? result.sessions : [];
if (!sessions.some((session) => session.scope === "active" && session.summary?.sessionId === "new-active")) {
  throw new Error("sessions index build --json did not include the active fixture");
}
if (!sessions.some((session) => session.scope === "archive" && session.summary?.sessionId === "old-archive")) {
  throw new Error("sessions index build --json did not include the archived fixture");
}
if (!fs.existsSync(result.index_path)) {
  throw new Error("sessions index build --json did not create the index file");
}
'

run_cli sessions index search "old archive" --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (!Array.isArray(result.results) || result.results.length !== 1) {
  throw new Error("sessions index search --json did not find the archived session");
}
if (result.results[0].scope !== "archive" || !result.results[0]?.summary?.filePath?.endsWith(".jsonl.gz")) {
  throw new Error("sessions index search --json did not preserve archived gzip metadata");
}
'

run_cli sessions index search "new active" --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (!Array.isArray(result.results) || result.results.length !== 1 || result.results[0].scope !== "active") {
  throw new Error("sessions index search --json did not find the active session");
}
'

node -e '
const fs = require("node:fs");
const path = require("node:path");
const transcriptDir = path.join(process.env.SMOKE_ROOT, "transcripts");
const entry = {
  session_id: "late-active",
  turn_id: "t1",
  type: "user",
  timestamp: "2999-01-02T00:00:00.000Z",
  payload: {
    type: "user",
    turn_id: "t1",
    message: { role: "user", content: "late active prompt" },
  },
};
fs.writeFileSync(path.join(transcriptDir, "late-active.jsonl"), JSON.stringify(entry) + "\n");
'

run_cli sessions index search "late active" --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (!Array.isArray(result.results) || result.results.length !== 0) {
  throw new Error("sessions index search --json unexpectedly found a transcript before refresh");
}
'

run_cli sessions index refresh --include-archive --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.created !== false || !(result.added_count >= 1)) {
  throw new Error("sessions index refresh --json did not incrementally add a new transcript");
}
'

run_cli sessions index search "late active" --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (!Array.isArray(result.results) || result.results.length !== 1 || result.results[0]?.summary?.sessionId !== "late-active") {
  throw new Error("sessions index search --json did not find the refreshed transcript");
}
'

node -e '
const fs = require("node:fs");
const path = require("node:path");
const transcriptDir = path.join(process.env.SMOKE_ROOT, "transcripts");
const entry = {
  session_id: "auto-refresh-active",
  turn_id: "t1",
  type: "user",
  timestamp: "2999-01-03T00:00:00.000Z",
  payload: {
    type: "user",
    turn_id: "t1",
    message: { role: "user", content: "auto refresh prompt" },
  },
};
fs.writeFileSync(path.join(transcriptDir, "auto-refresh-active.jsonl"), JSON.stringify(entry) + "\n");
'

run_cli sessions index search "auto refresh" --refresh --include-archive --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (!Array.isArray(result.results) || result.results.length !== 1 || result.results[0]?.summary?.sessionId !== "auto-refresh-active") {
  throw new Error("sessions index search --refresh --json did not refresh before searching");
}
'

node -e '
const fs = require("node:fs");
const path = require("node:path");
const archiveDir = path.join(process.env.SMOKE_ROOT, "transcripts", "archive");
fs.mkdirSync(archiveDir, { recursive: true });
const entry = {
  session_id: "archive-delete",
  turn_id: "t1",
  type: "user",
  timestamp: "2000-01-01T00:00:00.000Z",
  payload: {
    type: "user",
    turn_id: "t1",
    message: { role: "user", content: "archive delete prompt" },
  },
};
fs.writeFileSync(path.join(archiveDir, "archive-delete.jsonl"), JSON.stringify(entry) + "\n");
'

set +e
archive_delete_without_yes="$(run_cli sessions archive delete archive-delete 2>&1 >/dev/null)"
archive_delete_without_yes_status=$?
set -e
if [[ "${archive_delete_without_yes_status}" -ne 2 ]]; then
  echo "Expected sessions archive delete without --yes to exit 2, got ${archive_delete_without_yes_status}" >&2
  exit 1
fi
if [[ "${archive_delete_without_yes}" != *"requires --yes"* ]]; then
  echo "sessions archive delete without --yes did not explain confirmation requirement" >&2
  exit 1
fi

run_cli sessions archive delete archive-delete --yes --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.session_id !== "archive-delete" || result.deleted !== true) {
  throw new Error("sessions archive delete --json did not confirm deletion");
}
if (fs.existsSync(result.file_path)) {
  throw new Error("sessions archive delete did not remove the archived transcript");
}
'

set +e
archive_restore_without_yes="$(run_cli sessions archive restore old-archive 2>&1 >/dev/null)"
archive_restore_without_yes_status=$?
set -e
if [[ "${archive_restore_without_yes_status}" -ne 2 ]]; then
  echo "Expected sessions archive restore without --yes to exit 2, got ${archive_restore_without_yes_status}" >&2
  exit 1
fi
if [[ "${archive_restore_without_yes}" != *"requires --yes"* ]]; then
  echo "sessions archive restore without --yes did not explain confirmation requirement" >&2
  exit 1
fi

run_cli sessions archive restore old-archive --yes --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.session_id !== "old-archive" || result.restored !== true) {
  throw new Error("sessions archive restore --json did not confirm restore");
}
if (!result.source_path.endsWith(".jsonl.gz")) {
  throw new Error("sessions archive restore did not restore from a compressed archive");
}
if (!fs.existsSync(result.restored_path) || fs.existsSync(result.source_path)) {
  throw new Error("sessions archive restore did not decompress the transcript back to active history");
}
'

run_cli sessions delete old-archive --json --yes | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.session_id !== "old-archive" || result.deleted !== true) {
  throw new Error("sessions delete restored old-archive did not confirm deletion");
}
'

node -e '
const fs = require("node:fs");
const path = require("node:path");
const transcriptDir = path.join(process.env.SMOKE_ROOT, "transcripts");
const entry = {
  session_id: "old-delete",
  turn_id: "t1",
  type: "user",
  timestamp: "2000-01-01T00:00:00.000Z",
  payload: {
    type: "user",
    turn_id: "t1",
    message: { role: "user", content: "old delete prompt" },
  },
};
fs.writeFileSync(path.join(transcriptDir, "old-delete.jsonl"), JSON.stringify(entry) + "\n");
'

run_cli sessions cleanup --older-than-days 30 --delete --yes --json | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.action !== "delete" || result.matched_count !== 1 || result.affected_count !== 1) {
  throw new Error("sessions cleanup delete did not report the expected counts");
}
if (result.sessions[0]?.session_id !== "old-delete") {
  throw new Error("sessions cleanup delete selected the wrong session");
}
if (fs.existsSync(result.sessions[0]?.source_path)) {
  throw new Error("sessions cleanup delete did not remove the transcript");
}
'

set +e
delete_without_yes="$(run_cli sessions delete "${session_id}" 2>&1 >/dev/null)"
delete_without_yes_status=$?
set -e
if [[ "${delete_without_yes_status}" -ne 2 ]]; then
  echo "Expected sessions delete without --yes to exit 2, got ${delete_without_yes_status}" >&2
  exit 1
fi
if [[ "${delete_without_yes}" != *"requires --yes"* ]]; then
  echo "sessions delete without --yes did not explain confirmation requirement" >&2
  exit 1
fi

run_cli sessions delete "${session_id}" --json --yes | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.session_id !== process.env.SMOKE_SESSION_ID || result.deleted !== true) {
  throw new Error("sessions delete --json --yes did not confirm deletion");
}
'

run_cli sessions delete "${resumed_session_id}" --json --yes | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.session_id !== process.env.SMOKE_RESUMED_SESSION_ID || result.deleted !== true) {
  throw new Error("sessions delete resumed session did not confirm deletion");
}
'

run_cli sessions delete "${recovered_session_id}" --json --yes | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.session_id !== process.env.SMOKE_RECOVERED_SESSION_ID || result.deleted !== true) {
  throw new Error("sessions delete recovered session did not confirm deletion");
}
'

run_cli sessions delete new-active --json --yes | node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync(0, "utf8"));
if (result.session_id !== "new-active" || result.deleted !== true) {
  throw new Error("sessions delete new-active did not confirm deletion");
}
'

post_delete_list="$(run_cli sessions list)"
if printf '%s\n' "${post_delete_list}" | grep -q "${session_id}"; then
  echo "Deleted session still appears in sessions list: ${session_id}" >&2
  exit 1
fi

echo "==> rpc-smoke"
run_cli rpc-smoke >/dev/null

echo "CLI smoke ok"
