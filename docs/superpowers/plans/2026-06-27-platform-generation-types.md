# Platform Generation Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the match-detail generator treat “选题” as five concise work angles while clearly separating generation type from style type.

**Architecture:** Keep the existing page, endpoint, and `PlatformDraft` contract. Add a topic-specific structured AI result inside `platform-draft.ts`; topic requests become one concise “选题角度” section, while every other generation type keeps the existing three-layer publishable draft. The local fallback mirrors the same five-angle structure so API failures do not restore the old template.

**Tech Stack:** Next.js App Router, React, TypeScript, Node assertion scripts, DeepSeek JSON generation

---

### Task 1: Lock the option labels and five-angle fallback

**Files:**
- Modify: `scripts/test-workflow-services.mjs`
- Modify: `lib/services/contentService.ts`

- [ ] **Step 1: Write the failing service assertions**

Add assertions that require the new labels and exactly five fallback angles:

```js
assert.deepEqual(
  contentTypeOptions.map((item) => item.label),
  ["选题", "标题", "短文案", "视频脚本", "评论区互动", "图文卡片"]
);
assert.deepEqual(
  topicModeOptions.map((item) => item.label),
  ["专业复盘", "客观资讯", "球迷讨论", "轻松整活", "人物故事", "数据解读", "稳妥表达"]
);

const topicSection = bilibiliTopic.sections.find((section) => section.title === "选题角度");
assert.ok(topicSection);
assert.equal((topicSection.content.match(/^\d+\./gm) ?? []).length, 5);
assert.ok(topicSection.content.includes("怎么做："));
assert.ok(topicSection.content.includes("说明："));
assert.equal(bilibiliTopic.sections.length, 1);
```

- [ ] **Step 2: Run the workflow test and verify it fails**

Run:

```powershell
npm.cmd run test:workflow
```

Expected: FAIL because the old labels and three-layer topic result do not satisfy the assertions.

- [ ] **Step 3: Update labels and local topic generation**

In `contentService.ts`, keep the existing keys but change labels to:

```ts
export const contentTypeOptions = [
  { key: "topic", label: "选题" },
  { key: "title", label: "标题" },
  { key: "shortCopy", label: "短文案" },
  { key: "videoScript", label: "视频脚本" },
  { key: "commentPrompt", label: "评论区互动" },
  { key: "cardStructure", label: "图文卡片" }
] satisfies Array<{ key: ContentTypeKey; label: string }>;

export const topicModeOptions = [
  { key: "professional", label: "专业复盘" },
  { key: "objectiveNews", label: "客观资讯" },
  { key: "fanDiscussion", label: "球迷讨论" },
  { key: "playful", label: "轻松整活" },
  { key: "playerStory", label: "人物故事" },
  { key: "dataRead", label: "数据解读" },
  { key: "riskSafe", label: "稳妥表达" }
] satisfies Array<{ key: TopicModeKey; label: string }>;
```

Replace the topic fallback with one section containing five distinct methods:

```ts
function createTopicSections(
  platform: PlatformKey,
  match: MatchContext,
  topic: WorkflowTopic,
  analysis: AnalysisResult,
  topicMode: TopicModeKey
): DraftSection[] {
  const angles = buildFallbackTopicAngles(platform, match, topic, analysis, topicMode);
  return [{
    title: "选题角度",
    content: angles.map((angle, index) => [
      `${index + 1}. ${angle.title}`,
      `怎么做：${angle.approach}`,
      `说明：${angle.reason}`
    ].join("\n")).join("\n\n")
  }];
}
```

`buildFallbackTopicAngles` must return exactly five entries based on the selected hotspot and known match data. Its five methods are: selected-style lead angle, animation or game adaptation, event timeline, data comparison, and player/fan perspective. Each entry uses only `topic`, `match`, and `analysis`; no invented event is allowed.

- [ ] **Step 4: Run the workflow test and verify it passes**

Run:

```powershell
npm.cmd run test:workflow
```

Expected: `workflow services ok`.

### Task 2: Add topic-specific AI output and validation

**Files:**
- Create: `scripts/test-platform-draft-source.mjs`
- Modify: `lib/ai/platform-draft.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing source-contract test**

Create a source-level test that verifies the AI prompt and parser have a separate five-topic contract:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/ai/platform-draft.ts", import.meta.url), "utf8");

assert.match(source, /topics\?: AiTopicAngle\[\]/);
assert.match(source, /contentType === "topic"/);
assert.match(source, /topics\.length !== 5/);
assert.match(source, /title: "选题角度"/);
assert.match(source, /怎么做：/);
assert.match(source, /说明：/);
assert.match(source, /动漫二创/);
assert.match(source, /游戏二创/);

console.log("platform draft source contract ok");
```

Add:

```json
"test:platform-draft": "node scripts/test-platform-draft-source.mjs"
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
npm.cmd run test:platform-draft
```

Expected: FAIL because `AiTopicAngle` and the topic-specific parser are not implemented.

- [ ] **Step 3: Implement the topic-specific AI contract**

Add a structured topic angle type:

```ts
type AiTopicAngle = {
  title?: string;
  approach?: string;
  reason?: string;
};

type AiPlatformDraft = {
  title?: string;
  direct?: string;
  reference?: string;
  risk?: string;
  topics?: AiTopicAngle[];
};
```

When `contentType === "topic"`, send a dedicated task:

```ts
const generationTask = contentType === "topic"
  ? {
      task: "基于当前选中的热点，生成正好5个可以做成作品的选题角度。",
      rules: [
        "每项只写角度标题、怎么做、说明。",
        "角度必须是创作方法，不是完整标题、脚本或发布文案。",
        "五项要有明显差异，可从动漫二创、游戏二创、事件时间线、人物关系、数据拆解、球迷互动中选择。",
        "所有角度必须能对应当前热点和已知比赛事实，不得生搬示例。",
        "不要输出可直接发布版、编辑参考版或风险提示版。"
      ],
      outputShape: {
        topics: [{
          title: "12至24字的角度名称",
          approach: "一句话说明作品怎么做",
          reason: "一句话说明它与当前热点的关系"
        }]
      }
    }
  : existingDraftTask;
```

For topic results, require `topics.length === 5`, clean every field with `ensurePublishable`, and return:

```ts
const sections = [{
  title: "选题角度",
  content: topics.map((angle, index) => [
    `${index + 1}. ${angle.title}`,
    `怎么做：${angle.approach}`,
    `说明：${angle.reason}`
  ].join("\n")).join("\n\n")
}];
```

If the model does not return five complete items, return `sourceStatus: "error"` so the existing page keeps the tested local fallback.

- [ ] **Step 4: Run both focused tests**

Run:

```powershell
npm.cmd run test:platform-draft
npm.cmd run test:workflow
```

Expected: both tests pass.

### Task 3: Update match-detail control wording and blank-state behavior

**Files:**
- Create: `scripts/test-match-platform-controls.mjs`
- Modify: `app/matches/[id]/page.tsx`
- Modify: `package.json`

- [ ] **Step 1: Write the failing page-contract test**

Create:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/matches/[id]/page.tsx", import.meta.url), "utf8");

assert.match(source, />\s*生成类型\s*</);
assert.match(source, />\s*风格类型\s*</);
assert.match(source, /draftLoading \? "生成中\.\.\." : "生成"/);
assert.doesNotMatch(source, />\s*选题方向\s*</);
assert.match(source, /onContentTypeChange=\{\(type\) => \{[\s\S]*setManualDraft\(null\)/);
assert.match(source, /onTopicModeChange=\{\(mode\) => \{[\s\S]*setManualDraft\(null\)/);

console.log("match platform controls ok");
```

Add:

```json
"test:platform-controls": "node scripts/test-match-platform-controls.mjs"
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
npm.cmd run test:platform-controls
```

Expected: FAIL because the page still contains “内容类型”“选题方向” and a platform-specific first-generation button.

- [ ] **Step 3: Update the page controls**

Change labels:

```tsx
生成类型
```

and:

```tsx
风格类型
```

Use a single button label:

```tsx
{draftLoading ? "生成中..." : "生成"}
```

Keep the current reset handlers for hotspot, generation type, and style type. Each handler must clear both `manualDraft` and `draftForReview`, leaving the result area blank until the next click.

- [ ] **Step 4: Run focused tests and build**

Run:

```powershell
npm.cmd run test:platform-controls
npm.cmd run test:platform-draft
npm.cmd run test:workflow
npm.cmd run build
```

Expected: all tests pass and Next.js build completes successfully.

- [ ] **Step 5: Commit and push both repositories**

Run:

```powershell
git add -- app/matches/[id]/page.tsx lib/ai/platform-draft.ts lib/services/contentService.ts scripts/test-workflow-services.mjs scripts/test-platform-draft-source.mjs scripts/test-match-platform-controls.mjs package.json docs/superpowers/plans/2026-06-27-platform-generation-types.md
git commit -m "Improve platform generation types"
git push origin main
git push vercelrepo main
```

Expected: both remotes accept the same commit. `.next-dev-3022.log` and `product-design-audit/` remain untracked.

