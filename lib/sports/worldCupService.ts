import {
  createPayload,
  getFallbackMatch,
  getFallbackMatches
} from "@/lib/sports/normalizers";
import type {
  SourceStatus,
  WorldCupMatch,
  WorldCupPayload
} from "@/lib/sports/types";
import {
  getFreeWorldCup2026Fixtures,
  getFreeWorldCup2026Live,
  getFreeWorldCup2026Match,
  getFreeWorldCup2026Standings,
  getFreeWorldCup2026Today
} from "@/lib/sports/worldCup2026FreeClient";
import { getBeijingDateKey } from "@/lib/time/beijingTime";

const FIXTURE_CACHE_TTL_MS = 10 * 60_000;
const ACTIVE_CACHE_TTL_MS = 60_000;
const ERROR_CACHE_TTL_MS = 30_000;

type CacheEntry<T> = {
  expiresAt: number;
  payload: WorldCupPayload<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

export async function getWorldCupFixtures() {
  return cached("free-2026-fixtures", FIXTURE_CACHE_TTL_MS, getFreeWorldCup2026Fixtures, fallbackList);
}

export async function getTodayWorldCupFixtures(date = getTodayDate()) {
  return cached(`free-2026-fixtures-today-${date}`, ACTIVE_CACHE_TTL_MS, () => getFreeWorldCup2026Today(date), fallbackList);
}

export async function getLiveWorldCupFixtures() {
  return cached("free-2026-fixtures-live", 20_000, getFreeWorldCup2026Live, () => createPayload("fallback", []));
}

export async function getWorldCupMatch(fixtureId: string) {
  if (fixtureId === "argentina-france-2022-final") {
    return createPayload("fallback", getFallbackMatch(fixtureId), "Historical mock sample.");
  }

  return cached(
    `free-2026-match-${fixtureId}`,
    ACTIVE_CACHE_TTL_MS,
    () => getFreeWorldCup2026Match(fixtureId),
    (message) => createPayload("fallback", getFallbackMatch(fixtureId), message)
  );
}

export async function getWorldCupStandings() {
  return cached("free-2026-standings", 120_000, getFreeWorldCup2026Standings, (message) => createPayload("fallback", [], message));
}

async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<WorldCupPayload<T>>,
  fallback: (message?: string) => WorldCupPayload<T>
): Promise<WorldCupPayload<T>> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();

  if (entry && entry.expiresAt > now) {
    return { ...entry.payload, sourceStatus: "cache" as SourceStatus };
  }

  try {
    const payload = await load();
    if (payload.sourceStatus === "live" || payload.sourceStatus === "fallback") {
      cache.set(key, { expiresAt: now + ttlMs, payload });
    }
    return payload;
  } catch (error) {
    if (entry) return { ...entry.payload, sourceStatus: "cache" };
    const message = error instanceof Error ? error.message : "Unknown free World Cup data source error.";
    const payload = {
      ...fallback(message),
      sourceStatus: "error" as SourceStatus,
      message
    };
    cache.set(key, { expiresAt: now + ERROR_CACHE_TTL_MS, payload });
    return payload;
  }
}

function fallbackList(message?: string): WorldCupPayload<WorldCupMatch[]> {
  return createPayload("fallback", getFallbackMatches(), message);
}

function getTodayDate() {
  return getBeijingDateKey();
}
