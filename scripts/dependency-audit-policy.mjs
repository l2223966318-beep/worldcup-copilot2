export const temporaryAdvisory = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
export const exceptionExpiresAt = "2026-10-10T00:00:00Z";

export function evaluateAudit(report, lock, now = Date.now()) {
  const issues = report?.vulnerabilities;
  if (report?.error || report?.auditReportVersion !== 2 || !issues || typeof issues !== "object" || Array.isArray(issues)) {
    throw new Error("Malformed npm audit report");
  }
  if (!Number.isFinite(now)) throw new Error("Invalid audit date");
  const names = Object.keys(issues);
  if (!names.length) return [];
  if (now >= Date.parse(exceptionExpiresAt)) throw new Error("Temporary development advisory exception expired");

  const checked = new Set();
  function inspect(name, visiting = new Set()) {
    if (visiting.has(name)) throw new Error(`Cycle in audit advisory chain: ${name}`);
    if (checked.has(name)) return;
    const issue = issues[name];
    if (!issue) throw new Error(`Missing audit dependency: ${name}`);
    if (issue.name !== name || !Array.isArray(issue.nodes) || !issue.nodes.length || !Array.isArray(issue.via) || !issue.via.length) {
      throw new Error(`Malformed audit dependency: ${name}`);
    }
    if (issue.severity !== "high") throw new Error(`Unaccepted advisory severity: ${name}`);
    for (const path of issue.nodes) {
      const pkg = lock?.packages?.[path];
      if (pkg?.dev !== true) throw new Error(`Advisory must remain development-only: ${path}`);
      if (name === "braces" && pkg.version !== "3.0.3") throw new Error(`Unaccepted braces version: ${pkg.version}`);
    }
    const next = new Set([...visiting, name]);
    for (const via of issue.via) {
      if (typeof via === "string") inspect(via, next);
      else if (name !== "braces" || via?.name !== "braces" || via?.dependency !== "braces" || via?.url !== temporaryAdvisory || via?.severity !== "high" || via?.range !== "<=3.0.3") {
        throw new Error(`Unaccepted security advisory: ${name}`);
      }
    }
    checked.add(name);
  }
  for (const name of names) inspect(name);
  return names;
}
