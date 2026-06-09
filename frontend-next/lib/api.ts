import type { AnyRecord, CreateRunPayload, ReportPayload, RunRecord, RunSummary } from "./types";

function resolveApiBase() {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (typeof window !== "undefined") {
    const currentPort = window.location.port;
    if (!currentPort || currentPort === "18018") {
      return window.location.origin;
    }
    if (currentPort === "3000") {
      return `${window.location.protocol}//${window.location.hostname}:18018`;
    }
  }
  return "http://127.0.0.1:18018";
}

export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  status?: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options: { status?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

interface RawTraceEntry {
  node: string;
  summary: string;
  payload?: AnyRecord;
}

interface RawTaskMessage {
  id: string;
  role: string;
  content: string;
  timestamp: string;
  tool_name?: string | null;
  tool_input?: AnyRecord | null;
}

interface RawTaskSummary {
  id: string;
  title: string;
  status: string;
  prompt: string;
  formula?: string | null;
  num_samples: number;
  relax: boolean;
  created_at: string;
  updated_at: string;
  reference_material_count: number;
  candidate_count: number;
}

interface RawTaskDetail extends RawTaskSummary {
  selected_material_id?: string | null;
  messages: RawTaskMessage[];
  trace: RawTraceEntry[];
  reference_materials: string[];
  generated_cif_paths: string[];
  evaluation_results: AnyRecord[];
}

function buildUrl(path: string) {
  return `${API_BASE.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function parseError(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const data = await response.json();
      const detail = data?.detail;
      const message =
        (typeof detail === "string" && detail) ||
        (typeof detail?.message === "string" && detail.message) ||
        (typeof data?.message === "string" && data.message) ||
        `请求失败（HTTP ${response.status}）`;
      return new ApiError(message, { status: response.status, details: data });
    } catch {
      return new ApiError(`请求失败（HTTP ${response.status}）`, { status: response.status });
    }
  }
  try {
    const text = await response.text();
    return new ApiError(text || `请求失败（HTTP ${response.status}）`, { status: response.status });
  } catch {
    return new ApiError(`请求失败（HTTP ${response.status}）`, { status: response.status });
  }
}

function networkErrorMessage() {
  if (
    typeof window !== "undefined" &&
    (window.location.origin.includes("localhost:3000") || window.location.origin.includes("127.0.0.1:3000"))
  ) {
    return `无法连接后端服务 ${API_BASE}，请先启动 FastAPI。若前后端不在同一地址，请设置 NEXT_PUBLIC_API_BASE_URL。`;
  }
  return `无法连接后端服务 ${API_BASE}，请检查服务器是否可访问。`;
}

async function requestJson<T>(path: string, init: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  try {
    const response = await fetchWithTimeout(
      buildUrl(path),
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers || {})
        },
        ...init
      },
      timeoutMs
    );
    if (!response.ok) {
      throw await parseError(response);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("请求超时，请检查服务器是否仍在运行。", { code: "timeout" });
    }
    throw new ApiError(networkErrorMessage(), { code: "network" });
  }
}

function uniqueElementsFromFormula(formula?: string | null) {
  if (!formula) return null;
  const matches = formula.match(/[A-Z][a-z]?/g);
  if (!matches?.length) return null;
  return [...new Set(matches)];
}

function parseNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseReferenceMaterial(text: string, index: number) {
  const record: AnyRecord = {
    material_id: `ref-${index + 1}`,
    formula: ""
  };

  text.split("\n").forEach((line) => {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || !rest.length) return;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "material id") record.material_id = value || record.material_id;
    if (key === "formula") record.formula = value;
    if (key === "band gap") record.band_gap = parseNumber(value);
    if (key === "energy above hull") record.e_above_hull = parseNumber(value);
    if (key === "formation energy per atom") record.formation_energy_per_atom = parseNumber(value);
  });

  if (!record.formula) {
    record.formula = record.material_id;
  }
  if (typeof record.e_above_hull === "number") {
    record.stable = record.e_above_hull <= 1e-6;
  }
  return record;
}

function computeStressNorm(stress: unknown) {
  if (!Array.isArray(stress) || !stress.length) return null;
  const numbers = stress.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!numbers.length) return null;
  const sumSquares = numbers.reduce((sum, value) => sum + value * value, 0);
  return Math.sqrt(sumSquares);
}

function buildCandidates(task: RawTaskDetail) {
  if (task.evaluation_results.length) {
    return task.evaluation_results.map((item, index) => {
      const relaxedEnergy =
        typeof item.relaxed_energy_per_atom_ev === "number"
          ? item.relaxed_energy_per_atom_ev
          : typeof item.relaxed_energy_per_atom === "number"
            ? item.relaxed_energy_per_atom
            : typeof item.energy_per_atom_ev === "number"
              ? item.energy_per_atom_ev
              : typeof item.energy_per_atom === "number"
                ? item.energy_per_atom
                : null;

      return {
        ...item,
        id: String(item.id || item.path || `cand-${index + 1}`),
        rank: index + 1,
        formula: typeof item.formula === "string" ? item.formula : task.formula || null,
        path: typeof item.path === "string" ? item.path : null,
        relaxed_path: typeof item.relaxed_path === "string" ? item.relaxed_path : null,
        energy_per_atom: typeof item.energy_per_atom === "number" ? item.energy_per_atom : null,
        energy_per_atom_ev: typeof item.energy_per_atom_ev === "number" ? item.energy_per_atom_ev : null,
        energy_per_atom_ev_relaxed: relaxedEnergy,
        relaxed: typeof item.relaxed === "boolean" ? item.relaxed : null,
        score: typeof relaxedEnergy === "number" ? -relaxedEnergy : null,
        max_force_ev_per_ang: typeof item.max_force_ev_per_ang === "number" ? item.max_force_ev_per_ang : null,
        rms_force_ev_per_ang: typeof item.rms_force_ev_per_ang === "number" ? item.rms_force_ev_per_ang : null,
        stress_norm: computeStressNorm(item.stress)
      };
    });
  }

  return task.generated_cif_paths.map((path, index) => ({
    id: `cand-${index + 1}`,
    rank: index + 1,
    formula: task.formula || null,
    path,
    relaxed_path: null,
    relaxed: task.relax,
    score: null
  }));
}

function deriveIntent(task: RawTaskDetail, shouldGenerate: boolean, shouldRetrieve: boolean) {
  if (shouldGenerate) return "生成候选";
  if (shouldRetrieve) return "检索参考材料";
  return "材料分析";
}

function deriveGenerationMode(task: RawTaskDetail, shouldGenerate: boolean, shouldEvaluate: boolean) {
  if (shouldGenerate && shouldEvaluate) {
    return task.relax ? "MatterGen + MatterSim 弛豫评估" : "MatterGen + MatterSim";
  }
  if (shouldGenerate) return "MatterGen";
  if (shouldEvaluate) return "MatterSim";
  return "参考检索";
}

function deriveDatabaseStatus(task: RawTaskDetail, shouldRetrieve: boolean) {
  if (!shouldRetrieve) return "skipped";
  if (task.reference_material_count > 0) return "completed";
  if (task.status === "failed") return "failed";
  if (task.status === "running") return "running";
  return "unknown";
}

function mapTraceToRouteSteps(task: RawTaskDetail, warnings: string[]) {
  const traceByNode = new Map(task.trace.map((entry) => [entry.node, entry]));
  const routerDecision = traceByNode.get("decide_next_step")?.payload || {};
  const shouldRetrieve = Boolean(routerDecision.should_retrieve ?? task.reference_material_count > 0);
  const shouldGenerate = Boolean(routerDecision.should_generate ?? task.candidate_count > 0);
  const shouldEvaluate = Boolean(routerDecision.should_evaluate ?? task.evaluation_results.length > 0);
  const candidateCount = task.evaluation_results.length || task.generated_cif_paths.length;

  return [
    {
      id: "intent",
      title: "AI 意图解析",
      tool_name: "Prompt Parser",
      status: task.status === "failed" ? "failed" : "completed",
      summary: traceByNode.get("parse_input")?.summary || "已从自然语言需求中提取工作流参数。",
      outputs: {
        formula: task.formula,
        num_samples: task.num_samples,
        relax: task.relax
      },
      explanation: typeof routerDecision.reason === "string" ? routerDecision.reason : ""
    },
    {
      id: "database",
      title: "数据库检索",
      tool_name: "Materials Project Lookup",
      status: !shouldRetrieve ? "skipped" : task.reference_material_count > 0 ? "completed" : task.status,
      summary:
        traceByNode.get("lookup_reference_materials")?.summary ||
        (!shouldRetrieve ? "当前任务无需参考材料检索。" : `返回 ${task.reference_material_count} 个参考材料。`),
      outputs: {
        selected_material_id: task.selected_material_id,
        reference_material_count: task.reference_material_count
      }
    },
    {
      id: "generation",
      title: "MatterGen 生成",
      tool_name: "MatterGen",
      status: !shouldGenerate ? "skipped" : candidateCount > 0 ? "completed" : task.status,
      summary:
        traceByNode.get("generate_structures")?.summary ||
        (!shouldGenerate ? "当前任务无需生成新结构。" : `已生成 ${task.generated_cif_paths.length} 个候选结构。`),
      outputs: {
        candidate_count: task.generated_cif_paths.length,
        generated_cif_paths: task.generated_cif_paths.slice(0, 5)
      }
    },
    {
      id: "evaluation",
      title: "MatterSim 评估",
      tool_name: "MatterSim",
      status: !shouldEvaluate ? "skipped" : task.evaluation_results.length > 0 ? "completed" : task.status,
      summary:
        traceByNode.get("evaluate_structures")?.summary ||
        (!shouldEvaluate ? "当前任务无需评估。" : `已完成 ${task.evaluation_results.length} 个候选的稳定性评估。`),
      outputs: {
        evaluation_count: task.evaluation_results.length,
        relax: task.relax
      }
    },
    {
      id: "ranking",
      title: "结果排序",
      tool_name: "Ranking",
      status: candidateCount > 0 ? "completed" : task.status === "running" ? "running" : "unknown",
      summary: candidateCount > 0 ? `已形成 ${candidateCount} 个候选的排序结果。` : "等待候选结果。"
    },
    {
      id: "report",
      title: "结果汇总",
      tool_name: "Report Builder",
      status: task.status === "completed" ? "completed" : task.status,
      summary:
        traceByNode.get("finalize")?.summary ||
        (task.status === "completed" ? "已整理教学演示结果。" : "正在汇总当前任务结果。"),
      warnings
    }
  ];
}

function buildMarkdownReport(task: RawTaskDetail, referenceMaterials: AnyRecord[], candidates: AnyRecord[], warnings: string[]) {
  const lines: string[] = [
    "# 材料任务报告",
    "",
    "## 任务概览",
    "",
    `- 任务编号：${task.id}`,
    `- 状态：${task.status}`,
    `- 用户需求：${task.prompt}`,
    `- 解析化学式：${task.formula || "暂无数据"}`,
    `- 候选数量：${candidates.length}`,
    `- 参考材料数量：${referenceMaterials.length}`,
    ""
  ];

  if (warnings.length) {
    lines.push("## 警告", "", ...warnings.map((warning) => `- ${warning}`), "");
  }

  if (referenceMaterials.length) {
    lines.push(
      "## 参考材料",
      "",
      "| 材料 ID | 化学式 | 带隙 | 凸包能 |",
      "| --- | --- | --- | --- |",
      ...referenceMaterials.map((item) =>
        `| ${item.material_id || "-"} | ${item.formula || "-"} | ${item.band_gap ?? "-"} | ${item.e_above_hull ?? "-"} |`
      ),
      ""
    );
  }

  if (candidates.length) {
    lines.push(
      "## 候选结果",
      "",
      "| 排名 | 路径 | 单原子能量 | 最大力 |",
      "| --- | --- | --- | --- |",
      ...candidates.map((item, index) =>
        `| ${item.rank || index + 1} | ${item.relaxed_path || item.path || "-"} | ${item.energy_per_atom_ev_relaxed ?? item.energy_per_atom_ev ?? item.energy_per_atom ?? "-"} | ${item.max_force_ev_per_ang ?? "-"} |`
      ),
      ""
    );
  }

  if (task.trace.length) {
    lines.push("## 流程轨迹", "");
    task.trace.forEach((entry) => {
      lines.push(`### ${entry.node}`, "", entry.summary, "");
      if (entry.payload && Object.keys(entry.payload).length) {
        lines.push("```json", JSON.stringify(entry.payload, null, 2), "```", "");
      }
    });
  }

  if (task.messages.length) {
    lines.push("## 对话与工具消息", "");
    task.messages.forEach((message) => {
      lines.push(`- [${message.role}] ${message.content}`);
    });
    lines.push("");
  }

  return lines.join("\n");
}

function mapTaskToRun(task: RawTaskDetail): RunRecord {
  const routerDecision = task.trace.find((entry) => entry.node === "decide_next_step")?.payload || {};
  const shouldRetrieve = Boolean(routerDecision.should_retrieve ?? task.reference_material_count > 0);
  const shouldGenerate = Boolean(routerDecision.should_generate ?? task.candidate_count > 0);
  const shouldEvaluate = Boolean(routerDecision.should_evaluate ?? task.evaluation_results.length > 0);
  const referenceMaterials = task.reference_materials.map(parseReferenceMaterial);
  const candidates = buildCandidates(task);
  const warnings = task.status === "failed" ? [task.messages[task.messages.length - 1]?.content || "任务执行失败。"] : [];

  return {
    run_id: task.id,
    task_id: task.id,
    title: task.title,
    status: task.status,
    prompt: task.prompt,
    parsed_formula: task.formula || undefined,
    material_name: task.formula || task.title || undefined,
    chemical_system: uniqueElementsFromFormula(task.formula),
    generation_mode: deriveGenerationMode(task, shouldGenerate, shouldEvaluate),
    database_lookup_enabled: shouldRetrieve,
    database_lookup_status: { status: deriveDatabaseStatus(task, shouldRetrieve) },
    reference_material_count: task.reference_material_count,
    candidate_count: task.candidate_count,
    reference_materials: referenceMaterials,
    candidates,
    evaluated_candidates: candidates,
    intent: deriveIntent(task, shouldGenerate, shouldRetrieve),
    created_at: task.created_at,
    updated_at: task.updated_at,
    warnings,
    route_steps: mapTraceToRouteSteps(task, warnings),
    report_markdown: buildMarkdownReport(task, referenceMaterials, candidates, warnings),
    selected_material_id: task.selected_material_id || null,
    messages: task.messages,
    trace: task.trace,
    num_samples: task.num_samples,
    relax: task.relax,
    generated_cif_paths: task.generated_cif_paths,
    evaluation_results: task.evaluation_results
  };
}

function mapTaskSummaryToRunSummary(task: RawTaskSummary): RunSummary {
  return {
    run_id: task.id,
    status: task.status,
    prompt: task.prompt,
    parsed_formula: task.formula || undefined,
    material_name: task.formula || task.title || undefined,
    chemical_system: uniqueElementsFromFormula(task.formula),
    generation_mode: task.candidate_count > 0 ? (task.relax ? "MatterGen + MatterSim 弛豫评估" : "MatterGen") : "参考检索",
    reference_material_count: task.reference_material_count,
    candidate_count: task.candidate_count,
    created_at: task.created_at,
    updated_at: task.updated_at
  };
}

export async function createRun(payload: CreateRunPayload): Promise<RunRecord> {
  const result = await requestJson<RawTaskDetail>(
    "/api/tasks",
    {
      method: "POST",
      body: JSON.stringify({
        prompt: payload.prompt,
        reuse_existing: true
      })
    },
    30000
  );
  return mapTaskToRun(result);
}

export async function getRun(runId: string): Promise<RunRecord> {
  const result = await requestJson<RawTaskDetail>(`/api/tasks/${encodeURIComponent(runId)}`);
  return mapTaskToRun(result);
}

export async function listRuns(limit = 100): Promise<RunSummary[]> {
  const result = await requestJson<RawTaskSummary[]>("/api/tasks");
  return result.slice(0, limit).map(mapTaskSummaryToRunSummary);
}

export async function getReport(runId: string, format = "markdown"): Promise<ReportPayload> {
  if (format !== "markdown") {
    throw new ApiError("当前教学 demo 暂不支持导出该格式报告。", { code: "unsupported_format" });
  }
  const run = await getRun(runId);
  return { markdown: run.report_markdown || "报告暂不可用。" };
}
