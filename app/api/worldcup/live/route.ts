import { NextRequest, NextResponse } from "next/server";

import { getSportradarSourceDebug } from "@/lib/sports/sourceDebug";
import { getLiveWorldCupFixtures } from "@/lib/sports/worldCupService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("debug") === "source") {
    return NextResponse.json(await getSportradarSourceDebug());
  }

  const payload = await getLiveWorldCupFixtures();
  return NextResponse.json(payload);
}
