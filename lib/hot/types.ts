export type HotSourceStatus = "live" | "fallback" | "partial" | "cache" | "error";

export type HotItem = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  platform: string;
  rank?: number;
  heat?: string;
  publishedAt?: string;
  relevance: number;
  tags: string[];
};

export type HotSearchPayload = {
  sourceStatus: HotSourceStatus;
  data: HotItem[];
  lastUpdated: string;
  message?: string;
};

export type HotSearchContext = {
  query: string;
  source?: string;
  platform?: string;
};
