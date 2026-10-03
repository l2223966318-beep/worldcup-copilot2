"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, Eye, FileText, Pencil, ShieldAlert } from "lucide-react";
import { splitDraftBlocks } from "@/lib/ai/generated-draft";
import type { ReviewResultSnapshot } from "@/types/workflow";

const inlineEmphasis = /\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`|【([^】\n]{1,16})】|「([^」\n]{2,24})」|“([^”\n]{2,24})”|(?<![\w])\d{1,2}\s*[-:：]\s*\d{1,2}(?![\d:：])|\d+(?:\.\d+)?\s*(?:[%％]|万|亿|分钟|秒|次|球|条|场|人)/g;
const titleFields = new Set(["角度标题", "标题", "主标题", "封面标题", "视频标题"]);
const keyFields = new Set(["核心结论", "结论", "重点", "关键信息", "内容定位", "建议表达"]);
const cautionFields = new Set(["风险提醒", "风险提示", "风险边界"]);

export function GeneratedText({ text, leadingLabel = false, tone = "neutral" }: {
  text: string; leadingLabel?: boolean; tone?: "neutral" | "warning";
}) {
  const nodes: ReactNode[] = [];
  const label = leadingLabel ? text.match(/^([\p{Script=Han}][\p{Script=Han}A-Za-z /（）()]{0,13})([：:])\s*(?=\S)/u) : null;
  const content = label ? text.slice(label[0].length) : text;
  if (label) nodes.push(<strong key="label" className="draft-inline-label">{label[1]}</strong>, label[0].slice(label[1].length));
  let cursor = 0;
  for (const match of content.matchAll(inlineEmphasis)) {
    const index = match.index!;
    if (index > cursor) nodes.push(content.slice(cursor, index));
    if (match[1] || match[2]) {
      nodes.push(<strong key={index} className="draft-emphasis">{match[1] ?? match[2]}</strong>);
    } else if (match[3]) {
      nodes.push(<code key={index} className="draft-inline-code">{match[3]}</code>);
    } else if (match[4] || match[5] || match[6]) {
      nodes.push(<strong key={index} className="draft-inline-label">{match[0]}</strong>);
    } else {
      nodes.push(<mark key={index} className="draft-data">{match[0]}</mark>);
    }
    cursor = index + match[0].length;
  }
  if (cursor < content.length) nodes.push(content.slice(cursor));
  return <span className={`draft-inline-text ${tone === "warning" ? "draft-text-warning" : ""}`}>{nodes}</span>;
}

export function GeneratedDocument({ text, className = "" }: { text: string; className?: string }) {
  return (
    <article className={`generated-document ${className}`}>
      {splitDraftBlocks(text).map((block, index) => block.kind === "heading" ? (
        <h3 key={index} className="draft-heading">
          {block.number ? <span className="draft-number">{block.number.padStart(2, "0")}</span> : null}
          <span><GeneratedText text={block.text} /></span>
        </h3>
      ) : block.kind === "field" ? (
        <dl key={index} className={`draft-field ${titleFields.has(block.label) ? "draft-field-title" : keyFields.has(block.label) ? "draft-field-key" : cautionFields.has(block.label) ? "draft-field-caution" : ""}`}>
          <dt>{block.label}</dt>
          <dd><GeneratedText text={block.text} tone={cautionFields.has(block.label) ? "warning" : "neutral"} /></dd>
        </dl>
      ) : (
        <p key={index} className="draft-paragraph"><GeneratedText text={block.text} leadingLabel /></p>
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
      <div className="flex items-center gap-2.5"><Icon aria-hidden="true" className="h-5 w-5 shrink-0" /><h3 className="text-base font-bold">{title}</h3></div>
      {summary ? <p className="mt-2 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]"><GeneratedText text={summary} leadingLabel tone={tone === "pass" ? "neutral" : "warning"} /></p> : null}
      {metrics.length ? <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3 border-t border-current/10 pt-3">
        {metrics.map((metric) => <div key={metric.label}><dt className="text-xs text-slate-500">{metric.label}</dt><dd className="mt-1 text-lg font-bold tabular-nums">{metric.value}</dd></div>)}
      </dl> : null}
    </div>
  );
}

export function MatchReviewResult({ result, rewriteSuggestion }: {
  result: ReviewResultSnapshot; rewriteSuggestion?: string;
}) {
  const findings = [...new Map(result.findings.map(finding => [
    `${finding.evidenceStatus ?? "risk"}:${finding.sentence.trim().replace(/[。.!?]+$/, "")}`, finding
  ])).values()];
  const issues = findings.filter(finding => finding.evidenceStatus !== "missing");
  const reminders = findings.filter(finding => finding.evidenceStatus === "missing");
  const pending = result.level === "待人工确认" || result.level === "待审核";
  const sources = [...new Map((result.evidence ?? []).map(item => [item.sourceUrl || item.source, item])).values()];
  return (
    <div>
      <ReviewVerdict
        title={pending ? "待人工确认" : issues.length ? `需调整 ${issues.length} 项` : "未发现明确问题"}
        summary={pending ? "AI 审核未完成，以下为本地检查结果。" : issues.length ? "按下方建议调整后再发布。" : reminders.length ? "未发现明确错误，部分表述仍可补充来源。" : "当前稿件未发现需要修改的问题。"}
        tone={pending ? "warning" : issues.length ? result.level === "高" ? "danger" : "warning" : "pass"}
      />
      {issues.length ? <ReviewSection title="需要调整" defaultOpen tone="warning">
        <ol className="space-y-5">
          {issues.map((finding, index) => <li key={index} className="text-sm leading-7">
            <h4 className="font-bold text-slate-800">{index + 1}. {finding.type}</h4>
            <blockquote className="review-original"><GeneratedText text={finding.sentence} tone="warning" /></blockquote>
            {finding.rewrite ? <p className="mt-3 text-slate-600"><strong className="mr-2 font-semibold text-teal-700">建议</strong><GeneratedText text={finding.rewrite} /></p> : null}
          </li>)}
        </ol>
      </ReviewSection> : null}
      <ReviewSection title="审核依据与补充信息">
        <div className="space-y-5 text-sm leading-7 text-slate-600">
          {result.evidenceSummary ? <p className="text-xs text-slate-500">核对范围：{result.evidenceSummary.checkedClaims} 条含数据或具体事件的陈述；审核分值 {result.score}。</p> : null}
          {issues.length ? <div>
            <h4 className="mb-2 font-semibold text-slate-800">判断依据</h4>
            <ol className="space-y-3">{issues.map((finding, index) => <li key={index}>
              <strong className="mr-2 font-semibold">{index + 1}.</strong>
              <GeneratedText text={finding.reason || finding.type} leadingLabel />
              {finding.evidenceIds?.length ? <span className="ml-2 text-xs text-slate-500">依据 {finding.evidenceIds.join("、")}</span> : null}
            </li>)}</ol>
          </div> : null}
          {reminders.length ? <div>
            <h4 className="mb-1 font-semibold text-slate-800">来源补充</h4>
            <p className="mb-3 text-xs text-slate-500">资料未覆盖不代表内容有误，以下记录未计入需要调整项。</p>
            <ul className="space-y-2">{reminders.map((finding, index) => <li key={index} className="border-l-2 border-slate-200 pl-3"><GeneratedText text={finding.sentence} /></li>)}</ul>
          </div> : null}
          {sources.length ? <div>
            <h4 className="mb-2 font-semibold text-slate-800">参考来源</h4>
            <ul className="space-y-1">{sources.map((item, index) => <li key={index}>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-teal-700 underline underline-offset-4">{item.source}</a> : item.source}</li>)}</ul>
          </div> : null}
          {issues.length && rewriteSuggestion ? <div>
            <h4 className="mb-3 font-semibold text-slate-800">建议稿</h4>
            <GeneratedDocument text={rewriteSuggestion} />
          </div> : null}
          {!issues.length && !reminders.length && !sources.length ? <p>{pending ? "事实仍需人工确认。" : "未发现需要补充的具体事项。"}</p> : null}
        </div>
      </ReviewSection>
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
            <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]"><GeneratedText text={item} leadingLabel tone={tone} /></span>
          </li>
        ))}</ol> : items ? <p className="text-sm text-slate-400">{emptyLabel}</p> : null}
        {children}
      </div>
    </details>
  );
}
