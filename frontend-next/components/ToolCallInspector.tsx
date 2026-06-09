"use client";

import { Copy, FileText, Info, TimerReset, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkflowNodeModel } from "@/lib/types";
import { formatDuration, humanizeStatus, safeJson, statusTone } from "@/lib/utils";

interface ToolCallInspectorProps {
  node?: WorkflowNodeModel | null;
}

async function copyText(text: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
}

export function ToolCallInspector({ node }: ToolCallInspectorProps) {
  if (!node) {
    return (
      <Card className="h-full border-slate-200/80 bg-white/95">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">工具调用详情</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">点击左侧工作流节点查看输入、输出和解释。</CardContent>
      </Card>
    );
  }

  const inputText = safeJson(node.inputs || {});
  const outputText = safeJson(node.outputs || {});

  return (
    <Card className="h-full border-slate-200/80 bg-white/95">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            工具调用详情
          </span>
          <Badge tone={statusTone(node.status)}>{humanizeStatus(node.status)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            <Info className="h-3.5 w-3.5" />
            工具名称
          </div>
          <div className="mt-1 text-sm font-medium text-slate-900">{node.toolName}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-slate-50 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">输入参数</div>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-white p-3 text-xs leading-5 text-slate-700">
              {inputText}
            </pre>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">输出结果</div>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-white p-3 text-xs leading-5 text-slate-700">
              {outputText}
            </pre>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <TimerReset className="h-3.5 w-3.5" />
              耗时
            </div>
            <div className="mt-1 font-medium text-slate-900">{formatDuration(node.durationMs)}</div>
          </div>
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <TriangleAlert className="h-3.5 w-3.5" />
              状态说明
            </div>
            <div className="mt-1 font-medium text-slate-900">{node.warning || node.error || "暂无异常"}</div>
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">中文解释</div>
          <p className="text-sm leading-6 text-slate-700">{node.explanation || "暂无说明"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await copyText(inputText);
            }}
          >
            <Copy className="h-4 w-4" />
            复制输入
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await copyText(outputText);
            }}
          >
            <Copy className="h-4 w-4" />
            复制输出
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
