"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CircleHelp,
  LoaderCircle,
  Sparkles,
  Trophy,
  XCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ProgressStepModel } from "@/lib/types";
import { formatDuration, statusTone } from "@/lib/utils";

interface ExecutionProgressProps {
  steps: ProgressStepModel[];
}

function StatusIcon({ status }: { status: ProgressStepModel["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "running":
      return <LoaderCircle className="h-4 w-4 animate-spin text-sky-600" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-600" />;
    case "demo":
      return <Sparkles className="h-4 w-4 text-violet-600" />;
    case "skipped":
      return <Clock3 className="h-4 w-4 text-slate-400" />;
    default:
      return <CircleHelp className="h-4 w-4 text-slate-400" />;
  }
}

export function ExecutionProgress({ steps }: ExecutionProgressProps) {
  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">执行进度</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="min-w-[920px]">
          <div className="flex items-stretch gap-2">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center gap-2">
                <div className="w-[148px] rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={step.status} />
                      <div className="text-sm font-medium text-slate-900">{step.title}</div>
                    </div>
                    <Badge tone={statusTone(step.status)}>{step.status === "running" ? "进行中" : step.status === "completed" || step.status === "demo" ? "已完成" : step.status === "warning" ? "警告" : step.status === "failed" ? "失败" : step.status === "skipped" ? "跳过" : "未知"}</Badge>
                  </div>
                  <div className="mt-3 text-xs leading-5 text-slate-600">{step.summary || "暂无说明"}</div>
                  <div className="mt-2 text-[11px] text-slate-500">{formatDuration(step.durationMs)}</div>
                </div>
                {index < steps.length - 1 ? <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" /> : null}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
