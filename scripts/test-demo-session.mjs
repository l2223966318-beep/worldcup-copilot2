import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const directory = mkdtempSync(join(tmpdir(), "worldcup-demo-test-"));
try {
  for (const [source, output] of [["data/matches.ts", "matches"], ["data/national-demo.ts", "national-demo"], ["lib/services/demoSession.ts", "demoSession"]]) {
    const text = readFileSync(new URL(`../${source}`, import.meta.url), "utf8")
      .replaceAll("@/data/matches", "./matches.mjs")
      .replaceAll("@/data/national-demo", "./national-demo.mjs");
    writeFileSync(join(directory, `${output}.mjs`), ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText);
  }
  const { createDemoSession, parseDemoSession, updateDemoEntry, parseDemoReview } = await import(pathToFileURL(join(directory, "demoSession.mjs")).href);
  const seed = createDemoSession();
  assert.equal(Object.keys(seed.entries).length, 6);
  assert.deepEqual(parseDemoSession(JSON.stringify(seed)), seed);
  const changed = updateDemoEntry(seed, "timeline:bilibili", "Edited copy", "edited", "2026-09-28T08:00:00Z");
  assert.equal(changed.entries["timeline:bilibili"].review, null, "editing invalidates the old review");
  assert.equal(seed.entries["timeline:bilibili"].origin, "example", "the preset remains immutable");
  assert.equal(changed.entries["timeline:weibo"].body, seed.entries["timeline:weibo"].body);
  assert.deepEqual(parseDemoSession(JSON.stringify(changed)), changed, "edited content survives export and restore");
  const stale = structuredClone(seed);
  stale.entries["timeline:bilibili"].body = "new text";
  assert.equal(parseDemoSession(JSON.stringify(stale)).entries["timeline:bilibili"].review, null);
  assert.equal(parseDemoSession("not json"), null);
  assert.equal(parseDemoSession(JSON.stringify({ ...seed, version: 2 })), null);
  assert.equal(parseDemoSession(JSON.stringify({ ...seed, caseId: "different-match" })), null);
  assert.equal(parseDemoSession(JSON.stringify({ ...seed, entries: {} })), null);
  assert.equal(parseDemoSession("x".repeat(1_000_001)), null);
  const malformed = structuredClone(seed);
  malformed.entries["timeline:bilibili"].review.result.findings = [{ type: "invalid" }];
  assert.equal(parseDemoSession(JSON.stringify(malformed)), null);
  const withCredential = { ...seed, apiKey: "do-not-import", analysis: { ...seed.analysis, apiKey: "do-not-import" } };
  assert.equal(JSON.stringify(parseDemoSession(JSON.stringify(withCredential))).includes("do-not-import"), false);
  assert.equal(parseDemoReview({ level: "low", score: Infinity, advice: "x", findings: [] }), null);
  console.log("Demo session: round-trip, isolated edits, review invalidation and malformed imports passed.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
