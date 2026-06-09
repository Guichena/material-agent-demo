"use client";

import { Database, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunRecord } from "@/lib/types";
import { asBoolean, asNumber, formatNumber, asObject, asString } from "@/lib/utils";
import { extractWarnings, normalizeReferenceMaterials } from "@/lib/view-model";

interface ReferenceMaterialsTableProps {
  run: RunRecord;
}

export function ReferenceMaterialsTable({ run }: ReferenceMaterialsTableProps) {
  const materials = normalizeReferenceMaterials(run);
  const warnings = extractWarnings(run);
  const dbStatus = asString(asObject(run.database_lookup_status)?.status || run.database_lookup_status);
  const emptyMessage =
    dbStatus === "failed" || warnings.some((warning) => warning.includes("MP_API_KEY"))
      ? warnings.find((warning) => warning.includes("MP_API_KEY")) || "数据库检索失败，暂无参考材料数据。"
      : "暂无参考材料数据。";

  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-primary" />
          参考材料
        </CardTitle>
      </CardHeader>
      <CardContent>
        {materials.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">材料 ID</th>
                  <th className="px-3 py-2 font-medium">化学式</th>
                  <th className="px-3 py-2 font-medium">带隙</th>
                  <th className="px-3 py-2 font-medium">形成能 / 原子</th>
                  <th className="px-3 py-2 font-medium">凸包能</th>
                  <th className="px-3 py-2 font-medium">是否稳定</th>
                  <th className="px-3 py-2 font-medium">密度</th>
                  <th className="px-3 py-2 font-medium">体积</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((material) => {
                  const stable = asBoolean(material.is_stable ?? material.stable);
                  return (
                    <tr key={material.material_id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-3 font-medium text-slate-900">{material.material_id}</td>
                      <td className="px-3 py-3">{material.formula}</td>
                      <td className="px-3 py-3">{formatNumber(material.band_gap ?? material.band_gap_ev)}</td>
                      <td className="px-3 py-3">{formatNumber(material.formation_energy_per_atom)}</td>
                      <td className="px-3 py-3">{formatNumber(material.e_above_hull ?? material.energy_above_hull)}</td>
                      <td className="px-3 py-3">
                        {stable === null ? <Badge tone="gray">暂无数据</Badge> : stable ? <Badge tone="green">稳定</Badge> : <Badge tone="yellow">未稳定</Badge>}
                      </td>
                      <td className="px-3 py-3">{formatNumber(material.density)}</td>
                      <td className="px-3 py-3">{formatNumber(material.volume)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>{emptyMessage}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
