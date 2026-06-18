import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const sourcePath = new URL("../lib/services/matchDetailPresentation.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;

const outDir = join(tmpdir(), "worldcup-copilot-match-detail-test");
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const modulePath = join(outDir, "matchDetailPresentation.mjs");
writeFileSync(modulePath, compiled, "utf8");

const {
  buildDraftReviewFlow,
  buildMatchHotspotShortlist,
  buildTeamRadarData
} = await import(`file:///${modulePath.replaceAll("\\", "/")}`);

const match = {
  id: "usa-paraguay",
  isExample: false,
  name: "美国 vs 巴拉圭",
  stage: "小组赛",
  time: "2026-06-15 08:00",
  teamA: "美国",
  teamB: "巴拉圭",
  score: "4-1",
  summary: "美国队通过开场乌龙球和高效射正拉开比分。",
  stats: {
    teamA: { possession: 57, shots: 14, shotsOnTarget: 7, corners: 5, fouls: 10, yellowCards: 1 },
    teamB: { possession: 43, shots: 7, shotsOnTarget: 2, corners: 2, fouls: 14, yellowCards: 3 }
  },
  keyPlayers: [],
  keyEvents: [
    { minute: "4'", team: "巴拉圭", type: "进球", description: "D. Bobadilla own goal，巴拉圭后卫乌龙球。" },
    { minute: "62'", team: "美国", type: "进球", description: "美国队扩大比分。" }
  ],
  historicalMeetings: []
};

const radar = buildTeamRadarData(match);
assert.deepEqual(radar.map((item) => item.metric), ["控球", "射门", "射正", "角球", "纪律"]);
assert.ok(radar.every((item) => typeof item[match.teamA] === "number" && typeof item[match.teamB] === "number"));
assert.ok(radar.find((item) => item.metric === "射正")[match.teamA] > radar.find((item) => item.metric === "射正")[match.teamB]);

const hotspots = buildMatchHotspotShortlist({
  match,
  signals: [
    {
      id: "signal-own-goal",
      label: "乌龙球",
      minute: "4'",
      team: "巴拉圭",
      evidence: "巴拉圭后卫乌龙球",
      topicSeed: "乌龙球如何改变美国 vs 巴拉圭的传播节奏？",
      contentValue: 94,
      riskLevel: "低",
      recommendedPlatforms: ["抖音", "微博"],
      contentFormats: ["短视频脚本"],
      angleHints: ["转折明确"]
    }
  ],
  hotItems: [
    {
      id: "general",
      title: "世界杯开幕式嘉宾阵容",
      summary: "泛世界杯热点",
      source: "微博",
      platform: "微博",
      relevance: 45,
      valueScore: 80,
      heat: "300万",
      tags: ["世界杯"]
    },
    {
      id: "match-hot",
      title: "美国队4比1巴拉圭 乌龙球",
      summary: "美国队凭借开场乌龙球建立优势",
      source: "抖音",
      platform: "抖音",
      relevance: 82,
      valueScore: 88,
      heat: "520万",
      tags: ["美国", "巴拉圭", "乌龙球"]
    }
  ]
});
assert.equal(hotspots[0].title, "美国队4比1巴拉圭 乌龙球");
assert.ok(hotspots[0].heatScore > hotspots[1].heatScore);
assert.ok(hotspots.every((item) => item.matchReason.includes("美国") || item.matchReason.includes("巴拉圭") || item.source === "场上事件"));

const review = buildDraftReviewFlow(
  "美国队这场彻底打爆巴拉圭，巴拉圭后卫乌龙就是灾难。",
  match
);
assert.equal(review.result.advice, "修改后发布");
assert.ok(review.riskPoints.some((item) => item.includes("引战表达")));
assert.ok(review.rewriteSuggestion.includes("引发讨论"));
assert.ok(!review.rewriteSuggestion.includes("打爆"));

console.log("match detail presentation ok");
