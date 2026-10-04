import type { HotGenerationConfig } from "@/lib/hot/hotTopicWorkflow";

const STORAGE_KEY = "worldcup.hot-topic-drafts.v1";
type DraftStorage = Pick<Storage, "getItem" | "setItem">;

export interface SavedHotDraft {
  topicId: string;
  title: string;
  config: HotGenerationConfig;
  draft: string;
  savedAt: string;
}

function isSavedDraft(value: unknown): value is SavedHotDraft {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedHotDraft>;
  const config = item.config;
  return typeof item.topicId === "string" && typeof item.title === "string" &&
    typeof item.draft === "string" && Boolean(item.draft.trim()) && typeof item.savedAt === "string" &&
    Boolean(config && ["B站", "微博", "小红书", "抖音", "通用"].includes(config.platform) &&
      ["选题", "标题", "短文案", "视频脚本", "评论区互动", "图文卡片"].includes(config.contentType) &&
      ["客观资讯", "球迷讨论", "轻松整活", "专业复盘", "人物故事", "数据解读", "稳妥表达"].includes(config.tone) &&
      ["短", "中", "长"].includes(config.length) && typeof config.useMatchFacts === "boolean" &&
      typeof config.includeRiskReminder === "boolean");
}

function readList(storage: DraftStorage): SavedHotDraft[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter(isSavedDraft) : [];
  } catch {
    return [];
  }
}

export function readSavedHotDraft(topicId: string, storage?: DraftStorage): SavedHotDraft | undefined {
  try {
    return readList(storage ?? window.localStorage).find((item) => item.topicId === topicId);
  } catch {
    return undefined;
  }
}

export function saveHotDraft(item: SavedHotDraft, storage?: DraftStorage): boolean {
  try {
    if (!isSavedDraft(item)) return false;
    const target = storage ?? window.localStorage;
    target.setItem(STORAGE_KEY, JSON.stringify([item, ...readList(target)].slice(0, 20)));
    return true;
  } catch {
    return false;
  }
}
