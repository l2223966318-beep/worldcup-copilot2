import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const exporter = readFileSync(new URL("lib/word-export.ts", root), "utf8");
const reportPage = readFileSync(new URL("app/report/page.tsx", root), "utf8");
const matchPage = readFileSync(new URL("app/matches/[id]/page.tsx", root), "utf8");
const reportActions = readFileSync(new URL("components/report/report-actions.tsx", root), "utf8");

assert.match(exporter, /Packer\.toBlob/, "Word exporter must create a real DOCX blob");
assert.match(exporter, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/, "Word exporter must use the DOCX MIME type");
assert.match(exporter, /new Table\(/, "Markdown tables must become Word tables");
assert.match(exporter, /HeadingLevel/, "Markdown headings must become Word headings");
assert.match(exporter, /downloadBlob/, "Word exporter must download the generated blob");

for (const [file, source] of [
  ["app/report/page.tsx", reportPage],
  ["app/matches/[id]/page.tsx", matchPage],
  ["components/report/report-actions.tsx", reportActions]
]) {
  assert.match(source, /downloadWordReport/, `${file} must use the shared Word exporter`);
  assert.match(source, /\.docx/, `${file} must export a .docx filename`);
}

assert.doesNotMatch(reportPage, /导出 Markdown/, "Report page must no longer present Markdown as the report export format");
assert.doesNotMatch(matchPage, /导出 Markdown 报告/, "Match page must no longer present Markdown as the report export format");

console.log("word export contract ok");
