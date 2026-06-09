"use client";

import { Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunRecord } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { normalizeCandidates } from "@/lib/view-model";

interface CandidateTableProps {
  run: RunRecord;
}

export function CandidateTable({ run }: CandidateTableProps) {
  const candidates = normalizeCandidates(run).sort((a, b) => {
    const rankA = typeof a.rank === "number" ? a.rank : Number.MAX_SAFE_INTEGER;
    const rankB = typeof b.rank === "number" ? b.rank : Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });

  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Table2 className="h-4 w-4 text-primary" />
          候选材料
        </CardTitle>
      </CardHeader>
      <CardContent>
        {candidates.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">排名</th>
                  <th className="px-3 py-2 font-medium">化学式 / CIF 路径</th>
                  <th className="px-3 py-2 font-medium">单原子能量</th>
                  <th className="px-3 py-2 font-medium">最大力</th>
                  <th className="px-3 py-2 font-medium">RMS 力</th>
                  <th className="px-3 py-2 font-medium">应力范数</th>
                  <th className="px-3 py-2 font-medium">是否弛豫</th>
                  <th className="px-3 py-2 font-medium">评分</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate, index) => (
                  <tr key={candidate.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-900">{candidate.rank || index + 1}</td>
                    <td className="px-3 py-3">
                      <div className="max-w-[300px]">
                        <div className="font-medium text-slate-900">{candidate.formula || candidate.path || candidate.id}</div>
                        {candidate.path ? <div className="mt-1 truncate text-xs text-slate-500">{candidate.path}</div> : null}
                        {candidate.relaxed_path ? <div className="mt-1 truncate text-xs text-slate-500">{candidate.relaxed_path}</div> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">{formatNumber(candidate.energy_per_atom_ev_relaxed ?? candidate.energy_per_atom_ev ?? candidate.energy_per_atom ?? candidate.formation_energy_per_atom)}</td>
                    <td className="px-3 py-3">{formatNumber(candidate.max_force_ev_per_ang)}</td>
                    <td className="px-3 py-3">{formatNumber(candidate.rms_force_ev_per_ang)}</td>
                    <td className="px-3 py-3">{formatNumber(candidate.stress_norm)}</td>
                    <td className="px-3 py-3">
                      {candidate.relaxed === null || candidate.relaxed === undefined ? (
                        <Badge tone="gray">暂无数据</Badge>
                      ) : candidate.relaxed ? (
                        <Badge tone="green">已弛豫</Badge>
                      ) : (
                        <Badge tone="yellow">未弛豫</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">{formatNumber(candidate.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            暂无结构化候选材料数据，请查看生成报告。
          </div>
        )}
      </CardContent>
    </Card>
  );
}
