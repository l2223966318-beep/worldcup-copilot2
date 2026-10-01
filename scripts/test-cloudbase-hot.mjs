import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
const localRequire = createRequire(import.meta.url);
const { createSources } = localRequire("../cloudfunctions/api-proxy/hot-sources.js");
const { createSportsService } = localRequire("../cloudfunctions/api-proxy/sports-service.js");

const code = readFileSync(new URL("../cloudfunctions/api-proxy/index.js", import.meta.url), "utf8");
function createRuntime({ fail = false, empty = false } = {}) {
  let calls = 0;
  let handler;
  const fakeFetch = async () => {
      calls++;
      if (fail) throw new Error("secret-do-not-return");
      return { ok: true, json: async () => ({ data: empty ? [] : [
        { title: "湖人NBA总决赛", url: "https://example.com/nba" },
        { title: "阿根廷世界杯夺冠", url: "https://example.com/arg" },
        { title: "日本世界杯备战", url: "https://example.com/jp" },
        { title: "乒乓球世界杯决赛", url: "https://example.com/pingpong" },
        { title: "今日娱乐新闻", url: "https://example.com/other" },
      ] }) };
    };
  const context = vm.createContext({
    require: name => ["./evidence", "./ai-guard", "./hot-ai-cache"].includes(name) ? localRequire(`../cloudfunctions/api-proxy/${name}.js`) : name === "./sports-service" ? { createSportsService: () => createSportsService({ env: {} }) } : name === "./hot-sources" ? { createSources: () => createSources({ env: {}, fetchImpl: fakeFetch }) } : ({ createServer: callback => { handler = callback; return { listen() {} }; } }),
    process: { env: {} }, console, URL, AbortController, setTimeout, clearTimeout, Buffer,
    fetch: fakeFetch,
  });
  vm.runInContext(code, context);
  return {
    run: expression => vm.runInContext(expression, context), calls: () => calls,
    request: (url, body) => new Promise((resolve, reject) => {
      const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
      req.url = url;
      req.method = body ? "POST" : "GET";
      req.headers = {};
      handler(req, { setHeader() {}, end(text) { resolve(JSON.parse(text)); }, destroy: reject });
    }),
  };
}

const runtime = createRuntime();
const hot = await runtime.run('loadHotTopics({source:"hupu",scope:"sports"})');
assert.deepEqual(Array.from(hot.data, x => x.title), ["阿根廷世界杯夺冠", "日本世界杯备战"], "football mode must never pad results with unrelated sports");
assert.ok(hot.data.every(x => x.provider === "uapi"));
assert.equal(hot.diagnostics[0].status, "success");
const searched = await runtime.run('loadHotTopics({source:"hupu",query:"阿根廷 世界杯 足球"})');
assert.deepEqual(Array.from(searched.data, x => x.title), ["阿根廷世界杯夺冠"]);
const cached = await runtime.run('loadHotTopics({source:"hupu",query:"阿根廷 世界杯 足球"})');
assert.equal(cached.sourceStatus, "cache");
assert.equal(cached.lastUpdated, searched.lastUpdated);
assert.equal(runtime.calls(), 2, "different filters reuse raw caches; search adds one DailyHot call");
const concurrent = createRuntime();
await Promise.all([concurrent.run('loadHotTopics({source:"weibo"})'), concurrent.run('loadHotTopics({source:"weibo"})')]);
assert.equal(concurrent.calls(), 1, "in-flight platform requests should be shared");
const failed = createRuntime({ fail: true });
const error = await failed.run('loadHotTopics({source:"weibo"})');
assert.equal(error.sourceStatus, "error");
assert.equal(error.diagnostics[0].status, "failed");
assert.equal(JSON.stringify(error).includes("secret-do-not-return"), false);
const empty = createRuntime({ empty: true });
const noResults = await empty.run('loadHotTopics({source:"weibo"})');
assert.equal(noResults.sourceStatus, "live", "a successful empty list is not a provider error");
assert.equal(noResults.diagnostics[0].status, "empty");
const health = runtime.run('hotHealth()');
assert.equal(health.providers[0].provider, "uapi");
assert.equal(health.providers.find(p => p.provider === "tavily").status, "not-configured");
assert.equal(runtime.calls(), 2, "health must not trigger paid or external requests");
assert.equal((await runtime.request("/api/health")).version, "direct-v6.3-cache-guard");
assert.equal((await runtime.request("/api/hot/health")).searchMode, "multi-source-search");
assert.equal((await runtime.request("/api/ai/health")).configured, false, "existing AI route remains available");
runtime.run('hotPlatformCache.get("hupu").fetchedAt -= 60001');
await runtime.run('loadHotTopics({source:"hupu"})');
assert.equal(runtime.calls(), 3, "expired cache must refresh");
assert.equal(runtime.run('matchesQuery("Argentina football", "阿根廷 世界杯")'), true);
assert.equal(runtime.run('matchesQuery("日本足球世界杯", "阿根廷 世界杯")'), false);
assert.equal(runtime.run('matchesQuery("France football", "阿根廷对阵法国")'), true);
assert.equal(runtime.run('normalizeHotItem({title:"足球",url:"javascript:alert(1)"},"weibo",0)'), null);
assert.equal(hot.data[0].publishedAt, undefined, "board fetch timestamp is not an article publication date");
const aiBefore = runtime.calls();
const topic = { title: "阿根廷世界杯夺冠", platform: "B站" };
const analyzed = await runtime.request("/api/ai/hot-topic", { topic });
assert.equal(analyzed.sourceStatus, "fallback");
assert.equal(analyzed.analysis.overview.length, 3);
assert.ok(analyzed.intro.includes(topic.title));
const generated = await runtime.request("/api/ai/hot-topic-workflow", {
  action: "generate", topic, config: { platform: "B站", contentType: "选题" }
});
assert.equal(generated.sourceStatus, "fallback");
assert.equal(generated.draft.match(/^\d\./gm).length, 5);
const audited = await runtime.request("/api/ai/hot-topic-workflow", {
  action: "audit", topic, config: {}, draft: "这是黑哨"
});
assert.equal(audited.sourceStatus, "fallback");
assert.equal(audited.audit.level, "revise");
assert.ok(audited.audit.risk.length > 0);
const reviewed = await runtime.request("/api/ai/review-draft", {
  draft: "这是黑哨", matchContext: {}, evidence: []
});
assert.equal(reviewed.result.advice, "审核未完成，待人工确认");
assert.ok(reviewed.result.findings.length > 0);
assert.equal(runtime.calls(), aiBefore, "AI fallback must remain usable without a key or upstream calls");
runtime.run('callDeepSeekJson = async () => ({ ok: true, model: "test-model", data: { score: 95, findings: [], riskPoints: [], checklist: [] } })');
const cleanReview = await runtime.request("/api/ai/review-draft", {
  draft: "欢迎理性讨论比赛表现。", matchContext: {}, evidence: []
});
assert.equal(cleanReview.sourceStatus, "live");
assert.equal(cleanReview.result.level, "低", "an unexplained model score must not label a clean draft high risk");
assert.equal(cleanReview.result.advice, "可发布");
const missedReview = await runtime.request("/api/ai/review-draft", {
  draft: "这是黑哨", matchContext: {}, evidence: []
});
assert.ok(missedReview.result.findings.length > 0, "local risk checks must survive an empty model finding list");
assert.notEqual(missedReview.result.level, "低");
runtime.run('callDeepSeekJson = async () => ({ ok: true, model: "test-model", data: { score: 95, findings: [{ sentence: "这是黑哨", type: "引战", reason: "未提供判罚证据", rewrite: "判罚仍需核实", evidenceStatus: "risk" }] } })');
const riskReview = await runtime.request("/api/ai/review-draft", {
  draft: "这是黑哨", matchContext: {}, evidence: []
});
assert.equal(riskReview.result.level, "高", "a concrete high-risk finding must retain its warning");
const fallback = await failed.run('loadFixtures()');
assert.equal(fallback.sourceStatus, "fallback");
assert.equal(fallback.data[0].id, "argentina-france-2022-final");
assert.equal(fallback.data[0].source.provider, "mock", "historical samples must not masquerade as Sportradar");
console.log("CloudBase hot: football filtering, entity query, provider attribution, cache, deduplication and diagnostics passed.");
