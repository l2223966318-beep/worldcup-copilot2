import assert from "node:assert/strict";
import { evaluateAudit } from "./dependency-audit-policy.mjs";

const now = Date.parse("2026-10-03T00:00:00Z");
const advisory = { name: "braces", dependency: "braces", severity: "high", range: "<=3.0.3",
  url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" };
const report = { auditReportVersion: 2, vulnerabilities: {
  braces: { name: "braces", severity: "high", nodes: ["node_modules/braces"], via: [advisory] },
  micromatch: { name: "micromatch", severity: "high", nodes: ["node_modules/micromatch"], via: ["braces"] }
} };
const lock = { packages: {
  "node_modules/braces": { version: "3.0.3", dev: true },
  "node_modules/micromatch": { version: "4.0.8", dev: true }
} };
function changedReport(change) { const value = structuredClone(report); change(value); return value; }
function changedLock(change) { const value = structuredClone(lock); change(value); return value; }

assert.equal(evaluateAudit({ auditReportVersion: 2, vulnerabilities: {} }, lock, now).length, 0);
assert.equal(evaluateAudit(report, lock, now).length, 2, "only the known dev-only advisory chain can be temporarily accepted");
assert.throws(() => evaluateAudit(report, changedLock(l => { l.packages["node_modules/braces"].dev = false; }), now), /development-only/);
assert.throws(() => evaluateAudit(report, changedLock(l => { delete l.packages["node_modules/micromatch"].dev; }), now), /development-only/);
assert.throws(() => evaluateAudit(report, changedLock(l => { delete l.packages["node_modules/braces"]; }), now), /development-only/);
assert.throws(() => evaluateAudit(report, changedLock(l => { l.packages["node_modules/braces"].version = "3.0.4"; }), now), /version/);
assert.throws(() => evaluateAudit(report, lock, Date.parse("2026-10-10T00:00:00Z")), /expired/);
assert.throws(() => evaluateAudit(report, lock, NaN), /date/);
assert.throws(() => evaluateAudit(changedReport(r => { r.vulnerabilities.braces.via[0].url = "https://github.com/advisories/GHSA-new"; }), lock, now), /Unaccepted/);
assert.throws(() => evaluateAudit(changedReport(r => { r.vulnerabilities.braces.via.push({ ...advisory, name: "other" }); }), lock, now), /Unaccepted/);
assert.throws(() => evaluateAudit(changedReport(r => { r.vulnerabilities.braces.via[0].severity = "critical"; }), lock, now), /Unaccepted/);
assert.throws(() => evaluateAudit(changedReport(r => { r.vulnerabilities.braces.severity = "critical"; }), lock, now), /severity/);
assert.throws(() => evaluateAudit(changedReport(r => { r.vulnerabilities.micromatch.via = ["missing"]; }), lock, now), /Missing/);
assert.throws(() => evaluateAudit(changedReport(r => { r.vulnerabilities.micromatch.via = ["micromatch"]; }), lock, now), /Cycle/);
assert.throws(() => evaluateAudit(changedReport(r => { r.vulnerabilities.braces.via = []; }), lock, now), /Malformed/);
assert.throws(() => evaluateAudit(changedReport(r => { r.vulnerabilities.braces.nodes = []; }), lock, now), /Malformed/);
assert.throws(() => evaluateAudit({ error: { message: "registry unavailable" } }, lock, now), /Malformed/);
assert.throws(() => evaluateAudit({ auditReportVersion: 2, vulnerabilities: [] }, lock, now), /Malformed/);
console.log("Dependency audit: clean reports, exact dev-only advisory, version scope, expiry, new threats and malformed reports checked.");
