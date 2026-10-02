import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const [page, styles] = await Promise.all([
  readFile(new URL("../app/pitch/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/pitch/pitch.css", import.meta.url), "utf8")
]);

// Exercise the actual component handlers without a browser or live providers.
const source = ts.createSourceFile("pitch.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = new Map();
let keyboardDependencies;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) handlers.set(node.name.text, node.getText(source));
  if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" &&
      node.arguments[0]?.getText(source).includes("function onKeyDown")) keyboardDependencies = node.arguments[1]?.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
function createHandler(name, bindings) {
  assert.ok(handlers.has(name), `missing pitch handler: ${name}`);
  const code = ts.transpileModule(handlers.get(name), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${code}\nreturn ${name};`)(...Object.values(bindings));
}
function runKey(key, options = {}) {
  let active = 1;
  let prevented = false;
  const handler = createHandler("onKeyDown", { chapters: ["cover", "context", "demo"],
    materialExpanded: options.modalOpen ?? false, setActive: update => { active = update(active); } });
  handler({ key, target: null, defaultPrevented: false, isComposing: false, altKey: false, ctrlKey: false,
    metaKey: false, ...options, preventDefault: () => { prevented = true; } });
  return { active, prevented };
}
for (const key of ["ArrowDown", "ArrowRight", "PageDown", " ", "Home", "End", "3"]) {
  assert.deepEqual(runKey(key, { modalOpen: true }), { active: 1, prevented: false },
    "material dialog must block background keyboard navigation");
}
assert.deepEqual(runKey("ArrowDown"), { active: 2, prevented: true });
assert.deepEqual(runKey("ArrowUp"), { active: 0, prevented: true });
const buttonTarget = { closest: selector => selector.includes("button") ? {} : null };
assert.deepEqual(runKey(" ", { target: buttonTarget }), { active: 1, prevented: false },
  "native button activation must not become a chapter shortcut");
assert.deepEqual(runKey("ArrowDown", { target: buttonTarget }), { active: 2, prevented: true },
  "clicking a toolbar button must not disable ordinary chapter navigation");
assert.deepEqual(runKey("ArrowDown", { target: { closest: selector => selector.includes("input") ? {} : null } }),
  { active: 1, prevented: false }, "text inputs must retain their keyboard behavior");
for (const field of ["defaultPrevented", "isComposing", "altKey", "ctrlKey", "metaKey"]) {
  assert.deepEqual(runKey("ArrowDown", { [field]: true }), { active: 1, prevented: false },
    `${field} input must not be intercepted`);
}
assert.match(keyboardDependencies, /materialExpanded/, "keyboard listener must observe the current dialog state");
function runWheel(modalOpen, options = {}) {
  let active = 1;
  const lastWheelAt = { current: 0 };
  createHandler("handleWheel", { materialExpanded: modalOpen, lastWheelAt,
    window: { matchMedia: () => ({ matches: true }) }, chapters: ["cover", "context", "demo"],
    setActive: update => { active = update(active); } })({ deltaY: 100, defaultPrevented: false, ...options });
  return { active, wheelConsumed: lastWheelAt.current !== 0 };
}
assert.deepEqual(runWheel(true), { active: 1, wheelConsumed: false }, "material dialog must block background wheel navigation");
assert.deepEqual(runWheel(false), { active: 2, wheelConsumed: true });
assert.deepEqual(runWheel(false, { defaultPrevented: true }), { active: 1, wheelConsumed: false });
const cover = { progress: 0, paused: false, revealed: false };
createHandler("finishCoverVideo", { setCoverProgress: value => { cover.progress = value; },
  setCoverPaused: value => { cover.paused = value; }, setCoverRevealed: value => { cover.revealed = value; } })();
assert.deepEqual(cover, { progress: 1, paused: true, revealed: true }, "video fallback must reveal the cover without retrying playback");

assert.equal((page.match(/<section className=/g) ?? []).length, 3, "pitch page must contain three focused chapters");
assert.match(page, /国赛答辩/, "pitch page must identify the current competition stage");
assert.doesNotMatch(page, /四川赛区决赛/, "pitch page must not retain the regional-stage label");
assert.match(page, /ArrowDown.*ArrowRight.*PageDown/s, "pitch page must support forward keyboard navigation");
assert.match(page, /ArrowUp.*ArrowLeft.*PageUp/s, "pitch page must support backward keyboard navigation");
assert.match(page, /document\.documentElement\.requestFullscreen\(\)/, "pitch page must provide a real fullscreen action");
assert.match(page, /href="\/demo"[\s\S]*开始实机演示/, "final chapter must link directly to the saved demonstration case");
assert.match(page, /src="\/videos\/worldcup-hero\.mp4"/, "pitch cover must reuse the product background video");
assert.match(page, /onEnded=\{finishCoverVideo\}/, "pitch cover must reveal its title after the video ends");
assert.equal((page.match(/onError=\{finishCoverVideo\}/g) ?? []).length, 2,
  "both the video and its source must reveal the cover when loading fails");
assert.doesNotMatch(page, /<video[\s\S]*?\sloop[\s\S]*?>/, "pitch cover video must not loop automatically");
assert.match(page, /把每一场比赛[\s\S]*变成[\s\S]*高光[\s\S]*时刻/, "pitch cover must use the product statement as its largest title");

for (const image of ["background-hot-daily", "background-bilibili-cases", "background-volume-trend", "background-content-mix"]) {
  assert.match(page, new RegExp(`/pitch/${image}\\.png`), `project background must include ${image}`);
}

assert.match(page, /className="pitch-material-viewer"/, "project background must present sources in a visible material viewer");
assert.match(page, /放大查看/, "background materials must support focused viewing");
assert.match(page, /内容机会很多[\s\S]*判断时间很少/, "project background must use the approved opportunity-window statement");
assert.match(page, /className="pitch-context-flow"/, "project background must present the three problems as a clear flow");
assert.doesNotMatch(page, /pitch-context-media|pitch-context-shade/, "project materials must not be dimmed decorative backgrounds");
assert.doesNotMatch(page, /match-center|match-detail|topic-engine|signals\.png|review\.png|report\.png|stadium\.png|trophy\.png/, "retired presentation imagery must not remain referenced");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/, "pitch page must respect reduced-motion preferences");
assert.match(styles, /height: 300dvh/, "pitch page track must match the three-chapter structure");
assert.match(styles, /--pitch-green: #0b8f4d/, "pitch page must retain the football-green visual system");

console.log("Pitch presentation page contract passed.");
