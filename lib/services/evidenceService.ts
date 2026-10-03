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

const FACT_TERM_GROUPS = [
  ["进球", "失球", "扳平", "领先", "绝杀", "goal", "scored"],
  ["射门", "shot"],
  ["射正", "shotontarget"],
  ["角球", "corner", "cornerkick"],
  ["犯规", "foul"],
  ["黄牌", "yellowcard"],
  ["红牌", "redcard"],
  ["点球", "penalty"],
  ["乌龙", "owngoal"],
  ["受伤", "伤退", "injury", "injured"]
];

export function buildEvidencePack(matchContext: MatchContext, hotspots: EvidenceHotspot[] = []): EvidenceItem[] {
  const { matchInfo, stats } = matchContext;
  const evidence: EvidenceItem[] = [];
  const source = matchInfo.sourceName || "赛事数据";

  evidence.push({
    id: "",
    type: "match_stat",
    text: `${matchInfo.teamA} vs ${matchInfo.teamB}，比分 ${matchInfo.score}，赛事阶段 ${matchInfo.stage}`,
    source,
    occurredAt: matchInfo.time,
    relevance: 100
  });
  if (matchContext.verifiedStats !== false
    && [...Object.values(stats.teamA), ...Object.values(stats.teamB)].every(value => typeof value === "number" && Number.isFinite(value))) {
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

  matchContext.keyEvents.filter((event) => event.minute !== "-" && event.team !== "数据源").forEach((event) => {
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
  const findings: ReviewResultSnapshot["findings"] = unsupported.map((claim) => {
    const conflicts = findConflictingEvidence(claim.sentence, evidence);
    return {
      type: conflicts.length ? "与现有数据不一致" : "建议补充来源",
      sentence: claim.sentence,
      reason: conflicts.length
        ? `当前陈述与已提供的数据不一致：${conflicts.map(item => item.text).join("；")}`
        : "当前资料未覆盖这条陈述，不等于事实错误；补充对应来源即可。",
      rewrite: conflicts.length ? "请按对应来源校正数值，并注明统计口径。" : claim.sentence,
      evidenceStatus: conflicts.length ? "overreach" : "missing",
      evidenceIds: conflicts.map(item => item.id)
    };
  });

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
  return Math.min(20, 18 + (unsupportedClaims - 1) * 2);
}

export function hasCompleteReview(value: unknown, draft: string) {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  if (typeof data.score !== "number" || !Number.isFinite(data.score) || data.score < 0 || data.score > 100
    || !Array.isArray(data.findings)) return false;
  return data.findings.every(finding => {
    if (!finding || typeof finding !== "object") return false;
    const item = finding as Record<string, unknown>;
    return typeof item.sentence === "string" && Boolean(item.sentence.trim()) && draft.includes(item.sentence.trim())
      && (item.evidenceStatus === undefined || ["missing", "overreach", "risk"].includes(String(item.evidenceStatus)))
      && (item.evidenceIds === undefined || (Array.isArray(item.evidenceIds) && item.evidenceIds.every(id => typeof id === "string")));
  });
}

export function finalizeReviewRiskScore(
  rawScore: number,
  evidenceStatuses: Array<"missing" | "overreach" | "risk">
) {
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  if (!evidenceStatuses.length) return Math.min(score, 20);
  if (evidenceStatuses.includes("risk")) return score;
  if (evidenceStatuses.includes("overreach")) return Math.max(36, Math.min(score, 56));
  return Math.min(score, 20);
}

function findConflictingEvidence(sentence: string, evidence: EvidenceItem[]) {
  if (/如果|假如|可能|大约|约\s*\d|左右|接近|超过|不到|半场|一度|当时|此前|点球大战/.test(sentence)) return [];
  const claims = parseStatFacts(sentence);
  const stats = evidence.filter(item => item.type === "match_stat" && claims.some(claim => {
    if (!claim.subject) return false;
    const facts = parseStatFacts(item.text).filter(fact => fact.subject === claim.subject && fact.metric === claim.metric && fact.unit === claim.unit);
    // Small provider/rounding differences are reminders, not factual errors.
    return facts.length === 1 && Math.abs(facts[0].value - claim.value) > 1;
  }));
  if (stats.length) return stats;
  const result = sentence.match(/^(.+?)(?:以)?\s*(\d+)\s*[-比:]\s*(\d+)\s*(?:战胜|击败|不敌|负于)\s*(.+)$/);
  if (!result) return [];
  return evidence.filter(item => {
    const board = item.text.match(/^(.+?)\s+vs\s+(.+?)[，,]\s*比分\s*(\d+)\s*[-比:]\s*(\d+)/i);
    if (!board) return false;
    const homeFirst = normalize(result[1]) === normalize(board[1]) && normalize(result[4]) === normalize(board[2]);
    const awayFirst = normalize(result[1]) === normalize(board[2]) && normalize(result[4]) === normalize(board[1]);
    if (!homeFirst && !awayFirst) return false;
    const expected = homeFirst ? [board[3], board[4]] : [board[4], board[3]];
    return expected[0] !== result[2] || expected[1] !== result[3]
      || (/战胜|击败/.test(sentence) ? Number(expected[0]) <= Number(expected[1]) : Number(expected[0]) >= Number(expected[1]));
  });
}

export function evidenceLabel(item: EvidenceItem) {
  return `${item.id} ${item.source}：${item.text}`;
}

function findSupportingEvidence(sentence: string, evidence: EvidenceItem[]) {
  const statClaims = parseStatFacts(sentence);
  if (statClaims.length) {
    // A recognized statistic must not hide another unchecked number or score in the same clause.
    const remaining = normalizeStatOrder(sentence).replace(/(控球率?|射门|射正|角球|犯规|黄牌|红牌)\s*\d+(?:\.\d+)?\s*(%|次|张)?(?:\s*(?:比|对)\s*\d+(?:\.\d+)?\s*(%|次|张)?)?/g, "");
    if (/\d/.test(remaining)) return [];
    const matches = statClaims.map(claim => evidence.filter(item => {
      const facts = parseStatFacts(item.text);
      if (claim.pairedValue !== undefined) {
        const pair = facts.filter(fact => fact.metric === claim.metric);
        return pair.length === 2 && pair[0].value === claim.value && pair[1].value === claim.pairedValue
          && pair.every(fact => fact.unit === claim.unit)
          && (!claim.subject || pair[0].subject === claim.subject);
      }
      return facts.some(fact => fact.metric === claim.metric && fact.value === claim.value
        && fact.unit === claim.unit && (!claim.subject || fact.subject === claim.subject));
    }));
    return matches.every(items => items.length) ? Array.from(new Set(matches.flat())) : [];
  }

  const difference = sentence.match(/(控球率?|射门|射正|角球|犯规|黄牌|红牌)(?:差|差距)(?:为|是)?\s*(\d+(?:\.\d+)?)(%|次|张)?/);
  if (difference) {
    const subjects = sentence.slice(0, difference.index).replace(/的$/, "").split(/与|和|对比/).map(normalize).filter(Boolean);
    return evidence.filter(item => {
      const facts = parseStatFacts(item.text).filter(fact => fact.metric === normalizeMetric(difference[1]));
      return subjects.length === 2 && facts.length === 2
        && subjects.every(subject => facts.some(fact => fact.subject === subject))
        && facts[0].unit === facts[1].unit
        && (!difference[3] || facts[0].unit === difference[3])
        && Math.abs(facts[0].value - facts[1].value) === Number(difference[2]);
    });
  }

  const score = sentence.match(/\d+\s*[-比:]\s*\d+/)?.[0];
  if (score) {
    const resultClaim = sentence.match(/^(.+?)(?:以)?\s*(\d+)\s*[-比:]\s*(\d+)\s*(?:战胜|击败|不敌|负于)\s*(.+)$/);
    return evidence.filter(item => {
      const scoreboard = item.text.match(/^(.+?)\s+vs\s+(.+?)[，,]\s*比分\s*(\d+)\s*[-比:]\s*(\d+)/i);
      if (!scoreboard) return false;
      if (resultClaim) {
        const homeFirst = normalize(resultClaim[1]) === normalize(scoreboard[1]) && normalize(resultClaim[4]) === normalize(scoreboard[2]);
        const awayFirst = normalize(resultClaim[1]) === normalize(scoreboard[2]) && normalize(resultClaim[4]) === normalize(scoreboard[1]);
        const expected = homeFirst ? [scoreboard[3], scoreboard[4]] : awayFirst ? [scoreboard[4], scoreboard[3]] : [];
        const won = /战胜|击败/.test(sentence);
        return expected[0] === resultClaim[2] && expected[1] === resultClaim[3]
          && (won ? Number(expected[0]) > Number(expected[1]) : Number(expected[0]) < Number(expected[1]));
      }
      // Only an explicit scoreboard statement can omit the two team names.
      return /^比分(?:变为|为|是)?\s*\d+/.test(sentence)
        && score.replace(/\s|比|:/g, char => char === "比" || char === ":" ? "-" : "") === `${scoreboard[3]}-${scoreboard[4]}`;
    });
  }

  const normalizedSentence = normalize(sentence);
  const factGroups = FACT_TERM_GROUPS.filter((group) =>
    group.some((term) => normalizedSentence.includes(normalize(term)))
  );
  const minute = sentence.match(/(\d+(?:\+\d+)?)(?:分钟|['’])/ )?.[1];
  const subject = eventSubject(sentence);
  return evidence.filter((item) => {
    if (item.type !== "match_event") return false;
    const normalizedEvidence = normalize(item.text);
    const keywordMatch = factGroups.length > 0 && factGroups.every(group => group.some(term => normalizedEvidence.includes(normalize(term))));
    const evidenceMinute = item.minute?.replace(/['’]/g, "") || item.text.match(/^(\d+(?:\+\d+)?)(?:分钟|['’])/ )?.[1];
    return keywordMatch && (!minute || minute === evidenceMinute)
      && Boolean(subject) && normalizedEvidence.includes(normalize(subject));
  });
}

function parseStatFacts(text: string) {
  text = normalizeStatOrder(text);
  const facts: Array<{ subject: string; metric: string; value: number; unit: string; pairedValue?: number }> = [];
  let previousEnd = 0;
  let subject = "";
  for (const match of text.matchAll(/(控球率?|射门|射正|角球|犯规|黄牌|红牌)\s*(\d+(?:\.\d+)?)\s*(%|次|张)?/g)) {
    const prefix = text.slice(previousEnd, match.index).replace(/^[\s，,；;、与和]+/, "").replace(/^对比/, "").trim();
    if (prefix) subject = normalize(prefix.replace(/的$/, ""));
    const metric = normalizeMetric(match[1]);
    const unit = match[3] || (metric === "控球率" ? "%" : metric.endsWith("牌") ? "张" : "次");
    const end = match.index! + match[0].length;
    const pair = text.slice(end).match(/^\s*(?:比|对)\s*(\d+(?:\.\d+)?)/);
    facts.push({ subject, metric, value: Number(match[2]), unit, ...(pair ? { pairedValue: Number(pair[1]) } : {}) });
    previousEnd = end;
  }
  return facts;
}

function normalizeStatOrder(text: string) {
  return text.replace(/(\d+(?:\.\d+)?)\s*(%|次|张)\s*(控球率?|射门|射正|角球|犯规|黄牌|红牌)/g, "$3$1$2");
}

function normalizeMetric(metric: string) {
  return metric === "控球" ? "控球率" : metric;
}

function eventSubject(sentence: string) {
  const beforeTime = sentence.match(/^([^\d]+?)(?:在)?\d+(?:\+\d+)?(?:分钟|['’])/)?.[1];
  if (beforeTime) return beforeTime.replace(/在$/, "").trim();
  return sentence.replace(/^\d+(?:\+\d+)?(?:分钟|['’])\s*/, "")
    .match(/^(.+?)(?:完成|获得|打入|罚进|扑出|被罚下|发生|受伤|伤退)/)?.[1]?.trim() || "";
}

function isFactualClaim(sentence: string) {
  if (isEditorialInstruction(sentence)) return false;
  const hasFactKeyword = FACT_KEYWORDS.some((keyword) => sentence.includes(keyword));
  const hasNumber = extractNumbers(sentence).length > 0;
  const hasSpecificEvent = /(完成进球|打入|罚进|扑出|被罚下|获得点球|发生冲突|受伤|伤退)/.test(sentence);
  return hasSpecificEvent || (hasFactKeyword && hasNumber) || /\d+\s*[-比:]\s*\d+/.test(sentence);
}

function isEditorialInstruction(sentence: string) {
  return /(怎么做|建议从|可以从|可从|从\d+分钟开始|重点分析|适合做|做成|制作|创作|脚本结构|内容结构)/.test(sentence);
}

function extractNumbers(text: string) {
  return Array.from(text.matchAll(/\d+(?:\.\d+)?%?/g), (match) => match[0].replace(/^0+(?=\d)/, ""));
}

function splitSentences(text: string) {
  return text
    .split(/[。！？；;!?\n，,]/)
    .map((item) => stripListPrefix(cleanText(item)))
    .filter(Boolean);
}

function stripListPrefix(text: string) {
  return text.replace(/^\s*(?:\d{1,2}[.、)]|[（(]\d{1,2}[）)])\s*/, "");
}

function normalize(text: string) {
  return cleanText(text).toLowerCase().replace(/[\s，。；、：:（）()《》“”"'’\-]/g, "");
}
