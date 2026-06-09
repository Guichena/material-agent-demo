"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, BarChart3, Database, FileText, LayoutDashboard, LoaderCircle, TriangleAlert } from "lucide-react";
import { AgentWorkflowCanvas } from "@/components/AgentWorkflowCanvas";
import { CandidateTable } from "@/components/CandidateTable";
import { CrystalViewerPlaceholder } from "@/components/CrystalViewerPlaceholder";
import { DataFlowSummary } from "@/components/DataFlowSummary";
import { EnergyChart } from "@/components/EnergyChart";
import { ExecutionProgress } from "@/components/ExecutionProgress";
import { IntentCard } from "@/components/IntentCard";
import { ReferenceMaterialsTable } from "@/components/ReferenceMaterialsTable";
import { ReportPanel } from "@/components/ReportPanel";
import { RunStatusHeader } from "@/components/RunStatusHeader";
import { ToolCallInspector } from "@/components/ToolCallInspector";
import { WarningPanel } from "@/components/WarningPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API_BASE, ApiError, getRun } from "@/lib/api";
import { BRAND_NAME } from "@/lib/brand";
import type { RunRecord } from "@/lib/types";
import { buildComparisonSummary, buildEnergySeries, buildExecutionSteps, buildForceSeries, buildScoreSeries, buildWorkflowNodes, extractWarnings, isPollingActive } from "@/lib/view-model";

function buildRunPageTitle(run: RunRecord | null, runId: string) {
  const label =
    run?.parsed_formula ||
    run?.material_name ||
    (Array.isArray(run?.chemical_system) && run.chemical_system.length ? run.chemical_system.join("-") : "") ||
    runId;
  return `${label} | ${BRAND_NAME}`;
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <Link href="/">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Button>
        </Link>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-start gap-2 p-5 text-sm text-red-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function RunDetailPage() {
  const params = useParams<{ runId: string }>();
  const runId = decodeURIComponent(params.runId);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState("intent");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadRun = useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      setError("");
      try {
        const result = await getRun(runId);
        setRun(result);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setError("未找到该运行记录。");
        } else if (err instanceof ApiError && err.code === "network") {
          setError(`无法连接后端服务 ${API_BASE}，请先启动 FastAPI。可能是后端未开启 CORS。请在 FastAPI 中允许 http://localhost:3000 访问。`);
        } else if (err instanceof ApiError) {
          setError(err.message || "获取运行状态失败。");
        } else {
          setError("获取运行状态失败。");
        }
      } finally {
        setLoading(false);
        if (manual) setRefreshing(false);
      }
    },
    [runId]
  );

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  useEffect(() => {
    document.title = buildRunPageTitle(run, runId);
  }, [run, runId]);

  useEffect(() => {
    if (!isPollingActive(run)) return;
    const timer = window.setInterval(() => {
      void loadRun(false);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [loadRun, run]);

  const nodes = useMemo(() => (run ? buildWorkflowNodes(run) : []), [run]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || nodes[1] || nodes[0] || null;
  const steps = useMemo(() => (run ? buildExecutionSteps(run) : []), [run]);
  const warnings = useMemo(() => (run ? extractWarnings(run) : []), [run]);
  const energyData = useMemo(() => (run ? buildEnergySeries(run) : []), [run]);
  const scoreData = useMemo(() => (run ? buildScoreSeries(run) : []), [run]);
  const forceData = useMemo(() => (run ? buildForceSeries(run) : []), [run]);
  const comparison = useMemo(() => (run ? buildComparisonSummary(run) : null), [run]);
  const hasReferences = (comparison?.referenceCount ?? 0) > 0;
  const hasCandidates = (comparison?.candidateCount ?? 0) > 0;
  const hasEnergyData = energyData.some((item) => typeof item.value === "number" && Number.isFinite(item.value));
  const hasScoreData = scoreData.some((item) => typeof item.value === "number" && Number.isFinite(item.value));
  const hasForceData = forceData.some((item) => typeof item.value === "number" && Number.isFinite(item.value));
  const hasCharts = hasCandidates && (hasEnergyData || hasScoreData || hasForceData);

  if (loading && !run) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 shadow-soft">
          <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
          正在加载运行状态……
        </div>
      </main>
    );
  }

  if (error && !run) {
    return <ErrorState message={error} />;
  }

  if (!run) {
    return <ErrorState message="未找到该运行记录。" />;
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              返回首页
            </Button>
          </Link>
          {error ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</div> : null}
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <RunStatusHeader run={run} onRefresh={() => void loadRun(true)} refreshing={refreshing} />
        </motion.div>

        <DataFlowSummary run={run} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <AgentWorkflowCanvas run={run} selectedNodeId={selectedNode?.id} onSelectNode={(node) => setSelectedNodeId(node.id)} />
          <ToolCallInspector node={selectedNode} />
        </div>

        <ExecutionProgress steps={steps} />
        <WarningPanel warnings={warnings} />

        <Tabs defaultValue="overview" className="pb-10">
          <TabsList>
            <TabsTrigger value="overview">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              总览
            </TabsTrigger>
            {hasReferences ? (
              <TabsTrigger value="references">
                <Database className="mr-2 h-4 w-4" />
                参考材料
              </TabsTrigger>
            ) : null}
            {hasCandidates ? <TabsTrigger value="candidates">候选材料</TabsTrigger> : null}
            {hasCharts ? (
              <TabsTrigger value="charts">
                <BarChart3 className="mr-2 h-4 w-4" />
                图表分析
              </TabsTrigger>
            ) : null}
            {hasCandidates ? <TabsTrigger value="crystal">晶体结构</TabsTrigger> : null}
            <TabsTrigger value="report">
              <FileText className="mr-2 h-4 w-4" />
              生成报告
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
              <IntentCard run={run} />
              <Card className="border-slate-200/80 bg-white/95">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">数据流摘要</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">参考材料</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-950">{comparison?.referenceCount ?? 0}</div>
                    <div className="mt-1 text-sm text-slate-600">Materials Project 检索结果</div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">生成候选</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-950">{comparison?.candidateCount ?? 0}</div>
                    <div className="mt-1 text-sm text-slate-600">结构化候选材料数量</div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">数据库状态</div>
                    <div className="mt-1 text-lg font-semibold text-slate-950">{comparison?.databaseStatus || "暂无数据"}</div>
                    <div className="mt-1 text-sm text-slate-600">缺失字段时会自动降级</div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">生成模式</div>
                    <div className="mt-1 text-lg font-semibold text-slate-950">{comparison?.generationMode || "暂无数据"}</div>
                    <div className="mt-1 text-sm text-slate-600">由后端根据自然语言推断</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {hasReferences ? (
            <TabsContent value="references">
              <ReferenceMaterialsTable run={run} />
            </TabsContent>
          ) : null}

          {hasCandidates ? (
            <TabsContent value="candidates">
              <CandidateTable run={run} />
            </TabsContent>
          ) : null}

          {hasCharts ? (
            <TabsContent value="charts">
              <div className="grid gap-5 xl:grid-cols-2">
                {hasEnergyData ? <EnergyChart title="候选材料低能量排序" data={energyData} valueLabel="低能量得分" /> : null}
                {hasScoreData ? <EnergyChart title="候选材料评分对比" data={scoreData} color="#14b8a6" valueLabel="评分" /> : null}
                {hasForceData ? <EnergyChart title="候选材料最大力对比" data={forceData} color="#f59e0b" valueLabel="最大力" /> : null}
                <Card className="border-slate-200/80 bg-white/95">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">参考材料与生成候选对比</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md bg-slate-50 p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">参考材料</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-950">{comparison?.referenceCount ?? 0}</div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">生成候选</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-950">{comparison?.candidateCount ?? 0}</div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-4 sm:col-span-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">说明</div>
                      <div className="mt-2 text-sm leading-6 text-slate-600">
                        当前图表只使用后端返回的真实候选材料数值。
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          ) : null}

          {hasCandidates ? (
            <TabsContent value="crystal">
              <CrystalViewerPlaceholder run={run} />
            </TabsContent>
          ) : null}

          <TabsContent value="report">
            <ReportPanel
              runId={run.run_id}
              reportPath={run.report_path}
              reportPdfPath={run.report_pdf_path}
              status={run.status}
            />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
