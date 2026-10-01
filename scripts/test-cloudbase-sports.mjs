import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let factory;
try { factory = require("../cloudfunctions/api-proxy/sports-service.js").createSportsService; } catch {}
assert.equal(typeof factory, "function", "CloudBase must expose a cached Sportradar service");
let now = 0, calls = 0, fail = false;
const sample = { sourceStatus: "live", lastUpdated: "2026-09-30T00:00:00Z", data: [{
  id: "sr:sport_event:1", kickoffTime: "2026-06-28T19:00:00Z", status: "finished", source: { provider: "sportradar" },
}] };
const client = {
  getSportradarWorldCupFixtures: async () => {
    calls++; if (fail) throw Object.assign(new Error("secret"), { upstreamStatus: 429 });
    await new Promise(resolve => setTimeout(resolve, 10));
    return sample;
  },
  getSportradarWorldCupMatch: async () => { calls++; throw Object.assign(new Error("secret"), { upstreamStatus: 401 }); },
};
const service = factory({ client, env: { SPORTRADAR_API_KEY: "secret", SPORTRADAR_WORLD_CUP_SEASON_ID: "sr:season:1" }, now: () => now });
assert.equal(service.health().configured, true);
assert.equal(calls, 0);
const [a, b] = await Promise.all([service.load("fixtures"), service.load("fixtures")]);
assert.equal(a.sourceStatus, "live");
assert.equal(b.data[0].id, sample.data[0].id);
assert.equal(calls, 1, "concurrent visits must share one request");
assert.equal((await service.load("fixtures")).sourceStatus, "cache");
assert.equal((await service.load("today", "2026-06-29")).data.length, 1);
assert.equal((await service.load("today", "2026-06-28")).data.length, 0);
assert.equal((await service.load("live")).data.length, 0);
assert.equal(calls, 1, "today/live should reuse season fixtures when season is configured");
now = 300001; fail = true;
const stale = await service.load("fixtures");
assert.equal(stale.sourceStatus, "cache");
assert.equal(stale.stale, true);
assert.equal(stale.lastUpdated, sample.lastUpdated, "stale data must retain its timestamp");
assert.equal(stale.diagnostics.status, "rate-limited");
assert.equal(JSON.stringify(stale).includes("secret"), false);
await service.load("fixtures");
assert.equal(calls, 2, "failed refresh cooldown protects quota");
now = 31 * 60 * 1000;
assert.equal((await service.load("fixtures")).sourceStatus, "error", "old cache must not survive beyond max stale age");
const unavailable = factory({ client, env: {}, now: () => now });
assert.equal((await unavailable.load("fixtures")).diagnostics.status, "not-configured");
assert.equal(calls, 3, "unconfigured requests never probe provider");
const unauthorized = await service.load("match", "sr:sport_event:2");
assert.equal(unauthorized.diagnostics.status, "unauthorized");
const count = calls;
await service.load("match", "sr:sport_event:2");
assert.equal(calls, count);
let detailCalls = 0;
const liveDetails = factory({ client: { getSportradarWorldCupMatch: async () => {
  detailCalls++; return { sourceStatus: "live", data: { ...sample.data[0], status: "live" }, lastUpdated: sample.lastUpdated };
} }, env: { SPORTRADAR_API_KEY: "test" }, now: () => now });
await liveDetails.load("match", "live-1");
now += 60001;
await liveDetails.load("match", "live-1");
assert.equal(detailCalls, 2, "a live single-match payload must use the one-minute TTL too");
console.log("CloudBase sports: shared cache, Beijing dates, empty results, stale fallback, cooldown and sanitized diagnostics passed.");
