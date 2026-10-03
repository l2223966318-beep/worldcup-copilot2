import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const root = new URL("../", import.meta.url);
function read(path) { return readFileSync(new URL(path, root), "utf8"); }

for (const path of ["app/page.tsx", "app/pitch/page.tsx", "app/history/page.tsx"]) {
  const source = read(path);
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === "href" && node.initializer && ts.isStringLiteral(node.initializer)) {
      assert.ok(!/^\/demo(?:[/?#]|$)/.test(node.initializer.text), `${path} must not link to the retired demo`);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}

const home = read("app/page.tsx");
const history = read("app/history/page.tsx");
assert.doesNotMatch(home, /\u5386\u53f2\u6848\u4f8b|\u7ecf\u5178\u6837\u4f8b|\u6837\u4f8b\u6f14\u793a/u, "empty states must not recommend the removed demo");
assert.doesNotMatch(history, /staticExamples|\u7ecf\u5178\u6837\u4f8b|\u67e5\u770b\u6837\u4f8b/u, "history must not fabricate demo records when empty");
assert.match(history, /readHistoryRecords/, "user-generated records must remain available");
assert.match(read("app/pitch/page.tsx"), /href="\/"[\s\S]*\u5f00\u59cb\u5b9e\u673a\u6f14\u793a/u, "the pitch must hand off to the real workbench");

const legacy = read("app/demo/page.tsx");
assert.match(legacy, /router\.replace\("\/"\)/, "old demo URLs must replace browser history with the workbench");
assert.match(legacy, /<noscript>[\s\S]*httpEquiv="refresh"[\s\S]*content="0;url=\/"[\s\S]*<\/noscript>/, "the retired URL must redirect without JavaScript too");
assert.doesNotMatch(legacy, /national-demo|demoSession|runAi|demoEvidence/, "the retired route must contain no historical demo functionality");
for (const path of ["app/demo/demo.css", "data/national-demo.ts", "lib/services/demoSession.ts", "scripts/test-demo-session.mjs"]) {
  assert.equal(existsSync(new URL(path, root)), false, `${path} must be removed`);
}
const pkg = JSON.parse(read("package.json"));
assert.equal(pkg.scripts["test:product-entrypoints"], "node scripts/test-product-entrypoints.mjs");
assert.equal(pkg.scripts["test:demo"], undefined, "the obsolete demo test command must be removed");
console.log("Product entrypoints: retired demo removed, legacy redirect and saved history contracts passed.");
