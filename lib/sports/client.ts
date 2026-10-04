"use client";

import { useEffect, useState } from "react";

import type { WorldCupPayload } from "@/lib/sports/types";

type QueryState<T> = {
  queryKey: string;
  payload?: WorldCupPayload<T>;
  loading: boolean;
  error?: string;
};

type QueryOptions = {
  enabled?: boolean;
  cacheKey?: string;
  staleMs?: number;
  maxStaleMs?: number;
  revalidateOnMount?: boolean;
};

export function useWorldCupQuery<T>(
  url: string,
  refreshMs?: number | ((payload: WorldCupPayload<T>) => number | undefined),
  options: QueryOptions = {}
) {
  const enabled = options.enabled ?? true;
  const cacheKey = options.cacheKey ?? `worldcup.query.${url}`;
  const staleMs = options.staleMs ?? 120_000;
  const maxStaleMs = options.maxStaleMs ?? Math.max(staleMs, 6 * 60 * 60_000);
  const revalidateOnMount = options.revalidateOnMount ?? true;
  const queryKey = JSON.stringify([url, cacheKey]);
  const [state, setState] = useState<QueryState<T>>(() => {
    if (!enabled) return { queryKey, loading: false };
    const cached = readCachedPayload<T>(cacheKey, maxStaleMs);
    return cached ? { queryKey, payload: cached, loading: false } : { queryKey, loading: true };
  });

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let failures = 0;

    if (!enabled) {
      setState({ queryKey, loading: false });
      return () => {
        active = false;
      };
    }

    const cached = readCachedPayload<T>(cacheKey, maxStaleMs);
    if (cached) {
      setState({ queryKey, payload: cached, loading: false });
    } else {
      setState((current) => current.queryKey === queryKey
        ? { ...current, loading: !current.payload }
        : { queryKey, loading: true });
    }

    async function load() {
      try {
        const payload = await fetchPayloadWithRetry<T>(url);
        if (!active) return;
        failures = 0;
        writeCachedPayload(cacheKey, payload);
        setState({ queryKey, payload, loading: false });
        const nextRefreshMs = typeof refreshMs === "function" ? refreshMs(payload) : refreshMs;
        if (active && nextRefreshMs && nextRefreshMs > 0) {
          timer = window.setTimeout(() => void load(), nextRefreshMs);
        }
      } catch (error) {
        if (!active) return;
        setState((current) => ({
          ...(current.queryKey === queryKey ? current : { queryKey }),
          loading: false,
          error: error instanceof Error ? error.message : "\u8bf7\u6c42\u5931\u8d25"
        }));
        failures += 1;
        if (refreshMs && failures <= 3) {
          timer = window.setTimeout(() => void load(), Math.min(60_000, 2_000 * 2 ** (failures - 1)));
        }
      }
    }

    if (!cached || revalidateOnMount || !isFreshCache(cacheKey, staleMs)) {
      void load();
    } else {
      const nextRefreshMs = typeof refreshMs === "function" ? refreshMs(cached) : refreshMs;
      if (nextRefreshMs && nextRefreshMs > 0) {
        timer = window.setTimeout(() => void load(), nextRefreshMs);
      }
    }

    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [cacheKey, enabled, maxStaleMs, queryKey, refreshMs, revalidateOnMount, staleMs, url]);

  if (!enabled) return { queryKey, loading: false };
  if (state.queryKey === queryKey) return state;
  const cached = readCachedPayload<T>(cacheKey, maxStaleMs);
  return { queryKey, payload: cached, loading: !cached };
}

function readCachedPayload<T>(cacheKey: string, staleMs: number): WorldCupPayload<T> | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { savedAt?: number; payload?: WorldCupPayload<T> };
    if (!parsed.payload || !parsed.savedAt) return undefined;
    if (Date.now() - parsed.savedAt > staleMs) return undefined;
    return { ...parsed.payload, sourceStatus: "cache" };
  } catch {
    return undefined;
  }
}

function writeCachedPayload<T>(cacheKey: string, payload: WorldCupPayload<T>) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), payload }));
  } catch {
    // Storage may be disabled or full; live data has already been rendered.
  }
}

async function fetchPayloadWithRetry<T>(url: string): Promise<WorldCupPayload<T>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const payload = (await response.json()) as WorldCupPayload<T>;
      if (!response.ok || payload.sourceStatus === "error") {
        throw new Error(payload.message || `Request failed: ${response.status}`);
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("请求失败");
}

function isFreshCache(cacheKey: string, staleMs: number) {
  if (typeof window === "undefined") return false;

  try {
    const raw = window.localStorage.getItem(cacheKey);
    const parsed = raw ? (JSON.parse(raw) as { savedAt?: number }) : null;
    return Boolean(parsed?.savedAt && Date.now() - parsed.savedAt < staleMs);
  } catch {
    return false;
  }
}
