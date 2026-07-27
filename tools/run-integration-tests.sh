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

python3 "${REPO_ROOT}/integration/cli_integration.py" "$@"
