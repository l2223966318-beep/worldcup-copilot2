import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const file = new URL("../lib/client-request.ts", import.meta.url);
assert.ok(existsSync(file), "a bounded JSON request helper must exist");
let transport, calls = 0, serial = 0;
const timers = new Map();
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
} }).outputText, {
  module, exports: module.exports, AbortController, Error, Promise,
  window: {
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  },
  fetch: (...args) => { calls++; return transport(...args); }
});
const { requestJson } = module.exports;
transport = async () => ({ ok: true, json: async () => ({ draft: "ready" }) });
assert.equal((await requestJson("/ok")).payload.draft, "ready");
assert.equal(timers.size, 0, "success clears the deadline");

let signal;
transport = async (_url, init) => { signal = init.signal; return new Promise(() => {}); };
const stuck = requestJson("/stuck", {}, 40_000);
const timeout = assert.rejects(stuck, /超时/);
assert.equal([...timers.values()][0].delay, 40_000);
[...timers.values()][0].fn();
await timeout;
assert.equal(signal.aborted, true);
assert.equal(timers.size, 0);

transport = async (_url, init) => { signal = init.signal; return { ok: true, json: () => new Promise(() => {}) }; };
const stalledBody = requestJson("/body");
const bodyTimeout = assert.rejects(stalledBody, /超时/);
[...timers.values()][0].fn();
await bodyTimeout;
assert.equal(signal.aborted, true, "deadline covers body parsing, not only response headers");

const parent = new AbortController();
const pending = requestJson("/cancel", { signal: parent.signal });
const cancellation = assert.rejects(pending, error => error.name === "AbortError");
parent.abort();
await cancellation;
assert.equal(signal.aborted, true);
assert.equal(timers.size, 0);
const count = calls;
await assert.rejects(requestJson("/already-cancelled", { signal: parent.signal }), error => error.name === "AbortError");
assert.equal(calls, count, "pre-cancelled requests never reach transport");
transport = async () => { throw Error("offline"); };
await assert.rejects(requestJson("/offline"), /offline/);
assert.equal(timers.size, 0);
console.log("Client requests: success, network failure, stalled headers/body, cancellation and timer cleanup passed.");
