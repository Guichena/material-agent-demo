"use client";

import { RefreshCw, FileText, FileBadge2, CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BRAND_RESULTS_TITLE } from "@/lib/brand";
import type { RunRecord } from "@/lib/types";
import { humanizeStatus, statusTone } from "@/lib/utils";

interface RunStatusHeaderProps {
  run: RunRecord;
  onRefresh: () => void;
  refreshing?: boolean;
}

export function RunStatusHeader({ run, onRefresh, refreshing }: RunStatusHeaderProps) {
  const status = run.status || "unknown";
  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{BRAND_RESULTS_TITLE}</h1>
            <Badge tone={statusTone(status)}>{humanizeStatus(status)}</Badge>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            <span>
              <span className="font-medium text-slate-900">任务编号：</span>
              <code className="rounded bg-slate-100 px-1.5 py-0.5">{run.run_id}</code>
            </span>
            {run.report_path ? (
              <span className="flex items-center gap-1">
                <FileText className="h-4 w-4 text-primary" />
                <span className="font-medium text-slate-900">分析报告：</span>
                <code className="rounded bg-slate-100 px-1.5 py-0.5">{run.report_path}</code>
              </span>
            ) : null}
            {run.report_pdf_path ? (
              <span className="flex items-center gap-1">
                <FileBadge2 className="h-4 w-4 text-teal-600" />
                <span className="font-medium text-slate-900">PDF 报告：</span>
                <code className="rounded bg-slate-100 px-1.5 py-0.5">{run.report_pdf_path}</code>
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? <CircleDashed className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            更新结果
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
