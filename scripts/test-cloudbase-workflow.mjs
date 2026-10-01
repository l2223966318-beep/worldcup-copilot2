import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const yaml = createRequire(import.meta.url)("js-yaml");
const text = readFileSync(new URL("../.github/workflows/cloudbase-release.yml", import.meta.url), "utf8");
const config = yaml.load(text);
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
for (const job of Object.values(config.jobs)) {
  for (const step of job.steps) {
    for (const [, script] of (step.run || "").matchAll(/^\s*npm run ([\w:.-]+)\s*$/gm)) {
      assert.equal(typeof manifest.scripts[script], "string", `Workflow references missing npm script: ${script}`);
    }
  }
}
assert.deepEqual(Object.keys(config.on), ["workflow_dispatch"], "pushes and PRs must not release a cloud function");
assert.equal(config.on.workflow_dispatch.inputs.dry_run.default, true);
assert.deepEqual(config.permissions, { contents: "read" });
assert.equal(config.concurrency["cancel-in-progress"], false);
assert.equal(config.jobs.release.environment, "cloudbase-production");
assert.equal(config.jobs.release.needs, "validate");
assert.match(config.jobs.release.if, /!inputs.dry_run/);
const publish = config.jobs.release.steps.find(step => step.id === "publish");
assert.equal(publish.env.CLOUDBASE_RELEASE_AUTHORIZED, "${{ vars.CLOUDBASE_RELEASE_AUTHORIZED }}");
assert.match(publish.run, /refs\/heads\/main/);
assert.match(publish.run, /--confirm-function=\$CONFIRM_FUNCTION/);
assert.equal(config.jobs.release.steps.at(-1).with.path, "deliverables/cloudbase-release/*.zip.enc");
assert.equal(config.jobs.release.steps.at(-1).if, "${{ always() }}");
assert.ok(config.jobs.validate.steps.every(step => !step.env), "validation job must never receive cloud secrets");
console.log("CloudBase workflow: manual-only, offline default, approval environment, least privilege and encrypted artifact guards passed.");
