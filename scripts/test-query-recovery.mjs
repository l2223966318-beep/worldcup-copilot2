import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const timers = new Map();
let serial = 0, state, cleanup, calls = 0;
const cachedPayload = { sourceStatus: "live", data: { status: "live" }, lastUpdated: "2026-10-01T00:00:00Z" };
const window = {
  localStorage: { getItem: () => null, setItem() {} },
  setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id; },
  clearTimeout(id) { timers.delete(id); }
};
const module = { exports: {} };
const code = ts.transpileModule(readFileSync(new URL("../lib/sports/client.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
vm.runInNewContext(code, {
  module, exports: module.exports, window, Date, console,
  require(name) { assert.equal(name, "react"); return {
    useState(initial) { state = initial(); return [state, value => { state = typeof value === "function" ? value(state) : value; }]; },
    useEffect(effect) { cleanup = effect(); }
  }; },
  fetch: async () => { calls++; return { ok: calls > 2, status: calls > 2 ? 200 : 503,
    json: async () => calls > 2 ? cachedPayload : { sourceStatus: "error", message: "temporarily unavailable" } }; }
});
const tick = () => new Promise(resolve => setImmediate(resolve));
module.exports.useWorldCupQuery("/test", () => 60_000);
await tick();
const firstRetry = [...timers.entries()].find(([, timer]) => timer.delay === 350);
assert.ok(firstRetry, "one transport retry is expected");
timers.delete(firstRetry[0]); firstRetry[1].fn();
await tick();
assert.equal(calls, 2);
assert.match(state.error, /temporarily unavailable/);
const recovery = [...timers.entries()].find(([, timer]) => timer.delay >= 1_000);
assert.ok(recovery, "a failed polling request must schedule a bounded recovery attempt");
timers.delete(recovery[0]); recovery[1].fn();
await tick();
assert.equal(calls, 3);
assert.equal(state.payload.data.status, "live");
assert.equal(state.error, undefined);
cleanup();
assert.equal(timers.size, 0, "unmount must cancel the next refresh");
window.localStorage.getItem = () => JSON.stringify({ savedAt: Date.now(), payload: cachedPayload });
module.exports.useWorldCupQuery("/test", () => 60_000, { revalidateOnMount: false });
await tick();
assert.equal(calls, 3, "a fresh cache must avoid an immediate duplicate request");
assert.equal(timers.size, 1, "a fresh cache must still schedule the next polling refresh");
cleanup();
assert.equal(timers.size, 0);
console.log("Query recovery: failed polling recovers, fresh cache keeps polling and unmount cancels refresh.");
