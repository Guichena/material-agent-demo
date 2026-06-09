"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunRecord } from "@/lib/types";
import { formatChemicalSystem, formatFormula, formatPercent, humanizeStatus } from "@/lib/utils";
import { getIntentSummary } from "@/lib/view-model";
import { FileSearch, FlaskConical, Info, Sigma, WandSparkles } from "lucide-react";

interface IntentCardProps {
  run: RunRecord;
}

export function IntentCard({ run }: IntentCardProps) {
  const intent = getIntentSummary(run);
  const hasStructured = Boolean(run.parsed_formula || run.material_name || run.chemical_system || run.generation_mode);

  return (
    <Card className="h-full border-slate-200/80 bg-white/95">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <WandSparkles className="h-4 w-4 text-primary" />
          智能语义解析结果
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasStructured ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            当前任务尚未返回结构化解析结果，系统将优先展示后续分析产物。
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-slate-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <FileSearch className="h-3.5 w-3.5" />
              意图
            </div>
            <div className="text-sm font-medium text-slate-900">{intent.intent}</div>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <Sigma className="h-3.5 w-3.5" />
              解析化学式
            </div>
            <div className="text-sm font-medium text-slate-900">{formatFormula(intent.formula)}</div>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <FlaskConical className="h-3.5 w-3.5" />
              材料名称
            </div>
            <div className="text-sm font-medium text-slate-900">{intent.materialName}</div>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <Info className="h-3.5 w-3.5" />
              元素体系
            </div>
            <div className="text-sm font-medium text-slate-900">{formatChemicalSystem(run.chemical_system)}</div>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <WandSparkles className="h-3.5 w-3.5" />
              生成模式
            </div>
            <div className="text-sm font-medium text-slate-900">{intent.generationMode}</div>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <Badge tone="gray" className="h-5 px-1.5 text-[11px]">
                计量
              </Badge>
            </div>
            <div className="text-sm font-medium text-slate-900">
              {run.strict_stoichiometry === undefined || run.strict_stoichiometry === null
                ? "暂无数据"
                : run.strict_stoichiometry
                  ? "严格化学计量"
                  : "非严格化学计量"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={run.database_lookup_enabled ? "green" : "gray"}>
            参考检索：{run.database_lookup_enabled ? "已执行" : "未执行"}
          </Badge>
          <Badge tone={intent.databaseStatus === "已完成" ? "green" : "yellow"}>
            检索状态：{intent.databaseStatus || "暂无数据"}
          </Badge>
          {typeof intent.confidence === "number" ? (
            <Badge tone="blue">解析置信度：{formatPercent(intent.confidence)}</Badge>
          ) : null}
        </div>
        {intent.reason ? <p className="text-sm leading-6 text-slate-600">{intent.reason}</p> : null}
        <div className="text-xs text-slate-500">当前分析状态：{humanizeStatus(run.status)}</div>
      </CardContent>
    </Card>
  );
}
