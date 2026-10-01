import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const moduleUrl = new URL("./inspect-cloudbase.mjs", import.meta.url);
let inspection;
try { inspection = await import(moduleUrl); } catch {}
assert.equal(typeof inspection?.inspectConfiguration, "function", "A read-only inspector must exist");
const env = { TENCENTCLOUD_SECRET_ID: "test-id", TENCENTCLOUD_SECRET_KEY: "test-key", CLOUDBASE_RELEASE_AUTHORIZED: "true" };
let reads = 0;
const client = { GetFunction: async params => {
  reads++;
  assert.equal(params.FunctionName, "worldcup-api-proxy1");
  assert.equal(params.Namespace, "scti-test-2026-d6g3udtld9f8e08f5");
  return { FunctionName: params.FunctionName, Type: "HTTP", Status: "Active", Environment: { Variables: [
    { Key: "DEEPSEEK_API_KEY", Value: "private-model-test-marker" },
    { Key: "SPORTRADAR_API_KEY", Value: "private-sports-test-marker" },
    { Key: "SPORTRADAR_WORLD_CUP_SEASON_ID", Value: "sr:season:123" }
  ] } };
} };
const report = await inspection.inspectConfiguration({ client, env });
assert.equal(reads, 1);
assert.equal(report.sharedAiConfigured, true);
assert.equal(report.aiAccessTokenConfigured, false);
assert.equal(report.sharedAiProtected, false);
assert.equal(report.sportsSeasonFormatValid, true);
assert.doesNotMatch(JSON.stringify(report), /private-model|private-sports|test-key|Variables|sr:season:123/);
await assert.rejects(inspection.inspectConfiguration({ client, env: { ...env, CLOUDBASE_RELEASE_AUTHORIZED: "false" } }));
assert.equal(reads, 1, "Denied authorization must not read cloud configuration");
await assert.rejects(inspection.inspectConfiguration({ env, client: { GetFunction: async () => ({}) } }));
const yaml = createRequire(import.meta.url)("js-yaml");
const config = yaml.load(readFileSync(new URL("../.github/workflows/cloudbase-inspect.yml", import.meta.url), "utf8"));
assert.deepEqual(Object.keys(config.on), ["workflow_dispatch"]);
assert.equal(config.jobs.inspect.environment, "cloudbase-production");
assert.deepEqual(config.permissions, { contents: "read" });
assert.doesNotMatch(JSON.stringify(config), /UpdateFunction|--apply|ALLOW_PUBLIC=true/);
console.log("Read-only CloudBase inspection: locked target, authorization, secret-free booleans and protected environment passed.");
