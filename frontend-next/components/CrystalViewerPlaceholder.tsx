"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Atom,
  Box,
  ExternalLink,
  FileCode2,
  Layers3,
  Landmark,
  Maximize2,
  Sparkles,
  Zap
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";
import type { RunRecord } from "@/lib/types";
import { normalizeCandidates } from "@/lib/view-model";
import { cn, formatNumber, truncate } from "@/lib/utils";

interface CrystalViewerPlaceholderProps {
  run: RunRecord;
}

function encodePath(pathname: string) {
  return pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function inferSourceRunId(run: RunRecord) {
  if (typeof run.source_run_id === "string" && run.source_run_id.trim()) {
    return run.source_run_id.trim();
  }
  const reportPath = typeof run.report_path === "string" ? run.report_path : "";
  const match = reportPath.match(/report_([A-Za-z0-9_-]+)\.md$/);
  return match?.[1] || run.run_id;
}

function buildStructureViewerUrl(run: RunRecord) {
  const sourceRunId = inferSourceRunId(run);
  if (!sourceRunId || !run.report_path) return "";
  const assetPath = encodePath(`structures_${sourceRunId}.html`);
  return `${API_BASE.replace(/\/$/, "")}/runs/${encodeURIComponent(run.run_id)}/assets/${assetPath}`;
}

function targetOriginFor(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return "*";
  }
}

export function CrystalViewerPlaceholder({ run }: CrystalViewerPlaceholderProps) {
  const candidates = useMemo(() => normalizeCandidates(run).sort((a, b) => {
    const rankA = typeof a.rank === "number" ? a.rank : Number.MAX_SAFE_INTEGER;
    const rankB = typeof b.rank === "number" ? b.rank : Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  }), [run]);
  const viewerUrl = useMemo(() => buildStructureViewerUrl(run), [run]);
  const [selectedId, setSelectedId] = useState("");
  const [viewerFailed, setViewerFailed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!selectedId && candidates.length) {
      setSelectedId(candidates[0].id);
    }
  }, [candidates, selectedId]);

  useEffect(() => {
    setViewerFailed(false);
  }, [viewerUrl]);

  const selected = candidates.find((candidate) => candidate.id === selectedId) || candidates[0];
  const selectedIndex = selected ? candidates.findIndex((candidate) => candidate.id === selected.id) : -1;
  const viewerOrigin = useMemo(() => targetOriginFor(viewerUrl), [viewerUrl]);
  const syncViewerCandidate = useCallback(() => {
    if (!selected || !viewerUrl || viewerFailed) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "material-agent:set-candidate",
        id: selected.id,
        index: Math.max(0, selectedIndex),
        rank: selected.rank ?? null,
        path: selected.path || null,
        relaxed_path: selected.relaxed_path || null
      },
      viewerOrigin
    );
  }, [selected, selectedIndex, viewerFailed, viewerOrigin, viewerUrl]);

  useEffect(() => {
    syncViewerCandidate();
  }, [syncViewerCandidate]);

  const sourceRunId = inferSourceRunId(run);
  const selectedLabel = selected
    ? `${selected.rank ? `Rank ${selected.rank}` : "候选"} · ${selected.formula || truncate(selected.path || selected.id, 24)}`
    : "晶体结构";
  const selectedEnergy = selected?.energy_per_atom_ev_relaxed ?? selected?.energy_per_atom_ev ?? selected?.energy_per_atom ?? selected?.formation_energy_per_atom ?? null;
  const selectedScore = selected?.score ?? null;
  const selectedForce = selected?.max_force_ev_per_ang ?? null;
  const selectedStress = selected?.stress_norm ?? null;

  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Atom className="h-4 w-4 text-primary" />
          晶体结构
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_380px]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-950 to-slate-900 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue">3D 结构视图</Badge>
                    {selected?.relaxed ? <Badge tone="green">已弛豫</Badge> : null}
                    {selected?.score !== null && selected?.score !== undefined ? <Badge tone="purple">真实评分</Badge> : null}
                  </div>
                  <div className="mt-2 truncate text-sm font-medium text-slate-50">{selectedLabel}</div>
                  <div className="text-xs text-slate-400">
                    来源运行 {sourceRunId} · 交互式查看器优先，文本为备用
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {viewerUrl ? (
                    <a href={viewerUrl} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm" type="button">
                        <ExternalLink className="h-4 w-4" />
                        新窗口打开
                      </Button>
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="relative overflow-hidden">
                {viewerUrl && !viewerFailed ? (
                  <iframe
                    ref={iframeRef}
                    src={viewerUrl}
                    title="晶体结构 3D 查看器"
                    className="h-[720px] w-full bg-slate-950"
                    onLoad={syncViewerCandidate}
                    onError={() => setViewerFailed(true)}
                  />
                ) : (
                  <div className="flex h-[720px] items-center justify-center px-6 text-center">
                    <div className="max-w-md space-y-3">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300">
                        <Box className="h-5 w-5" />
                      </div>
                      <div className="text-sm font-medium text-slate-100">暂无 3D 结构查看器</div>
                      <div className="text-sm leading-6 text-slate-400">
                        但当前候选仍保留 CIF 文本和路径，可以继续查看结构数据。
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile icon={Sparkles} label="候选数" value={candidates.length ? String(candidates.length) : "暂无"} />
              <MetricTile icon={Layers3} label="源运行" value={sourceRunId || "暂无"} />
              <MetricTile icon={Zap} label="单原子能量" value={formatNumber(selectedEnergy)} />
              <MetricTile icon={Landmark} label="评分" value={formatNumber(selectedScore)} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileCode2 className="h-4 w-4 text-primary" />
                候选列表
              </div>
              <div className="mt-3 space-y-2">
                {candidates.length ? (
                  candidates.map((candidate, index) => {
                    const active = candidate.id === selected?.id;
                    const energy = candidate.energy_per_atom_ev_relaxed ?? candidate.energy_per_atom_ev ?? candidate.energy_per_atom ?? candidate.formation_energy_per_atom;
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => setSelectedId(candidate.id)}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left transition",
                          active
                            ? "border-primary/30 bg-sky-50 shadow-sm"
                            : "border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-white"
                        )}
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-700 shadow-sm">
                              {candidate.rank || index + 1}
                            </span>
                            <span className="truncate text-sm font-medium text-slate-900">
                              {candidate.formula || truncate(candidate.path || candidate.id, 24)}
                            </span>
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {candidate.relaxed ? "已弛豫" : "未弛豫"} · {formatNumber(energy)} eV/atom
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-slate-500">
                          <div>{formatNumber(candidate.score)}</div>
                          <div>score</div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">
                    暂无候选结构可切换。
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileCode2 className="h-4 w-4 text-primary" />
                结构信息
              </div>
              <div className="mt-3 space-y-3 text-sm">
                <InfoLine label="化学式" value={selected?.formula || "暂无数据"} />
                <InfoLine label="CIF 路径" value={selected?.relaxed_path || selected?.path || "暂无数据"} mono />
                <InfoLine label="最大力" value={formatNumber(selectedForce)} />
                <InfoLine label="应力范数" value={formatNumber(selectedStress)} />
              </div>

              {selected?.cif_text ? (
                <div className="mt-4 space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">CIF 文本</div>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                    {selected.cif_text}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </div>
      <div className="mt-2 truncate text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function InfoLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("min-w-0 break-words text-sm text-slate-800", mono && "font-mono text-xs")}>
        {value}
      </div>
    </div>
  );
}
