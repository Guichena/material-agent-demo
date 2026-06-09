"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  CircleDashed,
  Compass,
  FlaskConical,
  Layers3,
  LoaderCircle,
  Orbit,
  Plus,
} from "lucide-react";
import { AgentWorkflowCanvas } from "@/components/AgentWorkflowCanvas";
import { CandidateTable } from "@/components/CandidateTable";
import { DataFlowSummary } from "@/components/DataFlowSummary";
import { ExecutionProgress } from "@/components/ExecutionProgress";
import { ExamplePrompts } from "@/components/ExamplePrompts";
import { PromptBox } from "@/components/PromptBox";
import { ReferenceMaterialsTable } from "@/components/ReferenceMaterialsTable";
import { ToolCallInspector } from "@/components/ToolCallInspector";
import { WarningPanel } from "@/components/WarningPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, API_BASE, createRun, getRun, listRuns } from "@/lib/api";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import type { RunRecord, RunSummary, WorkflowNodeModel } from "@/lib/types";
import { buildExecutionSteps, buildWorkflowNodes, extractWarnings, isPollingActive, normalizeCandidates, normalizeReferenceMaterials } from "@/lib/view-model";
import { cn, formatChemicalSystem, humanizeStatus, statusTone, truncate } from "@/lib/utils";

type PanelMode = "compose" | "summary";

function groupRunsByTime(runs: RunSummary[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; runs: RunSummary[] }[] = [
    { label: "今天", runs: [] },
    { label: "昨天", runs: [] },
    { label: "最近 7 天", runs: [] },
    { label: "更早", runs: [] },
  ];

  runs.forEach((run) => {
    const updatedAt = new Date(run.updated_at || run.created_at || 0);
    if (updatedAt >= today) {
      groups[0].runs.push(run);
    } else if (updatedAt >= yesterday) {
      groups[1].runs.push(run);
    } else if (updatedAt >= weekAgo) {
      groups[2].runs.push(run);
    } else {
      groups[3].runs.push(run);
    }
  });

  return groups.filter((group) => group.runs.length > 0);
}

function hasActiveRuns(runs: RunSummary[]) {
  return runs.some((run) => (run.status || "").toLowerCase() === "running");
}

function buildRunTitle(run: Partial<RunSummary> | null | undefined) {
  if (!run) {
    return "未命名任务";
  }
  return (
    run.parsed_formula ||
    run.material_name ||
    (Array.isArray(run.chemical_system) && run.chemical_system.length ? run.chemical_system.join("-") : "") ||
    truncate(run.prompt || "未命名任务", 48)
  );
}

function formatRunTime(value?: string) {
  if (!value) return "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无时间";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<React.ReactNode>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState("");
  const [panelMode, setPanelMode] = useState<PanelMode>("compose");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<RunRecord | null>(null);
  const [selectedRunLoading, setSelectedRunLoading] = useState(false);
  const [selectedRunRefreshing, setSelectedRunRefreshing] = useState(false);
  const [selectedRunError, setSelectedRunError] = useState("");
  const [selectedPreviewNodeId, setSelectedPreviewNodeId] = useState<string>("intent");

  const selectedRun = useMemo(
    () => runs.find((run) => run.run_id === selectedRunId) || null,
    [runs, selectedRunId]
  );
  const groupedRuns = useMemo(() => groupRunsByTime(runs), [runs]);
  const selectedRunSteps = useMemo(
    () => (selectedRunDetail ? buildExecutionSteps(selectedRunDetail) : []),
    [selectedRunDetail]
  );
  const selectedRunWarnings = useMemo(
    () => (selectedRunDetail ? extractWarnings(selectedRunDetail) : []),
    [selectedRunDetail]
  );
  const selectedRunNodes = useMemo(
    () => (selectedRunDetail ? buildWorkflowNodes(selectedRunDetail) : []),
    [selectedRunDetail]
  );
  const selectedPreviewNode = useMemo(() => {
    if (!selectedRunNodes.length) return null;
    return (
      selectedRunNodes.find((node) => node.id === selectedPreviewNodeId) ||
      selectedRunNodes[1] ||
      selectedRunNodes[0]
    );
  }, [selectedPreviewNodeId, selectedRunNodes]);
  const hasPreviewReferences = useMemo(
    () => (selectedRunDetail ? normalizeReferenceMaterials(selectedRunDetail).length > 0 : false),
    [selectedRunDetail]
  );
  const hasPreviewCandidates = useMemo(
    () => (selectedRunDetail ? normalizeCandidates(selectedRunDetail).length > 0 : false),
    [selectedRunDetail]
  );

  const loadRuns = async (keepSpinner = false) => {
    if (keepSpinner) {
      setRunsLoading(true);
    }
    setRunsError("");
    try {
      const nextRuns = await listRuns(120);
      setRuns(nextRuns);
      setSelectedRunId((current) => {
        if (current && nextRuns.some((run) => run.run_id === current)) {
          return current;
        }
        if (panelMode === "summary" && nextRuns[0]?.run_id) {
          return nextRuns[0].run_id;
        }
        return current;
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setRunsError(err.message || "获取任务列表失败。");
      } else {
        setRunsError("获取任务列表失败。");
      }
    } finally {
      if (keepSpinner) {
        setRunsLoading(false);
      }
    }
  };

  const loadSelectedRun = async (runId: string, manual = false) => {
    if (manual) {
      setSelectedRunRefreshing(true);
    } else {
      setSelectedRunLoading(true);
    }
    setSelectedRunError("");
    try {
      const detail = await getRun(runId);
      setSelectedRunDetail(detail);
    } catch (err) {
      if (err instanceof ApiError) {
        setSelectedRunError(err.message || "获取任务详情失败。");
      } else {
        setSelectedRunError("获取任务详情失败。");
      }
      setSelectedRunDetail(null);
    } finally {
      if (manual) {
        setSelectedRunRefreshing(false);
      } else {
        setSelectedRunLoading(false);
      }
    }
  };

  useEffect(() => {
    document.title = BRAND_NAME;
  }, []);

  useEffect(() => {
    void loadRuns(true);
  }, []);

  useEffect(() => {
    if (!hasActiveRuns(runs)) return;
    const timer = window.setInterval(() => {
      void loadRuns(false);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [runs]);

  useEffect(() => {
    if (panelMode !== "summary" || !selectedRunId) {
      setSelectedRunDetail(null);
      setSelectedRunLoading(false);
      setSelectedRunRefreshing(false);
      setSelectedRunError("");
      setSelectedPreviewNodeId("intent");
      return;
    }
    void loadSelectedRun(selectedRunId, false);
  }, [panelMode, selectedRunId]);

  useEffect(() => {
    if (!selectedRunNodes.length) {
      setSelectedPreviewNodeId("intent");
      return;
    }
    if (selectedRunNodes.some((node) => node.id === selectedPreviewNodeId)) {
      return;
    }
    setSelectedPreviewNodeId(selectedRunNodes[1]?.id || selectedRunNodes[0]?.id || "intent");
  }, [selectedPreviewNodeId, selectedRunNodes]);

  useEffect(() => {
    if (panelMode !== "summary" || !selectedRunDetail || !isPollingActive(selectedRunDetail)) return;
    const timer = window.setInterval(() => {
      void loadSelectedRun(selectedRunDetail.run_id, false);
      void loadRuns(false);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [panelMode, selectedRunDetail, runs]);

  const handleSelectRun = (runId: string) => {
    setSelectedRunId(runId);
    setPanelMode("summary");
  };

  const handleNewTask = () => {
    setPanelMode("compose");
    setSelectedRunId(null);
    setSelectedRunDetail(null);
    setSelectedRunError("");
    setError("");
    setNotice(null);
  };

  const handleSubmit = async () => {
    const trimmed = prompt.trim();
    setError("");
    setNotice(null);
    if (!trimmed) {
      setError("请输入自然语言材料发现需求。");
      return;
    }

    setLoading(true);
    try {
      const result = await createRun({ prompt: trimmed });

      if (result.status === "needs_confirmation") {
        setNotice(
          <Card className="border-amber-200 bg-amber-50 shadow-none">
            <CardContent className="flex items-start gap-2 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                后端需要确认材料猜测结果。猜测值：{result.guess || "暂无数据"}；元素体系：
                {Array.isArray(result.chemical_system) ? result.chemical_system.join("-") : result.chemical_system || "暂无数据"}。
              </div>
            </CardContent>
          </Card>
        );
        await loadRuns(false);
        return;
      }

      if (result.status === "needs_clarification") {
        setNotice(
          <Card className="border-amber-200 bg-amber-50 shadow-none">
            <CardContent className="flex items-start gap-2 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{result.message || "后端需要补充说明，请明确是要生成结构还是查询材料属性。"}</div>
            </CardContent>
          </Card>
        );
        await loadRuns(false);
        return;
      }

      if (result.status === "intent_not_supported") {
        setNotice(
          <Card className="border-red-200 bg-red-50 shadow-none">
            <CardContent className="flex items-start gap-2 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{result.message || "暂不支持该意图，请换成材料生成或材料查询需求。"}</div>
            </CardContent>
          </Card>
        );
        await loadRuns(false);
        return;
      }

      if (!result.run_id) {
        setError("后端未返回运行 ID，无法进入结果页。");
        await loadRuns(false);
        return;
      }

      await loadRuns(false);
      setSelectedRunId(result.run_id);
      setPanelMode("summary");
      setSelectedRunDetail({
        ...result,
        run_id: result.run_id,
      } as RunRecord);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setError("未找到该运行记录。");
        } else if (err.code === "network") {
          setError(`无法连接后端服务 ${API_BASE}，请先启动 FastAPI。可能是后端未开启 CORS。请在 FastAPI 中允许 http://localhost:3000 访问。`);
        } else {
          setError(err.message || "提交任务失败。");
        }
      } else {
        setError("提交任务失败。");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen bg-[radial-gradient(circle_at_top,_rgba(225,244,255,0.94),_rgba(239,248,243,0.88)_32%,_#f5f7fb_72%)] text-slate-950">
      <aside className="flex w-full max-w-[360px] shrink-0 flex-col border-r border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,252,255,0.98),rgba(240,247,244,0.94))] text-slate-900">
        <div className="border-b border-slate-200 px-6 py-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#d8f3ff,#92d9c7)] text-slate-950 shadow-[0_16px_36px_rgba(82,182,154,0.18)]">
              <Orbit className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{BRAND_NAME}</h1>
              <p className="text-xs tracking-[0.22em] text-teal-700/70">{BRAND_TAGLINE}</p>
            </div>
          </div>

          <p className="mb-5 text-sm leading-6 text-slate-600">
            汇集参考材料检索、候选结构生成、性能评估与报告输出，展示完整的材料生成流程。
          </p>

          <Button
            size="lg"
            className="w-full justify-center rounded-2xl bg-slate-900 text-white hover:bg-slate-800"
            onClick={handleNewTask}
          >
            <Plus className="h-5 w-5" />
            发起生成任务
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {runsLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              正在加载任务列表
            </div>
          ) : runs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400">
                <Layers3 className="h-8 w-8" />
              </div>
              <p className="text-sm font-medium text-slate-800">等待载入分析任务</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">任务启动后，这里会展示历史分析记录，便于回看不同材料体系的结果。</p>
            </div>
          ) : (
            <div className="space-y-5">
              {groupedRuns.map((group) => (
                <div key={group.label}>
                  <p className="px-2 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500/90">
                    {group.label}
                  </p>
                  <div className="space-y-2">
                    {group.runs.map((run) => {
                      const active = selectedRunId === run.run_id && panelMode === "summary";
                      const runStatus = String(run.status || "");
                      const isRunning = runStatus.toLowerCase() === "running";
                      return (
                        <button
                          key={run.run_id}
                          type="button"
                          onClick={() => handleSelectRun(run.run_id)}
                          className={cn(
                            "group w-full rounded-2xl border px-4 py-3 text-left transition",
                            active
                              ? "border-teal-300/80 bg-teal-50 text-slate-900 shadow-[0_14px_30px_rgba(20,184,166,0.12)]"
                              : "border-slate-200 bg-white/88 text-slate-700 hover:border-slate-300 hover:bg-white",
                            isRunning && "border-sky-300/60 bg-sky-50/70"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                "mt-1 h-2.5 w-2.5 rounded-full",
                                isRunning && "animate-pulse shadow-[0_0_0_6px_rgba(56,189,248,0.12)]",
                                runStatus.toLowerCase() === "completed" && "bg-emerald-300",
                                runStatus.toLowerCase() === "running" && "bg-sky-300",
                                runStatus.toLowerCase() === "failed" && "bg-rose-300",
                                !["completed", "running", "failed"].includes(runStatus.toLowerCase()) && "bg-amber-300"
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <p className="truncate text-sm font-medium">{buildRunTitle(run)}</p>
                                <div className="flex shrink-0 items-center gap-2">
                                  {isRunning ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">
                                      <CircleDashed className="h-3 w-3 animate-spin" />
                                      运行中
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <p className="mt-1 text-xs leading-5 text-slate-500">{truncate(run.prompt || "未记录提示词", 52)}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                <span>参考 {run.reference_material_count ?? 0}</span>
                                <span>候选 {run.candidate_count ?? 0}</span>
                                {run.generation_mode ? <span>{run.generation_mode}</span> : null}
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                                <span>{formatRunTime(run.updated_at || run.created_at)}</span>
                                <span>{humanizeStatus(runStatus)}</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-white/70 px-6 py-4 text-xs text-slate-500">
          <div className="flex items-center justify-between">
            <span>{runs.length} 个分析任务</span>
            <span>结果时间线</span>
          </div>
          {runsError ? <div className="mt-2 text-amber-700">{runsError}</div> : null}
        </div>
      </aside>

      <section className="min-w-0 flex-1 px-4 py-8 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <motion.section
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="grid gap-8 pt-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-end"
          >
            <div className="space-y-5">
              <Badge tone="blue">{panelMode === "compose" ? "材料生成入口" : "结果速览"}</Badge>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-normal text-slate-950 md:text-6xl">
                  {panelMode === "compose" ? BRAND_NAME : buildRunTitle(selectedRun || {})}
                </h1>
                <p className="text-xl font-medium text-slate-700">
                  {panelMode === "compose"
                    ? "从材料需求出发，完成参考检索、结构生成、评估分析与结果输出。"
                    : "查看当前材料任务的关键结果，并快速进入完整结果页。"}
                </p>
              </div>
              <p className="max-w-2xl text-base leading-8 text-slate-600">
                {panelMode === "compose"
                  ? "面向功能材料、能源材料和晶体结构设计任务，提供材料生成、参考检索与多阶段评估展示。"
                  : selectedRunDetail?.prompt || selectedRun?.prompt || "请选择一个任务查看材料分析结果，或发起新的材料任务。"}
              </p>
            </div>

            <Card className="border-slate-200/80 bg-white/90">
              <CardContent className="grid gap-4 p-5">
                {panelMode === "compose" ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-teal-50">
                        <Compass className="h-5 w-5 text-teal-700" />
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">材料生成链路</div>
                        <div className="text-sm text-slate-500">需求解析 → 参考检索 → 结构生成 → 性能评估 → 结果输出</div>
                      </div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                      你可以直接输入自然语言材料需求发起任务，也可以从左侧切换到已有任务，查看不同体系的结果与流程表现。
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(selectedRunDetail?.status || selectedRun?.status || "unknown")}>
                        {humanizeStatus(selectedRunDetail?.status || selectedRun?.status || "unknown")}
                      </Badge>
                      {(selectedRunDetail?.database_lookup_enabled ?? selectedRun?.database_lookup_enabled) ? (
                        <Badge tone="blue">包含参考材料检索</Badge>
                      ) : (
                        <Badge tone="gray">未执行参考材料检索</Badge>
                      )}
                      {selectedRunRefreshing ? <Badge tone="blue">结果更新中</Badge> : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-md bg-slate-50 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">化学体系</div>
                        <div className="mt-1 text-base font-semibold text-slate-950">
                          {formatChemicalSystem(selectedRunDetail?.chemical_system ?? selectedRun?.chemical_system)}
                        </div>
                      </div>
                      <div className="rounded-md bg-slate-50 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">生成模式</div>
                        <div className="mt-1 text-base font-semibold text-slate-950">
                          {selectedRunDetail?.generation_mode || selectedRun?.generation_mode || "暂无数据"}
                        </div>
                      </div>
                      <div className="rounded-md bg-slate-50 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">参考材料</div>
                        <div className="mt-1 text-2xl font-semibold text-slate-950">
                          {selectedRunDetail?.reference_material_count ?? selectedRun?.reference_material_count ?? 0}
                        </div>
                      </div>
                      <div className="rounded-md bg-slate-50 p-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">候选材料</div>
                        <div className="mt-1 text-2xl font-semibold text-slate-950">
                          {selectedRunDetail?.candidate_count ?? selectedRun?.candidate_count ?? 0}
                        </div>
                      </div>
                    </div>
                    {selectedRun ? (
                      <div className="flex flex-wrap gap-3">
                        <Link href={`/runs/${encodeURIComponent(selectedRun.run_id)}`}>
                          <Button>
                            <ArrowUpRight className="h-4 w-4" />
                            查看完整结果页
                          </Button>
                        </Link>
                        <Button variant="outline" onClick={handleNewTask}>
                          <Plus className="h-4 w-4" />
                          发起新任务
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </motion.section>

          {panelMode === "compose" ? (
            <motion.section
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 }}
              className="space-y-4"
            >
              <PromptBox
                value={prompt}
                loading={loading}
                error={error}
                notice={notice}
                onChange={setPrompt}
                onSubmit={handleSubmit}
              />
              <ExamplePrompts
                onSelect={(examplePrompt) => {
                  setPrompt(examplePrompt);
                }}
              />
            </motion.section>
          ) : (
            <motion.section
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 }}
              className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]"
            >
              <Card className="border-slate-200/80 bg-white/95">
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">输入需求说明</div>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        {selectedRunDetail?.prompt || selectedRun?.prompt || "暂无记录"}
                      </p>
                    </div>
                    {selectedRunDetail && isPollingActive(selectedRunDetail) ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-700">
                        <CircleDashed className="h-3.5 w-3.5 animate-spin" />
                        正在更新分析进度
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">任务编号</div>
                      <div className="mt-1 break-all text-sm font-semibold text-slate-900">{selectedRun?.run_id || "-"}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">结果更新时间</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{formatRunTime(selectedRun?.updated_at || selectedRun?.created_at)}</div>
                    </div>
                  </div>
                  {selectedRunError ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {selectedRunError}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

                <Card className="border-slate-200/80 bg-white/95">
                  <CardContent className="space-y-4 p-6">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <FlaskConical className="h-4 w-4 text-teal-600" />
                    系统能力概览
                    </div>
                  <p className="text-sm leading-7 text-slate-600">
                    这里集中展示当前任务的解析结果、候选结构、参考材料和流程节点，适合用于系统能力讲解与结果展示。
                  </p>
                  <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
                    适合在演示中快速切换不同材料任务，对比系统在检索、生成与评估阶段的综合表现。
                  </div>
                  {selectedRun ? (
                    <Link href={`/runs/${encodeURIComponent(selectedRun.run_id)}`} className="inline-flex">
                      <Button>
                        <ArrowUpRight className="h-4 w-4" />
                        进入完整分析页面
                      </Button>
                    </Link>
                  ) : null}
                </CardContent>
              </Card>

              <div className="lg:col-span-2">
                {selectedRunLoading && !selectedRunDetail ? (
                  <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white/90 px-5 py-10 text-sm text-slate-700">
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    正在载入分析结果
                  </div>
                ) : selectedRunDetail ? (
                  <div className="space-y-5">
                    <DataFlowSummary run={selectedRunDetail} />
                    <ExecutionProgress steps={selectedRunSteps} />
                    <WarningPanel warnings={selectedRunWarnings} alwaysShowEmpty={false} />
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
                      <AgentWorkflowCanvas
                        run={selectedRunDetail}
                        selectedNodeId={selectedPreviewNode?.id}
                        onSelectNode={(node: WorkflowNodeModel) => setSelectedPreviewNodeId(node.id)}
                      />
                      <ToolCallInspector node={selectedPreviewNode} />
                    </div>
                    {hasPreviewReferences || hasPreviewCandidates ? (
                      <div className="grid gap-5">
                        {hasPreviewReferences ? <ReferenceMaterialsTable run={selectedRunDetail} /> : null}
                        {hasPreviewCandidates ? <CandidateTable run={selectedRunDetail} /> : null}
                      </div>
                    ) : (
                      <Card className="border-slate-200/80 bg-white/95">
                        <CardContent className="px-5 py-6 text-sm text-slate-600">
                          当前任务尚未生成可展示的结构化结果；你仍然可以进入完整分析页面查看全部报告与产物。
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center text-sm text-slate-500">
                    暂无可展示的分析结果。
                  </div>
                )}
              </div>
            </motion.section>
          )}
        </div>
      </section>
    </main>
  );
}
