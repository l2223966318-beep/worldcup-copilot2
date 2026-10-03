import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
const modules = new Map();
function load(relative) {
  const path = resolve(root, relative);
  if (modules.has(path)) return modules.get(path).exports;
  const module = { exports: {} };
  modules.set(path, module);
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: path })(
    name => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : nodeRequire(name),
    module, module.exports
  );
  return module.exports;
}

const failures = [];
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
}
const quality = load("lib/ai/quality.ts");
const { auditDraftEvidence, buildEvidencePack } = load("lib/services/evidenceService.ts");
const { worldCupMatchToMatchData } = load("lib/sports/adapters.ts");
const { createRuleBasedAnalysis } = load("lib/services/analysisService.ts");
const evidence = [{ id: "E01", type: "match_stat", source: "test", relevance: 100,
  text: "阿根廷射门12次、射正6次；法国射门10次、射正5次" }];

check("short titles preserve the actual subject", () => {
  for (const platform of ["bilibili", "article", "weibo", "xiaohongshu"]) {
    assert.equal(quality.cleanTitle("日本逆转德国", platform), "日本逆转德国");
    assert.doesNotMatch(quality.cleanTitle("墨西哥击败南非", platform), /梅西|阿根廷|法国/);
  }
});
check("uncertainty survives text cleanup and export preparation", () => {
  for (const text of ["待核验信息：某球员确认伤退。", "需补充来源：球队发生冲突。", "待进一步确认。", "暂无信息。"])
    assert.equal(quality.cleanText(text), text);
});
check("team, metric and value must belong to the same fact", () => {
  for (const text of ["法国射门12次。", "阿根廷射正12次。", "巴西射门12次。", "阿根廷射门5次。"])
    assert.equal(auditDraftEvidence(text, evidence).summary.unsupportedClaims, 1, text);
  for (const text of ["阿根廷射门12次。", "法国射正5次。"])
    assert.equal(auditDraftEvidence(text, evidence).summary.supportedClaims, 1, text);
});
check("a scoreboard is a factual claim even without a statistics keyword", () => {
  assert.equal(auditDraftEvidence("阿根廷以9-0战胜法国。", []).summary.unsupportedClaims, 1);
  const scores = [{ id: "E01", type: "match_stat", text: "阿根廷 vs 法国，比分 2-1", source: "test" }];
  assert.equal(auditDraftEvidence("阿根廷以2-1战胜法国。", scores).summary.supportedClaims, 1);
  assert.equal(auditDraftEvidence("法国以2-1战胜阿根廷。", scores).summary.unsupportedClaims, 1);
  assert.equal(auditDraftEvidence("巴西以2-1战胜法国。", scores).summary.unsupportedClaims, 1);
});
check("a correct statistic cannot hide an unchecked score or incompatible unit", () => {
  for (const text of ["阿根廷射门12次且比分9-0。", "阿根廷射门12张。", "阿根廷与法国射门差2%。"])
    assert.equal(auditDraftEvidence(text, evidence).summary.unsupportedClaims, 1, text);
  assert.equal(auditDraftEvidence("阿根廷与法国射门差2次。", evidence).summary.supportedClaims, 1);
});
check("matching minutes do not bypass the event subject", () => {
  const events = [{ id: "E01", type: "match_event", text: "85' 法国获得角球", minute: "85'", source: "test" }];
  assert.equal(auditDraftEvidence("85分钟巴西获得角球。", events).summary.unsupportedClaims, 1);
  assert.equal(auditDraftEvidence("85分钟法国获得角球。", events).summary.supportedClaims, 1);
  assert.equal(auditDraftEvidence("86分钟法国获得角球。", events).summary.unsupportedClaims, 1);
});

const match = { id: "test", season: 2026, competition: "FIFA World Cup", round: "Final",
  status: "finished", statusText: "closed", kickoffTime: "2026-07-20T00:00:00Z",
  homeTeam: { name: "Spain" }, awayTeam: { name: "Argentina" },
  score: { home: 1, away: 0, display: "1-0" }, venue: { name: "Test" },
  source: { provider: "sportradar" }, statistics: [],
  events: [{ minute: 10, team: "Spain", type: "score_change", detail: "goal" }] };
check("missing statistics remain unknown even when events exist", () => {
  const adapted = worldCupMatchToMatchData(match);
  assert.equal(adapted.stats.teamA.possession, null);
  assert.equal(adapted.stats.teamB.shots, null);
  assert.equal(adapted.verifiedStats, false);
  assert.equal(adapted.keyPlayers.length, 0, "team placeholders must not invent player ratings");
  const context = { ...adapted, matchInfo: { ...adapted, sourceStatus: "live" }, hotSignals: [] };
  assert.equal(buildEvidencePack(context).some(item => /控球率|射门|射正/.test(item.text)), false);
  assert.doesNotMatch(createRuleBasedAnalysis(context).dataInsights.join(""), /null|50%|射门 0/);
});
check("valid zero statistics are not mistaken for missing data", () => {
  const adapted = worldCupMatchToMatchData({ ...match, statistics: ["Spain", "Argentina"].map(team => ({ team,
    values: ["Ball Possession", "Total Shots", "Shots on Goal", "Corner Kicks", "Fouls", "Yellow Cards"].map(type => ({ type, value: 0 })) })) });
  assert.equal(adapted.stats.teamA.shots, 0);
  assert.equal(adapted.verifiedStats, true);
});
check("Chinese historical events and corners survive key-event selection", () => {
  const adapted = worldCupMatchToMatchData({ ...match, events: [
    { minute: 10, team: "Spain", type: "进球", detail: "西班牙打入一球" },
    { minute: 15, team: "Spain", type: "corner_kick", detail: "corner kick" },
    { minute: 20, team: "Spain", type: "throw_in", detail: "throw in" },
    { minute: 25, team: "Spain", type: "goal_kick", detail: "goal kick" }
  ] });
  assert.deepEqual(adapted.keyEvents.map(event => event.minute), ["10'", "15'"]);
  assert.deepEqual(adapted.keyEvents.map(event => event.type), ["进球", "角球"]);
  assert.match(adapted.keyEvents[1].description, /获得角球/);
});

check("export preserves the reviewed draft and uncertainty markers", () => {
  const { createPackageMarkdown } = load("lib/services/exportService.ts");
  const body = "待核验信息：某球员确认伤退。";
  const exported = createPackageMarkdown({ matchInfo: { name: "测试", teamA: "A", teamB: "B", score: "1-0", stage: "测试" },
    analysis: { summary: "分析", winLossReason: "来源待补充" }, selectedTopic: { title: "测试", coreAngle: "测试", recommendedFormat: "短评", reason: "测试" },
    platformDraft: { platform: "weibo", body, sections: [{ title: "可直接发布版", content: body }] },
    reviewResult: { level: "待人工确认", score: 0, advice: "待人工确认", findings: [] },
    evidence: [{ id: "E01", source: "待补充", text: "需补充来源：伤病情况。" }], createdAt: "2026-10-01T00:00:00Z" });
  assert.ok(exported.includes(body));
  assert.ok(exported.includes("需补充来源：伤病情况。"));
});

let aiResponse = { ok: false, message: "test unavailable" };
modules.set(resolve(root, "lib/ai/deepseek.ts"), { exports: {
  generateDeepSeekJson: async () => aiResponse, getDeepSeekFallbackMessage: message => message
} });
const { reviewDraftWithAi } = load("lib/ai/review-draft.ts");
const adapted = worldCupMatchToMatchData(match);
const reviewContext = { ...adapted, matchInfo: { ...adapted, sourceStatus: "live" }, hotSignals: [] };
for (const [name, response] of [
  ["unavailable model", { ok: false, message: "test unavailable" }],
  ["empty model response", { ok: true, data: {}, model: "test" }],
  ["malformed model findings", { ok: true, data: { score: 0, findings: [null] }, model: "test" }],
  ["model findings without a score", { ok: true, data: { findings: [] }, model: "test" }]
]) {
  aiResponse = response;
  const result = await reviewDraftWithAi({ draft: "阿根廷以9-0战胜法国。", matchContext: reviewContext, evidence: [] });
  check(`${name} cannot approve a draft`, () => {
    assert.equal(result.sourceStatus, "fallback");
    assert.equal(result.result.level, "待人工确认");
    assert.notEqual(result.result.advice, "可发布");
  });
}
aiResponse = { ok: true, data: { level: "低", score: 0, findings: [] }, model: "test" };
const wrong = await reviewDraftWithAi({ draft: "法国射门12次。", matchContext: reviewContext, evidence });
check("a model pass cannot override a conflicting statistic", () => {
  assert.equal(wrong.result.evidenceSummary.unsupportedClaims, 1);
  assert.notEqual(wrong.result.advice, "可发布");
});
const correct = await reviewDraftWithAi({ draft: "法国射门10次。", matchContext: reviewContext, evidence });
check("a supported fact with a complete model review can pass", () => {
  assert.equal(correct.result.advice, "可发布");
  assert.equal(correct.result.evidenceSummary.supportedClaims, 1);
});
aiResponse = { ok: true, data: { score: 95, findings: [{ sentence: "法国在70分钟完成进球", evidenceStatus: "missing", reason: "证据未收录", rewrite: "删除内容" }] }, model: "test" };
const incompleteEvidence = await reviewDraftWithAi({ draft: "法国在70分钟完成进球。", matchContext: reviewContext, evidence: [] });
check("missing evidence stays advisory and does not force a rewrite", () => {
  assert.equal(incompleteEvidence.result.level, "低");
  assert.ok(incompleteEvidence.result.findings.every(finding => finding.evidenceStatus === "missing"));
  assert.equal(incompleteEvidence.rewriteSuggestion, "法国在70分钟完成进球。");
  assert.match(incompleteEvidence.result.advice, /补充来源/);
});
aiResponse = { ok: true, data: { topics: [{ title: "比赛转折点的战术复盘", category: "战术复盘",
  recommendation: "主推", difficulty: "低", productionCost: "中", riskLevel: "高" }] }, model: "test" };
const { enhanceMatchWorkflowWithDeepSeek } = load("lib/ai/deepseek-workflow.ts");
const enhanced = await enhanceMatchWorkflowWithDeepSeek({ match: adapted, baselineTopics: [] });
check("AI labels preserve readable Chinese categories and levels", () => {
  const topic = enhanced.topics[0];
  assert.equal(topic.category, "战术复盘");
  assert.equal(topic.recommendation, "主推");
  assert.deepEqual([topic.difficulty, topic.productionCost, topic.riskLevel], ["低", "中", "高"]);
});
assert.equal(failures.length, 0, `Fact integrity regressions: ${failures.join(", ")}`);
