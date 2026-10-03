import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

const { getTeamFlagPath, localizeCompetitionName, localizeMatchStatus, localizeTeamName } = await import(`file:///${modulePath.replaceAll("\\", "/")}`);

assert.equal(localizeTeamName("Japan"), "日本");
assert.equal(localizeTeamName("United States"), "美国");
assert.equal(localizeTeamName("Korea Republic"), "韩国");
assert.equal(localizeCompetitionName("FIFA World Cup 2026"), "2026 世界杯");
assert.equal(localizeMatchStatus("Scheduled"), "未开始");
assert.equal(localizeMatchStatus("Finished"), "已结束");

assert.equal(getTeamFlagPath("England"), "/flags/gb-eng.png");
assert.equal(getTeamFlagPath("英格兰队"), "/flags/gb-eng.png");
assert.equal(getTeamFlagPath("Argentina"), "/flags/ar.png");
assert.equal(getTeamFlagPath("阿根廷"), "/flags/ar.png");
assert.equal(getTeamFlagPath("Scotland"), "/flags/gb-sct.png");
assert.equal(getTeamFlagPath("Wales"), "/flags/gb-wls.png");
assert.equal(getTeamFlagPath("Unknown Team"), undefined);
const flagFiles = readdirSync(new URL("../public/flags/", import.meta.url)).filter(name => name.endsWith(".png"));
assert.ok(flagFiles.length >= 61, "all mapped national teams have local flag assets");
for (const name of flagFiles) {
  const png = readFileSync(new URL(`../public/flags/${name}`, import.meta.url));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${name} must be PNG`);
  assert.equal(png.readUInt32BE(16), 160, `${name} must have the expected asset width`);
  assert.ok(png.readUInt32BE(20) > 0, `${name} must have a nonzero height`);
}

console.log("football names ok");
