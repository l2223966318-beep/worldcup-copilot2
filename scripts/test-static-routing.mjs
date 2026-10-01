import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const match = read("app/matches/page.tsx");
const hot = read("app/hot-topics/page.tsx");
assert.doesNotMatch(match + hot, /useParams|useSearchParams/, "Static detail pages must use the existing query-string routes");
assert.match(match, /enabled:\s*routeReady/);
assert.match(match, /if \(!routeReady\) return;/, "No auto AI call before reading the requested match ID");
assert.match(hot, /new URLSearchParams\(window.location.search\)/);
for (const path of ["app/page.tsx", "app/history/page.tsx", "app/matches/page.tsx"]) {
  assert.doesNotMatch(read(path), /(?:href|route):?=?[\s{]*[`"]\/matches\/(?!\?)/, path);
}
assert.match(read("app/settings/page.tsx"), /saveAiAccessToken/);
assert.match(match + hot, /getAiRequestHeaders/);
console.log("Static routes preserve query IDs, defer data/AI until ready, and expose shared-AI access settings.");
