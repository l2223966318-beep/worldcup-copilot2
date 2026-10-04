import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import postcss from "postcss";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const componentPath = new URL("../components/worldcup/editorial-hero.tsx", import.meta.url);
const source = readFileSync(componentPath, "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;

function load(overrides = {}) {
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: name => name.endsWith(".module.css")
      ? { default: new Proxy({}, { get: (_, key) => String(key) }) }
      : overrides[name] ?? require(name),
    ...overrides.globals
  });
  return exports.EditorialWorldCupHero;
}

const html = renderToStaticMarkup(createElement(load()));
assert.match(html, /<h1[^>]*>.*WorldCup.*Copilot.*<\/h1>/);
assert.match(html, /href="#opportunity-pool"/);
assert.match(html, /href="#hot-moments"/);
assert.match(html, /fetchPriority="high"/);
assert.match(html, /worldcup-video-stadium-fill-v1\.webp/);
assert.doesNotMatch(html, /<video/, "default view must not download or autoplay the old video");
assert.doesNotMatch(html, /<dialog/, "background playback must stay on the homepage");

const state = [];
let hookIndex = 0;
let scrollOptions;
let prevented = false;
const target = { scrollIntoView: options => { scrollOptions = options; } };
const HarnessHero = load({
  react: { useState: initial => {
    const index = hookIndex++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
  } },
  globals: {
    document: { getElementById: id => id === "opportunity-pool" ? target : null },
    window: { matchMedia: () => ({ matches: true }) }
  }
});
function renderHarness() { hookIndex = 0; return HarnessHero(); }
function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  return [node.props?.children].flat(Infinity).map(child => find(child, predicate)).find(Boolean) ?? null;
}

let tree = renderHarness();
find(tree, node => node.props?.href === "#opportunity-pool").props.onClick({
  currentTarget: { hash: "#opportunity-pool" }, preventDefault: () => { prevented = true; }
});
assert.ok(prevented);
assert.equal(scrollOptions.behavior, "auto", "honor reduced-motion preference");
prevented = false;
find(tree, node => node.props?.href === "#hot-moments").props.onClick({
  currentTarget: { hash: "#hot-moments" }, preventDefault: () => { prevented = true; }
});
assert.equal(prevented, false, "missing anchor must retain native link behavior");

find(tree, node => node.props?.["aria-label"] === "播放背景视频").props.onClick();
tree = renderHarness();
const video = find(tree, node => node.type === "video");
assert.ok(video);
assert.equal(video.props.muted, true);
assert.equal(video.props.playsInline, true);
assert.equal(video.props.autoPlay, true);
assert.equal(video.props.loop, true);
assert.equal(video.props.poster, "/images/worldcup-video-stadium-fill-v1.webp");
assert.equal(find(tree, node => node.type === "dialog"), null);
assert.equal(tree.props.children.includes(video), true, "video belongs directly in the full-bleed hero");
assert.match(renderToStaticMarkup(video), /\/videos\/worldcup-hero\.mp4/);
find(tree, node => node.props?.["aria-label"] === "打开声音").props.onClick();
tree = renderHarness();
assert.equal(find(tree, node => node.type === "video").props.muted, false);
find(tree, node => node.props?.["aria-label"] === "静音").props.onClick();
tree = renderHarness();
assert.equal(find(tree, node => node.type === "video").props.muted, true);
find(tree, node => node.props?.["aria-label"] === "暂停背景视频").props.onClick();
assert.equal(find(renderHarness(), node => node.type === "video"), null);
assert.match(renderToStaticMarkup(renderHarness()), /worldcup-video-stadium-fill-v1\.webp/);
find(renderHarness(), node => node.props?.["aria-label"] === "播放背景视频").props.onClick();
find(renderHarness(), node => node.type === "video").props.onError();
assert.equal(find(renderHarness(), node => node.type === "video"), null, "failed playback returns to the image");
assert.ok(find(renderHarness(), node => node.props?.role === "status"));

for (const file of ["worldcup-video-stadium-fill-v1.webp"]) {
  const path = new URL(`../public/images/${file}`, import.meta.url);
  const bytes = readFileSync(path);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.ok(statSync(path).size < 650_000, "hero asset should stay lightweight");
}
const css = readFileSync(new URL("../components/worldcup/editorial-hero.module.css", import.meta.url), "utf8");
const videoStyles = {};
postcss.parse(css).walkRules(rule => {
  if (rule.parent.type !== "root" || !rule.selector.split(",").some(selector => selector.trim() === ".video")) return;
  rule.walkDecls(declaration => { videoStyles[declaration.prop] = declaration.value; });
});
for (const [width, height] of [[1916, 544], [1440, 580], [390, 520]]) {
  const scale = videoStyles["object-fit"] === "cover"
    ? Math.max(width / 3840, height / 2160)
    : videoStyles["object-fit"] === "contain" ? Math.min(width / 3840, height / 2160) : NaN;
  assert.ok(3840 * scale >= width - 0.01 && 2160 * scale >= height - 0.01,
    `video must cover the entire ${width}x${height} hero without exposed image strips`);
}
assert.equal(videoStyles.position, "absolute");
assert.equal(videoStyles.inset, "0");
assert.equal(videoStyles.width, "100%");
assert.equal(videoStyles.height, "100%");
const displayStyles = {};
postcss.parse(css).walkRules(rule => {
  if (rule.parent.type !== "root" || ![".title", ".statement"].includes(rule.selector)) return;
  rule.walkDecls(declaration => { (displayStyles[rule.selector] ??= {})[declaration.prop] = declaration.value; });
});
assert.ok(parseFloat(displayStyles[".title"]["font-size"]) >= 96, "brand heading should be visibly larger");
assert.ok(parseFloat(displayStyles[".statement"]["font-size"]) >= 40, "slogan should have a strong display hierarchy");
assert.doesNotMatch(css, /100(?:s|d)?vh|font-size:[^;]*vw|radial-gradient/);
assert.match(css, /letter-spacing:\s*0/);
assert.match(css, /max-width:\s*700px/);
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
assert.match(page, /<EditorialWorldCupHero\s*\/>/);
assert.match(page, /id="opportunity-pool"/);
assert.match(page, /id="hot-moments"/);
assert.doesNotMatch(page, /function ImmersiveWorldCupHero/);
console.log("Homepage hero: native rendering, anchors, reduced motion, video controls/fallback and optimized responsive assets passed.");
