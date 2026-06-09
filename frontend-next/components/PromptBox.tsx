"use client";

import { AlertTriangle, LoaderCircle, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface PromptBoxProps {
  value: string;
  loading?: boolean;
  error?: string;
  notice?: React.ReactNode;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function PromptBox({ value, loading, error, notice, onChange, onSubmit }: PromptBoxProps) {
  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardContent className="space-y-4 p-5">
        <Textarea
          value={value}
          disabled={loading}
          onChange={(event) => onChange(event.target.value)}
          placeholder="请输入材料设计目标，例如：面向钙钛矿氧化物体系生成稳定候选结构，并结合数据库参考与能量评估给出排序结果……"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              onSubmit();
            }
          }}
        />
        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {notice}
        <div className="flex justify-end">
          <Button size="lg" onClick={onSubmit} disabled={loading}>
            {loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
            启动智能分析
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
