import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function asObject(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : null;
}

export function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  return "";
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "1", "yes", "y", "是"].includes(value.toLowerCase())) return true;
    if (["false", "0", "no", "n", "否"].includes(value.toLowerCase())) return false;
  }
  if (typeof value === "number") return value !== 0;
  return null;
}

export function formatNumber(value: unknown, digits = 3): string {
  const num = asNumber(value);
  if (num === null) return "暂无数据";
  return Number.isInteger(num) ? `${num}` : num.toFixed(digits);
}

export function formatPercent(value: unknown, digits = 1): string {
  const num = asNumber(value);
  if (num === null) return "暂无数据";
  return `${(num * 100).toFixed(digits)}%`;
}

export function formatDuration(value: unknown): string {
  const ms = asNumber(value);
  if (ms === null) return "暂无耗时";
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)} s`;
  const min = Math.floor(sec / 60);
  const rest = Math.round(sec % 60);
  return `${min} 分 ${rest} 秒`;
}

export function formatChemicalSystem(value: unknown): string {
  if (Array.isArray(value)) return value.join("-");
  if (typeof value === "string") return value;
  return "暂无数据";
}

export function formatFormula(value: unknown): string {
  const text = asString(value);
  return text || "暂无数据";
}

export function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function safeJson(value: unknown, space = 2): string {
  try {
    return JSON.stringify(value, null, space);
  } catch {
    return String(value);
  }
}

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

export function humanizeStatus(status: string | undefined | null): string {
  switch ((status || "").toLowerCase()) {
    case "running":
      return "运行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "needs_confirmation":
      return "需要确认";
    case "intent_not_supported":
      return "暂不支持该意图";
    case "needs_clarification":
      return "需要补充说明";
    case "initialized":
      return "已初始化";
    case "warning":
      return "警告";
    case "skipped":
      return "已跳过";
    case "demo":
      return "已完成";
    default:
      return "未知状态";
  }
}

export function statusTone(status: string | undefined | null): "green" | "blue" | "yellow" | "red" | "purple" | "gray" {
  switch ((status || "").toLowerCase()) {
    case "completed":
      return "green";
    case "running":
      return "blue";
    case "needs_confirmation":
    case "needs_clarification":
    case "warning":
      return "yellow";
    case "failed":
    case "intent_not_supported":
      return "red";
    case "demo":
      return "green";
    default:
      return "gray";
  }
}

export function friendlyWarning(text: string): string {
  const source = text.trim();
  if (!source) return "暂无警告。";
  const lower = source.toLowerCase();
  if (lower.includes("mp_api_key")) return "MP_API_KEY 未配置，已跳过 Materials Project 检索。";
  if (lower.includes("database")) return "数据库检索未成功，将优先展示后续报告结果。";
  if (lower.includes("demo")) return "当前结果来自已保存运行产物。";
  if (lower.includes("mattergen")) return "MatterGen 运行不可用，当前节点使用降级结果。";
  if (lower.includes("mattersim")) return "MatterSim 运行不可用，当前节点使用降级结果。";
  if (lower.includes("report")) return "报告生成暂时不可用，但已保留运行信息。";
  if (source.length > 120) return `${source.slice(0, 120)}…`;
  return source;
}
