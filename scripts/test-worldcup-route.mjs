import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/api/worldcup/matches/[fixtureId]/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const exports = {};

vm.runInNewContext(compiled, {
  exports,
  require(specifier) {
    if (specifier === "next/server") return require("next/server");
    if (specifier === "@/lib/sports/worldCupService") {
      return { getWorldCupMatch: async (fixtureId) => ({ fixtureId, sourceStatus: "mock" }) };
    }
    throw new Error(`Unexpected route dependency: ${specifier}`);
  }
}, { filename: "worldcup-match-route.js" });

for (const fixtureId of ["sr:sport_event:12345", "example-final"]) {
  const response = await exports.GET(new Request(`http://localhost/api/worldcup/matches/${fixtureId}`), {
    params: Promise.resolve({ fixtureId })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { fixtureId, sourceStatus: "mock" }, "Async params must preserve the selected fixture ID");
}

console.log("worldcup async route params ok");
