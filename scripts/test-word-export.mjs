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
  assert.match(source, /buildContentReportFilename/, `${file} must use the descriptive report filename builder`);
}

assert.doesNotMatch(reportPage, /导出 Markdown/, "Report page must no longer present Markdown as the report export format");
assert.doesNotMatch(matchPage, /导出 Markdown 报告/, "Match page must no longer present Markdown as the report export format");
assert.doesNotMatch(reportPage, /worldcup-copilot-report\.docx/, "Report page should use a descriptive filename");
assert.doesNotMatch(matchPage, /-content-report\.docx/, "Match page should use a descriptive filename");
assert.doesNotMatch(reportActions, /worldcup-copilot-report\.docx/, "Shared report actions should use a descriptive filename");
assert.doesNotMatch(
  matchPage,
  /contentPackage\s*\?\s*createPackageMarkdown\(contentPackage\)\s*:\s*markdown/,
  "Match page must not fall back to the stale multi-platform report"
);
assert.match(matchPage, /请先生成当前平台内容/, "Match page should explain why export is unavailable");

console.log("word export contract ok");
