import { NextResponse } from "next/server";

import { getWorldCupMatch } from "@/lib/sports/worldCupService";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const payload = await getWorldCupMatch(fixtureId);
  return NextResponse.json(payload);
}
