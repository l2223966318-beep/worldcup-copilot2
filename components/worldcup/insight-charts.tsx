"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Label,
  LabelList,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { BarChart3, Check, ChevronDown, Clipboard } from "lucide-react";

import type { MatchData } from "@/data/matches";
import { copyToClipboard } from "@/lib/download";
import { HighlightedText } from "@/components/ui/readable-text";
import { buildChartCopy, buildTeamRadarData } from "@/lib/services/matchDetailPresentation";
import { getSportTheme, type SportTheme } from "@/lib/sport-theme";
import { hasVerifiedStatistics } from "@/lib/sports/statistics";

type DataAngle = {
  label: string;
  value: string;
  compare: string;
  explain: string;
  angle: string;
};

export function InsightCharts({
  match,
  theme = getSportTheme("football"),
  dataAngles = []
}: {
  match: MatchData;
  theme?: SportTheme;
  dataAngles?: DataAngle[];
}) {
  if (match.verifiedStats === false || !hasVerifiedStatistics(match.stats)) {
    return <div className="flex min-h-44 items-center justify-center gap-4 bg-slate-50 px-5 py-8 text-slate-500"><BarChart3 aria-hidden="true" className="h-9 w-9 shrink-0 text-slate-300" /><p className="max-w-md text-sm leading-7">技术统计尚不完整，暂不生成对比图表。可先查看已确认比分和比赛事件。</p></div>;
  }
  const possessionData = [
    { team: match.teamA, value: match.stats.teamA.possession },
    { team: match.teamB, value: match.stats.teamB.possession }
  ];
  const shotData = [
    { name: "射门", [match.teamA]: match.stats.teamA.shots, [match.teamB]: match.stats.teamB.shots },
    { name: "射正", [match.teamA]: match.stats.teamA.shotsOnTarget, [match.teamB]: match.stats.teamB.shotsOnTarget }
  ];
  const teamRadar = buildTeamRadarData(match);
  const chartCopy = buildChartCopy(match);
  const colors = theme.sportType === "football" ? ["#0d9488", "#0284c7"] : [theme.chartA, theme.chartB];

  return (
    <div className="min-w-0">
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
        {[match.teamA, match.teamB].map((team, index) => <span key={team} className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index] }} />{team}</span>)}
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
      <ChartCard
        title="控球率对比"
        operation={chartCopy.possession.operation}
        quote={chartCopy.possession.quote}
        theme={theme}
      >
        <div className="grid grid-cols-2 gap-3 text-center">
          {possessionData.map((item, index) => <div key={item.team}><p className="text-2xl font-semibold tabular-nums" style={{ color: colors[index] }}>{item.value}%</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.team}</p></div>)}
        </div>
        <ResponsiveContainer width="100%" height={194}>
          <PieChart>
            <Pie data={possessionData} dataKey="value" nameKey="team" cx="50%" cy="50%" innerRadius={54} outerRadius={76} paddingAngle={2} stroke="none" isAnimationActive={false}>
              {possessionData.map((item, index) => <Cell key={item.team} fill={colors[index]} />)}
              <Label value="控球率" position="center" fill="#64748b" fontSize={13} />
            </Pie>
            <Tooltip formatter={(value: number) => `${value}%`} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="射门与射正"
        operation={chartCopy.shots.operation}
        quote={chartCopy.shots.quote}
        theme={theme}
      >
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={shotData} barGap={8} barCategoryGap="30%" margin={{ top: 24, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.4} />
            <XAxis
              dataKey="name"
              axisLine={{ stroke: "#CBD5E1", strokeWidth: 1 }}
              tickLine={false}
              tick={{ fill: "#94A3B8", fontSize: 12, fontFamily: "inherit" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#94A3B8", fontSize: 12, fontFamily: "inherit" }}
            />
            <Tooltip />
            <Bar dataKey={match.teamA} fill={colors[0]} radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false}><LabelList dataKey={match.teamA} position="top" fill="#0f766e" fontSize={12} /></Bar>
            <Bar dataKey={match.teamB} fill={colors[1]} radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false}><LabelList dataKey={match.teamB} position="top" fill="#0369a1" fontSize={12} /></Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="球队表现雷达"
        operation={chartCopy.radar.operation}
        quote={chartCopy.radar.quote}
        theme={theme}
      >
        <ResponsiveContainer width="100%" height={250}>
          <RadarChart data={teamRadar} outerRadius="65%">
            <PolarGrid stroke="rgba(148,163,184,.3)" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: "#475569", fontSize: 12 }} />
            <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
            <Radar name={match.teamA} dataKey={match.teamA} stroke={colors[0]} fill={colors[0]} fillOpacity={0.12} isAnimationActive={false} />
            <Radar name={match.teamB} dataKey={match.teamB} stroke={colors[1]} fill={colors[1]} fillOpacity={0.10} isAnimationActive={false} />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </ChartCard>

      </div>
      {dataAngles.length > 0 ? <DataAnglePanel dataAngles={dataAngles} theme={theme} /> : null}
    </div>
  );
}

function DataAnglePanel({ dataAngles, theme }: { dataAngles: DataAngle[]; theme: SportTheme }) {
  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      <div>
        <h3 className="text-base font-semibold leading-7 text-slate-950">数据解读与内容角度</h3>
      </div>
      <div className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
        {dataAngles.map((item) => (
          <DataAngleCard key={item.label} {...item} theme={theme} />
        ))}
      </div>
    </div>
  );
}

function DataAngleCard({ label, value, compare, explain, angle, theme }: DataAngle & { theme: SportTheme }) {
  return (
    <div className="min-w-0 border-l-2 border-slate-200 pl-4">
      <div className="text-sm font-semibold text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold tabular-nums text-slate-950 [overflow-wrap:anywhere]">{value}</div>
      <div className="mt-1 text-sm font-semibold" style={{ color: theme.primary }}>{compare}</div>
      <p className="mt-4 text-sm leading-relaxed text-slate-700"><HighlightedText text={explain} /></p>
      <div className="mt-3 text-sm font-medium leading-7 text-teal-700">
        内容转化：<HighlightedText text={angle} />
      </div>
    </div>
  );
}

function ChartCard({
  title,
  operation,
  quote,
  theme,
  children
}: {
  title: string;
  operation: string;
  quote: string;
  theme: SportTheme;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyToClipboard(quote);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="card-lift-light min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-sm font-semibold leading-6 text-slate-800">{title}</h3>
        <button
          onClick={handleCopy}
          type="button"
          title={copied ? "已复制" : "复制金句"}
          aria-label={copied ? "已复制" : "复制金句"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-teal-50 hover:text-teal-700 focus-visible:outline-teal-600"
        >
          {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-5">{children}</div>
      <details className="group mt-4 border-t border-slate-100 pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-slate-500 focus-visible:outline-teal-600 [&::-webkit-details-marker]:hidden">解读与金句<ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" /></summary>
        <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">
          <div><span className="font-semibold text-slate-800">运营解释：</span><HighlightedText text={operation} /></div>
          <div><span className="font-semibold text-teal-700">可复制内容金句：</span><HighlightedText text={quote} /></div>
        </div>
      </details>
    </div>
  );
}
