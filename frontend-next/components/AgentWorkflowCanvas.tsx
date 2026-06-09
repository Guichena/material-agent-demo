"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Workflow } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunRecord, WorkflowNodeModel } from "@/lib/types";
import { buildWorkflowNodes } from "@/lib/view-model";
import { WorkflowNodeCard } from "@/components/WorkflowNodeCard";

interface AgentWorkflowCanvasProps {
  run: RunRecord;
  selectedNodeId?: string;
  onSelectNode: (node: WorkflowNodeModel) => void;
}

interface CanvasEdge {
  id: string;
  path: string;
}

function chunkNodes(nodes: WorkflowNodeModel[], size: number) {
  const rows: WorkflowNodeModel[][] = [];
  for (let index = 0; index < nodes.length; index += size) {
    rows.push(nodes.slice(index, index + size));
  }
  return rows;
}

export function AgentWorkflowCanvas({ run, selectedNodeId, onSelectNode }: AgentWorkflowCanvasProps) {
  const nodes = useMemo(() => buildWorkflowNodes(run), [run]);
  const hasStructured = Boolean(run.ai_plan && Array.isArray(run.ai_plan) && run.ai_plan.length) || Boolean(run.route_steps && Array.isArray(run.route_steps) && run.route_steps.length);
  const rows = useMemo(() => chunkNodes(nodes, 3), [nodes]);
  const visualRows = useMemo(
    () =>
      rows.map((row, index) =>
        index % 2 === 1 ? [...row].reverse() : row
      ),
    [rows]
  );
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const [edges, setEdges] = useState<CanvasEdge[]>([]);

  const setNodeRef = useCallback(
    (nodeId: string) => (element: HTMLDivElement | null) => {
      if (element) {
        nodeRefs.current.set(nodeId, element);
      } else {
        nodeRefs.current.delete(nodeId);
      }
    },
    []
  );

  const updateEdges = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length < 2) {
      setEdges([]);
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const nextEdges: CanvasEdge[] = [];

    for (let index = 0; index < nodes.length - 1; index += 1) {
      const from = nodeRefs.current.get(nodes[index].id);
      const to = nodeRefs.current.get(nodes[index + 1].id);
      if (!from || !to) continue;

      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();
      const fromCenterY = fromRect.top - canvasRect.top + fromRect.height / 2;
      const toCenterY = toRect.top - canvasRect.top + toRect.height / 2;
      const sameRow = Math.abs(fromCenterY - toCenterY) < Math.min(fromRect.height, toRect.height) * 0.35;

      let path = "";
      if (sameRow) {
        const toRight = toRect.left >= fromRect.left;
        const startX = toRight ? fromRect.right - canvasRect.left + 10 : fromRect.left - canvasRect.left - 10;
        const endX = toRight ? toRect.left - canvasRect.left - 10 : toRect.right - canvasRect.left + 10;
        const startY = fromCenterY;
        const endY = toCenterY;
        const midX = (startX + endX) / 2;
        path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
      } else {
        const startX = fromRect.left - canvasRect.left + fromRect.width / 2;
        const startY = fromRect.bottom - canvasRect.top + 10;
        const endX = toRect.left - canvasRect.left + toRect.width / 2;
        const endY = toRect.top - canvasRect.top - 10;
        const controlOffset = Math.max(24, Math.min(56, Math.abs(endY - startY) * 0.4));
        path = `M ${startX} ${startY} C ${startX} ${startY + controlOffset}, ${endX} ${endY - controlOffset}, ${endX} ${endY}`;
      }

      nextEdges.push({
        id: `${nodes[index].id}-${nodes[index + 1].id}`,
        path
      });
    }

    setEdges(nextEdges);
  }, [nodes]);

  useEffect(() => {
    updateEdges();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(updateEdges);
    observer.observe(canvas);
    nodeRefs.current.forEach((node) => observer.observe(node));
    window.addEventListener("resize", updateEdges);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateEdges);
    };
  }, [nodes, updateEdges]);

  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Workflow className="h-4 w-4 text-primary" />
          智能体流程画布
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasStructured ? (
          <div className="mb-4 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            后端暂未返回结构化流程数据，将展示基础流程视图。
          </div>
        ) : null}
        <div ref={canvasRef} className="relative overflow-hidden rounded-lg border border-slate-100 bg-slate-50/50 p-4">
          <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden="true">
            <defs>
              <marker
                id="workflow-arrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
              </marker>
            </defs>
            {edges.map((edge) => (
              <path
                key={edge.id}
                d={edge.path}
                fill="none"
                stroke="#94a3b8"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.6"
                strokeOpacity="0.75"
                strokeDasharray="4 5"
                markerEnd="url(#workflow-arrow)"
              />
            ))}
          </svg>
          <div className="relative z-10 grid grid-cols-1 gap-x-12 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
            {visualRows.flatMap((row) => row).map((node) => (
              <div key={node.id} ref={setNodeRef(node.id)} className="min-w-0">
                  <WorkflowNodeCard
                    node={node}
                    selected={selectedNodeId === node.id}
                    onClick={() => onSelectNode(node)}
                  />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
