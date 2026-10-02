import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptBackup } from "./release-cloudbase.mjs";

const script = new URL("./release-cloudbase-static.mjs", import.meta.url);
assert.ok(existsSync(script), "frontend needs a real hosting release script, not just a ZIP artifact");
const { inspectHosting, publishStatic, TARGET } = await import(script);
let reads = 0;
const env = { CLOUDBASE_FRONTEND_RELEASE_AUTHORIZED: "true",
  TENCENTCLOUD_SECRET_ID: "test-id", TENCENTCLOUD_SECRET_KEY: "test-secret",
  CLOUDBASE_BACKUP_KEY: Buffer.alloc(32, 7).toString("base64") };
const client = {
  DescribeStaticStore: async () => { reads++; return { Data: [{
    EnvId: TARGET.namespace, Status: "online", Bucket: "test-hosting-1455712258",
    Region: TARGET.region, CdnDomain: "test.tcloudbaseapp.com"
  }] }; },
  DescribeHTTPServiceRoute: async () => ({ Domains: [{ Domain: new URL(TARGET.origin).hostname,
    Routes: [{ Path: "/", UpstreamResourceType: "STATIC_STORE", UpstreamResourceName: "staticstore" }] }] }),
};
await assert.rejects(inspectHosting({ env: {}, client }), /authorization/);
assert.equal(reads, 0);
await assert.rejects(inspectHosting({ env: { CLOUDBASE_FRONTEND_RELEASE_AUTHORIZED: "true" }, client }), /credentials/);
assert.equal(reads, 0);
const report = await inspectHosting({ env, client });
assert.equal(report.mode, "read-only");
assert.equal(report.bucket, "test-hosting-1455712258");
assert.doesNotMatch(JSON.stringify(report), /test-secret|test-id/);
await assert.rejects(inspectHosting({ env, client: { DescribeStaticStore: async () => ({
  Data: [{ EnvId: "another-env", Status: "online", Bucket: "other" }]
}) } }), /target/);
await assert.rejects(inspectHosting({ env, client: { ...client,
  DescribeHTTPServiceRoute: async () => ({ Domains: [] }) } }), /root/);
const shared = await inspectHosting({ env, client: { ...client,
  DescribeStaticStore: async () => ({ Data: [{ EnvId: TARGET.namespace, Status: "online",
    Bucket: "shared-hosting-1455712258", Region: TARGET.region,
    ExternalStorage: { Enabled: true, BasePath: "this-env" } }] }),
  DescribeHTTPServiceRoute: async () => ({ Domains: [{ Domain: new URL(TARGET.origin).hostname,
    Routes: [{ Path: "/", UpstreamResourceType: "STATIC_STORE", PathRewrite: { Prefix: "/product/" } }] }] }),
} });
assert.equal(shared.objectPrefix, "this-env/product");
assert.equal(shared.objectResource, "qcs::cos:ap-shanghai:uid/1455712258:shared-hosting-1455712258/this-env/product/*");

const directory = await mkdtemp(join(tmpdir(), "worldcup-static-release-"));
try {
  for (const key of ["index.html", "settings/index.html", "hot-topics/index.html", "pitch/index.html", "assets/image.png"]) {
    await mkdir(join(directory, key, ".."), { recursive: true });
    await writeFile(join(directory, key), key.endsWith(".png") ? Buffer.from([0, 255, 1, 128]) : `<html>${key}</html>`);
  }
  const commit = "a".repeat(40);
  const objects = new Map([["index.html", Buffer.from("old-home")], ["old-hashed.js", Buffer.from("keep")]]);
  const puts = [];
  const cos = {
    getObject: ({ Key }, callback) => objects.has(Key) ? callback(null, { Body: objects.get(Key), headers: {} }) :
      callback(Object.assign(new Error("Missing"), { code: "NoSuchKey" })),
    putObject: ({ Key, Body }, callback) => { puts.push(Key); objects.set(Key, Buffer.from(Body)); callback(null, {}); },
  };
  await assert.rejects(publishStatic({ env, client, cos, directory, commit,
    saveBackup: async () => { throw new Error("Disk failure"); } }), /Disk failure/);
  assert.equal(puts.length, 0, "a failed backup must prevent all uploads");
  let backup;
  const result = await publishStatic({ env, client, cos, directory, commit,
    saveBackup: async bytes => { backup = bytes; },
    fetchImpl: async url => {
      assert.equal(new URL(url).origin, TARGET.origin);
      return { ok: true, json: async () => JSON.parse(objects.get("frontend-release.json")) };
    } });
  assert.equal(result.mode, "verified");
  assert.equal(puts[0], "assets/image.png");
  assert.equal(puts.at(-1), "frontend-release.json", "the public marker must be uploaded last");
  assert.equal(objects.get("old-hashed.js").toString(), "keep");
  assert.deepEqual(objects.get("assets/image.png"), Buffer.from([0, 255, 1, 128]));
  const previous = JSON.parse(decryptBackup(backup, env.CLOUDBASE_BACKUP_KEY));
  assert.equal(Buffer.from(previous.backup.find(item => item.key === "index.html").body, "base64").toString(), "old-home");
  await assert.rejects(publishStatic({ env, client, cos, directory, commit,
    saveBackup: async () => {}, fetchImpl: async () => ({ ok: true, json: async () => ({ commit: "old" }) }),
    wait: async () => {} }), /verification failed/);
  await writeFile(join(directory, ".env.secret"), "must-not-upload");
  const before = puts.length;
  await assert.rejects(publishStatic({ env, client, cos, directory, commit, saveBackup: async () => {} }), /Unexpected file/);
  assert.equal(puts.length, before);
} finally { await rm(directory, { recursive: true, force: true }); }
const workflow = readFileSync(new URL("../.github/workflows/cloudbase-static-release.yml", import.meta.url), "utf8");
assert.match(workflow, /workflow_run:/);
assert.match(workflow, /cloudbase-production/);
assert.match(workflow, /competition-static/);
assert.match(workflow, /CLOUDBASE_FRONTEND_RELEASE_AUTHORIZED/);
assert.doesNotMatch(workflow, /pull_request_target|hosting delete|AdministratorAccess/);
console.log("Frontend release: authorization, target isolation, encrypted backup, binary integrity, ordered upload, public verification and secret rejection passed.");
