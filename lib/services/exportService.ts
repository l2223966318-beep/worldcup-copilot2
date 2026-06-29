import { ensurePublishable } from "@/lib/ai/quality";
import type { AnalysisResult, ContentPackage, MatchContext, PlatformDraft, ReviewResultSnapshot, WorkflowTopic } from "@/types/workflow";

export function createContentPackage(input: {
  matchContext: MatchContext;
  analysis: AnalysisResult;
  selectedTopic: WorkflowTopic;
  platformDraft: PlatformDraft;
  reviewResult: ReviewResultSnapshot;
}): ContentPackage {
  return {
    matchInfo: input.matchContext.matchInfo,
    analysis: input.analysis,
    selectedTopic: input.selectedTopic,
    platformDraft: input.platformDraft,
    reviewResult: input.reviewResult,
    evidence: input.matchContext.evidence ?? input.reviewResult.evidence ?? [],
    createdAt: new Date().toISOString()
  };
}

export function createPackageMarkdown(contentPackage: ContentPackage) {
  const { matchInfo, analysis, selectedTopic, platformDraft, reviewResult, evidence = [], createdAt } = contentPackage;
  const primarySection = platformDraft.sections.find((section) =>
    section.title.includes("可直接发布") || section.title.includes("选题角度")
  ) ?? platformDraft.sections[0];
  const referenceSection = platformDraft.sections.find((section) => section.title.includes("编辑参考"));
  const platformRiskSection = platformDraft.sections.find((section) => section.title.includes("风险提示"));
  const primaryHeading = primarySection?.title.includes("选题角度") ? "选题方案" : "可直接发布版";

  return [
    `# ${matchInfo.name}｜${platformName(platformDraft.platform)}内容方案`,
    "",
    `- 生成时间：${formatReportDate(createdAt)}`,
    `- 比赛：${matchInfo.teamA} vs ${matchInfo.teamB}`,
    `- 比分：${matchInfo.score}`,
    `- 阶段：${matchInfo.stage}`,
    `- 目标平台：${platformName(platformDraft.platform)}`,
    "",
    `## ${primaryHeading}`,
    ensurePublishable(primarySection?.content ?? platformDraft.body),
    "",
    "## 编辑参考版",
    `- 核心选题：${ensurePublishable(selectedTopic.title)}`,
    `- 核心看点：${ensurePublishable(selectedTopic.coreAngle)}`,
    `- 制作形式：${ensurePublishable(selectedTopic.recommendedFormat)}`,
    `- 选题说明：${ensurePublishable(selectedTopic.reason)}`,
    "",
    ...(referenceSection?.content ? [ensurePublishable(referenceSection.content), ""] : []),
    ensurePublishable(analysis.summary),
    "",
    ensurePublishable(analysis.winLossReason),
    "",
    "## 审核结果",
    `- 等级：${reviewResult.level}`,
    ...(reviewResult.level === "待审核" ? [] : [`- 风险分：${reviewResult.score}`]),
    `- 建议：${ensurePublishable(reviewResult.advice)}`,
    "",
    "## 风险提示",
    ...(platformRiskSection?.content ? [ensurePublishable(platformRiskSection.content)] : []),
    ...reviewResult.findings.map((finding) => {
      const ids = finding.evidenceIds?.length ? `（依据 ${finding.evidenceIds.join("、")}）` : "";
      return `- ${finding.type}${ids}：${ensurePublishable(finding.rewrite)}`;
    }),
    "",
    "## 证据与来源",
    ...(evidence.length
      ? evidence.map((item) => `- ${item.id}｜${item.source}｜${item.text}${item.sourceUrl ? `｜${item.sourceUrl}` : ""}`)
      : ["- 当前报告未附可核验来源。"])
  ].map((line) => ensurePublishable(line)).join("\n");
}

export function createPackageText(contentPackage: ContentPackage) {
  return createPackageMarkdown(contentPackage).replace(/^#+\s*/gm, "");
}

export function createPendingReviewResult(evidence: ReviewResultSnapshot["evidence"] = []): ReviewResultSnapshot {
  return {
    level: "待审核",
    score: 0,
    findings: [],
    advice: "尚未执行 AI 审核",
    evidence
  };
}

export function buildContentReportFilename(input: {
  matchName: string;
  platform?: string;
  topicTitle?: string;
  createdAt?: string;
}) {
  const match = sanitizeFilenamePart(input.matchName.replace(/^.*?[：:]\s*/, ""), 28) || "赛事";
  const platform = sanitizeFilenamePart(platformName(input.platform), 12) || "综合";
  const topic = sanitizeFilenamePart(input.topicTitle || "内容方案", 24) || "内容方案";
  const date = reportDateKey(input.createdAt);
  return `${match}_${platform}_${topic}_${date}.docx`;
}

function platformName(platform?: string) {
  const labels: Record<string, string> = {
    bilibili: "B站",
    xiaohongshu: "小红书",
    weibo: "微博",
    douyin: "抖音",
    videoScript: "视频脚本",
    article: "公众号"
  };
  return platform ? labels[platform] ?? platform : "综合";
}

function sanitizeFilenamePart(value: string, maxLength: number) {
  return ensurePublishable(value)
    .replace(/\s+(?:vs|VS)\s+/g, "vs")
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "")
    .replace(/[.。]+$/g, "")
    .slice(0, maxLength);
}

function reportDateKey(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function formatReportDate(value: string) {
  const key = reportDateKey(value);
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
}
