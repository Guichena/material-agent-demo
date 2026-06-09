"use client";

import {
  AlertTriangle,
  ArrowRight,
  Database,
  FileText,
  Gauge,
  MessageSquare,
  Search,
  Sparkles,
  Trophy,
  LoaderCircle,
  Box
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WorkflowNodeModel } from "@/lib/types";
import { statusTone } from "@/lib/utils";

interface WorkflowNodeCardProps {
  node: WorkflowNodeModel;
  selected?: boolean;
  onClick?: () => void;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  MessageSquareText: MessageSquare,
  ScanText: Search,
  DatabaseZap: Database,
  Sparkles,
  Gauge,
  Trophy,
  FileText,
  Box
};

function StatusLabel({ status }: { status: WorkflowNodeModel["status"] }) {
  switch (status) {
    case "completed":
      return "已完成";
    case "running":
      return "运行中";
    case "warning":
      return "警告";
    case "failed":
      return "失败";
    case "skipped":
      return "已跳过";
    case "demo":
      return "已完成";
    default:
      return "未知";
  }
}

export function WorkflowNodeCard({ node, selected, onClick }: WorkflowNodeCardProps) {
  const Icon = ICON_MAP[node.icon] || Box;
  const tone =
    node.status === "running"
      ? "blue"
      : node.status === "completed" || node.status === "demo"
        ? "green"
        : node.status === "warning"
          ? "yellow"
          : node.status === "failed"
            ? "red"
            : "gray";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative h-full min-h-[190px] w-full min-w-0 rounded-lg border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        node.status === "running" && "animate-pulse border-sky-200 bg-sky-50/50",
        (node.status === "completed" || node.status === "demo") && "border-emerald-200 bg-emerald-50/40",
        node.status === "warning" && "border-amber-200 bg-amber-50/40",
        node.status === "failed" && "border-red-200 bg-red-50/40",
        selected && "ring-2 ring-primary ring-offset-1"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white shadow-sm">
            <Icon className="h-4 w-4 text-primary" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{node.title}</div>
            <div className="break-words text-[11px] text-slate-500">{node.toolName}</div>
          </div>
        </div>
        <Badge tone={tone}>{StatusLabel({ status: node.status })}</Badge>
      </div>
      <div className="mt-3 space-y-2">
        <div className="break-words text-xs leading-5 text-slate-600">
          <span className="font-medium text-slate-800">输入：</span>
          {node.inputSummary || "暂无数据"}
        </div>
        <div className="break-words text-xs leading-5 text-slate-600">
          <span className="font-medium text-slate-800">输出：</span>
          {node.outputSummary || "暂无数据"}
        </div>
      </div>
      {node.warning ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-white px-2.5 py-2 text-[11px] text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{node.warning}</span>
        </div>
      ) : null}
      {node.durationMs ? <div className="mt-3 text-[11px] text-slate-500">{node.durationMs} ms</div> : null}
      {node.status === "running" ? <div className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-sky-500 shadow-[0_0_0_4px_rgba(14,165,233,0.12)]" /> : null}
    </button>
  );
}
