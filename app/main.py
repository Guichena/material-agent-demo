from __future__ import annotations

import asyncio
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse

from .config import SETTINGS
from .models import RunRequest, RunResponse, TaskDetail, TaskMessage, TaskSummary, TraceEntry
from .task_store import TaskStore
from .workflow import normalize_run_request, run_workflow


PROJECT_ROOT = Path(__file__).resolve().parent.parent
STORE = TaskStore(SETTINGS.task_store_path)
ALLOWED_FILE_ROOTS = (
    PROJECT_ROOT / "workdir",
    SETTINGS.material_agent_repo_root / "runs",
)

app = FastAPI(title="Materials Demo Teaching Project")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:18018",
        "http://127.0.0.1:18018",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _is_within(candidate: Path, root: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


@app.on_event("startup")
async def startup() -> None:
    STORE.load()


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config")
async def config_view() -> dict[str, object]:
    return {
        "materials_project_url": SETTINGS.materials_project_url,
        "material_agent_core_url": SETTINGS.material_agent_core_url,
        "materials_project_port": SETTINGS.materials_project_port,
        "material_agent_core_port": SETTINGS.material_agent_core_port,
        "llm_router_enabled": bool(
            SETTINGS.llm_router_base_url
            and SETTINGS.llm_router_api_key
            and SETTINGS.llm_router_model
        ),
        "llm_router_model": SETTINGS.llm_router_model,
    }


@app.post("/api/run", response_model=RunResponse)
async def run_demo(request: RunRequest) -> RunResponse:
    try:
        request = await normalize_run_request(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    workflow_run, _messages = await run_workflow(request)
    return RunResponse(**workflow_run.model_dump())


@app.get("/api/tasks", response_model=list[TaskSummary])
async def list_tasks() -> list[TaskSummary]:
    return STORE.list_tasks()


@app.get("/api/tasks/{task_id}", response_model=TaskDetail)
async def get_task(task_id: str) -> TaskDetail:
    task = STORE.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.get("/api/file")
async def get_file(path: str) -> FileResponse:
    candidate = Path(path).expanduser().resolve()
    if not any(_is_within(candidate, root.resolve()) for root in ALLOWED_FILE_ROOTS):
        raise HTTPException(status_code=403, detail="File is outside allowed demo artifact roots")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(candidate, filename=candidate.name)


@app.post("/api/tasks", response_model=TaskDetail)
async def create_task(request: RunRequest) -> TaskDetail:
    try:
        request = await normalize_run_request(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if request.reuse_existing:
        existing = STORE.find_existing(
            prompt=request.prompt,
            formula=request.formula,
            num_samples=request.num_samples,
            relax=request.relax,
        )
        if existing is not None:
            return existing

    task = STORE.create_pending(
        prompt=request.prompt,
        formula=request.formula,
        num_samples=request.num_samples,
        relax=request.relax,
    )
    asyncio.create_task(_run_task_background(task.id, request))
    return task


async def _run_task_background(task_id: str, request: RunRequest) -> None:
    try:
        async def _progress_callback(state: dict) -> None:
            STORE.update_progress(
                task_id,
                status="running",
                formula=state.get("formula") or None,
                selected_material_id=state.get("selected_material_id"),
                reference_materials=list(state.get("reference_materials", [])),
                generated_cif_paths=list(state.get("generated_cif_paths", [])),
                evaluation_results=list(state.get("evaluation_results", [])),
                messages=[TaskMessage(**item) for item in state.get("messages", [])],
                trace=[TraceEntry(**item) for item in state.get("trace", [])],
            )

        workflow_run, messages = await run_workflow(
            request,
            progress_callback=_progress_callback,
        )
        STORE.complete(task_id, workflow_run=workflow_run, messages=messages)
    except Exception as exc:
        STORE.fail(task_id, f"任务执行失败：{exc}")


@app.get("/", response_model=None)
async def index():
    return RedirectResponse(url="http://127.0.0.1:3000", status_code=307)


def main() -> None:
    uvicorn.run(
        "app.main:app",
        host=SETTINGS.app_host,
        port=SETTINGS.app_port,
        reload=False,
    )


if __name__ == "__main__":
    main()
