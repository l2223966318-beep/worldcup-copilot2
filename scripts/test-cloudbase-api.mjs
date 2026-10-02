import assert from "node:assert/strict";
import http from "node:http";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { once } from "node:events";
const localRequire = createRequire(import.meta.url);
const { createSources } = localRequire("../cloudfunctions/api-proxy/hot-sources.js");
const { createSportsService } = localRequire("../cloudfunctions/api-proxy/sports-service.js");
let handler;
let calls = [];
let modelResult = {};
const event = { id: "sr:sport_event:123", start_time: "2026-06-28T19:00:00Z", sport_event_context: { competition: { name: "FIFA World Cup" }, season: { id: "sr:season:1", year: "2026" } }, competitors: [{ name: "Argentina", qualifier: "home" }, { name: "France", qualifier: "away" }] };
const fakeFetch = async (url, init) => {
  const host = new URL(url).host;
  calls.push({ host, init });
  if (host === "api.deepseek.com") return Response.json({
    choices: [{ message: { content: JSON.stringify(modelResult) }, finish_reason: "stop" }]
  });
  if (host === "api.sportradar.com") return Response.json({
    schedules: [{ sport_event: event, sport_event_status: { status: "closed", home_score: 1, away_score: 0 } }],
    sport_event: event, sport_event_status: { status: "closed", home_score: 1, away_score: 0 },
    timeline: [{ type: "score_change", match_time: 115, team: "home", player: { name: "Messi" } }],
  });
  if (host === "api.tavily.com") return new Response(JSON.stringify({ results: [
    { title: "Argentina football press conference", url: "https://example.org/argentina", content: "Argentina World Cup interviews" },
    { title: "Japan football", url: "https://example.org/japan" },
  ] }));
  if (host === "api.tophubdata.com") return new Response('{"message":"sensitive-key"}', { status: 401 });
  if (host === "uapis.cn") return new Response(JSON.stringify({ list: [
    { title: "阿根廷足球新闻", url: "https://example.org/uapi" },
    { title: "NBA决赛", url: "https://example.org/nba" },
  ] }));
  return new Response(JSON.stringify({ code: 200, data: [] }));
};
const env = { TAVILY_API_KEY: "sensitive-key", TOPHUBDATA_API_KEY: "other-secret", SPORTRADAR_API_KEY: "sports-secret", SPORTRADAR_WORLD_CUP_SEASON_ID: "sr:season:1", SPORTRADAR_REQUEST_INTERVAL_MS: "15" };
const clientModule = { exports: {} };
vm.runInNewContext(readFileSync(new URL("../cloudfunctions/api-proxy/sportradar.js", import.meta.url), "utf8"), {
  exports: clientModule.exports, require: name => localRequire(`../cloudfunctions/api-proxy/${name}`),
  process: { env }, fetch: fakeFetch, URL, AbortController, setTimeout, clearTimeout,
});
const sportsService = createSportsService({ client: clientModule.exports, env });
const context = vm.createContext({
  require: name => ["./evidence", "./ai-guard", "./hot-ai-cache", "./hot-analysis"].includes(name) ? localRequire(`../cloudfunctions/api-proxy/${name}.js`) : name === "./sports-service" ? { createSportsService: () => sportsService } : name === "./hot-sources" ? { createSources: () => createSources({ env, fetchImpl: fakeFetch }) } : { createServer: fn => { handler = fn; return { listen() {} }; } },
  process: { env }, fetch: fakeFetch, URL, AbortController, Buffer, setTimeout, clearTimeout, console,
});
vm.runInContext(readFileSync(new URL("../cloudfunctions/api-proxy/index.js", import.meta.url), "utf8"), context);
const server = http.createServer(handler);
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  let response = await fetch(`${origin}/api/hot/health`);
  const health = await response.json();
  assert.equal(health.providers.find(p => p.provider === "tavily").configured, true);
  assert.equal(calls.length, 0, "health must not probe upstreams");
  response = await fetch(`${origin}/api/worldcup/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).seasonConfigured, true);
  assert.equal(calls.length, 0);
  response = await fetch(`${origin}/api/source-debug`);
  assert.equal(response.status, 200, "the existing source-debug entry must remain available");
  const debug = await response.json();
  assert.equal(debug.configured.apiKey, true);
  assert.equal(debug.configured.seasonId, "sr:season:1");
  assert.equal(debug.sportradar.attempted, false);
  assert.equal(debug.sportradar.ok, null, "an unprobed source must not be labelled successful or failed");
  assert.equal(JSON.stringify(debug).includes("sports-secret"), false);
  assert.equal(calls.length, 0, "source-debug must not spend upstream quota");
  response = await fetch(`${origin}/api/source-debug`, { method: "POST" });
  assert.equal(response.status, 405);
  const fixtures = await Promise.all([fetch(`${origin}/api/worldcup/fixtures`), fetch(`${origin}/api/worldcup/fixtures`)]);
  for (const result of fixtures) assert.equal((await result.json()).data[0].source.provider, "sportradar");
  assert.equal(calls.filter(c => c.host === "api.sportradar.com").length, 1);
  response = await fetch(`${origin}/api/worldcup/matches/sr%3Asport_event%3A123`);
  assert.equal((await response.json()).data.events[0].player, "Messi");
  response = await fetch(`${origin}/api/worldcup/fixtures`, { method: "POST" });
  assert.equal(response.status, 405);
  response = await fetch(`${origin}/api/hot?source=bilibili`);
  assert.equal((await response.json()).data.length, 1);
  response = await fetch(`${origin}/api/hot/search?q=Argentina%20World%20Cup`);
  const search = await response.json();
  assert.equal(search.searchMode, "multi-source-search");
  assert.equal(search.sourceStatus, "partial");
  assert.ok(search.data.some(item => item.provider === "tavily"));
  assert.ok(search.data.every(item => !item.title.includes("Japan")));
  assert.equal(search.diagnostics.find(p => p.provider === "tophubdata").status, "unauthorized");
  assert.equal(JSON.stringify(search).includes("sensitive-key"), false);
  const count = calls.length;
  await fetch(`${origin}/api/hot/search?q=Argentina%20World%20Cup`);
  assert.equal(calls.length, count, "same query must not re-charge a provider within cache TTL");
  response = await fetch(`${origin}/api/hot`, { method: "POST" });
  assert.equal(response.status, 405);
  response = await fetch(`${origin}/api/hot/search?q=`);
  assert.equal(response.status, 400);
  assert.equal(calls.length, count, "invalid requests must not consume upstream quota");
  response = await fetch(`${origin}/api/ai/hot-topic`, { method: "POST", body: "{broken" });
  assert.equal(response.status, 400);
  response = await fetch(`${origin}/api/ai/hot-topic`, { method: "POST", body: "x".repeat(262145) });
  assert.equal(response.status, 413);
  response = await fetch(`${origin}/api/health`);
  assert.equal(response.status, 200, "bad requests must not take down the process");
  const aiRequests = [
    ["hot-topic", { topic: { title: "Argentina football" } }],
    ["hot-topic-workflow", { action: "generate", topic: { title: "Argentina football" }, config: { platform: "B站", contentType: "选题" } }],
    ["match-workflow", { match: { homeTeam: { name: "Argentina" }, awayTeam: { name: "France" } }, baselineTopics: [{ id: "one", title: "Football" }] }],
    ["platform-draft", { platform: "bilibili", contentType: "topic", topicMode: "professional", matchContext: { matchInfo: { name: "Argentina vs France", score: "1-0" } }, topic: { title: "Football" }, analysis: {} }],
    ["review-draft", { draft: "比赛复盘", matchContext: {}, evidence: [] }],
  ];
  const beforeAi = calls.length;
  for (const [path, body] of aiRequests) {
    response = await fetch(`${origin}/api/ai/${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    assert.equal(response.status, 200, `${path} handler must exist and return without crashing`);
    assert.equal((await response.json()).sourceStatus, "fallback", `${path} must disclose missing AI key`);
  }
  assert.equal(calls.length, beforeAi, "missing AI config must not make billable requests");
  response = await fetch(`${origin}/api/ai/review-draft`, { method: "POST", body: JSON.stringify({
    draft: "阿根廷以9-0战胜法国。", matchContext: {}, evidence: []
  }) });
  const unchecked = await response.json();
  assert.equal(unchecked.result.level, "待人工确认");
  assert.notEqual(unchecked.result.advice, "可发布");
  assert.equal(unchecked.result.evidenceSummary.unsupportedClaims, 1);
  env.DEEPSEEK_API_KEY = "ai-test-secret";
  for (const [path, body] of aiRequests) {
    response = await fetch(`${origin}/api/ai/${path}`, { method: "POST", body: JSON.stringify(body) });
    assert.equal(response.status, 403, "shared AI must be private unless deliberately opened");
  }
  response = await fetch(`${origin}/api/ai/health?probe=1`);
  assert.equal(response.status, 403, "paid health probes require the same access policy");
  assert.equal(calls.length, beforeAi, "denied calls must not reach the model");
  env.AI_ALLOW_PUBLIC = "true";
  response = await fetch(`${origin}/api/ai/review-draft`, { method: "POST", body: JSON.stringify({
    draft: "比赛复盘", matchContext: {}, evidence: []
  }) });
  const invalidReview = await response.json();
  assert.equal(invalidReview.sourceStatus, "fallback", "an empty model object must not count as a completed review");
  assert.notEqual(invalidReview.result.advice, "可发布");
  modelResult = { level: "低", score: 0, findings: [] };
  const statEvidence = [{ id: "E01", type: "match_stat", source: "test", relevance: 100,
    text: "阿根廷射门12次、射正6次；法国射门10次、射正5次" }];
  for (const [draft, unsupported] of [["法国射门12次。", 1], ["法国射门10次。", 0]]) {
    response = await fetch(`${origin}/api/ai/review-draft`, { method: "POST", body: JSON.stringify({ draft, matchContext: {}, evidence: statEvidence }) });
    const checked = await response.json();
    assert.equal(checked.result.evidenceSummary.checkedClaims, 1);
    assert.equal(checked.result.evidenceSummary.unsupportedClaims, unsupported);
    assert.equal(checked.result.advice === "可发布", unsupported === 0, "model approval must not override the same local fact checker used by Next.js");
  }
  modelResult = {};
  env.DEEPSEEK_MODEL_FAST = "configured-fast-model";
  response = await fetch(`${origin}/api/ai/hot-topic`, {
    method: "POST", body: JSON.stringify({ topic: { title: "Argentina football" } })
  });
  const aiResult = await response.json();
  assert.equal(aiResult.model, "configured-fast-model", "existing MODEL_FAST configuration must be preserved");
  const analyzedCount = calls.filter(c => c.host === "api.deepseek.com").length;
  await Promise.all([1, 2].map(i => fetch(`${origin}/api/ai/hot-topic`, {
    method: "POST", body: JSON.stringify({ topic: { title: "Argentina football", updatedAt: `2026-10-01T00:0${i}:00Z`, heat: i * 100 } })
  })));
  assert.equal(calls.filter(c => c.host === "api.deepseek.com").length, analyzedCount,
    "a refreshed timestamp must reuse the same server-side analysis");
  response = await fetch(`${origin}/api/ai/hot-topic`, {
    method: "POST", body: JSON.stringify({ apiKey: "personal-test-key", topic: { title: "Argentina football" } })
  });
  assert.equal(response.status, 200);
  assert.equal(calls.filter(c => c.host === "api.deepseek.com").length, analyzedCount + 1,
    "personal keys must not share another credential's analysis cache");
  const aiCall = calls.findLast(c => c.host === "api.deepseek.com");
  const sent = JSON.parse(aiCall.init.body);
  assert.equal(sent.model, "configured-fast-model");
  assert.equal(sent.thinking.type, "disabled");
  assert.equal(sent.response_format.type, "json_object");
  response = await fetch(`${origin}/api/ai/health`);
  assert.equal((await response.json()).model, "configured-fast-model", "health must report the effective model");
  env.DEEPSEEK_MODEL = "preferred-model";
  response = await fetch(`${origin}/api/ai/hot-topic`, {
    method: "POST", body: JSON.stringify({ topic: { title: "Argentina football" } })
  });
  assert.equal((await response.json()).model, "preferred-model", "MODEL takes precedence over MODEL_FAST");
  modelResult = {
    overview: [null, { label: "Value", value: { label: "Rating", value: "High", note: "Verify first" }, note: "Source" }],
    production: [{ label: "Platform", value: "Video", note: "Explain context" }],
    whyCare: [{ label: "Reason", value: "Public discussion", note: "Verify source" }],
    angles: [{ label: "Angle", value: "Explain the event", note: "Use facts" }],
    factsToVerify: [null, { label: "Source", value: "Original link", note: "Check date" }],
    risks: [{ label: "Risk", value: "Unverified", note: "Do not claim certainty" }]
  };
  response = await fetch(`${origin}/api/ai/hot-topic`, {
    method: "POST", body: JSON.stringify({ topic: { title: "Structured model output regression" } })
  });
  const structuredAnalysis = (await response.json()).analysis;
  for (const field of ["whyCare", "relation", "angles", "platforms", "factsToVerify", "risks"]) {
    assert.ok(structuredAnalysis[field].every(item => typeof item === "string"), `${field} must contain renderable text, not model objects`);
  }
  for (const field of ["overview", "production"]) {
    assert.ok(structuredAnalysis[field].every(item => item && [item.label, item.value, item.note].every(value => typeof value === "string")),
      `${field} must reject null entries and normalize nested model objects`);
  }
  console.log("CloudBase HTTP: Sportradar routes, five AI fallback handlers, multi-source search, safe errors and cached quota protection passed.");
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
