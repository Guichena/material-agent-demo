import type {
  AnyRecord,
  CandidateMaterial,
  ChartSeriesItem,
  ProgressStepModel,
  ReferenceMaterial,
  RunRecord,
  WorkflowNodeModel
} from "./types";
import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asString,
  formatChemicalSystem,
  formatFormula,
  friendlyWarning,
  humanizeStatus,
  isEmptyValue,
  safeJson,
  statusTone
} from "./utils";

function pickFirstRecord(value: unknown): AnyRecord | null {
  if (Array.isArray(value) && value.length > 0) {
    return asObject(value[0]);
  }
  return asObject(value);
}

function statusFromRun(run: RunRecord): WorkflowNodeModel["status"] {
  switch ((run.status || "").toLowerCase()) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "needs_confirmation":
    case "needs_clarification":
    case "intent_not_supported":
      return "warning";
    case "running":
    case "initialized":
      return "running";
    default:
      return "unknown";
  }
}

function pickCandidateScore(candidate: CandidateMaterial): number | null {
  return (
    asNumber(candidate.score) ??
    pickCandidateEnergy(candidate)
  );
}

function pickCandidateEnergy(candidate: CandidateMaterial): number | null {
  return (
    asNumber(candidate.energy_per_atom_ev_relaxed) ??
    asNumber(candidate.energy_per_atom_ev) ??
    asNumber(candidate.energy_per_atom) ??
    asNumber(candidate.md_avg_energy_per_atom) ??
    asNumber(candidate.formation_energy_per_atom)
  );
}

function statusFromRecord(record: AnyRecord, fallback: WorkflowNodeModel["status"] = "completed"): WorkflowNodeModel["status"] {
  const raw = asString(record.status || record.state || record.phase || record.step_status).toLowerCase();
  if (["completed", "done", "success"].includes(raw)) return "completed";
  if (["running", "active", "in_progress"].includes(raw)) return "running";
  if (["warning", "warn"].includes(raw)) return "warning";
  if (["failed", "error"].includes(raw)) return "failed";
  if (["skipped", "skip"].includes(raw)) return "skipped";
  if (["demo", "replay"].includes(raw)) return "demo";
  return fallback;
}

function canonicalStepId(value: string): string {
  const raw = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    parse_spec: "intent",
    spec_parser: "intent",
    intent_parser: "intent",
    formula_parser: "intent",
    lookup_reference_materials: "database",
    database_lookup: "database",
    materials_project_lookup: "database",
    mp_lookup: "database",
    generate_structures: "generation",
    mattergen_generation: "generation",
    mattergen_generator: "generation",
    eval_gnn: "evaluation",
    evaluate_structures: "evaluation",
    mattersim_eval: "evaluation",
    mattersim_evaluator: "evaluation",
    rank_candidates: "ranking",
    ranking: "ranking",
    select_top_k: "ranking",
    final_report: "report",
    report_service: "report",
    generate_report: "report",
    report_generator: "report"
  };
  return aliases[raw] || raw || "step";
}

function fallbackIconForStep(id: string): string {
  switch (canonicalStepId(id)) {
    case "intent":
      return "ScanText";
    case "database":
      return "DatabaseZap";
    case "generation":
      return "Sparkles";
    case "evaluation":
      return "Gauge";
    case "ranking":
      return "Trophy";
    case "report":
      return "FileText";
    default:
      return "Box";
  }
}

function fallbackTitleForStep(id: string): string {
  switch (canonicalStepId(id)) {
    case "intent":
      return "AI 意图解析";
    case "database":
      return "数据库检索";
    case "generation":
      return "MatterGen 生成";
    case "evaluation":
      return "MatterSim 评估";
    case "ranking":
      return "Top-K 排序";
    case "report":
      return "报告生成";
    default:
      return id || "流程节点";
  }
}

function fallbackToolForStep(id: string): string {
  switch (canonicalStepId(id)) {
    case "intent":
      return "DefaultSpecParser";
    case "database":
      return "materials_project_lookup";
    case "generation":
      return "MatterGen";
    case "evaluation":
      return "MatterSim";
    case "ranking":
      return "Ranking / Selection";
    case "report":
      return "ReportService";
    default:
      return id || "Tool";
  }
}

function buildUserInputNode(run: RunRecord, status: WorkflowNodeModel["status"]): WorkflowNodeModel {
  const prompt = asString(run.prompt || run.user_prompt) || "自然语言输入";
  return {
    id: "user-input",
    title: "用户需求",
    toolName: "Prompt",
    status: status === "running" ? "running" : "completed",
    icon: "MessageSquareText",
    subtitle: "自然语言任务",
    inputSummary: prompt,
    outputSummary: prompt,
    inputs: { prompt },
    outputs: { prompt },
    explanation: "用户只输入自然语言，系统先保留原始意图，再交给意图解析模块。"
  };
}

function buildStructuredWorkflowNodes(
  run: RunRecord,
  aiPlan: unknown[],
  routeSteps: unknown[]
): WorkflowNodeModel[] {
  const source = aiPlan.length > 0 ? aiPlan : routeSteps;
  if (!source.length) return [];

  const durationMap = new Map<string, number>();
  routeSteps.forEach((item) => {
    const record = asObject(item);
    if (!record) return;
    const id = canonicalStepId(
      asString(record.id) ||
        asString(record.step_id) ||
        asString(record.name) ||
        asString(record.tool_name) ||
        asString(record.tool)
    );
    const duration = asNumber(record.duration_ms ?? record.elapsed_ms ?? record.duration);
    if (duration !== null) durationMap.set(id, duration);
  });

  const nodes = source
    .map((item, index) => {
      const record = asObject(item);
      if (!record) return null;
      const rawId =
        asString(record.id) ||
        asString(record.step_id) ||
        asString(record.name) ||
        asString(record.tool_name) ||
        asString(record.tool) ||
        `step-${index + 1}`;
      const id = canonicalStepId(rawId);
      if (id === "user-input") return null;
      const inputs = asObject(record.inputs) || asObject(record.input) || {};
      const outputs = asObject(record.outputs) || asObject(record.output) || {};
      const duration = asNumber(record.duration_ms ?? record.elapsed_ms ?? record.duration) ?? durationMap.get(id) ?? null;
      return {
        id,
        title: asString(record.title || record.step_name || record.name) || fallbackTitleForStep(id),
        toolName: asString(record.tool_name || record.tool) || fallbackToolForStep(id),
        status: statusFromRecord(record, statusFromRun(run) === "running" ? "running" : "completed"),
        icon: asString(record.icon) || fallbackIconForStep(id),
        subtitle: asString(record.subtitle || record.description) || undefined,
        inputSummary: asString(record.input_summary || record.inputSummary) || undefined,
        outputSummary: asString(record.output_summary || record.outputSummary || record.summary) || undefined,
        inputs,
        outputs,
        durationMs: duration,
        warning: asString(record.warning || record.warnings?.[0]) || null,
        error: asString(record.error) || null,
        explanation: asString(record.explanation || record.reason) || null,
        source: aiPlan.length > 0 ? "ai_plan" : "route_steps"
      } as WorkflowNodeModel;
    })
    .filter(Boolean) as WorkflowNodeModel[];

  if (!nodes.length) return [];
  return [buildUserInputNode(run, statusFromRun(run)), ...nodes];
}

export function extractWarnings(run: RunRecord): string[] {
  const warnings = asArray<unknown>(run.warnings);
  return warnings
    .map((item) => {
      if (typeof item === "string") return friendlyWarning(item);
      const obj = asObject(item);
      if (!obj) return "";
      return friendlyWarning(
        asString(obj.message) ||
          asString(obj.detail) ||
          asString(obj.warning) ||
          asString(obj.text) ||
          safeJson(obj, 0)
      );
    })
    .filter(Boolean);
}

export function normalizeReferenceMaterials(run: RunRecord): ReferenceMaterial[] {
  return asArray(run.reference_materials)
    .map((item, index) => {
      const record = asObject(item);
      if (!record) return null;
      return {
        ...record,
        material_id:
          asString(record.material_id) ||
          asString(record.task_id) ||
          asString(record.id) ||
          `ref-${index + 1}`,
        formula: formatFormula(record.formula || record.pretty_formula || record.composition || record.material_formula)
      } as ReferenceMaterial;
    })
    .filter(Boolean) as ReferenceMaterial[];
}

export function normalizeCandidates(run: RunRecord): CandidateMaterial[] {
  const source = asArray(run.evaluated_candidates).length > 0 ? asArray(run.evaluated_candidates) : asArray(run.candidates);
  return source
    .map((item, index) => {
      const record = asObject(item);
      if (!record) return null;
      return {
        ...record,
        id:
          asString(record.id) ||
          asString(record.candidate_id) ||
          asString(record.name) ||
          `cand-${index + 1}`,
        rank: asNumber(record.rank) ?? index + 1,
        formula: asString(record.formula || record.pretty_formula || record.composition || record.species) || null,
        path: asString(record.path || record.cif_path || record.file_path || record.cif_file) || null,
        relaxed_path: asString(record.relaxed_path || record.output_path) || null,
        cif_text: asString(record.cif_text || record.cif) || null,
        energy_per_atom:
          asNumber(record.energy_per_atom) ??
          asNumber(record.md_avg_energy_per_atom) ??
          asNumber(record.energy),
        energy_per_atom_ev:
          asNumber(record.energy_per_atom_ev) ??
          asNumber(record.energy_per_atom) ??
          asNumber(record.md_avg_energy_per_atom),
        energy_per_atom_ev_relaxed:
          asNumber(record.energy_per_atom_ev_relaxed) ?? asNumber(record.relaxed_energy_per_atom),
        md_avg_energy_per_atom: asNumber(record.md_avg_energy_per_atom),
        formation_energy_per_atom: asNumber(record.formation_energy_per_atom),
        max_force_ev_per_ang: asNumber(record.max_force_ev_per_ang) ?? asNumber(record.max_force),
        rms_force_ev_per_ang: asNumber(record.rms_force_ev_per_ang) ?? asNumber(record.rms_force),
        stress_norm: asNumber(record.stress_norm),
        relaxed: asBoolean(record.relaxed),
        score: asNumber(record.score) ?? asNumber(record.rank_score)
      } as CandidateMaterial;
    })
    .filter(Boolean) as CandidateMaterial[];
}

export function getBestCandidate(run: RunRecord): CandidateMaterial | null {
  const candidates = normalizeCandidates(run);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const rankA = asNumber(a.rank) ?? Number.MAX_SAFE_INTEGER;
    const rankB = asNumber(b.rank) ?? Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  })[0];
}

export function buildWorkflowNodes(run: RunRecord): WorkflowNodeModel[] {
  const status = statusFromRun(run);
  const warnings = extractWarnings(run);
  const chemicalSystem = formatChemicalSystem(run.chemical_system);
  const referenceMaterials = normalizeReferenceMaterials(run);
  const candidates = normalizeCandidates(run);
  const aiPlan = asArray<unknown>(run.ai_plan);
  const routeSteps = asArray<unknown>(run.route_steps);
  const hasStructuredPlan = aiPlan.length > 0 || routeSteps.length > 0;
  const structuredNodes = buildStructuredWorkflowNodes(run, aiPlan, routeSteps);
  if (structuredNodes.length) return structuredNodes;

  const planMap = new Map<string, AnyRecord>();
  const stepAliases: Record<string, string> = {
    parse_spec: "intent",
    spec_parser: "intent",
    intent_parser: "intent",
    formula_parser: "intent",
    database_lookup: "database",
    materials_project_lookup: "database",
    mp_lookup: "database",
    generate_structures: "generation",
    mattergen_generation: "generation",
    mattergen_generator: "generation",
    eval_gnn: "evaluation",
    evaluate_structures: "evaluation",
    mattersim_eval: "evaluation",
    mattersim_evaluator: "evaluation",
    rank_candidates: "ranking",
    ranking: "ranking",
    select_top_k: "ranking",
    final_report: "report",
    generate_report: "report",
    report_generator: "report"
  };
  [...aiPlan, ...routeSteps].forEach((item, index) => {
    const record = asObject(item);
    if (!record) return;
    const key = asString(record.id) || asString(record.step_id) || asString(record.name) || `step-${index}`;
    planMap.set(key.toLowerCase(), record);
    const alias = stepAliases[key.toLowerCase()];
    if (alias) planMap.set(alias, record);
    const title = asString(record.title) || asString(record.step_name) || asString(record.name);
    if (title) planMap.set(title.toLowerCase(), record);
    const titleAlias = stepAliases[title.toLowerCase()];
    if (titleAlias) planMap.set(titleAlias, record);
    const tool = asString(record.tool_name) || asString(record.tool);
    if (tool) planMap.set(tool.toLowerCase(), record);
    const toolAlias = stepAliases[tool.toLowerCase()];
    if (toolAlias) planMap.set(toolAlias, record);
  });

  const nodes: WorkflowNodeModel[] = [
    {
      id: "user-input",
      title: "用户需求",
      toolName: "Prompt",
      status: status === "running" ? "running" : status === "completed" ? "completed" : "completed",
      icon: "MessageSquareText",
      subtitle: "自然语言任务",
      inputSummary: asString(run.prompt || run.user_prompt) || "自然语言输入",
      outputSummary: asString(run.prompt || run.user_prompt) || "原始任务文本",
      explanation: "用户只输入自然语言，系统先保留原始意图，再交给意图解析模块。"
    },
    {
      id: "intent",
      title: "AI 意图解析",
      toolName: "Intent / Formula Parser",
      status:
        run.parsed_formula || run.material_name || run.intent || run.parser_confidence
          ? "completed"
          : status === "running"
            ? "running"
            : status === "completed"
              ? "completed"
              : warnings.length
                ? "warning"
                : "unknown",
      icon: "ScanText",
      subtitle: "理解目标与材料约束",
      inputSummary: asString(run.prompt || run.user_prompt) || "用户需求",
      outputSummary: [
        run.intent ? `意图：${asString(run.intent)}` : null,
        run.material_name ? `材料：${asString(run.material_name)}` : null,
        run.parsed_formula ? `化学式：${asString(run.parsed_formula)}` : null,
        chemicalSystem !== "暂无数据" ? `元素体系：${chemicalSystem}` : null
      ]
        .filter(Boolean)
        .join(" · "),
      inputs: { prompt: asString(run.prompt || run.user_prompt) },
      outputs: {
        intent: run.intent || (status === "completed" ? "generate" : "unknown"),
        formula: run.parsed_formula || null,
        material_name: run.material_name || null,
        chemical_system: run.chemical_system || null,
        strict_stoichiometry: run.strict_stoichiometry
      },
      warning: warnings[0] || null,
      explanation: "系统将用户需求拆成材料对象、约束和目标性质，并决定是生成还是查询流程。"
    },
    {
      id: "database",
      title: "数据库检索",
      toolName: "Materials Project Lookup",
      status: !run.database_lookup_enabled
        ? "skipped"
        : referenceMaterials.length > 0 ||
            asNumber(run.reference_material_count) !== null ||
            asString(asObject(run.database_lookup_status)?.status) === "completed"
          ? "completed"
          : status === "running"
            ? "running"
            : warnings.some((item) => item.includes("MP_API_KEY"))
              ? "warning"
              : hasStructuredPlan
                ? "unknown"
                : "warning",
      icon: "DatabaseZap",
      subtitle: "检索已知材料",
      inputSummary: chemicalSystem !== "暂无数据" ? chemicalSystem : asString(run.parsed_formula) || "材料约束",
      outputSummary:
        referenceMaterials.length > 0
          ? `找到 ${referenceMaterials.length} 个参考材料`
          : asNumber(run.reference_material_count) !== null
            ? `找到 ${asNumber(run.reference_material_count)} 个参考材料`
            : "暂无参考材料数据",
      inputs: {
        formula: run.parsed_formula || null,
        chemical_system: run.chemical_system || null,
        target_properties: asObject(asObject(run.database_lookup_status)?.target_properties) || run.database_lookup_status || null
      },
      outputs: {
        reference_material_count: referenceMaterials.length || run.reference_material_count || 0,
        reference_materials: referenceMaterials.slice(0, 5)
      },
      warning: !run.database_lookup_enabled
        ? "当前任务没有执行参考材料检索。"
        : warnings.find((item) => item.includes("MP_API_KEY")) || null,
      explanation: "系统查询已知材料，给后续生成和排序提供参照。"
    },
    {
      id: "generation",
      title: "MatterGen 生成",
      toolName: "MatterGen Generator",
      status: candidates.length > 0 ? "completed" : status === "running" ? "running" : "unknown",
      icon: "Sparkles",
      subtitle: "生成候选晶体结构",
      inputSummary: run.generation_mode ? `生成模式：${asString(run.generation_mode)}` : "元素体系约束",
      outputSummary:
        candidates.length > 0
          ? `生成 ${candidates.length} 个候选结构`
          : asNumber(run.candidate_count) !== null
            ? `生成 ${asNumber(run.candidate_count)} 个候选结构`
            : "结果见报告",
      inputs: {
        chemical_system: run.chemical_system || null,
        generation_mode: run.generation_mode || null
      },
      outputs: {
        candidate_count: candidates.length || run.candidate_count || 0
      },
      warning: warnings.find((item) => item.includes("MatterGen")) || null,
      explanation: "系统基于元素体系或配比约束生成多个候选结构，并输出 CIF 产物。"
    },
    {
      id: "evaluation",
      title: "MatterSim 评估",
      toolName: "MatterSim Evaluator",
      status:
        candidates.some((item) => item.score !== null) || asArray(run.evaluated_candidates).length > 0
          ? "completed"
          : candidates.length > 0
            ? status === "running"
              ? "running"
              : "unknown"
            : "unknown",
      icon: "Gauge",
      subtitle: "弛豫与打分",
      inputSummary: "生成的 CIF 候选",
      outputSummary:
        candidates.length > 0
          ? "完成能量、力、应力评估"
          : "结果见报告",
      inputs: { generated_cifs: candidates.slice(0, 3).map((item) => item.path || item.relaxed_path).filter(Boolean) },
      outputs: {
        candidates: candidates.slice(0, 5)
      },
      warning: warnings.find((item) => item.includes("MatterSim")) || (candidates.length ? null : "后端暂未返回结构化候选材料，将优先展示生成报告。"),
      explanation: "系统用 MatterSim 对候选结构进行弛豫和能量评估，辅助筛选更稳定的结构。"
    },
    {
      id: "ranking",
      title: "Top-K 排序",
      toolName: "Ranking / Selection",
      status: candidates.length > 0 ? "completed" : status === "running" ? "running" : "unknown",
      icon: "Trophy",
      subtitle: "选出最优候选",
      inputSummary: "评估后的候选列表",
      outputSummary:
        candidates.length > 0
          ? `已生成排序结果，Top ${Math.min(10, candidates.length)}`
          : "暂无排序结果",
      inputs: { evaluated_candidates: candidates.slice(0, 10) },
      outputs: { best_candidate: candidates[0] || null },
      explanation: "将评估结果汇总成可比较的排序，突出最优候选。"
    },
    {
      id: "report",
      title: "报告生成",
      toolName: "Report Generator",
      status: run.report_path || run.report_html_path || run.report_pdf_path ? "completed" : status === "running" ? "running" : "unknown",
      icon: "FileText",
      subtitle: "生成 Markdown / PDF 报告",
      inputSummary: "解析结果、参考材料、候选列表、警告信息",
      outputSummary: run.report_path ? "Markdown 报告已生成" : "报告生成中或暂不可用",
      inputs: {
        parsed_formula: run.parsed_formula,
        reference_material_count: referenceMaterials.length,
        candidate_count: candidates.length,
        warnings
      },
      outputs: {
        report_path: run.report_path || null,
        report_html_path: run.report_html_path || null,
        report_pdf_path: run.report_pdf_path || null
      },
      explanation: "系统将分析过程整理为可阅读报告，便于现场展示和复查。"
    }
  ];

  if (hasStructuredPlan) {
    nodes.forEach((node) => {
      const record =
        planMap.get(node.id.toLowerCase()) ||
        planMap.get(node.title.toLowerCase()) ||
        planMap.get(node.toolName.toLowerCase());
      if (!record) return;
      const nodeStatus = asString(record.status || record.state || record.phase || record.step_status);
      if (nodeStatus) {
        const lower = nodeStatus.toLowerCase();
        if (["completed", "done", "success"].includes(lower)) node.status = "completed";
        else if (["running", "active", "in_progress"].includes(lower)) node.status = "running";
        else if (["warning", "warn"].includes(lower)) node.status = "warning";
        else if (["failed", "error"].includes(lower)) node.status = "failed";
        else if (["skipped", "skip"].includes(lower)) node.status = "skipped";
        else if (["demo"].includes(lower)) node.status = "demo";
      }
      const outputs = asObject(record.outputs) || asObject(record.output);
      const inputs = asObject(record.inputs) || asObject(record.input);
      node.inputs = inputs || node.inputs;
      node.outputs = outputs || node.outputs;
      node.durationMs = asNumber(record.duration_ms ?? record.elapsed_ms ?? record.duration);
      node.warning = asString(record.warning || record.warnings?.[0] || node.warning) || node.warning || null;
      node.error = asString(record.error) || node.error || null;
      node.subtitle = asString(record.description || record.subtitle) || node.subtitle;
      node.outputSummary = asString(record.summary || record.output_summary) || node.outputSummary;
      node.inputSummary = asString(record.input_summary) || node.inputSummary;
      node.explanation = asString(record.explanation || record.reason) || node.explanation;
    });
  }

  return nodes;
}

export function buildExecutionSteps(run: RunRecord): ProgressStepModel[] {
  const nodes = buildWorkflowNodes(run);
  const structuredNodes = nodes.filter((node) => node.id !== "user-input" && node.source);
  if (structuredNodes.length) {
    return structuredNodes.map((node) => ({
      id: node.id,
      title: node.title,
      status: node.status,
      summary: node.outputSummary || node.subtitle || node.explanation || "",
      durationMs: node.durationMs
    }));
  }
  const pick = (id: string) => nodes.find((node) => node.id === id);
  return [
    {
      id: "intent",
      title: "理解需求",
      status: pick("intent")?.status || "unknown",
      summary:
        pick("intent")?.outputSummary ||
        (run.parsed_formula || run.material_name
          ? `识别为 ${asString(run.material_name) || asString(run.parsed_formula)} 相关任务`
          : "正在解析用户需求"),
      durationMs: pick("intent")?.durationMs
    },
    {
      id: "database",
      title: "检索已知材料",
      status: pick("database")?.status || "unknown",
      summary:
        pick("database")?.outputSummary ||
        (asNumber(run.reference_material_count) !== null
          ? `找到 ${asNumber(run.reference_material_count)} 个参考材料`
          : "正在检索 Materials Project"),
      durationMs: pick("database")?.durationMs
    },
    {
      id: "generation",
      title: "生成候选结构",
      status: pick("generation")?.status || "unknown",
      summary:
        pick("generation")?.outputSummary ||
        (asNumber(run.candidate_count) !== null
          ? `生成 ${asNumber(run.candidate_count)} 个候选 CIF`
          : "正在生成候选结构"),
      durationMs: pick("generation")?.durationMs
    },
    {
      id: "evaluation",
      title: "评估与弛豫",
      status: pick("evaluation")?.status || "unknown",
      summary: pick("evaluation")?.outputSummary || "完成 MatterSim 能量评估",
      durationMs: pick("evaluation")?.durationMs
    },
    {
      id: "ranking",
      title: "排序筛选",
      status: pick("ranking")?.status || "unknown",
      summary:
        pick("ranking")?.outputSummary ||
        (getBestCandidate(run) ? "已筛选出 Top 候选材料" : "正在排序候选结果"),
      durationMs: pick("ranking")?.durationMs
    },
    {
      id: "report",
      title: "生成报告",
      status: pick("report")?.status || "unknown",
      summary: pick("report")?.outputSummary || "Markdown 报告已生成",
      durationMs: pick("report")?.durationMs
    }
  ];
}

export function buildEnergySeries(run: RunRecord): ChartSeriesItem[] {
  const candidates = normalizeCandidates(run);
  const rows = candidates.slice(0, 10).map((candidate, index) => {
    const rawEnergy = pickCandidateEnergy(candidate);
    const lowEnergyScore = rawEnergy === null ? null : -rawEnergy;
    return {
      name: candidate.formula || candidate.path || `候选 ${index + 1}`,
      value: lowEnergyScore,
      rawValue: rawEnergy,
      score: asNumber(candidate.score),
      force: asNumber(candidate.max_force_ev_per_ang)
    };
  });
  const finiteValues = rows
    .map((item) => item.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const minValue = finiteValues.length ? Math.min(...finiteValues) : 0;
  const offset = minValue <= 0 ? Math.abs(minValue) + 0.001 : 0;
  return rows.map((item) => ({
    ...item,
    value: item.value === null ? null : item.value + offset
  }));
}

export function buildForceSeries(run: RunRecord): ChartSeriesItem[] {
  const candidates = normalizeCandidates(run);
  return candidates
    .filter((candidate) => candidate.max_force_ev_per_ang !== null && candidate.max_force_ev_per_ang !== undefined)
    .slice(0, 10)
    .map((candidate, index) => ({
      name: candidate.formula || candidate.path || `候选 ${index + 1}`,
      value: asNumber(candidate.max_force_ev_per_ang),
      score: asNumber(candidate.score),
      force: asNumber(candidate.max_force_ev_per_ang)
    }));
}

export function buildScoreSeries(run: RunRecord): ChartSeriesItem[] {
  const candidates = normalizeCandidates(run);
  return candidates.slice(0, 10).map((candidate, index) => ({
    name: candidate.formula || candidate.path || `候选 ${index + 1}`,
    value: asNumber(candidate.score),
    score: asNumber(candidate.score),
    force: asNumber(candidate.max_force_ev_per_ang)
  }));
}

export function buildComparisonSummary(run: RunRecord) {
  const refs = normalizeReferenceMaterials(run);
  const cands = normalizeCandidates(run);
  const rawDatabaseStatus = asString(asObject(run.database_lookup_status)?.status);
  return {
    referenceCount: refs.length || asNumber(run.reference_material_count) || 0,
    candidateCount: cands.length || asNumber(run.candidate_count) || 0,
    databaseStatus: rawDatabaseStatus ? humanizeStatus(rawDatabaseStatus) : "暂无数据",
    generationMode: asString(run.generation_mode) || "暂无数据"
  };
}

export function getIntentSummary(run: RunRecord) {
  const rawDatabaseStatus = asString(asObject(run.database_lookup_status)?.status);
  return {
    intent: asString(run.intent) || (run.parsed_formula || run.material_name ? "生成候选" : "暂无数据"),
    materialName: asString(run.material_name) || "暂无数据",
    formula: formatFormula(run.parsed_formula),
    chemicalSystem: formatChemicalSystem(run.chemical_system),
    generationMode: asString(run.generation_mode) || "暂无数据",
    strictStoichiometry: run.strict_stoichiometry ?? null,
    databaseStatus: rawDatabaseStatus ? humanizeStatus(rawDatabaseStatus) : "暂无数据",
    confidence: asNumber(run.parser_confidence),
    reason: asString(run.parser_reason) || ""
  };
}

export function getReportAvailability(run: RunRecord) {
  return {
    markdown: Boolean(run.report_path),
    html: Boolean(run.report_html_path),
    pdf: Boolean(run.report_pdf_path)
  };
}

export function getPrimaryWarning(run: RunRecord) {
  return extractWarnings(run)[0] || null;
}

export function isPollingActive(run?: RunRecord | null) {
  if (!run) return true;
  const status = asString(run.status).toLowerCase();
  return !["completed", "failed", "needs_confirmation", "intent_not_supported", "needs_clarification"].includes(status);
}
