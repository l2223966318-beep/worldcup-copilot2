import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const matchPath = existsSync(resolve(root, "app/matches/[id]/page.tsx")) ? "app/matches/[id]/page.tsx" : "app/matches/page.tsx";
const hotPath = existsSync(resolve(root, "app/hot-topics/[id]/page.tsx")) ? "app/hot-topics/[id]/page.tsx" : "app/hot-topics/page.tsx";
const matchId = "argentina-france-2022-final";
const topic = { id: "hot-1", title: "世界杯赛后讨论", summary: "球迷讨论", source: "test", tags: [], valueScore: 80 };
const tick = () => new Promise(resolve => setImmediate(resolve));
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function runtime(storage = memoryStorage()) {
  const slots = [], effects = [], modules = new Map(), requests = [];
  let index = 0;
  const sameDeps = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  const hooks = {
    ...React,
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }];
    },
    useRef(initial) { const slot = index++; return slots[slot] ??= { current: initial }; },
    useMemo(fn, deps) {
      const slot = index++;
      if (!sameDeps(slots[slot]?.deps, deps)) slots[slot] = { deps, value: fn() };
      return slots[slot].value;
    },
    useEffect(fn, deps) {
      const slot = index++;
      if (!sameDeps(slots[slot]?.deps, deps)) {
        effects.push(() => { slots[slot]?.cleanup?.(); slots[slot] = { deps, cleanup: fn() }; });
      }
    }
  };
  const window = { localStorage: storage, location: { search: `?id=${topic.id}` }, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 1, clearTimeout() {}, matchMedia: () => ({ matches: false }) };
  const overrides = {
    react: hooks,
    "next/navigation": { useParams: () => ({ id: matchId }), useSearchParams: () => new URLSearchParams() },
    "@/lib/services/matchAiCache": { readMatchAiWorkflowCache: () => ({ sourceStatus: "live", conclusions: [], topics: [] }), writeMatchAiWorkflowCache() {} },
    "@/lib/services/hotTopicAiCache": { readHotTopicAiCache: () => ({ sourceStatus: "live", intro: "热点介绍", analysis: {} }), writeHotTopicAiCache() {} }
  };
  function load(file) {
    const path = resolve(root, file);
    if (modules.has(path)) return modules.get(path);
    const exports = {};
    modules.set(path, exports);
    let source = readFileSync(path, "utf8");
    if (source.includes("function MatchAnalysisWorkspace(")) source += "\nexport { MatchAnalysisWorkspace };";
    if (source.includes("function MatchAnalysisRoute(")) source += "\nexport { MatchAnalysisRoute };";
    if (source.includes("function HotTopicWorkspace(")) source += "\nexport { HotTopicWorkspace };";
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
    } }).outputText;
    vm.runInNewContext(code, { exports, window, URLSearchParams, AbortController, Date, console,
      document: { addEventListener() {}, removeEventListener() {}, getElementById: () => null },
      fetch(url) {
        if (!url.startsWith("/api/ai/")) return Promise.resolve({ ok: true, json: async () => ({ sourceStatus: "live", data: [] }) });
        return new Promise((resolve, reject) => requests.push({ url, resolve: payload => resolve({ ok: true, json: async () => payload }), reject }));
      },
      require(name) {
        if (name.endsWith(".css")) return {};
        if (name in overrides) return overrides[name];
        if (name.startsWith("@/") || name.startsWith(".")) {
          const relative = name.startsWith("@/") ? resolve(root, name.slice(2)) : resolve(dirname(path), name);
          const target = [relative + ".ts", relative + ".tsx", relative + "/index.ts"].find(existsSync);
          assert.ok(target, `resolve ${name}`);
          return load(target);
        }
        return require(name);
      }
    }, { filename: path });
    return exports;
  }
  return { storage, requests, load, overrides,
    render(component, props = {}) { index = 0; return component(props); },
    flush() { while (effects.length) effects.shift()(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); }
  };
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  return [node.props?.children].flat(Infinity).map(child => find(child, predicate)).find(Boolean) ?? null;
}
const byName = (tree, name) => find(tree, node => node.type?.name === name);
const action = (tree, label) => find(tree, node => [node.props?.children].flat().includes(label) && typeof node.props.onClick === "function");

// An unknown real fixture must never become the first historical example.
const base = runtime();
assert.equal(base.load("lib/project-api.ts").getMatchDetail("unknown-real-fixture"), undefined);
const store = base.load("lib/services/workflowStore.ts");
store.writeWorkflowState({ currentMatch: { id: "A" }, generatedContent: { body: "A draft" }, reviewResult: { advice: "A review" }, analysisResult: { matchId: "A" }, knowledgeContext: ["shared"] });
store.writeReviewDraft("A draft");
store.writeWorkflowState({ currentMatch: { id: "B" } });
assert.equal(store.readWorkflowState().generatedContent, undefined);
assert.equal(store.readWorkflowState().reviewResult, undefined);
assert.equal(store.readWorkflowState().analysisResult, undefined);
assert.equal(store.readWorkflowState().knowledgeContext[0], "shared");
assert.equal(store.readReviewDraft(), "");
store.writeWorkflowState({ generatedContent: { body: "B draft" }, reviewResult: { advice: "old review" } });
store.writeWorkflowState({ generatedContent: { body: "edited draft" } });
assert.equal(store.readWorkflowState().reviewResult, undefined, "changing the draft invalidates its persisted review");
store.writeWorkflowState({ selectedPlatform: "bilibili", generatedContent: { body: "B station draft" } });
store.writeWorkflowState({ selectedPlatform: "weibo" });
assert.equal(store.readWorkflowState().generatedContent, undefined, "platform changes clear the previous platform body");

const query = runtime();
const useQuery = query.load("lib/sports/client.ts").useWorldCupQuery;
query.storage.setItem("A", JSON.stringify({ savedAt: Date.now(), payload: { data: { id: "A" }, sourceStatus: "live" } }));
assert.equal(query.render(() => useQuery("/A", undefined, { cacheKey: "A", revalidateOnMount: false })).payload.data.id, "A");
query.flush();
assert.equal(query.render(() => useQuery("/B", undefined, { cacheKey: "B" })).payload, undefined, "changing URL must hide the previous payload before effects run");
query.flush();
assert.equal(query.render(() => useQuery("/B", undefined, { cacheKey: "B" })).payload, undefined);
query.unmount();

const routes = runtime();
routes.overrides["@/lib/sports/client"] = { useWorldCupQuery: url => ({ loading: false, payload: { sourceStatus: "live", data: url.endsWith("/fixtures") ? [] : { id: "another-fixture" } } }) };
const routeModule = routes.load(matchPath);
assert.equal(byName(routes.render(routeModule.MatchAnalysisRoute, { fixtureId: "unknown-real-fixture" }), "MatchAnalysisWorkspace"), null, "a foreign payload must not mount the generation workspace");
if (matchPath === "app/matches/page.tsx") {
  const routeEntry = runtime();
  const StaticPage = routeEntry.load(matchPath).default;
  const routeTree = routeEntry.render(StaticPage);
  assert.equal(byName(routeTree, "MatchAnalysisRoute"), null, "static route must read the query ID before mounting queries or AI");
  routeEntry.flush();
  assert.equal(byName(routeEntry.render(StaticPage), "MatchAnalysisRoute").props.fixtureId, topic.id);
  routeEntry.unmount();
}

const matches = runtime();
let exportedPackage;
const exportService = matches.load("lib/services/exportService.ts");
matches.overrides["@/lib/services/exportService"] = { ...exportService, createContentPackage(input) { exportedPackage = input; return exportService.createContentPackage(input); } };
matches.overrides["@/lib/word-export"] = { downloadWordReport: async () => {} };
matches.overrides["@/lib/sports/client"] = { useWorldCupQuery: () => ({ loading: false }) };
const matchModule = matches.load(matchPath);
const MatchPage = matchModule.MatchAnalysisWorkspace ?? matchModule.default;
const example = matches.load("data/matches.ts").exampleMatches[0];
const matchProps = { match: example, loading: false };
let tree = matches.render(MatchPage, matchProps);
matches.flush();
tree = matches.render(MatchPage, matchProps);
const oldGeneration = byName(tree, "PlatformPreview").props.onRegenerate();
find(tree, node => node.props?.platform === "weibo" && typeof node.props.onClick === "function").props.onClick();
tree = matches.render(MatchPage, matchProps);
matches.requests.shift().resolve({ sourceStatus: "live", draft: { id: "old", platform: "bilibili", title: "old", body: "B station draft", sections: [], createdAt: "now" } });
await oldGeneration;
tree = matches.render(MatchPage, matchProps);
assert.equal(byName(tree, "PlatformPreview").props.draft, null, "late generation must not repopulate a different platform");
const editor = () => find(tree, node => node.props?.label === "待审稿件");
editor().props.onChange("稿件 A");
tree = matches.render(MatchPage, matchProps);
const oldReview = find(tree, node => node.props?.onClick?.name === "handleAiReview").props.onClick();
assert.equal(matches.storage.getItem("worldcup.workflow.draftForReview"), "稿件 A", "manual audits keep their submitted body even without a generated draft");
editor().props.onChange("稿件 B");
editor().props.onChange("稿件 A");
matches.requests.shift().resolve({ sourceStatus: "live", result: { level: "低", score: 0, findings: [], advice: "old verdict" } });
await oldReview;
tree = matches.render(MatchPage, matchProps);
assert.equal(byName(tree, "MatchReviewResult"), null, "editing and reverting still invalidates an in-flight audit");
const currentGeneration = byName(tree, "PlatformPreview").props.onRegenerate();
matches.requests.shift().resolve({ sourceStatus: "live", draft: { id: "current", platform: "weibo", title: "current", body: "生成的微博正文", sections: [], createdAt: "now" } });
await currentGeneration;
tree = matches.render(MatchPage, matchProps);
assert.equal(byName(tree, "PlatformPreview").props.draft.platform, "weibo");
editor().props.onChange("另行编辑的待审正文");
tree = matches.render(MatchPage, matchProps);
const currentReview = find(tree, node => node.props?.onClick?.name === "handleAiReview").props.onClick();
matches.requests.shift().resolve({ sourceStatus: "live", result: { level: "低", score: 0, findings: [], advice: "仅适用于编辑后的正文" } });
await currentReview;
tree = matches.render(MatchPage, matchProps);
assert.ok(byName(tree, "MatchReviewResult"), "current match audit remains usable");
await action(tree, "导出 Word 报告").props.onClick();
assert.notEqual(exportedPackage.reviewResult.advice, "仅适用于编辑后的正文", "an audit of edited text must not approve the original generated body in an export");
matches.unmount();

const hot = runtime();
hot.storage.setItem("worldcup.hot-topic-radar.cache.v4", JSON.stringify({ topics: [topic] }));
hot.overrides["next/navigation"].useParams = () => ({ id: topic.id });
const hotModule = hot.load(hotPath);
const HotPage = hotModule.HotTopicWorkspace ?? hotModule.default;
const hotProps = { topicId: topic.id };
tree = hot.render(HotPage, hotProps);
hot.flush();
tree = hot.render(HotPage, hotProps);
const oldHotGeneration = action(tree, "生成内容").props.onClick();
find(tree, node => node.props?.label === "平台" && typeof node.props.onChange === "function").props.onChange("微博");
hot.requests.shift().resolve({ sourceStatus: "live", draft: "B station draft" });
await oldHotGeneration;
tree = hot.render(HotPage, hotProps);
assert.equal(find(tree, node => node.props?.label === "生成结果编辑区").props.value, "");
const hotEditor = () => find(tree, node => node.props?.label === "生成结果编辑区");
hotEditor().props.onChange("微博稿件 A");
tree = hot.render(HotPage, hotProps);
const oldHotReview = action(tree, "一键审核").props.onClick();
hotEditor().props.onChange("微博稿件 B");
hotEditor().props.onChange("微博稿件 A");
hot.requests.shift().resolve({ sourceStatus: "live", audit: { level: "pass", authenticity: [], risk: [], ethics: [], platformFit: [], suggestions: [], rewriteSuggestion: "old" } });
await oldHotReview;
tree = hot.render(HotPage, hotProps);
assert.equal(byName(tree, "ReviewVerdict"), null);
const currentHotGeneration = action(tree, "生成内容").props.onClick();
hot.requests.shift().resolve({ sourceStatus: "live", draft: "微博稿件 A" });
await currentHotGeneration;
tree = hot.render(HotPage, hotProps);
assert.equal(hotEditor().props.value, "微博稿件 A", "current generation remains usable");
const currentHotReview = action(tree, "一键审核").props.onClick();
hot.requests.shift().resolve({ sourceStatus: "live", audit: { level: "pass", authenticity: [], risk: [], ethics: [], platformFit: [], suggestions: [], rewriteSuggestion: "current" } });
await currentHotReview;
tree = hot.render(HotPage, hotProps);
assert.ok(byName(tree, "ReviewVerdict"), "current audit remains usable");
action(tree, "保存草稿").props.onClick();
hot.unmount();
const restored = runtime(hot.storage);
restored.overrides["next/navigation"].useParams = () => ({ id: topic.id });
const restoredModule = restored.load(hotPath);
const RestoredPage = restoredModule.HotTopicWorkspace ?? restoredModule.default;
restored.render(RestoredPage, hotProps);
restored.flush();
tree = restored.render(RestoredPage, hotProps);
assert.equal(find(tree, node => node.props?.label === "生成结果编辑区").props.value, "微博稿件 A", "refresh restores the saved body");
assert.equal(find(tree, node => node.props?.label === "平台" && typeof node.props.onChange === "function").props.value, "微博", "restore keeps the body and its platform together");
assert.ok(action(tree, "恢复草稿"));
find(tree, node => node.props?.label === "生成结果编辑区").props.onChange("unsaved edit");
tree = restored.render(RestoredPage, hotProps);
action(tree, "恢复草稿").props.onClick();
tree = restored.render(RestoredPage, hotProps);
assert.equal(find(tree, node => node.props?.label === "生成结果编辑区").props.value, "微博稿件 A");
assert.equal(byName(tree, "ReviewVerdict"), null, "restoring a draft never restores an unrelated audit");
const pendingUnmount = action(tree, "生成内容").props.onClick();
restored.unmount();
restored.requests.shift().resolve({ sourceStatus: "live", draft: "unmounted result" });
await pendingUnmount;
tree = restored.render(RestoredPage, hotProps);
assert.equal(find(tree, node => node.props?.label === "生成结果编辑区").props.value, "微博稿件 A");
const hotStore = base.load("lib/services/hotDraftStore.ts");
const invalidStorage = memoryStorage();
invalidStorage.setItem("worldcup.hot-topic-drafts.v1", "{broken JSON");
assert.equal(hotStore.readSavedHotDraft(topic.id, invalidStorage), undefined);
invalidStorage.setItem("worldcup.hot-topic-drafts.v1", JSON.stringify({ not: "an array" }));
assert.equal(hotStore.readSavedHotDraft(topic.id, invalidStorage), undefined);
const savedItem = JSON.parse(hot.storage.getItem("worldcup.hot-topic-drafts.v1"))[0];
assert.equal(hotStore.saveHotDraft(savedItem, invalidStorage), true);
assert.equal(hotStore.readSavedHotDraft("other-topic", invalidStorage), undefined);
assert.equal(hotStore.saveHotDraft(savedItem, { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } }), false);
await tick();
console.log("Workflow consistency: fixture identity, query ownership, persisted state, stale generation/audit and draft restoration passed.");
