import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function load(source) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(source, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, { exports });
  return exports;
}
const { normalizeHotAnalysis } = load("../lib/hot/normalizeHotAnalysis.ts");
const { writeHotTopicAiCache, readHotTopicAiCache } = load("../lib/services/hotTopicAiCache.ts");
const textFields = ["whyCare", "relation", "angles", "platforms", "factsToVerify", "risks"];
const fallback = {
  overview: [{ label: "Value", value: "Pending", note: "Verify source" }],
  production: [{ label: "Platform", value: "Video", note: "Explain context" }],
  ...Object.fromEntries(textFields.map(field => [field, ["Needs verification"]]))
};
const insight = { label: "Angle", value: "Explain the event", note: "Use verified facts" };
const raw = { ...fallback, ...Object.fromEntries(textFields.map(field => [field, [insight, null, false]])) };

function render(analysis) {
  const rows = ["overview", "production"].flatMap(field => analysis[field].flatMap(item => [item.label, item.value, item.note]));
  rows.push(...textFields.flatMap(field => analysis[field]));
  return renderToStaticMarkup(createElement("ul", null,
    rows.map((value, index) => createElement("li", { key: index }, value))));
}

assert.throws(() => render(raw), /Objects are not valid as a React child/, "reproduce the reported React #31 before normalization");
const safe = normalizeHotAnalysis(raw, fallback);
const html = render(safe);
assert.match(html, /Explain the event/);
assert.match(html, /Use verified facts/);
assert.doesNotMatch(html, /\[object Object\]/);
assert.equal(normalizeHotAnalysis(safe, fallback).whyCare[0], safe.whyCare[0], "normalization must be stable for repeated cache reads");

const store = new Map();
const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
const topic = { id: "structured-cached-topic", title: "Public event", source: "test" };
writeHotTopicAiCache(storage, topic, { sourceStatus: "live", intro: "Context", analysis: raw }, 1000);
const cached = readHotTopicAiCache(storage, topic, 1001);
assert.ok(cached, "existing matching caches stay reusable without another AI request");
assert.doesNotThrow(() => render(normalizeHotAnalysis(cached.analysis, fallback)), "old malformed cache must render safely");

for (const bad of [null, false, "wrong shape", [], { overview: [null, false, { label: {}, value: [], note: null }], risks: [{ unknown: "discard" }] }]) {
  assert.doesNotThrow(() => render(normalizeHotAnalysis(bad, fallback)), "invalid model fields must use readable fallbacks");
}
const nested = normalizeHotAnalysis({ overview: [{ label: "Rating", value: insight, note: "Context" }] }, fallback);
assert.doesNotThrow(() => render(nested));
assert.match(nested.overview[0].value, /Explain the event/);
const escaped = render(normalizeHotAnalysis({ risks: ["<script>alert(1)</script>"] }, fallback));
assert.match(escaped, /&lt;script&gt;/);
assert.doesNotMatch(escaped, /<script>/);
console.log("Hot analysis render: React #31 reproduced; live, cached, malformed and escaped output passed.");
