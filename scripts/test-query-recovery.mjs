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
  module, exports: module.exports, window, Date, console, AbortController, Error,
  require(name) {
    if (name === "@/lib/client-request") {
      const helper = { exports: {} };
      vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/client-request.ts", import.meta.url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
      }).outputText, { module: helper, exports: helper.exports, window, AbortController, Error, fetch: (...args) => transport(...args) });
      return helper.exports;
    }
    assert.equal(name, "react"); return {
    useState(initial) { state = initial(); return [state, value => { state = typeof value === "function" ? value(state) : value; }]; },
    useEffect(effect) { cleanup = effect(); }
  }; },
});
let transport = async () => { calls++; return { ok: calls > 2, status: calls > 2 ? 200 : 503,
  json: async () => calls > 2 ? cachedPayload : { sourceStatus: "error", message: "temporarily unavailable" } }; };
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
window.localStorage.getItem = () => null;
let activeSignal;
transport = (_url, init) => { calls++; activeSignal = init.signal; return new Promise(() => {}); };
module.exports.useWorldCupQuery("/hung");
const expire = () => {
  const entry = [...timers.entries()].find(([, timer]) => timer.delay === 15_000);
  assert.ok(entry, "query transport has a 15-second deadline");
  timers.delete(entry[0]); entry[1].fn();
};
expire();
await tick();
const retry = [...timers.entries()].find(([, timer]) => timer.delay === 350);
assert.ok(retry);
timers.delete(retry[0]); retry[1].fn();
await tick();
expire();
await tick();
assert.equal(state.loading, false, "hung requests eventually leave the loading state");
assert.match(state.error, /超时/);
cleanup();
module.exports.useWorldCupQuery("/leave");
cleanup();
await tick();
assert.equal(activeSignal.aborted, true, "unmount aborts the active transport");
assert.equal(timers.size, 0, "unmount never retries a cancelled request");
console.log("Query recovery: failed polling, post-hydration cache, deadlines and active request cancellation passed.");
