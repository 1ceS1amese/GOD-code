#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"
TS_HOST_DIR="${REPO_ROOT}/ts-host"

if [[ ! -d "${TS_HOST_DIR}/node_modules" ]]; then
  echo "Missing ts-host/node_modules. Run: cd ts-host && npm install" >&2
  exit 2
fi

cd "${TS_HOST_DIR}"
npx tsc -p tsconfig.json --noEmit
npm test -- --run
