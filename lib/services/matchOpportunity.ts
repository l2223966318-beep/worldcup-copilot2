import type { WorldCupMatch } from "@/lib/sports/types";

export type MatchOpportunityProfile = ReturnType<typeof getOpportunityProfile>;

export function getFixtureOpportunityProfile(fixtures: WorldCupMatch[] | undefined, matchId: string, now = Date.now()) {
  const fixture = fixtures?.find(match => match.id === matchId);
  return fixture ? getOpportunityProfile(fixture, now) : undefined;
}

export function getOpportunityProfile(match: WorldCupMatch, now = Date.now()) {
  const { score, signals } = getOpportunityScore(match, now);

  if (score >= 85) {
    return {
      grade: "S",
      score,
      reason: "高张力场次，适合立即做热点承接、赛后复盘和观点扩散。",
      signals
    } as const;
  }

  if (score >= 70) {
    return {
      grade: "A",
      score,
      reason: "内容价值明确，适合从赛果、球员叙事和数据反差切入。",
      signals
    } as const;
  }

  if (score >= 55) {
    return {
      grade: "B",
      score,
      reason: "有基础内容空间，先观察舆情或作为备选素材储备。",
      signals
    } as const;
  }

  return {
    grade: "C",
    score,
    reason: "当前内容信号偏弱，除非出现额外热点事件，否则不建议优先投入。",
    signals
  } as const;
}

function getOpportunityScore(match: WorldCupMatch, now: number) {
  let score = 18;
  const signals: string[] = [];
  const kickoffMs = Date.parse(match.kickoffTime || "");
  const hoursToKickoff = Number.isFinite(kickoffMs) ? (kickoffMs - now) / (1000 * 60 * 60) : undefined;

  if (match.status === "live") {
    score += 34;
    signals.push("进行中");
  } else if (match.status === "finished") {
    score += 16;
    signals.push("已结束可复盘");
  } else if (match.status === "scheduled") {
    if (typeof hoursToKickoff === "number" && hoursToKickoff <= 6) {
      score += 14;
      signals.push("即将开赛");
    } else if (typeof hoursToKickoff === "number" && hoursToKickoff <= 18) {
      score += 10;
      signals.push("今日开赛");
    } else {
      score += 5;
      signals.push("赛前预热");
    }
  }

  const roundText = `${match.round} ${match.group ?? ""}`.toLowerCase();
  if (/final|semi|quarter|淘汰|八强|四强|决赛|半决赛|1\/8|1\/4/.test(roundText)) {
    score += 18;
    signals.push("淘汰赛");
  } else if (/group|小组/.test(roundText)) {
    score += 4;
    signals.push("小组赛");
  }

  const home = match.score.home;
  const away = match.score.away;
  const hasConfirmedScore = typeof home === "number" && typeof away === "number";
  const totalGoals = typeof home === "number" && typeof away === "number" ? home + away : 0;
  const goalDiff = typeof home === "number" && typeof away === "number" ? Math.abs(home - away) : null;

  if (hasConfirmedScore) {
    score += 10;
    signals.push("比分已确认");
  } else if (match.status !== "scheduled") {
    score -= 12;
    signals.push("比分待确认");
  }

  if (totalGoals >= 4) {
    score += 10;
    signals.push("进球多");
  } else if (totalGoals >= 2) {
    score += 5;
  }

  if (goalDiff === 0 && totalGoals > 0) {
    score += 8;
    signals.push("比分胶着");
  } else if (goalDiff === 1) {
    score += 6;
    signals.push("一球差");
  }

  const eventCount = match.events.length;
  if (eventCount >= 5) {
    score += 14;
    signals.push("事件密集");
  } else if (eventCount >= 3) {
    score += 9;
    signals.push("多关键事件");
  } else if (eventCount >= 1) {
    score += 4;
  }

  const eventText = match.events.map((event) => `${event.type} ${event.detail} ${event.comment ?? ""}`).join(" ");
  if (/penalty|own goal|var|red card|yellow card|争议|乌龙|点球|红牌|裁判/i.test(eventText)) {
    score += 12;
    signals.push("争议/名场面");
  }

  const richStatsCoverage = match.statistics.some((entry) =>
    entry.values.some((value) => {
      if (value.type === "Data Coverage" || value.type === "Goals") return false;
      return value.value !== null && value.value !== "";
    })
  );
  if (richStatsCoverage) {
    score += 8;
    signals.push("数据可讲");
  } else if (hasConfirmedScore) {
    score += 2;
  }

  if (!hasConfirmedScore && eventCount === 0 && !richStatsCoverage && match.status === "finished") {
    score -= 10;
    signals.push("信息偏少");
  }

  if (match.source.provider === "api-football") {
    score += 5;
    signals.push("实时接口");
  } else if (match.source.provider === "worldcup26-free" && !hasConfirmedScore && eventCount === 0) {
    score -= 4;
  }

  return {
    score: Math.max(0, Math.min(99, score)),
    signals: [...new Set(signals)]
  };
}
