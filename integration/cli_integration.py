#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
CLI_PATH = REPO_ROOT / "ts-host" / "dist" / "cli" / "main.js"
GOLDEN_DIR = REPO_ROOT / "protocol" / "goldens"
HTTP_MCP_FIXTURE = REPO_ROOT / "ts-host" / "test" / "fixtures" / "mcp-streamable-http-server.mjs"
SSE_MCP_FIXTURE = REPO_ROOT / "ts-host" / "test" / "fixtures" / "mcp-sse-server.mjs"

ISOLATED_ENV_KEYS = (
    "GOD_CODE_PROVIDER",
    "GOD_CODE_MODEL",
    "GOD_CODE_API_KEY_ENV",
    "GOD_CODE_BASE_URL",
    "GOD_CODE_PROVIDER_TIMEOUT_S",
    "GOD_CODE_PROVIDER_MAX_RETRIES",
    "GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS",
    "GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS",
    "GOD_CODE_PROVIDER_FALLBACKS",
    "GOD_CODE_PROVIDER_MAX_INPUT_TOKENS",
    "GOD_CODE_PROVIDER_MAX_OUTPUT_TOKENS",
    "GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS",
    "GOD_CODE_PROVIDER_REQUIRE_USAGE",
    "GOD_CODE_ANTHROPIC_VERSION",
    "GOD_CODE_CONTEXT_COMPACTION",
    "GOD_CODE_CONTEXT_MAX_CHARS",
    "GOD_CODE_CONTEXT_KEEP_RECENT_MESSAGES",
    "GOD_CODE_CONTEXT_SUMMARY_MAX_CHARS",
    "GOD_CODE_SYSTEM_PROMPT_ENABLED",
    "GOD_CODE_SYSTEM_PROMPT",
    "GOD_CODE_SYSTEM_PROMPT_FILE",
    "GOD_CODE_SYSTEM_PROMPT_EXTRA",
    "GOD_CODE_MCP_SERVERS",
    "GOD_CODE_MCP_CONFIG_FILE",
    "GOD_CODE_MCP_CONTEXT",
    "GOD_CODE_MCP_CONTEXT_FILE",
    "GOD_CODE_PLUGIN_DIRS",
    "GOD_CODE_PLUGIN_CONFIG_FILE",
    "GOD_CODE_PLUGIN_ENABLED_IDS",
    "GOD_CODE_PLUGIN_REGISTRY_FILE",
    "GOD_CODE_AUDIT_FILE",
    "GOD_CODE_AUDIT_MAX_BYTES",
    "GOD_CODE_AUDIT_REDACT_KEYS",
    "GOD_CODE_AUDIT_DURABILITY",
)


@dataclass(frozen=True)
class Scenario:
    cwd: Path
    transcript_dir: Path


def main() -> int:
    if not CLI_PATH.exists():
        print(f"Missing built CLI: {CLI_PATH}", file=sys.stderr)
        print("Run first: cd ts-host && npm run build", file=sys.stderr)
        return 2

    temp_root = Path(tempfile.mkdtemp(prefix="god-code-integration."))
    try:
        run_cli_contract_tests(temp_root)
        run_golden_event_tests(temp_root)
        run_transcript_contract_test(temp_root)
        print("Integration tests ok")
        return 0
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def run_cli_contract_tests(temp_root: Path) -> None:
    scenario = create_scenario(temp_root, "cli-contract", {"README.md": "hello\n"})

    doctor = parse_json(run_cli(["doctor", "--json"], scenario).stdout)
    assert doctor["ok"] is True
    assert_includes(
        [check["name"] for check in doctor["checks"]],
        ["node", "transcript_dir", "provider_config", "python_engine", "tool_catalog"],
    )

    audit_file = scenario.cwd / "audit.jsonl"
    audit_absolute_path = str(audit_file.resolve())
    audit_path_hash = hashlib.sha256(audit_absolute_path.encode("utf-8")).hexdigest()
    if hasattr(os, "getuid"):
        audit_user_scope = str(os.getuid())
    else:
        audit_user_scope = hashlib.sha256(str(Path.home()).encode("utf-8")).hexdigest()[:16]
    audit_lock_path = Path(tempfile.gettempdir()) / f"god-code-audit-{audit_user_scope}-{audit_path_hash}.lock"
    audit_owner_token = "00000000-0000-4000-8000-000000000001"
    audit_env = {"GOD_CODE_AUDIT_FILE": audit_absolute_path}
    shutil.rmtree(audit_lock_path, ignore_errors=True)
    audit_quarantine_path = Path(f"{audit_lock_path}.cleanup-Cc0001")
    audit_recovery_quarantine_path = Path(f"{audit_lock_path}.cleanup-Dd0001")
    audit_empty_quarantine_path = Path(f"{audit_lock_path}.cleanup-Ii0001")
    audit_disposal_path = Path(f"{audit_lock_path}.cleanup-Ee0001.dispose-Ff0001")
    audit_empty_disposal_path = Path(f"{audit_lock_path}.cleanup-Gg0001.dispose-Hh0001")
    shutil.rmtree(audit_quarantine_path, ignore_errors=True)
    shutil.rmtree(audit_recovery_quarantine_path, ignore_errors=True)
    shutil.rmtree(audit_empty_quarantine_path, ignore_errors=True)
    shutil.rmtree(audit_disposal_path, ignore_errors=True)
    shutil.rmtree(audit_empty_disposal_path, ignore_errors=True)
    audit_lock_path.mkdir(mode=0o700)
    audit_owner_path = audit_lock_path / "owner.json"
    audit_owner_path.write_text(
        json.dumps(
            {
                "version": 1,
                "owner_token": audit_owner_token,
                "pid": os.getpid(),
                "acquired_at": "2026-07-22T10:30:00.000Z",
                "acquired_at_ms": 1784716200000,
            }
        )
        + "\n",
        encoding="utf-8",
    )
    audit_owner_path.chmod(0o600)
    audit_owner_contents = audit_owner_path.read_text(encoding="utf-8")
    audit_quarantine_path.mkdir(mode=0o700)
    audit_quarantine_owner_path = audit_quarantine_path / "owner.json"
    shutil.copyfile(audit_owner_path, audit_quarantine_owner_path)
    audit_quarantine_owner_path.chmod(0o600)
    try:
        audit_targeted_quarantine_inspection_raw = run_cli(
            ["audit", "inspect-lock-quarantine", "Cc0001", "--json"],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_targeted_quarantine_inspection = parse_json(
            audit_targeted_quarantine_inspection_raw
        )
        audit_targeted_quarantine_check = audit_targeted_quarantine_inspection[
            "checks"
        ][0]
        audit_targeted_quarantine = audit_targeted_quarantine_check["details"][
            "quarantine"
        ]
        assert audit_targeted_quarantine_inspection["ok"] is True
        assert audit_targeted_quarantine_check["status"] == "warn"
        assert audit_targeted_quarantine["quarantine_id"] == "Cc0001"
        assert audit_targeted_quarantine["layout"] == "owner_only"
        audit_quarantine_owner_fingerprint = audit_targeted_quarantine[
            "owner_fingerprint"
        ]
        assert re.fullmatch(r"[0-9a-f]{32}", audit_quarantine_owner_fingerprint)
        assert audit_owner_token not in audit_targeted_quarantine_inspection_raw
        assert audit_quarantine_path.is_dir()

        audit_targeted_quarantine_missing_id = run_cli(
            ["audit", "inspect-lock-quarantine", "--json"],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(
            r"Missing quarantine id",
            audit_targeted_quarantine_missing_id.stderr,
        )
        audit_targeted_quarantine_invalid_id = run_cli(
            ["audit", "inspect-lock-quarantine", "bad", "--json"],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(
            r"Invalid quarantine id",
            audit_targeted_quarantine_invalid_id.stderr,
        )

        audit_quarantine_inspection_raw = run_cli(
            ["audit", "inspect-lock-quarantines", "--json"],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_quarantine_inspection = parse_json(audit_quarantine_inspection_raw)
        audit_quarantine_details = audit_quarantine_inspection["checks"][0]["details"]
        assert audit_quarantine_inspection["ok"] is True
        assert audit_quarantine_details["matched_entry_count"] == 1
        assert audit_quarantine_details["scan_limit"] == 4096
        assert audit_quarantine_details["result_limit"] == 128
        assert audit_quarantine_details["quarantines"][0]["quarantine_id"] == "Cc0001"
        assert audit_quarantine_details["quarantines"][0]["layout"] == "owner_only"
        assert (
            audit_quarantine_details["quarantines"][0]["owner_fingerprint"]
            == audit_quarantine_owner_fingerprint
        )
        assert audit_owner_token not in audit_quarantine_inspection_raw
        assert audit_quarantine_path.is_dir()

        audit_quarantine_cleanup_dry_run_raw = run_cli(
            ["audit", "cleanup-lock-quarantine", "Cc0001", "--json"],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_quarantine_cleanup_dry_run = parse_json(audit_quarantine_cleanup_dry_run_raw)
        audit_quarantine_cleanup_details = audit_quarantine_cleanup_dry_run["checks"][0]["details"]
        assert audit_quarantine_cleanup_dry_run["ok"] is True
        assert audit_quarantine_cleanup_details["dry_run"] is True
        assert audit_quarantine_cleanup_details["removed"] is False
        assert (
            audit_quarantine_cleanup_details["owner_fingerprint"]
            == audit_quarantine_owner_fingerprint
        )
        assert audit_owner_token not in audit_quarantine_cleanup_dry_run_raw
        assert audit_quarantine_path.is_dir()

        audit_quarantine_cleanup_missing_id = run_cli(
            ["audit", "cleanup-lock-quarantine", "--json"],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(r"Missing quarantine id", audit_quarantine_cleanup_missing_id.stderr)
        audit_quarantine_cleanup_wrong_owner = parse_json(
            run_cli(
                [
                    "audit",
                    "cleanup-lock-quarantine",
                    "Cc0001",
                    "--yes",
                    "--expect-owner",
                    "0" * 32,
                    "--json",
                ],
                scenario,
                expected_status=1,
                extra_env=audit_env,
            ).stdout
        )
        assert audit_quarantine_cleanup_wrong_owner["ok"] is False
        assert audit_quarantine_owner_fingerprint not in json.dumps(
            audit_quarantine_cleanup_wrong_owner
        )
        assert audit_quarantine_path.is_dir()

        audit_quarantine_cleanup_removed_raw = run_cli(
            [
                "audit",
                "cleanup-lock-quarantine",
                "Cc0001",
                "--yes",
                "--expect-owner",
                audit_quarantine_owner_fingerprint,
                "--json",
            ],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_quarantine_cleanup_removed = parse_json(audit_quarantine_cleanup_removed_raw)
        assert audit_quarantine_cleanup_removed["ok"] is True
        assert audit_quarantine_cleanup_removed["checks"][0]["details"]["removed"] is True
        assert (
            audit_quarantine_cleanup_removed["checks"][0]["details"]
            ["quarantine_exists"]
            is False
        )
        assert audit_owner_token not in audit_quarantine_cleanup_removed_raw
        assert not audit_quarantine_path.exists()
        assert audit_lock_path.is_dir()

        audit_targeted_quarantine_missing = parse_json(
            run_cli(
                ["audit", "inspect-lock-quarantine", "Cc0001", "--json"],
                scenario,
                extra_env=audit_env,
            ).stdout
        )
        audit_targeted_quarantine_missing_check = audit_targeted_quarantine_missing[
            "checks"
        ][0]
        assert audit_targeted_quarantine_missing["ok"] is True
        assert audit_targeted_quarantine_missing_check["status"] == "ok"
        assert (
            audit_targeted_quarantine_missing_check["details"]["quarantine"][
                "exists"
            ]
            is False
        )

        audit_empty_quarantine_path.mkdir(mode=0o700)
        audit_empty_quarantine_inspection_raw = run_cli(
            ["audit", "inspect-lock-quarantine", "Ii0001", "--json"],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_empty_quarantine_inspection = parse_json(
            audit_empty_quarantine_inspection_raw
        )
        audit_empty_quarantine_entry = audit_empty_quarantine_inspection[
            "checks"
        ][0]["details"]["quarantine"]
        assert audit_empty_quarantine_entry["layout"] == "empty"
        audit_empty_quarantine_fingerprint = audit_empty_quarantine_entry[
            "empty_directory_fingerprint"
        ]
        assert re.fullmatch(r"[0-9a-f]{32}", audit_empty_quarantine_fingerprint)
        assert audit_empty_quarantine_path.is_dir()

        audit_empty_quarantine_cleanup_dry_run = parse_json(
            run_cli(
                [
                    "audit",
                    "cleanup-empty-lock-quarantine",
                    "Ii0001",
                    "--json",
                ],
                scenario,
                extra_env=audit_env,
            ).stdout
        )
        audit_empty_quarantine_cleanup_details = (
            audit_empty_quarantine_cleanup_dry_run["checks"][0]["details"]
        )
        assert audit_empty_quarantine_cleanup_dry_run["ok"] is True
        assert audit_empty_quarantine_cleanup_details["dry_run"] is True
        assert audit_empty_quarantine_cleanup_details["removed"] is False
        assert (
            audit_empty_quarantine_cleanup_details["empty_directory_fingerprint"]
            == audit_empty_quarantine_fingerprint
        )
        assert audit_empty_quarantine_path.is_dir()

        audit_empty_quarantine_cleanup_missing_id = run_cli(
            ["audit", "cleanup-empty-lock-quarantine", "--json"],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(
            r"Missing quarantine id",
            audit_empty_quarantine_cleanup_missing_id.stderr,
        )
        audit_empty_quarantine_cleanup_invalid_id = run_cli(
            ["audit", "cleanup-empty-lock-quarantine", "bad", "--json"],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(
            r"Invalid quarantine id",
            audit_empty_quarantine_cleanup_invalid_id.stderr,
        )
        audit_empty_quarantine_cleanup_missing_confirmation = run_cli(
            [
                "audit",
                "cleanup-empty-lock-quarantine",
                "Ii0001",
                "--yes",
                "--json",
            ],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(
            r"--yes requires --expect-quarantine",
            audit_empty_quarantine_cleanup_missing_confirmation.stderr,
        )
        audit_empty_quarantine_cleanup_conflicting_flags = run_cli(
            [
                "audit",
                "cleanup-empty-lock-quarantine",
                "Ii0001",
                "--dry-run",
                "--yes",
                "--expect-quarantine",
                audit_empty_quarantine_fingerprint,
                "--json",
            ],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(
            r"--dry-run and --yes are mutually exclusive",
            audit_empty_quarantine_cleanup_conflicting_flags.stderr,
        )
        audit_empty_quarantine_cleanup_invalid_fingerprint = run_cli(
            [
                "audit",
                "cleanup-empty-lock-quarantine",
                "Ii0001",
                "--yes",
                "--expect-quarantine",
                "bad",
                "--json",
            ],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(
            r"Invalid --expect-quarantine fingerprint",
            audit_empty_quarantine_cleanup_invalid_fingerprint.stderr,
        )

        audit_empty_quarantine_cleanup_mismatch = parse_json(
            run_cli(
                [
                    "audit",
                    "cleanup-empty-lock-quarantine",
                    "Ii0001",
                    "--yes",
                    "--expect-quarantine",
                    "0" * 32,
                    "--json",
                ],
                scenario,
                expected_status=1,
                extra_env=audit_env,
            ).stdout
        )
        assert audit_empty_quarantine_cleanup_mismatch["ok"] is False
        assert audit_empty_quarantine_fingerprint not in json.dumps(
            audit_empty_quarantine_cleanup_mismatch
        )
        assert audit_empty_quarantine_path.is_dir()

        audit_empty_quarantine_cleanup_removed = parse_json(
            run_cli(
                [
                    "audit",
                    "cleanup-empty-lock-quarantine",
                    "Ii0001",
                    "--yes",
                    "--expect-quarantine",
                    audit_empty_quarantine_fingerprint,
                    "--json",
                ],
                scenario,
                extra_env=audit_env,
            ).stdout
        )
        assert audit_empty_quarantine_cleanup_removed["ok"] is True
        assert (
            audit_empty_quarantine_cleanup_removed["checks"][0]["details"][
                "removed"
            ]
            is True
        )
        assert not audit_empty_quarantine_path.exists()
        assert audit_lock_path.is_dir()

        audit_empty_quarantine_missing = parse_json(
            run_cli(
                ["audit", "inspect-lock-quarantine", "Ii0001", "--json"],
                scenario,
                extra_env=audit_env,
            ).stdout
        )
        assert audit_empty_quarantine_missing["checks"][0]["status"] == "ok"
        assert (
            audit_empty_quarantine_missing["checks"][0]["details"][
                "quarantine"
            ]["exists"]
            is False
        )

        audit_disposal_path.mkdir(mode=0o700)
        audit_disposal_owner_path = audit_disposal_path / "owner.json"
        audit_disposal_owner_path.write_text(audit_owner_contents, encoding="utf-8")
        audit_disposal_owner_path.chmod(0o600)
        audit_targeted_disposal_inspection_raw = run_cli(
            [
                "audit",
                "inspect-lock-disposal",
                "Ee0001",
                "Ff0001",
                "--json",
            ],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_targeted_disposal_inspection = parse_json(
            audit_targeted_disposal_inspection_raw
        )
        audit_targeted_disposal_check = audit_targeted_disposal_inspection["checks"][0]
        audit_targeted_disposal = audit_targeted_disposal_check["details"]["disposal"]
        assert audit_targeted_disposal_inspection["ok"] is True
        assert audit_targeted_disposal_check["status"] == "warn"
        assert audit_targeted_disposal["quarantine_id"] == "Ee0001"
        assert audit_targeted_disposal["disposal_id"] == "Ff0001"
        assert audit_targeted_disposal["layout"] == "owner_only"
        assert audit_targeted_disposal["source_quarantine_exists"] is False
        audit_disposal_owner_fingerprint = audit_targeted_disposal[
            "owner_fingerprint"
        ]
        assert re.fullmatch(r"[0-9a-f]{32}", audit_disposal_owner_fingerprint)
        assert audit_disposal_owner_fingerprint != audit_quarantine_owner_fingerprint
        assert audit_owner_token not in audit_targeted_disposal_inspection_raw
        assert audit_disposal_path.is_dir()

        audit_targeted_disposal_missing_id = run_cli(
            ["audit", "inspect-lock-disposal", "Ee0001", "--json"],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(
            r"Missing disposal id",
            audit_targeted_disposal_missing_id.stderr,
        )

        audit_disposal_inspection_raw = run_cli(
            ["audit", "inspect-lock-disposals", "--json"],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_disposal_inspection = parse_json(audit_disposal_inspection_raw)
        audit_disposal_details = audit_disposal_inspection["checks"][0]["details"]
        assert audit_disposal_inspection["ok"] is True
        assert audit_disposal_details["matched_entry_count"] == 1
        assert audit_disposal_details["scan_limit"] == 4096
        assert audit_disposal_details["result_limit"] == 128
        assert audit_disposal_details["disposals"][0]["quarantine_id"] == "Ee0001"
        assert audit_disposal_details["disposals"][0]["disposal_id"] == "Ff0001"
        assert audit_disposal_details["disposals"][0]["layout"] == "owner_only"
        assert audit_disposal_details["disposals"][0]["source_quarantine_exists"] is False
        assert (
            audit_disposal_details["disposals"][0]["owner_fingerprint"]
            == audit_disposal_owner_fingerprint
        )
        assert audit_owner_token not in audit_disposal_inspection_raw
        assert audit_disposal_path.is_dir()

        audit_disposal_cleanup_dry_run_raw = run_cli(
            ["audit", "cleanup-lock-disposal", "Ee0001", "Ff0001", "--json"],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_disposal_cleanup_dry_run = parse_json(audit_disposal_cleanup_dry_run_raw)
        audit_disposal_cleanup_dry_run_details = audit_disposal_cleanup_dry_run["checks"][0]["details"]
        assert audit_disposal_cleanup_dry_run["ok"] is True
        assert audit_disposal_cleanup_dry_run_details["dry_run"] is True
        assert audit_disposal_cleanup_dry_run_details["removed"] is False
        assert (
            audit_disposal_cleanup_dry_run_details["owner_fingerprint"]
            == audit_disposal_owner_fingerprint
        )
        assert audit_owner_token not in audit_disposal_cleanup_dry_run_raw
        assert audit_disposal_path.is_dir()

        audit_disposal_cleanup_missing_id = run_cli(
            ["audit", "cleanup-lock-disposal", "Ee0001", "--json"],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(r"Missing disposal id", audit_disposal_cleanup_missing_id.stderr)
        audit_disposal_cleanup_wrong_owner = parse_json(
            run_cli(
                [
                    "audit",
                    "cleanup-lock-disposal",
                    "Ee0001",
                    "Ff0001",
                    "--yes",
                    "--expect-owner",
                    "0" * 32,
                    "--json",
                ],
                scenario,
                expected_status=1,
                extra_env=audit_env,
            ).stdout
        )
        assert audit_disposal_cleanup_wrong_owner["ok"] is False
        assert audit_disposal_owner_fingerprint not in json.dumps(
            audit_disposal_cleanup_wrong_owner
        )
        assert audit_disposal_path.is_dir()

        audit_disposal_cleanup_removed_raw = run_cli(
            [
                "audit",
                "cleanup-lock-disposal",
                "Ee0001",
                "Ff0001",
                "--yes",
                "--expect-owner",
                audit_disposal_owner_fingerprint,
                "--json",
            ],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_disposal_cleanup_removed = parse_json(audit_disposal_cleanup_removed_raw)
        assert audit_disposal_cleanup_removed["ok"] is True
        assert audit_disposal_cleanup_removed["checks"][0]["details"]["removed"] is True
        assert audit_owner_token not in audit_disposal_cleanup_removed_raw
        assert not audit_disposal_path.exists()
        assert audit_lock_path.is_dir()

        audit_targeted_disposal_missing = parse_json(
            run_cli(
                [
                    "audit",
                    "inspect-lock-disposal",
                    "Ee0001",
                    "Ff0001",
                    "--json",
                ],
                scenario,
                extra_env=audit_env,
            ).stdout
        )
        audit_targeted_disposal_missing_check = audit_targeted_disposal_missing[
            "checks"
        ][0]
        assert audit_targeted_disposal_missing["ok"] is True
        assert audit_targeted_disposal_missing_check["status"] == "ok"
        assert (
            audit_targeted_disposal_missing_check["details"]["disposal"]["exists"]
            is False
        )

        audit_empty_disposal_path.mkdir(mode=0o700)
        audit_empty_disposal_inspection_raw = run_cli(
            ["audit", "inspect-lock-disposals", "--json"],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_empty_disposal_inspection = parse_json(audit_empty_disposal_inspection_raw)
        audit_empty_disposal_details = audit_empty_disposal_inspection["checks"][0]["details"]
        assert audit_empty_disposal_inspection["ok"] is True
        assert audit_empty_disposal_details["matched_entry_count"] == 1
        assert audit_empty_disposal_details["disposals"][0]["quarantine_id"] == "Gg0001"
        assert audit_empty_disposal_details["disposals"][0]["disposal_id"] == "Hh0001"
        assert audit_empty_disposal_details["disposals"][0]["layout"] == "empty"
        audit_empty_disposal_fingerprint = audit_empty_disposal_details["disposals"][0][
            "empty_directory_fingerprint"
        ]
        assert re.fullmatch(r"[0-9a-f]{32}", audit_empty_disposal_fingerprint)
        assert audit_empty_disposal_path.is_dir()

        audit_empty_cleanup_dry_run_raw = run_cli(
            [
                "audit",
                "cleanup-empty-lock-disposal",
                "Gg0001",
                "Hh0001",
                "--json",
            ],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_empty_cleanup_dry_run = parse_json(audit_empty_cleanup_dry_run_raw)
        audit_empty_cleanup_dry_run_details = audit_empty_cleanup_dry_run["checks"][0]["details"]
        assert audit_empty_cleanup_dry_run["ok"] is True
        assert audit_empty_cleanup_dry_run_details["dry_run"] is True
        assert audit_empty_cleanup_dry_run_details["removed"] is False
        assert (
            audit_empty_cleanup_dry_run_details["empty_directory_fingerprint"]
            == audit_empty_disposal_fingerprint
        )
        assert audit_empty_disposal_path.is_dir()

        audit_empty_cleanup_missing_id = run_cli(
            ["audit", "cleanup-empty-lock-disposal", "Gg0001", "--json"],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(r"Missing disposal id", audit_empty_cleanup_missing_id.stderr)
        audit_empty_cleanup_wrong_fingerprint = parse_json(
            run_cli(
                [
                    "audit",
                    "cleanup-empty-lock-disposal",
                    "Gg0001",
                    "Hh0001",
                    "--yes",
                    "--expect-disposal",
                    "0" * 32,
                    "--json",
                ],
                scenario,
                expected_status=1,
                extra_env=audit_env,
            ).stdout
        )
        assert audit_empty_cleanup_wrong_fingerprint["ok"] is False
        assert audit_empty_disposal_fingerprint not in json.dumps(
            audit_empty_cleanup_wrong_fingerprint
        )
        assert audit_empty_disposal_path.is_dir()

        audit_empty_cleanup_removed = parse_json(
            run_cli(
                [
                    "audit",
                    "cleanup-empty-lock-disposal",
                    "Gg0001",
                    "Hh0001",
                    "--yes",
                    "--expect-disposal",
                    audit_empty_disposal_fingerprint,
                    "--json",
                ],
                scenario,
                extra_env=audit_env,
            ).stdout
        )
        assert audit_empty_cleanup_removed["ok"] is True
        assert audit_empty_cleanup_removed["checks"][0]["details"]["removed"] is True
        assert not audit_empty_disposal_path.exists()
        assert audit_lock_path.is_dir()

        audit_cleanup_dry_run_raw = run_cli(
            ["audit", "cleanup-lock", "--json"],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_cleanup_dry_run = parse_json(audit_cleanup_dry_run_raw)
        audit_cleanup_dry_run_details = audit_cleanup_dry_run["checks"][0]["details"]
        assert audit_cleanup_dry_run["ok"] is True
        assert audit_cleanup_dry_run_details["dry_run"] is True
        assert audit_cleanup_dry_run_details["removed"] is False
        audit_active_owner_fingerprint = audit_cleanup_dry_run_details[
            "coordination_lock_owner_fingerprint"
        ]
        assert re.fullmatch(r"[0-9a-f]{32}", audit_active_owner_fingerprint)
        assert audit_active_owner_fingerprint not in {
            audit_quarantine_owner_fingerprint,
            audit_disposal_owner_fingerprint,
        }
        assert audit_owner_token not in audit_cleanup_dry_run_raw
        assert audit_lock_path.is_dir()

        audit_cleanup_missing_confirmation = run_cli(
            ["audit", "cleanup-lock", "--yes", "--json"],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(r"--yes requires --expect-owner", audit_cleanup_missing_confirmation.stderr)
        audit_cleanup_conflicting_confirmation = run_cli(
            [
                "audit",
                "cleanup-lock",
                "--dry-run",
                "--yes",
                "--expect-owner",
                audit_active_owner_fingerprint,
            ],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(
            r"--dry-run and --yes are mutually exclusive",
            audit_cleanup_conflicting_confirmation.stderr,
        )
        audit_cleanup_wrong_owner = parse_json(
            run_cli(
                [
                    "audit",
                    "cleanup-lock",
                    "--yes",
                    "--expect-owner",
                    "0" * 32,
                    "--json",
                ],
                scenario,
                expected_status=1,
                extra_env=audit_env,
            ).stdout
        )
        assert audit_cleanup_wrong_owner["ok"] is False
        assert audit_active_owner_fingerprint not in json.dumps(
            audit_cleanup_wrong_owner
        )
        assert audit_lock_path.is_dir()

        audit_cleanup_removed_raw = run_cli(
            [
                "audit",
                "cleanup-lock",
                "--yes",
                "--expect-owner",
                audit_active_owner_fingerprint,
                "--json",
            ],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_cleanup_removed = parse_json(audit_cleanup_removed_raw)
        assert audit_cleanup_removed["ok"] is True
        assert audit_cleanup_removed["checks"][0]["details"]["removed"] is True
        assert (
            audit_cleanup_removed["checks"][0]["details"]
            ["coordination_lock_exists"]
            is False
        )
        assert audit_owner_token not in audit_cleanup_removed_raw
        assert not audit_lock_path.exists()

        audit_recovery_nested_lock_path = audit_recovery_quarantine_path / "lock"
        audit_recovery_nested_lock_path.mkdir(parents=True, mode=0o700)
        audit_recovery_owner_path = audit_recovery_nested_lock_path / "owner.json"
        audit_recovery_owner_path.write_text(audit_owner_contents, encoding="utf-8")
        audit_recovery_owner_path.chmod(0o600)

        audit_recovery_inspection = parse_json(
            run_cli(
                ["audit", "inspect-lock-quarantines", "--json"],
                scenario,
                extra_env=audit_env,
            ).stdout
        )
        audit_recovery_entries = audit_recovery_inspection["checks"][0]["details"]["quarantines"]
        assert len(audit_recovery_entries) == 1
        assert audit_recovery_entries[0]["quarantine_id"] == "Dd0001"
        assert audit_recovery_entries[0]["layout"] == "lock_with_owner"

        audit_recovery_dry_run_raw = run_cli(
            ["audit", "recover-lock-quarantine", "Dd0001", "--json"],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_recovery_dry_run = parse_json(audit_recovery_dry_run_raw)
        audit_recovery_dry_run_details = audit_recovery_dry_run["checks"][0]["details"]
        assert audit_recovery_dry_run["ok"] is True
        assert audit_recovery_dry_run_details["dry_run"] is True
        assert audit_recovery_dry_run_details["recovered"] is False
        audit_recovery_owner_fingerprint = audit_recovery_dry_run_details[
            "owner_fingerprint"
        ]
        assert re.fullmatch(r"[0-9a-f]{32}", audit_recovery_owner_fingerprint)
        assert audit_recovery_owner_fingerprint not in {
            audit_quarantine_owner_fingerprint,
            audit_disposal_owner_fingerprint,
            audit_active_owner_fingerprint,
        }
        assert audit_owner_token not in audit_recovery_dry_run_raw
        assert audit_recovery_quarantine_path.is_dir()
        assert not audit_lock_path.exists()

        audit_recovery_missing_id = run_cli(
            ["audit", "recover-lock-quarantine", "--json"],
            scenario,
            expected_status=2,
            extra_env=audit_env,
        )
        assert re.search(r"Missing quarantine id", audit_recovery_missing_id.stderr)
        audit_recovery_wrong_owner = parse_json(
            run_cli(
                [
                    "audit",
                    "recover-lock-quarantine",
                    "Dd0001",
                    "--yes",
                    "--expect-owner",
                    "0" * 32,
                    "--json",
                ],
                scenario,
                expected_status=1,
                extra_env=audit_env,
            ).stdout
        )
        assert audit_recovery_wrong_owner["ok"] is False
        assert audit_recovery_owner_fingerprint not in json.dumps(
            audit_recovery_wrong_owner
        )
        assert audit_recovery_quarantine_path.is_dir()
        assert not audit_lock_path.exists()

        audit_recovered_raw = run_cli(
            [
                "audit",
                "recover-lock-quarantine",
                "Dd0001",
                "--yes",
                "--expect-owner",
                audit_recovery_owner_fingerprint,
                "--json",
            ],
            scenario,
            extra_env=audit_env,
        ).stdout
        audit_recovered = parse_json(audit_recovered_raw)
        audit_recovered_details = audit_recovered["checks"][0]["details"]
        assert audit_recovered["ok"] is True
        assert audit_recovered_details["recovered"] is True
        assert audit_recovered_details["coordination_lock_exists"] is True
        assert audit_recovered_details["quarantine_exists"] is False
        assert audit_owner_token not in audit_recovered_raw
        assert not audit_recovery_quarantine_path.exists()
        assert audit_lock_path.is_dir()

        audit_recovered_cleanup_dry_run = parse_json(
            run_cli(
                ["audit", "cleanup-lock", "--json"],
                scenario,
                extra_env=audit_env,
            ).stdout
        )
        audit_recovered_owner_fingerprint = audit_recovered_cleanup_dry_run[
            "checks"
        ][0]["details"]["coordination_lock_owner_fingerprint"]
        assert re.fullmatch(r"[0-9a-f]{32}", audit_recovered_owner_fingerprint)
        assert audit_recovered_owner_fingerprint != audit_recovery_owner_fingerprint

        audit_recovered_cleanup = parse_json(
            run_cli(
                [
                    "audit",
                    "cleanup-lock",
                    "--yes",
                    "--expect-owner",
                    audit_recovered_owner_fingerprint,
                    "--json",
                ],
                scenario,
                extra_env=audit_env,
            ).stdout
        )
        assert audit_recovered_cleanup["ok"] is True
        assert audit_recovered_cleanup["checks"][0]["details"]["removed"] is True
        assert (
            audit_recovered_cleanup["checks"][0]["details"]
            ["coordination_lock_exists"]
            is False
        )
        assert not audit_lock_path.exists()
    finally:
        shutil.rmtree(audit_lock_path, ignore_errors=True)
        shutil.rmtree(audit_quarantine_path, ignore_errors=True)
        shutil.rmtree(audit_recovery_quarantine_path, ignore_errors=True)
        shutil.rmtree(audit_empty_quarantine_path, ignore_errors=True)
        shutil.rmtree(audit_disposal_path, ignore_errors=True)
        shutil.rmtree(audit_empty_disposal_path, ignore_errors=True)

    provider_health = parse_json(run_cli(["doctor", "provider-health", "--json"], scenario).stdout)
    assert provider_health["ok"] is True
    assert_includes(
        [check["name"] for check in provider_health["checks"]],
        ["provider_config", "python_engine", "tool_catalog", "provider_health"],
    )

    provider_config = parse_json(run_cli(["provider", "inspect-config", "--json"], scenario).stdout)
    assert provider_config["ok"] is True
    assert_includes([check["name"] for check in provider_config["checks"]], ["provider_config"])
    provider_config_check = provider_config["checks"][0]
    assert provider_config_check["details"]["provider"] == "fake"

    retry_provider_config = parse_json(
        run_cli(
            ["provider", "inspect-config", "--json"],
            scenario,
            extra_env={
                "GOD_CODE_PROVIDER": "openai",
                "GOD_CODE_MODEL": "gpt-test",
                "GOD_CODE_API_KEY_ENV": "INTEGRATION_PROVIDER_KEY",
                "INTEGRATION_PROVIDER_KEY": "integration-secret",
                "GOD_CODE_PROVIDER_MAX_RETRIES": "2",
                "GOD_CODE_PROVIDER_RETRY_BASE_DELAY_MS": "10",
                "GOD_CODE_PROVIDER_RETRY_MAX_DELAY_MS": "40",
                "GOD_CODE_PROVIDER_FALLBACKS": json.dumps(
                    [
                        {
                            "provider": "openai-compatible",
                            "model": "fallback-model",
                            "api_key_env": "INTEGRATION_FALLBACK_PROVIDER_KEY",
                            "base_url": "https://fallback.example.test/v1",
                            "timeout_s": 20,
                            "max_retries": 1,
                            "retry_base_delay_ms": 10,
                            "retry_max_delay_ms": 40,
                        }
                    ]
                ),
                "INTEGRATION_FALLBACK_PROVIDER_KEY": "integration-fallback-secret",
            },
        ).stdout
    )
    assert retry_provider_config["ok"] is True
    retry_provider_details = retry_provider_config["checks"][0]["details"]
    assert retry_provider_details["provider"] == "openai"
    assert retry_provider_details["retry"] == {
        "max_retries": 2,
        "base_delay_ms": 10,
        "max_delay_ms": 40,
    }
    fallback_details = retry_provider_details["fallbacks"][0]
    assert fallback_details["provider"] == "openai-compatible"
    assert fallback_details["model"] == "fallback-model"
    assert fallback_details["api_key_env"] == "INTEGRATION_FALLBACK_PROVIDER_KEY"
    assert fallback_details["api_key_present"] is True
    assert fallback_details["effective_base_url"] == "https://fallback.example.test/v1"
    assert fallback_details["retry"] == {
        "max_retries": 1,
        "base_delay_ms": 10,
        "max_delay_ms": 40,
    }
    assert "integration-secret" not in json.dumps(retry_provider_config)
    assert "integration-fallback-secret" not in json.dumps(retry_provider_config)

    anthropic_provider_config = parse_json(
        run_cli(
            ["provider", "inspect-config", "--json"],
            scenario,
            extra_env={
                "GOD_CODE_PROVIDER": "anthropic",
                "GOD_CODE_MODEL": "claude-test",
                "GOD_CODE_API_KEY_ENV": "INTEGRATION_ANTHROPIC_KEY",
                "INTEGRATION_ANTHROPIC_KEY": "integration-anthropic-secret",
            },
        ).stdout
    )
    assert anthropic_provider_config["ok"] is True
    anthropic_provider_details = anthropic_provider_config["checks"][0]["details"]
    assert anthropic_provider_details["provider"] == "anthropic"
    assert anthropic_provider_details["known_family"] is True
    assert anthropic_provider_details["effective_base_url"] == "https://api.anthropic.com"
    assert "integration-anthropic-secret" not in json.dumps(anthropic_provider_config)

    local_provider_config = parse_json(
        run_cli(
            ["provider", "inspect-config", "--json"],
            scenario,
            extra_env={
                "GOD_CODE_PROVIDER": "local-openai-compatible",
                "GOD_CODE_MODEL": "local-model",
            },
        ).stdout
    )
    assert local_provider_config["ok"] is True
    local_provider_details = local_provider_config["checks"][0]["details"]
    assert local_provider_details["provider"] == "local-openai-compatible"
    assert local_provider_details["model"] == "local-model"
    assert local_provider_details["api_key_present"] is False
    assert local_provider_details["api_key_required"] is False
    assert local_provider_details["effective_base_url"] == "http://127.0.0.1:11434/v1"
    assert local_provider_details["known_family"] is True

    provider_contract = parse_json(run_cli(["provider", "contract-test", "--json"], scenario).stdout)
    assert provider_contract["ok"] is True
    assert_includes(
        [check["name"] for check in provider_contract["checks"]],
        [
            "openai_compatible_request_body",
            "openai_responses_context",
            "anthropic_messages_request_body",
            "real_provider_adapter_contract",
        ],
    )

    mcp_config = parse_json(run_cli(["mcp", "inspect-config", "--json"], scenario).stdout)
    assert mcp_config["ok"] is True
    assert_includes([check["name"] for check in mcp_config["checks"]], ["mcp_config"])

    plugin_empty_config = parse_json(run_cli(["plugins", "inspect-config", "--json"], scenario).stdout)
    assert plugin_empty_config["ok"] is True
    assert plugin_empty_config["checks"][0]["details"]["source"] == "none"

    mcp_config_file = scenario.cwd / "mcp-servers.json"
    mcp_config_file.write_text(
        json.dumps(
            [
                {
                    "id": "demo-file",
                    "command": "python3",
                    "args": [str(REPO_ROOT / "ts-host" / "test" / "fixtures" / "mcp-demo-server.py")],
                }
            ]
        ),
        encoding="utf-8",
    )
    mcp_file_config = parse_json(
        run_cli(
            ["mcp", "inspect-config", "--connect", "--resources", "--resource-templates", "--prompts", "--json"],
            scenario,
            extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
        ).stdout
    )
    assert mcp_file_config["ok"] is True
    mcp_config_check = mcp_file_config["checks"][0]
    assert mcp_config_check["details"]["source"] == "file"
    assert mcp_config_check["details"]["servers"][0]["id"] == "demo-file"
    assert mcp_file_config["checks"][1]["details"]["tool_count"] >= 1
    assert mcp_file_config["checks"][1]["details"]["tools"][0]["input_schema"]["properties"]["value"]["type"] == "string"
    mcp_resources_check = next(check for check in mcp_file_config["checks"] if check["name"] == "mcp_resources")
    assert mcp_resources_check["details"]["resources"][0]["uri"] == "memory://demo/readme"
    mcp_resource_templates_check = next(check for check in mcp_file_config["checks"] if check["name"] == "mcp_resource_templates")
    assert mcp_resource_templates_check["details"]["resource_templates"][0]["uri_template"] == "memory://demo/item/{id}"
    mcp_prompts_check = next(check for check in mcp_file_config["checks"] if check["name"] == "mcp_prompts")
    assert mcp_prompts_check["details"]["prompts"][0]["name"] == "summarize"

    mcp_resource_read = parse_json(
        run_cli(
            ["mcp", "read-resource", "memory://demo/readme", "--json"],
            scenario,
            extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
        ).stdout
    )
    assert mcp_resource_read["ok"] is True
    mcp_resource_read_check = next(check for check in mcp_resource_read["checks"] if check["name"] == "mcp_read_resource")
    assert mcp_resource_read_check["details"]["contents"][0]["text"] == "Demo README resource body."

    mcp_resource_subscribe = parse_json(
        run_cli(
            ["mcp", "subscribe-resource", "memory://demo/readme", "--json"],
            scenario,
            extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
        ).stdout
    )
    mcp_resource_subscribe_check = next(check for check in mcp_resource_subscribe["checks"] if check["name"] == "mcp_subscribe_resource")
    assert mcp_resource_subscribe_check["details"]["subscribed"] is True

    mcp_resource_unsubscribe = parse_json(
        run_cli(
            ["mcp", "unsubscribe-resource", "memory://demo/readme", "--json"],
            scenario,
            extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
        ).stdout
    )
    mcp_resource_unsubscribe_check = next(check for check in mcp_resource_unsubscribe["checks"] if check["name"] == "mcp_unsubscribe_resource")
    assert mcp_resource_unsubscribe_check["details"]["subscribed"] is False

    mcp_resource_update = parse_json(
        run_cli(
            ["mcp", "wait-resource-update", "memory://demo/readme", "--timeout-ms", "1000", "--json"],
            scenario,
            extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
        ).stdout
    )
    mcp_resource_update_check = next(check for check in mcp_resource_update["checks"] if check["name"] == "mcp_resource_update")
    assert mcp_resource_update_check["details"]["updated"] is True
    assert mcp_resource_update_check["details"]["timed_out"] is False
    assert mcp_resource_update_check["details"]["notification_uri"] == "memory://demo/readme"

    mcp_resource_update_watch = parse_json(
        run_cli(
            [
                "mcp",
                "watch-resource-updates",
                "memory://demo/readme",
                "--max-events",
                "3",
                "--timeout-ms",
                "1000",
                "--json",
            ],
            scenario,
            extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
        ).stdout
    )
    mcp_resource_update_watch_check = next(
        check for check in mcp_resource_update_watch["checks"] if check["name"] == "mcp_resource_update_watch"
    )
    assert mcp_resource_update_watch_check["details"]["event_count"] == 3
    assert mcp_resource_update_watch_check["details"]["timed_out"] is False
    assert [update["uri"] for update in mcp_resource_update_watch_check["details"]["updates"]] == [
        "memory://demo/readme",
        "memory://demo/readme",
        "memory://demo/readme",
    ]

    mcp_resource_update_loop = parse_json(
        run_cli(
            [
                "mcp",
                "loop-resource-updates",
                "memory://demo/readme",
                "--max-events",
                "3",
                "--timeout-ms",
                "1000",
                "--json",
            ],
            scenario,
            extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
        ).stdout
    )
    mcp_resource_update_loop_check = next(
        check for check in mcp_resource_update_loop["checks"] if check["name"] == "mcp_resource_update_loop"
    )
    assert mcp_resource_update_loop_check["details"]["subscription_count"] == 1
    assert mcp_resource_update_loop_check["details"]["event_count"] == 3
    assert mcp_resource_update_loop_check["details"]["timed_out"] is False
    assert [update["server_id"] for update in mcp_resource_update_loop_check["details"]["updates"]] == [
        "demo-file",
        "demo-file",
        "demo-file",
    ]

    mcp_prompt_get = parse_json(
        run_cli(
            ["mcp", "get-prompt", "summarize", '{"text":"hello"}', "--json"],
            scenario,
            extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
        ).stdout
    )
    assert mcp_prompt_get["ok"] is True
    mcp_prompt_get_check = next(check for check in mcp_prompt_get["checks"] if check["name"] == "mcp_get_prompt")
    assert mcp_prompt_get_check["details"]["messages"][0]["content"]["text"] == "Summarize: hello"

    mcp_context = parse_json(
        run_cli(
            ["mcp", "inspect-context", "--json"],
            scenario,
            extra_env={
                "GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json",
                "GOD_CODE_MCP_CONTEXT": json.dumps(
                    [
                        {"type": "resource", "uri": "memory://demo/readme"},
                        {"type": "resource", "uri": "memory://demo/readme"},
                        {"type": "prompt", "name": "summarize", "arguments": {"text": "hello"}},
                    ]
                ),
            },
        ).stdout
    )
    assert mcp_context["ok"] is True
    mcp_context_check = next(check for check in mcp_context["checks"] if check["name"] == "mcp_context")
    assert mcp_context_check["details"]["requested_entry_count"] == 3
    assert mcp_context_check["details"]["entry_count"] == 2
    assert mcp_context_check["details"]["message_count"] == 2
    assert mcp_context_check["details"]["skipped_duplicate_count"] == 1
    assert mcp_context_check["details"]["limits"]["dedupe"] is True
    mcp_context_messages = json.dumps(mcp_context_check["details"]["messages"])
    assert "Demo README resource body." in mcp_context_messages
    assert "Summarize: hello" in mcp_context_messages

    mcp_prompt_complete = parse_json(
        run_cli(
            ["mcp", "complete-prompt", "summarize", "text", "alph", "--json"],
            scenario,
            extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
        ).stdout
    )
    mcp_prompt_complete_check = next(check for check in mcp_prompt_complete["checks"] if check["name"] == "mcp_complete_prompt")
    assert mcp_prompt_complete_check["details"]["values"] == ["alpha", "alphabet"]

    mcp_prompt_complete_values = run_cli(
        ["mcp", "complete-prompt", "summarize", "text", "alph", "--values-only"],
        scenario,
        extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
    ).stdout.strip().splitlines()
    assert mcp_prompt_complete_values == ["alpha", "alphabet"]

    mcp_prompt_complete_jsonl = [
        parse_json(line)
        for line in run_cli(
            ["mcp", "complete-prompt", "summarize", "text", "alph", "--jsonl"],
            scenario,
            extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
        ).stdout.strip().splitlines()
    ]
    assert [item["value"] for item in mcp_prompt_complete_jsonl] == ["alpha", "alphabet"]
    assert mcp_prompt_complete_jsonl[0]["ref"] == "summarize"
    assert mcp_prompt_complete_jsonl[0]["argument"]["value"] == "alph"

    mcp_template_complete = parse_json(
        run_cli(
            ["mcp", "complete-resource-template", "memory://demo/item/{id}", "id", "item", "--json"],
            scenario,
            extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
        ).stdout
    )
    mcp_template_complete_check = next(check for check in mcp_template_complete["checks"] if check["name"] == "mcp_complete_resource_template")
    assert mcp_template_complete_check["details"]["values"] == ["item-1", "item-2"]

    mcp_template_complete_values = run_cli(
        ["mcp", "complete-resource-template", "memory://demo/item/{id}", "id", "item", "--values-only"],
        scenario,
        extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
    ).stdout.strip().splitlines()
    assert mcp_template_complete_values == ["item-1", "item-2"]

    mcp_completion_bash = run_cli(
        ["mcp", "completion-script", "bash", "--program", "god-code-test"],
        scenario,
    ).stdout
    assert "complete -F _god_code_mcp_completion -- 'god-code-test'" in mcp_completion_bash
    assert "complete-prompt" in mcp_completion_bash
    assert "--values-only" in mcp_completion_bash

    mcp_completion_zsh = run_cli(
        ["mcp", "completion-script", "zsh"],
        scenario,
    ).stdout
    assert "compdef _god_code_mcp_completion 'god-code'" in mcp_completion_zsh
    assert "complete-resource-template" in mcp_completion_zsh

    completion_rc = scenario.cwd / "completion.bashrc"
    completion_dry_run = parse_json(
        run_cli(
            [
                "mcp",
                "completion-install",
                "bash",
                "--program",
                "god-code-test",
                "--rc-file",
                str(completion_rc),
                "--json",
            ],
            scenario,
        ).stdout
    )
    assert completion_dry_run["action"] == "would_create"
    assert not completion_rc.exists()

    completion_install = parse_json(
        run_cli(
            [
                "mcp",
                "completion-install",
                "bash",
                "--program",
                "god-code-test",
                "--rc-file",
                str(completion_rc),
                "--yes",
                "--json",
            ],
            scenario,
        ).stdout
    )
    assert completion_install["action"] == "create"
    completion_rc_text = completion_rc.read_text(encoding="utf-8")
    assert "# >>> GOD-code MCP completion >>>" in completion_rc_text
    assert "complete -F _god_code_mcp_completion -- 'god-code-test'" in completion_rc_text

    mcp_tool = parse_json(
        run_cli(
            ["tools", "inspect", "mcp.demo-file.echo", "--json"],
            scenario,
            extra_env={"GOD_CODE_MCP_CONFIG_FILE": "mcp-servers.json"},
        ).stdout
    )
    assert mcp_tool["name"] == "mcp.demo-file.echo"
    assert mcp_tool["input_schema"]["properties"]["value"]["type"] == "string"

    broken_mcp = parse_json(
        run_cli(
            ["mcp", "inspect-config", "--connect", "--json"],
            scenario,
            expected_status=1,
            extra_env={
                "GOD_CODE_MCP_SERVERS": json.dumps(
                    [
                        {
                            "id": "broken",
                            "command": "__god_code_missing_mcp_command__",
                            "env": {"SECRET_VALUE": "not-rendered"},
                        }
                    ]
                )
            },
        ).stdout
    )
    assert broken_mcp["ok"] is False
    connect_error = next(check for check in broken_mcp["checks"] if check["name"] == "mcp_connect")
    assert connect_error["status"] == "error"
    assert connect_error["details"]["error_code"] == "connect_failed"
    assert connect_error["details"]["server_id"] == "broken"
    assert connect_error["details"]["server"]["env_keys"] == ["SECRET_VALUE"]
    assert "not-rendered" not in json.dumps(broken_mcp)

    http_mcp_process, http_mcp_url = start_streamable_http_mcp_server()
    try:
        http_mcp = parse_json(
            run_cli(
                ["mcp", "inspect-config", "--json"],
                scenario,
                extra_env={
                    "GOD_CODE_MCP_SERVERS": json.dumps(
                        [
                            {
                                "id": "remote",
                                "transport": "streamable-http",
                                "url": http_mcp_url,
                                "headers": {"Authorization": "Bearer not-rendered"},
                            }
                        ]
                    )
                },
            ).stdout
        )
        assert http_mcp["ok"] is True
        http_server = http_mcp["checks"][0]["details"]["servers"][0]
        assert http_server["transport"] == "streamable-http"
        assert http_server["url"] == http_mcp_url
        assert http_server["header_keys"] == ["Authorization"]
        assert "not-rendered" not in json.dumps(http_mcp)

        http_mcp_connect = parse_json(
            run_cli(
                ["mcp", "inspect-config", "--connect", "--resources", "--resource-templates", "--prompts", "--json"],
                scenario,
                extra_env={
                    "GOD_CODE_MCP_SERVERS": json.dumps(
                        [
                            {
                                "id": "remote",
                                "transport": "streamable-http",
                                "url": http_mcp_url,
                                "headers": {"Authorization": "Bearer not-rendered"},
                            }
                        ]
                    )
                },
            ).stdout
        )
        assert http_mcp_connect["ok"] is True
        http_connect = next(check for check in http_mcp_connect["checks"] if check["name"] == "mcp_connect")
        assert http_connect["status"] == "ok"
        assert http_connect["details"]["tool_count"] == 2
        assert any(tool["name"] == "mcp.remote.echo" for tool in http_connect["details"]["tools"])
        http_resources = next(check for check in http_mcp_connect["checks"] if check["name"] == "mcp_resources")
        assert http_resources["details"]["resources"][0]["uri"] == "memory://remote/http-readme"
        http_resource_templates = next(check for check in http_mcp_connect["checks"] if check["name"] == "mcp_resource_templates")
        assert http_resource_templates["details"]["resource_templates"][0]["uri_template"] == "memory://remote/item/{id}"
        http_prompts = next(check for check in http_mcp_connect["checks"] if check["name"] == "mcp_prompts")
        assert http_prompts["details"]["prompts"][0]["name"] == "httpSummarize"
        assert "not-rendered" not in json.dumps(http_mcp_connect)

        http_resource_read = parse_json(
            run_cli(
                ["mcp", "read-resource", "memory://remote/http-readme", "--json"],
                scenario,
                extra_env={
                    "GOD_CODE_MCP_SERVERS": json.dumps(
                        [
                            {
                                "id": "remote",
                                "transport": "streamable-http",
                                "url": http_mcp_url,
                                "headers": {"Authorization": "Bearer not-rendered"},
                            }
                        ]
                    )
                },
            ).stdout
        )
        http_resource_read_check = next(check for check in http_resource_read["checks"] if check["name"] == "mcp_read_resource")
        assert http_resource_read_check["details"]["contents"][0]["text"] == "HTTP Demo README resource body."

        http_resource_subscribe = parse_json(
            run_cli(
                ["mcp", "subscribe-resource", "memory://remote/http-readme", "--json"],
                scenario,
                extra_env={
                    "GOD_CODE_MCP_SERVERS": json.dumps(
                        [
                            {
                                "id": "remote",
                                "transport": "streamable-http",
                                "url": http_mcp_url,
                                "headers": {"Authorization": "Bearer not-rendered"},
                            }
                        ]
                    )
                },
            ).stdout
        )
        http_resource_subscribe_check = next(check for check in http_resource_subscribe["checks"] if check["name"] == "mcp_subscribe_resource")
        assert http_resource_subscribe_check["details"]["subscribed"] is True

        http_resource_unsubscribe = parse_json(
            run_cli(
                ["mcp", "unsubscribe-resource", "memory://remote/http-readme", "--json"],
                scenario,
                extra_env={
                    "GOD_CODE_MCP_SERVERS": json.dumps(
                        [
                            {
                                "id": "remote",
                                "transport": "streamable-http",
                                "url": http_mcp_url,
                                "headers": {"Authorization": "Bearer not-rendered"},
                            }
                        ]
                    )
                },
            ).stdout
        )
        http_resource_unsubscribe_check = next(check for check in http_resource_unsubscribe["checks"] if check["name"] == "mcp_unsubscribe_resource")
        assert http_resource_unsubscribe_check["details"]["subscribed"] is False

        http_prompt_get = parse_json(
            run_cli(
                ["mcp", "get-prompt", "httpSummarize", '{"text":"hello"}', "--json"],
                scenario,
                extra_env={
                    "GOD_CODE_MCP_SERVERS": json.dumps(
                        [
                            {
                                "id": "remote",
                                "transport": "streamable-http",
                                "url": http_mcp_url,
                                "headers": {"Authorization": "Bearer not-rendered"},
                            }
                        ]
                    )
                },
            ).stdout
        )
        http_prompt_get_check = next(check for check in http_prompt_get["checks"] if check["name"] == "mcp_get_prompt")
        assert http_prompt_get_check["details"]["messages"][0]["content"]["text"] == "HTTP summarize: hello"

        http_prompt_complete = parse_json(
            run_cli(
                ["mcp", "complete-prompt", "httpSummarize", "text", "http-alph", "--json"],
                scenario,
                extra_env={
                    "GOD_CODE_MCP_SERVERS": json.dumps(
                        [
                            {
                                "id": "remote",
                                "transport": "streamable-http",
                                "url": http_mcp_url,
                                "headers": {"Authorization": "Bearer not-rendered"},
                            }
                        ]
                    )
                },
            ).stdout
        )
        http_prompt_complete_check = next(check for check in http_prompt_complete["checks"] if check["name"] == "mcp_complete_prompt")
        assert http_prompt_complete_check["details"]["values"] == ["http-alpha", "http-alphabet"]

        http_prompt_complete_values = run_cli(
            ["mcp", "complete-prompt", "httpSummarize", "text", "http-alph", "--values-only"],
            scenario,
            extra_env={
                "GOD_CODE_MCP_SERVERS": json.dumps(
                    [
                        {
                            "id": "remote",
                            "transport": "streamable-http",
                            "url": http_mcp_url,
                            "headers": {"Authorization": "Bearer not-rendered"},
                        }
                    ]
                )
            },
        ).stdout.strip().splitlines()
        assert http_prompt_complete_values == ["http-alpha", "http-alphabet"]

        http_template_complete = parse_json(
            run_cli(
                ["mcp", "complete-resource-template", "memory://remote/item/{id}", "id", "remote", "--json"],
                scenario,
                extra_env={
                    "GOD_CODE_MCP_SERVERS": json.dumps(
                        [
                            {
                                "id": "remote",
                                "transport": "streamable-http",
                                "url": http_mcp_url,
                                "headers": {"Authorization": "Bearer not-rendered"},
                            }
                        ]
                    )
                },
            ).stdout
        )
        http_template_complete_check = next(check for check in http_template_complete["checks"] if check["name"] == "mcp_complete_resource_template")
        assert http_template_complete_check["details"]["values"] == ["remote-1", "remote-2"]
    finally:
        stop_process(http_mcp_process)

    auth_http_mcp_process, auth_http_mcp_url = start_streamable_http_mcp_server(
        {"MCP_EXPECT_AUTHORIZATION": "Bearer integration-token"}
    )
    try:
        http_auth_connect = parse_json(
            run_cli(
                ["mcp", "inspect-config", "--connect", "--json"],
                scenario,
                extra_env={
                    "GOD_CODE_MCP_SERVERS": json.dumps(
                        [
                            {
                                "id": "remote-auth",
                                "transport": "streamable-http",
                                "url": auth_http_mcp_url,
                                "bearer_token_env": "INTEGRATION_MCP_TOKEN",
                            }
                        ]
                    ),
                    "INTEGRATION_MCP_TOKEN": "integration-token",
                },
            ).stdout
        )
        assert http_auth_connect["ok"] is True
        http_auth_server = http_auth_connect["checks"][0]["details"]["servers"][0]
        assert http_auth_server["header_keys"] == ["Authorization"]
        assert http_auth_server["bearer_token_env"] == "INTEGRATION_MCP_TOKEN"
        assert "integration-token" not in json.dumps(http_auth_connect)
    finally:
        stop_process(auth_http_mcp_process)

    sse_mcp_process, sse_mcp_url = start_sse_mcp_server({"MCP_EXPECT_AUTHORIZATION": "Bearer sse-token"})
    try:
        sse_connect = parse_json(
            run_cli(
                [
                    "mcp",
                    "inspect-config",
                    "--connect",
                    "--resources",
                    "--resource-templates",
                    "--prompts",
                    "--json",
                ],
                scenario,
                extra_env={
                    "GOD_CODE_MCP_SERVERS": json.dumps(
                        [
                            {
                                "id": "legacy",
                                "transport": "sse",
                                "url": sse_mcp_url,
                                "bearer_token_env": "INTEGRATION_SSE_MCP_TOKEN",
                            }
                        ]
                    ),
                    "INTEGRATION_SSE_MCP_TOKEN": "sse-token",
                },
            ).stdout
        )
        assert sse_connect["ok"] is True
        sse_server = sse_connect["checks"][0]["details"]["servers"][0]
        assert sse_server["transport"] == "sse"
        assert sse_server["header_keys"] == ["Authorization"]
        assert sse_server["bearer_token_env"] == "INTEGRATION_SSE_MCP_TOKEN"
        sse_connect_check = next(check for check in sse_connect["checks"] if check["name"] == "mcp_connect")
        assert any(tool["name"] == "mcp.legacy.echo" for tool in sse_connect_check["details"]["tools"])
        sse_resources = next(check for check in sse_connect["checks"] if check["name"] == "mcp_resources")
        assert sse_resources["details"]["resources"][0]["uri"] == "memory://sse/readme"
        sse_resource_templates = next(
            check for check in sse_connect["checks"] if check["name"] == "mcp_resource_templates"
        )
        assert sse_resource_templates["details"]["resource_templates"][0]["uri_template"] == "memory://sse/item/{id}"
        sse_prompts = next(check for check in sse_connect["checks"] if check["name"] == "mcp_prompts")
        assert sse_prompts["details"]["prompts"][0]["name"] == "sseSummarize"
        assert "sse-token" not in json.dumps(sse_connect)
    finally:
        stop_process(sse_mcp_process)

    plugin_report = parse_json(
        run_cli(
            [
                "plugins",
                "validate",
                str(REPO_ROOT / "examples" / "plugins" / "demo-plugin" / "plugin.json"),
                "--json",
            ],
            scenario,
        ).stdout
    )
    assert plugin_report["ok"] is True
    assert_includes(
        [check["name"] for check in plugin_report["checks"]],
        ["plugin_manifest_path", "plugin_manifest"],
    )

    plugin_package = parse_json(
        run_cli(
            [
                "plugins",
                "validate",
                str(REPO_ROOT / "examples" / "plugins" / "demo-plugin"),
                "--json",
            ],
            scenario,
        ).stdout
    )
    assert plugin_package["ok"] is True
    package_manifest = next(check for check in plugin_package["checks"] if check["name"] == "plugin_manifest")
    assert package_manifest["details"]["id"] == "demo-plugin"
    assert package_manifest["details"]["tools"][0]["name"] == "plugin.demo.echo"
    echo_input = parse_json(
        (REPO_ROOT / "examples" / "plugins" / "demo-plugin" / "fixtures" / "echo-input.json").read_text(
            encoding="utf-8"
        )
    )
    echo_output = parse_json(
        (REPO_ROOT / "examples" / "plugins" / "demo-plugin" / "fixtures" / "echo-output.json").read_text(
            encoding="utf-8"
        )
    )
    assert echo_output["echoed"] == echo_input["value"]

    executable_plugin = parse_json(
        run_cli(
            [
                "plugins",
                "validate",
                str(REPO_ROOT / "examples" / "plugins" / "executable-plugin"),
                "--json",
            ],
            scenario,
            extra_env={"GOD_CODE_EXECUTABLE_PLUGIN_TOKEN": "not-rendered"},
        ).stdout
    )
    assert executable_plugin["ok"] is True
    executable_manifest = next(
        check for check in executable_plugin["checks"] if check["name"] == "plugin_manifest"
    )
    assert executable_manifest["details"]["id"] == "executable-plugin"
    assert executable_manifest["details"]["runtime"]["kind"] == "node-subprocess"
    assert executable_manifest["details"]["runtime"]["entry"] == "handler.mjs"
    assert "not-rendered" not in json.dumps(executable_plugin)

    executable_plugin_dir = REPO_ROOT / "examples" / "plugins" / "executable-plugin"
    plugin_config_file = scenario.cwd / "plugins.json"
    plugin_config_file.write_text(
        json.dumps(
            {
                "plugin_dirs": [str(executable_plugin_dir)],
                "enabled_plugin_ids": ["executable-plugin"],
            }
        ),
        encoding="utf-8",
    )
    plugin_file_config = parse_json(
        run_cli(
            ["plugins", "inspect-config", "--json"],
            scenario,
            extra_env={
                "GOD_CODE_PLUGIN_CONFIG_FILE": "plugins.json",
                "GOD_CODE_EXECUTABLE_PLUGIN_TOKEN": "not-rendered",
            },
        ).stdout
    )
    assert plugin_file_config["ok"] is True
    plugin_runtime = next(check for check in plugin_file_config["checks"] if check["name"] == "plugin_runtime")
    assert plugin_runtime["details"]["plugins"][0]["id"] == "executable-plugin"
    assert plugin_runtime["details"]["tools"][0]["name"] == "plugin.executable.echo"
    assert "not-rendered" not in json.dumps(plugin_file_config)

    plugin_schema = parse_json(run_cli(["plugins", "schema", "--json"], scenario).stdout)
    assert plugin_schema["required"] == ["id", "name", "version"]
    assert plugin_schema["properties"]["tools"]["items"]["required"] == ["name", "description"]
    assert plugin_schema["properties"]["tools"]["items"]["properties"]["input_schema"]["type"] == "object"
    assert "node-subprocess" in plugin_schema["properties"]["runtime"]["properties"]["kind"]["enum"]

    tools = parse_json(run_cli(["tools", "list", "--json"], scenario).stdout)
    assert_includes(
        [tool["name"] for tool in tools],
        ["Read", "Edit", "Bash", "ListFiles", "Search", "Write"],
    )

    plugin_tools = parse_json(
        run_cli(
            ["tools", "list", "--json"],
            scenario,
            extra_env={"GOD_CODE_PLUGIN_CONFIG_FILE": "plugins.json"},
        ).stdout
    )
    assert "plugin.executable.echo" in [tool["name"] for tool in plugin_tools]

    plugin_run = parse_json(
        run_cli(
            [
                "run",
                "--json",
                "--raw-events",
                'tool plugin.executable.echo {"value":"integration"}',
            ],
            scenario,
            extra_env={
                "GOD_CODE_PLUGIN_CONFIG_FILE": "plugins.json",
                "GOD_CODE_EXECUTABLE_PLUGIN_TOKEN": "not-rendered",
            },
        ).stdout
    )
    assert plugin_run["status"] == "success"
    tool_result_events = [
        event for event in plugin_run["events"] if event["event_type"] == "tool_result_received"
    ]
    assert tool_result_events
    plugin_result = tool_result_events[0]["payload"]["result"]
    assert plugin_result["ok"] is True
    assert plugin_result["output"]["echoed"] == "integration"
    assert plugin_result["output"]["token_present"] is True
    assert "not-rendered" not in json.dumps(plugin_run)

    plugin_registry_file = REPO_ROOT / "examples" / "config" / "plugin-registry.json"
    plugin_registry_list = parse_json(
        run_cli(
            ["plugins", "list", "--json"],
            scenario,
            extra_env={"GOD_CODE_PLUGIN_REGISTRY_FILE": str(plugin_registry_file)},
        ).stdout
    )
    assert plugin_registry_list["ok"] is True
    registry_plugins = plugin_registry_list["checks"][0]["details"]["plugins"]
    assert [plugin["id"] for plugin in registry_plugins] == ["executable-plugin", "demo-skill"]
    assert registry_plugins[1]["enabled"] is False
    plugin_registry_inspect = parse_json(
        run_cli(
            ["plugins", "inspect", "demo-skill", "--json"],
            scenario,
            extra_env={"GOD_CODE_PLUGIN_REGISTRY_FILE": str(plugin_registry_file)},
        ).stdout
    )
    assert plugin_registry_inspect["ok"] is True
    assert plugin_registry_inspect["checks"][0]["details"]["plugin"]["enabled"] is False
    plugin_registry_tools = parse_json(
        run_cli(
            ["tools", "list", "--json"],
            scenario,
            extra_env={"GOD_CODE_PLUGIN_REGISTRY_FILE": str(plugin_registry_file)},
        ).stdout
    )
    plugin_registry_tool_names = [tool["name"] for tool in plugin_registry_tools]
    assert "plugin.executable.echo" in plugin_registry_tool_names
    assert "skill.demo.summarize" not in plugin_registry_tool_names

    read_tool = parse_json(run_cli(["tools", "inspect", "Read", "--json"], scenario).stdout)
    assert read_tool["name"] == "Read"
    assert read_tool["input_schema"]["required"] == ["path"]

    usage_error = run_cli(["tools", "inspect"], scenario, expected_status=2)
    assert re.search(r"Missing tool name", usage_error.stderr)

    run_result = parse_json(run_cli(["run", "--json", "bash printf ok"], scenario).stdout)
    assert run_result["status"] == "success"
    assert re.search(r"stdout:\nok", run_result["assistant_message"]["content"])


def run_golden_event_tests(temp_root: Path) -> None:
    cases = [
        {
            "golden": "read-turn.json",
            "prompt": "read README.md",
            "files": {"README.md": "hello"},
        },
        {
            "golden": "edit-turn.json",
            "prompt": "edit fixture.txt ::: hello ::: world",
            "files": {"fixture.txt": "hello"},
        },
        {
            "golden": "bash-turn.json",
            "prompt": "bash printf ok",
            "files": {},
        },
        {
            "golden": "list-turn.json",
            "prompt": "list .",
            "files": {"alpha.txt": "a", "nested/child.txt": "b"},
        },
        {
            "golden": "search-turn.json",
            "prompt": "search README.md ::: GOD-code",
            "files": {"README.md": "hello\nGOD-code here\n"},
        },
        {
            "golden": "write-turn.json",
            "prompt": "write fixture.txt ::: hello",
            "files": {},
        },
    ]

    for case in cases:
        golden_name = str(case["golden"])
        scenario_name = golden_name.removesuffix(".json")
        scenario = create_scenario(temp_root, scenario_name, case["files"])
        result = parse_json(
            run_cli(["run", "--json", "--raw-events", str(case["prompt"])], scenario).stdout
        )
        assert result["status"] == "success", f"{golden_name} did not finish successfully"

        actual = normalize_events(result["events"], scenario.cwd)
        expected = parse_json((GOLDEN_DIR / golden_name).read_text(encoding="utf-8"))
        assert actual == expected, f"{golden_name} event sequence changed"


def run_transcript_contract_test(temp_root: Path) -> None:
    scenario = create_scenario(temp_root, "transcript", {})
    run_result = parse_json(run_cli(["run", "--json", "bash printf ok"], scenario).stdout)
    assert run_result["status"] == "success"

    session_list = run_cli(["sessions", "list"], scenario).stdout
    assert re.search(r"Sessions in ", session_list)
    assert re.search(r'prompt="bash printf ok"', session_list)

    match = re.search(r"^([0-9a-f-]{36})\s", session_list, re.MULTILINE)
    assert match, f"Could not find session id in sessions list:\n{session_list}"
    session_id = match.group(1)

    replay = run_cli(["sessions", "replay", session_id], scenario).stdout
    assert re.search(rf"Session: {re.escape(session_id)}", replay)
    assert re.search(r"user: bash printf ok", replay)
    assert re.search(r"tool_result: Bash", replay)
    assert re.search(r"assistant: Bash completed with exit code 0\.", replay)

    search_json = parse_json(run_cli(["sessions", "search", "bash", "--json"], scenario).stdout)
    assert len(search_json) == 1
    assert search_json[0]["summary"]["sessionId"] == session_id
    assert search_json[0]["matched_entry_count"] >= 1

    replay_json = parse_json(run_cli(["sessions", "replay", session_id, "--json"], scenario).stdout)
    assert replay_json["session_id"] == session_id
    assert replay_json["entry_count"] >= 1
    assert isinstance(replay_json["entries"], list)

    resume_json = parse_json(
        run_cli(
            ["sessions", "resume", session_id, "--json", "--raw-events", "bash printf resumed"],
            scenario,
        ).stdout
    )
    assert resume_json["status"] == "success"
    assert resume_json["resumed_from_session_id"] == session_id
    assert resume_json["restored_message_count"] >= 1
    assert re.search(r"stdout:\nresumed", resume_json["assistant_message"]["content"])
    assert_includes(
        [event["event_type"] for event in resume_json["events"]],
        ["session_started", "tool_call_requested", "turn_finished"],
    )
    resumed_session_id = resume_json["events"][0]["session_id"]
    assert resumed_session_id != session_id

    recover_plan_json = parse_json(
        run_cli(
            ["sessions", "recover", session_id, "--json", "--dry-run"],
            scenario,
        ).stdout
    )
    assert recover_plan_json["type"] == "transcript_recovery"
    assert recover_plan_json["session_id"] == session_id
    assert recover_plan_json["strategy"] == "strict"
    assert recover_plan_json["recoverable"] is True
    assert recover_plan_json["restored_message_count"] >= 1

    recover_json = parse_json(
        run_cli(
            [
                "sessions",
                "recover",
                session_id,
                "--json",
                "--raw-events",
                "bash printf recovered",
            ],
            scenario,
        ).stdout
    )
    assert recover_json["status"] == "success"
    assert recover_json["recovered_from_session_id"] == session_id
    assert recover_json["recovery_strategy"] == "strict"
    assert recover_json["restored_message_count"] >= 1
    assert re.search(r"stdout:\nrecovered", recover_json["assistant_message"]["content"])
    assert_includes(
        [event["event_type"] for event in recover_json["events"]],
        ["session_started", "tool_call_requested", "turn_finished"],
    )
    recovered_session_id = recover_json["events"][0]["session_id"]
    assert recovered_session_id not in {session_id, resumed_session_id}

    missing_resume_prompt = run_cli(["sessions", "resume", session_id], scenario, expected_status=2)
    assert re.search(r"Missing prompt", missing_resume_prompt.stderr)

    missing_recover_prompt = run_cli(["sessions", "recover", session_id], scenario, expected_status=2)
    assert re.search(r"Missing prompt", missing_recover_prompt.stderr)

    raw_events_without_json = run_cli(
        ["sessions", "resume", session_id, "--raw-events", "bash printf bad"],
        scenario,
        expected_status=2,
    )
    assert re.search(r"--raw-events flag requires --json", raw_events_without_json.stderr)

    missing_yes = run_cli(["sessions", "delete", session_id], scenario, expected_status=2)
    assert re.search(r"requires --yes", missing_yes.stderr)

    delete_json = parse_json(
        run_cli(["sessions", "delete", session_id, "--json", "--yes"], scenario).stdout
    )
    assert delete_json["session_id"] == session_id
    assert delete_json["deleted"] is True

    resumed_delete_json = parse_json(
        run_cli(["sessions", "delete", resumed_session_id, "--json", "--yes"], scenario).stdout
    )
    assert resumed_delete_json["session_id"] == resumed_session_id
    assert resumed_delete_json["deleted"] is True

    recovered_delete_json = parse_json(
        run_cli(["sessions", "delete", recovered_session_id, "--json", "--yes"], scenario).stdout
    )
    assert recovered_delete_json["session_id"] == recovered_session_id
    assert recovered_delete_json["deleted"] is True

    write_transcript_fixture(
        scenario.transcript_dir,
        "old-archive",
        "2000-01-01T00:00:00.000Z",
        "old archive prompt",
    )
    write_transcript_fixture(
        scenario.transcript_dir,
        "new-active",
        "2999-01-01T00:00:00.000Z",
        "new active prompt",
    )

    cleanup_dry_run = parse_json(
        run_cli(["sessions", "cleanup", "--older-than-days", "30", "--json"], scenario).stdout
    )
    assert cleanup_dry_run["action"] == "dry-run"
    assert cleanup_dry_run["matched_count"] == 1
    assert cleanup_dry_run["affected_count"] == 0
    assert cleanup_dry_run["sessions"][0]["session_id"] == "old-archive"

    cleanup_without_yes = run_cli(
        ["sessions", "cleanup", "--older-than-days", "30", "--archive"],
        scenario,
        expected_status=2,
    )
    assert re.search(r"requires --yes", cleanup_without_yes.stderr)

    cleanup_archive = parse_json(
        run_cli(
            ["sessions", "cleanup", "--older-than-days", "30", "--archive", "--yes", "--json"],
            scenario,
        ).stdout
    )
    assert cleanup_archive["action"] == "archive"
    assert cleanup_archive["matched_count"] == 1
    assert cleanup_archive["affected_count"] == 1
    archived_path = Path(cleanup_archive["sessions"][0]["archive_path"])
    assert archived_path.exists()
    assert not (scenario.transcript_dir / "old-archive.jsonl").exists()

    archive_list = parse_json(run_cli(["sessions", "archive", "list", "--json"], scenario).stdout)
    assert len(archive_list) == 1
    assert archive_list[0]["sessionId"] == "old-archive"

    archive_replay = parse_json(
        run_cli(["sessions", "archive", "replay", "old-archive", "--json"], scenario).stdout
    )
    assert archive_replay["session_id"] == "old-archive"
    assert archive_replay["entry_count"] == 1

    archive_search = parse_json(
        run_cli(["sessions", "archive", "search", "old archive", "--json"], scenario).stdout
    )
    assert len(archive_search) == 1
    assert archive_search[0]["summary"]["sessionId"] == "old-archive"
    active_search_after_archive = parse_json(
        run_cli(["sessions", "search", "old archive", "--json"], scenario).stdout
    )
    assert active_search_after_archive == []

    compress_without_yes = run_cli(
        ["sessions", "archive", "compress", "old-archive"],
        scenario,
        expected_status=2,
    )
    assert re.search(r"requires --yes", compress_without_yes.stderr)

    archive_compress = parse_json(
        run_cli(
            ["sessions", "archive", "compress", "old-archive", "--yes", "--json"],
            scenario,
        ).stdout
    )
    assert archive_compress["session_id"] == "old-archive"
    assert archive_compress["compressed"] is True
    compressed_path = Path(archive_compress["compressed_path"])
    assert compressed_path.exists()
    assert not archived_path.exists()
    assert archive_compress["original_bytes"] > 0
    assert archive_compress["compressed_bytes"] > 0

    compressed_replay = parse_json(
        run_cli(["sessions", "archive", "replay", "old-archive", "--json"], scenario).stdout
    )
    assert compressed_replay["session_id"] == "old-archive"
    assert compressed_replay["entry_count"] == 1

    compressed_search = parse_json(
        run_cli(["sessions", "archive", "search", "old archive", "--json"], scenario).stdout
    )
    assert len(compressed_search) == 1
    assert compressed_search[0]["summary"]["filePath"].endswith(".jsonl.gz")

    index_build = parse_json(
        run_cli(["sessions", "index", "build", "--include-archive", "--json"], scenario).stdout
    )
    assert index_build["include_archive"] is True
    assert index_build["session_count"] == 2
    assert Path(index_build["index_path"]).exists()
    indexed_archive_search = parse_json(
        run_cli(["sessions", "index", "search", "old archive", "--json"], scenario).stdout
    )
    assert len(indexed_archive_search["results"]) == 1
    assert indexed_archive_search["results"][0]["scope"] == "archive"
    assert indexed_archive_search["results"][0]["summary"]["filePath"].endswith(".jsonl.gz")
    indexed_active_search = parse_json(
        run_cli(["sessions", "index", "search", "new active", "--json"], scenario).stdout
    )
    assert len(indexed_active_search["results"]) == 1
    assert indexed_active_search["results"][0]["scope"] == "active"

    write_transcript_fixture(
        scenario.transcript_dir,
        "late-active",
        "2999-01-02T00:00:00.000Z",
        "late active prompt",
    )
    stale_index_search = parse_json(
        run_cli(["sessions", "index", "search", "late active", "--json"], scenario).stdout
    )
    assert stale_index_search["results"] == []
    index_refresh = parse_json(
        run_cli(["sessions", "index", "refresh", "--include-archive", "--json"], scenario).stdout
    )
    assert index_refresh["created"] is False
    assert index_refresh["added_count"] >= 1
    refreshed_index_search = parse_json(
        run_cli(["sessions", "index", "search", "late active", "--json"], scenario).stdout
    )
    assert len(refreshed_index_search["results"]) == 1
    assert refreshed_index_search["results"][0]["summary"]["sessionId"] == "late-active"

    write_transcript_fixture(
        scenario.transcript_dir,
        "auto-refresh-active",
        "2999-01-03T00:00:00.000Z",
        "auto refresh prompt",
    )
    auto_refreshed_search = parse_json(
        run_cli(
            [
                "sessions",
                "index",
                "search",
                "auto refresh",
                "--refresh",
                "--include-archive",
                "--json",
            ],
            scenario,
        ).stdout
    )
    assert len(auto_refreshed_search["results"]) == 1
    assert auto_refreshed_search["results"][0]["summary"]["sessionId"] == "auto-refresh-active"

    write_transcript_fixture(
        scenario.transcript_dir / "archive",
        "archive-delete",
        "2000-01-01T00:00:00.000Z",
        "archive delete prompt",
    )
    archive_delete_without_yes = run_cli(
        ["sessions", "archive", "delete", "archive-delete"],
        scenario,
        expected_status=2,
    )
    assert re.search(r"requires --yes", archive_delete_without_yes.stderr)

    archive_delete_json = parse_json(
        run_cli(
            ["sessions", "archive", "delete", "archive-delete", "--yes", "--json"],
            scenario,
        ).stdout
    )
    assert archive_delete_json["session_id"] == "archive-delete"
    assert archive_delete_json["deleted"] is True
    assert not (scenario.transcript_dir / "archive" / "archive-delete.jsonl").exists()
    assert not (scenario.transcript_dir / "archive-delete.jsonl").exists()

    restore_without_yes = run_cli(
        ["sessions", "archive", "restore", "old-archive"],
        scenario,
        expected_status=2,
    )
    assert re.search(r"requires --yes", restore_without_yes.stderr)

    archive_restore = parse_json(
        run_cli(
            ["sessions", "archive", "restore", "old-archive", "--yes", "--json"],
            scenario,
        ).stdout
    )
    assert archive_restore["session_id"] == "old-archive"
    assert archive_restore["restored"] is True
    assert Path(archive_restore["restored_path"]).exists()
    assert archive_restore["source_path"].endswith(".jsonl.gz")
    assert not compressed_path.exists()

    old_archive_delete_json = parse_json(
        run_cli(["sessions", "delete", "old-archive", "--json", "--yes"], scenario).stdout
    )
    assert old_archive_delete_json["session_id"] == "old-archive"

    write_transcript_fixture(
        scenario.transcript_dir,
        "old-delete",
        "2000-01-01T00:00:00.000Z",
        "old delete prompt",
    )
    cleanup_delete = parse_json(
        run_cli(
            ["sessions", "cleanup", "--older-than-days", "30", "--delete", "--yes", "--json"],
            scenario,
        ).stdout
    )
    assert cleanup_delete["action"] == "delete"
    assert cleanup_delete["matched_count"] == 1
    assert cleanup_delete["sessions"][0]["session_id"] == "old-delete"
    assert not (scenario.transcript_dir / "old-delete.jsonl").exists()

    new_delete_json = parse_json(
        run_cli(["sessions", "delete", "new-active", "--json", "--yes"], scenario).stdout
    )
    assert new_delete_json["session_id"] == "new-active"
    late_delete_json = parse_json(
        run_cli(["sessions", "delete", "late-active", "--json", "--yes"], scenario).stdout
    )
    assert late_delete_json["session_id"] == "late-active"
    auto_refresh_delete_json = parse_json(
        run_cli(["sessions", "delete", "auto-refresh-active", "--json", "--yes"], scenario).stdout
    )
    assert auto_refresh_delete_json["session_id"] == "auto-refresh-active"
    assert re.search(r"No sessions found", run_cli(["sessions", "list"], scenario).stdout)


def create_scenario(temp_root: Path, name: str, files: dict[str, str]) -> Scenario:
    cwd = temp_root / name
    transcript_dir = temp_root / f"{name}-transcripts"
    cwd.mkdir(parents=True, exist_ok=True)
    transcript_dir.mkdir(parents=True, exist_ok=True)

    for relative_path, content in files.items():
        file_path = cwd / relative_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

    return Scenario(cwd=cwd, transcript_dir=transcript_dir)


def write_transcript_fixture(
    transcript_dir: Path,
    session_id: str,
    timestamp: str,
    prompt: str,
) -> None:
    transcript_dir.mkdir(parents=True, exist_ok=True)
    entry = {
        "session_id": session_id,
        "turn_id": "t1",
        "type": "user",
        "timestamp": timestamp,
        "payload": {
            "type": "user",
            "turn_id": "t1",
            "message": {"role": "user", "content": prompt},
        },
    }
    (transcript_dir / f"{session_id}.jsonl").write_text(
        json.dumps(entry, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def run_cli(
    args: list[str],
    scenario: Scenario,
    expected_status: int = 0,
    extra_env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["node", str(CLI_PATH), *args],
        cwd=scenario.cwd,
        env=build_cli_env(scenario.transcript_dir, extra_env),
        text=True,
        capture_output=True,
        check=False,
    )

    if result.returncode != expected_status:
        command = " ".join(["node", str(CLI_PATH), *args])
        raise AssertionError(
            "\n".join(
                [
                    f"Unexpected exit code for: {command}",
                    f"expected={expected_status} actual={result.returncode}",
                    f"stdout:\n{result.stdout}",
                    f"stderr:\n{result.stderr}",
                ]
            )
        )

    return result


def build_cli_env(transcript_dir: Path, extra_env: dict[str, str] | None = None) -> dict[str, str]:
    env = os.environ.copy()
    for key in ISOLATED_ENV_KEYS:
        env.pop(key, None)
    env["GOD_CODE_TRANSCRIPT_DIR"] = str(transcript_dir)
    if extra_env:
        env.update(extra_env)
    return env


def start_streamable_http_mcp_server(extra_env: dict[str, str] | None = None) -> tuple[subprocess.Popen[str], str]:
    return start_node_mcp_server(HTTP_MCP_FIXTURE, extra_env)


def start_sse_mcp_server(extra_env: dict[str, str] | None = None) -> tuple[subprocess.Popen[str], str]:
    return start_node_mcp_server(SSE_MCP_FIXTURE, extra_env)


def start_node_mcp_server(fixture: Path, extra_env: dict[str, str] | None = None) -> tuple[subprocess.Popen[str], str]:
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    process = subprocess.Popen(
        ["node", str(fixture)],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert process.stdout is not None
    url = process.stdout.readline().strip()
    if not url:
        stderr = process.stderr.read() if process.stderr else ""
        stop_process(process)
        raise AssertionError(f"MCP fixture did not print a URL: {fixture}. stderr:\n{stderr}")
    return process, url


def stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def parse_json(raw: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AssertionError(f"Failed to parse JSON stdout:\n{raw}\n{exc}") from exc


def normalize_events(events: Any, cwd: Path) -> list[dict[str, Any]]:
    assert isinstance(events, list), "raw event output must include an events array"
    normalized_events = []
    for event in events:
        assert isinstance(event, dict), "raw event entries must be objects"
        normalized = normalize_value(event, str(cwd))
        normalized["session_id"] = "session-1"
        if "turn_id" in normalized:
            normalized["turn_id"] = "turn-1"
        normalized_events.append(normalized)
    return normalized_events


def normalize_value(value: Any, cwd: str) -> Any:
    if isinstance(value, str):
        return value.replace(cwd, "<cwd>")

    if isinstance(value, list):
        return [normalize_value(entry, cwd) for entry in value]

    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, nested_value in value.items():
            if key == "tool_call_id":
                normalized[key] = "tool-call-1"
            else:
                normalized[key] = normalize_value(nested_value, cwd)
        return normalized

    return value


def assert_includes(actual: list[str], expected: list[str]) -> None:
    for value in expected:
        assert value in actual, f"Expected {actual!r} to include {value!r}"


if __name__ == "__main__":
    raise SystemExit(main())
