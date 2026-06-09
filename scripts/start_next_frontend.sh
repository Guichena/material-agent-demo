#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend-next"

if [[ ! -d "${FRONTEND_DIR}" ]]; then
  echo "Missing frontend directory: ${FRONTEND_DIR}" >&2
  exit 1
fi

cd "${FRONTEND_DIR}"
NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://127.0.0.1:18018}" \
  npm run dev -- --hostname 127.0.0.1 --port 3000
