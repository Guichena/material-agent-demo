from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


MessageRole = Literal["user", "assistant", "tool_use"]


class RunRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    formula: str | None = None
    num_samples: int | None = Field(default=None, ge=1, le=16)
    relax: bool | None = None
    reuse_existing: bool = True


class TraceEntry(BaseModel):
    node: str
    summary: str
    payload: dict[str, Any] = Field(default_factory=dict)


class TaskMessage(BaseModel):
    id: str
    role: MessageRole
    content: str
    timestamp: str
    tool_name: str | None = None
    tool_input: dict[str, Any] | None = None


class WorkflowRun(BaseModel):
    formula: str
    prompt: str
    num_samples: int
    relax: bool
    reference_materials: list[str] = Field(default_factory=list)
    selected_material_id: str | None = None
    generated_cif_paths: list[str] = Field(default_factory=list)
    evaluation_results: list[dict[str, Any]] = Field(default_factory=list)
    trace: list[TraceEntry] = Field(default_factory=list)


class TaskSummary(BaseModel):
    id: str
    title: str
    status: str
    prompt: str
    formula: str | None = None
    num_samples: int = 0
    relax: bool = False
    created_at: str
    updated_at: str
    reference_material_count: int = 0
    candidate_count: int = 0


class TaskDetail(TaskSummary):
    selected_material_id: str | None = None
    messages: list[TaskMessage] = Field(default_factory=list)
    trace: list[TraceEntry] = Field(default_factory=list)
    reference_materials: list[str] = Field(default_factory=list)
    generated_cif_paths: list[str] = Field(default_factory=list)
    evaluation_results: list[dict[str, Any]] = Field(default_factory=list)


class RunResponse(WorkflowRun):
    pass
