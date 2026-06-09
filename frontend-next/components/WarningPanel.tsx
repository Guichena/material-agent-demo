"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { friendlyWarning } from "@/lib/utils";

interface WarningPanelProps {
  warnings?: string[];
  alwaysShowEmpty?: boolean;
}

export function WarningPanel({ warnings = [], alwaysShowEmpty = true }: WarningPanelProps) {
  if (!warnings.length && !alwaysShowEmpty) return null;
  return (
    <Card className="border-amber-200/70 bg-amber-50/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          运行提示
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {warnings.length ? (
          warnings.map((warning, index) => (
            <div key={`${warning}-${index}`} className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700">
              {friendlyWarning(warning)}
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-amber-200 bg-white px-3 py-2 text-sm text-slate-600">
            暂无警告
          </div>
        )}
      </CardContent>
    </Card>
  );
}
