import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const files = [
  "lib/ai/quality.ts",
  "lib/services/evidenceService.ts"
];
const outDir = join(tmpdir(), "worldcup-copilot-evidence-test");

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "lib/ai"), { recursive: true });
mkdirSync(join(outDir, "lib/services"), { recursive: true });

for (const file of files) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
    .replaceAll("@/lib/ai/quality", "../ai/quality.mjs")
    .replaceAll("@/types/workflow", "../../types/workflow.mjs");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  writeFileSync(join(outDir, file.replace(".ts", ".mjs")), compiled, "utf8");
}

const { auditDraftEvidence, buildEvidencePack } = await import(
  `file:///${join(outDir, "lib/services/evidenceService.mjs").replaceAll("\\", "/")}`
);

const matchContext = {
  id: "arg-fra",
  matchInfo: {
    id: "arg-fra",
    name: "阿根廷 vs 法国",
    teamA: "阿根廷",
    teamB: "法国",
    score: "2-1",
    stage: "决赛",
    time: "2026-07-19",
    sourceStatus: "live"
  },
  keyEvents: [
    { minute: "81'", team: "法国", type: "goal", description: "完成进球，比分变为2-1" }
  ],
  keyPlayers: [],
  stats: {
    teamA: { possession: 54, shots: 12, shotsOnTarget: 6, corners: 5, fouls: 11, yellowCards: 1 },
    teamB: { possession: 46, shots: 10, shotsOnTarget: 5, corners: 3, fouls: 13, yellowCards: 2 }
  },
  hotSignals: [],
  summary: "决赛"
};

const evidence = buildEvidencePack(matchContext, [
  {
    title: "法国追分引发讨论",
    summary: "比赛末段热度上升",
    source: "微博",
    url: "https://example.com/hot",
    valueScore: 88
  }
]);

assert.ok(evidence.some((item) => item.source === "Sportradar"));
assert.ok(evidence.some((item) => item.source === "微博" && item.sourceUrl));
assert.deepEqual(evidence.map((item) => item.id), evidence.map((_, index) => `E${String(index + 1).padStart(2, "0")}`));

const supported = auditDraftEvidence("法国在81分钟完成进球，比分变为2-1。", evidence);
assert.equal(supported.summary.checkedClaims, 1);
assert.equal(supported.summary.supportedClaims, 1);
assert.equal(supported.findings.length, 0);

const missing = auditDraftEvidence("法国在70分钟完成进球。", evidence);
assert.equal(missing.summary.unsupportedClaims, 1);
assert.equal(missing.findings[0].sentence, "法国在70分钟完成进球");
assert.equal(missing.findings[0].evidenceStatus, "missing");

const opinion = auditDraftEvidence("这场决赛后劲很大，值得重新看一遍。", evidence);
assert.equal(opinion.summary.checkedClaims, 0);
assert.equal(opinion.findings.length, 0);

console.log("evidence review workflow ok");
