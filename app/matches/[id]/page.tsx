"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clipboard, Download, ShieldCheck } from "lucide-react";

import { InsightCharts } from "@/components/worldcup/insight-charts";
import { generatePlatformContent, type PlatformContent } from "@/lib/ai/content";
import { reviewRisk } from "@/lib/ai/risk";
import { generateTopics, type TopicIdea } from "@/lib/ai/topics";
import { copyToClipboard, downloadTextFile } from "@/lib/download";
import { analyzeMatch, getMatchDetail, getMatchTask } from "@/lib/project-api";

const platformLabels = {
  bilibili: "B站",
  weibo: "微博",
  xiaohongshu: "小红书",
  article: "公众号"
} as const;

type PlatformKey = keyof typeof platformLabels;

export default function MatchAnalysisPage() {
  const params = useParams<{ id: string }>();
  const match = getMatchDetail(params.id);
  const task = getMatchTask(params.id);
  const analysis = useMemo(() => analyzeMatch(match), [match]);
  const topics = useMemo(() => generateTopics(match).slice(0, 3), [match]);
  const [selectedTopicId, setSelectedTopicId] = useState(topics[0]?.id);
  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId) ?? topics[0];
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformKey[]>(["bilibili", "weibo"]);
  const [generated, setGenerated] = useState(false);
  const content = useMemo(() => generatePlatformContent(match, selectedTopic), [match, selectedTopic]);
  const selectedText = useMemo(() => buildSelectedContent(content, selectedPlatforms), [content, selectedPlatforms]);
  const risk = useMemo(() => reviewRisk(selectedText), [selectedText]);
  const markdown = useMemo(() => buildMarkdown(match.name, selectedTopic, selectedPlatforms, content, risk.advice), [
    content,
    match.name,
    risk.advice,
    selectedPlatforms,
    selectedTopic
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 pb-16">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-700">
        <ArrowLeft className="h-4 w-4" />
        返回今日比赛池
      </Link>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-sm font-semibold text-blue-700">比赛基础信息</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal text-slate-950">
              {match.teamA} <span className="text-blue-600">{match.score}</span> {match.teamB}
            </h1>
            <p className="mt-3 text-sm text-slate-500">{match.stage}｜已结束｜{match.time}</p>
          </div>
          <div className="rounded-2xl bg-slate-950 px-5 py-4 text-white">
            <div className="text-xs text-slate-300">内容优先级</div>
            <div className="mt-1 text-4xl font-semibold">{task.priority}</div>
          </div>
        </div>
        <p className="mt-5 max-w-4xl text-base leading-7 text-slate-600">{match.summary}</p>
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="控球率" value={`${match.stats.teamA.possession}% / ${match.stats.teamB.possession}%`} />
        <StatCard label="射门" value={`${match.stats.teamA.shots} / ${match.stats.teamB.shots}`} />
        <StatCard label="射正" value={`${match.stats.teamA.shotsOnTarget} / ${match.stats.teamB.shotsOnTarget}`} />
        <StatCard label="xG" value={`${match.stats.teamA.xg} / ${match.stats.teamB.xg}`} />
        <StatCard label="角球" value={`${match.stats.teamA.corners} / ${match.stats.teamB.corners}`} />
        <StatCard label="犯规" value={`${match.stats.teamA.fouls} / ${match.stats.teamB.fouls}`} />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-slate-950">数据可视化</h2>
          <p className="mt-1 text-sm text-slate-500">只保留最适合内容表达的核心图表。</p>
        </div>
        <InsightCharts match={match} />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">AI 赛后解读</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <AnalysisCard title="比赛走势" body={analysis.trend} />
          <AnalysisCard title="胜负原因" body={analysis.reason} />
          <AnalysisCard title="关键转折点" body={analysis.turningPoint} />
          <AnalysisCard title="内容价值" body={analysis.contentValue} />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">内容角度推荐</h2>
        <p className="mt-1 text-sm text-slate-500">只推荐 3 个最值得做的角度，避免把功能平铺成标题生成器。</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {topics.map((topic) => (
            <button
              key={topic.id}
              onClick={() => setSelectedTopicId(topic.id)}
              className={`rounded-2xl border p-5 text-left transition ${
                selectedTopic.id === topic.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">{topic.recommendation}</span>
                <span className="text-xs font-semibold text-blue-700">{topic.category}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-950">{topic.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{topic.businessExplanation}</p>
              <div className="mt-4 text-xs text-slate-500">数据依据：{topic.reason}</div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 ring-1 ring-slate-200">适合：B站 / 微博</span>
                <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 ring-1 ring-slate-200">类型：{topic.recommendedFormat}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">选择输出平台</h2>
        <p className="mt-1 text-sm text-slate-500">先看完分析和角度，再决定这场比赛适合发到哪里。</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {(Object.keys(platformLabels) as PlatformKey[]).map((platform) => (
            <label key={platform} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={selectedPlatforms.includes(platform)}
                onChange={() => setSelectedPlatforms((current) => togglePlatform(current, platform))}
                className="h-4 w-4 accent-blue-600"
              />
              {platformLabels[platform]}
            </label>
          ))}
        </div>
        <button
          onClick={() => setGenerated(true)}
          className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
        >
          生成内容
        </button>
      </section>

      {generated ? (
        <>
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-950">内容生成结果</h2>
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {selectedPlatforms.map((platform) => (
                <GeneratedContentCard key={platform} platform={platform} content={content} />
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
                  <ShieldCheck className="h-6 w-6 text-blue-600" />
                  风险审稿
                </h2>
                <p className="mt-1 text-sm text-slate-500">系统不判断真假，只提示需核实和建议人工确认的表达风险。</p>
              </div>
              <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
                <div className="text-xs text-slate-300">发布建议</div>
                <div className="text-lg font-semibold">{risk.advice}</div>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {risk.findings.length ? (
                risk.findings.map((finding, index) => (
                  <div key={`${finding.sentence}-${index}`} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6">
                    <div className="font-semibold text-amber-800">{finding.type}｜{finding.level}风险</div>
                    <div className="mt-2 text-slate-700">风险原句：{finding.sentence}</div>
                    <div className="mt-1 text-slate-600">风险原因：{finding.reason}</div>
                    <div className="mt-1 text-emerald-700">安全改写建议：{finding.rewrite}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  未发现明显规则风险，发布前仍建议人工确认事实和数据来源。
                </div>
              )}
              <button className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                一键应用安全改写
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-950">复制 / 导出</h2>
            <p className="mt-1 text-sm text-slate-500">流程末尾再导出，避免用户还没完成审稿就提前复制。</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => copyToClipboard(selectedText)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Clipboard className="h-4 w-4" />
                复制全部内容
              </button>
              <button
                onClick={() => downloadTextFile(`${match.id}-content-report.md`, markdown, "text/markdown;charset=utf-8")}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Download className="h-4 w-4" />
                导出 Markdown 报告
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function AnalysisCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="font-semibold text-slate-950">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function GeneratedContentCard({ platform, content }: { platform: PlatformKey; content: PlatformContent }) {
  if (platform === "bilibili") {
    return (
      <OutputCard title="B站内容">
        <Line label="标题" value={content.bilibili.titles[0]} />
        <Line label="视频结构" value={content.bilibili.outline.join(" / ")} />
        <Line label="封面文案" value={content.bilibili.coverCopy} />
        <Line label="开头脚本" value={content.bilibili.openingScript} />
        <Line label="评论区置顶" value={content.bilibili.pinnedComment} />
      </OutputCard>
    );
  }
  if (platform === "weibo") {
    return (
      <OutputCard title="微博内容">
        <Line label="短评正文" value={content.weibo.fiveMinuteComment} />
        <Line label="热搜式标题" value={content.weibo.debateQuestion} />
        <Line label="话题标签" value={content.weibo.hashtags.join(" ")} />
      </OutputCard>
    );
  }
  if (platform === "xiaohongshu") {
    return (
      <OutputCard title="小红书内容">
        <Line label="图文标题" value={content.xiaohongshu.titles[0]} />
        <Line label="正文" value={content.xiaohongshu.cards.map((card) => `${card.title}：${card.body}`).join(" / ")} />
        <Line label="标签" value={content.xiaohongshu.tags.join(" ")} />
      </OutputCard>
    );
  }
  return (
    <OutputCard title="公众号内容">
      <Line label="长文标题" value={content.article.title} />
      <Line label="导语" value={content.article.intro} />
      <Line label="分段结构" value={content.article.fullOutline.join(" / ")} />
      <Line label="小标题" value={content.article.subheads.join(" / ")} />
    </OutputCard>
  );
}

function OutputCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm leading-6">
      <span className="font-semibold text-slate-900">{label}：</span>
      <span className="text-slate-600">{value}</span>
    </div>
  );
}

function togglePlatform(current: PlatformKey[], platform: PlatformKey) {
  if (current.includes(platform)) {
    const next = current.filter((item) => item !== platform);
    return next.length ? next : current;
  }
  return [...current, platform];
}

function buildSelectedContent(content: PlatformContent, platforms: PlatformKey[]) {
  return platforms
    .map((platform) => {
      if (platform === "bilibili") return `B站：${content.bilibili.titles[0]}。${content.bilibili.openingScript}`;
      if (platform === "weibo") return `微博：${content.weibo.fiveMinuteComment} ${content.weibo.debateQuestion}`;
      if (platform === "xiaohongshu") return `小红书：${content.xiaohongshu.titles[0]}。${content.xiaohongshu.cards.map((card) => card.body).join("。")}`;
      return `公众号：${content.article.title}。${content.article.intro}`;
    })
    .join("\n\n");
}

function buildMarkdown(title: string, topic: TopicIdea, platforms: PlatformKey[], content: PlatformContent, advice: string) {
  return [
    `# ${title} 内容处理报告`,
    "",
    `## 内容角度`,
    `${topic.title}`,
    "",
    `## 输出平台`,
    platforms.map((platform) => `- ${platformLabels[platform]}`).join("\n"),
    "",
    `## 生成内容`,
    buildSelectedContent(content, platforms),
    "",
    `## 风险审稿`,
    `发布建议：${advice}`,
    "",
    `## 合规说明`,
    "当前内容基于示例数据生成，仅作为运营创作辅助，发布前需人工核实事实、数据来源和平台规则。"
  ].join("\n");
}
