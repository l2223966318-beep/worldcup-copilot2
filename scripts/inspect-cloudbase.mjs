import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TARGET, safeReleaseFailure } from "./release-cloudbase.mjs";

export async function inspectConfiguration({ env = process.env, client } = {}) {
  if (env.CLOUDBASE_RELEASE_AUTHORIZED !== "true") throw new Error("Independent deployment authorization has not been confirmed.");
  if (!env.TENCENTCLOUD_SECRET_ID || !env.TENCENTCLOUD_SECRET_KEY) throw new Error("Authorized Tencent deployment credentials are required.");
  if (!client) {
    const require = createRequire(new URL("./cloudbase-deploy/package.json", import.meta.url));
    const { scf } = require("tencentcloud-sdk-nodejs-scf");
    client = new scf.v20180416.Client({
      credential: { secretId: env.TENCENTCLOUD_SECRET_ID, secretKey: env.TENCENTCLOUD_SECRET_KEY,
        ...(env.TENCENTCLOUD_SESSION_TOKEN ? { token: env.TENCENTCLOUD_SESSION_TOKEN } : {}) },
      region: TARGET.region, profile: { httpProfile: { endpoint: "scf.tencentcloudapi.com", reqTimeout: 30 } }
    });
  }
  const current = await client.GetFunction({ FunctionName: TARGET.functionName, Namespace: TARGET.namespace, Qualifier: "$LATEST" });
  if (current.FunctionName !== TARGET.functionName || current.Type !== "HTTP" || current.Status !== "Active") throw new Error("Target must be the existing active HTTP function.");
  const variables = current.Environment?.Variables;
  if (!Array.isArray(variables)) throw new Error("Function environment variables could not be verified before release.");
  const value = key => variables.find(variable => variable.Key === key)?.Value?.trim() || "";
  return { functionName: TARGET.functionName, namespace: TARGET.namespace, region: TARGET.region,
    sharedAiConfigured: Boolean(value("DEEPSEEK_API_KEY")),
    releaseAiAccessMode: "public", releaseRequiresBrowserKey: false,
    sportsConfigured: Boolean(value("SPORTRADAR_API_KEY")), sportsSeasonFormatValid: /^sr:season:\d+$/.test(value("SPORTRADAR_WORLD_CUP_SEASON_ID")),
    cloudCodeUpdated: false, configurationUpdated: false };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { console.log(JSON.stringify(await inspectConfiguration(), null, 2)); }
  catch (error) { console.error(`Inspection stopped: ${safeReleaseFailure(error)}`); process.exitCode = 1; }
}
