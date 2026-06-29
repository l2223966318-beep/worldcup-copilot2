import { cleanText } from "@/lib/ai/quality";
import type { EvidenceItem, MatchContext, ReviewResultSnapshot } from "@/types/workflow";

type EvidenceHotspot = {
  title: string;
  summary?: string;
  source: string;
  url?: string;
  heatScore?: number;
  valueScore?: number;
};

type ClaimAudit = {
  sentence: string;
  supported: boolean;
  evidenceIds: string[];
};

const FACT_KEYWORDS = [
  "比分",
  "进球",
  "失球",
  "扳平",
  "领先",
  "绝杀",
  "射门",
  "射正",
  "控球",
  "角球",
  "犯规",
  "黄牌",
  "红牌",
  "点球",
  "乌龙",
  "VAR",
  "分钟"
];

export function buildEvidencePack(matchContext: MatchContext, hotspots: EvidenceHotspot[] = []): EvidenceItem[] {
  const { matchInfo, stats } = matchContext;
  const evidence: EvidenceItem[] = [];
  const source = matchInfo.sourceStatus === "live" || matchInfo.sourceStatus === "cache"
    ? "Sportradar"
    : "赛事数据";

  evidence.push({
    id: "",
    type: "match_stat",
    text: `${matchInfo.teamA} vs ${matchInfo.teamB}，比分 ${matchInfo.score}，赛事阶段 ${matchInfo.stage}`,
    source,
    occurredAt: matchInfo.time,
    relevance: 100
  });
  if (matchContext.verifiedStats !== false) {
    evidence.push({
      id: "",
      type: "match_stat",
      text: `${matchInfo.teamA}控球率 ${stats.teamA.possession}%，${matchInfo.teamB}控球率 ${stats.teamB.possession}%`,
      source,
      relevance: 94
    });
    evidence.push({
      id: "",
      type: "match_stat",
      text: `${matchInfo.teamA}射门 ${stats.teamA.shots} 次、射正 ${stats.teamA.shotsOnTarget} 次；${matchInfo.teamB}射门 ${stats.teamB.shots} 次、射正 ${stats.teamB.shotsOnTarget} 次`,
      source,
      relevance: 96
    });
    evidence.push({
      id: "",
      type: "match_stat",
      text: `${matchInfo.teamA}角球 ${stats.teamA.corners} 次、犯规 ${stats.teamA.fouls} 次、黄牌 ${stats.teamA.yellowCards} 张；${matchInfo.teamB}角球 ${stats.teamB.corners} 次、犯规 ${stats.teamB.fouls} 次、黄牌 ${stats.teamB.yellowCards} 张`,
      source,
      relevance: 82
    });
  }

  matchContext.keyEvents.filter((event) => event.minute !== "-" && event.team !== "数据源").slice(0, 10).forEach((event) => {
    const description = cleanText(event.description);
    evidence.push({
      id: "",
      type: "match_event",
      text: cleanText(`${event.minute} ${description.includes(event.team) ? description : `${event.team} ${description}`}`),
      source,
      minute: event.minute,
      relevance: event.type === "goal" ? 98 : 90
    });
  });

  hotspots.slice(0, 8).forEach((hotspot) => {
    evidence.push({
      id: "",
      type: "hot_topic",
      text: cleanText(`${hotspot.title}${hotspot.summary ? `：${hotspot.summary}` : ""}`),
      source: hotspot.source || "公开热点源",
      sourceUrl: hotspot.url,
      relevance: Math.max(60, Math.min(100, hotspot.valueScore ?? hotspot.heatScore ?? 70))
    });
  });

  const seen = new Set<string>();
  return evidence
    .filter((item) => {
      const key = normalize(item.text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 16)
    .map((item, index) => ({ ...item, id: `E${String(index + 1).padStart(2, "0")}` }));
}

export function auditDraftEvidence(draft: string, evidence: EvidenceItem[]) {
  const claims = splitSentences(draft)
    .filter(isFactualClaim)
    .map((sentence): ClaimAudit => {
      const evidenceIds = findSupportingEvidence(sentence, evidence).map((item) => item.id);
      return { sentence, supported: evidenceIds.length > 0, evidenceIds };
    });

  const unsupported = claims.filter((claim) => !claim.supported);
  const findings: ReviewResultSnapshot["findings"] = unsupported.map((claim) => ({
    type: "缺少事实依据",
    sentence: claim.sentence,
    reason: "该句包含具体比分、时间点、事件或统计判断，但当前赛事证据中没有可直接支持的记录。",
    rewrite: "删除该句，或补充可核验的数据、事件记录或公开来源后再发布。",
    evidenceStatus: "missing",
    evidenceIds: []
  }));

  return {
    claims,
    findings,
    summary: {
      checkedClaims: claims.length,
      supportedClaims: claims.length - unsupported.length,
      unsupportedClaims: unsupported.length
    }
  };
}

export function calculateEvidenceRiskScore(unsupportedClaims: number) {
  if (unsupportedClaims <= 0) return 0;
  return Math.min(84, 36 + (unsupportedClaims - 1) * 8);
}

export function evidenceLabel(item: EvidenceItem) {
  return `${item.id} ${item.source}：${item.text}`;
}

function findSupportingEvidence(sentence: string, evidence: EvidenceItem[]) {
  const normalizedSentence = normalize(sentence);
  const numbers = extractNumbers(sentence);
  const keywords = FACT_KEYWORDS.filter((keyword) => normalizedSentence.includes(normalize(keyword)));

  return evidence.filter((item) => {
    const normalizedEvidence = normalize(item.text);
    const numberMatch = !numbers.length || numbers.every((number) => extractNumbers(item.text).includes(number));
    const keywordMatch = !keywords.length || keywords.some((keyword) => normalizedEvidence.includes(normalize(keyword)));
    const teamOrNameMatch = sharedNamedTerms(sentence, item.text) > 0;
    return numberMatch && keywordMatch && (teamOrNameMatch || numbers.length > 0);
  });
}

function isFactualClaim(sentence: string) {
  if (isEditorialInstruction(sentence)) return false;
  const hasFactKeyword = FACT_KEYWORDS.some((keyword) => sentence.includes(keyword));
  const hasNumber = extractNumbers(sentence).length > 0;
  const hasSpecificEvent = /(完成进球|打入|罚进|扑出|被罚下|获得点球|发生冲突|受伤|伤退)/.test(sentence);
  return hasSpecificEvent || (hasFactKeyword && hasNumber);
}

function isEditorialInstruction(sentence: string) {
  return /(怎么做|建议从|可以从|可从|从\d+分钟开始|重点分析|适合做|做成|创作|脚本结构|内容结构)/.test(sentence);
}

function sharedNamedTerms(left: string, right: string) {
  const rightText = normalize(right);
  return left
    .split(/[\s，。；、：:（）()《》“”"']/)
    .map((item) => normalize(item))
    .filter((item) => item.length >= 2 && !FACT_KEYWORDS.some((keyword) => normalize(keyword) === item))
    .filter((item) => rightText.includes(item))
    .length;
}

function extractNumbers(text: string) {
  return Array.from(text.matchAll(/\d+(?:\.\d+)?%?/g), (match) => match[0].replace(/^0+(?=\d)/, ""));
}

function splitSentences(text: string) {
  return text
    .split(/[。！？；;!?\n，,]/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function normalize(text: string) {
  return cleanText(text).toLowerCase().replace(/[\s，。；、：:（）()《》“”"'’\-]/g, "");
}
