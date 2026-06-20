import type { HotItem } from "@/lib/hot/types";

type AnyRecord = Record<string, unknown>;

export async function fetchXiaohongshuHotItems(
  limit: number,
  options: {
    apiUrl?: string;
    apiKey?: string;
  } = {}
): Promise<{ items: HotItem[]; message?: string }> {
  const configuredUrl = options.apiUrl?.trim() || process.env.XHS_HOT_API_URL?.trim();
  const configuredKey = options.apiKey?.trim() || process.env.XHS_HOT_API_KEY?.trim();

  if (configuredUrl) {
    try {
      return { items: await fetchConfiguredXhsSource(configuredUrl, configuredKey, limit) };
    } catch (error) {
      console.error("[hot-api] XHS configured source failed", {
        status: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    items: [],
    message: "暂未配置小红书实时热点源：请设置 XHS_HOT_API_URL 或在设置页填写小红书热点接口 URL。"
  };
}

async function fetchConfiguredXhsSource(url: string, apiKey: string | undefined, limit: number) {
  const target = new URL(url);
  if (!target.searchParams.has("limit")) target.searchParams.set("limit", String(limit));

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["X-API-Key"] = apiKey;
  }

  const response = await fetch(target, { cache: "no-store", headers });
  if (!response.ok) throw new Error(`小红书配置源返回 ${response.status}`);
  const payload = await response.json();
  return extractArray(payload).map((item, index) => normalizeXhsItem(item, index, "小红书配置源"));
}

function normalizeXhsItem(item: unknown, index: number, source: string) {
  const record = asRecord(item);
  const title = pickString(record, ["title", "name", "keyword", "word"]) || "未命名小红书热点";
  const summary = pickString(record, ["summary", "desc", "description", "content"]) || title;
  const url = pickString(record, ["url", "link", "href", "noteUrl"]);
  const heat = pickValue(record, ["heat", "hot", "score", "likes", "views"]);
  const publishedAt = pickString(record, ["publishedAt", "time", "createdAt", "updatedAt"]);
  return createItem({
    idSeed: `${source}:${url || title}`,
    title,
    summary,
    url,
    source,
    platform: "小红书",
    rank: numberValue(record.rank) ?? index + 1,
    heat,
    publishedAt,
    raw: item
  });
}

function createItem(input: {
  idSeed: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  platform: string;
  rank?: number;
  heat?: string | number;
  publishedAt?: string;
  raw: unknown;
}): HotItem {
  return {
    id: stableId(input.idSeed),
    title: input.title,
    summary: input.summary,
    url: input.url,
    source: input.source,
    platform: input.platform,
    rank: input.rank,
    heat: input.heat,
    hot: input.heat,
    publishedAt: input.publishedAt,
    time: input.publishedAt,
    relevance: 50,
    tags: ["小红书", "实时热点"],
    raw: input.raw
  };
}

function extractArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  if (Array.isArray(root.data)) return root.data;
  if (Array.isArray(root.result)) return root.result;
  if (Array.isArray(root.list)) return root.list;
  if (Array.isArray(root.items)) return root.items;
  const data = asRecord(root.data);
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.items)) return data.items;
  const result = asRecord(root.result);
  if (Array.isArray(result.list)) return result.list;
  if (Array.isArray(result.items)) return result.items;
  return [];
}

function dedupe(items: HotItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url || item.title.toLowerCase().replace(/\s+/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};
}

function pickString(record: AnyRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function pickValue(record: AnyRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") return value;
  }
  return undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stableId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `xhs-hot-${Math.abs(hash)}`;
}
