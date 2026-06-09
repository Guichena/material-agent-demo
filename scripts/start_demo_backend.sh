#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  source "${ROOT_DIR}/.env"
  set +a
fi

DEFAULT_PYTHON_BIN="$(command -v python 2>/dev/null || true)"
PYTHON_BIN="${DEMO_BACKEND_PYTHON:-${DEFAULT_PYTHON_BIN}}"
if [[ -z "${PYTHON_BIN}" || ! -x "${PYTHON_BIN}" ]]; then
  echo "Missing backend Python: ${PYTHON_BIN}" >&2
  echo "Run: conda env create -f environment.yml && conda activate materials-demo-teaching" >&2
  exit 1
fi
if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "Missing ${ROOT_DIR}/.env" >&2
  echo "Run: cp .env.example .env" >&2
  exit 1
fi

cd "${ROOT_DIR}"
"${PYTHON_BIN}" -m app.main
