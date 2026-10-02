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
  const { createDemoSession, parseDemoSession, updateDemoEntry, parseDemoReview, serializeDemoSession, DEMO_MAX_FILE_BYTES, DEMO_MAX_JSON_LENGTH } = await import(pathToFileURL(join(directory, "demoSession.mjs")).href);
  const seed = createDemoSession();
  assert.equal(Object.keys(seed.entries).length, 6);
  assert.deepEqual(parseDemoSession(JSON.stringify(seed)), seed);
  assert.equal(DEMO_MAX_JSON_LENGTH, 1_000_000, "keep the existing JSON code-unit limit fixed");
  assert.equal(DEMO_MAX_FILE_BYTES, 3_000_000, "keep the UTF-8 file byte limit fixed");
  const atLimit = JSON.stringify(seed).padEnd(1_000_000, " ");
  assert.deepEqual(parseDemoSession(atLimit), seed, "valid JSON at the exact length limit must be accepted");
  assert.equal(parseDemoSession(`${atLimit} `), null, "valid JSON one code unit above the limit must be rejected");
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

  let chineseCase = seed;
  for (const key of Object.keys(seed.entries)) {
    chineseCase = updateDemoEntry(chineseCase, key, "\u4e2d".repeat(70_000), "edited", "2026-10-02T18:00:00Z");
  }
  const chineseRaw = JSON.stringify(chineseCase, null, 2);
  assert.deepEqual(parseDemoSession(chineseRaw), chineseCase);
  const fileBytes = new TextEncoder().encode(chineseRaw).byteLength;
  assert.ok(fileBytes > 1_000_000, "the fixture must expose the Chinese character/byte difference");
  const page = readFileSync(new URL("../app/demo/page.tsx", import.meta.url), "utf8");
  const importLimit = page.match(/file\.size\s*>\s*([\w_]+)/)?.[1];
  const effectiveLimit = importLimit === "DEMO_MAX_FILE_BYTES" ? DEMO_MAX_FILE_BYTES : Number(importLimit?.replaceAll("_", ""));
  assert.ok(fileBytes <= effectiveLimit, "a valid exported Chinese case must fit the page's import byte limit");
  assert.equal(DEMO_MAX_FILE_BYTES, DEMO_MAX_JSON_LENGTH * 3, "UTF-8 requires at most three bytes per JSON UTF-16 code unit");
  assert.deepEqual(parseDemoSession(serializeDemoSession(chineseCase)), chineseCase);
  assert.ok(new TextEncoder().encode(serializeDemoSession(chineseCase)).byteLength <= DEMO_MAX_FILE_BYTES);

  const oversized = structuredClone(chineseCase);
  oversized.entries["timeline:bilibili"].review = {
    draft: oversized.entries["timeline:bilibili"].body, origin: "ai", updatedAt: "2026-10-02T18:00:00Z",
    result: { level: "low", score: 0, advice: "x", findings: Array.from({ length: 4 }, () => ({ type: "x", sentence: "x".repeat(100_000), rewrite: "x".repeat(100_000) })) }
  };
  assert.ok(JSON.stringify(oversized, null, 2).length > DEMO_MAX_JSON_LENGTH);
  const beforeExport = structuredClone(oversized);
  assert.throws(() => serializeDemoSession(oversized), /Word/, "an oversized case must not be offered as a file that cannot be restored");
  assert.deepEqual(oversized, beforeExport, "failed exports cannot mutate existing content");
  assert.equal((page.match(/onClick=\{downloadCase\}/g) || []).length, 2, "both case download buttons must use the guarded exporter");

  const pageAst = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function handlerCode(name) {
    let handler;
    function visit(node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) handler = node;
      ts.forEachChild(node, visit);
    }
    visit(pageAst);
    assert.ok(handler, `the page must provide ${name}`);
    return ts.transpileModule(handler.getText(pageAst), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  }
  const notices = [];
  const downloads = [];
  const downloadCase = new Function("session", "serializeDemoSession", "downloadTextFile", "setNotice", `${handlerCode("downloadCase")}; return downloadCase;`);
  downloadCase(oversized, serializeDemoSession, (...args) => downloads.push(args), (notice) => notices.push(notice))();
  assert.equal(downloads.length, 0, "invalid case export must not start a download");
  assert.match(notices.at(-1), /Word/, "failed export must offer a recovery path");
  downloadCase(chineseCase, serializeDemoSession, (...args) => downloads.push(args), (notice) => notices.push(notice))();
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0][0], "worldcup-national-demo.json");
  assert.equal(downloads[0][2], "application/json");

  const restored = [];
  const importCase = new Function("activeRequest", "DEMO_MAX_FILE_BYTES", "parseDemoSession", "setSession", "setEditing", "setNotice", `${handlerCode("importCase")}; return importCase;`)(
    { current: null }, DEMO_MAX_FILE_BYTES, parseDemoSession, (value) => restored.push(value), () => {}, (notice) => notices.push(notice)
  );
  await importCase(new File([downloads[0][1]], "case.json", { type: "application/json" }));
  assert.deepEqual(restored, [chineseCase], "the actual page import handler must restore the downloaded Chinese file");
  await importCase({ size: DEMO_MAX_FILE_BYTES + 1, text() { assert.fail("oversized imports must be rejected before reading"); } });
  assert.equal(restored.length, 1, "rejected imports must leave the current case unchanged");
  assert.match(notices.at(-1), /3 MB/);
  console.log("Demo session: round-trip, isolated edits, review invalidation, malformed imports and Chinese file limits passed.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
