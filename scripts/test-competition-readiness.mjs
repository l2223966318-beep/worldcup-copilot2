import assert from "node:assert/strict";
import { readinessStages, runReadiness } from "./competition-readiness.mjs";

assert.deepEqual(
  readinessStages.map(stage => stage.id),
  ["hot-sources", "hot-workflow", "evidence-review", "sportradar", "cloudbase-api", "product-entrypoints", "pitch", "live-cloudbase"],
  "readiness stages must follow the actual competition demo path"
);

const calls = [];
const report = await runReadiness({
  env: {},
  exec: async invocation => {
    calls.push(invocation.display);
    return { status: 0, stdout: "ok", stderr: "" };
  },
});

assert.equal(report.summary.failed, 0);
assert.equal(report.summary.skipped, 1, "live deployment check should skip without an origin");
assert.equal(report.summary.passed, 7);
assert.equal(report.results.at(-1).id, "live-cloudbase");
assert.equal(report.results.at(-1).status, "SKIP");
assert.match(report.results.at(-1).detail, /CLOUDBASE_PUBLIC_ORIGIN/);
assert.deepEqual(calls, [
  "npm run test:cloudbase-sources",
  "npm run test:hot-topic",
  "npm run test:evidence-review",
  "npm run test:sportradar-today",
  "npm run test:cloudbase-api",
  "npm run test:product-entrypoints",
  "npm run test:pitch",
]);

const liveCalls = [];
const failing = await runReadiness({
  env: { CLOUDBASE_PUBLIC_ORIGIN: "https://example.com" },
  exec: async invocation => {
    liveCalls.push(invocation);
    return invocation.display === "npm run test:evidence-review"
      ? { status: 1, stdout: "", stderr: "evidence failed" }
      : { status: 0, stdout: "ok", stderr: "" };
  },
});
assert.equal(failing.summary.failed, 1);
assert.equal(failing.summary.skipped, 0);
assert.equal(failing.results.find(item => item.id === "evidence-review").status, "FAIL");
assert.equal(failing.results.find(item => item.id === "live-cloudbase").status, "PASS");
assert.match(failing.results.find(item => item.id === "evidence-review").detail, /evidence failed/);
const liveInvocation = liveCalls.at(-1);
assert.match(liveInvocation.command, /(?:^|[\\/])node(?:\\.exe)?$/);
assert.deepEqual(liveInvocation.args, ["scripts/check-cloudbase.mjs", "https://example.com", "--data"]);

console.log("Competition readiness: stage order, skip semantics and failure attribution passed.");
