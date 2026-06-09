#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  source "${ROOT_DIR}/.env"
  set +a
fi

DEFAULT_PYTHON_BIN="$(command -v python 2>/dev/null || true)"
PYTHON_BIN="${MATERIALS_PROJECT_MCP_PYTHON:-${DEMO_BACKEND_PYTHON:-${DEFAULT_PYTHON_BIN}}}"
if [[ -z "${PYTHON_BIN}" || ! -x "${PYTHON_BIN}" ]]; then
  echo "Missing materials-project MCP Python: ${PYTHON_BIN}" >&2
  exit 1
fi
if [[ -z "${MP_API_KEY:-}" ]]; then
  echo "Missing MP_API_KEY in ${ROOT_DIR}/.env" >&2
  exit 1
fi

export MCP_TRANSPORT="streamable-http"
export MCP_HOST="${MATERIALS_PROJECT_HOST:-127.0.0.1}"
export MCP_PORT="${MATERIALS_PROJECT_PORT:-18866}"
export MATERIALS_PROJECT_WORKDIR="${MATERIALS_PROJECT_WORKDIR:-${ROOT_DIR}/workdir/materials-project}"
export MPLCONFIGDIR="${MPLCONFIGDIR:-/tmp/materials_demo_teaching_mplconfig}"
export PYTHONPATH="${ROOT_DIR}/mcp_servers/materials_project/src${PYTHONPATH:+:${PYTHONPATH}}"

if [[ "${MATERIALS_PROJECT_CLEAR_PROXY:-true}" =~ ^(1|true|TRUE|yes|YES|on|ON)$ ]]; then
  unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy NO_PROXY no_proxy
fi

mkdir -p "${MATERIALS_PROJECT_WORKDIR}" "${MPLCONFIGDIR}"
cd "${ROOT_DIR}"

"${PYTHON_BIN}" -m materials_project
