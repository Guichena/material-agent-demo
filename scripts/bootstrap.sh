#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend-next"

if [[ -z "${CONDA_PREFIX:-}" ]]; then
  echo "No active conda environment." >&2
  echo "Run: conda env create -f environment.yml && conda activate materials-demo-teaching" >&2
  exit 1
fi

if ! command -v python >/dev/null 2>&1; then
  echo "Missing python in the active conda environment" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Missing node in PATH" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Missing npm in PATH" >&2
  exit 1
fi

PYTHON_BIN="$(command -v python)"
"${PYTHON_BIN}" -m pip install --upgrade pip
"${PYTHON_BIN}" -m pip install -e "${ROOT_DIR}"
"${PYTHON_BIN}" -m pip install -e "${ROOT_DIR}/mcp_servers/materials_project"
"${PYTHON_BIN}" -m pip install -e "${ROOT_DIR}/mcp_servers/material_agent_core"

cd "${FRONTEND_DIR}"
npm install

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  cp "${ROOT_DIR}/.env.example" "${ROOT_DIR}/.env"
  echo "Created ${ROOT_DIR}/.env from template."
fi

echo
echo "Bootstrap complete."
echo "Conda env: ${CONDA_PREFIX}"
echo "Backend Python: $(command -v python)"
echo "Frontend deps: ${FRONTEND_DIR}/node_modules"
echo "Next step: edit ${ROOT_DIR}/.env and fill your local absolute paths."
