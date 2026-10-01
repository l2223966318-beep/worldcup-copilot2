import type { MatchData } from "@/data/matches";
import type { TopicIdea } from "@/lib/ai/topics";

export const MATCH_AI_WORKFLOW_CACHE_TTL_MS = 7 * 24 * 60 * 60_000;
export const MATCH_AI_LIVE_CACHE_TTL_MS = 60_000;

const MATCH_AI_WORKFLOW_CACHE_VERSION = "match-analysis-v2-fact-integrity";
const MATCH_AI_WORKFLOW_CACHE_PREFIX = "worldcup.match-ai-workflow";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type CacheableAiPayload = { sourceStatus: string };

type MatchAiCacheEntry<T> = {
  version: string;
  fingerprint: string;
  savedAt: number;
  payload: T;
};

export function readMatchAiWorkflowCache<T extends CacheableAiPayload>(
  storage: StorageLike,
  match: MatchData,
  topics: TopicIdea[],
  now = Date.now()
): T | null {
  const key = buildMatchAiCacheKey(match.id);

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const entry = JSON.parse(raw) as MatchAiCacheEntry<T>;
    const isValid =
      entry.version === MATCH_AI_WORKFLOW_CACHE_VERSION &&
      entry.fingerprint === buildMatchFingerprint(match, topics) &&
      entry.payload?.sourceStatus === "live" &&
      Number.isFinite(entry.savedAt) && entry.savedAt <= now &&
      now - entry.savedAt <= (match.status === "live" ? MATCH_AI_LIVE_CACHE_TTL_MS : MATCH_AI_WORKFLOW_CACHE_TTL_MS);

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

export function writeMatchAiWorkflowCache<T extends CacheableAiPayload>(
  storage: StorageLike,
  match: MatchData,
  topics: TopicIdea[],
  payload: T,
  now = Date.now()
) {
  if (payload.sourceStatus !== "live") return;

  const entry: MatchAiCacheEntry<T> = {
    version: MATCH_AI_WORKFLOW_CACHE_VERSION,
    fingerprint: buildMatchFingerprint(match, topics),
    savedAt: now,
    payload
  };

  try {
    storage.setItem(buildMatchAiCacheKey(match.id), JSON.stringify(entry));
  } catch {
    // Storage may be unavailable in privacy mode; AI analysis can still run normally.
  }
}

function buildMatchAiCacheKey(matchId: string) {
  return `${MATCH_AI_WORKFLOW_CACHE_PREFIX}.${encodeURIComponent(matchId)}`;
}

function buildMatchFingerprint(match: MatchData, topics: TopicIdea[]) {
  return JSON.stringify({
    version: MATCH_AI_WORKFLOW_CACHE_VERSION,
    match,
    topics
  });
}
