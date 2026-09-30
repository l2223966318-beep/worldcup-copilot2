export type SourceDebugResult = {
  configured: {
    apiKey: boolean;
    accessLevel: string;
    languageCode: string;
    competitionId: boolean;
    seasonId: boolean;
  };
  sportradar: {
    attempted: boolean;
    ok: boolean;
    status?: number;
    endpoint?: string;
    itemCount?: number;
    matchedWorldCupCount?: number;
    message?: string;
    seasonSchedule?: SourceEndpointDebug;
    seasonSummaries?: SourceEndpointDebug;
  };
  fallbackHint: string;
};

type SourceEndpointDebug = {
  attempted: boolean;
  ok: boolean;
  status?: number;
  itemCount?: number;
  message?: string;
};

type SportradarSeasonCandidate = {
  id?: string;
  name?: string;
  year?: string;
  start_date?: string;
  end_date?: string;
  competition_id?: string;
};

type SportradarCompetitionCandidate = {
  id?: string;
  name?: string;
  gender?: string;
  category?: {
    id?: string;
    name?: string;
  };
};

export type SourceSeasonDebugResult = {
  configured: SourceDebugResult["configured"];
  seasons: {
    attempted: boolean;
    ok: boolean;
    status?: number;
    endpoint?: string;
    itemCount?: number;
    candidates: SportradarSeasonCandidate[];
    message?: string;
  };
  competitions: {
    attempted: boolean;
    ok: boolean;
    status?: number;
    endpoint?: string;
    itemCount?: number;
    candidates: SportradarCompetitionCandidate[];
    message?: string;
  };
  hint: string;
};

const DEFAULT_WORLD_CUP_COMPETITION_ID = "sr:competition:16";
const DEFAULT_WORLD_CUP_SEASON_ID = "sr:season:101177";

export async function getSportradarSourceDebug(): Promise<SourceDebugResult> {
  const accessLevel = process.env.SPORTRADAR_ACCESS_LEVEL?.trim() || "trial";
  const languageCode = process.env.SPORTRADAR_LANGUAGE_CODE?.trim() || "en";
  const apiKey = process.env.SPORTRADAR_API_KEY?.trim();
  const competitionId = process.env.SPORTRADAR_WORLD_CUP_COMPETITION_ID?.trim() || DEFAULT_WORLD_CUP_COMPETITION_ID;
  const seasonId = process.env.SPORTRADAR_WORLD_CUP_SEASON_ID?.trim() || DEFAULT_WORLD_CUP_SEASON_ID;

  const result: SourceDebugResult = {
    configured: {
      apiKey: Boolean(apiKey),
      accessLevel,
      languageCode,
      competitionId: Boolean(competitionId),
      seasonId: Boolean(seasonId)
    },
    sportradar: {
      attempted: false,
      ok: false
    },
    fallbackHint: "Sportradar 未完成诊断。"
  };

  if (!apiKey) {
    result.fallbackHint = "代码已内置 FIFA World Cup 赛事与赛季 ID；当前部署只缺 SPORTRADAR_API_KEY，因此会继续走免费源兜底。";
    return result;
  }

  const endpoint = `https://api.sportradar.com/soccer/${accessLevel}/v4/${languageCode}/schedules/live/schedules.json`;
  const url = new URL(endpoint);
  url.searchParams.set("api_key", apiKey);
  result.sportradar.attempted = true;
  result.sportradar.endpoint = endpoint;

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });

    result.sportradar.status = response.status;

    if (!response.ok) {
      result.sportradar.message = await response.text().then((body) => body.slice(0, 240)).catch(() => "");
      result.fallbackHint = `Sportradar 请求失败，状态码 ${response.status}。通常是 key 无效、套餐未开通 Soccer v4，或 access level 不匹配。`;
      console.error("[sportradar-debug]", response.status, result.sportradar.message);
      return result;
    }

    const payload = (await response.json()) as { schedules?: unknown[] };
    const schedules = Array.isArray(payload.schedules) ? payload.schedules : [];
    result.sportradar.ok = true;
    result.sportradar.itemCount = schedules.length;
    result.sportradar.matchedWorldCupCount = schedules.filter(isWorldCupSchedule).length;

    if (!schedules.length) {
      result.fallbackHint = "Sportradar 连接成功，但 live schedules 当前没有比赛。今日赛程会继续尝试 daily schedules。";
    } else if (!result.sportradar.matchedWorldCupCount) {
      result.fallbackHint = "Sportradar 连接成功；当前没有正在进行的世界杯比赛。赛季级接口会继续检查完整赛程与历史结果。";
    } else {
      result.fallbackHint = "Sportradar 连接成功。若业务接口仍 fallback，请检查赛季/赛事 ID 或当天是否有匹配赛程。";
    }

    if (seasonId) {
      const baseUrl = `https://api.sportradar.com/soccer/${accessLevel}/v4/${languageCode}`;
      const encodedSeasonId = encodeURIComponent(seasonId);
      const [seasonSchedule, seasonSummaries] = await Promise.all([
        inspectSportradarSeasonEndpoint(`${baseUrl}/seasons/${encodedSeasonId}/schedules.json`, apiKey, "schedules"),
        inspectSportradarSeasonEndpoint(`${baseUrl}/seasons/${encodedSeasonId}/summaries.json`, apiKey, "summaries")
      ]);
      result.sportradar.seasonSchedule = seasonSchedule;
      result.sportradar.seasonSummaries = seasonSummaries;
    }

    return result;
  } catch (error) {
    result.sportradar.message = error instanceof Error ? error.message : "Unknown Sportradar request error.";
    result.fallbackHint = "Sportradar 请求异常，线上会继续走免费源兜底。";
    console.error("[sportradar-debug]", result.sportradar.message);
    return result;
  }
}

async function inspectSportradarSeasonEndpoint(
  endpoint: string,
  apiKey: string,
  collectionKey: "schedules" | "summaries"
): Promise<SourceEndpointDebug> {
  const url = new URL(endpoint);
  url.searchParams.set("api_key", apiKey);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });
    const result: SourceEndpointDebug = {
      attempted: true,
      ok: response.ok,
      status: response.status
    };

    if (!response.ok) {
      result.message = await response.text().then((body) => body.slice(0, 160)).catch(() => "");
      return result;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = payload[collectionKey];
    result.itemCount = Array.isArray(items) ? items.length : 0;
    return result;
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      message: error instanceof Error ? error.message : "Unknown Sportradar request error."
    };
  }
}

export async function getSportradarSeasonDebug(): Promise<SourceSeasonDebugResult> {
  const accessLevel = process.env.SPORTRADAR_ACCESS_LEVEL?.trim() || "trial";
  const languageCode = process.env.SPORTRADAR_LANGUAGE_CODE?.trim() || "en";
  const apiKey = process.env.SPORTRADAR_API_KEY?.trim();
  const competitionId = process.env.SPORTRADAR_WORLD_CUP_COMPETITION_ID?.trim() || DEFAULT_WORLD_CUP_COMPETITION_ID;
  const seasonId = process.env.SPORTRADAR_WORLD_CUP_SEASON_ID?.trim() || DEFAULT_WORLD_CUP_SEASON_ID;
  const baseUrl = `https://api.sportradar.com/soccer/${accessLevel}/v4/${languageCode}`;

  const result: SourceSeasonDebugResult = {
    configured: {
      apiKey: Boolean(apiKey),
      accessLevel,
      languageCode,
      competitionId: Boolean(competitionId),
      seasonId: Boolean(seasonId)
    },
    seasons: {
      attempted: false,
      ok: false,
      candidates: []
    },
    competitions: {
      attempted: false,
      ok: false,
      candidates: []
    },
    hint: "Default FIFA World Cup IDs are built in. Override them only if Sportradar changes the catalog or the app targets a different tournament."
  };

  if (!apiKey) {
    result.hint = "SPORTRADAR_API_KEY is not configured in the current deployment; the built-in World Cup IDs are ready.";
    return result;
  }

  const [seasonsResult, competitionsResult] = await Promise.all([
    fetchSportradarDebugEndpoint<{ seasons?: SportradarSeasonCandidate[] }>(
      `${baseUrl}/seasons.json`,
      apiKey
    ),
    fetchSportradarDebugEndpoint<{ competitions?: SportradarCompetitionCandidate[] }>(
      `${baseUrl}/competitions.json`,
      apiKey
    )
  ]);

  result.seasons.attempted = true;
  result.seasons.endpoint = `${baseUrl}/seasons.json`;
  result.seasons.status = seasonsResult.status;
  result.seasons.ok = seasonsResult.ok;
  result.seasons.message = seasonsResult.message;
  if (seasonsResult.payload?.seasons) {
    result.seasons.itemCount = seasonsResult.payload.seasons.length;
    result.seasons.candidates = seasonsResult.payload.seasons
      .filter((item) => isWorldCupCandidate([item.name, item.year, item.competition_id].join(" ")))
      .slice(0, 80);
  }

  result.competitions.attempted = true;
  result.competitions.endpoint = `${baseUrl}/competitions.json`;
  result.competitions.status = competitionsResult.status;
  result.competitions.ok = competitionsResult.ok;
  result.competitions.message = competitionsResult.message;
  if (competitionsResult.payload?.competitions) {
    result.competitions.itemCount = competitionsResult.payload.competitions.length;
    result.competitions.candidates = competitionsResult.payload.competitions
      .filter((item) => isWorldCupCandidate([item.name, item.category?.name].join(" ")))
      .slice(0, 80);
  }

  if (!result.seasons.candidates.length && !result.competitions.candidates.length) {
    result.hint = "This Sportradar key can connect, but the trial feed did not expose a FIFA World Cup final-tournament season candidate. Use qualification IDs only if the app should show qualifiers, or ask Sportradar support to confirm World Cup 2026 Soccer API entitlement.";
  }

  return result;
}

function isWorldCupSchedule(schedule: unknown) {
  const text = JSON.stringify(schedule).toLowerCase();
  return text.includes("world cup") || text.includes("fifa");
}

function isWorldCupCandidate(value: string) {
  const text = value.toLowerCase();
  return text.includes("world cup") || text.includes("fifa") || /\bwc\b/.test(text);
}

async function fetchSportradarDebugEndpoint<T>(endpoint: string, apiKey: string) {
  const url = new URL(endpoint);
  url.searchParams.set("api_key", apiKey);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const message = await response.text().then((body) => body.slice(0, 240)).catch(() => "");
      console.error("[sportradar-season-debug]", response.status, message);
      return { ok: false, status: response.status, message, payload: undefined as T | undefined };
    }

    return { ok: true, status: response.status, payload: (await response.json()) as T };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Sportradar request error.";
    console.error("[sportradar-season-debug]", message);
    return { ok: false, message, payload: undefined as T | undefined };
  }
}
