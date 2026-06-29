import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const files = [
  "types/workflow.ts",
  "lib/ai/quality.ts",
  "lib/services/analysisService.ts",
  "lib/services/contentService.ts",
  "lib/services/exportService.ts"
];

const outDir = join(tmpdir(), "worldcup-copilot-workflow-test");
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "types"), { recursive: true });
mkdirSync(join(outDir, "lib/ai"), { recursive: true });
mkdirSync(join(outDir, "lib/services"), { recursive: true });

for (const file of files) {
  const sourcePath = new URL(`../${file}`, import.meta.url);
  const source = readFileSync(sourcePath, "utf8")
    .replaceAll("@/types/workflow", "../../types/workflow.mjs")
    .replaceAll("@/lib/services/contentService", "./contentService.mjs")
    .replaceAll("@/lib/ai/quality", "../ai/quality.mjs");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  writeFileSync(join(outDir, file.replace(".ts", ".mjs")), compiled, "utf8");
}

const { createRuleBasedAnalysis } = await import(`file:///${join(outDir, "lib/services/analysisService.mjs").replaceAll("\\", "/")}`);
const { createPlatformDraft, supportedPlatforms, contentTypeOptions, topicModeOptions } = await import(`file:///${join(outDir, "lib/services/contentService.mjs").replaceAll("\\", "/")}`);
const { createContentPackage, createPackageMarkdown } = await import(`file:///${join(outDir, "lib/services/exportService.mjs").replaceAll("\\", "/")}`);

const matchContext = {
  id: "match-1",
  matchInfo: {
    id: "match-1",
    name: "美国 vs 巴拉圭",
    teamA: "美国",
    teamB: "巴拉圭",
    score: "4-1",
    stage: "Group Stage",
    time: "2026-06-15",
    sourceStatus: "live"
  },
  keyEvents: [{ minute: "4'", team: "巴拉圭", type: "乌龙球", description: "D. Bobadilla own goal" }],
  keyPlayers: [{ name: "美国前锋", team: "美国", role: "前锋", rating: 8.1 }],
  stats: {
    teamA: { possession: 57, shots: 14, shotsOnTarget: 7, corners: 5, fouls: 10, yellowCards: 1, xg: 2.2 },
    teamB: { possession: 43, shots: 7, shotsOnTarget: 2, corners: 2, fouls: 14, yellowCards: 3, xg: 0.8 }
  },
  hotSignals: [{ label: "开场乌龙球", topicSeed: "乌龙球如何改变比赛走势", contentValue: 92 }],
  evidence: [
    {
      id: "E01",
      type: "match_event",
      text: "4' 巴拉圭后卫乌龙球",
      source: "Sportradar",
      minute: "4'",
      relevance: 98
    }
  ],
  summary: "美国队大胜，开场乌龙球成为传播热点。"
};

const topic = {
  id: "topic-1",
  title: "乌龙球如何改变美国队比赛走势",
  category: "数据向选题",
  coreAngle: "从场上突发事件解释比赛走势",
  reason: "热点事件和比分走势同时成立",
  riskLevel: "低",
  recommendedFormat: "短视频口播 + 微博讨论"
};

const analysis = createRuleBasedAnalysis(matchContext);
assert.equal(analysis.matchId, "match-1");
assert.ok(analysis.turningPoints.some((item) => item.includes("乌龙球")));

const douyin = createPlatformDraft("douyin", matchContext, topic, analysis);
const bilibili = createPlatformDraft("bilibili", matchContext, topic, analysis);
const bilibiliTopic = createPlatformDraft("bilibili", matchContext, topic, analysis, { contentType: "topic", topicMode: "playful" });
const punctuatedTopic = createPlatformDraft(
  "bilibili",
  matchContext,
  { ...topic, reason: `${topic.reason}。` },
  analysis,
  { contentType: "topic", topicMode: "playful" }
);
assert.equal(supportedPlatforms.includes("douyin"), true);
assert.equal(contentTypeOptions[0].key, "topic");
assert.equal(topicModeOptions.some((item) => item.key === "playful"), true);
assert.deepEqual(
  contentTypeOptions.map((item) => item.label),
  ["选题", "标题", "短文案", "视频脚本", "评论区互动", "图文卡片"]
);
assert.deepEqual(
  topicModeOptions.map((item) => item.label),
  ["专业复盘", "客观资讯", "球迷讨论", "轻松整活", "人物故事", "数据解读", "稳妥表达"]
);
assert.notEqual(douyin.body, bilibili.body);
assert.ok(douyin.body.includes("可直接发布版"));
const topicSection = bilibiliTopic.sections.find((section) => section.title === "选题角度");
assert.ok(topicSection);
assert.equal((topicSection.content.match(/^\d+\./gm) ?? []).length, 5);
assert.ok(topicSection.content.includes("怎么做："));
assert.ok(topicSection.content.includes("说明："));
assert.ok(topicSection.content.includes("动漫"));
assert.equal(bilibiliTopic.sections.length, 1);
assert.equal(punctuatedTopic.body.includes("。。"), false);

const basicContext = {
  ...matchContext,
  verifiedStats: false,
  stats: {
    teamA: { possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0 },
    teamB: { possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0 }
  }
};
const basicAnalysis = createRuleBasedAnalysis(basicContext);
const basicDraft = createPlatformDraft("bilibili", basicContext, topic, basicAnalysis);
assert.ok(basicAnalysis.dataInsights.some((item) => item.includes("未返回可核验")));
assert.equal(basicAnalysis.dataInsights.some((item) => item.includes("50%")), false);
assert.equal(basicDraft.body.includes("射门0次"), false);

const pkg = createContentPackage({
  matchContext,
  analysis,
  selectedTopic: topic,
  platformDraft: douyin,
  reviewResult: { level: "低", score: 18, findings: [], advice: "可发布" }
});
assert.equal(pkg.matchInfo.name, "美国 vs 巴拉圭");
assert.equal(pkg.platformDraft.platform, "douyin");
const packageMarkdown = createPackageMarkdown(pkg);
assert.ok(packageMarkdown.includes("可直接发布版"));
assert.ok(packageMarkdown.includes("## 证据与来源"));
assert.ok(packageMarkdown.includes("E01｜Sportradar｜4' 巴拉圭后卫乌龙球"));

console.log("workflow services ok");
