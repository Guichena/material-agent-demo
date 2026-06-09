"use client";

import { Database, Sparkles, Target, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { RunRecord } from "@/lib/types";
import { formatChemicalSystem, formatFormula, formatNumber, humanizeStatus } from "@/lib/utils";
import { buildComparisonSummary, getBestCandidate, getIntentSummary, normalizeCandidates, normalizeReferenceMaterials } from "@/lib/view-model";

interface DataFlowSummaryProps {
  run: RunRecord;
}

function SummaryItem({
  icon: Icon,
  title,
  primary,
  secondary
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  primary: string;
  secondary: string;
}) {
  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </div>
        <div className="text-lg font-semibold text-slate-950">{primary}</div>
        <div className="text-sm leading-6 text-slate-500">{secondary}</div>
      </CardContent>
    </Card>
  );
}

export function DataFlowSummary({ run }: DataFlowSummaryProps) {
  const intent = getIntentSummary(run);
  const refs = normalizeReferenceMaterials(run);
  const candidates = normalizeCandidates(run);
  const best = getBestCandidate(run);
  const comparison = buildComparisonSummary(run);

  return (
    <div className="grid gap-4 xl:grid-cols-4">
      <SummaryItem
        icon={Target}
        title="目标材料识别"
        primary={formatFormula(run.parsed_formula) !== "暂无数据" ? formatFormula(run.parsed_formula) : intent.materialName}
        secondary={`${formatChemicalSystem(run.chemical_system)} · ${intent.intent}`}
      />
      <SummaryItem
        icon={Database}
        title="参考材料检索"
        primary={refs.length > 0 ? `${refs.length} 个` : "暂无数据"}
        secondary={run.database_lookup_enabled ? `检索状态：${comparison.databaseStatus || humanizeStatus(run.status)}` : "当前任务未执行参考材料检索"}
      />
      <SummaryItem
        icon={Sparkles}
        title="候选结构生成"
        primary={candidates.length > 0 ? `${candidates.length} 个` : "暂无数据"}
        secondary={run.generation_mode ? `生成策略：${run.generation_mode}` : "等待候选结构生成"}
      />
      <SummaryItem
        icon={Trophy}
        title="优选候选结果"
        primary={
          best
            ? `${formatNumber(best.score ?? best.energy_per_atom ?? best.energy_per_atom_ev_relaxed)}`
            : "暂无数据"
        }
        secondary={
          best
            ? `能量：${formatNumber(best.energy_per_atom_ev_relaxed ?? best.energy_per_atom)} · ${best.relaxed ? "已弛豫" : "未标注弛豫"}`
            : "等待排序结果"
        }
      />
    </div>
  );
}
