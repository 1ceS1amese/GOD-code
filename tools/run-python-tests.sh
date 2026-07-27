#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"
VENV_DIR="${REPO_ROOT}/.venv-test"
PYTHON_BIN="${PYTHON:-python3}"

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

VENV_PYTHON="${VENV_DIR}/bin/python"

if ! "${VENV_PYTHON}" -m pytest --version >/dev/null 2>&1; then
  "${VENV_PYTHON}" -m pip install pytest
fi

cd "${REPO_ROOT}"
export PYTHONPATH="${REPO_ROOT}/py-engine/src${PYTHONPATH:+:${PYTHONPATH}}"
unset GOD_CODE_CONTEXT_COMPACTION
unset GOD_CODE_CONTEXT_MAX_CHARS
unset GOD_CODE_CONTEXT_KEEP_RECENT_MESSAGES
unset GOD_CODE_CONTEXT_SUMMARY_MAX_CHARS
unset GOD_CODE_PROVIDER_MAX_INPUT_TOKENS
unset GOD_CODE_PROVIDER_MAX_OUTPUT_TOKENS
unset GOD_CODE_PROVIDER_MAX_TOTAL_TOKENS
unset GOD_CODE_PROVIDER_REQUIRE_USAGE
unset GOD_CODE_SYSTEM_PROMPT_ENABLED
unset GOD_CODE_SYSTEM_PROMPT
unset GOD_CODE_SYSTEM_PROMPT_FILE
unset GOD_CODE_SYSTEM_PROMPT_EXTRA

if [[ "$#" -eq 0 ]]; then
  set -- py-engine/tests
elif [[ "${1}" == -* ]]; then
  set -- py-engine/tests "$@"
fi

"${VENV_PYTHON}" -m pytest "$@"
