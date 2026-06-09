"use client";

import { BarChart3 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartSeriesItem } from "@/lib/types";
import { formatNumber, truncate } from "@/lib/utils";

interface EnergyChartProps {
  title: string;
  data: ChartSeriesItem[];
  color?: string;
  valueLabel?: string;
  emptyText?: string;
}

export function EnergyChart({
  title,
  data,
  color = "#0ea5e9",
  valueLabel = "数值",
  emptyText = "暂无足够的结构化数据用于绘图。"
}: EnergyChartProps) {
  const validData = data
    .filter((item) => typeof item.value === "number" && Number.isFinite(item.value))
    .map((item, index) => ({
      ...item,
      shortName: truncate(item.name || `候选 ${index + 1}`, 18)
    }));

  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {validData.length ? (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={validData} margin={{ top: 8, right: 20, left: 0, bottom: 42 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="shortName" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, _name, item) => {
                    const rawValue = (item as { payload?: ChartSeriesItem })?.payload?.rawValue;
                    const displayValue =
                      typeof rawValue === "number"
                        ? `${formatNumber(value)}；真实能量 ${formatNumber(rawValue)}`
                        : formatNumber(value);
                    return [displayValue, valueLabel];
                  }}
                  labelFormatter={(label) => `候选：${label}`}
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#e2e8f0",
                    boxShadow: "0 10px 30px rgba(15,23,42,0.08)"
                  }}
                />
                <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            {emptyText}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
