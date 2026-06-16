"use client";

import { AlertTriangle, CheckCircle2, Eye, HelpCircle } from "lucide-react";

import type { SportTheme } from "@/lib/sport-theme";
import type { ContentOpportunityModel, OpportunityRecommendation, PlatformFitScores } from "@/lib/services/opportunityModel";

const recommendationIcon: Record<OpportunityRecommendation, typeof CheckCircle2> = {
  优先做: CheckCircle2,
  可观察: Eye,
  谨慎跟进: AlertTriangle,
  信息不足: HelpCircle
};

export function OpportunityMetricBars({
  model,
  theme,
  compact = false
}: {
  model: ContentOpportunityModel;
  theme: SportTheme;
  compact?: boolean;
}) {
  const items = [
    { label: "热度", value: model.heat },
    { label: "稀缺度", value: model.scarcity },
    { label: "平台适配", value: model.platformFit },
    { label: "风险指数", value: model.risk, invert: true },
    { label: "制作成本", value: model.productionCost, invert: true }
  ];

  return (
    <div className={`grid ${compact ? "gap-2" : "gap-3"}`}>
      {items.map((item) => {
        const width = item.invert ? 100 - item.value : item.value;
        return (
          <div key={item.label}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">{item.label}</span>
              <span className="font-semibold text-slate-900">{item.value}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${Math.max(6, width)}%`,
                  background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})`
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OpportunityQuadrant({
  heat,
  scarcity,
  theme,
  className
}: {
  heat: number;
  scarcity: number;
  theme: SportTheme;
  className?: string;
}) {
  const x = 20 + heat * 1.2;
  const y = 140 - scarcity * 1.2;

  return (
    <div className={`rounded-3xl border bg-white p-4 ${className ?? ""}`} style={{ borderColor: theme.border }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">热度 × 稀缺度</div>
        <div className="text-[11px] text-slate-500">越靠右上越值得优先做</div>
      </div>
      <svg viewBox="0 0 160 160" className="mt-3 h-40 w-full overflow-visible">
        <rect x="20" y="20" width="120" height="120" rx="18" fill={theme.background} stroke={theme.border} />
        <line x1="80" y1="20" x2="80" y2="140" stroke={theme.border} strokeDasharray="4 4" />
        <line x1="20" y1="80" x2="140" y2="80" stroke={theme.border} strokeDasharray="4 4" />
        <text x="28" y="42" fontSize="9" fill="#64748b">可观察</text>
        <text x="96" y="42" fontSize="9" fill="#64748b">谨慎跟进</text>
        <text x="28" y="128" fontSize="9" fill="#64748b">信息不足</text>
        <text x="98" y="128" fontSize="9" fill="#64748b">优先做</text>
        <circle cx={x} cy={y} r="10" fill={theme.primary} fillOpacity="0.18" />
        <circle cx={x} cy={y} r="5.5" fill={theme.primary} />
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>低热度</span>
        <span>高热度</span>
      </div>
    </div>
  );
}

export function PlatformFitCompare({
  platformFits,
  theme
}: {
  platformFits: PlatformFitScores;
  theme: SportTheme;
}) {
  const entries = [
    { key: "bilibili", label: "B站", value: platformFits.bilibili },
    { key: "weibo", label: "微博", value: platformFits.weibo },
    { key: "xiaohongshu", label: "小红书", value: platformFits.xiaohongshu },
    { key: "douyin", label: "短视频", value: platformFits.douyin }
  ];

  return (
    <div className="rounded-3xl border bg-white p-4" style={{ borderColor: theme.border }}>
      <div className="text-sm font-semibold text-slate-900">平台适配对比</div>
      <div className="mt-3 space-y-3">
        {entries.map((entry) => (
          <div key={entry.key}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">{entry.label}</span>
              <span className="font-semibold text-slate-900">{entry.value}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${entry.value}%`,
                  backgroundColor:
                    entry.key === "bilibili"
                      ? theme.primary
                      : entry.key === "weibo"
                        ? theme.secondary
                        : entry.key === "xiaohongshu"
                          ? theme.accent
                          : theme.chartC
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OpportunityRiskCard({
  model,
  theme,
  dense = false
}: {
  model: ContentOpportunityModel;
  theme: SportTheme;
  dense?: boolean;
}) {
  const Icon = recommendationIcon[model.recommendation];
  const tone =
    model.recommendation === "优先做"
      ? "bg-emerald-50 text-emerald-700"
      : model.recommendation === "可观察"
        ? "bg-amber-50 text-amber-700"
        : model.recommendation === "谨慎跟进"
          ? "bg-rose-50 text-rose-700"
          : "bg-slate-100 text-slate-700";

  return (
    <div className={`rounded-3xl border p-4 ${tone}`} style={{ borderColor: theme.border }}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="text-sm font-semibold">{model.recommendation}</span>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold">价值分 {model.valueScore}</span>
      </div>
      <p className={`mt-3 ${dense ? "text-xs leading-5" : "text-sm leading-6"}`}>{model.recommendationReason}</p>
      <div className={`mt-3 rounded-2xl bg-white/80 px-3 py-2 ${dense ? "text-xs" : "text-sm"} font-medium leading-6 text-slate-700`}>
        {model.riskSummary}
      </div>
      <div className="mt-2 text-xs font-medium text-slate-600">提示：{model.caution}</div>
    </div>
  );
}
