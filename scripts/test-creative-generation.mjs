import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
const sourcePath = new URL("lib/ai/creative.ts", root);
assert.ok(existsSync(sourcePath), "both chains need a shared editorial brief, not generic title examples");
const source = readFileSync(sourcePath, "utf8");
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: module.exports });
const { buildCreativeBrief, hasDistinctTopicAngles, isCompleteHotTopicDraft } = module.exports;
const factBrief = buildCreativeBrief({ chain: "match", platform: "B站", contentType: "选题", matchContext: {
  matchInfo: { score: "1-2", teamA: "英格兰", teamB: "阿根廷" }, verifiedStats: true,
  stats: { teamA: { shotsOnTarget: 3, shots: 6 }, teamB: { shotsOnTarget: 6, shots: 14 } }
} });
assert.match(factBrief, /英格兰射正3.*少于.*阿根廷射正6/);
assert.match(factBrief, /进球数\/射正次数.*相同/);
assert.doesNotMatch(buildCreativeBrief({ chain: "match", matchContext: { matchInfo: { score: "1-2", teamA: "甲", teamB: "乙" }, verifiedStats: false, stats: { teamA: { shots: 100 }, teamB: { shots: 200 } } } }), /甲射门100/);

for (const chain of ["match", "hot"]) {
  for (const platform of ["B站", "微博", "小红书", "抖音", "公众号"]) {
    const brief = buildCreativeBrief({ chain, platform, contentType: "选题", tone: "轻松整活", length: "短" });
    assert.match(brief, /开头钩子/);
    assert.match(brief, /换一个热点后仍能原封不动/);
    assert.match(brief, /角度标题、怎么做、说明/);
    assert.match(brief, /五个统计指标.*不算/);
    assert.match(brief, /80至120字/);
    assert.match(brief, /引号.*原句/);
    assert.match(brief, /不同/);
    assert.match(brief, /类比不是事实/);
    assert.match(brief, /字数.*不能.*截断/);
    assert.match(brief, /热度、排名、价值分.*不是/);
    assert.match(brief, new RegExp(platform));
  }
}
const objective = buildCreativeBrief({ chain: "match", platform: "微博", contentType: "短文案", tone: "客观资讯" });
assert.match(objective, /客观资讯.*不强加段子/);
assert.match(objective, /事实.*观点/);
const script = buildCreativeBrief({ chain: "hot", platform: "抖音", contentType: "视频脚本", tone: "人物故事" });
assert.match(script, /画面.*口播/);
assert.match(script, /心理活动/);
const titles = buildCreativeBrief({ chain: "hot", platform: "B站", contentType: "标题" });
assert.match(titles, /5个.*标题/);
assert.match(titles, /不是.*同义词/);

const angles = Array.from({ length: 5 }, (_, i) => ({ title: `角度${i}`, approach: `用不同镜头${i}推进`, reason: `依据${i}` }));
assert.equal(hasDistinctTopicAngles(angles), true);
assert.equal(hasDistinctTopicAngles([...angles.slice(0, 4), { ...angles[0], title: `【${angles[0].title}】！` }]), false);
assert.equal(hasDistinctTopicAngles(angles.map(item => ({ ...item, approach: "同一段换皮做法" }))), false);
assert.equal(hasDistinctTopicAngles(angles.slice(0, 4)), false);
const draft = angles.map((a, i) => `${i + 1}. ${a.title}\n怎么做：${a.approach}\n说明：${a.reason}`).join("\n\n");
assert.equal(isCompleteHotTopicDraft(draft), true);
assert.equal(isCompleteHotTopicDraft(draft.replace("5. 角度4", "5. 角度0")), false);
assert.equal(isCompleteHotTopicDraft(draft.replace("说明：依据4", "说明：")), false);

for (const path of ["lib/ai/platform-draft.ts", "lib/ai/deepseek-workflow.ts", "app/api/ai/hot-topic-workflow/route.ts", "cloudfunctions/api-proxy/index.js"]) {
  assert.match(readFileSync(new URL(path, root), "utf8"), /buildCreativeBrief\(/, `${path} must use the editorial brief`);
}
const cloud = require("../cloudfunctions/api-proxy/creative.js");
assert.equal(cloud.buildCreativeBrief({ chain: "hot", platform: "B站", contentType: "选题" }),
  buildCreativeBrief({ chain: "hot", platform: "B站", contentType: "选题" }), "deployed runtime and Next.js rules must agree");
assert.match(readFileSync(new URL("scripts/package-cloudbase.py", root), "utf8"), /creative\.js/);
console.log("creative generation: platform, tone, fact boundaries, complete distinct angles and shared runtime passed");
