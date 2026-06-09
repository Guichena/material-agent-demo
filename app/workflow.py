from __future__ import annotations

import json
import re
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any, TypedDict

import httpx

from .config import SETTINGS
from .mcp_client import McpHttpClient
from .models import RunRequest, TaskMessage, TraceEntry, WorkflowRun


FORMULA_PATTERN = re.compile(r"\b([A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*)*)\b")
MATERIAL_ID_PATTERN = re.compile(r"\b(mp-\d+)\b", re.IGNORECASE)
SAMPLE_COUNT_PATTERNS = (
    re.compile(r"\bgenerate\s+(\d+)\b", re.IGNORECASE),
    re.compile(r"\b(\d+)\s+(?:candidate|candidates|samples|structures)\b", re.IGNORECASE),
    re.compile(r"生成\s*(\d+)\s*个"),
)
RELAX_HINT_PATTERN = re.compile(r"(?:\brelax(?:ation)?\b|弛豫)", re.IGNORECASE)
NEGATED_RELAX_PATTERNS = (
    re.compile(r"\bwithout\s+relax(?:ation)?\b", re.IGNORECASE),
    re.compile(r"\bno\s+relax(?:ation)?\b", re.IGNORECASE),
    re.compile(r"不(?:做|进行|启用)?弛豫"),
    re.compile(r"无须弛豫"),
)
DEFAULT_NUM_SAMPLES = 3


class WorkflowState(TypedDict, total=False):
    prompt: str
    formula: str
    num_samples: int
    relax: bool
    reference_materials: list[str]
    selected_material_id: str | None
    generated_cif_paths: list[str]
    evaluation_results: list[dict[str, Any]]
    trace: list[dict[str, Any]]
    messages: list[dict[str, Any]]
    router_decision: dict[str, Any]
    progress_callback: Callable[["WorkflowState"], Awaitable[None]] | None


materials_project_client = McpHttpClient(SETTINGS.materials_project_url)
material_agent_core_client = McpHttpClient(SETTINGS.material_agent_core_url)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _trace_entry(node: str, summary: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {"node": node, "summary": summary, "payload": payload}


def _message(
    role: str,
    content: str,
    *,
    tool_name: str | None = None,
    tool_input: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex,
        "role": role,
        "content": content,
        "timestamp": _utc_now(),
        "tool_name": tool_name,
        "tool_input": tool_input,
    }


def _extract_formula(prompt: str) -> str:
    match = FORMULA_PATTERN.search(prompt)
    if not match:
        raise ValueError(
            "No chemical formula found. Provide `formula` explicitly or include a formula like SrTiO3 in the prompt."
        )
    return match.group(1)


def _extract_num_samples(prompt: str) -> int:
    for pattern in SAMPLE_COUNT_PATTERNS:
        match = pattern.search(prompt)
        if match:
            value = int(match.group(1))
            if value < 1 or value > 16:
                raise ValueError("Parsed num_samples is outside the supported range 1-16.")
            return value
    return DEFAULT_NUM_SAMPLES


def _extract_relax(prompt: str) -> bool:
    if any(pattern.search(prompt) for pattern in NEGATED_RELAX_PATTERNS):
        return False
    return bool(RELAX_HINT_PATTERN.search(prompt))


def _heuristic_normalize_run_request(request: RunRequest) -> RunRequest:
    prompt = request.prompt.strip()
    formula = (request.formula or "").strip() or _extract_formula(prompt)
    num_samples = request.num_samples if request.num_samples is not None else _extract_num_samples(prompt)
    relax = request.relax if request.relax is not None else _extract_relax(prompt)
    return request.model_copy(
        update={
            "prompt": prompt,
            "formula": formula,
            "num_samples": num_samples,
            "relax": relax,
        }
    )


def _build_parse_prompt(request: RunRequest) -> str:
    return (
        "You are extracting structured workflow parameters for a materials discovery task.\n"
        "Return JSON only with these keys:\n"
        "{\n"
        '  "formula": string | null,\n'
        '  "num_samples": integer | null,\n'
        '  "relax": boolean | null,\n'
        '  "reason": string\n'
        "}\n\n"
        "Requirements:\n"
        "- Infer a concrete reduced chemical formula when the user names a common material or directly gives a formula.\n"
        "- If the user gives an explicit sample count, extract it as num_samples.\n"
        "- If the user asks for relaxation or force/stress summaries, set relax=true.\n"
        "- If the user explicitly says not to relax, set relax=false.\n"
        "- Use null only when the prompt truly does not specify enough information.\n"
        "- Keep num_samples within 1-16 when possible.\n\n"
        f"User prompt: {request.prompt.strip()}\n"
        f"Existing explicit formula override: {(request.formula or '').strip() or 'null'}\n"
        f"Existing explicit num_samples override: {request.num_samples if request.num_samples is not None else 'null'}\n"
        f"Existing explicit relax override: {request.relax if request.relax is not None else 'null'}\n"
    )


async def _call_llm_json(system_prompt: str, user_prompt: str) -> dict[str, Any]:
    url = f"{_normalize_base_url(SETTINGS.llm_router_base_url)}/chat/completions"
    headers = {
        "Authorization": f"Bearer {SETTINGS.llm_router_api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": SETTINGS.llm_router_model,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=SETTINGS.llm_router_timeout_seconds) as client:
        response = await client.post(url, headers=headers, json=body)
        response.raise_for_status()
    payload = response.json()
    content = (
        payload.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    parsed = json.loads(content)
    if not isinstance(parsed, dict):
        raise TypeError("LLM JSON response is not an object.")
    return parsed


async def _llm_normalize_run_request(request: RunRequest) -> RunRequest:
    parsed = await _call_llm_json(
        "You are a strict JSON parameter extractor for a materials workflow.",
        _build_parse_prompt(request),
    )

    prompt = request.prompt.strip()
    formula = (request.formula or "").strip()
    if not formula:
        parsed_formula = parsed.get("formula")
        if isinstance(parsed_formula, str):
            formula = parsed_formula.strip()

    num_samples = request.num_samples
    if num_samples is None:
        parsed_num_samples = parsed.get("num_samples")
        if isinstance(parsed_num_samples, bool):
            parsed_num_samples = None
        if isinstance(parsed_num_samples, (int, float)):
            parsed_value = int(parsed_num_samples)
            if 1 <= parsed_value <= 16:
                num_samples = parsed_value

    relax = request.relax
    if relax is None and isinstance(parsed.get("relax"), bool):
        relax = parsed["relax"]

    fallback_request = request.model_copy(
        update={
            "prompt": prompt,
            "formula": formula or None,
            "num_samples": num_samples,
            "relax": relax,
        }
    )
    return _heuristic_normalize_run_request(fallback_request)


async def normalize_run_request(request: RunRequest) -> RunRequest:
    prompt = request.prompt.strip()
    normalized_request = request.model_copy(
        update={
            "prompt": prompt,
            "formula": (request.formula or "").strip() or None,
        }
    )

    if (
        normalized_request.formula
        and normalized_request.num_samples is not None
        and normalized_request.relax is not None
    ):
        return normalized_request

    if not (
        SETTINGS.llm_router_base_url
        and SETTINGS.llm_router_api_key
        and SETTINGS.llm_router_model
    ):
        return _heuristic_normalize_run_request(normalized_request)

    try:
        return await _llm_normalize_run_request(normalized_request)
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, IndexError, TypeError, ValueError):
        return _heuristic_normalize_run_request(normalized_request)


def _append_tool_message(
    state: WorkflowState,
    *,
    tool_name: str,
    tool_input: dict[str, Any],
    summary: str,
) -> None:
    messages = list(state.get("messages", []))
    messages.append(
        _message(
            "tool_use",
            summary,
            tool_name=tool_name,
            tool_input=tool_input,
        )
    )
    state["messages"] = messages


async def _publish_progress(state: WorkflowState) -> None:
    callback = state.get("progress_callback")
    if callback is not None:
        await callback(state)


def _looks_like_tool_error(text: str) -> bool:
    normalized = text.strip().lower()
    return normalized.startswith("error executing tool") or normalized.startswith("traceback")


def _default_router_decision(state: WorkflowState) -> dict[str, Any]:
    prompt = state["prompt"].lower()
    has_formula = bool(state.get("formula"))
    should_retrieve = has_formula
    should_generate = any(
        keyword in prompt
        for keyword in (
            "generate",
            "design",
            "candidate",
            "new structure",
            "sample",
            "生成",
            "设计",
            "候选",
        )
    )
    should_evaluate = state["relax"] or should_generate or any(
        keyword in prompt
        for keyword in ("evaluate", "stability", "energy", "relax", "评估", "能量", "弛豫")
    )
    return {
        "should_retrieve": should_retrieve,
        "should_generate": should_generate,
        "should_evaluate": should_evaluate,
        "reason": "Fallback heuristic routing because no LLM router is configured or available.",
        "source": "fallback",
    }


def _build_router_prompt(state: WorkflowState) -> str:
    return (
        "You are routing a materials workflow.\n"
        "Decide whether the workflow should do each of these steps:\n"
        "1. Retrieve reference materials from Materials Project.\n"
        "2. Generate candidate structures with MatterGen.\n"
        "3. Evaluate generated structures with MatterSim.\n\n"
        "Return JSON only with these keys:\n"
        "{\n"
        '  "should_retrieve": boolean,\n'
        '  "should_generate": boolean,\n'
        '  "should_evaluate": boolean,\n'
        '  "reason": string\n'
        "}\n\n"
        "Rules:\n"
        "- If evaluation is true, generation should usually also be true unless there are already generated CIF paths.\n"
        "- If the user asks only for reference lookup or known material information, retrieval can be true while generation/evaluation are false.\n"
        "- If there is no usable formula, retrieval should be false.\n"
        "- Be conservative and avoid unnecessary expensive steps.\n\n"
        f"User prompt: {state['prompt']}\n"
        f"Parsed formula: {state.get('formula') or ''}\n"
        f"Requested num_samples: {state['num_samples']}\n"
        f"Relax enabled: {state['relax']}\n"
        f"Existing generated_cif_paths count: {len(state.get('generated_cif_paths', []))}\n"
    )


def _normalize_base_url(base_url: str) -> str:
    normalized = base_url.rstrip("/")
    if normalized.endswith("/chat/completions"):
        return normalized[: -len("/chat/completions")]
    if normalized.endswith("/v1"):
        return normalized
    return f"{normalized}/v1"


async def _call_llm_router(state: WorkflowState) -> dict[str, Any]:
    if not (
        SETTINGS.llm_router_base_url
        and SETTINGS.llm_router_api_key
        and SETTINGS.llm_router_model
    ):
        return _default_router_decision(state)

    url = f"{_normalize_base_url(SETTINGS.llm_router_base_url)}/chat/completions"
    headers = {
        "Authorization": f"Bearer {SETTINGS.llm_router_api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": SETTINGS.llm_router_model,
        "messages": [
            {
                "role": "system",
                "content": "You are a strict JSON router for a materials workflow.",
            },
            {
                "role": "user",
                "content": _build_router_prompt(state),
            },
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=SETTINGS.llm_router_timeout_seconds) as client:
            response = await client.post(url, headers=headers, json=body)
            response.raise_for_status()
        payload = response.json()
        content = (
            payload.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        parsed = json.loads(content)
        decision = {
            "should_retrieve": bool(parsed.get("should_retrieve")),
            "should_generate": bool(parsed.get("should_generate")),
            "should_evaluate": bool(parsed.get("should_evaluate")),
            "reason": str(parsed.get("reason", "")).strip() or "LLM router provided no reason.",
            "source": "llm",
        }
        if decision["should_evaluate"] and not decision["should_generate"]:
            decision["should_generate"] = True
            decision["reason"] += " Adjusted locally because evaluation requires generated structures."
        if not state.get("formula"):
            decision["should_retrieve"] = False
        return decision
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, IndexError, TypeError, ValueError) as exc:
        decision = _default_router_decision(state)
        decision["reason"] = f"{decision['reason']} Router error: {exc}"
        return decision


def _route_after_decide(state: WorkflowState) -> str:
    decision = state["router_decision"]
    if decision.get("should_retrieve"):
        return "lookup_reference_materials"
    if decision.get("should_generate"):
        return "generate_structures"
    if decision.get("should_evaluate"):
        return "evaluate_structures"
    return "finalize"


def _route_after_lookup(state: WorkflowState) -> str:
    if state["router_decision"].get("should_generate"):
        return "generate_structures"
    if state["router_decision"].get("should_evaluate"):
        return "evaluate_structures"
    return "finalize"


def _route_after_generate(state: WorkflowState) -> str:
    if state["router_decision"].get("should_evaluate"):
        return "evaluate_structures"
    return "finalize"


async def _node_parse_input(state: WorkflowState) -> WorkflowState:
    prompt = state["prompt"]
    formula = state.get("formula") or _extract_formula(prompt)
    trace = list(state.get("trace", []))
    messages = list(state.get("messages", []))
    trace.append(
        _trace_entry(
            "parse_input",
            "Parsed user input into workflow parameters.",
            {
                "formula": formula,
                "num_samples": state["num_samples"],
                "relax": state["relax"],
            },
        )
    )
    messages.append(
        _message(
            "assistant",
            f"已解析任务：目标体系 `{formula}`，生成 {state['num_samples']} 个候选，"
            f"{'启用' if state['relax'] else '不启用'} MatterSim 弛豫。",
        )
    )
    state["formula"] = formula
    state["trace"] = trace
    state["messages"] = messages
    await _publish_progress(state)
    return state


async def _node_decide_next_step(state: WorkflowState) -> WorkflowState:
    decision = await _call_llm_router(state)
    trace = list(state.get("trace", []))
    messages = list(state.get("messages", []))
    trace.append(
        _trace_entry(
            "decide_next_step",
            "Decided which workflow steps to run.",
            decision,
        )
    )
    messages.append(
        _message(
            "assistant",
            "路由决策完成："
            f"{'检索' if decision['should_retrieve'] else '跳过检索'}，"
            f"{'生成' if decision['should_generate'] else '跳过生成'}，"
            f"{'评估' if decision['should_evaluate'] else '跳过评估'}。"
            f" 原因：{decision['reason']}",
        )
    )
    state["router_decision"] = decision
    state["trace"] = trace
    state["messages"] = messages
    await _publish_progress(state)
    return state


async def _node_lookup_reference(state: WorkflowState) -> WorkflowState:
    formula = state["formula"]
    tool_input = {"chemical_formula": formula}
    _append_tool_message(
        state,
        tool_name="mcp__materials-project__search_materials_by_formula",
        tool_input=tool_input,
        summary=f"检索 Materials Project 参考材料：{formula}",
    )
    search_result = await materials_project_client.call_tool(
        "search_materials_by_formula",
        tool_input,
    )
    content = search_result.get("content") or []
    descriptions = [
        item.get("text", "")
        for item in content
        if isinstance(item, dict) and item.get("type") == "text"
    ]
    has_error = bool(search_result.get("isError")) or any(
        _looks_like_tool_error(text) for text in descriptions
    )
    material_id = None
    if descriptions and not has_error:
        match = MATERIAL_ID_PATTERN.search(descriptions[0])
        if match:
            material_id = match.group(1)
            select_input = {"material_id": material_id}
            _append_tool_message(
                state,
                tool_name="mcp__materials-project__select_material_by_id",
                tool_input=select_input,
                summary=f"选择第一条参考材料：{material_id}",
            )
            await materials_project_client.call_tool(
                "select_material_by_id",
                select_input,
            )
    trace = list(state.get("trace", []))
    messages = list(state.get("messages", []))
    trace.append(
        _trace_entry(
            "lookup_reference_materials",
            "Queried Materials Project MCP for reference structures.",
            {
                "formula": formula,
                "num_references": 0 if has_error else len(descriptions),
                "selected_material_id": material_id,
                "had_error": has_error,
            },
        )
    )
    messages.append(
        _message(
            "assistant",
            (
                f"参考材料检索完成，共拿到 {len(descriptions)} 条结果。"
                + (f" 当前选中 `{material_id}` 作为代表参考材料。" if material_id else "")
                if not has_error
                else "参考材料检索失败或超时，工作流将继续执行后续生成与评估步骤。"
            ),
        )
    )
    state["reference_materials"] = descriptions
    state["selected_material_id"] = material_id
    state["trace"] = trace
    state["messages"] = messages
    await _publish_progress(state)
    return state


async def _node_generate_structures(state: WorkflowState) -> WorkflowState:
    formula = state["formula"]
    num_samples = state["num_samples"]
    tool_input = {
        "composition": formula,
        "num_samples": num_samples,
        "model_name": "chemical_system",
    }
    _append_tool_message(
        state,
        tool_name="mcp__material-agent-core__mattergen_generate",
        tool_input=tool_input,
        summary=f"MatterGen 生成候选结构：{formula} x {num_samples}",
    )
    result = await material_agent_core_client.call_tool(
        "mattergen_generate",
        tool_input,
    )
    if result.get("isError"):
        raise RuntimeError(f"MatterGen generation failed: {result.get('content')}")
    structured = result.get("structuredContent") or {}
    payload = structured.get("result", structured)
    cif_paths = payload.get("cif_paths") or []
    if not cif_paths:
        raise RuntimeError("MatterGen generation returned no CIF paths.")
    trace = list(state.get("trace", []))
    messages = list(state.get("messages", []))
    trace.append(
        _trace_entry(
            "generate_structures",
            "Generated candidate structures through the material-agent-core MCP server.",
            {
                "formula": formula,
                "num_samples_requested": num_samples,
                "num_samples_generated": len(cif_paths),
            },
        )
    )
    messages.append(
        _message(
            "assistant",
            f"MatterGen 生成完成，输出 {len(cif_paths)} 个 CIF 候选。",
        )
    )
    state["generated_cif_paths"] = list(cif_paths)
    state["trace"] = trace
    state["messages"] = messages
    await _publish_progress(state)
    return state


async def _node_evaluate_structures(state: WorkflowState) -> WorkflowState:
    cif_paths = state.get("generated_cif_paths", [])
    if not cif_paths:
        trace = list(state.get("trace", []))
        messages = list(state.get("messages", []))
        trace.append(
            _trace_entry(
                "evaluate_structures",
                "Skipped evaluation because there were no generated structures.",
                {"num_inputs": 0},
            )
        )
        messages.append(
            _message(
                "assistant",
                "跳过 MatterSim 评估：当前没有可评估的 CIF 候选。",
            )
        )
        state["trace"] = trace
        state["messages"] = messages
        state["evaluation_results"] = []
        await _publish_progress(state)
        return state

    tool_input = {
        "cif_paths": cif_paths,
        "property_name": "energy_per_atom",
        "device": "cuda",
        "relax": state["relax"],
        "return_force_summary": state["relax"],
        "return_stress": state["relax"],
    }
    _append_tool_message(
        state,
        tool_name="mcp__material-agent-core__mattersim_evaluate",
        tool_input=tool_input,
        summary=f"MatterSim 评估 {len(cif_paths)} 个候选结构",
    )
    result = await material_agent_core_client.call_tool(
        "mattersim_evaluate",
        tool_input,
    )
    if result.get("isError"):
        raise RuntimeError(f"MatterSim evaluation failed: {result.get('content')}")
    structured = result.get("structuredContent") or {}
    payload = structured.get("result", structured)
    evaluation_results = payload.get("results") or []
    if not evaluation_results:
        raise RuntimeError("MatterSim evaluation returned no results.")
    trace = list(state.get("trace", []))
    messages = list(state.get("messages", []))
    trace.append(
        _trace_entry(
            "evaluate_structures",
            "Evaluated generated structures with MatterSim through MCP.",
            {
                "num_inputs": len(cif_paths),
                "num_results": len(evaluation_results),
                "relax": state["relax"],
            },
        )
    )
    messages.append(
        _message(
            "assistant",
            f"MatterSim 评估完成，返回 {len(evaluation_results)} 条结果。",
        )
    )
    state["evaluation_results"] = evaluation_results
    state["trace"] = trace
    state["messages"] = messages
    await _publish_progress(state)
    return state


async def _node_finalize(state: WorkflowState) -> WorkflowState:
    trace = list(state.get("trace", []))
    messages = list(state.get("messages", []))
    trace.append(
        _trace_entry(
            "finalize",
            "Collected workflow outputs for the API response.",
            {
                "status": "completed",
                "router_decision": state.get("router_decision", {}),
            },
        )
    )
    messages.append(
        _message(
            "assistant",
            "任务完成。你可以在右侧结果面板查看参考材料、生成的 CIF 路径和 MatterSim 评估结果。",
        )
    )
    state["trace"] = trace
    state["messages"] = messages
    await _publish_progress(state)
    return state


def _build_graph():
    try:
        from langgraph.graph import END, StateGraph
    except ImportError:
        class _SequentialWorkflow:
            async def ainvoke(self, state: WorkflowState) -> WorkflowState:
                current = state
                current = await _node_parse_input(current)
                current = await _node_decide_next_step(current)
                branch = _route_after_decide(current)
                if branch == "lookup_reference_materials":
                    current = await _node_lookup_reference(current)
                    branch = _route_after_lookup(current)
                if branch == "generate_structures":
                    current = await _node_generate_structures(current)
                    branch = _route_after_generate(current)
                if branch == "evaluate_structures":
                    current = await _node_evaluate_structures(current)
                current = await _node_finalize(current)
                return current

        return _SequentialWorkflow()

    graph = StateGraph(WorkflowState)
    graph.add_node("parse_input", _node_parse_input)
    graph.add_node("decide_next_step", _node_decide_next_step)
    graph.add_node("lookup_reference_materials", _node_lookup_reference)
    graph.add_node("generate_structures", _node_generate_structures)
    graph.add_node("evaluate_structures", _node_evaluate_structures)
    graph.add_node("finalize", _node_finalize)
    graph.set_entry_point("parse_input")
    graph.add_edge("parse_input", "decide_next_step")
    graph.add_conditional_edges(
        "decide_next_step",
        _route_after_decide,
        {
            "lookup_reference_materials": "lookup_reference_materials",
            "generate_structures": "generate_structures",
            "evaluate_structures": "evaluate_structures",
            "finalize": "finalize",
        },
    )
    graph.add_conditional_edges(
        "lookup_reference_materials",
        _route_after_lookup,
        {
            "generate_structures": "generate_structures",
            "evaluate_structures": "evaluate_structures",
            "finalize": "finalize",
        },
    )
    graph.add_conditional_edges(
        "generate_structures",
        _route_after_generate,
        {
            "evaluate_structures": "evaluate_structures",
            "finalize": "finalize",
        },
    )
    graph.add_edge("evaluate_structures", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile()


GRAPH = _build_graph()


async def run_workflow(
    request: RunRequest,
    *,
    progress_callback: Callable[[WorkflowState], Awaitable[None]] | None = None,
) -> tuple[WorkflowRun, list[TaskMessage]]:
    request = await normalize_run_request(request)
    initial_messages = [
        _message("user", request.prompt),
    ]
    final_state = await GRAPH.ainvoke(
        {
            "prompt": request.prompt,
            "formula": request.formula or "",
            "num_samples": request.num_samples,
            "relax": request.relax,
            "reference_materials": [],
            "generated_cif_paths": [],
            "evaluation_results": [],
            "trace": [],
            "messages": initial_messages,
            "router_decision": {},
            "progress_callback": progress_callback,
        }
    )
    workflow_run = WorkflowRun(
        formula=final_state["formula"],
        prompt=final_state["prompt"],
        num_samples=final_state["num_samples"],
        relax=final_state["relax"],
        reference_materials=final_state.get("reference_materials", []),
        selected_material_id=final_state.get("selected_material_id"),
        generated_cif_paths=final_state.get("generated_cif_paths", []),
        evaluation_results=final_state.get("evaluation_results", []),
        trace=[TraceEntry(**item) for item in final_state.get("trace", [])],
    )
    messages = [TaskMessage(**item) for item in final_state.get("messages", [])]
    return workflow_run, messages
