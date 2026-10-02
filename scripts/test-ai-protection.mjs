import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(require, module, module.exports);
  return module.exports;
}
const { createAiRequestGuard, buildAiRequestKey } = load("../lib/ai/requestGuard.ts");
const key = buildAiRequestKey("secret-api-key", { prompt: "test" });
assert.equal(key.includes("secret-api-key"), false);
assert.notEqual(key, buildAiRequestKey("other-api-key", { prompt: "test" }));

let now = 0, calls = 0, release;
const guard = createAiRequestGuard({ AI_MAX_CONCURRENT: "1", AI_MAX_HOURLY_CALLS: "2", AI_MAX_DAILY_CALLS: "3" }, () => now);
const work = () => { calls++; return new Promise(resolve => { release = resolve; }); };
const a = guard.run("a", work, 1000), b = guard.run("a", work, 1000);
await new Promise(resolve => setImmediate(resolve));
assert.equal(calls, 1, "equal pending requests share one upstream call");
assert.equal((await guard.run("b", work)).ok, false, "concurrency is bounded");
release({ ok: true, data: { result: 1 }, model: "test" });
await Promise.all([a, b]);
assert.equal((await guard.run("a", work, 1000)).ok, true);
assert.equal(calls, 1, "successful analysis is cached");
now = 1001;
assert.equal((await guard.run("a", async () => { calls++; return { ok: true, data: {}, model: "test" }; })).ok, true);
assert.equal((await guard.run("c", work)).ok, false, "hourly cap prevents another call");
assert.equal(calls, 2);
now = 3_600_000;
assert.equal((await guard.run("c", async () => { calls++; return { ok: false, message: "unavailable" }; })).ok, false);
assert.equal(calls, 3);
await guard.run("c", work);
assert.equal(calls, 3, "failed requests enter a cooldown instead of another paid retry");
assert.equal((await guard.run("d", work)).ok, false, "daily cap survives an hourly reset");
now = 86_400_000;
assert.equal((await guard.run("d", async () => ({ ok: true, data: {}, model: "test" }))).ok, true);
const recover = createAiRequestGuard({ AI_MAX_CONCURRENT: "1" }, () => now);
await assert.rejects(recover.run("throws", async () => { throw new Error("test failure"); }));
assert.equal((await recover.run("after", async () => ({ ok: true, data: {}, model: "test" }))).ok, true,
  "exceptions release a concurrency slot");
const clientModule = { exports: {} };
const clientWindow = {};
for (const name of ["sessionStorage", "localStorage"]) {
  Object.defineProperty(clientWindow, name, { get() { throw new Error("disabled storage"); } });
}
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/ai/client-access.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { module: clientModule, exports: clientModule.exports, window: clientWindow });
const client = clientModule.exports;
assert.equal(JSON.stringify(client.getAiRequestHeaders()), '{"Content-Type":"application/json"}',
  "new visitors need no token, key or browser storage");
assert.doesNotMatch(readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8"),
  /ai-access-token|saveAiAccessToken|共享 AI 访问口令/);
console.log("AI protection: default anonymous access, BYOK isolation, deduplication, cache, cooldown and call caps.");
