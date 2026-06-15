import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const timeSourcePath = new URL("../lib/time/beijingTime.ts", import.meta.url);
const statusSourcePath = new URL("../lib/sports/staticFixtureStatus.ts", import.meta.url);
const timeSource = readFileSync(timeSourcePath, "utf8");
const statusSource = readFileSync(statusSourcePath, "utf8").replace(
  'from "@/lib/time/beijingTime"',
  'from "./beijingTime.mjs"'
);
const timeCompiled = ts.transpileModule(timeSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const statusCompiled = ts.transpileModule(statusSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;

const outDir = join(tmpdir(), "worldcup-copilot-static-status-test");
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const modulePath = join(outDir, "staticFixtureStatus.mjs");
writeFileSync(join(outDir, "beijingTime.mjs"), timeCompiled, "utf8");
writeFileSync(modulePath, statusCompiled, "utf8");

const { inferStaticFixtureStatus } = await import(`file:///${modulePath.replaceAll("\\", "/")}`);

const now = new Date("2026-06-15T04:00:00Z");

assert.equal(inferStaticFixtureStatus("2026-06-14T20:00:00Z", now), "finished");
assert.equal(inferStaticFixtureStatus("2026-06-14T20:00:00", now), "finished");
assert.equal(inferStaticFixtureStatus("2026-06-15T03:00:00Z", now), "live");
assert.equal(inferStaticFixtureStatus("2026-06-16T03:00:00Z", now), "scheduled");
assert.equal(inferStaticFixtureStatus("", now), "scheduled");

console.log("static fixture status ok");
