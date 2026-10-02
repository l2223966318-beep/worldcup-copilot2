import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
const source = new URL("./release-cloudbase.mjs", import.meta.url);
assert.ok(existsSync(source), "an offline-by-default release script must exist");
const { release, TARGET, encryptBackup, decryptBackup, safeReleaseFailure } = await import(source);
assert.equal(typeof safeReleaseFailure, "function", "release failures must provide sanitized diagnostics");
assert.match(safeReleaseFailure(new Error("A 32-byte base64 backup key is required.")), /CLOUDBASE_BACKUP_KEY/);
assert.match(safeReleaseFailure({ code: "AuthFailure.SecretIdNotFound", message: "private-secret" }), /credentials/);
assert.match(safeReleaseFailure({ code: "UnauthorizedOperation", message: "private-secret" }), /permission/);
assert.equal(safeReleaseFailure(new Error("private-secret https://private?signature=secret")).includes("private"), false);
const zip = readFileSync(new URL("../deliverables/cloudbase/worldcup-api-v6.3-cache-guard.zip", import.meta.url));
const key = Buffer.alloc(32, 7).toString("base64");
let calls = [], saved;
const env = { TENCENTCLOUD_SECRET_ID: "test-id", TENCENTCLOUD_SECRET_KEY: "test-secret", CLOUDBASE_BACKUP_KEY: key, CLOUDBASE_RELEASE_AUTHORIZED: "true" };
const client = {
  GetFunction: async params => { calls.push(["read", params]); return { FunctionName: TARGET.functionName, Type: "HTTP", Status: "Active", Environment: { Variables: [] } }; },
  GetFunctionAddress: async params => { calls.push(["backup", params]); return { Url: "https://code.cos.ap-shanghai.myqcloud.com/download?signature=private" }; },
  UpdateFunctionCode: async params => { calls.push(["update", params]); return { RequestId: "test" }; },
};
let fetchCount = 0;
const fakeFetch = async url => {
  fetchCount++;
  const path = new URL(url).pathname;
  if (path === "/download") return new Response(zip);
  if (path === "/api/health") return Response.json({ ok: true, version: TARGET.version });
  if (path === "/api/hot/health") return Response.json({ ok: true, providers: [] });
  if (path === "/api/ai/hot-topic") return Response.json({ sourceStatus: "error", message: "Topic required." }, { status: 400 });
  return Response.json({ ok: true, configured: true, seasonConfigured: true, accessMode: "public" });
};
const options = { zip, env, client, fetchImpl: fakeFetch, saveBackup: async data => { saved = data; }, wait: async () => {} };
const stages = [];
await assert.rejects(release({ ...options, apply: true, confirmFunction: TARGET.functionName,
  env: { ...env, CLOUDBASE_BACKUP_KEY: "invalid" }, onStage: stage => stages.push(stage) }), /backup key/);
assert.deepEqual(stages, ["validate-inputs"], "invalid backup key must identify its stage without starting cloud calls");
let result = await release(options);
assert.equal(result.mode, "preview");
assert.equal(calls.length, 0, "default preview must never contact Tencent");
assert.equal(fetchCount, 0);
await assert.rejects(release({ ...options, apply: true, confirmFunction: "another" }), /confirmation/);
await assert.rejects(release({ ...options, apply: true, confirmFunction: TARGET.functionName, env: {} }), /credentials/);
await assert.rejects(release({ ...options, apply: true, confirmFunction: TARGET.functionName, env: { ...env, CLOUDBASE_RELEASE_AUTHORIZED: "false" } }), /authorization/);
await assert.rejects(release({ ...options, apply: true, confirmFunction: TARGET.functionName, env: { ...env, CLOUDBASE_BACKUP_KEY: "invalid" } }), /backup key/);
await assert.rejects(release({ ...options, apply: true, confirmFunction: TARGET.functionName, target: { ...TARGET, namespace: "another" } }), /target/);
assert.equal(calls.length, 0, "invalid authorization/input must fail before any SDK call");
const encrypted = encryptBackup(zip, key);
assert.deepEqual(decryptBackup(encrypted, key), zip);
assert.equal(encrypted.includes(Buffer.from("index.js")), false);
await assert.rejects(async () => decryptBackup(encrypted, Buffer.alloc(32, 8).toString("base64")));
for (const season of [undefined, "", "   ", "not-a-season"]) {
  calls = [];
  const beforeFetch = fetchCount;
  const variables = [{ Key: "SPORTRADAR_API_KEY", Value: "private-provider-key" }];
  if (season !== undefined) variables.push({ Key: "SPORTRADAR_WORLD_CUP_SEASON_ID", Value: season });
  await assert.rejects(release({ ...options, apply: true, confirmFunction: TARGET.functionName,
    client: { ...client, GetFunction: async params => {
      calls.push(["read", params]);
      return { FunctionName: TARGET.functionName, Type: "HTTP", Status: "Active", Environment: { Variables: variables } };
    } } }), /SPORTRADAR_WORLD_CUP_SEASON_ID/);
  assert.deepEqual(calls.map(([method]) => method), ["read"], "Invalid season configuration must stop before backup or code update");
  assert.equal(fetchCount, beforeFetch, "Preflight must not probe paid providers or download code");
}
calls = [];
await assert.rejects(release({ ...options, apply: true, confirmFunction: TARGET.functionName,
  client: { ...client, GetFunction: async params => {
    calls.push(["read", params]);
    return { FunctionName: TARGET.functionName, Type: "HTTP", Status: "Active" };
  } } }), /environment variables could not be verified/);
assert.deepEqual(calls.map(([method]) => method), ["read"]);
calls = [];
result = await release({ ...options, apply: true, confirmFunction: TARGET.functionName,
  client: { ...client, GetFunction: async params => {
    calls.push(["read", params]);
    return { FunctionName: TARGET.functionName, Type: "HTTP", Status: "Active",
      Environment: { Variables: [{ Key: "DEEPSEEK_API_KEY", Value: "test-shared-key" }] } };
  } } });
assert.equal(result.mode, "verified", "a configured shared key requires no access token");
assert.equal(result.anonymousAiInputAccepted, true);
assert.ok(calls.some(([method]) => method === "update"));
calls = [];
result = await release({ ...options, apply: true, confirmFunction: TARGET.functionName,
  client: { ...client, GetFunction: async params => {
    calls.push(["read", params]);
    return { FunctionName: TARGET.functionName, Type: "HTTP", Status: "Active", Environment: { Variables: [
      { Key: "SPORTRADAR_API_KEY", Value: "private-provider-key" },
      { Key: "SPORTRADAR_WORLD_CUP_SEASON_ID", Value: " sr:season:123456 " }
    ] } };
  } } });
assert.equal(result.mode, "verified");
assert.deepEqual(decryptBackup(saved, key), zip);
const update = calls.find(([method]) => method === "update")[1];
assert.equal(update.FunctionName, TARGET.functionName);
assert.equal(update.Namespace, TARGET.namespace);
assert.equal(update.Publish, "FALSE");
assert.deepEqual(Buffer.from(update.ZipFile, "base64"), zip);
assert.deepEqual(Object.keys(update).sort(), ["CodeSource", "FunctionName", "Namespace", "Publish", "ZipFile"].sort(), "release must not change runtime, env vars or routes");
assert.equal(JSON.stringify(result).includes("private"), false);
assert.equal(JSON.stringify(result).includes("test-secret"), false);
assert.equal(JSON.stringify(result).includes("private-provider-key"), false);
calls = [];
await assert.rejects(release({ ...options, apply: true, confirmFunction: TARGET.functionName, saveBackup: async () => { throw new Error("disk failure"); } }), /disk failure/);
assert.equal(calls.some(([method]) => method === "update"), false, "failed backup must prevent release");
calls = [];
await assert.rejects(release({ ...options, apply: true, confirmFunction: TARGET.functionName, fetchImpl: async () => new Response(zip, { status: 403 }) }), /backup/);
assert.equal(calls.some(([method]) => method === "update"), false);
calls = [];
await assert.rejects(release({ ...options, apply: true, confirmFunction: TARGET.functionName,
  client: { ...client, GetFunction: async () => ({ FunctionName: TARGET.functionName, Type: "Event", Status: "Active" }) } }), /HTTP/);
assert.equal(calls.length, 0);
await assert.rejects(release({ ...options, apply: true, confirmFunction: TARGET.functionName,
  fetchImpl: async url => new URL(url).pathname === "/download" ? new Response(zip) : Response.json({ ok: true, version: "old", providers: [], configured: true }) }), /verification/);
await assert.rejects(release({ ...options, apply: true, confirmFunction: TARGET.functionName,
  fetchImpl: async url => new URL(url).pathname === "/api/ai/hot-topic"
    ? Response.json({ sourceStatus: "error" }, { status: 401 }) : fakeFetch(url) }), /Anonymous AI input verification/,
  "public health alone must not hide an access gate on the AI endpoint");
console.log("CloudBase release: offline default, authorization guards, encrypted backups, code-only updates and version acceptance passed (all network mocked).");
