import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function inspectResponse(path, status, body) {
  const result = { path, httpStatus: status, state: "unknown-contract" };
  if (status === 404) return { ...result, state: "missing-route" };
  if (status < 200 || status >= 300) return { ...result, state: "http-error" };
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ...result, state: "invalid-response" };
  }
  if (path === "/api/health") {
    return { ...result, state: body.ok === true ? "healthy" : "unknown-contract",
      version: typeof body.version === "string" ? body.version.slice(0, 100) : null };
  }
  if (path === "/api/hot/health") {
    // A route existing does not prove that any configured provider returns data.
    return { ...result, state: body.ok === true && Array.isArray(body.providers) ? "diagnostics-present" : "unknown-contract" };
  }
  if (path === "/api/worldcup/health" || path === "/api/ai/health") {
    return { ...result, state: body.ok === true && typeof body.configured === "boolean" ? "configuration-present" : "unknown-contract",
      configured: body.configured === true,
      ...(path === "/api/ai/health" ? { accessMode: body.accessMode === "public" ? "public" : "unknown" } : {}),
      ...(path === "/api/worldcup/health" ? { seasonConfigured: body.seasonConfigured === true } : {}),
    };
  }
  const states = { live: "live", partial: "partial", cache: "cache", fallback: "fallback", error: "upstream-error" };
  result.state = states[body.sourceStatus] || "unknown-contract";
  if (!Array.isArray(body.data)) return { ...result, state: "invalid-response" };
  const providers = {};
  let unattributed = 0;
  for (const item of body.data) {
    const provider = item?.provider || item?.source?.provider;
    if (typeof provider === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(provider)) {
      Object.defineProperty(providers, provider, { value: (Object.hasOwn(providers, provider) ? providers[provider] : 0) + 1, enumerable: true, configurable: true });
    } else unattributed++;
  }
  return { ...result, count: body.data.length, providers, unattributed };
}

export async function checkDeployment(origin, { fetchImpl = fetch, includeData = false, timeoutMs = 20000 } = {}) {
  const base = new URL(origin);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    throw new Error("Use an HTTP(S) origin without credentials, path or query.");
  }
  const paths = ["/api/health", "/api/hot/health", "/api/worldcup/health", "/api/ai/health"];
  if (includeData) paths.push("/api/worldcup/fixtures", "/api/hot", "/api/hot/search?q=" + encodeURIComponent("Argentina France World Cup"));
  const checks = [];
  for (const path of paths) {
    try {
      const response = await fetchImpl(new URL(path, base), {
        signal: AbortSignal.timeout(timeoutMs), redirect: "error", headers: { accept: "application/json" },
      });
      const body = await response.json().catch(() => null);
      checks.push(inspectResponse(path, response.status, body));
    } catch {
      // Do not print raw upstream bodies/errors: they may contain credentials.
      checks.push({ path, state: "request-failed" });
    }
  }
  return { origin: base.origin, checkedAt: new Date().toISOString(), checks };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const origin = args.find(arg => !arg.startsWith("--"));
  if (!origin || args.some(arg => arg.startsWith("--") && arg !== "--data")) {
    console.error("Usage: node scripts/check-cloudbase.mjs https://your-host [--data]");
    process.exitCode = 1;
  } else {
    try {
      const report = await checkDeployment(origin, { includeData: args.includes("--data") });
      console.log(JSON.stringify(report, null, 2));
      if (report.checks.some(check => ["missing-route", "http-error", "invalid-response", "unknown-contract", "upstream-error", "request-failed"].includes(check.state))) process.exitCode = 1;
    } catch {
      console.error("Invalid origin. Supply only the HTTP(S) host, without credentials or query.");
      process.exitCode = 1;
    }
  }
}
