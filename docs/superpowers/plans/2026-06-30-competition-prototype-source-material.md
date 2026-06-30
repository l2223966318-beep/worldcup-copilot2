# WorldCup Copilot Competition Material Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成一套可直接用于赛事申报的产品原型图、中文说明、脱敏核心源代码和 Word/Markdown 材料。

**Architecture:** 主项目只作为真实界面和源代码来源，不修改业务逻辑。制作脚本、临时截图和最终交付物全部放在独立材料目录 `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix`；脚本读取主项目文件，输出六张原型图、五组代码附件和一份结构化 Word/Markdown 文档。

**Tech Stack:** Next.js 14、Node.js、`docx`、Python Pillow、浏览器截图工具。

---

### Task 1: 建立材料清单和安全检查

**Files:**
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\work\material-manifest.json`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\work\validate-materials.mjs`

- [ ] **Step 1: 写材料清单**

清单固定六张原型图和五组源代码：

```json
{
  "prototypePages": [
    "赛事内容机会池",
    "单场比赛数据与证据",
    "热点关联与推荐选题",
    "多平台内容生成",
    "证据约束风险审稿",
    "Word方案导出"
  ],
  "sourceModules": [
    "hot-value-scoring",
    "ai-topic-and-platform-generation",
    "match-evidence",
    "evidence-based-review",
    "word-export"
  ]
}
```

- [ ] **Step 2: 写失败校验**

`validate-materials.mjs` 检查以下项目：

```js
assert.equal(pngFiles.length, 6, "应生成 6 张原型图");
assert.equal(sourceFiles.length, 5, "应生成 5 组源代码附件");
assert.ok(files.includes("WorldCup-Copilot-产品原型与核心源代码.docx"));
assert.ok(files.includes("WorldCup-Copilot-产品原型与核心源代码.md"));
assert.equal(secretMatches.length, 0, "交付物中不得包含密钥");
```

- [ ] **Step 3: 运行校验并确认失败**

Run:

```powershell
node work\validate-materials.mjs
```

Expected: FAIL，提示缺少原型图、代码附件和文档。

### Task 2: 捕获并整理六张产品原型图

**Files:**
- Read: `C:\Users\dell\Documents\Codex\2026-06-08\worldcup-copilot\app\page.tsx`
- Read: `C:\Users\dell\Documents\Codex\2026-06-08\worldcup-copilot\app\matches\[id]\page.tsx`
- Read: `C:\Users\dell\Documents\Codex\2026-06-08\worldcup-copilot\app\report\page.tsx`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\work\prototype-captures\*.png`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\prototype-pages\01-赛事内容机会池.png`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\prototype-pages\02-单场比赛数据与证据.png`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\prototype-pages\03-热点关联与推荐选题.png`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\prototype-pages\04-多平台内容生成.png`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\prototype-pages\05-证据约束风险审稿.png`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\prototype-pages\06-Word方案导出.png`

- [ ] **Step 1: 启动当前项目**

Run:

```powershell
npm.cmd run dev -- -p 3023
```

Expected: `http://localhost:3023` 可访问。

- [ ] **Step 2: 捕获真实页面状态**

使用 1440×1000 桌面视口，分别捕获首页、比赛详情的数据区、热点与选题区、多平台生成区、审稿区和报告导出区。页面中不得出现红色报错、密钥、开发环境变量或浏览器控制台。

- [ ] **Step 3: 生成统一原型页**

每张 PNG 使用 1600×1000 画布：

```text
顶部 96px：编号、页面名称、一句功能说明
主体区域：真实产品截图，保持原比例
底部 72px：输入 → AI处理 → 输出
```

- [ ] **Step 4: 检查图片**

逐张确认文字可读、截图无裁断、没有敏感数据，图片尺寸均为 1600×1000。

### Task 3: 生成五组脱敏源代码附件

**Files:**
- Read: `C:\Users\dell\Documents\Codex\2026-06-08\worldcup-copilot\lib\hot\valueScoring.ts`
- Read: `C:\Users\dell\Documents\Codex\2026-06-08\worldcup-copilot\lib\ai\deepseek-workflow.ts`
- Read: `C:\Users\dell\Documents\Codex\2026-06-08\worldcup-copilot\lib\ai\platform-draft.ts`
- Read: `C:\Users\dell\Documents\Codex\2026-06-08\worldcup-copilot\lib\services\evidenceService.ts`
- Read: `C:\Users\dell\Documents\Codex\2026-06-08\worldcup-copilot\lib\ai\review-draft.ts`
- Read: `C:\Users\dell\Documents\Codex\2026-06-08\worldcup-copilot\lib\word-export.ts`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\work\extract-source.mjs`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\source-code\01-热点传播价值评分.txt`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\source-code\02-AI选题与平台生成.txt`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\source-code\03-赛事证据构建.txt`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\source-code\04-证据约束风险审稿.txt`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\source-code\05-Word报告导出.txt`

- [ ] **Step 1: 编写提取脚本**

脚本按明确的函数名提取代码，不复制环境配置：

```js
const forbidden = [
  /[A-Z0-9_]*(API_KEY|TOKEN|SECRET)\s*=\s*[^\s]+/gi,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /ak_[A-Za-z0-9_-]{16,}/g
];
```

- [ ] **Step 2: 写入模块说明**

每份附件按以下结构输出：

```text
模块名称
功能说明
输入
输出
核心代码
在产品流程中的作用
```

- [ ] **Step 3: 运行提取脚本**

Run:

```powershell
node work\extract-source.mjs
```

Expected: `outputs\source-code` 中生成 5 个 UTF-8 TXT 文件。

- [ ] **Step 4: 执行密钥扫描**

Run:

```powershell
rg -n "API_KEY=|TOKEN=|SECRET=|sk-|ak_" outputs
```

Expected: 无匹配。

### Task 4: 生成可直接粘贴的 Markdown

**Files:**
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\work\generate-materials.mjs`
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\WorldCup-Copilot-产品原型与核心源代码.md`

- [ ] **Step 1: 写项目介绍**

正文采用以下开头：

```text
WorldCup Copilot 是一套面向体育内容运营的赛事智能工作台。系统将比赛数据、关键事件和平台热点组织为可追溯证据，在证据约束下完成选题生成、多平台内容改写、发布风险审校和 Word 方案导出。
```

- [ ] **Step 2: 写六页原型说明**

每页包含“页面目标、主要输入、AI 处理、输出结果、对应截图”五项，不重复描述界面装饰。

- [ ] **Step 3: 写部分源代码说明**

为五组代码各写 80–150 字说明，并使用相对路径链接附件，不在正文堆放过长代码。

- [ ] **Step 4: 写创新点**

固定突出三点：

```text
1. 赛事证据约束下的选题生成
2. 面向不同平台的结构化内容生产
3. 事实、观点与创意表达分层的发布风险审校
```

### Task 5: 生成 Word 文档

**Files:**
- Create: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\WorldCup-Copilot-产品原型与核心源代码.docx`

- [ ] **Step 1: 配置 Word 样式**

使用 A4 页面、2.2cm 页边距、微软雅黑正文、标题分级和页码。代码使用等宽字体与浅灰底，图片按页面宽度缩放。

- [ ] **Step 2: 插入六张原型图**

每张原型图独立成节，图片前放页面名称，图片后放 80–120 字说明。

- [ ] **Step 3: 插入五组代码节选**

每组只放最能解释算法或流程的 40–90 行代码，完整附件通过相对文件名注明。

- [ ] **Step 4: 保存 Word**

Run:

```powershell
node work\generate-materials.mjs
```

Expected: Word 和 Markdown 均生成且文件大小大于 10KB。

### Task 6: 渲染、检查和交付

**Files:**
- Inspect: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\WorldCup-Copilot-产品原型与核心源代码.docx`
- Inspect: `C:\Users\dell\Documents\Codex\2026-06-18\worldcup-copilot-detail-fix\outputs\prototype-pages\*.png`

- [ ] **Step 1: 运行完整校验**

Run:

```powershell
node work\validate-materials.mjs
```

Expected: `PASS: 6 张原型图、5 组代码附件、Word 和 Markdown 均已生成，未发现密钥。`

- [ ] **Step 2: 渲染 Word**

将 Word 渲染为预览图，检查中文字体、分页、图片比例、代码换行和页眉页脚。

- [ ] **Step 3: 修复视觉问题并复检**

若出现图片被裁切、孤行标题或代码溢出，调整尺寸与分页后重新生成，再运行完整校验。

- [ ] **Step 4: 构建主项目**

Run:

```powershell
npm.cmd run build
```

Expected: Next.js 构建通过，证明材料制作没有破坏主项目。

- [ ] **Step 5: 提交材料计划**

Run:

```powershell
git add docs/superpowers/plans/2026-06-30-competition-prototype-source-material.md
git commit -m "Add competition material implementation plan"
git push origin HEAD
git push vercelrepo HEAD
```

