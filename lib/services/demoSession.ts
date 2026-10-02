import { DEMO_CASE_ID, demoAnalysis, demoDrafts, demoEvidence, demoPlatforms, demoTopics } from "@/data/national-demo";
import type { ReviewResultSnapshot } from "@/types/workflow";

export const DEMO_STORAGE_KEY = "worldcup.national-demo.v1";
export const DEMO_MAX_JSON_LENGTH = 1_000_000;
// A UTF-16 code unit can occupy up to three bytes in a UTF-8 JSON file.
export const DEMO_MAX_FILE_BYTES = DEMO_MAX_JSON_LENGTH * 3;
export type DemoOrigin = "example" | "ai" | "edited";
export type DemoReview = { draft: string; result: ReviewResultSnapshot; origin: DemoOrigin; updatedAt: string };
export type DemoEntry = { body: string; origin: DemoOrigin; updatedAt: string; review: DemoReview | null };
export type DemoSession = {
  version: 1;
  caseId: typeof DEMO_CASE_ID;
  savedAt: string;
  analysis: { text: string; origin: DemoOrigin; updatedAt: string };
  entries: Record<string, DemoEntry>;
};

export function demoEntryKey(topic: string, platform: string) {
  return `${topic}:${platform}`;
}

export function createDemoSession(): DemoSession {
  const entries: Record<string, DemoEntry> = {};
  for (const topic of demoTopics) {
    for (const platform of demoPlatforms) {
      const body = demoDrafts[topic.id][platform.id];
      entries[demoEntryKey(topic.id, platform.id)] = {
        body, origin: "example", updatedAt: "",
        review: {
          draft: body, origin: "example", updatedAt: "",
          result: {
            level: "待人工复核", score: 0,
            advice: "预置审核示例：保留历史回放标识，发布前复核原文与素材授权。",
            findings: [{ type: "发布前核验", sentence: topic.title, reason: "历史资料不代表当前动态，生成内容不等于完成事实核查。", rewrite: "保留比赛年份和来源；核对比分口径、人物发言及素材授权。" }],
            evidence: demoEvidence
          }
        }
      };
    }
  }
  return {
    version: 1, caseId: DEMO_CASE_ID, savedAt: "",
    analysis: { text: `${demoAnalysis.summary}\n\n${demoAnalysis.winLossReason}`, origin: "example", updatedAt: "" },
    entries
  };
}

export function updateDemoEntry(session: DemoSession, key: string, body: string, origin: DemoOrigin, now = new Date().toISOString()): DemoSession {
  if (!session.entries[key]) return session;
  return { ...session, savedAt: now, entries: { ...session.entries, [key]: { body, origin, updatedAt: now, review: null } } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100_000;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && (value === "" || Number.isFinite(Date.parse(value)));
}

function isOrigin(value: unknown): value is DemoOrigin {
  return value === "example" || value === "ai" || value === "edited";
}

export function parseDemoReview(value: unknown): ReviewResultSnapshot | null {
  if (!isObject(value) || !isText(value.level) || typeof value.score !== "number" || !Number.isFinite(value.score) || value.score < 0 || value.score > 100 || !isText(value.advice) || !Array.isArray(value.findings) || value.findings.length > 50) return null;
  const findings: ReviewResultSnapshot["findings"] = [];
  for (const item of value.findings) {
    if (!isObject(item) || !isText(item.type) || !isText(item.sentence) || !isText(item.rewrite)) return null;
    findings.push({ type: item.type, sentence: item.sentence, rewrite: item.rewrite, ...(isText(item.reason) ? { reason: item.reason } : {}) });
  }
  return { level: value.level, score: value.score, advice: value.advice, findings, evidence: demoEvidence };
}

// Reconstruct known fields so a portable case never imports credentials or unrelated state.
export function parseDemoSession(raw: string): DemoSession | null {
  if (raw.length > DEMO_MAX_JSON_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isObject(value) || value.version !== 1 || value.caseId !== DEMO_CASE_ID || !isDate(value.savedAt) || !isObject(value.analysis) || !isObject(value.entries)) return null;
    const analysis = value.analysis;
    if (!isText(analysis.text) || !isOrigin(analysis.origin) || !isDate(analysis.updatedAt)) return null;
    const entries: Record<string, DemoEntry> = {};
    for (const key of Object.keys(createDemoSession().entries)) {
      const entry = value.entries[key];
      if (!isObject(entry) || !isText(entry.body) || !isOrigin(entry.origin) || !isDate(entry.updatedAt)) return null;
      let review: DemoReview | null = null;
      if (entry.review !== null) {
        const saved = entry.review;
        if (!isObject(saved) || !isText(saved.draft) || !isOrigin(saved.origin) || !isDate(saved.updatedAt)) return null;
        const result = parseDemoReview(saved.result);
        if (!result) return null;
        if (saved.draft === entry.body) review = { draft: saved.draft, result, origin: saved.origin, updatedAt: saved.updatedAt };
      }
      entries[key] = { body: entry.body, origin: entry.origin, updatedAt: entry.updatedAt, review };
    }
    return { version: 1, caseId: DEMO_CASE_ID, savedAt: value.savedAt, analysis: { text: analysis.text, origin: analysis.origin, updatedAt: analysis.updatedAt }, entries };
  } catch {
    return null;
  }
}

export function serializeDemoSession(session: DemoSession): string {
  const raw = JSON.stringify(session, null, 2);
  if (!parseDemoSession(raw)) throw new Error("案例包内容过多或格式不完整，请先导出 Word 保存当前文案。");
  return raw;
}
