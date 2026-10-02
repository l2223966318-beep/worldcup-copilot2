import { NextResponse } from "next/server";

import { generateDeepSeekJson, getDeepSeekFallbackMessage } from "@/lib/ai/deepseek";
import {
  buildHotAnalysis,
  buildTopicIntro,
  type HotInsight
} from "@/lib/hot/hotTopicWorkflow";
import type { HotTopic } from "@/lib/hot/types";
import { buildHotTopicAiFingerprint } from "@/lib/services/hotTopicAiCache";
import { normalizeHotAnalysis } from "@/lib/hot/normalizeHotAnalysis";

export const dynamic = "force-dynamic";

const HOT_TOPIC_AI_CACHE_TTL_MS = Number(process.env.HOT_TOPIC_AI_CACHE_TTL_MS ?? 10 * 60_000);
const HOT_TOPIC_AI_TIMEOUT_MS = Number(process.env.HOT_TOPIC_AI_TIMEOUT_MS ?? 20_000);

type HotTopicAiPayload = {
  intro?: string;
  overview?: Partial<HotInsight>[];
  production?: Partial<HotInsight>[];
  whyCare?: string[];
  relation?: string[];
  angles?: string[];
  platforms?: string[];
  factsToVerify?: string[];
  risks?: string[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { topic?: HotTopic; apiKey?: string };
    if (!body.topic) {
      return NextResponse.json(
        {
          sourceStatus: "error",
          message: "topic is required."
        },
        { status: 400 }
      );
    }

    const fallbackIntro = buildTopicIntro(body.topic);
    const fallbackAnalysis = buildHotAnalysis(body.topic);
    const result = await generateDeepSeekJson<HotTopicAiPayload>(
      [
        {
          role: "system",
          content:
            [
              "你是体育内容运营编辑总监，只输出严格 JSON，不要 Markdown。",
              "先在内部判断：热点是否真和足球/当前比赛相关、可写信息有哪些、哪些必须核验。最终不要输出推理过程。",
              "任务：把热点分析写成短、准、可执行的运营判断，不要空话。",
              "分析顺序必须是：发生了什么 → 为什么值得做 → 和比赛/足球关系 → 可产出什么 → 需核验什么。",
              "只能基于热点 title、summary、source、platform、valueScore、category、tags、url 判断；不得编造比分、球员发言、比赛细节、官方结论。",
              "如果信息不足，必须明确写“需二次核验”或“目前仅能确认存在讨论”。",
              "intro 用 50-90 字说明发生了什么和仍需核验的信息。",
              "overview 和 production 各输出 3 条，每条只包含 label、value、note；value 要像高亮信息标签，note 用一句话解释原因。",
              "whyCare、relation、angles、platforms、factsToVerify、risks 各控制在 1-2 条。"
            ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            topic: body.topic,
            outputShape: {
              intro: "50到90字的基本介绍",
              overview: [{ label: "价值判断", value: "高价值", note: "一句说明原因" }],
              production: [{ label: "主推平台", value: "微博", note: "一句说明原因" }],
              whyCare: ["1条"],
              relation: ["1条"],
              angles: ["1条"],
              platforms: ["1条"],
              factsToVerify: ["1条"],
              risks: ["1条"]
            }
          })
        }
      ],
      { timeoutMs: HOT_TOPIC_AI_TIMEOUT_MS, apiKey: body.apiKey, quality: "fast", maxTokens: 1_400,
        cacheTtlMs: HOT_TOPIC_AI_CACHE_TTL_MS, cacheKey: `hot-topic-v2:${buildHotTopicAiFingerprint(body.topic)}` }
    );

    if (!result.ok) {
      return NextResponse.json({
        sourceStatus: "fallback",
        intro: fallbackIntro,
        analysis: fallbackAnalysis,
        message: getDeepSeekFallbackMessage(result.message)
      });
    }

    const analysis = normalizeHotAnalysis(result.data, fallbackAnalysis);
    const intro = normalizeIntro(result.data.intro, fallbackIntro);

    const payload = {
      sourceStatus: "live",
      intro,
      analysis,
      model: result.model
    } as const;
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown hot topic AI error.";
    return NextResponse.json(
      {
        sourceStatus: "error",
        message
      },
      { status: 500 }
    );
  }
}

function normalizeIntro(value: string | undefined, fallback: string) {
  if (typeof value !== "string") return fallback;
  const next = value.trim();
  return next || fallback;
}
