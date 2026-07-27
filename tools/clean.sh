#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"

usage() {
  printf 'Usage: %s [--all]\n' "${0##*/}"
  printf '  default  Remove build output and test caches.\n'
  printf '  --all    Also remove installed dependencies and local runtime state.\n'
}

clean_all=false
case "${1:-}" in
  "") ;;
  --all) clean_all=true ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if [[ "$#" -gt 1 ]]; then
  usage >&2
  exit 2
fi

delete_tree() {
  local target="$1"
  if [[ -e "${target}" || -L "${target}" ]]; then
    find "${target}" -depth -delete
  fi
}

delete_tree "${REPO_ROOT}/ts-host/dist"
delete_tree "${REPO_ROOT}/ts-host/.vitest"
delete_tree "${REPO_ROOT}/.pytest_cache"
delete_tree "${REPO_ROOT}/py-engine/.pytest_cache"
delete_tree "${REPO_ROOT}/py-engine/build"
delete_tree "${REPO_ROOT}/py-engine/dist"
delete_tree "${REPO_ROOT}/htmlcov"

for root in "${REPO_ROOT}/py-engine" "${REPO_ROOT}/integration" "${REPO_ROOT}/tools"; do
  if [[ -d "${root}" ]]; then
    find "${root}" -type f \( -name '*.pyc' -o -name '*.pyo' -o -name '.coverage' -o -name 'coverage.xml' \) -delete
    while IFS= read -r -d '' cache_dir; do
      delete_tree "${cache_dir}"
    done < <(find "${root}" -type d \( -name '__pycache__' -o -name '.mypy_cache' -o -name '.ruff_cache' -o -name '*.egg-info' \) -print0)
  fi
done

if [[ "${clean_all}" == true ]]; then
  delete_tree "${REPO_ROOT}/ts-host/node_modules"
  delete_tree "${REPO_ROOT}/.venv-test"
  delete_tree "${REPO_ROOT}/.venv"
  delete_tree "${REPO_ROOT}/venv"
  delete_tree "${REPO_ROOT}/.god-code"
fi

printf 'Repository cleanup complete (%s).\n' "$([[ "${clean_all}" == true ]] && printf 'all' || printf 'build-cache')"
