"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronDown, Clipboard, ExternalLink, FileText, History, RefreshCcw, Save, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";

import { AuditPlaceholder, WorkspaceHeading, WorkspaceStatus, type WorkspaceStep } from "@/components/layout/detail-workspace";
import "@/app/detail-workspace.css";

import type { HotTopic } from "@/lib/hot/types";
import { getAiRequestHeaders } from "@/lib/ai/client-access";
import {
  auditHotDraft,
  normalizeHotAudit,
  buildHotAnalysis,
  buildTopicIntro,
  generateHotDraft,
  HOT_RADAR_CACHE_KEY,
  type HotAnalysisResult,
  type HotAuditResult,
  type HotGenerationConfig,
  type HotRadarCache
} from "@/lib/hot/hotTopicWorkflow";
import { readHotTopicAiCache, writeHotTopicAiCache } from "@/lib/services/hotTopicAiCache";
import { readSavedHotDraft, saveHotDraft } from "@/lib/services/hotDraftStore";
import { normalizeHotAnalysis } from "@/lib/hot/normalizeHotAnalysis";
import { formatGeneratedDraft } from "@/lib/ai/generated-draft";
import { GeneratedDocument, GeneratedDraftEditor, ReviewSection, ReviewVerdict } from "@/components/ui/generated-content";
import { formatBeijingDateTime } from "@/lib/time/beijingTime";

const defaultConfig: HotGenerationConfig = {
  platform: "B站",
  contentType: "选题",
  tone: "客观资讯",
  length: "中",
  useMatchFacts: false,
  includeRiskReminder: true
};

const platforms: HotGenerationConfig["platform"][] = ["B站", "微博", "小红书", "抖音", "通用"];
const contentTypes: HotGenerationConfig["contentType"][] = ["选题", "标题", "短文案", "视频脚本", "评论区互动", "图文卡片"];
const tones: HotGenerationConfig["tone"][] = ["专业复盘", "客观资讯", "球迷讨论", "轻松整活", "人物故事", "数据解读", "稳妥表达"];
const lengths: HotGenerationConfig["length"][] = ["短", "中", "长"];
const SETTINGS_STORAGE_KEY = "worldcup.datasource.settings";

export default function HotTopicDetailPage() {
  const [topicId, setTopicId] = useState<string | null>(null);
  useEffect(() => {
    setTopicId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);
  if (topicId === null) return <EmptyCard>正在读取热点缓存...</EmptyCard>;
  return <HotTopicWorkspace key={topicId} topicId={topicId} />;
}

function HotTopicWorkspace({ topicId }: { topicId: string }) {
  const [topic, setTopic] = useState<HotTopic | null>(null);
  const [cacheMeta, setCacheMeta] = useState<{ lastUpdatedAt?: string; message?: string }>({});
  const [loaded, setLoaded] = useState(false);
  const [config, setConfig] = useState<HotGenerationConfig>(defaultConfig);
  const [draft, setDraft] = useState("");
  const [audit, setAudit] = useState<HotAuditResult | null>(null);
  const [copied, setCopied] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [analysis, setAnalysis] = useState<HotAnalysisResult | null>(null);
  const [topicIntro, setTopicIntro] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "loading" | "live" | "fallback" | "cache" | "error">("idle");
  const [analysisMessage, setAnalysisMessage] = useState("");
  const [contentStatus, setContentStatus] = useState<"idle" | "loading" | "live" | "fallback" | "error">("idle");
  const [contentMessage, setContentMessage] = useState("");
  const [auditStatus, setAuditStatus] = useState<"idle" | "loading" | "live" | "fallback" | "error">("idle");
  const [auditMessage, setAuditMessage] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");
  const generationRequestId = useRef(0);
  const auditRequestId = useRef(0);

  useEffect(() => () => {
    generationRequestId.current += 1;
    auditRequestId.current += 1;
  }, []);

  useEffect(() => {
    const snapshot = readHotTopicSnapshot(topicId);
    const stored = readSavedHotDraft(topicId);
    if (stored) {
      setConfig(stored.config);
      setDraft(stored.draft);
      setSaved(true);
      setHasSavedDraft(true);
    }
    setTopic((current) => (JSON.stringify(current) === JSON.stringify(snapshot.topic) ? current : snapshot.topic));
    setCacheMeta(snapshot.cacheMeta);
    setLoaded(true);
  }, [topicId]);

  useEffect(() => {
    refreshDeepseekKey(setDeepseekKey);

    function syncKey() {
      refreshDeepseekKey(setDeepseekKey);
    }

    window.addEventListener("focus", syncKey);
    window.addEventListener("storage", syncKey);
    document.addEventListener("visibilitychange", syncKey);

    return () => {
      window.removeEventListener("focus", syncKey);
      window.removeEventListener("storage", syncKey);
      document.removeEventListener("visibilitychange", syncKey);
    };
  }, []);

  const fallbackAnalysis = useMemo(() => (topic ? buildHotAnalysis(topic) : null), [topic]);
  const fallbackIntro = useMemo(() => (topic ? buildTopicIntro(topic) : ""), [topic]);

  useEffect(() => {
    let active = true;
    if (!topic) {
      setAnalysis(null);
      setTopicIntro("");
      setAnalysisStatus("idle");
      setAnalysisMessage("");
      return;
    }

    const fallbackAnalysisSnapshot = fallbackAnalysis ?? buildHotAnalysis(topic);
    const cachedAnalysis = readHotTopicAiCache<{
      sourceStatus: "live";
      intro: string;
      analysis: HotAnalysisResult;
    }>(window.localStorage, topic);
    if (cachedAnalysis) {
      const safeAnalysis = normalizeHotAnalysis(cachedAnalysis.analysis, fallbackAnalysisSnapshot);
      const safeIntro = typeof cachedAnalysis.intro === "string" ? cachedAnalysis.intro : fallbackIntro;
      setAnalysis(safeAnalysis);
      setTopicIntro(safeIntro);
      setAnalysisStatus("cache");
      setAnalysisMessage("");
      return;
    }

    setAnalysis(fallbackAnalysisSnapshot);
    setTopicIntro(fallbackIntro);
    setAnalysisStatus("loading");
    setAnalysisMessage("");
    const currentDeepseekKey = getStoredDeepseekKey();

    void fetch("/api/ai/hot-topic", {
      method: "POST",
      headers: getAiRequestHeaders(),
      body: JSON.stringify({ topic, apiKey: currentDeepseekKey || undefined })
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          sourceStatus?: "live" | "fallback" | "error";
          intro?: string;
          analysis?: HotAnalysisResult;
          message?: string;
        };
        if (!active) return;
        const nextIntro = typeof payload.intro === "string" && payload.intro.trim() ? payload.intro : fallbackIntro;
        const nextAnalysis = normalizeHotAnalysis(payload.analysis, fallbackAnalysisSnapshot);
        setTopicIntro(nextIntro);
        setAnalysis(nextAnalysis);
        setAnalysisStatus(payload.sourceStatus === "live" ? "live" : payload.sourceStatus === "fallback" ? "fallback" : "error");
        setAnalysisMessage(payload.message || "");
        if (payload.sourceStatus === "live") {
          writeHotTopicAiCache(window.localStorage, topic, {
            sourceStatus: "live",
            intro: nextIntro,
            analysis: nextAnalysis
          });
        }
      })
      .catch((error) => {
        if (!active) return;
        setAnalysis(fallbackAnalysisSnapshot);
        setTopicIntro(fallbackIntro);
        setAnalysisStatus("error");
        setAnalysisMessage(error instanceof Error ? error.message : "热点分析请求失败。");
      });

    return () => {
      active = false;
    };
  }, [topic, fallbackAnalysis, fallbackIntro]);

  function invalidatePendingRequests() {
    generationRequestId.current += 1;
    auditRequestId.current += 1;
    setContentStatus("idle");
    setContentMessage("");
    setAudit(null);
    setAuditStatus("idle");
    setAuditMessage("");
    setSaved(false);
    setSaveMessage("");
  }

  function updateConfig<Key extends keyof HotGenerationConfig>(key: Key, value: HotGenerationConfig[Key]) {
    invalidatePendingRequests();
    setConfig((current) => ({ ...current, [key]: value }));
    setDraft("");
  }

  async function generateDraft() {
    if (!topic) return;
    const requestId = ++generationRequestId.current;
    auditRequestId.current += 1;
    const currentDeepseekKey = getStoredDeepseekKey();
    setDeepseekKey(currentDeepseekKey);
    setContentStatus("loading");
    setContentMessage("");
    setAudit(null);
    setAuditStatus("idle");
    setAuditMessage("");
    setSaved(false);
    setSaveMessage("");
    try {
      const response = await fetch("/api/ai/hot-topic-workflow", {
        method: "POST",
        headers: getAiRequestHeaders(),
        body: JSON.stringify({
          action: "generate",
          topic,
          config,
          apiKey: currentDeepseekKey || undefined
        })
      });
      const payload = (await response.json()) as {
        sourceStatus?: "live" | "fallback" | "error";
        draft?: string;
        message?: string;
      };
      if (generationRequestId.current !== requestId) return;
      setDraft(formatGeneratedDraft(payload.draft) || generateHotDraft(topic, config));
      setContentStatus(payload.sourceStatus === "live" ? "live" : payload.sourceStatus === "fallback" ? "fallback" : "error");
      setContentMessage(payload.message || "");
    } catch (error) {
      if (generationRequestId.current !== requestId) return;
      setDraft(generateHotDraft(topic, config));
      setContentStatus("error");
      setContentMessage(error instanceof Error ? error.message : "内容生成失败。");
    }
  }

  async function reviewDraft() {
    if (!topic || !draft.trim()) return;
    const requestId = ++auditRequestId.current;
    const currentDeepseekKey = getStoredDeepseekKey();
    setDeepseekKey(currentDeepseekKey);
    setAuditStatus("loading");
    setAuditMessage("");
    setAudit(null);
    try {
      const response = await fetch("/api/ai/hot-topic-workflow", {
        method: "POST",
        headers: getAiRequestHeaders(),
        body: JSON.stringify({
          action: "audit",
          topic,
          config,
          draft,
          apiKey: currentDeepseekKey || undefined
        })
      });
      const payload = (await response.json()) as {
        sourceStatus?: "live" | "fallback" | "error";
        audit?: HotAuditResult;
        message?: string;
      };
      if (auditRequestId.current !== requestId) return;
      setAudit(normalizeHotAudit(payload.audit, draft, auditHotDraft(draft, topic, config.platform, config.contentType)));
      setAuditStatus(payload.sourceStatus === "live" ? "live" : payload.sourceStatus === "fallback" ? "fallback" : "error");
      setAuditMessage(payload.message || "");
    } catch (error) {
      if (auditRequestId.current !== requestId) return;
      setAudit(auditHotDraft(draft, topic, config.platform, config.contentType));
      setAuditStatus("error");
      setAuditMessage(error instanceof Error ? error.message : "内容审核失败。");
    }
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1200);
  }

  function saveDraft() {
    if (!topic || !draft.trim()) return;
    const success = saveHotDraft({
      topicId: topic.id,
      title: topic.title,
      config,
      draft,
      savedAt: new Date().toISOString()
    });
    setSaved(success);
    if (success) setHasSavedDraft(true);
    setSaveMessage(success ? "" : "草稿未保存：浏览器存储不可用，请先复制正文。");
  }

  function restoreDraft() {
    const stored = readSavedHotDraft(topicId);
    if (!stored) {
      setHasSavedDraft(false);
      setSaveMessage("未找到本热点的已保存草稿。");
      return;
    }
    invalidatePendingRequests();
    setConfig(stored.config);
    setDraft(stored.draft);
    setSaved(true);
    setContentMessage("已恢复本地保存的草稿。");
  }

  if (!loaded) {
    return <EmptyCard>正在读取热点缓存...</EmptyCard>;
  }

  if (!topic) {
    return (
      <EmptyCard>
        <div className="text-2xl font-black text-slate-950">暂无该热点缓存</div>
        <p className="mt-3 text-sm leading-6 text-slate-500">请回到首页点击“更新热点”获取最新内容，再进入热点分析与生产页面。</p>
        <Link href="/" className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5">
          返回首页
        </Link>
      </EmptyCard>
    );
  }

  return (
    <div className="detail-workspace mx-auto flex max-w-6xl flex-col gap-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5">
          <ArrowLeft className="h-4 w-4" />
          返回今日机会池
        </Link>
        <div className="text-xs font-semibold text-slate-500">
          {cacheMeta.lastUpdatedAt ? `热点缓存更新时间：${formatBeijingDateTime(cacheMeta.lastUpdatedAt, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "暂无更新时间"}
        </div>
      </div>

      <section className="workspace-section">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_270px]">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold leading-snug text-slate-950 [overflow-wrap:anywhere]">{topic.title}</h1>
            <div className="mt-4">
              <p className="mt-2 max-w-3xl text-base leading-8 text-slate-700">{topicIntro || fallbackIntro}</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {topic.category ? <Badge>{topic.category}</Badge> : null}
              {topic.leverageValue ? <Badge strong={topic.valueLevel === "high"}>{topic.leverageValue}</Badge> : null}
              {typeof topic.valueScore === "number" ? <Badge>{`价值分 ${topic.valueScore}`}</Badge> : null}
              {(topic.tags ?? []).slice(0, 6).map((tag) => <Badge key={tag}>{tag}</Badge>)}
            </div>
          </div>
          <div className="min-w-0 border-t border-slate-200 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="grid grid-cols-2 gap-5 text-sm">
              <MetaItem label="来源" value={topic.source} />
              <MetaItem label="平台" value={topic.platform ?? "全网"} />
              <MetaItem label="热度" value={String(topic.heat ?? "-")} />
              <MetaItem label="价值" value={topic.leverageValue ?? "待判断"} />
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
              {analysisStatus === "loading"
                ? "分析引擎：正在生成精炼判断"
                : analysisStatus === "live"
                  ? "分析引擎：DeepSeek"
                  : analysisStatus === "cache"
                    ? "分析引擎：DeepSeek 缓存"
                    : "分析引擎：本地规则兜底"}
            </div>
            {topic.url ? (
              <a href={topic.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white text-sm font-semibold text-emerald-700 transition hover:-translate-y-0.5">
                查看来源
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {analysis ? (
        <section aria-label="热点分析与生产判断" className="grid border-y border-slate-200 bg-white lg:grid-cols-2">
          <div className="min-w-0 border-t-2 border-emerald-500 bg-emerald-50/40 px-5 py-6 sm:px-7 sm:py-7">
            <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-950"><Sparkles aria-hidden="true" className="h-9 w-9 shrink-0 rounded-lg bg-emerald-100 p-2 text-emerald-700" />热点分析</h2>
            <InsightRows items={analysis.overview} />
            <AnalysisDetails title="价值说明与内容切入">
              <DetailBlock title="价值说明" items={analysis.whyCare} compact />
              <DetailBlock title="内容切入" items={analysis.angles} compact />
            </AnalysisDetails>
          </div>
          <div className="min-w-0 border-t-2 border-sky-500 bg-sky-50/40 px-5 py-6 sm:px-7 sm:py-7 lg:border-l lg:border-l-slate-200">
            <h2 className="flex items-center gap-3 text-lg font-semibold text-slate-950"><ShieldCheck aria-hidden="true" className="h-9 w-9 shrink-0 rounded-lg bg-sky-100 p-2 text-sky-700" />生产判断</h2>
            <InsightRows items={analysis.production} />
            <AnalysisDetails title="核验边界与风险提醒">
              <DetailBlock title="核验边界" items={analysis.factsToVerify} compact />
              <DetailBlock title="风险提醒" items={analysis.risks} compact />
            </AnalysisDetails>
          </div>
        </section>
      ) : null}

      <section className="workspace-section">
        <WorkspaceHeading title="内容生成配置" icon={<SlidersHorizontal className="h-5 w-5" />} />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField label="平台" value={config.platform} options={platforms} onChange={(value) => updateConfig("platform", value as HotGenerationConfig["platform"])} />
          <SelectField label="生成类型" value={config.contentType} options={contentTypes} onChange={(value) => updateConfig("contentType", value as HotGenerationConfig["contentType"])} />
          <SelectField label="风格类型" value={config.tone} options={tones} onChange={(value) => updateConfig("tone", value as HotGenerationConfig["tone"])} />
          <SelectField label="长度" value={config.length} options={lengths} onChange={(value) => updateConfig("length", value as HotGenerationConfig["length"])} />
          <ToggleField label="引用比赛事实" checked={config.useMatchFacts} onChange={(value) => updateConfig("useMatchFacts", value)} />
          <ToggleField label="加入风险提醒" checked={config.includeRiskReminder} onChange={(value) => updateConfig("includeRiskReminder", value)} />
        </div>
        <div className="mt-6 border-t border-slate-100 pt-5">
          <WorkspaceStatus steps={[
            { label: "热点分析", detail: toStatusLabel(analysisStatus), state: toStepState(analysisStatus) },
            { label: "内容生成", detail: toStatusLabel(contentStatus), state: toStepState(contentStatus) },
            { label: "稿件审核", detail: toStatusLabel(auditStatus), state: toStepState(auditStatus) }
          ]} />
        </div>
        <button
          type="button"
          onClick={generateDraft}
          disabled={contentStatus === "loading"}
          className="workspace-button mt-5 bg-teal-700 text-white hover:bg-teal-800"
        >
          <Sparkles className="h-4 w-4" />
          {contentStatus === "loading" ? "生成中..." : "生成内容"}
        </button>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {contentStatus === "loading"
            ? "内容引擎正在处理当前热点。"
            : contentStatus === "live"
              ? "内容引擎：DeepSeek 已参与生成。"
              : contentStatus === "fallback"
                ? "内容引擎：当前使用本地兜底模板。"
                : contentStatus === "error"
                  ? `内容引擎异常：${contentMessage || "已改用本地兜底。"}`
                  : ""}
        </p>
      </section>

      <section className="grid divide-y divide-slate-200 border-y border-slate-200 bg-white lg:grid-cols-[1.2fr_0.8fr] lg:divide-x lg:divide-y-0">
        <Panel title="生成结果编辑区" icon={<FileText className="h-5 w-5" />}>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-y border-slate-200 bg-slate-50 px-2 py-2">
            <div className="flex items-center gap-1">
              <ActionButton onClick={() => draft && copyText(draft, "draft")} icon={<Clipboard className="h-4 w-4" />} disabled={!draft} compact>{copied === "draft" ? "已复制" : "复制"}</ActionButton>
              <ActionButton onClick={saveDraft} icon={<Save className="h-4 w-4" />} disabled={!draft} compact>{saved ? "已保存" : "保存草稿"}</ActionButton>
              <ActionButton onClick={restoreDraft} icon={<History className="h-4 w-4" />} disabled={!hasSavedDraft} compact>恢复草稿</ActionButton>
              <ActionButton onClick={generateDraft} icon={<RefreshCcw className="h-4 w-4" />} disabled={contentStatus === "loading"} compact>重新生成</ActionButton>
            </div>
            <ActionButton onClick={reviewDraft} icon={<ShieldCheck className="h-4 w-4" />} disabled={!draft || auditStatus === "loading"} primary>{auditStatus === "loading" ? "审核中..." : "一键审核"}</ActionButton>
          </div>
          <GeneratedDraftEditor
            label="生成结果编辑区"
            value={draft}
            loading={contentStatus === "loading"}
            onChange={(value) => {
              invalidatePendingRequests();
              setDraft(value);
              setSaved(false);
              setAudit(null);
              setAuditStatus("idle");
              setAuditMessage("");
            }}
          />
          {saveMessage ? <p role="status" className="mt-3 text-xs leading-5 text-amber-700">{saveMessage}</p> : null}
          {contentMessage && contentStatus !== "error" ? <p className="mt-3 text-xs leading-5 text-slate-500">{contentMessage}</p> : null}
        </Panel>

        <Panel title="审核结果" icon={<ShieldCheck className="h-5 w-5" />}>
          {audit ? (
            <div className="mt-5">
              <ReviewVerdict
                title={audit.level === "pass" ? "内容可用" : audit.level === "revise" ? "建议修改" : "需要修改"}
                tone={audit.level === "pass" ? "pass" : audit.level === "revise" ? "warning" : "danger"}
                metrics={[
                  { label: "需要修改", value: audit.authenticity.length + audit.risk.length + audit.ethics.length },
                  { label: "修改建议", value: audit.suggestions.length },
                  { label: "补充提醒", value: audit.reminders?.length ?? 0 }
                ]}
              />
              {audit.suggestions.length ? <ReviewSection title="修改建议" items={audit.suggestions} defaultOpen /> : null}
              {audit.reminders?.length ? <ReviewSection title="补充提醒" items={audit.reminders} /> : null}
              <ReviewSection title="真实性审核" items={audit.authenticity} defaultOpen={audit.authenticity.length > 0} tone="warning" />
              <ReviewSection title="表达风险" items={audit.risk} defaultOpen={audit.risk.length > 0} tone="warning" />
              <ReviewSection title="传播伦理" items={audit.ethics} defaultOpen={audit.ethics.length > 0} />
              <ReviewSection title="平台适配" items={audit.platformFit} defaultOpen={audit.platformFit.length > 0} />
              {audit.level !== "pass" ? (
                <div className="mt-5 border-t border-slate-200 pt-5">
                  <div className="text-sm font-semibold text-teal-700">建议改写</div>
                  <GeneratedDocument text={audit.rewriteSuggestion} className="mt-4" />
                  <button
                    type="button"
                    onClick={() => {
                      invalidatePendingRequests();
                      setDraft(formatGeneratedDraft(audit.rewriteSuggestion));
                      setSaved(false);
                      setAudit(null);
                      setAuditStatus("idle");
                      setAuditMessage("");
                    }}
                    disabled={!audit.rewriteSuggestion.trim()}
                    className="workspace-button mt-4 bg-teal-700 text-white hover:bg-teal-800"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    应用建议
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <AuditPlaceholder loading={auditStatus === "loading"} />
          )}
          <p className="mt-4 text-xs leading-5 text-slate-500">
            {auditStatus === "loading"
              ? "审核引擎正在校验真实性、风险和平台适配。"
              : auditStatus === "live"
                ? "审核引擎：DeepSeek 已参与分析。"
                : auditStatus === "fallback"
                  ? "审核引擎：当前使用本地规则兜底。"
                  : auditStatus === "error"
                    ? `审核引擎异常：${auditMessage || "已改用本地规则。"}`
                    : ""}
          </p>
          {analysisMessage ? <p className="mt-4 text-xs leading-5 text-slate-500">{analysisMessage}</p> : null}
          {auditMessage && auditStatus !== "error" ? <p className="mt-2 text-xs leading-5 text-slate-500">{auditMessage}</p> : null}
        </Panel>
      </section>
    </div>
  );
}

function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl rounded-[32px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
      {children}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="card-lift-light min-w-0 p-5 sm:p-6">
      <WorkspaceHeading title={title} icon={icon} />
      {children}
    </section>
  );
}

function DetailBlock({ title, items, compact }: { title: string; items: string[]; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="mt-5">
      <div className="text-xs font-semibold text-slate-500">{title}</div>
      <ul className={`mt-2 text-sm text-slate-600 ${compact ? "space-y-1.5 leading-6" : "space-y-2 leading-6"}`}>
        {items.map((item) => <li key={item}>· {item}</li>)}
      </ul>
    </div>
  );
}

function InsightRows({ items }: { items: HotAnalysisResult["overview"] }) {
  return (
    <dl className="mt-6 divide-y divide-slate-200/70">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="grid gap-y-1.5 py-5 first:pt-0 last:pb-0 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-x-4">
          <dt className="break-words text-sm font-medium leading-6 text-slate-500">{item.label}</dt>
          <dd className="min-w-0 space-y-1.5 [overflow-wrap:anywhere]">
            <p className="text-base font-semibold leading-6 text-slate-950">{item.value}</p>
            {item.note ? <p className="text-sm leading-7 text-slate-600">{item.note}</p> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AnalysisDetails({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group mt-6 border-t border-slate-200/80 pt-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg bg-white/80 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-1 pb-1 pt-5 [&>div:first-child]:mt-0">{children}</div>
    </details>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="workspace-select mt-2"
      >
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 self-end rounded-md bg-slate-50 px-3 py-3">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 shrink-0 accent-teal-600" />
    </label>
  );
}

function ActionButton({ children, icon, primary, compact, disabled, onClick }: { children: ReactNode; icon: ReactNode; primary?: boolean; compact?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={typeof children === "string" ? children : undefined}
      aria-label={compact && typeof children === "string" ? children : undefined}
      className={`${compact ? "workspace-icon-button disabled:opacity-40" : "workspace-button"} ${primary ? "bg-teal-700 text-white hover:bg-teal-800" : compact ? "" : "border border-slate-200 bg-white text-slate-700"}`}
    >
      {icon}
      {compact ? <span className="sr-only">{children}</span> : children}
    </button>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-950 [overflow-wrap:anywhere]">{value}</div>
    </div>
  );
}

function Badge({ children, strong }: { children: string | number; strong?: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${strong ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-white/85 text-emerald-800 ring-emerald-100"}`}>
      {children}
    </span>
  );
}

function readHotTopicSnapshot(topicId: string): { topic: HotTopic | null; cacheMeta: { lastUpdatedAt?: string; message?: string } } {
  if (typeof window === "undefined") return { topic: null, cacheMeta: {} };

  try {
    const raw = window.localStorage.getItem(HOT_RADAR_CACHE_KEY);
    const cache = raw ? (JSON.parse(raw) as HotRadarCache) : null;
    const topic = cache?.topics.find((item) => item.id === topicId) ?? null;
    return {
      topic,
      cacheMeta: { lastUpdatedAt: cache?.lastUpdatedAt, message: cache?.message }
    };
  } catch {
    return { topic: null, cacheMeta: {} };
  }
}

function getStoredDeepseekKey() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    const settings = raw ? (JSON.parse(raw) as { deepseekKey?: string }) : null;
    return settings?.deepseekKey?.trim() ?? "";
  } catch {
    return "";
  }
}

function refreshDeepseekKey(setter: (value: string) => void) {
  setter(getStoredDeepseekKey());
}

function toStatusLabel(status: "idle" | "loading" | "live" | "fallback" | "cache" | "error") {
  if (status === "idle") return "待处理";
  if (status === "loading") return "处理中";
  if (status === "live") return "已完成";
  if (status === "cache") return "已完成 · 已缓存";
  if (status === "fallback") return "初步结果";
  return "初步结果 · 服务暂不可用";
}

function toStepState(status: "idle" | "loading" | "live" | "fallback" | "cache" | "error"): WorkspaceStep["state"] {
  if (status === "loading") return "active";
  if (status === "live" || status === "cache") return "complete";
  if (status === "fallback" || status === "error") return "warning";
  return "waiting";
}
