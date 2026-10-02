import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
const root = resolve("out");
let references = 0;
for (const page of ["index.html", "pitch/index.html", "demo/index.html", "matches/index.html", "hot-topics/index.html", "settings/index.html", "data-notes/index.html"]) {
  const html = readFileSync(resolve(root, page), "utf8");
  assert.ok(html.includes("WorldCup Copilot"), page);
  for (const [, path] of html.matchAll(/(?:src|href)="(\/[^"?#]+\.(?:js|css|png|mp4))(?:[?#][^"]*)?"/g)) {
    const file = resolve(root, `.${path}`);
    assert.ok(!relative(root, file).startsWith(".."), path);
    assert.ok(existsSync(file), `${page}: missing ${path}`);
    references++;
  }
}
assert.ok(readFileSync(resolve(root, "pitch/index.html"), "utf8").includes("国赛答辩"));
assert.ok(!readFileSync(resolve(root, "settings/index.html"), "utf8").includes("AI 访问口令"));
assert.ok(readFileSync(resolve(root, "data-notes/index.html"), "utf8").includes("Sportradar"));
for (const file of readdirSync(root, { recursive: true })) {
  assert.ok(!/(?:^|[\\/])(?:\.env[^\\/]*|node_modules)(?:[\\/]|$)|\.zip\.enc$/.test(file), file);
}
console.log(JSON.stringify({ pages: 7, localResourceReferences: references, sourceNotes: true, sharedAiTokenInput: false, browserInteractionsTested: false }));
