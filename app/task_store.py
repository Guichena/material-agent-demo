from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from .models import TaskDetail, TaskMessage, TaskSummary, WorkflowRun


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_title(prompt: str, formula: str | None) -> str:
    return formula or prompt[:48] or "未命名任务"


class TaskStore:
    def __init__(self, store_path: Path) -> None:
        self._items: dict[str, TaskDetail] = {}
        self._store_path = store_path
        self._lock = threading.RLock()

    @staticmethod
    def _matches_request(
        item: TaskDetail,
        *,
        prompt: str,
        formula: str | None,
        num_samples: int,
        relax: bool,
    ) -> bool:
        return (
            item.prompt == prompt
            and (item.formula or None) == (formula or None)
            and item.num_samples == num_samples
            and item.relax == relax
        )

    def load(self) -> None:
        with self._lock:
            if not self._store_path.exists():
                self._items = {}
                return
            raw = json.loads(self._store_path.read_text(encoding="utf-8"))
            self._items = {
                item["id"]: TaskDetail.model_validate(item)
                for item in raw
                if isinstance(item, dict) and item.get("id")
            }

    def _save_locked(self) -> None:
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        payload = [
            task.model_dump(mode="json")
            for task in sorted(self._items.values(), key=lambda item: item.updated_at, reverse=True)
        ]
        self._store_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def list_tasks(self) -> list[TaskSummary]:
        with self._lock:
            items = sorted(
                self._items.values(),
                key=lambda item: item.updated_at,
                reverse=True,
            )
            return [
                TaskSummary(
                    id=item.id,
                    title=item.title,
                    status=item.status,
                    prompt=item.prompt,
                    formula=item.formula,
                    num_samples=item.num_samples,
                    relax=item.relax,
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                    reference_material_count=item.reference_material_count,
                    candidate_count=item.candidate_count,
                )
                for item in items
            ]

    def get_task(self, task_id: str) -> TaskDetail | None:
        with self._lock:
            return self._items.get(task_id)

    def find_existing(
        self,
        *,
        prompt: str,
        formula: str | None,
        num_samples: int,
        relax: bool,
        allowed_statuses: tuple[str, ...] = ("running", "completed"),
    ) -> TaskDetail | None:
        with self._lock:
            for item in self._items.values():
                if item.status not in allowed_statuses:
                    continue
                if self._matches_request(
                    item,
                    prompt=prompt,
                    formula=formula,
                    num_samples=num_samples,
                    relax=relax,
                ):
                    return item
        return None

    def create_pending(
        self,
        prompt: str,
        formula: str | None,
        num_samples: int,
        relax: bool,
    ) -> TaskDetail:
        with self._lock:
            now = _utc_now()
            task_id = uuid.uuid4().hex
            task = TaskDetail(
                id=task_id,
                title=_build_title(prompt, formula),
                status="running",
                prompt=prompt,
                formula=formula,
                num_samples=num_samples,
                relax=relax,
                created_at=now,
                updated_at=now,
                reference_material_count=0,
                candidate_count=0,
                selected_material_id=None,
                messages=[
                    TaskMessage(
                        id=uuid.uuid4().hex,
                        role="assistant",
                        content="任务已创建，后端正在执行 LangGraph 工作流。",
                        timestamp=now,
                    )
                ],
                trace=[],
                reference_materials=[],
                generated_cif_paths=[],
                evaluation_results=[],
            )
            self._items[task_id] = task
            self._save_locked()
            return task

    def update_progress(
        self,
        task_id: str,
        *,
        status: Literal["running", "completed", "failed"] | None = None,
        formula: str | None = None,
        selected_material_id: str | None = None,
        reference_materials: list[str] | None = None,
        generated_cif_paths: list[str] | None = None,
        evaluation_results: list[dict] | None = None,
        messages: list[TaskMessage] | None = None,
        trace: list | None = None,
    ) -> TaskDetail:
        with self._lock:
            existing = self._items[task_id]
            update: dict[str, object] = {
                "updated_at": _utc_now(),
            }
            if status is not None:
                update["status"] = status
            if formula is not None:
                update["formula"] = formula
            if selected_material_id is not None:
                update["selected_material_id"] = selected_material_id
            if reference_materials is not None:
                update["reference_materials"] = reference_materials
                update["reference_material_count"] = len(reference_materials)
            if generated_cif_paths is not None:
                update["generated_cif_paths"] = generated_cif_paths
                update["candidate_count"] = len(generated_cif_paths)
            if evaluation_results is not None:
                update["evaluation_results"] = evaluation_results
            if messages is not None:
                update["messages"] = messages
            if trace is not None:
                update["trace"] = trace
            updated = existing.model_copy(update=update)
            self._items[task_id] = updated
            self._save_locked()
            return updated

    def complete(
        self,
        task_id: str,
        *,
        workflow_run: WorkflowRun,
        messages: list[TaskMessage],
    ) -> TaskDetail:
        with self._lock:
            existing = self._items[task_id]
            updated = existing.model_copy(
                update={
                    "title": _build_title(workflow_run.prompt, workflow_run.formula),
                    "status": "completed",
                    "formula": workflow_run.formula,
                    "prompt": workflow_run.prompt,
                    "num_samples": workflow_run.num_samples,
                    "relax": workflow_run.relax,
                    "updated_at": _utc_now(),
                    "reference_material_count": len(workflow_run.reference_materials),
                    "candidate_count": len(workflow_run.generated_cif_paths),
                    "selected_material_id": workflow_run.selected_material_id,
                    "messages": messages,
                    "trace": workflow_run.trace,
                    "reference_materials": workflow_run.reference_materials,
                    "generated_cif_paths": workflow_run.generated_cif_paths,
                    "evaluation_results": workflow_run.evaluation_results,
                }
            )
            self._items[task_id] = updated
            self._save_locked()
            return updated

    def fail(self, task_id: str, message: str) -> TaskDetail:
        with self._lock:
            existing = self._items[task_id]
            messages = list(existing.messages)
            messages.append(
                TaskMessage(
                    id=uuid.uuid4().hex,
                    role="assistant",
                    content=message,
                    timestamp=_utc_now(),
                )
            )
            updated = existing.model_copy(
                update={
                    "status": "failed",
                    "updated_at": _utc_now(),
                    "messages": messages,
                }
            )
            self._items[task_id] = updated
            self._save_locked()
            return updated
