"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Palette } from "lucide-react";

import { ScoreReasonPopover } from "@/components/ui/score-reason-popover";
import { HotTopicRadarPanel } from "@/components/worldcup/hot-topic-radar-panel";
import { EditorialWorldCupHero } from "@/components/worldcup/editorial-hero";
import { localizeCompetitionName, localizeMatchStatus, localizeRoundName, localizeTeamName, localizeVenueText } from "@/lib/services/footballNames";
import { filterMatchesByQuery, queryLooksLikeMatchSearch } from "@/lib/services/matchSearchService";
import { getOpportunityProfile } from "@/lib/services/matchOpportunity";
import { useWorldCupQuery } from "@/lib/sports/client";
import type { SourceStatus, WorldCupMatch } from "@/lib/sports/types";
import { getSportTheme, sportThemes, type SportTheme, type SportType } from "@/lib/sport-theme";
import { formatBeijingDateTime, getBeijingDateKeyFromValue } from "@/lib/time/beijingTime";

export default function DashboardPage() {
  const [sportType, setSportType] = useState<SportType>("football");
  const theme = getSportTheme(sportType);
  const [matchSearchQuery, setMatchSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [competitionFilter, setCompetitionFilter] = useState("all");
  const { payload, loading, error } = useWorldCupQuery<WorldCupMatch[]>("/api/worldcup/fixtures", 120_000, {
    cacheKey: "worldcup.fixtures.season",
    staleMs: 300_000,
    revalidateOnMount: false
  });
  const matches = (payload?.data ?? []).filter(isDisplayableFixture);
  const queryFilteredMatches = filterMatchesByQuery(matches, matchSearchQuery);
  const filteredMatches = queryFilteredMatches
    .filter((item) => {
      const statusOk = statusFilter === "all" || item.status === statusFilter;
      const dateOk = !dateFilter || getBeijingDateKeyFromValue(item.kickoffTime) === dateFilter;
      const competitionOk = competitionFilter === "all" || item.competition === competitionFilter;
      return statusOk && dateOk && competitionOk;
    })
    .sort((a, b) => {
      const left = Date.parse(a.kickoffTime || "") || 0;
      const right = Date.parse(b.kickoffTime || "") || 0;
      return left - right;
    });
  const competitions = Array.from(new Set(matches.map((item) => item.competition))).filter(Boolean);
  const activePayload = payload;
  const activeStatus = activePayload?.sourceStatus ?? "fallback";
  const sourceIssue = formatSourceIssue(activePayload?.message);
  const hasFilters = Boolean(matchSearchQuery.trim() || dateFilter || statusFilter !== "all" || competitionFilter !== "all");
  const visibleMatches = hasFilters ? filteredMatches : filteredMatches.slice(-12).reverse();
  const isMockMode = activeStatus === "fallback";
  const isNoDataState = !hasFilters && visibleMatches.length === 0;
  useEffect(() => {
    setSportType(readSavedSportType());
  }, []);

  function selectSportTheme(nextSportType: SportType) {
    setSportType(nextSportType);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("worldcup.sportType", nextSportType);
    }
  }

  const applyGlobalSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    setDateFilter("");
    setStatusFilter("all");
    setCompetitionFilter("all");
    setMatchSearchQuery(queryLooksLikeMatchSearch(trimmed) ? trimmed : "");
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("q");
    if (!query) return;
    applyGlobalSearch(query);
  }, [applyGlobalSearch]);

  useEffect(() => {
    function handleGlobalSearch(event: Event) {
      const detail = (event as CustomEvent<{ query?: string }>).detail;
      applyGlobalSearch(detail?.query ?? "");
    }

    window.addEventListener("worldcup:global-search", handleGlobalSearch);
    return () => window.removeEventListener("worldcup:global-search", handleGlobalSearch);
  }, [applyGlobalSearch]);

  return (
    <div className="relative flex flex-col gap-8 pb-16">
      <ThemeSideSelector active={sportType} onChange={selectSportTheme} />
      <EditorialWorldCupHero />

      <div className="mx-auto grid w-full max-w-[1600px] items-start gap-5 px-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(380px,0.95fr)] lg:px-6 xl:grid-cols-[minmax(0,1.72fr)_minmax(420px,0.9fr)]">
        <div className="min-w-0 space-y-8">
          <section id="opportunity-pool" className="scroll-mt-24">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <SectionTitle title="世界杯赛事内容机会池" />
              </div>
              <SourceBadge
                status={activeStatus}
                provider={readPayloadProvider(activePayload?.data)}
                lastUpdated={activePayload?.lastUpdated}
                loading={loading}
                error={error || sourceIssue}
              />
            </div>
            <div className="mt-5 grid gap-3 rounded-[22px] border border-slate-200 bg-white p-3.5 md:grid-cols-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">搜索比赛 / 球队</span>
                <input
                  value={matchSearchQuery}
                  onChange={(event) => setMatchSearchQuery(event.target.value)}
                  placeholder="例如：日本、Japan、美国"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">赛事</span>
                <select value={competitionFilter} onChange={(event) => setCompetitionFilter(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none">
                  <option value="all">全部赛事</option>
                  {competitions.map((item) => <option key={item} value={item}>{localizeCompetitionName(item)}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">日期</span>
                <div className="relative mt-2">
                  {!dateFilter ? (
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      年/月/日
                    </span>
                  ) : null}
                  <input
                    type="date"
                    lang="zh-CN"
                    value={dateFilter}
                    onChange={(event) => setDateFilter(event.target.value)}
                    className={`h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none ${dateFilter ? "text-slate-700" : "text-transparent"}`}
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">状态</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none">
                  <option value="all">全部状态</option>
                  <option value="scheduled">未开始</option>
                  <option value="live">进行中</option>
                  <option value="finished">已结束</option>
                </select>
              </label>
            </div>
            <div className="mt-6 grid gap-5">
              {visibleMatches.length ? (
                visibleMatches.map((item) => (
                  <OpportunityMatchCard key={item.id} match={item} theme={theme} sourceStatus={activeStatus} />
                ))
              ) : isNoDataState ? (
                <div className="rounded-[30px] border border-dashed border-slate-300 bg-white p-10">
                  <div className="text-xl font-semibold text-slate-950">
                    {loading ? "正在加载世界杯赛程" : error ? "赛事数据请求失败" : isMockMode ? "当前没有可用的真实赛事数据" : "暂未返回赛事数据"}
                  </div>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
                    {loading
                      ? "正在读取世界杯赛程，稍后会自动更新。"
                      : error
                        ? "赛事数据暂不可用，请检查数据源设置后重试。"
                        : isMockMode
                          ? "当前未取得可展示的真实赛程，请检查数据源设置。"
                          : "当前赛程列表为空，请稍后刷新或检查数据源设置。"}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link href="/settings" className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5">
                      检查数据源设置
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="rounded-[30px] border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
                  当前筛选条件下没有比赛。可清空搜索、日期和状态筛选。
                </div>
              )}
            </div>
          </section>

        </div>

        <div id="hot-moments" className="scroll-mt-24">
          <HotTopicRadarPanel theme={theme} matches={matches} />
        </div>
      </div>
    </div>
  );
}

function readHotSourceHeaders() {
  const headers: Record<string, string> = {};
  if (typeof window === "undefined") return headers;

  try {
    const raw = window.localStorage.getItem("worldcup.datasource.settings");
    if (!raw) return headers;
    const settings = JSON.parse(raw) as { tavilyKey?: string; topHubDataKey?: string; dailyHotBaseUrl?: string; xhsHotUrl?: string; xhsHotKey?: string; redfoxApiKey?: string; redfoxXhsCategory?: string };
    if (settings.tavilyKey?.trim()) headers["x-worldcup-tavily-key"] = settings.tavilyKey.trim();
    if (settings.topHubDataKey?.trim()) headers["x-worldcup-tophubdata-key"] = settings.topHubDataKey.trim();
    if (settings.dailyHotBaseUrl?.trim()) headers["x-worldcup-dailyhot-base"] = settings.dailyHotBaseUrl.trim();
    if (settings.xhsHotUrl?.trim()) headers["x-worldcup-xhs-url"] = settings.xhsHotUrl.trim();
    if (settings.xhsHotKey?.trim()) headers["x-worldcup-xhs-key"] = settings.xhsHotKey.trim();
    if (settings.redfoxApiKey?.trim()) headers["x-worldcup-redfox-key"] = settings.redfoxApiKey.trim();
    if (settings.redfoxXhsCategory?.trim()) headers["x-worldcup-redfox-xhs-category"] = encodeURIComponent(settings.redfoxXhsCategory.trim());
  } catch {
    return headers;
  }

  return headers;
}

function SectionTitle({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <div>
      {eyebrow ? <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{eyebrow}</div> : null}
      <h2 className={eyebrow ? "mt-2 text-3xl font-semibold tracking-tight text-slate-950" : "text-3xl font-semibold tracking-tight text-slate-950"}>{title}</h2>
      {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
    </div>
  );
}


function ThemeSideSelector({
  active,
  onChange
}: {
  active: SportType;
  onChange: (sportType: SportType) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeTheme = sportThemes[active];

  return (
    <div className="fixed bottom-5 right-24 z-40 hidden md:block">
      {open ? (
        <div className="mb-3 w-56 rounded-[22px] border border-slate-200 bg-white/95 p-2 shadow-[0_18px_50px_rgba(15,23,42,0.14)] backdrop-blur">
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">主题</div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100">
              收起
            </button>
          </div>
          <div className="grid gap-2">
            {(Object.keys(sportThemes) as SportType[]).map((sportType) => {
              const item = sportThemes[sportType];
              const selected = active === sportType;
              return (
                <button
                  key={sportType}
                  type="button"
                  onClick={() => {
                    onChange(sportType);
                    setOpen(false);
                  }}
                  className={`group flex h-11 items-center justify-between rounded-2xl px-3 text-left text-xs font-semibold transition hover:-translate-y-0.5 ${
                    selected ? "text-white shadow-md" : "bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-white"
                  }`}
                  style={selected ? { backgroundColor: item.primary, boxShadow: `0 12px 28px ${item.heroGlow}` } : undefined}
                  aria-pressed={selected}
                  title={`${item.name}主题`}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex -space-x-1">
                      {[item.primary, item.secondary, item.accent].map((color) => (
                        <span key={color} className="h-4 w-4 rounded-full border border-white" style={{ backgroundColor: color }} />
                      ))}
                    </span>
                    <span>{item.name}</span>
                  </span>
                  {selected ? <span className="text-[11px] opacity-90">当前</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-12 items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 text-sm font-semibold text-slate-800 shadow-[0_14px_40px_rgba(15,23,42,0.14)] backdrop-blur transition hover:-translate-y-0.5"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ backgroundColor: activeTheme.primary }}>
          <Palette className="h-4 w-4" />
        </span>
        <span>{activeTheme.name}主题</span>
      </button>
    </div>
  );
}

function OpportunityMatchCard({
  match,
  theme,
  sourceStatus
}: {
  match: WorldCupMatch;
  theme: SportTheme;
  sourceStatus: SourceStatus;
}) {
  const opportunity = getOpportunityProfile(match);
  const priority = opportunity.grade;
  const risk = match.status === "live" ? "中" : "低";
  const homeTeam = localizeTeamName(match.homeTeam.name);
  const awayTeam = localizeTeamName(match.awayTeam.name);
  const round = localizeRoundName(match.round || "世界杯赛程");
  const statusText = localizeMatchStatus(match.statusText);
  const heatTone = matchHeatTone(opportunity.score, theme);

  return (
    <article
      className={`card-lift card-lift-light grid gap-4 overflow-hidden rounded-[28px] border p-4 shadow-[0_18px_48px_rgba(15,23,42,0.055)] md:p-5 lg:grid-cols-[74px_minmax(0,1fr)] ${priority === "A" ? "card-lift-gold" : ""}`}
      style={heatTone}
    >
      <div className="flex items-center gap-3 lg:block">
        <div className="flex h-14 w-14 items-center justify-center rounded-[22px] text-2xl font-black text-white shadow-sm lg:h-16 lg:w-16 lg:text-3xl" style={{ backgroundColor: priorityColor(priority) }}>
          {priority}
        </div>
        <div className="text-sm font-semibold text-slate-500 lg:mt-2">机会等级</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400 lg:mt-1">
          <span>评分 {opportunity.score}</span>
          <ScoreReasonPopover
            summary={`${priority} 级机会卡的判断依据`}
            className="shrink-0"
          >
            <p>{opportunity.reason}</p>
            <p className="mt-2">
              当前命中信号：{opportunity.signals.length ? opportunity.signals.join("、") : "暂无明显内容信号"}。
            </p>
          </ScoreReasonPopover>
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            北京时间 {formatKickoffTime(match.kickoffTime)}
          </span>
          <h3 className="min-w-0 text-2xl font-semibold tracking-tight text-slate-950 lg:text-[1.72rem]">
            {homeTeam} <span style={{ color: theme.primary }}>{match.score.display}</span> {awayTeam}
          </h3>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{statusText}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{round}</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">风险：{risk}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap gap-2">
            {opportunity.signals.slice(0, 3).map((signal) => (
              <span key={signal} className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/80">
                {signal}
              </span>
            ))}
            {["B站", "微博", "赛后复盘", "数据解读", localizeVenue(match.venue.city ?? match.venue.name)].map((direction) => (
              <span key={direction} className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/80">
                {direction}
              </span>
            ))}
          </div>
          <Link
            href={`/matches/${match.id}`}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5"
            style={{ backgroundColor: theme.primary, boxShadow: `0 14px 30px ${theme.heroGlow}` }}
          >
            进入分析
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function localizeVenue(value?: string) {
  return localizeVenueText(value);
}

function SourceBadge({
  status,
  provider,
  lastUpdated,
  loading,
  error
}: {
  status: SourceStatus;
  provider?: WorldCupMatch["source"]["provider"];
  lastUpdated?: string;
  loading?: boolean;
  error?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
      <div className="font-semibold text-slate-950">数据来源：{loading ? "加载中" : sourceLabel(status, provider)}</div>
      <div className="mt-1 text-xs text-slate-500">
        {lastUpdated ? `最后更新：${formatDate(lastUpdated)}` : "等待接口返回"}
        {error ? `｜${error}` : ""}
      </div>
    </div>
  );
}

function getPriority(match: WorldCupMatch) {
  return getOpportunityGrade(match);
}

function getOpportunityGrade(match: WorldCupMatch) {
  return getOpportunityProfile(match).grade;
}


function priorityColor(priority: string) {
  if (priority === "S") return "#047857";
  if (priority === "A") return "#16a34a";
  if (priority === "B") return "#0f766e";
  return "#94a3b8";
}

function matchHeatTone(score: number, theme: SportTheme): CSSProperties {
  if (score >= 85) {
    return {
      background:
        "radial-gradient(circle at 86% 50%, rgba(4,120,87,0.58) 0%, rgba(16,185,129,0.26) 25%, transparent 52%), radial-gradient(circle at 8% 0%, rgba(245,158,11,0.36) 0%, transparent 38%), linear-gradient(112deg, transparent 0%, transparent 56%, rgba(255,255,255,0.58) 56.4%, transparent 58.6%), linear-gradient(118deg, rgba(255,255,255,0.98) 0%, rgba(236,253,245,0.96) 38%, rgba(167,243,208,0.92) 70%, rgba(255,247,237,0.96) 100%)",
      borderColor: "rgba(4, 120, 87, 0.78)",
      boxShadow: `0 24px 72px rgba(15,23,42,0.1), 0 0 66px ${theme.heroGlow}`
    };
  }

  if (score >= 70) {
    return {
      background:
        "radial-gradient(circle at 90% 52%, rgba(22,163,74,0.44) 0%, rgba(34,197,94,0.18) 28%, transparent 52%), radial-gradient(circle at 10% 0%, rgba(251,191,36,0.22) 0%, transparent 36%), linear-gradient(112deg, transparent 0%, transparent 60%, rgba(255,255,255,0.5) 60.4%, transparent 62.4%), linear-gradient(118deg, rgba(255,255,255,0.98) 0%, rgba(240,253,244,0.96) 46%, rgba(187,247,208,0.8) 78%, rgba(255,251,235,0.92) 100%)",
      borderColor: "rgba(22, 163, 74, 0.58)",
      boxShadow: "0 21px 60px rgba(15,23,42,0.078), 0 0 44px rgba(34,197,94,0.18)"
    };
  }

  if (score >= 55) {
    return {
      background:
        "radial-gradient(circle at 91% 54%, rgba(15,118,110,0.38) 0%, rgba(45,212,191,0.14) 29%, transparent 54%), radial-gradient(circle at 10% 0%, rgba(245,158,11,0.12) 0%, transparent 34%), linear-gradient(112deg, transparent 0%, transparent 63%, rgba(255,255,255,0.38) 63.4%, transparent 65.2%), linear-gradient(118deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.95) 50%, rgba(204,251,241,0.74) 100%)",
      borderColor: "rgba(15, 118, 110, 0.48)",
      boxShadow: "0 19px 52px rgba(15,23,42,0.068), 0 0 36px rgba(20,184,166,0.13)"
    };
  }

  return {
    background:
      "radial-gradient(circle at 91% 54%, rgba(34,197,94,0.28) 0%, rgba(34,197,94,0.1) 30%, transparent 54%), radial-gradient(circle at 12% 0%, rgba(251,191,36,0.1) 0%, transparent 34%), linear-gradient(112deg, transparent 0%, transparent 64%, rgba(255,255,255,0.34) 64.4%, transparent 66%), linear-gradient(118deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 54%, rgba(220,252,231,0.7) 100%)",
    borderColor: "rgba(34, 197, 94, 0.34)",
    boxShadow: "0 18px 48px rgba(15,23,42,0.06), 0 0 30px rgba(34,197,94,0.09)"
  };
}

function sourceLabel(status: SourceStatus, provider?: WorldCupMatch["source"]["provider"]) {
  const providerName = providerSourceName(provider);
  if (provider === "thestatsapi-fixtures" && status === "live") return "TheStatsAPI 兜底数据";
  if (provider === "thestatsapi-fixtures" && status === "cache") return "TheStatsAPI 兜底缓存";
  if (status === "live") return providerName ? `${providerName} 实时数据` : "真实接口数据";
  if (status === "cache") return providerName ? `${providerName} 缓存数据` : "缓存数据";
  if (status === "fallback") return "示例数据";
  return "请求失败";
}

function formatSourceIssue(message?: string) {
  if (!message) return "";
  if (/No Sportradar matches for this Beijing date/i.test(message)) {
    return "Sportradar 未返回匹配场次，已使用免费赛程源";
  }
  if (/429|Too Many Requests|limit exceeded/i.test(message)) return "Sportradar 当前限流，已切换兜底源";
  if (/sportradar/i.test(message)) return "Sportradar 暂不可用，已切换兜底源";
  return message;
}

function providerSourceName(provider?: WorldCupMatch["source"]["provider"]) {
  const labels: Partial<Record<WorldCupMatch["source"]["provider"], string>> = {
    sportradar: "Sportradar",
    "api-football": "API-Football",
    "worldcup26-free": "免费赛程源",
    "thestatsapi-fixtures": "TheStatsAPI",
    mock: "示例数据"
  };
  return provider ? labels[provider] : undefined;
}

function readPayloadProvider(data?: WorldCupMatch[]) {
  return data?.find((item) => item.source?.provider)?.source.provider;
}

function formatDate(value: string) {
  return formatBeijingDateTime(value, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatKickoffTime(value: string) {
  return formatBeijingDateTime(value, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isDisplayableFixture(match: WorldCupMatch) {
  const teams = `${match.homeTeam.name} ${match.awayTeam.name}`;
  return !/(winner|loser)\s+match|group\s+[a-l]\s+(winners?|runners-up)|third place/i.test(teams);
}

function readSavedSportType(): SportType {
  if (typeof window === "undefined") return "football";
  const saved = window.localStorage.getItem("worldcup.sportType");
  return saved === "basketball" || saved === "swimming" || saved === "football" ? saved : "football";
}

function getOpsState(input: {
  loading: boolean;
  error?: string;
  filteredCount: number;
  priorityCount: number;
  watchCount: number;
  lowCount: number;
  status: SourceStatus;
}) {
  if (input.loading) {
    return {
      metrics: { priority: "…", watch: "…", low: "…" },
      copy: "真实比赛池加载中，系统正在判断当前哪些比赛值得优先投入。",
      cards: {
        priority: { value: "加载中", body: "等待接口返回后再判断优先制作场次。" },
        watch: { value: "加载中", body: "比赛池尚未完成初始化，先保留观察位。" },
        direction: { value: "待判断", body: "等比赛池返回后，再决定主推方向。" },
        risk: { value: "待确认", body: "当前先不要对外输出定性判断。" }
      }
    };
  }

  if (input.error) {
    return {
      metrics: { priority: "-", watch: "-", low: "-" },
      copy: `真实数据请求失败：${input.error}。请检查数据源设置后重试。`,
      cards: {
        priority: { value: "请求失败", body: "当前不适合根据空接口强行给出优先场次。" },
        watch: { value: "等待重试", body: "检查接口配置后重试，或等待数据源恢复。" },
        direction: { value: "等待数据", body: "取得可核验的赛事数据后再判断制作方向。" },
        risk: { value: "中", body: "空数据时不要把平台建议和比赛判断写成确定结论。" }
      }
    };
  }

  if (input.filteredCount === 0 && input.status === "fallback") {
    return {
      metrics: { priority: 0, watch: 0, low: 0 },
      copy: "当前未取得可展示的真实比赛，请检查数据源配置。",
      cards: {
        priority: { value: "示例模式", body: "当前没有真实比赛可排优先级，不展示伪判断。" },
        watch: { value: "无可展示场次", body: "当前比赛池为空，等待数据源返回场次。" },
        direction: { value: "等待数据", body: "取得可核验的赛事数据后再进行分析与内容生成。" },
        risk: { value: "待确认", body: "未取得真实数据时不输出实时赛事判断。" }
      }
    };
  }

  if (input.filteredCount === 0) {
    return {
      metrics: { priority: 0, watch: 0, low: 0 },
      copy: "当前暂未返回可分析的比赛数据，不输出缺少依据的运营结论。",
      cards: {
        priority: { value: "无数据", body: "没有比赛时不展示伪优先级。" },
        watch: { value: "无数据", body: "当前没有可观察比赛，等待接口更新。" },
        direction: { value: "等待数据", body: "比赛池恢复后再判断主推方向。" },
        risk: { value: "低", body: "不要在无数据情况下产出看似真实的实时建议。" }
      }
    };
  }

  return {
    metrics: { priority: input.priorityCount, watch: input.watchCount, low: input.lowCount },
    copy: "当前比赛池可用于复盘和选题储备；是否优先制作，需结合具体赛事证据。风险提醒：避免黑幕、保送、确认伤退等定性表达。",
    cards: {
      priority: { value: `${input.priorityCount} 场`, body: "先处理高热度、强叙事、平台适配清晰的比赛。" },
      watch: { value: `${input.watchCount} 场`, body: "适合作为素材储备，等待赛后舆情和平台热度变化。" },
      direction: { value: "赛后复盘", body: "从关键事件与已确认数据切入，具体方向以单场分析为准。" },
      risk: { value: "中风险", body: "避免黑幕、保送、确认伤退等定性表达。" }
    }
  };
}
