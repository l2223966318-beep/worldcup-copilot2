import type { HotTopic } from "@/lib/hot/types";

export const HOT_TOPIC_AI_CACHE_TTL_MS = 7 * 24 * 60 * 60_000;

const HOT_TOPIC_AI_CACHE_VERSION = "hot-topic-analysis-v2";
const HOT_TOPIC_AI_CACHE_PREFIX = "worldcup.hot-topic-ai-analysis";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type CacheableAiPayload = { sourceStatus: string };

type HotTopicAiCacheEntry<T> = {
  version: string;
  fingerprint: string;
  savedAt: number;
  payload: T;
};

export function readHotTopicAiCache<T extends CacheableAiPayload>(
  storage: StorageLike,
  topic: HotTopic,
  now = Date.now()
): T | null {
  const key = buildCacheKey(topic.id);

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const entry = JSON.parse(raw) as HotTopicAiCacheEntry<T>;
    const isValid =
      entry.version === HOT_TOPIC_AI_CACHE_VERSION &&
      entry.fingerprint === buildHotTopicAiFingerprint(topic) &&
      entry.payload?.sourceStatus === "live" &&
      Number.isFinite(entry.savedAt) && entry.savedAt <= now &&
      now - entry.savedAt <= HOT_TOPIC_AI_CACHE_TTL_MS;

    if (!isValid) {
      storage.removeItem(key);
      return null;
    }

    return entry.payload;
  } catch {
    try { storage.removeItem(key); } catch { /* Storage can be disabled. */ }
    return null;
  }
}

export function writeHotTopicAiCache<T extends CacheableAiPayload>(
  storage: StorageLike,
  topic: HotTopic,
  payload: T,
  now = Date.now()
) {
  if (payload.sourceStatus !== "live") return;

  const entry: HotTopicAiCacheEntry<T> = {
    version: HOT_TOPIC_AI_CACHE_VERSION,
    fingerprint: buildHotTopicAiFingerprint(topic),
    savedAt: now,
    payload
  };

  try {
    storage.setItem(buildCacheKey(topic.id), JSON.stringify(entry));
  } catch {
    // Browser storage can be unavailable; analysis still works without caching.
  }
}

function buildCacheKey(topicId: string) {
  return `${HOT_TOPIC_AI_CACHE_PREFIX}.${encodeURIComponent(topicId)}`;
}

export function buildHotTopicAiFingerprint(topic: HotTopic) {
  return JSON.stringify({
    version: HOT_TOPIC_AI_CACHE_VERSION,
    id: topic.id,
    title: topic.title,
    summary: topic.summary,
    platform: topic.platform,
    source: topic.source,
    category: topic.category,
    valueLevel: topic.valueLevel,
    tags: [...(topic.tags ?? [])].sort(),
    url: topic.url,
    contentAngles: [...(topic.contentAngles ?? [])].sort(),
    relatedMatches: [...(topic.relatedMatches ?? [])].sort()
  });
}
