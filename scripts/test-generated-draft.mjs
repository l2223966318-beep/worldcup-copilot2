import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = readFileSync(new URL("../lib/ai/generated-draft.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { formatGeneratedDraft, normalizePlatformDraft, splitDraftBlocks } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const angles = { "选题": [
  { "角度标题": "规则解释", "怎么做": "使用来源画面。", "说明": "保留事实边界。" },
  { "角度标题": "理性讨论", "怎么做": "先说事实，再提问。", "说明": "不要编造球员发言。", "素材": "公开转播" }
] };
const readable = formatGeneratedDraft(JSON.stringify(angles));
assert.match(readable, /^1\. 规则解释/);
assert.match(readable, /2\. 理性讨论/);
assert.match(readable, /怎么做：使用来源画面。/);
assert.match(readable, /素材：公开转播/);
assert.doesNotMatch(readable, /[{}]|\[object Object\]/);
assert.equal(formatGeneratedDraft(angles), readable);
assert.equal(formatGeneratedDraft(`\`\`\`json\n${JSON.stringify(angles)}\n\`\`\``), readable);
assert.equal(formatGeneratedDraft(`⚽ ${JSON.stringify(angles)}`), readable);
assert.equal(formatGeneratedDraft({ draft: JSON.stringify(angles) }), readable);
assert.equal(formatGeneratedDraft(readable), readable, "formatting must be idempotent");

assert.equal(formatGeneratedDraft("正常正文\n\n比分 2:1。"), "正常正文\n\n比分 2:1。");
assert.equal(formatGeneratedDraft('{"config":true}'), '{"config":true}', "unrelated JSON must remain untouched");
assert.equal(formatGeneratedDraft('{"选题":['), '{"选题":[', "broken JSON must not lose text");
assert.equal(formatGeneratedDraft(null), "");
assert.equal(formatGeneratedDraft({ draft: "<script>alert(1)</script>" }), "<script>alert(1)</script>");

const blocks = splitDraftBlocks(readable);
assert.deepEqual(blocks.filter((block) => block.kind === "heading").map((block) => block.number), ["1", "2"]);
assert.ok(blocks.some((block) => block.kind === "field" && block.label === "怎么做"));
assert.deepEqual(splitDraftBlocks("【可直接发布版】\n事实第一段。\n\n观点第二段。"), [
  { kind: "heading", text: "可直接发布版", number: undefined },
  { kind: "paragraph", text: "事实第一段。" },
  { kind: "paragraph", text: "观点第二段。" }
]);
const sections = [{ title: "可直接发布版", content: JSON.stringify({ title: "比赛观察", body: "不新增未知比分。" }) }];
const draft = normalizePlatformDraft({ id: "match-draft", platform: "weibo", title: "比赛观察", sections, body: "", createdAt: "test" });
assert.match(draft.body, /比赛观察/);
assert.match(draft.body, /不新增未知比分。/);
assert.equal(draft.sections[0].content, formatGeneratedDraft(sections[0].content));
assert.equal(draft.id, "match-draft");
assert.equal(draft.createdAt, "test");

const componentSource = readFileSync(new URL("../components/ui/generated-content.tsx", import.meta.url), "utf8");
assert.doesNotMatch(componentSource, /dangerouslySetInnerHTML|innerHTML|execCommand/);
assert.match(componentSource, /aria-pressed=\{!editing\}/);
assert.match(componentSource, /<textarea value=\{value\}/);
assert.match(componentSource, /<GeneratedDocument text=\{value\}/);

const require = createRequire(import.meta.url);
let componentCode = ts.transpileModule(componentSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
for (const dependency of ["react", "react/jsx-runtime", "lucide-react"]) {
  componentCode = componentCode.replaceAll(`from "${dependency}"`, `from "${pathToFileURL(require.resolve(dependency)).href}"`);
}
componentCode = componentCode.replaceAll('from "@/lib/ai/generated-draft"', `from "data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}"`);
const { GeneratedDocument, GeneratedDraftEditor, ReviewVerdict, ReviewSection } = await import(`data:text/javascript;base64,${Buffer.from(componentCode).toString("base64")}`);
const documentHtml = renderToStaticMarkup(createElement(GeneratedDocument, { text: JSON.stringify(angles) }));
assert.match(documentHtml, /draft-number/);
assert.match(documentHtml, /draft-field/);
assert.match(documentHtml, /规则解释/);
assert.doesNotMatch(documentHtml, /&quot;选题&quot;/);
const hostileHtml = renderToStaticMarkup(createElement(GeneratedDocument, { text: "<script>alert(1)</script>" }));
assert.doesNotMatch(hostileHtml, /<script>/);
assert.match(hostileHtml, /&lt;script&gt;/);
const editorHtml = renderToStaticMarkup(createElement(GeneratedDraftEditor, { value: readable, onChange() {}, label: "测试稿件" }));
assert.match(editorHtml, /aria-pressed="true"/);
assert.match(editorHtml, /规则解释/);
const auditHtml = renderToStaticMarkup(createElement(ReviewVerdict, { title: "待人工确认", tone: "warning", metrics: [{ label: "问题", value: 0 }] }));
assert.match(auditHtml, /待人工确认/);
assert.doesNotMatch(auditHtml, /可发布/);
assert.match(renderToStaticMarkup(createElement(ReviewSection, { title: "修改建议", items: ["建议一", "建议二"], defaultOpen: true })), /<details open=""/);
console.log("generated draft formatting ok");
