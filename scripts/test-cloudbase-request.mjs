import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import vm from "node:vm";
const context = vm.createContext({
  require: name => name === "./sports-service" ? { createSportsService: () => ({}) } : name === "./hot-sources" ? { createSources: () => ({ health: () => [] }) } : { createServer: () => ({ listen() {} }) },
  process: { env: {} }, console, URL, AbortController, setTimeout, clearTimeout, Buffer,
});
vm.runInContext(readFileSync(new URL("../cloudfunctions/api-proxy/index.js", import.meta.url), "utf8"), context);
async function read(text, headers = {}) {
  context.input = Readable.from([Buffer.from(text)]);
  context.input.headers = headers;
  return vm.runInContext("readJsonBody(input)", context);
}
assert.equal((await read('{"title":"football"}')).title, "football");
await assert.rejects(() => read("{bad json"), error => error.statusCode === 400);
await assert.rejects(() => read("null"), error => error.statusCode === 400);
await assert.rejects(() => read("[]"), error => error.statusCode === 400);
await assert.rejects(() => read("x".repeat(262145)), error => error.statusCode === 413);
await assert.rejects(() => read("{}", { "content-length": "300000" }), error => error.statusCode === 413);
console.log("CloudBase request: malformed JSON, non-object input and oversized payloads rejected safely.");
