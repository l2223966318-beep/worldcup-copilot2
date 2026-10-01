"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clipboard, Download, ExternalLink, FileDown, FileUp, Loader2, Pencil, RefreshCcw, ShieldCheck } from "lucide-react";
import { ReadableTextBlock } from "@/components/ui/readable-text";
import { getAiRequestHeaders } from "@/lib/ai/client-access";
import { DEMO_COLLECTED_AT, demoAnalysis, demoContext, demoEvidence, demoMatch, demoPlatforms, demoSources, demoTopics, type DemoPlatform } from "@/data/national-demo";
import { copyToClipboard, downloadTextFile } from "@/lib/download";
import { createContentPackage, createPackageMarkdown, createPendingReviewResult } from "@/lib/services/exportService";
import { createDemoSession, DEMO_STORAGE_KEY, demoEntryKey, parseDemoReview, parseDemoSession, updateDemoEntry, type DemoOrigin } from "@/lib/services/demoSession";
import { downloadWordReport } from "@/lib/word-export";
import "./demo.css";

const originLabels: Record<DemoOrigin, string> = { example: "预置编辑示例", ai: "已保存 AI 结果", edited: "手动编辑" };
const steps = [{ id: "case", label: "赛事与来源" }, { id: "topic", label: "选题判断" }, { id: "draft", label: "平台内容" }, { id: "review", label: "审核与导出" }] as const;

export default function NationalDemoPage() {
  const [session, setSession] = useState(createDemoSession);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [topicId, setTopicId] = useState(demoTopics[0].id);
  const [platform, setPlatform] = useState<DemoPlatform>("bilibili");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState("正在读取案例");
  const [editing, setEditing] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const topic = demoTopics.find((item) => item.id === topicId)!;
  const key = demoEntryKey(topicId, platform);
  const entry = session.entries[key];
  const review = entry.review?.draft === entry.body ? entry.review : null;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
      const saved = raw ? parseDemoSession(raw) : null;
      if (saved) setSession(saved);
      if (raw && !saved) setNotice("保存的案例格式已变化，已打开预置案例。");
    } catch { setNotice("浏览器存储不可用，可下载案例包保存结果。"); }
    setReady(true);
    return () => activeRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(session));
      setSaveState("案例已保存在本机");
    } catch { setSaveState("本机保存失败，请下载案例包"); }
  }, [ready, session]);

  async function runAi(kind: "analysis" | "draft" | "review") {
    if (activeRequest.current || !ready) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(kind);
    setNotice("正在请求 AI，已有内容保留在页面中。");
    const timer = window.setTimeout(() => controller.abort(), 45_000);
    try {
      let apiKey: string | undefined;
      try {
        const settings = JSON.parse(window.localStorage.getItem("worldcup.datasource.settings") || "{}");
        apiKey = typeof settings.deepseekKey === "string" ? settings.deepseekKey.trim() : undefined;
      } catch { /* Server-side credentials can still be used. */ }
      const analysis = { ...demoAnalysis, summary: session.analysis.text, sourceStatus: session.analysis.origin === "ai" ? "ai" : "fallback" };
      const request = kind === "analysis"
        ? { path: "match-workflow", body: { match: demoMatch, baselineTopics: [], apiKey } }
        : kind === "draft"
          ? { path: "platform-draft", body: { matchContext: demoContext, topic, analysis, platform, contentType: demoPlatforms.find((item) => item.id === platform)!.format, topicMode: topicId === "after-final" ? "playerStory" : "professional", apiKey } }
          : { path: "review-draft", body: { draft: entry.body, matchContext: demoContext, evidence: demoEvidence, apiKey } };
      const response = await fetch(`/api/ai/${request.path}`, { method: "POST", headers: getAiRequestHeaders(), body: JSON.stringify(request.body), signal: controller.signal });
      const payload = await response.json();
      if (!response.ok || payload.sourceStatus !== "live") throw new Error(payload.message || "AI 暂未返回可用结果，已保留原有内容。");
      const now = new Date().toISOString();
      if (kind === "analysis") {
        if (!Array.isArray(payload.conclusions) || !payload.conclusions.length || payload.conclusions.some((item: { title?: unknown; body?: unknown }) => typeof item?.title !== "string" || typeof item?.body !== "string")) throw new Error("分析结果不完整，已保留原有内容。");
        const text = payload.conclusions.map((item: { title: string; body: string }) => `【${item.title}】\n${item.body}`).join("\n\n");
        setSession((current) => ({ ...current, savedAt: now, analysis: { text, origin: "ai", updatedAt: now } }));
      } else if (kind === "draft") {
        if (typeof payload.draft?.body !== "string" || !payload.draft.body.trim()) throw new Error("文案结果为空，已保留原有内容。");
        setSession((current) => updateDemoEntry(current, key, payload.draft.body, "ai", now));
      } else {
        const result = parseDemoReview(payload.result);
        if (!result) throw new Error("审核结果不完整，已保留原有内容。");
        setSession((current) => ({ ...current, savedAt: now, entries: { ...current.entries, [key]: { ...current.entries[key], review: { draft: entry.body, result, origin: "ai", updatedAt: now } } } }));
      }
      setNotice("AI 结果已更新。发布前仍需人工核验。");
    } catch (error) {
      setNotice(controller.signal.aborted ? "请求已停止，原有内容已保留。" : error instanceof Error ? error.message : "请求失败，原有内容已保留。");
    } finally {
      window.clearTimeout(timer);
      if (activeRequest.current === controller) activeRequest.current = null;
      setBusy("");
    }
  }

  async function importCase(file?: File) {
    if (!file || activeRequest.current) return;
    try {
      if (file.size > 1_000_000) throw new Error("案例包不能超过 1 MB。");
      const saved = parseDemoSession(await file.text());
      if (activeRequest.current) return;
      if (!saved) throw new Error("不是有效的本案例文件，现有内容已保留。");
      setSession(saved);
      setEditing(false);
      setNotice("案例包已载入。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "案例包读取失败。"); }
  }

  async function exportWord() {
    try {
      const report = createContentPackage({
        matchContext: demoContext,
        analysis: { ...demoAnalysis, summary: session.analysis.text, sourceStatus: session.analysis.origin === "ai" ? "ai" : "fallback" },
        selectedTopic: topic,
        platformDraft: { id: key, platform, title: topic.title, body: entry.body, sections: [{ title: "可直接发布版", content: entry.body }], createdAt: entry.updatedAt || new Date().toISOString() },
        reviewResult: review?.result ?? createPendingReviewResult(demoEvidence)
      });
      const provenance = `> 历史赛事回放；文案：${originLabels[entry.origin]}；分析：${originLabels[session.analysis.origin]}；审核：${review ? originLabels[review.origin] : "待审核"}。资料整理日期：${DEMO_COLLECTED_AT}。\n\n`;
      await downloadWordReport(`世界杯历史案例_${platform}.docx`, provenance + createPackageMarkdown(report));
      setNotice("Word 报告已导出。");
    } catch { setNotice("Word 导出失败，请重试或先下载案例包。"); }
  }

  return (
    <div className="national-demo">
      <div className="demo-topbar">
        <Link href="/pitch"><ArrowLeft size={16} /> 返回答辩</Link>
        <div className="demo-top-actions">
          <span className="demo-save-state" role="status">{saveState}</span>
          <button disabled={!ready || Boolean(busy)} title="导入案例包" aria-label="导入案例包" onClick={() => fileInput.current?.click()}><FileUp size={18} /></button>
          <button disabled={!ready} title="下载完整案例包" aria-label="下载完整案例包" onClick={() => downloadTextFile("worldcup-national-demo.json", JSON.stringify(session, null, 2), "application/json")}><FileDown size={18} /></button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(event) => { void importCase(event.target.files?.[0]); event.target.value = ""; }} />
          <Link href="/">赛事工作台 <ArrowRight size={15} /></Link>
        </div>
      </div>

      <header className="demo-match-header">
        <div>
          <div className="demo-eyebrow">WORLDCUP COPILOT <span>历史赛事回放</span></div>
          <h1>阿根廷 <span className="demo-score">3 : 3</span> 法国</h1>
          <p>2022 世界杯决赛 · 北京时间 2022/12/18 23:00 · 点球大战 4 : 2</p>
        </div>
        <div className="demo-case-meta"><strong>国赛演示案例</strong><span>历史资料 + 预置内容示例</span><span>资料整理：{DEMO_COLLECTED_AT}</span></div>
      </header>

      <nav className="demo-steps" aria-label="演示步骤">
        {steps.map((item, index) => <button key={item.id} type="button" aria-current={step === index ? "step" : undefined} className={step === index ? "is-active" : ""} onClick={() => setStep(index)}><span>0{index + 1}</span>{item.label}<ArrowRight size={16} /></button>)}
      </nav>
      <div className="demo-notice" role="status" aria-live="polite">{busy ? <Loader2 size={15} className="animate-spin" /> : notice ? <Check size={15} /> : null}{notice || "历史资料不代表当前赛况或实时热榜；预置结果为编辑示例。"}{busy ? <button onClick={() => activeRequest.current?.abort()}>取消请求</button> : null}</div>

      {step === 0 ? <section className="demo-two-columns" aria-label="赛事与来源">
        <div><div className="demo-section-heading"><div><span className="demo-kicker">MATCH TIMELINE</span><h2>先还原比赛，再寻找角度</h2></div></div>
          <ol className="demo-timeline">{demoMatch.keyEvents.map((event) => <li key={event.minute}><span>{event.minute}</span><p>{event.description}</p></li>)}</ol>
          <p className="demo-footnote">点球大战单独计分。本案例不展示未经核验的球员评分和技术统计。</p>
        </div>
        <div className="demo-source-panel"><span className="demo-kicker">SOURCE NOTES</span><h2>每条事实都保留出处</h2>
          {demoSources.map((source, index) => <article key={source.url}><span className="demo-source-number">E0{index + 1}</span><h3>{source.title}</h3><p>{demoEvidence[index].text}</p><a href={source.url} target="_blank" rel="noreferrer">查看 FIFA 原文 <ExternalLink size={14} /></a></article>)}
          <p className="demo-footnote">场外案例来自历史公开报道，未标注为平台热榜；原文页面需要联网访问。</p>
        </div>
      </section> : null}

      {step === 1 ? <section aria-label="选题判断">
        <div className="demo-section-heading"><div><span className="demo-kicker">EDITORIAL DECISION</span><h2>从事件到值得做的内容</h2></div><button className="demo-command" disabled={!ready || Boolean(busy)} onClick={() => void runAi("analysis")}><RefreshCcw size={16} />{busy === "analysis" ? "分析中" : "重新分析"}</button></div>
        <div className="demo-analysis"><span className="demo-origin">{originLabels[session.analysis.origin]}</span><ReadableTextBlock text={session.analysis.text} className="demo-readable" emphasizeTitles /></div>
        <div className="demo-topic-grid">{demoTopics.map((item) => <button key={item.id} className={`demo-topic ${topicId === item.id ? "is-selected" : ""}`} disabled={Boolean(busy)} onClick={() => { setTopicId(item.id); setEditing(false); }} aria-pressed={topicId === item.id}><span className="demo-kicker">{item.category}{topicId === item.id ? " · 已选择" : ""}</span><h3>{item.title}</h3><p>{item.coreAngle}</p><small>{item.reason}</small></button>)}</div>
      </section> : null}

      {step === 2 ? <section aria-label="平台内容">
        <div className="demo-section-heading"><div><span className="demo-kicker">PLATFORM OUTPUT</span><h2>{topic.title}</h2></div><div className="demo-tools"><button disabled={Boolean(busy)} title={editing ? "预览文案" : "编辑文案"} aria-label={editing ? "预览文案" : "编辑文案"} onClick={() => setEditing(!editing)}>{editing ? <Check size={18} /> : <Pencil size={18} />}</button><button title="复制文案" aria-label="复制文案" onClick={() => void copyToClipboard(entry.body).then(() => setNotice("文案已复制。")).catch(() => setNotice("复制失败，请在编辑模式中选取内容。"))}><Clipboard size={18} /></button><button className="demo-command" disabled={!ready || Boolean(busy)} onClick={() => void runAi("draft")}><RefreshCcw size={16} />{busy === "draft" ? "生成中" : "重新生成"}</button></div></div>
        <div className="demo-platforms" role="tablist" aria-label="内容平台">{demoPlatforms.map((item) => <button role="tab" aria-selected={platform === item.id} aria-controls="demo-draft-panel" id={`demo-tab-${item.id}`} disabled={Boolean(busy)} key={item.id} onClick={() => { setPlatform(item.id); setEditing(false); }} className={platform === item.id ? "is-active" : ""}>{item.label}</button>)}</div>
        <div className="demo-draft" role="tabpanel" id="demo-draft-panel" aria-labelledby={`demo-tab-${platform}`}><div className="demo-draft-meta"><span className="demo-origin">{originLabels[entry.origin]}</span><span>{entry.updatedAt ? new Date(entry.updatedAt).toLocaleString("zh-CN") : "预置版本"}</span></div>
          {editing ? <textarea aria-label="编辑平台文案" value={entry.body} maxLength={100_000} disabled={Boolean(busy)} onChange={(event) => setSession((current) => updateDemoEntry(current, key, event.target.value, "edited"))} /> : <ReadableTextBlock text={entry.body.replace(/^【标题】\n([^\n]+)/, "标题：$1")} className="demo-readable" emphasizeTitles />}
        </div>
      </section> : null}

      {step === 3 ? <section aria-label="审核与导出">
        <div className="demo-section-heading"><div><span className="demo-kicker">REVIEW & DELIVERY</span><h2>核验依据，再形成交付</h2></div><div className="demo-tools"><button className="demo-command" disabled={!ready || Boolean(busy) || !entry.body.trim()} onClick={() => void runAi("review")}><ShieldCheck size={17} />{busy === "review" ? "审核中" : "重新审核"}</button><button className="demo-command demo-primary" disabled={!ready || Boolean(busy)} onClick={() => void exportWord()}><Download size={17} />导出 Word</button></div></div>
        <div className="demo-review-context">{demoPlatforms.find((item) => item.id === platform)!.label} · {topic.title}</div>
        {review ? <div className="demo-review"><span className="demo-origin">{review.origin === "example" ? "预置审核示例" : originLabels[review.origin]}</span><h3>{review.result.level}</h3><p>{review.result.advice}</p>{review.result.findings.map((finding, index) => <article key={index}><strong>{finding.type}</strong><p>{finding.sentence}</p><p>{finding.reason}</p><p className="demo-review-suggestion">{finding.rewrite}</p></article>)}<p className="demo-footnote">审核针对当前文案；编辑或重新生成后，原审核结果自动失效。</p></div> : <div className="demo-review"><h3>当前文案待审核</h3><p>文案已变更。点击重新审核，或导出明确标注“待审核”的报告。</p></div>}
        <div className="demo-export-note"><FileDown size={20} /><p>案例包包含两条选题、三个平台的文案和对应审核结果，可在另一台电脑导入。<br />本地运行时，已保存内容不依赖外部数据接口。</p><button className="demo-command" disabled={!ready || Boolean(busy)} onClick={() => downloadTextFile("worldcup-national-demo.json", JSON.stringify(session, null, 2), "application/json")}>下载案例包</button></div>
      </section> : null}

      <footer className="demo-footer"><span>WorldCup Copilot · {String(step + 1).padStart(2, "0")} / 04</span><div><button disabled={step === 0} onClick={() => setStep(step - 1)} aria-label="上一步" title="上一步"><ArrowLeft size={18} /></button>{step < 3 ? <button className="demo-command demo-primary" onClick={() => setStep(step + 1)}>{steps[step + 1].label}<ArrowRight size={17} /></button> : <Link href="/">返回赛事工作台 <ArrowRight size={17} /></Link>}</div></footer>
    </div>
  );
}
