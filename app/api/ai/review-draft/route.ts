import { NextResponse } from "next/server";

import { reviewDraftWithAi } from "@/lib/ai/review-draft";
import { getAiAccessFailure } from "@/lib/ai/requestGuard";
import type { EvidenceItem, MatchContext } from "@/types/workflow";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      draft?: string;
      matchContext?: MatchContext;
      evidence?: EvidenceItem[];
      apiKey?: string;
    };
    const denied = getAiAccessFailure(request.headers, body.apiKey);
    if (denied) return NextResponse.json({ sourceStatus: "error", message: denied.message }, { status: denied.status });

    if (!body.draft?.trim() || !body.matchContext) {
      return NextResponse.json({ sourceStatus: "error", message: "draft and matchContext are required." }, { status: 400 });
    }

    return NextResponse.json(await reviewDraftWithAi({
      draft: body.draft,
      matchContext: body.matchContext,
      evidence: body.evidence,
      apiKey: body.apiKey
    }));
  } catch (error) {
    return NextResponse.json(
      { sourceStatus: "error", message: error instanceof Error ? error.message : "Unknown review AI error." },
      { status: 500 }
    );
  }
}
