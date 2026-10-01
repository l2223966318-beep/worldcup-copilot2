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
export function safeReleaseFailure(error) {
  const reasons = new Map([
    ["A 32-byte base64 backup key is required.", "CLOUDBASE_BACKUP_KEY must contain a 32-byte key encoded as standard Base64."],
    ["Invalid backup key.", "CLOUDBASE_BACKUP_KEY has an invalid decoded length."],
    ["Explicit target confirmation is required.", "Confirm the exact function name worldcup-api-proxy1."],
    ["Authorized Tencent deployment credentials are required.", "Tencent deployment credentials are missing."],
    ["Independent deployment authorization has not been confirmed.", "CLOUDBASE_RELEASE_AUTHORIZED must be true in the deployment environment."],
    ["Target must be the existing active HTTP function.", "The target is not the expected active HTTP function."],
    ["Function environment variables could not be verified before release.", "The function environment variable list could not be verified."],
    ["SPORTRADAR_WORLD_CUP_SEASON_ID must be explicitly configured when Sportradar is enabled.", "Configure SPORTRADAR_WORLD_CUP_SEASON_ID as sr:season:digits in Tencent Cloud before releasing."],
  ]);
  if (reasons.has(error?.message)) return reasons.get(error.message);
  if (["AuthFailure", "AuthFailure.SecretIdNotFound", "AuthFailure.SignatureFailure", "AuthFailure.TokenFailure", "AuthFailure.InvalidSecretId"].includes(error?.code)) {
    return "Tencent credentials could not be authenticated. Check the deployment account keys.";
  }
  if (["UnauthorizedOperation", "UnauthorizedOperation.CAM", "UnauthorizedOperation.NoPermission"].includes(error?.code)) {
    return "Tencent permission denied. Check the deployment account SCF policy.";
  }
  if (["ResourceNotFound", "ResourceNotFound.Function", "ResourceNotFound.Namespace"].includes(error?.code)) {
    return "Tencent could not find the target function or namespace in the configured region.";
  }
  return "Operation failed. Inspect the last release stage; raw provider errors and credentials are suppressed.";
}
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
  client, fetchImpl = fetch, saveBackup, onStage = () => {}, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  onStage("validate-inputs");
  for (const key of Object.keys(TARGET)) if (target[key] !== TARGET[key]) throw new Error("Release target is locked to the existing function.");
  zipGuard(zip);
  const sha256 = createHash("sha256").update(zip).digest("hex");
  if (!apply) return { mode: "preview", ...TARGET, sha256, bytes: zip.length, networkCalls: 0 };
  if (confirmFunction !== TARGET.functionName) throw new Error("Explicit target confirmation is required.");
  if (!env.TENCENTCLOUD_SECRET_ID || !env.TENCENTCLOUD_SECRET_KEY) throw new Error("Authorized Tencent deployment credentials are required.");
  if (env.CLOUDBASE_RELEASE_AUTHORIZED !== "true") throw new Error("Independent deployment authorization has not been confirmed.");
  backupKey(env.CLOUDBASE_BACKUP_KEY);
  if (typeof saveBackup !== "function") throw new Error("Encrypted backup storage is required.");
  onStage("load-sdk");
  const api = client || await sdkClient(env);
  const params = { FunctionName: TARGET.functionName, Namespace: TARGET.namespace, Qualifier: "$LATEST" };
  onStage("read-function");
  const current = await api.GetFunction(params);
  onStage("validate-function-config");
  if (current.FunctionName !== TARGET.functionName || current.Type !== "HTTP" || current.Status !== "Active") {
    throw new Error("Target must be the existing active HTTP function.");
  }
  const variables = current.Environment?.Variables;
  if (!Array.isArray(variables)) throw new Error("Function environment variables could not be verified before release.");
  const configuredValue = key => variables.find(variable => variable.Key === key)?.Value?.trim() || "";
  if (configuredValue("SPORTRADAR_API_KEY") && !/^sr:season:\d+$/.test(configuredValue("SPORTRADAR_WORLD_CUP_SEASON_ID"))) {
    throw new Error("SPORTRADAR_WORLD_CUP_SEASON_ID must be explicitly configured when Sportradar is enabled.");
  }
  onStage("get-backup-address");
  const address = await api.GetFunctionAddress(params);
  onStage("download-backup");
  const backup = await downloadBackup(address.Url, fetchImpl);
  onStage("save-encrypted-backup");
  await saveBackup(encryptBackup(backup, env.CLOUDBASE_BACKUP_KEY));
  // Only code is changed: omit Handler, runtime, secrets, routes and aliases.
  onStage("update-code");
  await api.UpdateFunctionCode({ FunctionName: TARGET.functionName, Namespace: TARGET.namespace,
    CodeSource: "ZipFile", ZipFile: zip.toString("base64"), Publish: "FALSE" });
  onStage("wait-active");
  let active = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const state = await api.GetFunction(params);
    if (state.Status === "Active") { active = true; break; }
    if (!['Updating', 'Publishing', 'Creating'].includes(state.Status)) throw new Error("Function did not reach active status. Encrypted backup retained.");
    await wait(2000);
  }
  if (!active) throw new Error("Deployment status timed out. Encrypted backup retained.");
  onStage("verify-public-health");
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
      onStage: stage => console.log(`Release stage: ${stage}`),
      saveBackup: async bytes => {
        await mkdir(directory, { recursive: true });
        await writeFile(new URL(`live-before-${Date.now()}.zip.enc`, directory), bytes, { flag: "wx", mode: 0o600 });
      },
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Release stopped: ${safeReleaseFailure(error)}`);
    process.exitCode = 1;
  }
}
