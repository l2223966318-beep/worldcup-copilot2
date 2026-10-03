import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { auditArguments, evaluateAudit, temporaryAdvisory, exceptionExpiresAt } from "./dependency-audit-policy.mjs";

function audit(productionOnly) {
  const args = auditArguments(productionOnly);
  const windows = process.platform === "win32";
  const result = spawnSync(windows ? "cmd.exe" : "npm", windows ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : args, {
    encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 10 * 1024 * 1024
  });
  if (result.error || ![0, 1].includes(result.status)) throw new Error("npm audit could not complete; release remains blocked");
  try { return JSON.parse(result.stdout); }
  catch { throw new Error("Malformed npm audit output; release remains blocked"); }
}

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const production = audit(true);
// No advisory exceptions apply to dependencies shipped at runtime.
if (evaluateAudit(production, lock).length) throw new Error("Production dependency vulnerabilities must block release");
const accepted = evaluateAudit(audit(false), lock);
if (accepted.length) {
  console.warn(`Temporary dev-only security exception: ${temporaryAdvisory}; expires ${exceptionExpiresAt}; affected packages: ${accepted.join(", ")}`);
}
console.log(JSON.stringify({ productionVulnerabilities: 0, temporaryDevAdvisoryPackages: accepted.length, otherAdvisoryExceptions: false }));
