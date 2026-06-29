import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

assert.match(css, /\.card-lift\s*\{[\s\S]*240ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
assert.match(css, /transition:\s*transform 240ms[\s\S]*box-shadow 240ms[\s\S]*border-color 240ms[\s\S]*background-color 240ms/);
assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
assert.match(css, /\.card-lift:hover\s*\{[\s\S]*transform:\s*translateY\(-2px\);/);
const cardHoverRule = css.match(/\.card-lift:hover\s*\{([^}]*)\}/)?.[1] ?? "";
assert.doesNotMatch(cardHoverRule, /scale\(/);
assert.match(css, /\.card-lift-light\s*\{[\s\S]*rgba\(34, 197, 94, 0\.28\)/);
assert.match(css, /\.card-lift-gold\s*\{[\s\S]*rgba\(245, 158, 11, 0\.3\)/);

const lightCardFiles = [
  "../app/page.tsx",
  "../components/worldcup/hot-topic-radar-panel.tsx",
  "../components/worldcup/insight-charts.tsx",
  "../app/matches/[id]/page.tsx",
  "../app/hot-topics/[id]/page.tsx",
  "../app/settings/page.tsx"
];

for (const file of lightCardFiles) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.match(source, /card-lift-light/, `${file} should attach the light card hover utility`);
}

const darkCardFiles = [
  "../components/ui/card.tsx",
  "../components/generate/generator-panel.tsx",
  "../app/topic-engine/page.tsx",
  "../app/risk-review/page.tsx"
];

for (const file of darkCardFiles) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.match(source, /card-lift/, `${file} should attach the dark card hover utility`);
}

console.log("card hover contract ok");
