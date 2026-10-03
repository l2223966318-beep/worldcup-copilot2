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
const { GeneratedDocument, GeneratedDraftEditor, GeneratedText, ReviewVerdict, ReviewSection } = await import(`data:text/javascript;base64,${Buffer.from(componentCode).toString("base64")}`);
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
const emphasized = renderToStaticMarkup(createElement(GeneratedText, { text: "建议：突出**事实核验**，比分2-1，控球率52%，引用`E1`。", leadingLabel: true }));
assert.match(emphasized, /<strong[^>]*>建议<\/strong>：/);
assert.match(emphasized, /<strong[^>]*>事实核验<\/strong>/);
assert.match(emphasized, /<mark[^>]*>2-1<\/mark>/);
assert.match(emphasized, /<mark[^>]*>52%<\/mark>/);
assert.match(emphasized, /<code[^>]*>E1<\/code>/);
assert.doesNotMatch(emphasized, /\*\*|`/);
assert.match(renderToStaticMarkup(createElement(GeneratedText, { text: "法国以2:1取胜。", leadingLabel: true })), /<mark[^>]*>2:1<\/mark>/);
assert.match(renderToStaticMarkup(createElement(GeneratedText, { text: "__核心观点__与【互动设计】，微博热度104万。" })), /<strong[^>]*>核心观点<\/strong>/);
assert.match(renderToStaticMarkup(createElement(GeneratedText, { text: "执行「规则解释」角度，保留“事实边界”。" })), /<strong[^>]*>「规则解释」<\/strong>/);
assert.match(renderToStaticMarkup(createElement(GeneratedText, { text: "只有**未闭合标记" })), /只有\*\*未闭合标记/);
const highlightedHostile = renderToStaticMarkup(createElement(GeneratedText, { text: "**<img src=x onerror=alert(1)>**" }));
assert.doesNotMatch(highlightedHostile, /<img/);
assert.match(highlightedHostile, /&lt;img/);
const warningHtml = renderToStaticMarkup(createElement(ReviewSection, { title: "修改建议", items: ["建议：保留**事实边界**，核验2-1比分。"], tone: "warning", defaultOpen: true }));
assert.match(warningHtml, /draft-text-warning/);
assert.match(warningHtml, /<strong[^>]*>事实边界<\/strong>/);
const labeledHtml = renderToStaticMarkup(createElement(GeneratedDocument, { text: "**标题**：比赛转折点\n**核心结论：** 先核验，再表达。" }));
assert.match(labeledHtml, /draft-field-title/);
assert.match(labeledHtml, /draft-field-key/);
assert.doesNotMatch(labeledHtml, /\*\*/);
assert.equal(formatGeneratedDraft("**核心结论：** 原文不改。"), "**核心结论：** 原文不改。");
const workspaceCss = readFileSync(new URL("../app/detail-workspace.css", import.meta.url), "utf8");
assert.match(workspaceCss, /\.draft-emphasis,[\s\S]*?font-weight: 700/);
assert.match(workspaceCss, /\.draft-data\s*\{[\s\S]*?background: #e0f2fe/);
assert.match(workspaceCss, /\.review-original\s*\{[\s\S]*?overflow-wrap: anywhere/);
assert.match(workspaceCss, /@media \(max-width: 639px\)\s*\{\s*\.detail-workspace \.draft-field\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
console.log("generated draft formatting ok");
