#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  source "${ROOT_DIR}/.env"
  set +a
fi

DEFAULT_PYTHON_BIN="$(command -v python 2>/dev/null || true)"
PYTHON_BIN="${MATERIAL_AGENT_CORE_MCP_PYTHON:-${DEMO_BACKEND_PYTHON:-${DEFAULT_PYTHON_BIN}}}"
if [[ -z "${PYTHON_BIN}" || ! -x "${PYTHON_BIN}" ]]; then
  echo "Missing material-agent-core MCP Python: ${PYTHON_BIN}" >&2
  exit 1
fi
if [[ -z "${MATERIAL_AGENT_REPO_ROOT:-}" || ! -d "${MATERIAL_AGENT_REPO_ROOT:-}" ]]; then
  echo "Missing or invalid MATERIAL_AGENT_REPO_ROOT: ${MATERIAL_AGENT_REPO_ROOT:-}" >&2
  exit 1
fi
if [[ -z "${MATTERGEN_GENERATE_BIN:-}" || ! -x "${MATTERGEN_GENERATE_BIN:-}" ]]; then
  echo "Missing or invalid MATTERGEN_GENERATE_BIN: ${MATTERGEN_GENERATE_BIN:-}" >&2
  exit 1
fi
if [[ -z "${MATTERSIM_PYTHON:-}" || ! -x "${MATTERSIM_PYTHON:-}" ]]; then
  echo "Missing or invalid MATTERSIM_PYTHON: ${MATTERSIM_PYTHON:-}" >&2
  exit 1
fi
if [[ -z "${MATTERSIM_LOAD_PATH:-}" || ! -f "${MATTERSIM_LOAD_PATH:-}" ]]; then
  echo "Missing or invalid MATTERSIM_LOAD_PATH: ${MATTERSIM_LOAD_PATH:-}" >&2
  exit 1
fi

export MCP_TRANSPORT="streamable-http"
export MCP_HOST="${MATERIAL_AGENT_CORE_HOST:-127.0.0.1}"
export MCP_PORT="${MATERIAL_AGENT_CORE_PORT:-18865}"
export PYTHONPATH="${ROOT_DIR}/mcp_servers/material_agent_core/src:${MATERIAL_AGENT_REPO_ROOT:-}${PYTHONPATH:+:${PYTHONPATH}}"

cd "${ROOT_DIR}"

"${PYTHON_BIN}" -m material_agent_mcp.server
