import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { TARGET as BACKEND, encryptBackup } from "./release-cloudbase.mjs";

export const TARGET = Object.freeze({ namespace: BACKEND.namespace, region: BACKEND.region, origin: BACKEND.origin });
const require = createRequire(new URL("./cloudbase-hosting/package.json", import.meta.url));
const MAX_BYTES = 100 * 1024 * 1024;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

function authorize(env) {
  if (env.CLOUDBASE_FRONTEND_RELEASE_AUTHORIZED !== "true") throw new Error("Frontend deployment authorization is required.");
  if (!env.TENCENTCLOUD_SECRET_ID || !env.TENCENTCLOUD_SECRET_KEY) throw new Error("Authorized deployment credentials are required.");
}
export function hostingCosOptions(env) {
  return { SecretId: env.TENCENTCLOUD_SECRET_ID, SecretKey: env.TENCENTCLOUD_SECRET_KEY,
    ...(env.TENCENTCLOUD_SESSION_TOKEN ? { SecurityToken: env.TENCENTCLOUD_SESSION_TOKEN } : {}),
    Domain: "{Bucket}.cos.{Region}.tencentcos.cn", Protocol: "https:", Timeout: 60000 };
}
function sdk(env) {
  const { tcb } = require("tencentcloud-sdk-nodejs-tcb");
  const COS = require("cos-nodejs-sdk-v5");
  const credential = { secretId: env.TENCENTCLOUD_SECRET_ID, secretKey: env.TENCENTCLOUD_SECRET_KEY,
    ...(env.TENCENTCLOUD_SESSION_TOKEN ? { token: env.TENCENTCLOUD_SESSION_TOKEN } : {}) };
  return {
    client: new tcb.v20180608.Client({ credential, region: TARGET.region,
      profile: { httpProfile: { endpoint: "tcb.tencentcloudapi.com", reqTimeout: 30 } } }),
    cos: new COS(hostingCosOptions(env)),
  };
}
function prefix(value = "") {
  if (typeof value !== "string" || /\\|[?#\u0000-\u001f]/.test(value) ||
      value.split("/").some(part => part === "." || part === "..")) throw new Error("Invalid hosting path.");
  return value.replace(/^\/+|\/+$/g, "");
}
export async function inspectHosting({ env = process.env, client, onStage = () => {} } = {}) {
  authorize(env);
  client ||= sdk(env).client;
  onStage("read-static-store");
  const { Data } = await client.DescribeStaticStore({ EnvId: TARGET.namespace });
  const store = Data?.find(item => item.EnvId === TARGET.namespace);
  if (!store || store.Status !== "online") throw new Error("Existing online hosting target is required.");
  const external = store.ExternalStorage?.Enabled === true ? store.ExternalStorage : null;
  const bucket = store.Bucket || external?.BucketName;
  const region = store.Region || store.Regoin || external?.Region;
  const basePath = external ? prefix(external.BasePath) : "";
  if (!/^[a-z0-9-]+-\d+$/.test(bucket || "") || region !== TARGET.region ||
      (external && !basePath)) throw new Error("Hosting target bucket or region could not be verified.");
  onStage("read-site-route");
  const response = await client.DescribeHTTPServiceRoute({ EnvId: TARGET.namespace,
    Filters: [{ Name: "Domain", Values: [new URL(TARGET.origin).hostname] }], Limit: 100 });
  const routes = response.Domains?.find(item => item.Domain === new URL(TARGET.origin).hostname)?.Routes;
  const root = routes?.find(item => item.Path === "/" && item.UpstreamResourceType === "STATIC_STORE");
  if (!root || root.Enable === false) throw new Error("Original product root must point to static hosting.");
  const rewrite = root.PathRewrite || {};
  if (rewrite.Prefix && rewrite.StaticStorePrefix) throw new Error("Ambiguous hosting path rewrite.");
  const routePrefix = prefix(rewrite.StaticStorePrefix || rewrite.Prefix || "");
  const objectPrefix = [basePath, routePrefix].filter(Boolean).join("/");
  const appId = bucket.match(/-(\d+)$/)[1];
  return { mode: "read-only", ...TARGET, bucket, objectPrefix,
    objectResource: `qcs::cos:${region}:uid/${appId}:${bucket}/${objectPrefix ? objectPrefix + "/" : ""}*`,
    requiredObjectActions: ["cos:GetObject", "cos:PutObject"],
    requiredReadActions: ["tcb:DescribeStaticStore", "tcb:DescribeHTTPServiceRoute"],
    cloudFilesUpdated: false, routesUpdated: false, permissionsUpdated: false };
}
function filesIn(directory) {
  const root = realpathSync(directory);
  const files = [];
  let bytes = 0;
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const path = resolve(dir, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error("Symlinks are not allowed in static artifacts.");
      if (stat.isDirectory()) { walk(path); continue; }
      const key = relative(root, path).split(sep).join("/");
      if (!stat.isFile() || /(?:^|\/)(?:\.env[^/]*|node_modules|\.git)(?:\/|$)|\.enc$/.test(key) ||
          /^(?:api|backups|scripts)\//.test(key)) throw new Error("Unexpected file in static artifact.");
      prefix(key);
      bytes += stat.size;
      if (bytes > MAX_BYTES || files.length >= 2000) throw new Error("Static artifact exceeds release limits.");
      files.push({ key, bytes: readFileSync(path) });
    }
  }
  walk(root);
  for (const key of ["index.html", "settings/index.html", "hot-topics/index.html", "pitch/index.html"]) {
    if (!files.some(file => file.key === key)) throw new Error("Required static page is missing.");
  }
  return files;
}
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "application/javascript",
  ".css": "text/css", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".ico": "image/x-icon" };
function metadata(file) {
  const extension = file.key.match(/\.[^.\/]+$/)?.[0];
  return { ContentType: contentTypes[extension] || "application/octet-stream",
    CacheControl: /\.(?:html|json|txt)$/.test(file.key) ? "no-cache" : "public, max-age=3600" };
}
function cosCall(cos, method, params) {
  return new Promise((resolve, reject) => cos[method](params, (error, data) => {
    if (!error) { resolve(data); return; }
    const safe = value => typeof value === "string" && /^[A-Za-z0-9_./-]{1,512}$/.test(value) ? value : undefined;
    const hints = new Map([["Access Denied.", "permission-denied"],
      ["You are denied by bucket referer rule", "bucket-referer-rule"], ["Request has expired", "signature-expired"]]);
    reject(Object.assign(new Error("COS operation failed."), { code: error.code,
      releaseDetails: { operation: method, object: safe(params.Key), requestId: safe(error.RequestId),
        status: Number.isInteger(error.statusCode) ? error.statusCode : undefined,
        hint: hints.get(error.error?.Message) } }));
  }));
}
export async function publishStatic({ directory, commit, env = process.env, client, cos,
  saveBackup, fetchImpl = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onStage = () => {}, onProgress = () => {} } = {}) {
  authorize(env);
  if (!/^[a-f0-9]{40}$/.test(commit || "")) throw new Error("An exact source commit is required.");
  if (typeof saveBackup !== "function") throw new Error("Encrypted frontend backup storage is required.");
  encryptBackup(Buffer.from("validate-backup-key"), env.CLOUDBASE_BACKUP_KEY);
  const files = filesIn(directory);
  if (!client || !cos) { const clients = sdk(env); client ||= clients.client; cos ||= clients.cos; }
  const target = await inspectHosting({ env, client, onStage });
  const params = key => ({ Bucket: target.bucket, Region: TARGET.region,
    Key: [target.objectPrefix, key].filter(Boolean).join("/") });
  const request = async (method, options) => {
    const start = Date.now();
    const progress = { operation: method, key: options.Key, bytes: options.Body?.length };
    onProgress({ ...progress, event: "start" });
    const object = await cosCall(cos, method, options);
    onProgress({ ...progress, bytes: object.Body?.length ?? progress.bytes,
      event: "complete", elapsedMs: Date.now() - start });
    return object;
  };
  const marker = { commit, fileCount: files.length, contentHash: hash(Buffer.from(
    files.map(file => [file.key, hash(file.bytes)]).sort().map(item => item.join(":")).join("\n"))) };
  if (files.some(file => file.key === "frontend-release.json")) throw new Error("Artifact must not supply its own release marker.");
  files.push({ key: "frontend-release.json", bytes: Buffer.from(JSON.stringify(marker)) });
  onStage("check-existing-home-page");
  await request("getObject", params("index.html"));
  onStage("backup-overwritten-files");
  const backup = []; let backupBytes = 0;
  const unchanged = new Set();
  for (const file of files) {
    try {
      const object = await request("getObject", params(file.key));
      const bytes = Buffer.from(object.Body);
      const expected = metadata(file);
      if (file.key !== "frontend-release.json" && hash(bytes) === hash(file.bytes) &&
          object.headers?.["content-type"] === expected.ContentType &&
          object.headers?.["cache-control"] === expected.CacheControl) unchanged.add(file.key);
      backupBytes += bytes.length;
      if (backupBytes > MAX_BYTES) throw new Error("Frontend backup exceeds release limits.");
      backup.push({ key: file.key, body: bytes.toString("base64"), headers: {
        contentType: object.headers?.["content-type"], cacheControl: object.headers?.["cache-control"] } });
    } catch (error) {
      if (error.code !== "NoSuchKey") throw error;
      backup.push({ key: file.key, missing: true });
    }
  }
  onStage("save-encrypted-frontend-backup");
  await saveBackup(encryptBackup(Buffer.from(JSON.stringify({ target, commit, backup })), env.CLOUDBASE_BACKUP_KEY));
  // Publish assets before entry pages, retaining old hashed assets for visitors with cached HTML.
  const priority = key => key === "frontend-release.json" ? 2 : Number(key.endsWith(".html"));
  const ordered = [...files].sort((a, b) => priority(a.key) - priority(b.key));
  onStage("upload-static-assets-and-pages");
  for (const file of ordered) {
    if (unchanged.has(file.key)) {
      onProgress({ operation: "putObject", key: params(file.key).Key, bytes: file.bytes.length, event: "skip" });
      continue;
    }
    await request("putObject", { ...params(file.key), Body: file.bytes, ...metadata(file) });
  }
  onStage("verify-uploaded-files");
  for (const file of files) {
    const object = await request("getObject", params(file.key));
    if (hash(Buffer.from(object.Body)) !== hash(file.bytes)) throw new Error("Uploaded frontend does not match candidate; encrypted backup retained.");
  }
  onStage("verify-original-product-url");
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetchImpl(`${TARGET.origin}/frontend-release.json?release=${commit}`,
      { redirect: "error", signal: AbortSignal.timeout(20000), headers: { "Cache-Control": "no-cache" } });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.commit === commit && body?.contentHash === marker.contentHash) {
      return { mode: "verified", origin: TARGET.origin, sourceCommit: commit,
        filesUploaded: files.length - unchanged.size, filesSkipped: unchanged.size, filesVerified: files.length,
        backup: "encrypted", oldAssetsDeleted: false, cloudFilesUpdated: true, browserInteractionsTested: false };
    }
    await wait(5000);
  }
  throw new Error("Original product URL verification failed; encrypted backup retained.");
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2);
    const onStage = stage => console.log(`Frontend release stage: ${stage}`);
    let report;
    if (args.length === 1 && args[0] === "--inspect") report = await inspectHosting({ onStage });
    else if (args.length === 2 && args[0] === "--apply") {
      report = await publishStatic({ directory: args[1], commit: process.env.FRONTEND_SOURCE_SHA, onStage,
        onProgress: item => console.log(`Frontend file progress: ${JSON.stringify(item)}`),
        saveBackup: async bytes => {
          const path = new URL("../deliverables/frontend-release/", import.meta.url);
          await mkdir(path, { recursive: true });
          await writeFile(new URL(`before-${Date.now()}.json.enc`, path), bytes, { flag: "wx", mode: 0o600 });
        } });
    } else throw new Error("Use --inspect or --apply <artifact-directory>.");
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const code = typeof error?.code === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(error.code) ? error.code : "RELEASE_FAILED";
    if (error.releaseDetails) console.error(`COS failure context: ${JSON.stringify(error.releaseDetails)}`);
    console.error(`Frontend release stopped: ${code}. Raw errors and credentials are suppressed; review the last stage.`);
    process.exitCode = 1;
  }
}
