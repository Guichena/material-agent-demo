"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, FileDown, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_BASE, ApiError, getReport } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReportPanelProps {
  runId: string;
  reportPath?: string;
  reportPdfPath?: string;
  status?: string;
}

async function copyMarkdown(markdown: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(markdown);
  }
}

function encodePath(pathname: string) {
  return pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function resolveReportAssetUrl(runId: string, src?: string | null) {
  if (!src) return "";
  if (/^(https?:|data:|blob:|mailto:|#)/i.test(src)) return src;
  if (src.startsWith("/")) return src;
  const normalized = src.replace(/^\.?\//, "");
  const assetPath = normalized.startsWith("assets/") ? normalized.slice("assets/".length) : normalized;
  return `${API_BASE.replace(/\/$/, "")}/runs/${encodeURIComponent(runId)}/assets/${encodePath(assetPath)}`;
}

export function ReportPanel({ runId, reportPath, reportPdfPath, status }: ReportPanelProps) {
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getReport(runId, "markdown");
      setMarkdown(result.markdown);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("报告暂不可用。");
      } else {
        setError("暂时无法获取报告。");
      }
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    if (reportPath || status === "completed") {
      void loadReport();
    }
  }, [loadReport, reportPath, status]);

  const pdfUrl = `${API_BASE.replace(/\/$/, "")}/runs/${encodeURIComponent(runId)}/report?format=pdf`;

  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardHeader className="flex flex-col gap-3 pb-3 md:flex-row md:items-center md:justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          生成报告
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadReport} disabled={loading}>
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新报告
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!markdown}
            onClick={async () => {
              await copyMarkdown(markdown);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }}
          >
            <Copy className="h-4 w-4" />
            {copied ? "已复制" : "复制 Markdown"}
          </Button>
          {reportPdfPath ? (
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" type="button">
                <FileDown className="h-4 w-4" />
                下载 PDF
              </Button>
            </a>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {reportPath ? (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Markdown 路径：<code>{reportPath}</code>
          </div>
        ) : null}
        {reportPdfPath ? (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            PDF 路径：<code>{reportPdfPath}</code>
          </div>
        ) : null}
        {loading && !markdown ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            报告加载中……
          </div>
        ) : null}
        {error ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
        ) : null}
        {!markdown && !loading && !error ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            报告生成中或暂不可用。
          </div>
        ) : null}
        {markdown ? (
          <article className="prose prose-slate max-w-none rounded-md border border-slate-200 bg-white p-5 text-sm leading-7">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="mb-4 text-2xl font-semibold text-slate-950">{children}</h1>,
                h2: ({ children }) => <h2 className="mb-3 mt-6 text-xl font-semibold text-slate-900">{children}</h2>,
                h3: ({ children }) => <h3 className="mb-2 mt-5 text-base font-semibold text-slate-900">{children}</h3>,
                table: ({ children }) => <table className="my-4 w-full border-collapse overflow-hidden rounded-md border border-slate-200 text-sm">{children}</table>,
                th: ({ children }) => <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium">{children}</th>,
                td: ({ children }) => <td className="border border-slate-200 px-3 py-2">{children}</td>,
                code: ({ children }) => <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em]">{children}</code>,
                pre: ({ children }) => <pre className="my-4 overflow-auto rounded-md bg-slate-950 p-4 text-slate-50">{children}</pre>,
                img: ({ src, alt }) => {
                  const resolved = resolveReportAssetUrl(runId, src);
                  return (
                    <img
                      src={resolved}
                      alt={alt || "report asset"}
                      className="my-4 max-h-[420px] w-full rounded-md border border-slate-200 object-contain"
                    />
                  );
                },
                a: ({ href, children }) => {
                  const resolved = resolveReportAssetUrl(runId, href);
                  const isExternal = /^(https?:|mailto:|blob:|data:|#)/i.test(href || "");
                  return (
                    <a
                      href={isExternal ? href || "#" : resolved}
                      target={isExternal ? "_blank" : "_blank"}
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      {children}
                    </a>
                  );
                }
              }}
            >
              {markdown}
            </ReactMarkdown>
          </article>
        ) : null}
      </CardContent>
    </Card>
  );
}
