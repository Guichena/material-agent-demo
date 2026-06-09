from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _strip_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def _load_env() -> dict[str, str]:
    env_values: dict[str, str] = {}
    for env_path in (PROJECT_ROOT / ".env",):
        if not env_path.exists():
            continue
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env_values[key.strip()] = _strip_quotes(value)
    return env_values


_ENV_FILE_VALUES = _load_env()


def get_env(key: str, default: str = "") -> str:
    raw = os.getenv(key)
    if raw is None or raw == "":
        raw = _ENV_FILE_VALUES.get(key, default)
    return _strip_quotes(str(raw))


def _as_bool(value: str, default: bool = False) -> bool:
    normalized = (value or "").strip().lower()
    if not normalized:
        return default
    return normalized in {"1", "true", "yes", "y", "on"}


@dataclass(frozen=True)
class Settings:
    app_host: str
    app_port: int
    task_store_path: Path
    materials_project_url: str
    material_agent_core_url: str
    protocol_version: str
    materials_project_host: str
    materials_project_port: int
    material_agent_core_host: str
    material_agent_core_port: int
    material_agent_repo_root: Path
    llm_router_base_url: str
    llm_router_api_key: str
    llm_router_model: str
    llm_router_timeout_seconds: float


def load_settings() -> Settings:
    materials_project_host = get_env("MATERIALS_PROJECT_HOST", "127.0.0.1")
    materials_project_port = int(get_env("MATERIALS_PROJECT_PORT", "18866"))
    material_agent_core_host = get_env("MATERIAL_AGENT_CORE_HOST", "127.0.0.1")
    material_agent_core_port = int(get_env("MATERIAL_AGENT_CORE_PORT", "18865"))
    material_agent_repo_root = Path(
        get_env("MATERIAL_AGENT_REPO_ROOT", str(PROJECT_ROOT.parent / "material-agent"))
    ).expanduser()
    return Settings(
        app_host=get_env("DEMO_APP_HOST", "127.0.0.1"),
        app_port=int(get_env("DEMO_APP_PORT", "18018")),
        task_store_path=Path(
            get_env("TASK_STORE_PATH", str(PROJECT_ROOT / "data" / "tasks.json"))
        ).expanduser(),
        materials_project_url=get_env(
            "MATERIALS_PROJECT_URL",
            f"http://{materials_project_host}:{materials_project_port}/mcp",
        ),
        material_agent_core_url=get_env(
            "MATERIAL_AGENT_CORE_URL",
            f"http://{material_agent_core_host}:{material_agent_core_port}/mcp",
        ),
        protocol_version=get_env("MCP_PROTOCOL_VERSION", "2025-11-25"),
        materials_project_host=materials_project_host,
        materials_project_port=materials_project_port,
        material_agent_core_host=material_agent_core_host,
        material_agent_core_port=material_agent_core_port,
        material_agent_repo_root=material_agent_repo_root,
        llm_router_base_url=get_env("LLM_ROUTER_BASE_URL", ""),
        llm_router_api_key=get_env("LLM_ROUTER_API_KEY", ""),
        llm_router_model=get_env("LLM_ROUTER_MODEL", ""),
        llm_router_timeout_seconds=float(
            get_env("LLM_ROUTER_TIMEOUT_SECONDS", "30")
        ),
    )


SETTINGS = load_settings()
