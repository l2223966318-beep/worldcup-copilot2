import { NextResponse } from "next/server";

import { searchHotSignals } from "@/lib/hot/hotSearchService";
import type { HotItem, HotSearchPayload } from "@/lib/hot/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "世界杯 足球 今日热点";
  let payload: HotSearchPayload;

  try {
    payload = await searchHotSignals(query, {
      tavilyApiKey: readClientApiKey(request, "x-worldcup-tavily-key"),
      topHubDataApiKey: readClientApiKey(request, "x-worldcup-tophubdata-key"),
      dailyHotBaseUrl: readClientApiKey(request, "x-worldcup-dailyhot-base")
    });
  } catch (error) {
    payload = createRouteFallbackPayload(query, error);
  }

  return NextResponse.json(payload);
}

function readClientApiKey(request: Request, header: string) {
  const value = request.headers.get(header)?.trim();
  return value || undefined;
}

function createRouteFallbackPayload(query: string, error: unknown): HotSearchPayload {
  return {
    sourceStatus: "fallback",
    data: createRouteFallbackItems(query),
    lastUpdated: new Date().toISOString(),
    message: `热点接口暂时不可用，已切换演示数据。${error instanceof Error ? error.message : ""}`
  };
}

function createRouteFallbackItems(query: string): HotItem[] {
  const normalizedQuery = query.trim() || "世界杯 足球 今日热点";
  return [
    {
      id: "hot-route-fallback-1",
      title: `${normalizedQuery} 相关热点待接入`,
      summary: "热点源请求暂时不可用，系统先用演示数据维持选题链路。请稍后重试，或检查全网搜索 / 今日热榜密钥。",
      url: "",
      source: "AI筛选",
      platform: "系统提示",
      relevance: 40,
      tags: ["热点源", "演示数据"]
    },
    {
      id: "hot-route-fallback-2",
      title: "可纳入选题判断的场上事件",
      summary: "乌龙球、球衣被扯破、VAR 争议、伤退传闻等事件可以作为热点信号，再结合比赛数据生成内容角度。",
      url: "",
      source: "AI筛选",
      platform: "示例逻辑",
      relevance: 35,
      tags: ["乌龙球", "VAR争议", "球员事件"]
    }
  ];
}
