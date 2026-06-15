import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const sourcePath = new URL("../lib/time/beijingTime.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;

const outDir = join(tmpdir(), "worldcup-copilot-beijing-time-test");
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const modulePath = join(outDir, "beijingTime.mjs");
writeFileSync(modulePath, compiled, "utf8");

const {
  formatBeijingDateTime,
  getBeijingDateKey,
  getBeijingDateKeyFromValue,
  parseFixtureDate
} = await import(`file:///${modulePath.replaceAll("\\", "/")}`);

assert.equal(getBeijingDateKey(new Date("2026-06-14T16:30:00Z")), "2026-06-15");
assert.equal(getBeijingDateKeyFromValue("2026-06-14T16:30:00"), "2026-06-15");
assert.equal(getBeijingDateKeyFromValue("2026-06-14T16:30:00Z"), "2026-06-15");
assert.equal(getBeijingDateKeyFromValue("2026-06-15"), "2026-06-15");
assert.equal(parseFixtureDate("bad-value"), undefined);
assert.match(
  formatBeijingDateTime("2026-06-14T16:30:00", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }),
  /2026\/06\/15.*00:30/
);

console.log("beijing time ok");
