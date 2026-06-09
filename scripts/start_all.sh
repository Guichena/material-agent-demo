#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "${ROOT_DIR}/scripts/start_materials_project.sh" &
PID_1=$!
bash "${ROOT_DIR}/scripts/start_material_agent_core.sh" &
PID_2=$!
bash "${ROOT_DIR}/scripts/start_demo_backend.sh" &
PID_3=$!
bash "${ROOT_DIR}/scripts/start_next_frontend.sh" &
PID_4=$!

trap 'kill ${PID_1} ${PID_2} ${PID_3} ${PID_4} 2>/dev/null || true' EXIT
wait
