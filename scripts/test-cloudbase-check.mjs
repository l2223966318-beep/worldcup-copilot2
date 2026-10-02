import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const moduleUrl = new URL("./check-cloudbase.mjs", import.meta.url);
assert.ok(existsSync(moduleUrl), "deployment checker must exist");
const { inspectResponse, checkDeployment } = await import(moduleUrl);

assert.equal(inspectResponse("/api/health", 200, { ok: true, version: "direct-v5-match-ai" }).state, "healthy");
assert.equal(inspectResponse("/api/hot/health", 404, { message: "Unknown API route." }).state, "missing-route");
assert.equal(inspectResponse("/api/hot", 200, { sourceStatus: "fallback", data: [] }).state, "fallback");
assert.equal(inspectResponse("/api/hot", 200, { sourceStatus: "error", data: [] }).state, "upstream-error");
assert.equal(inspectResponse("/api/hot", 200, "<html>sign in</html>").state, "invalid-response");
assert.equal(inspectResponse("/api/hot", 200, { data: [] }).state, "unknown-contract");
const mixed = inspectResponse("/api/hot", 200, { sourceStatus: "cache", data: [
  { provider: "uapi", source: "Daily chart" },
  { source: { provider: "redfox" } },
  { source: "Daily chart" },
] });
assert.equal(mixed.state, "cache");
assert.deepEqual(mixed.providers, { uapi: 1, redfox: 1 });
assert.equal(mixed.unattributed, 1, "display labels must not be guessed as providers");
assert.equal(mixed.count, 3);
const paths = [];
const report = await checkDeployment("https://example.com/", {
  fetchImpl: async (url) => {
    paths.push(new URL(url).pathname);
    if (paths.length === 1) return new Response(JSON.stringify({ ok: true, version: "test-v1" }));
    throw new Error("timeout with secret=never-print-this");
  },
});
assert.deepEqual(paths, ["/api/health", "/api/hot/health", "/api/worldcup/health", "/api/ai/health"]);
assert.equal(report.checks[1].state, "request-failed");
assert.equal(JSON.stringify(report).includes("never-print-this"), false);
assert.equal(inspectResponse("/api/worldcup/health", 200, { ok: true, configured: true, seasonConfigured: false }).seasonConfigured, false);
assert.equal(inspectResponse("/api/ai/health", 200, { ok: true, configured: false }).state, "configuration-present");
assert.equal(inspectResponse("/api/ai/health", 200, { ok: true, configured: true, accessMode: "public" }).accessMode, "public");
assert.equal(inspectResponse("/api/ai/health", 200, { ok: true, configured: true }).accessMode, "unknown");
assert.equal(inspectResponse("/api/hot/health", 200, { unexpected: true }).state, "unknown-contract");
await assert.rejects(() => checkDeployment("https://user:password@example.com"), /origin/);
console.log("CloudBase check: version, missing routes, fallback, attribution and safe failures passed.");
