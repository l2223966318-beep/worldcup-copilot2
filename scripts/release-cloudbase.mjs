import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { checkDeployment } from "./check-cloudbase.mjs";

export const TARGET = Object.freeze({
  region: "ap-shanghai", namespace: "scti-test-2026-d6g3udtld9f8e08f5", functionName: "worldcup-api-proxy1",
  origin: "https://scti-test-2026-d6g3udtld9f8e08f5-1455712258.ap-shanghai.app.tcloudbase.com",
  version: "direct-v6.1-complete",
});
const MAX_BYTES = 20 * 1024 * 1024;
const MAGIC = Buffer.from("WC_BACKUP_1\n");
function backupKey(value) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value || "")) throw new Error("A 32-byte base64 backup key is required.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("Invalid backup key.");
  return key;
}
function zipGuard(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > MAX_BYTES || !bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) {
    throw new Error("Invalid or oversized ZIP package.");
  }
}
export function encryptBackup(bytes, keyText) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", backupKey(keyText), iv);
  cipher.setAAD(MAGIC);
  const content = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), content]);
}
export function decryptBackup(bytes, keyText) {
  if (bytes.length < MAGIC.length + 28 || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Invalid encrypted backup.");
  const offset = MAGIC.length;
  const cipher = createDecipheriv("aes-256-gcm", backupKey(keyText), bytes.subarray(offset, offset + 12));
  cipher.setAAD(MAGIC);
  cipher.setAuthTag(bytes.subarray(offset + 12, offset + 28));
  return Buffer.concat([cipher.update(bytes.subarray(offset + 28)), cipher.final()]);
}
async function downloadBackup(url, fetchImpl) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("Invalid backup download URL."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !parsed.hostname.endsWith(".myqcloud.com")) {
    throw new Error("Unapproved backup download endpoint.");
  }
  const response = await fetchImpl(parsed, { redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Live backup download failed.");
  const chunks = []; let length = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BYTES) throw new Error("Live backup exceeds package limit.");
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = Buffer.concat(chunks);
  zipGuard(bytes);
  return bytes;
}
async function sdkClient(env) {
  const require = createRequire(new URL("./cloudbase-deploy/package.json", import.meta.url));
  const { scf } = require("tencentcloud-sdk-nodejs-scf");
  return new scf.v20180416.Client({
    credential: { secretId: env.TENCENTCLOUD_SECRET_ID, secretKey: env.TENCENTCLOUD_SECRET_KEY,
      ...(env.TENCENTCLOUD_SESSION_TOKEN ? { token: env.TENCENTCLOUD_SESSION_TOKEN } : {}) },
    region: TARGET.region, profile: { httpProfile: { endpoint: "scf.tencentcloudapi.com", reqTimeout: 30 } },
  });
}
export async function release({ zip, apply = false, confirmFunction = "", target = TARGET, env = process.env,
  client, fetchImpl = fetch, saveBackup, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (const key of Object.keys(TARGET)) if (target[key] !== TARGET[key]) throw new Error("Release target is locked to the existing function.");
  zipGuard(zip);
  const sha256 = createHash("sha256").update(zip).digest("hex");
  if (!apply) return { mode: "preview", ...TARGET, sha256, bytes: zip.length, networkCalls: 0 };
  if (confirmFunction !== TARGET.functionName) throw new Error("Explicit target confirmation is required.");
  if (!env.TENCENTCLOUD_SECRET_ID || !env.TENCENTCLOUD_SECRET_KEY) throw new Error("Authorized Tencent deployment credentials are required.");
  if (env.CLOUDBASE_RELEASE_AUTHORIZED !== "true") throw new Error("Independent deployment authorization has not been confirmed.");
  backupKey(env.CLOUDBASE_BACKUP_KEY);
  if (typeof saveBackup !== "function") throw new Error("Encrypted backup storage is required.");
  const api = client || await sdkClient(env);
  const params = { FunctionName: TARGET.functionName, Namespace: TARGET.namespace, Qualifier: "$LATEST" };
  const current = await api.GetFunction(params);
  if (current.FunctionName !== TARGET.functionName || current.Type !== "HTTP" || current.Status !== "Active") {
    throw new Error("Target must be the existing active HTTP function.");
  }
  const address = await api.GetFunctionAddress(params);
  const backup = await downloadBackup(address.Url, fetchImpl);
  await saveBackup(encryptBackup(backup, env.CLOUDBASE_BACKUP_KEY));
  // Only code is changed: omit Handler, runtime, secrets, routes and aliases.
  await api.UpdateFunctionCode({ FunctionName: TARGET.functionName, Namespace: TARGET.namespace,
    CodeSource: "ZipFile", ZipFile: zip.toString("base64"), Publish: "FALSE" });
  let active = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const state = await api.GetFunction(params);
    if (state.Status === "Active") { active = true; break; }
    if (!['Updating', 'Publishing', 'Creating'].includes(state.Status)) throw new Error("Function did not reach active status. Encrypted backup retained.");
    await wait(2000);
  }
  if (!active) throw new Error("Deployment status timed out. Encrypted backup retained.");
  for (let attempt = 0; attempt < 6; attempt++) {
    const report = await checkDeployment(TARGET.origin, { fetchImpl });
    const checks = report.checks;
    if (checks.length === 4 && checks[0].version === TARGET.version && checks.every(check =>
      ["healthy", "diagnostics-present", "configuration-present"].includes(check.state))) {
      return { mode: "verified", ...TARGET, sha256, checks, backup: "encrypted", businessProvidersTested: false };
    }
    await wait(2000);
  }
  throw new Error("Public version or health verification failed. Encrypted backup retained; no automatic rollback.");
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2);
    const apply = args.includes("--apply");
    const confirmation = args.find(arg => arg.startsWith("--confirm-function="))?.split("=")[1] || "";
    if (args.some(arg => arg !== "--apply" && !arg.startsWith("--confirm-function="))) throw new Error("Invalid release arguments.");
    const directory = new URL("../deliverables/cloudbase-release/", import.meta.url);
    const result = await release({
      zip: readFileSync(new URL("../deliverables/cloudbase/worldcup-api-v6.1-complete.zip", import.meta.url)), apply, confirmFunction: confirmation,
      saveBackup: async bytes => {
        await mkdir(directory, { recursive: true });
        await writeFile(new URL(`live-before-${Date.now()}.zip.enc`, directory), bytes, { flag: "wx", mode: 0o600 });
      },
    });
    console.log(JSON.stringify(result, null, 2));
  } catch {
    console.error("Release stopped. Check authorization, package, encrypted backup and deployment status. No raw API errors or credentials are printed.");
    process.exitCode = 1;
  }
}
