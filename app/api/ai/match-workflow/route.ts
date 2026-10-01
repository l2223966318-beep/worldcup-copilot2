import { NextResponse } from "next/server";

import { enhanceMatchWorkflowWithDeepSeek } from "@/lib/ai/deepseek-workflow";
import type { TopicIdea } from "@/lib/ai/topics";
import type { MatchData } from "@/data/matches";
import { getAiAccessFailure } from "@/lib/ai/requestGuard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      match?: MatchData;
      baselineTopics?: TopicIdea[];
      apiKey?: string;
    };
    const denied = getAiAccessFailure(request.headers, body.apiKey);
    if (denied) return NextResponse.json({ sourceStatus: "error", message: denied.message }, { status: denied.status });

    if (!body.match || !Array.isArray(body.baselineTopics)) {
      return NextResponse.json(
        {
          workflowVersion: "platform-content-v1",
          sourceStatus: "error",
          conclusions: [],
          topics: [],
          message: "match and baselineTopics are required."
        },
        { status: 400 }
      );
    }

    const payload = await enhanceMatchWorkflowWithDeepSeek({
      match: body.match,
      baselineTopics: body.baselineTopics,
      apiKey: body.apiKey
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI workflow error.";
    return NextResponse.json(
      {
        workflowVersion: "platform-content-v1",
        sourceStatus: "error",
        conclusions: [],
        topics: [],
        message
      },
      { status: 500 }
    );
  }
}
