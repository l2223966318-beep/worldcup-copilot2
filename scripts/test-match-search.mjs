import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const sourcePath = new URL("../lib/services/matchSearchService.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;

const outDir = join(tmpdir(), "worldcup-copilot-match-search-test");
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const modulePath = join(outDir, "matchSearchService.mjs");
writeFileSync(modulePath, compiled, "utf8");

const { filterMatchesByQuery, queryLooksLikeMatchSearch } = await import(`file:///${modulePath.replaceAll("\\", "/")}`);

const matches = [
  {
    id: "japan-germany",
    competition: "World Cup",
    round: "Group Stage",
    kickoffTime: "2026-06-16",
    status: "scheduled",
    statusText: "Not Started",
    homeTeam: { name: "Japan" },
    awayTeam: { name: "Germany" },
    venue: { name: "Stadium A", city: "Tokyo" },
    score: { display: "vs" }
  },
  {
    id: "usa-paraguay",
    competition: "World Cup",
    round: "Group Stage",
    kickoffTime: "2026-06-15",
    status: "finished",
    statusText: "Finished",
    homeTeam: { name: "United States" },
    awayTeam: { name: "Paraguay" },
    venue: { name: "Stadium B", city: "Los Angeles" },
    score: { display: "4-1" }
  }
];

assert.equal(filterMatchesByQuery(matches, "日本").length, 1);
assert.equal(filterMatchesByQuery(matches, "日本")[0].id, "japan-germany");
assert.equal(filterMatchesByQuery(matches, "Japan")[0].id, "japan-germany");
assert.equal(filterMatchesByQuery(matches, "美国")[0].id, "usa-paraguay");
assert.equal(queryLooksLikeMatchSearch("日本比赛"), true);
assert.equal(queryLooksLikeMatchSearch("乌龙球"), false);

console.log("match search ok");
