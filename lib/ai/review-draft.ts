import { generateDeepSeekJson, getDeepSeekFallbackMessage } from "@/lib/ai/deepseek";
import { cleanText, ensurePublishable } from "@/lib/ai/quality";
import { reviewRisk } from "@/lib/ai/risk";
import { isConcreteAiRisk } from "@/lib/ai/review-policy";
import {
  auditDraftEvidence,
  buildEvidencePack,
  calculateEvidenceRiskScore,
  hasCompleteReview,
  finalizeReviewRiskScore
} from "@/lib/services/evidenceService";
import type { EvidenceItem, MatchContext, ReviewResultSnapshot } from "@/types/workflow";

type AiReviewDraft = {
  level?: string;
  score?: number;
  riskPoints?: string[];
  rewriteSuggestion?: string;
  checklist?: string[];
  findings?: Array<{
    type?: string;
    sentence?: string;
    reason?: string;
    rewrite?: string;
    evidenceStatus?: "missing" | "overreach" | "risk";
    evidenceIds?: string[];
  }>;
};

export async function reviewDraftWithAi(input: {
  draft: string;
  matchContext: MatchContext;
  evidence?: EvidenceItem[];
  apiKey?: string;
}): Promise<{
  sourceStatus: "live" | "fallback" | "error";
  result?: ReviewResultSnapshot;
  riskPoints?: string[];
  rewriteSuggestion?: string;
  checklist?: string[];
  model?: string;
  message?: string;
}> {
  const evidence = input.evidence?.length
    ? input.evidence
    : input.matchContext.evidence?.length
      ? input.matchContext.evidence
      : buildEvidencePack(input.matchContext);
  const evidenceAudit = auditDraftEvidence(input.draft, evidence);
  const ruleReview = reviewRisk(input.draft);
  const fallbackResult = buildFallbackResult(ruleReview, evidenceAudit, evidence);

  const result = await generateDeepSeekJson<AiReviewDraft>(
    [
      {
        role: "system",
        content:
          [
            "你是体育内容发布审稿编辑，只输出严格 JSON，不要 Markdown。",
            "逐句检查事实断言，只使用证据包中的 E 编号作为事实依据。",
            "有证据支持的事实通过，不要列入 findings；缺少依据或表达超出证据范围时，必须引用原稿具体句子。",
            "纯观点、情绪、创意表达不要求来源，也不要误报。",
            "证据包不完整不等于原稿事实错误。仅缺少记录时标记 missing，作为补充来源提醒，不能据此判中高风险。",
            "只有与已提供的数据明确矛盾才标记 overreach；统计口径或四舍五入的小差异仅作提醒。",
            "选题提纲、拟制作方案、素材建议不是已经发生的事件，不按完整发布稿要求提供画面、引用或采访。",
            "不要网暴、避免黑哨定性等反面提醒不得当作攻击；长度、风格、素材授权未附说明不是事实错误。",
            "同时识别伤病、判罚、冲突、内部消息、引战词和绝对化表达。",
            "改写不能新增事实。没有具体问题时 findings、riskPoints 和 checklist 均返回空数组。"
          ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "审核赛事稿件，并返回可直接应用的改写。",
          hardRules: [
            "sentence 必须逐字来自原稿，禁止使用泛化占位句。",
            "evidenceIds 只能填写证据包中存在的编号。",
            "缺少事实依据时 evidenceStatus=missing；超出证据范围时为 overreach；高风险表达为 risk。",
            "没有问题时不要输出“数据未知”“仍需核实”等固定提醒。"
          ],
          outputShape: {
            level: "低/中/高",
            score: 0,
            riskPoints: ["具体问题"],
            rewriteSuggestion: "改写后可发布稿",
            checklist: ["仅与当前问题对应的检查项"],
            findings: [{
              type: "问题类型",
              sentence: "原句",
              reason: "当前证据为什么不支持",
              rewrite: "建议改写",
              evidenceStatus: "missing/overreach/risk",
              evidenceIds: ["E01"]
            }]
          },
          matchContext: input.matchContext,
          evidence,
          draft: input.draft
        })
      }
    ],
    { timeoutMs: 30_000, apiKey: input.apiKey, quality: "fast", maxTokens: 1_600 }
  );

  if (!result.ok || !hasCompleteReview(result.data, input.draft)) {
    return {
      sourceStatus: "fallback",
      message: result.ok ? "AI 审核结果不完整，待人工确认。" : getDeepSeekFallbackMessage(result.message),
      result: fallbackResult,
      riskPoints: buildRiskPoints(fallbackResult),
      rewriteSuggestion: buildFallbackRewrite(input.draft, fallbackResult),
      checklist: buildChecklist(fallbackResult)
    };
  }

  const aiFindings = normalizeAiFindings(result.data.findings, input.draft, evidence);
  const findings = mergeFindings(aiFindings, fallbackResult.findings);
  const baseLevel = normalizeLevel(result.data.level);
  const rawScore = Math.max(
    findings.length ? 36 : 0,
    normalizeScore(result.data.score, baseLevel),
    evidencePenalty(evidenceAudit.summary.unsupportedClaims),
    ruleReview.score
  );
  const score = finalizeReviewRiskScore(
    rawScore,
    findings.map((finding) => finding.evidenceStatus ?? "risk")
  );
  const level = score >= 70 ? "高" : score >= 36 ? "中" : "低";
  const resultSnapshot: ReviewResultSnapshot = {
    level,
    score,
    advice: level === "高" ? "建议暂缓" : level === "中" ? "修改后发布" : findings.length ? "可预览，建议补充来源" : "可发布",
    findings,
    evidence,
    evidenceSummary: evidenceAudit.summary
  };
  const actionableFindings = findings.filter(finding => finding.evidenceStatus !== "missing");
  const aiRewriteSuggestion = actionableFindings.length ? ensurePublishable(result.data.rewriteSuggestion || "") : input.draft;
  const rewriteSuggestion = findings.length && /无需修改|无修改必要|可直接发布/.test(aiRewriteSuggestion)
    ? buildFallbackRewrite(input.draft, resultSnapshot)
    : aiRewriteSuggestion || buildFallbackRewrite(input.draft, resultSnapshot);

  return {
    sourceStatus: "live",
    model: result.model,
    riskPoints: findings.length
      ? buildRiskPoints(resultSnapshot)
      : [buildSuccessMessage(evidenceAudit.summary)],
    rewriteSuggestion,
    checklist: actionableFindings.length ? normalizeList(result.data.checklist, buildChecklist(resultSnapshot)) : buildChecklist(resultSnapshot),
    result: resultSnapshot
  };
}

function normalizeLevel(value: unknown): ReviewResultSnapshot["level"] {
  if (value === "高" || value === "中" || value === "低") return value;
  return "低";
}

function normalizeScore(value: unknown, level: string) {
  const score = Number(value);
  if (Number.isFinite(score)) return Math.max(0, Math.min(100, Math.round(score)));
  if (level === "高") return 72;
  if (level === "中") return 42;
  return 12;
}

function normalizeList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const list = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => cleanText(item));
  return list.length ? list : fallback;
}

function normalizeAiFindings(findings: AiReviewDraft["findings"], draft: string, evidence: EvidenceItem[]): ReviewResultSnapshot["findings"] {
  const evidenceIds = new Set(evidence.map((item) => item.id));
  return (findings ?? [])
    .filter((finding) => typeof finding.sentence === "string" && draft.includes(finding.sentence.trim()))
    .filter((finding) => {
      if (finding.evidenceStatus === "risk" && isConcreteAiRisk(finding.sentence ?? "", finding.reason ?? "")) return true;
      const audit = auditDraftEvidence(finding.sentence ?? "", evidence);
      return audit.summary.unsupportedClaims > 0;
    })
    .slice(0, 5)
    .map((finding) => {
      const sentence = cleanText(finding.sentence || "");
      const status = finding.evidenceStatus === "risk" && isConcreteAiRisk(sentence, finding.reason ?? "")
        ? "risk" : auditDraftEvidence(sentence, evidence).findings[0]?.evidenceStatus ?? "missing";
      return {
        type: status === "missing" ? "建议补充来源" : cleanText(finding.type || "事实边界"),
        sentence,
        reason: status === "missing" ? "当前资料未覆盖这条陈述，不等于事实错误；补充对应来源即可。" : cleanText(finding.reason || "该表达需要校正。"),
        rewrite: status === "missing" ? sentence : ensurePublishable(finding.rewrite || "请按对应来源校正表达。"),
        evidenceStatus: status,
        evidenceIds: (finding.evidenceIds ?? []).filter((id) => evidenceIds.has(id))
      };
    });
}

function buildFallbackResult(
  ruleReview: ReturnType<typeof reviewRisk>,
  evidenceAudit: ReturnType<typeof auditDraftEvidence>,
  evidence: EvidenceItem[]
): ReviewResultSnapshot {
  const ruleFindings: ReviewResultSnapshot["findings"] = ruleReview.findings.map((finding) => ({
    type: finding.type,
    sentence: finding.sentence,
    reason: finding.reason,
    rewrite: finding.rewrite,
    evidenceStatus: "risk",
    evidenceIds: []
  }));
  const findings = mergeFindings(evidenceAudit.findings, ruleFindings);
  const score = finalizeReviewRiskScore(Math.max(ruleReview.score, calculateEvidenceRiskScore(evidenceAudit.summary.unsupportedClaims)), findings.map(finding => finding.evidenceStatus ?? "risk"));

  return {
    level: "待人工确认",
    score,
    findings,
    advice: "审核未完成，待人工确认",
    evidence,
    evidenceSummary: evidenceAudit.summary
  };
}

function mergeFindings(
  primary: ReviewResultSnapshot["findings"],
  secondary: ReviewResultSnapshot["findings"]
) {
  const seen = new Set<string>();
  return [...primary, ...secondary].filter((finding) => {
    const key = `${cleanText(finding.sentence).toLowerCase()}-${finding.evidenceStatus}`;
    if (!finding.sentence || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

function buildRiskPoints(result: ReviewResultSnapshot) {
  if (!result.findings.length) {
    if (result.level === "待人工确认") return ["AI 审核未完成，当前本地检查不能替代人工确认。"];
    return [buildSuccessMessage(result.evidenceSummary ?? { checkedClaims: 0, supportedClaims: 0, unsupportedClaims: 0 })];
  }
  return result.findings.map((finding) => {
    const evidenceText = finding.evidenceIds?.length ? `（依据 ${finding.evidenceIds.join("、")}）` : "";
    return `${finding.type}：${finding.sentence}${evidenceText}${finding.reason ? `。${finding.reason}` : ""}`;
  });
}

function evidencePenalty(unsupportedClaims: number) {
  return calculateEvidenceRiskScore(unsupportedClaims);
}

function buildSuccessMessage(summary: NonNullable<ReviewResultSnapshot["evidenceSummary"]>) {
  return summary.checkedClaims > 0
    ? `已核对 ${summary.checkedClaims} 条事实陈述，当前证据均可支持。`
    : "未发现需要核验的具体事实断言。";
}

function buildChecklist(result: ReviewResultSnapshot) {
  return result.findings.slice(0, 4).map((finding) =>
    finding.evidenceStatus === "missing"
      ? `可为“${finding.sentence}”补充来源，不视为事实错误`
      : `按建议修改“${finding.sentence}”`
  );
}

function buildFallbackRewrite(draft: string, result: ReviewResultSnapshot) {
  if (!result.findings.length) return draft;
  return result.findings.reduce((text, finding) => {
    if (finding.evidenceStatus === "missing") return text;
    if (!finding.sentence || !text.includes(finding.sentence)) return text;
    return text.replace(finding.sentence, finding.rewrite);
  }, draft);
}
