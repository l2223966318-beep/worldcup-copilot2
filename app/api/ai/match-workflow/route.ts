import { NextResponse } from "next/server";

import { enhanceMatchWorkflowWithDeepSeek } from "@/lib/ai/deepseek-workflow";
import type { TopicIdea } from "@/lib/ai/topics";
import type { MatchData } from "@/data/matches";

export const dynamic = "force-dynamic";

type MatchWorkflowCacheEntry = {
  expiresAt: number;
  payload: Awaited<ReturnType<typeof enhanceMatchWorkflowWithDeepSeek>>;
};

const MATCH_WORKFLOW_CACHE_TTL_MS = Number(process.env.MATCH_WORKFLOW_AI_CACHE_TTL_MS ?? 10 * 60_000);
const matchWorkflowCache = new Map<string, MatchWorkflowCacheEntry>();

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      match?: MatchData;
      baselineTopics?: TopicIdea[];
      apiKey?: string;
    };

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

    const cacheKey = buildCacheKey(body.match, body.baselineTopics);
    const cached = matchWorkflowCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ ...cached.payload, sourceStatus: cached.payload.sourceStatus === "live" ? "live" : cached.payload.sourceStatus });
    }

    const payload = await enhanceMatchWorkflowWithDeepSeek({
      match: body.match,
      baselineTopics: body.baselineTopics,
      apiKey: body.apiKey
    });

    if (payload.sourceStatus === "live") {
      matchWorkflowCache.set(cacheKey, { expiresAt: Date.now() + MATCH_WORKFLOW_CACHE_TTL_MS, payload });
    }

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

function buildCacheKey(match: MatchData, topics: TopicIdea[]) {
  return [
    match.id,
    match.score,
    match.keyEvents.map((event) => `${event.minute}:${event.description}`).join("|"),
    topics.map((topic) => topic.id).join("|")
  ].join("::");
}
