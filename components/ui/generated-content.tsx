"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, Eye, FileText, Pencil, ShieldAlert } from "lucide-react";
import { splitDraftBlocks } from "@/lib/ai/generated-draft";

export function GeneratedDocument({ text, className = "" }: { text: string; className?: string }) {
  return (
    <article className={`generated-document ${className}`}>
      {splitDraftBlocks(text).map((block, index) => block.kind === "heading" ? (
        <h3 key={index} className="draft-heading">
          {block.number ? <span className="draft-number">{block.number.padStart(2, "0")}</span> : null}
          <span>{block.text}</span>
        </h3>
      ) : block.kind === "field" ? (
        <dl key={index} className="draft-field">
          <dt>{block.label}</dt>
          <dd>{block.text}</dd>
        </dl>
      ) : (
        <p key={index} className="draft-paragraph">{block.text}</p>
      ))}
    </article>
  );
}

export function GeneratedDraftEditor({ value, onChange, label, loading = false }: {
  value: string; onChange: (value: string) => void; label: string; loading?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="mt-4 min-w-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={`${label}显示方式`} className="inline-flex rounded-md bg-slate-100 p-1">
          <button type="button" aria-pressed={!editing} onClick={() => setEditing(false)} className={`draft-view-button ${!editing ? "bg-white text-teal-800 shadow-sm" : "text-slate-500"}`}>
            <Eye aria-hidden="true" className="h-4 w-4" />预览
          </button>
          <button type="button" aria-pressed={editing} onClick={() => setEditing(true)} className={`draft-view-button ${editing ? "bg-white text-teal-800 shadow-sm" : "text-slate-500"}`}>
            <Pencil aria-hidden="true" className="h-4 w-4" />编辑
          </button>
        </div>
        <span className="text-xs tabular-nums text-slate-400">{value.length.toLocaleString("zh-CN")} 字</span>
      </div>
      {editing ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} placeholder="暂无稿件" className="draft-textarea" />
      ) : value ? (
        <GeneratedDocument text={value} />
      ) : (
        <div role="status" className="flex min-h-64 flex-col items-center justify-center gap-3 bg-slate-50 text-sm text-slate-400">
          <FileText aria-hidden="true" className="h-7 w-7 text-slate-300" strokeWidth={1.5} />
          {loading ? "正在生成稿件…" : "暂无稿件"}
        </div>
      )}
    </div>
  );
}

export function ReviewVerdict({ title, tone, summary, metrics = [] }: {
  title: string; tone: "pass" | "warning" | "danger"; summary?: string;
  metrics?: Array<{ label: string; value: string | number }>;
}) {
  const Icon = tone === "pass" ? CheckCircle2 : ShieldAlert;
  const color = tone === "pass" ? "border-teal-500 bg-teal-50/60 text-teal-700" : tone === "danger" ? "border-rose-500 bg-rose-50/60 text-rose-700" : "border-amber-500 bg-amber-50/60 text-amber-700";
  return (
    <div className={`border-l-[3px] p-4 ${color}`}>
      <div className="flex items-center gap-2.5"><Icon aria-hidden="true" className="h-5 w-5 shrink-0" /><h3 className="text-base font-semibold">{title}</h3></div>
      {summary ? <p className="mt-2 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{summary}</p> : null}
      {metrics.length ? <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3 border-t border-current/10 pt-3">
        {metrics.map((metric) => <div key={metric.label}><dt className="text-xs text-slate-500">{metric.label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{metric.value}</dd></div>)}
      </dl> : null}
    </div>
  );
}

export function ReviewSection({ title, items, children, defaultOpen = false, emptyLabel = "未发现具体问题", tone = "neutral" }: {
  title: string; items?: string[]; children?: ReactNode; defaultOpen?: boolean;
  emptyLabel?: string; tone?: "neutral" | "warning";
}) {
  return (
    <details open={defaultOpen} className="review-section group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-sm font-semibold text-slate-800 focus-visible:outline-teal-600 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2.5">{title}
          {items?.length ? <span className={`flex h-5 min-w-5 items-center justify-center rounded px-1 text-xs tabular-nums ${tone === "warning" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>{items.length}</span> : null}
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-5">
        {items?.length ? <ol className="space-y-4">{items.map((item, index) => (
          <li key={index} className="flex items-start gap-3 text-sm leading-7 text-slate-600">
            <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-medium tabular-nums ${tone === "warning" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span>
            <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{item}</span>
          </li>
        ))}</ol> : items ? <p className="text-sm text-slate-400">{emptyLabel}</p> : null}
        {children}
      </div>
    </details>
  );
}
