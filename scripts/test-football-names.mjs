import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const sourcePath = new URL("../lib/services/footballNames.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;

const outDir = join(tmpdir(), "worldcup-copilot-football-names-test");
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const modulePath = join(outDir, "footballNames.mjs");
writeFileSync(modulePath, compiled, "utf8");

const { localizeCompetitionName, localizeMatchStatus, localizeTeamName } = await import(`file:///${modulePath.replaceAll("\\", "/")}`);

assert.equal(localizeTeamName("Japan"), "日本");
assert.equal(localizeTeamName("United States"), "美国");
assert.equal(localizeTeamName("Korea Republic"), "韩国");
assert.equal(localizeCompetitionName("FIFA World Cup 2026"), "2026 世界杯");
assert.equal(localizeMatchStatus("Scheduled"), "未开始");
assert.equal(localizeMatchStatus("Finished"), "已结束");

console.log("football names ok");
