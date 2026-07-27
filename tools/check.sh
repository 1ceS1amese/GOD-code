#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"

"${SCRIPT_DIR}/run-python-tests.sh"
"${SCRIPT_DIR}/run-ts-tests.sh"

cd "${REPO_ROOT}/ts-host"
npm run build

"${SCRIPT_DIR}/run-integration-tests.sh"
"${SCRIPT_DIR}/run-cli-smoke.sh"
