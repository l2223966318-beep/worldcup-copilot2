import { NextResponse } from "next/server";

import { searchHotSignals } from "@/lib/hot/hotSearchService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "世界杯 足球 今日热点";
  const payload = await searchHotSignals(query);

  return NextResponse.json(payload);
}
