const http = require("node:http");

const PORT = Number(process.env.PORT || 9000);
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 7000);
const WORLDCUP26 = "https://worldcup26.ir";
const STATS_FIXTURES = "https://www.thestatsapi.com/world-cup/data/fixtures.json";
const { createSportsService } = require("./sports-service");
const { auditDraftEvidence, calculateEvidenceRiskScore, hasCompleteReview, finalizeReviewRiskScore } = require("./evidence");
const { reviewRisk } = require("./risk");
const { auditHotDraft, normalizeHotAudit, addHotDraftVisualAnchors } = require("./hot-workflow");
const { buildCreativeBrief, hasDistinctTopicAngles, isCompleteHotTopicDraft } = require("./creative");
const { isConcreteAiRisk } = require("./review-policy");
const { createAiRequestGuard, buildAiRequestKey } = require("./ai-guard");
const { buildHotTopicAiFingerprint } = require("./hot-ai-cache");
const { normalizeHotAnalysis } = require("./hot-analysis");
const aiRequestGuard = createAiRequestGuard(process.env);
const sportsService = createSportsService();
const API_VERSION = "direct-v6.3.2-default-ai";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

async function fetchJson(url, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      redirect: "follow"
    });
    if (!response.ok) throw new Error(`${url} -> ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function payload(sourceStatus, data, message) {
  return { sourceStatus, data, lastUpdated: nowIso(), ...(message ? { message } : {}) };
}

function safeNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function inferStatus(kickoff) {
  const ts = Date.parse(kickoff || "");
  if (!Number.isFinite(ts)) return "scheduled";
  const diff = Date.now() - ts;
  if (diff < -2 * 60 * 60 * 1000) return "scheduled";
  if (diff <= 3 * 60 * 60 * 1000) return "live";
  return "finished";
}

function stageLabel(type, matchday) {
  const labels = {
    "group-stage": "Group Stage",
    group: matchday ? `Group Stage - ${matchday}` : "Group Stage",
    r32: "Round of 32",
    r16: "Round of 16",
    qf: "Quarter-finals",
    sf: "Semi-finals",
    third: "Third-place match",
    final: "Final"
  };
  return labels[type || ""] || type || "World Cup 2026";
}

function normalizeWorldCup26Game(game, stadiumMap) {
  const homeName = game.home_team_name_en || game.home_team_label || "TBD";
  const awayName = game.away_team_name_en || game.away_team_label || "TBD";
  const homeScore = safeNum(game.home_score);
  const awayScore = safeNum(game.away_score);
  const stadium = stadiumMap.get(String(game.stadium_id || "")) || {};
  const kickoffTime = normalizeLocalDate(game.local_date);
  const elapsed = String(game.time_elapsed || "").toLowerCase();
  let status = inferStatus(kickoffTime);
  if (game.finished === "TRUE" || elapsed === "finished") status = "finished";
  else if (elapsed && !["notstarted", "not_started", "0"].includes(elapsed)) status = "live";
  const trusted = status !== "scheduled" && homeScore !== null && awayScore !== null;

  return {
    id: `wc26-${game.id || ""}`,
    sportType: "football",
    competition: "FIFA World Cup 2026",
    season: 2026,
    round: stageLabel(game.type, game.matchday),
    ...(game.group ? { group: `Group ${game.group}` } : {}),
    kickoffTime,
    status,
    statusText: status === "finished" ? "Match Finished" : status === "live" ? `Live ${game.time_elapsed || ""}`.trim() : "Scheduled",
    homeTeam: { ...(safeNum(game.home_team_id) !== null ? { id: safeNum(game.home_team_id) } : {}), name: homeName },
    awayTeam: { ...(safeNum(game.away_team_id) !== null ? { id: safeNum(game.away_team_id) } : {}), name: awayName },
    score: {
      home: trusted ? homeScore : null,
      away: trusted ? awayScore : null,
      ...(trusted ? { fulltime: `${homeScore}-${awayScore}` } : {}),
      display: status === "scheduled" ? "vs" : trusted ? `${homeScore}-${awayScore}` : "待补比分"
    },
    venue: {
      ...(safeNum(stadium.id) !== null ? { id: safeNum(stadium.id) } : {}),
      ...(stadium.fifa_name || stadium.name_en ? { name: stadium.fifa_name || stadium.name_en } : {}),
      ...([stadium.city_en, stadium.country_en].filter(Boolean).length
        ? { city: [stadium.city_en, stadium.country_en].filter(Boolean).join(", ") }
        : {})
    },
    events: [],
    statistics: [
      { team: homeName, values: [{ type: "Goals", value: trusted ? homeScore : null }, { type: "Data Coverage", value: "worldcup26-free" }] },
      { team: awayName, values: [{ type: "Goals", value: trusted ? awayScore : null }, { type: "Data Coverage", value: "worldcup26-free" }] }
    ],
    source: { provider: "worldcup26-free", league: 1, season: 2026 },
    lastUpdated: nowIso()
  };
}

function normalizeLocalDate(value) {
  if (!value) return "";
  const m = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) return String(value);
  const [, month, day, year, hour, minute] = m;
  return `${year}-${month}-${day}T${hour}:${minute}:00-04:00`;
}

function normalizeStatsFixture(f) {
  const home = f.homeTeam || "TBD";
  const away = f.awayTeam || "TBD";
  const kickoff = f.kickoffUtc || f.date || "";
  const status = inferStatus(kickoff);
  return {
    id: `wc26-${f.matchNumber || ""}`,
    sportType: "football",
    competition: "FIFA World Cup 2026",
    season: 2026,
    round: stageLabel(f.stage),
    ...(f.group ? { group: `Group ${f.group}` } : {}),
    kickoffTime: kickoff,
    status,
    statusText: status === "scheduled" ? "Scheduled" : status === "live" ? "Live" : "Match Finished",
    homeTeam: { name: home },
    awayTeam: { name: away },
    score: { home: null, away: null, display: status === "scheduled" ? "vs" : "待补比分" },
    venue: { ...(f.stadium ? { name: f.stadium } : {}), ...(f.hostCity ? { city: f.hostCity } : {}) },
    events: [],
    statistics: [
      { team: home, values: [{ type: "Goals", value: null }, { type: "Data Coverage", value: "thestatsapi-fixtures" }] },
      { team: away, values: [{ type: "Goals", value: null }, { type: "Data Coverage", value: "thestatsapi-fixtures" }] }
    ],
    source: { provider: "thestatsapi-fixtures", league: 1, season: 2026 },
    lastUpdated: nowIso()
  };
}

const classicFallback = [{
  id: "argentina-france-2022-final",
  sportType: "football",
  competition: "FIFA World Cup",
  season: 2022,
  round: "Final",
  kickoffTime: "2022-12-18T15:00:00Z",
  status: "finished",
  statusText: "Match Finished",
  homeTeam: { name: "Argentina" },
  awayTeam: { name: "France" },
  score: { home: 3, away: 3, fulltime: "3-3", penalty: "4-2", display: "3-3 (pens 4-2)" },
  venue: { name: "Lusail Stadium", city: "Lusail, Qatar" },
  events: [],
  statistics: [],
  source: { provider: "mock", league: 1, season: 2022 },
  lastUpdated: nowIso()
}];

async function loadFreeFixtures() {
  const errors = [];
  try {
    const [gamesData, stadiumData] = await Promise.all([
      fetchJson(`${WORLDCUP26}/get/games`),
      fetchJson(`${WORLDCUP26}/get/stadiums`).catch(() => ({ stadiums: [] }))
    ]);
    const games = Array.isArray(gamesData.games) ? gamesData.games : [];
    if (games.length) {
      const sm = new Map((stadiumData.stadiums || []).map(s => [String(s.id || ""), s]));
      return payload("live", games.map(g => normalizeWorldCup26Game(g, sm)));
    }
    errors.push("worldcup26 returned no games");
  } catch (e) {
    errors.push(`worldcup26: ${e && e.message ? e.message : String(e)}`);
  }

  try {
    const data = await fetchJson(STATS_FIXTURES);
    const fixtures = Array.isArray(data.fixtures) ? data.fixtures : [];
    if (fixtures.length) return payload("live", fixtures.map(normalizeStatsFixture), errors.join(" | "));
    errors.push("thestatsapi returned no fixtures");
  } catch (e) {
    errors.push(`thestatsapi: ${e && e.message ? e.message : String(e)}`);
  }

  return payload("fallback", classicFallback, errors.join(" | "));
}

let freeFixturesCache, freeFixturesPending;
async function cachedFreeFixtures() {
  if (freeFixturesCache && Date.now() - freeFixturesCache.at < (freeFixturesCache.result.sourceStatus === "fallback" ? 30000 : 300000)) {
    return { ...freeFixturesCache.result, sourceStatus: freeFixturesCache.result.sourceStatus === "fallback" ? "fallback" : "cache" };
  }
  if (freeFixturesPending) return freeFixturesPending;
  freeFixturesPending = (async () => {
    try {
      const result = await loadFreeFixtures();
      if (result.sourceStatus === "fallback" && freeFixturesCache?.result.sourceStatus === "live" && Date.now() - freeFixturesCache.at <= 1800000) {
        return { ...freeFixturesCache.result, sourceStatus: "cache", stale: true, message: "Using the last successful free-source snapshot." };
      }
      freeFixturesCache = { result, at: Date.now() };
      return result;
    } finally { freeFixturesPending = undefined; }
  })();
  return freeFixturesPending;
}

async function loadFixtures() {
  const result = await sportsService.load("fixtures");
  if (result.sourceStatus !== "error") return result;
  const fallback = await cachedFreeFixtures();
  return { ...fallback, diagnostics: result.diagnostics };
}

function beijingDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(value);
  const get = t => parts.find(p => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateKeyFromString(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : beijingDateKey(d);
}

async function handleWorldCup(url, res) {
  const pathname = url.pathname;
  if (pathname === "/api/worldcup/health") {
    return json(res, 200, { ok: true, version: API_VERSION, ...sportsService.health() });
  }
  if (pathname === "/api/worldcup/fixtures") {
    return json(res, 200, await loadFixtures());
  }
  if (pathname === "/api/worldcup/fixtures/today") {
    const key = url.searchParams.get("date") || beijingDateKey();
    const date = new Date(`${key}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key) {
      return json(res, 400, payload("error", [], "Use a valid date in YYYY-MM-DD format."));
    }
    const result = await sportsService.load("today", key);
    if (result.sourceStatus !== "error") return json(res, 200, result);
    const p = await cachedFreeFixtures();
    return json(res, 200, { ...p, diagnostics: result.diagnostics, data: p.data.filter(m => dateKeyFromString(m.kickoffTime) === key) });
  }
  if (pathname === "/api/worldcup/live") {
    const result = await sportsService.load("live");
    if (result.sourceStatus !== "error") return json(res, 200, result);
    const p = await cachedFreeFixtures();
    return json(res, 200, { ...p, diagnostics: result.diagnostics, data: p.data.filter(m => m.status === "live") });
  }
  if (pathname.startsWith("/api/worldcup/matches/")) {
    const id = decodeURIComponent(pathname.slice("/api/worldcup/matches/".length));
    if (/^sr:sport_event:\d+$/.test(id)) {
      const result = await sportsService.load("match", id);
      if (result.sourceStatus !== "error") return json(res, 200, result);
      const fixtures = await loadFixtures();
      const match = Array.isArray(fixtures.data) && fixtures.data.find(m => m.id === id);
      return json(res, match ? 200 : 503, match ? { ...fixtures, data: match, detailUnavailable: true, diagnostics: result.diagnostics } : result);
    }
    if (id === "argentina-france-2022-final") return json(res, 200, payload("fallback", classicFallback[0], "Historical demo sample."));
    const p = await loadFixtures();
    const match = p.data.find(m => m.id === id);
    return match ? json(res, 200, { ...p, data: match }) : json(res, 404, payload("error", null, `Fixture ${id} not found.`));
  }
  if (pathname === "/api/worldcup/standings") {
    const result = await sportsService.load("standings");
    if (result.sourceStatus !== "error") return json(res, 200, result);
    try {
      const groups = await fetchJson(`${WORLDCUP26}/get/groups`);
      return json(res, 200, payload("live", groups.groups || []));
    } catch (e) {
      return json(res, 200, payload("fallback", [], e && e.message ? e.message : String(e)));
    }
  }
  return false;
}


const UAPI_HOTBOARD = "https://uapis.cn/api/v1/misc/hotboard";
const { createSources } = require("./hot-sources");
const supplementalSources = createSources();
const HOT_CACHE_TTL_MS = 60000;
const hotPlatformCache = new Map();
const hotPlatformPending = new Map();
const hotPlatformDiagnostics = new Map();
const FOOTBALL_RE = /(足球|国足|世界杯|world\s*cup|欧冠|亚冠|英超|西甲|意甲|德甲|法甲|中超|世俱杯|FIFA|football|soccer|梅西|C罗|姆巴佩|哈兰德|皇马|巴萨|曼联|曼城|阿森纳|利物浦|拜仁)/i;
const OTHER_SPORT_RE = /(NBA|CBA|篮球|湖人|勇士|网球|羽毛球|乒乓球|F1|赛车|排球|游泳|电竞|王者荣耀|英雄联盟)/i;
function isFootball(text) {
  return FOOTBALL_RE.test(text) && !OTHER_SPORT_RE.test(text);
}

function hotHealth() {
  return {
    ok: true,
    version: API_VERSION,
    searchMode: "multi-source-search",
    cacheTtlSeconds: HOT_CACHE_TTL_MS / 1000,
    providers: [
      { provider: "uapi", status: "integrated", platforms: HOT_SOURCE_TYPES.map(platform => ({
        platform,
        ...(hotPlatformDiagnostics.get(platform) || { status: "not-checked" }),
      })) },
      ...supplementalSources.health(),
    ],
  };
}
const HOT_PLATFORM_LABELS = {
  weibo: "微博",
  bilibili: "B站",
  douyin: "抖音",
  xiaohongshu: "小红书",
  zhihu: "知乎",
  baidu: "百度",
  toutiao: "头条",
  hupu: "虎扑"
};
const HOT_SOURCE_TYPES = ["weibo", "bilibili", "douyin", "xiaohongshu", "zhihu", "baidu", "toutiao", "hupu"];
const SPORTS_RE = /(世界杯|足球|国足|国家队|球员|球队|进球|点球|欧冠|亚冠|英超|西甲|意甲|德甲|法甲|中超|世俱杯|FIFA|football|soccer|match|梅西|C罗|姆巴佩|哈兰德|皇马|巴萨|曼联|曼城|阿森纳|利物浦|拜仁|巴黎|湖人|勇士|NBA|CBA|网球|羽毛球|乒乓球|F1|赛车|奥运|体育)/i;

function hotStableId(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return `uapi-hot-${Math.abs(hash)}`;
}

function hotArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.list)) return raw.list;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && raw.data && Array.isArray(raw.data.list)) return raw.data.list;
  if (raw && Array.isArray(raw.data)) return raw.data;
  return null;
}

function normalizeHotItem(item, platform, index, updatedAt) {
  const title = String(item?.title ?? item?.name ?? item?.word ?? item?.keyword ?? "").trim();
  if (!title) return null;
  const hot = item?.hot_value ?? item?.hot ?? item?.heat ?? item?.score ?? item?.view ?? undefined;
  let url;
  try {
    const parsed = new URL(String(item?.url ?? item?.link ?? item?.href ?? "").trim());
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    url = parsed.href;
  } catch { return null; }
  const rankRaw = Number(item?.index ?? item?.rank ?? index + 1);
  const rank = Number.isFinite(rankRaw) ? rankRaw : index + 1;
  const label = HOT_PLATFORM_LABELS[platform] || platform;
  const hotNumber = typeof hot === "number" ? hot : Number(String(hot ?? "").replace(/[^\d.]/g, ""));
  const valueScore = Math.max(1, Math.min(100, Math.round(94 - Math.min(rank - 1, 20) * 3 + (isFootball(title) ? 8 : 0))));
  return {
    id: hotStableId(`${platform}:${url || title}`),
    title,
    summary: title,
    url,
    source: label,
    provider: "uapi",
    platform: label,
    rank,
    ...(hot !== undefined ? { heat: hot, hot } : {}),
    fetchedAt: nowIso(),
    sourceUpdatedAt: updatedAt,
    relevance: isFootball(title) ? 92 : 45,
    category: isFootball(title) ? (/世界杯|FIFA/i.test(title) ? "世界杯" : "足球") : "泛热点",
    valueLevel: valueScore >= 75 ? "high" : valueScore >= 50 ? "medium" : "low",
    valueScore,
    tags: isFootball(title) ? ["足球热点", label] : [label],
    rankingMethod: "heuristic"
  };
}

async function fetchHotPlatform(platform) {
  if (!HOT_SOURCE_TYPES.includes(platform)) throw new Error("Unsupported platform");
  const cached = hotPlatformCache.get(platform);
  if (cached && Date.now() - cached.fetchedAt < HOT_CACHE_TTL_MS) return { ...cached, cached: true };
  if (hotPlatformPending.has(platform)) return hotPlatformPending.get(platform);
  const pending = (async () => {
    try {
      const raw = await fetchJson(`${UAPI_HOTBOARD}?type=${encodeURIComponent(platform)}`, 7000);
      if (!raw || typeof raw !== "object" || raw.success === false || (typeof raw.code === "number" && ![0, 200].includes(raw.code))) throw new Error("Invalid provider response");
      const rows = hotArray(raw);
      if (!Array.isArray(rows)) throw new Error("Invalid provider response");
      const checkedAt = nowIso();
      const items = rows.slice(0, 100).map((item, index) => normalizeHotItem(item, platform, index, raw?.update_time)).filter(Boolean);
      const result = { items, fetchedAt: Date.now(), checkedAt, cached: false };
      hotPlatformCache.set(platform, result);
      hotPlatformDiagnostics.set(platform, { status: items.length ? "success" : "empty", count: items.length, checkedAt });
      return result;
    } catch (error) {
      hotPlatformDiagnostics.set(platform, { status: error?.name === "AbortError" ? "timeout" : "failed", count: 0, checkedAt: nowIso() });
      throw new Error("Hot provider request failed");
    } finally {
      hotPlatformPending.delete(platform);
    }
  })();
  hotPlatformPending.set(platform, pending);
  return pending;
}

function hotSourceTypes(source) {
  if (!source || source === "all") return HOT_SOURCE_TYPES;
  const aliases = {
    weibo: "weibo", 微博: "weibo",
    bilibili: "bilibili", b站: "bilibili", B站: "bilibili",
    douyin: "douyin", 抖音: "douyin",
    xiaohongshu: "xiaohongshu", 小红书: "xiaohongshu",
    zhihu: "zhihu", 知乎: "zhihu",
    baidu: "baidu", 百度: "baidu",
    toutiao: "toutiao", 头条: "toutiao",
    hupu: "hupu", 虎扑: "hupu"
  };
  return [aliases[source] || source];
}

function dedupeHot(items) {
  const seen = new Map();
  for (const item of items) {
    let key = String(item.title).toLowerCase().replace(/\s+/g, "");
    if (item.url) {
      try {
        const url = new URL(item.url);
        url.hash = "";
        for (const name of [...url.searchParams.keys()]) if (/^(utm_|spm$)/i.test(name)) url.searchParams.delete(name);
        key = url.href;
      } catch { continue; }
    }
    if (!key) continue;
    const existing = seen.get(key);
    if (existing) {
      existing.providers = [...new Set([...existing.providers, item.provider])];
      continue;
    }
    seen.set(key, { ...item, providers: [item.provider] });
  }
  return [...seen.values()];
}

function matchesQuery(text, query) {
  const generic = /^(世界杯|足球|赛事|比赛|体育|男足|女足|fifa|world|cup|football|soccer|vs|vs\.|v|(?:19|20)\d{2})$/i;
  const aliases = [
    ["阿根廷", "argentina"], ["法国", "france"], ["西班牙", "spain"], ["巴西", "brazil"],
    ["葡萄牙", "portugal"], ["英格兰", "england"], ["德国", "germany"], ["日本", "japan"],
    ["约旦", "jordan"], ["韩国", "south korea"], ["梅西", "messi"], ["姆巴佩", "mbappe", "mbappé"],
  ];
  let remainder = query.toLowerCase();
  const groups = [];
  for (const group of aliases) {
    if (group.some(term => remainder.includes(term))) {
      groups.push(group);
      for (const term of group) remainder = remainder.replaceAll(term, " ");
    }
  }
  groups.push(...remainder.split(/(?:对阵|对战|[\s,，、|])+/).filter(token => token && !generic.test(token)).map(token => [token]));
  const lower = text.toLowerCase();
  return !groups.length || groups.some(group => group.some(term => lower.includes(term)));
}

function balancePlatforms(items, limit) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.platform)) groups.set(item.platform, []);
    groups.get(item.platform).push(item);
  }
  const result = [];
  while (result.length < limit) {
    let added = false;
    for (const group of groups.values()) {
      if (group.length && result.length < limit) { result.push(group.shift()); added = true; }
    }
    if (!added) break;
  }
  return result;
}

async function loadHotTopics({ source = "all", scope = "sports", limit = 20, query = "" } = {}) {
  query = String(query).trim().replace(/\s+/g, " ").slice(0, 300);
  const types = hotSourceTypes(source);
  const redfoxConfigured = supplementalSources.health().find(item => item.provider === "redfox").configured;
  const uapiTypes = types.filter(platform => platform !== "xiaohongshu" || !redfoxConfigured);
  const extraTasks = [];
  if (types.includes("xiaohongshu")) extraTasks.push(supplementalSources.redfox());
  if (query) {
    extraTasks.push(supplementalSources.search("tavily", query), supplementalSources.search("tophubdata", query));
    for (const platform of types.filter(item => item !== "xiaohongshu")) extraTasks.push(supplementalSources.daily(platform));
  }
  const [settled, extra] = await Promise.all([
    Promise.allSettled(uapiTypes.map(fetchHotPlatform)), Promise.all(extraTasks),
  ]);
  if (!query) {
    const failedPlatforms = uapiTypes.filter((platform, index) => settled[index].status === "rejected" && platform !== "xiaohongshu");
    extra.push(...await Promise.all(failedPlatforms.map(platform => supplementalSources.daily(platform))));
  }
  const successful = settled.filter(r => r.status === "fulfilled").map(r => r.value);
  const extraSuccessful = extra.filter(result => ["success", "empty"].includes(result.status));
  let items = [...successful, ...extraSuccessful].flatMap(result => result.items);
  const failures = settled.filter(r => r.status === "rejected").length + extra.filter(result => !["success", "empty", "not-configured", "unsupported"].includes(result.status)).length;

  if (query) {
    items = items.filter(item => {
      const text = `${item.title} ${item.summary || ""}`.toLowerCase();
      return isFootball(text) && matchesQuery(text, query);
    });
  } else if (scope === "sports" || scope === "football") {
    items = items.filter(item => isFootball(`${item.title} ${item.summary || ""}`));
  }

  items = balancePlatforms(dedupeHot(items)
    .sort((a, b) => (b.valueScore || 0) - (a.valueScore || 0) || (a.rank || 999) - (b.rank || 999)),
    Math.max(1, Math.min(Number(limit) || 20, 50)));

  const allSuccessful = [...successful, ...extraSuccessful];
  const status = !allSuccessful.length ? "error" : failures ? "partial" : allSuccessful.every(result => result.cached) ? "cache" : "live";
  const message = items.length
    ? (failures ? `${failures} 个来源请求失败，其余结果可用。` : status === "cache" ? "已读取缓存热点。" : "热点来源已更新。")
    : allSuccessful.length ? "来源已读取，暂无匹配的足球热点。" : "热点源请求失败，请稍后重试。";
  return {
    ...payload(status, items, message),
    lastUpdated: allSuccessful.length ? new Date(Math.max(...allSuccessful.map(result => result.fetchedAt || Date.parse(result.checkedAt)))).toISOString() : nowIso(),
    searchMode: extraSuccessful.some(result => ["tavily", "tophubdata"].includes(result.provider)) ? "multi-source-search" : "hotboard-filter",
    matchScope: query ? "team-related" : "football",
    diagnostics: [...uapiTypes.map(platform => ({ provider: "uapi", platform,
      ...(hotPlatformDiagnostics.get(platform) || { status: "unsupported", count: 0 }),
    })), ...extra.map(({ items: sourceItems, ...diagnostic }) => ({ ...diagnostic, count: sourceItems.length }))],
  };
}

async function handleHot(url, res) {
  if (url.pathname === "/api/hot/health") return json(res, 200, hotHealth());
  const source = url.searchParams.get("source") || "all";
  const scope = url.searchParams.get("scope") || "sports";
  const limit = Number(url.searchParams.get("limit") || 20);
  if (url.pathname === "/api/hot") {
    return json(res, 200, await loadHotTopics({ source, scope, limit }));
  }
  if (url.pathname === "/api/hot/search") {
    const q = url.searchParams.get("q") || "";
    if (!q.trim() || q.length > 300) return json(res, 400, payload("error", [], "Query must contain 1-300 characters."));
    return json(res, 200, await loadHotTopics({ source: "all", scope: "all", limit, query: q }));
  }
  return false;
}


const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";

async function readJsonBody(req) {
  const limit = 256 * 1024;
  const invalid = (statusCode, message) => Object.assign(new Error(message), { statusCode });
  if (Number(req.headers?.["content-length"]) > limit) {
    req.resume();
    throw invalid(413, "Request body is too large.");
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    const fail = error => { rejected = true; chunks.length = 0; reject(error); };
    req.on("data", chunk => {
      if (rejected) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > limit) return fail(invalid(413, "Request body is too large."));
      chunks.push(buffer);
    });
    req.once("end", () => {
      if (rejected) return;
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        const body = text ? JSON.parse(text) : {};
        if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid(400, "JSON object required.");
        resolve(body);
      } catch { fail(invalid(400, "Valid JSON object required.")); }
    });
    req.once("error", () => fail(invalid(400, "Request body could not be read.")));
    req.once("aborted", () => fail(invalid(400, "Request was aborted.")));
  });
}

async function callDeepSeekJson(messages, options = {}) {
  const apiKey = String(options.apiKey || process.env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey) return { ok: false, message: "DEEPSEEK_API_KEY is not configured." };

  const model = String(options.model || process.env.DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL_FAST || DEFAULT_DEEPSEEK_MODEL).trim();

  if (JSON.stringify(messages).length > 64000) return { ok: false, message: "AI_INPUT_LIMIT：输入内容过长，请缩小素材范围。" };
  async function performRequest({ jsonMode }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 24000));

    try {
      const requestMessages = jsonMode
        ? messages
        : [
            ...messages,
            {
              role: "system",
              content:
                "上一轮 JSON 模式可能返回空内容。本轮请直接输出一个完整 JSON 对象，不要 Markdown，不要代码围栏，不要解释。"
            }
          ];

      const requestBody = {
        model,
        messages: requestMessages,
        stream: false,
        max_tokens: Math.max(1, Math.min(4096, Number(options.maxTokens || 4096))),
        thinking: { type: "disabled" },
        ...(jsonMode ? { response_format: { type: "json_object" } } : {})
      };

      const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          message: data?.error?.message || `DeepSeek request failed with ${response.status}.`,
          finishReason: data?.choices?.[0]?.finish_reason
        };
      }

      const choice = data?.choices?.[0];
      const content = choice?.message?.content;
      if (!content || !String(content).trim()) {
        return {
          ok: false,
          empty: true,
          message: "DeepSeek returned empty content.",
          finishReason: choice?.finish_reason
        };
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        const start = content.indexOf("{");
        const end = content.lastIndexOf("}");
        if (start < 0 || end <= start) {
          return {
            ok: false,
            message: "DeepSeek returned non-JSON content.",
            finishReason: choice?.finish_reason
          };
        }
        parsed = JSON.parse(content.slice(start, end + 1));
      }

      return { ok: true, data: parsed, model, finishReason: choice?.finish_reason };
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, message: "AI request timed out." };
      return { ok: false, message: error?.message || String(error) };
    } finally {
      clearTimeout(timer);
    }
  }

  async function requestOnce({ jsonMode }) {
    const key = buildAiRequestKey(apiKey, { model, jsonMode, maxTokens: options.maxTokens || 4096,
      input: options.cacheKey || messages });
    return aiRequestGuard.run(key, () => performRequest({ jsonMode }), options.cacheTtlMs || 0);
  }

  // DeepSeek documents that JSON Output can occasionally return empty content.
  // First use native JSON mode; if it comes back empty, retry once without
  // response_format while still demanding strict JSON in the prompt.
  const first = await requestOnce({ jsonMode: true });
  if (first.ok || !first.empty) return first;

  const second = await requestOnce({ jsonMode: false });
  if (second.ok) return second;

  return {
    ok: false,
    message: `DeepSeek returned empty JSON output, and retry failed: ${second.message}`
  };
}

function topicFallbackIntro(topic) {
  const platform = topic?.platform || topic?.source || "公开平台";
  const heat = topic?.heat ? `，热度 ${topic.heat}` : "";
  return `该热点围绕“${topic?.title || "当前话题"}”在${platform}出现讨论${heat}。当前可确认的是公开热榜信号，具体比赛事实仍需以可靠来源核验。`;
}

function topicFallbackAnalysis(topic) {
  const score = Number.isFinite(Number(topic?.valueScore)) ? Number(topic.valueScore) : 60;
  const platform = topic?.platform || topic?.source || "公开平台";
  const high = score >= 75;
  return {
    overview: [
      { label: "价值判断", value: high ? "高价值" : "可观察", note: `当前价值分 ${score}，优先判断赛事关联和可转化空间。` },
      { label: "核心原因", value: topic?.category || "体育热点", note: `来自${platform}，已有公开讨论信号。` },
      { label: "选题抓手", value: "热点转赛事内容", note: `从“${topic?.title || "当前话题"}”切入，回到可核验事实。` }
    ],
    production: [
      { label: "主推平台", value: platform === "B站" ? "B站" : "微博", note: "先用轻量内容验证热度，再扩展深度内容。" },
      { label: "最适合产物", value: "选题 + 短文案", note: "适合快速验证内容价值。" },
      { label: "发布边界", value: "先核验再发", note: "比分、伤病、判罚和官方结论必须有可靠来源。" }
    ],
    whyCare: ["已有公开热榜信号，可以作为选题入口。"],
    relation: ["需要把热点重新连接到世界杯、球队、球员或比赛事实。"],
    angles: [`从“${topic?.title || "当前话题"}”切入做事件解释或球迷讨论。`],
    platforms: ["微博：承接即时讨论", "B站：做事件复盘", "抖音：做短视频钩子"],
    factsToVerify: ["核验来源链接、涉及人物和比赛事实。"],
    risks: ["避免把网友讨论写成官方结论。"]
  };
}

function fallbackHotDraft(topic, config) {
  const platform = config?.platform || "通用";
  const title = topic?.title || "当前热点";
  if (config?.contentType === "选题") {
    return [
      `1. 事件脉络：${title}\n怎么做：梳理公开信息时间线。\n说明：先讲事实，再解释为什么会热。`,
      `2. 球迷讨论：${title}\n怎么做：提炼一个具体争议点邀请讨论。\n说明：避免引战和绝对化判断。`,
      `3. 数据切入：${title}\n怎么做：只使用已有热度、排名或比赛数据。\n说明：不补写未提供的数据。`,
      `4. 平台二创：${title}\n怎么做：按${platform}用户习惯设计轻量表达。\n说明：二创表达与真实事实分开。`,
      `5. 风险核验：${title}\n怎么做：列出发布前必须确认的事实。\n说明：伤病、判罚、比分和官方结论优先核验。`
    ].join("\n\n");
  }
  if (config?.contentType === "标题") {
    return [`1. ${title}：这条热点真正值得关注的是什么？`,`2. 从${title}看当下赛事讨论`,`3. ${title}背后的比赛信息怎么读`,`4. ${title}为什么突然升温`,`5. ${title}：先核验，再下结论`].join("\n");
  }
  return `⚽ ${title}\n\n这条热点已经出现公开讨论。先确认来源和具体事实，再根据${platform}的内容节奏做信息拆解。\n\n💬 你更关注事件本身，还是它对比赛内容传播的影响？`;
}

async function handleAiHotTopic(req, res) {
  const body = await readJsonBody(req);
  const topic = body?.topic;
  if (!topic) return json(res, 400, { sourceStatus: "error", message: "topic is required." });

  const fallback = topicFallbackAnalysis(topic);
  const intro = topicFallbackIntro(topic);
  const result = await callDeepSeekJson([
    {
      role: "system",
      content: [
        "你是体育内容运营编辑总监，只输出严格 JSON，不要 Markdown。",
        "只能依据输入热点的 title、summary、source、platform、valueScore、category、tags、url。",
        "不得编造比分、伤病、采访、判罚细节或官方结论。",
        "输出字段必须为 intro、overview、production、whyCare、relation、angles、platforms、factsToVerify、risks。",
        "overview 与 production 各 3 条，每条包含 label、value、note；其他数组各 1-2 条。",
        "intro 用 50-90 字说明发生了什么、为什么值得关注、哪些事实仍需核验。"
      ].join("\n")
    },
    { role: "user", content: JSON.stringify({ topic }) }
  ], { apiKey: body?.apiKey, timeoutMs: 24000, maxTokens: 1400,
    cacheTtlMs: 10 * 60000, cacheKey: `hot-topic-v2:${buildHotTopicAiFingerprint(topic)}` });

  if (!result.ok) {
    return json(res, 200, { sourceStatus: "fallback", intro, analysis: fallback, message: `AI 暂不可用，已使用本地规则：${result.message}` });
  }

  const d = result.data || {};
  const analysis = normalizeHotAnalysis(d, fallback);
  return json(res, 200, {
    sourceStatus: "live",
    intro: typeof d.intro === "string" && d.intro.trim() ? d.intro.trim() : intro,
    analysis,
    model: result.model
  });
}

async function handleAiHotWorkflow(req, res) {
  const body = await readJsonBody(req);
  const { action, topic, config, draft } = body || {};
  if (!action || !topic || !config) {
    return json(res, 400, { sourceStatus: "error", message: "action、topic、config 均为必填。" });
  }

  if (action === "generate") {
    const fallback = fallbackHotDraft(topic, config);
    const result = await callDeepSeekJson([
      {
        role: "system",
        content: [
          "你是体育赛事内容运营编辑，只输出严格 JSON，不要 Markdown。",
          "基于输入热点和配置生成中文内容，不得编造比分、伤病、采访、判罚或官方结论。",
          "不同平台按平台习惯写。若 contentType=选题，必须正好 5 个角度，每个包含“角度标题、怎么做、说明”。",
          "选题严格使用‘1. 标题\\n怎么做：...\\n说明：...’的三行结构，每项之间空一行。",
          "不能编造热搜、球员发言或心理活动；不使用 xG 或未提供的技术统计。",
          buildCreativeBrief({ chain: "hot", platform: config.platform, contentType: config.contentType, tone: config.tone, length: config.length }),
          "若为其他类型，只生成对应成品。最终只返回 {\"draft\":\"...\"}。"
        ].join("\n")
      },
      { role: "user", content: JSON.stringify({ topic, config }) }
    ], { apiKey: body?.apiKey, timeoutMs: 26000, maxTokens: 2600 });

    if (!result.ok) {
      return json(res, 200, { sourceStatus: "fallback", draft: fallback, message: `AI 暂不可用，已使用本地生成：${result.message}` });
    }
    const raw = typeof result.data?.draft === "string" ? result.data.draft.trim() : "";
    if (!raw || (config.contentType === "选题" && !isCompleteHotTopicDraft(raw))) {
      return json(res, 200, { sourceStatus: "fallback", draft: fallback, message: "AI 选题角度不完整或重复，已使用本地兜底。" });
    }
    const generated = addHotDraftVisualAnchors(raw, config);
    return json(res, 200, { sourceStatus: "live", draft: generated, model: result.model });
  }

  if (action === "audit") {
    if (!String(draft || "").trim()) return json(res, 400, { sourceStatus: "error", message: "draft is required for audit." });
    const fallback = auditHotDraft(draft, topic, config.platform, config.contentType);
    const result = await callDeepSeekJson([
      {
        role: "system",
        content: [
          "你是体育内容审稿编辑，只输出严格 JSON，不要 Markdown。",
          "只指出原稿中真实存在的问题，不要泛泛制造风险。",
          "选题、标题和创意提纲不是完整成品，不要求附画面、采访和完整引用。",
          "证据不足、素材未附、画面或版权授权未说明只写入 reminders，不等于事实错误，不影响通过。",
          "措辞风格、篇幅、互动设计和平台优化只作可选提醒，不判 revise 或 block。",
          "不要网暴、避免黑哨定性等反面提醒不是违规；只有明确数据矛盾或具体有害表达才需要修改。",
          "问题必须用引号逐字引用原稿，最多给两条不重复的可选提醒；不要求来源中没有的材料。",
          "输出字段：level、authenticity、risk、ethics、platformFit、suggestions、reminders、rewriteSuggestion。",
          "level 只能是 pass、revise、block。",
          "重点检查：未核验事实、比分、伤病、判罚、官方结论、造谣、引战、人身攻击、版权和平台不适配。",
          "没有问题时数组返回空数组，rewriteSuggestion 原样返回稿件。"
        ].join("\n")
      },
      { role: "user", content: JSON.stringify({ topic, config, draft }) }
    ], { apiKey: body?.apiKey, timeoutMs: 24000, maxTokens: 1500 });

    if (!result.ok) {
      return json(res, 200, { sourceStatus: "fallback", audit: fallback, message: `AI 暂不可用，已使用本地审稿：${result.message}` });
    }
    const audit = normalizeHotAudit(result.data, draft, fallback);
    return json(res, 200, { sourceStatus: "live", audit, model: result.model });
  }

  return json(res, 400, { sourceStatus: "error", message: "Unsupported workflow action." });
}


function matchAiText(value, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function matchAiList(value, fallback = [], max = 6) {
  if (!Array.isArray(value)) return fallback.slice(0, max);
  const list = value
    .map((item) => matchAiText(item))
    .filter(Boolean)
    .slice(0, max);
  return list.length ? list : fallback.slice(0, max);
}

function matchAiScore(value, fallback = 75) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeMatchTopic(topic, fallback, matchId, index) {
  const fb = fallback || {};
  const categories = ["战术复盘", "球员叙事", "数据解读", "历史对照", "争议讨论", "情绪共鸣", "冷知识科普", "平台热点"];
  const recommendations = ["主推", "次推", "观察", "谨慎发布"];
  const levels = ["低", "中", "高"];
  const category = categories.includes(topic?.category) ? topic.category : matchAiText(fb.category, "平台热点");
  const recommendation = recommendations.includes(topic?.recommendation) ? topic.recommendation : matchAiText(fb.recommendation, "观察");
  const difficulty = levels.includes(topic?.difficulty) ? topic.difficulty : matchAiText(fb.difficulty, "中");
  const productionCost = levels.includes(topic?.productionCost) ? topic.productionCost : matchAiText(fb.productionCost, "中");
  const riskLevel = levels.includes(topic?.riskLevel) ? topic.riskLevel : matchAiText(fb.riskLevel, "低");
  const sampleTitles = matchAiList(topic?.sampleTitles, Array.isArray(fb.sampleTitles) ? fb.sampleTitles : ["这场球别只看比分", "真正的转折在这里"], 4);

  return {
    id: `${matchId}-deepseek-${index + 1}`,
    title: matchAiText(topic?.title, matchAiText(fb.title, "比赛内容运营选题")),
    coreAngle: matchAiText(topic?.coreAngle, matchAiText(fb.coreAngle, "基于比赛事实和关键事件拆解内容角度。")),
    category,
    recommendation,
    newsValue: matchAiScore(topic?.newsValue, matchAiScore(fb.newsValue, 78)),
    spreadPotential: matchAiScore(topic?.spreadPotential, matchAiScore(fb.spreadPotential, 78)),
    platformFit: matchAiScore(topic?.platformFit, matchAiScore(fb.platformFit, 78)),
    bilibiliFit: matchAiScore(topic?.bilibiliFit, matchAiScore(fb.bilibiliFit, 80)),
    xiaohongshuFit: matchAiScore(topic?.xiaohongshuFit, matchAiScore(fb.xiaohongshuFit, 72)),
    weiboFit: matchAiScore(topic?.weiboFit, matchAiScore(fb.weiboFit, 80)),
    shortVideoFit: matchAiScore(topic?.shortVideoFit, matchAiScore(fb.shortVideoFit, 78)),
    recommendedFormat: matchAiText(topic?.recommendedFormat, matchAiText(fb.recommendedFormat, "B站复盘 + 微博讨论")),
    difficulty,
    productionCost,
    riskLevel,
    scoreReason: matchAiText(topic?.scoreReason, matchAiText(fb.scoreReason, "基于比赛事实、热点信号和平台适配综合判断。")),
    businessExplanation: matchAiText(topic?.businessExplanation, matchAiText(fb.businessExplanation, "适合转化为赛事内容运营产物。")),
    reason: matchAiText(topic?.reason, matchAiText(fb.reason, "基于当前比赛数据和热点信号生成。")),
    sampleTitles
  };
}

async function handleAiMatchWorkflow(req, res) {
  const body = await readJsonBody(req);
  const match = body?.match;
  const baselineTopics = Array.isArray(body?.baselineTopics) ? body.baselineTopics : [];

  if (!match || !baselineTopics.length) {
    return json(res, 400, {
      workflowVersion: "platform-content-v1",
      sourceStatus: "error",
      conclusions: [],
      topics: [],
      message: "match and baselineTopics are required."
    });
  }

  const fallbackTopics = baselineTopics.slice(0, 6);
  const result = await callDeepSeekJson([
    {
      role: "system",
      content: [
        "你是体育赛事内容运营总监，只输出严格 JSON，不要 Markdown。",
        "只基于输入比赛、关键事件、技术统计、热点信号和 baselineTopics。",
        "不得编造伤病、采访、内部矛盾、裁判动机、社媒热搜、球员发言或未给出的比分。",
        "如果 verifiedStats=false，不得引用 stats 中的数字作为真实比赛事实。",
        "输出 conclusions 3 条、topics 6 条。内容必须短、准、可执行。",
        "topics 要覆盖客观资讯、专业复盘、人物/情绪、数据或轻松二创等不同方法。",
        "所有文本字段必须是字符串，不能返回嵌套对象作为文本。",
        buildCreativeBrief({ chain: "match" })
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "增强单场比赛运营工作流。",
        outputShape: {
          conclusions: [
            { title: "事实摘要", body: "80字以内", featured: false },
            { title: "运营判断", body: "80字以内", featured: true },
            { title: "风险提醒", body: "80字以内", featured: false }
          ],
          topics: [{
            title: "选题标题",
            coreAngle: "一句话切入角度",
            category: "战术复盘/球员叙事/数据解读/历史对照/争议讨论/情绪共鸣/冷知识科普/平台热点",
            recommendation: "主推/次推/观察/谨慎发布",
            newsValue: 80,
            spreadPotential: 80,
            platformFit: 80,
            bilibiliFit: 80,
            xiaohongshuFit: 75,
            weiboFit: 80,
            shortVideoFit: 80,
            recommendedFormat: "推荐内容形式",
            difficulty: "低/中/高",
            productionCost: "低/中/高",
            riskLevel: "低/中/高",
            scoreReason: "评分原因",
            businessExplanation: "业务价值",
            reason: "事实依据",
            sampleTitles: ["标题1", "标题2"]
          }],
          platformStrategy: {
            bilibili: "B站打法",
            weibo: "微博打法",
            xiaohongshu: "小红书打法",
            article: "公众号打法"
          }
        },
        match,
        baselineTopicHints: fallbackTopics.map(t => ({ coreAngle: t.coreAngle, category: t.category, reason: t.reason }))
      })
    }
  ], { apiKey: body?.apiKey, timeoutMs: 30000, maxTokens: 4096,
    cacheTtlMs: match.status === "live" ? 60000 : 10 * 60000,
    cacheKey: JSON.stringify({ kind: "match-workflow-creative-v3", match, baselineTopics }) });

  if (!result.ok) {
    return json(res, 200, {
      workflowVersion: "platform-content-v1",
      sourceStatus: "fallback",
      conclusions: [],
      topics: fallbackTopics,
      message: `AI 暂不可用，已保留本地工作流：${result.message}`
    });
  }

  const d = result.data || {};
  const conclusionsRaw = Array.isArray(d.conclusions) ? d.conclusions : [];
  const conclusions = conclusionsRaw.slice(0, 3).map((item, index) => ({
    title: matchAiText(item?.title, ["事实摘要", "运营判断", "风险提醒"][index] || "运营判断"),
    body: matchAiText(item?.body, "基于当前可核验比赛信息进行内容判断。"),
    featured: typeof item?.featured === "boolean" ? item.featured : index === 1
  }));

  while (conclusions.length < 3) {
    const index = conclusions.length;
    conclusions.push({
      title: ["事实摘要", "运营判断", "风险提醒"][index],
      body: index === 0
        ? `${matchAiText(match.name, "本场比赛")}当前只使用已提供的比赛事实与数据。`
        : index === 1
          ? "优先把关键事件和热点信号转成平台化内容，再用数据补证据。"
          : "涉及伤病、判罚、冲突和内部信息时，必须补充可靠来源。",
      featured: index === 1
    });
  }

  const aiTopics = Array.isArray(d.topics) ? d.topics : [];
  const topics = Array.from({ length: Math.min(6, Math.max(aiTopics.length, fallbackTopics.length)) }, (_, index) =>
    normalizeMatchTopic(aiTopics[index] || {}, fallbackTopics[index] || fallbackTopics[0], matchAiText(match.id, "match"), index)
  ).slice(0, 6);

  const strategy = d.platformStrategy && typeof d.platformStrategy === "object"
    ? {
        bilibili: matchAiText(d.platformStrategy.bilibili, "用关键事件做开头，数据和人物线做中段，评论区承接讨论。"),
        weibo: matchAiText(d.platformStrategy.weibo, "先发短评承接即时讨论，避免绝对化定性。"),
        xiaohongshu: matchAiText(d.platformStrategy.xiaohongshu, "用卡片化结构解释比赛节点和数据。"),
        article: matchAiText(d.platformStrategy.article, "用事实、数据、人物和风险边界组成深度长文。")
      }
    : undefined;

  return json(res, 200, {
    workflowVersion: "platform-content-v1",
    sourceStatus: "live",
    model: result.model,
    conclusions,
    topics,
    ...(strategy ? { platformStrategy: strategy } : {})
  });
}

function platformDisplayName(platform) {
  return {
    bilibili: "B站",
    xiaohongshu: "小红书",
    weibo: "微博",
    douyin: "抖音",
    videoScript: "视频脚本",
    article: "公众号"
  }[platform] || matchAiText(platform, "平台");
}

function localPlatformDraft(body) {
  const platform = body?.platform || "bilibili";
  const topic = body?.topic || {};
  const match = body?.matchContext || {};
  const analysis = body?.analysis || {};
  const contentType = body?.contentType || "videoScript";
  const matchName = matchAiText(match?.matchInfo?.name, "本场比赛");
  const score = matchAiText(match?.matchInfo?.score, "待确认");
  const topicTitle = matchAiText(topic?.title, "本场比赛内容");
  let direct;

  if (contentType === "topic") {
    direct = [
      `1. 事件时间线：${topicTitle}\n怎么做：按比赛节点拆成三个关键瞬间。\n说明：只使用当前 evidence 中已有事实。`,
      `2. 人物线：${topicTitle}\n怎么做：选择一个关键人物串联事件和数据。\n说明：不编造采访或心理活动。`,
      `3. 数据线：${topicTitle}\n怎么做：用已验证技术统计解释比赛过程。\n说明：verifiedStats=false 时不引用占位数据。`,
      `4. 平台二创：${topicTitle}\n怎么做：用动漫或游戏语言包装真实比赛节点。\n说明：创意只负责表达，不改变事实。`,
      `5. 球迷讨论：${topicTitle}\n怎么做：提出一个基于事实的讨论问题。\n说明：避免制造球迷对立。`
    ].join("\n\n");
  } else {
    direct = `${matchName} ${score}。\n从“${topicTitle}”切入，把关键事件、可核验数据和一个讨论问题讲清楚。`;
  }

  const sections = contentType === "topic"
    ? [{ title: "选题角度", content: direct }]
    : [
        { title: "可直接发布版", content: direct },
        { title: "编辑参考版", content: `平台：${platformDisplayName(platform)}。先讲事实，再补数据和人物线，最后留互动。` },
        { title: "风险提示版", content: "伤病、判罚、冲突和内部消息没有可靠来源时不得写成定论。" }
      ];

  return {
    id: `${matchAiText(match.id, "match")}-${matchAiText(topic.id, "topic")}-${platform}-${Date.now()}`,
    platform,
    title: contentType === "topic" ? "5个选题角度" : topicTitle,
    sections,
    body: sections.map((section) => `【${section.title}】\n${section.content}`).join("\n\n"),
    createdAt: nowIso()
  };
}

async function handleAiPlatformDraft(req, res) {
  const body = await readJsonBody(req);
  const { platform, contentType, topicMode, matchContext, topic, analysis } = body || {};
  if (!platform || !contentType || !topicMode || !matchContext || !topic || !analysis) {
    return json(res, 400, { sourceStatus: "error", message: "Missing platform draft inputs." });
  }

  const fallback = localPlatformDraft(body);
  const topicModeLabel = {
    objectiveNews: "客观资讯",
    professional: "专业复盘",
    fanDiscussion: "球迷讨论",
    playful: "轻松整活",
    playerStory: "人物故事",
    dataRead: "数据解读",
    riskSafe: "稳妥表达"
  }[topicMode] || topicMode;

  const isTopic = contentType === "topic";
  const contentTypeLabel = { topic: "选题", title: "标题", shortCopy: "短文案", videoScript: "视频脚本", commentPrompt: "评论区互动", cardStructure: "图文卡片" }[contentType] || contentType;
  const result = await callDeepSeekJson([
    {
      role: "system",
      content: [
        "你是体育赛事内容运营编辑，只输出严格 JSON，不要 Markdown。",
        "只能使用 matchContext、evidence、topic、analysis 中已有信息。",
        "evidence 是具体比分、时间、事件、技术统计的事实边界。",
        "verifiedStats=false 时，不得引用 stats 数字。",
        "不得编造伤病、采访、内部矛盾、裁判动机或未给出的比赛事实。",
        buildCreativeBrief({ chain: "match", platform: platformDisplayName(platform), contentType: contentTypeLabel, tone: topicModeLabel }),
        isTopic
          ? "当前任务是生成正好5个不同的作品选题角度，不是完整稿件。"
          : "当前任务是生成一个可直接发布的内容产物，并同时给出编辑参考和风险提示。"
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: isTopic ? "生成5个具体选题角度" : "生成平台成稿",
        platform: platformDisplayName(platform),
        generationType: contentType,
        styleType: topicModeLabel,
        outputShape: isTopic
          ? { topics: [{ title: "角度标题", approach: "怎么做", reason: "说明" }] }
          : { title: "短标题", direct: "可直接发布版", reference: "编辑参考版", risk: "风险提示版" },
        matchContext,
        evidence: Array.isArray(matchContext.evidence) ? matchContext.evidence : [],
        topic,
        analysis
      })
    }
  ], { apiKey: body?.apiKey, timeoutMs: 30000, maxTokens: 4096 });

  if (!result.ok) {
    return json(res, 200, { sourceStatus: "fallback", draft: fallback, message: `AI 暂不可用，已使用本地稿：${result.message}` });
  }

  const d = result.data || {};
  if (isTopic) {
    const angles = Array.isArray(d.topics)
      ? d.topics.map((item) => ({
          title: matchAiText(item?.title),
          approach: matchAiText(item?.approach),
          reason: matchAiText(item?.reason)
        })).filter((item) => item.title && item.approach && item.reason)
      : [];

    if (angles.length !== 5 || !hasDistinctTopicAngles(angles)) {
      return json(res, 200, { sourceStatus: "fallback", draft: fallback, message: "AI 选题角度结构不完整，已使用本地兜底。" });
    }

    const sections = [{
      title: "选题角度",
      content: angles.map((angle, index) => `${index + 1}. ${angle.title}\n怎么做：${angle.approach}\n说明：${angle.reason}`).join("\n\n")
    }];

    return json(res, 200, {
      sourceStatus: "live",
      model: result.model,
      draft: {
        id: `${matchAiText(matchContext.id, "match")}-${matchAiText(topic.id, "topic")}-${platform}-${Date.now()}`,
        platform,
        title: "5个选题角度",
        sections,
        body: sections.map((section) => `【${section.title}】\n${section.content}`).join("\n\n"),
        createdAt: nowIso()
      }
    });
  }

  const sections = [
    { title: "可直接发布版", content: matchAiText(d.direct) },
    { title: "编辑参考版", content: matchAiText(d.reference) },
    { title: "风险提示版", content: matchAiText(d.risk) }
  ].filter((section) => section.content);

  if (!sections.length) {
    return json(res, 200, { sourceStatus: "fallback", draft: fallback, message: "AI 返回空稿，已使用本地兜底。" });
  }

  return json(res, 200, {
    sourceStatus: "live",
    model: result.model,
    draft: {
      id: `${matchAiText(matchContext.id, "match")}-${matchAiText(topic.id, "topic")}-${platform}-${Date.now()}`,
      platform,
      title: matchAiText(d.title, matchAiText(topic.title, `${platformDisplayName(platform)}内容`)),
      sections,
      body: sections.map((section) => `【${section.title}】\n${section.content}`).join("\n\n"),
      createdAt: nowIso()
    }
  });
}

function localReviewDraft(draft, evidence = []) {
  const text = String(draft || "");
  const evidenceAudit = auditDraftEvidence(text, evidence);
  const ruleReview = reviewRisk(text);
  const riskFindings = ruleReview.findings.map(finding => ({
    type: finding.type,
    sentence: finding.sentence,
    reason: finding.reason,
    rewrite: finding.rewrite,
    evidenceStatus: "risk",
    evidenceIds: []
  }));
  const findings = [...evidenceAudit.findings, ...riskFindings];
  const score = finalizeReviewRiskScore(Math.max(ruleReview.score, calculateEvidenceRiskScore(evidenceAudit.summary.unsupportedClaims)), findings.map(f => f.evidenceStatus));
  return {
    level: "待人工确认",
    score,
    findings,
    advice: "审核未完成，待人工确认",
    evidence,
    evidenceSummary: evidenceAudit.summary
  };
}

async function handleAiReviewDraft(req, res) {
  const body = await readJsonBody(req);
  const draft = matchAiText(body?.draft);
  const matchContext = body?.matchContext;
  const evidence = Array.isArray(body?.evidence)
    ? body.evidence
    : Array.isArray(matchContext?.evidence)
      ? matchContext.evidence
      : [];

  if (!draft || !matchContext) {
    return json(res, 400, { sourceStatus: "error", message: "draft and matchContext are required." });
  }

  const fallbackResult = localReviewDraft(draft, evidence);
  const result = await callDeepSeekJson([
    {
      role: "system",
      content: [
        "你是体育内容发布审稿编辑，只输出严格 JSON，不要 Markdown。",
        "逐句检查事实断言，只使用 evidence 中存在的 E 编号作为事实依据。",
        "纯观点、情绪和创意表达不要求来源，不要误报。",
        "证据包不完整不等于事实错误。缺少记录只标 missing 并提示补来源，不得因此判中高风险。",
        "只有与已提供的数据明确矛盾才标 overreach；统计口径和四舍五入的小差异只作提醒。",
        "选题、拟制作方案、素材建议不是已发生的事件，不要求完整稿件的引用、画面和采访。",
        "不要网暴、避免黑哨定性等反面提醒不是攻击；篇幅、风格与未附授权说明不属于事实错误。",
        "重点检查伤病、判罚、冲突、内部消息、引战词和绝对化表达。",
        "sentence 必须逐字来自原稿；改写不能新增事实。",
        "score 是风险分，不是质量分：越高风险越大；低风险 0-35，中风险 36-69，高风险 70-100。没有具体问题时 score 应在 0-10。",
        "没有具体问题时 findings、riskPoints、checklist 返回空数组。"
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "审核赛事稿件并给出可直接应用的改写。",
        outputShape: {
          level: "低/中/高",
          score: 0,
          findings: [{
            type: "问题类型",
            sentence: "原稿具体句子",
            reason: "为什么有问题",
            rewrite: "建议改写",
            evidenceStatus: "missing/overreach/risk",
            evidenceIds: ["E01"]
          }],
          riskPoints: ["具体风险"],
          rewriteSuggestion: "完整改写稿",
          checklist: ["具体检查项"]
        },
        matchContext,
        evidence,
        draft
      })
    }
  ], { apiKey: body?.apiKey, timeoutMs: 30000, maxTokens: 4096 });

  if (!result.ok || !hasCompleteReview(result.data, draft)) {
    return json(res, 200, {
      sourceStatus: "fallback",
      result: fallbackResult,
      riskPoints: fallbackResult.findings.map((f) => `${f.type}：${f.sentence}`),
      rewriteSuggestion: fallbackResult.findings.length ? draft.replace(fallbackResult.findings[0].sentence, fallbackResult.findings[0].rewrite) : draft,
      checklist: fallbackResult.findings.map((f) => `修改“${f.sentence}”`),
      message: result.ok ? "AI 审核结果不完整，待人工确认。" : `AI 暂不可用，已使用本地检查，待人工确认：${result.message}`
    });
  }

  const d = result.data || {};
  const allowedEvidence = new Set(evidence.map((item) => matchAiText(item?.id)).filter(Boolean));
  const findings = Array.isArray(d.findings)
    ? d.findings.map((item) => {
        const sentence = matchAiText(item?.sentence);
        if (!sentence || !draft.includes(sentence)) return null;
        const audit = auditDraftEvidence(sentence, evidence);
        const concreteRisk = item?.evidenceStatus === "risk" && isConcreteAiRisk(sentence, matchAiText(item?.reason));
        if (!concreteRisk && !audit.summary.unsupportedClaims) return null;
        const status = concreteRisk ? "risk" : audit.findings[0]?.evidenceStatus || "missing";
        const evidenceIds = Array.isArray(item?.evidenceIds)
          ? item.evidenceIds.map((id) => matchAiText(id)).filter((id) => allowedEvidence.has(id))
          : [];
        return {
          type: status === "missing" ? "建议补充来源" : matchAiText(item?.type, "事实边界"),
          sentence,
          reason: status === "missing" ? "当前资料未覆盖这条陈述，不等于事实错误；补充对应来源即可。" : matchAiText(item?.reason, "该表达需要校正或降低确定性。"),
          rewrite: status === "missing" ? sentence : matchAiText(item?.rewrite, "请按对应来源校正表达。"),
          evidenceStatus: status,
          evidenceIds
        };
      }).filter(Boolean).slice(0, 6)
    : [];

  for (const finding of fallbackResult.findings) {
    if (!findings.some(item => item.sentence === finding.sentence && item.evidenceStatus === finding.evidenceStatus)) findings.push(finding);
  }
  let score = findings.length ? matchAiScore(d.score, 45) : fallbackResult.score;
  if (findings.some((f) => f.evidenceStatus === "risk")) score = Math.max(score, 50);
  score = finalizeReviewRiskScore(score, findings.map(f => f.evidenceStatus));
  const level = score >= 70 ? "高" : score >= 36 ? "中" : "低";
  const resultSnapshot = {
    level,
    score,
    findings,
    advice: level === "高" ? "建议暂缓" : level === "中" ? "修改后发布" : findings.length ? "可预览，建议补充来源" : "可发布",
    evidence,
    evidenceSummary: fallbackResult.evidenceSummary
  };

  const riskPoints = findings.map((f) => `${f.type}：${f.sentence}${f.reason ? `。${f.reason}` : ""}`);
  const checklist = findings.map((f) => f.evidenceStatus === "missing" ? `可为“${f.sentence}”补充来源` : `按建议修改“${f.sentence}”`);
  const actionableFindings = findings.filter(f => f.evidenceStatus !== "missing");
  const rewriteSuggestion = !actionableFindings.length ? draft : matchAiText(
    d.rewriteSuggestion,
    actionableFindings.reduce((text, f) => text.includes(f.sentence) ? text.replace(f.sentence, f.rewrite) : text, draft)
  );

  return json(res, 200, {
    sourceStatus: "live",
    model: result.model,
    result: resultSnapshot,
    riskPoints,
    rewriteSuggestion,
    checklist
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const path = url.pathname;

  if (path === "/api/source-debug") {
    if (req.method !== "GET") {
      res.setHeader("allow", "GET");
      return json(res, 405, payload("error", null, "Method not allowed."));
    }
    const health = sportsService.health();
    return json(res, 200, {
      configured: {
        apiKey: health.configured,
        accessLevel: String(process.env.SPORTRADAR_ACCESS_LEVEL || "trial").trim(),
        languageCode: String(process.env.SPORTRADAR_LANGUAGE_CODE || "en").trim(),
        competitionId: String(process.env.SPORTRADAR_WORLD_CUP_COMPETITION_ID || "sr:competition:16").trim(),
        seasonId: String(process.env.SPORTRADAR_WORLD_CUP_SEASON_ID || "").trim() || null
      },
      sportradar: { attempted: false, ok: null, status: "not-probed", recent: health.recent },
      fallbackOrder: ["sportradar", "worldcup26-free", "thestatsapi-fixtures", "mock"],
      note: "Passive diagnostics only. No upstream request was made; see recent for the last cached result."
    });
  }

  if (path === "/api/ai/health" && req.method === "GET") {
    const configured = Boolean(String(process.env.DEEPSEEK_API_KEY || "").trim());
    const model = String(process.env.DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL_FAST || DEFAULT_DEEPSEEK_MODEL).trim();

    if (url.searchParams.get("probe") !== "1") {
      return json(res, 200, {
        ok: true,
        configured,
        accessMode: "public",
        model,
        generationVersion: "creative-v2",
        note: configured
          ? "DeepSeek API key is available to the CloudBase function."
          : "DEEPSEEK_API_KEY is not available to this CloudBase function."
      });
    }

    if (!configured) {
      return json(res, 200, {
        ok: false,
        configured: false,
        accessMode: "public",
        model,
        probe: "skipped",
        message: "DEEPSEEK_API_KEY is not available to this CloudBase function."
      });
    }

    const result = await callDeepSeekJson(
      [
        { role: "system", content: "Only return strict JSON." },
        { role: "user", content: "Return {\"ok\":true}." }
      ],
      { timeoutMs: 12000, maxTokens: 64 }
    );

    return json(res, 200, {
      ok: result.ok,
      configured: true,
      accessMode: "public",
      model,
      probe: result.ok ? "success" : "failed",
      ...(result.ok ? { responseModel: result.model } : { message: result.message })
    });
  }

  if (path === "/api/health" || path === "/healthz") {
    return json(res, 200, {
      ok: true,
      service: "worldcup-cloudbase-api",
      version: API_VERSION,
      time: nowIso()
    });
  }

  if (path.startsWith("/api/worldcup/")) {
    if (req.method !== "GET") {
      res.setHeader("allow", "GET");
      return json(res, 405, payload("error", null, "Method not allowed."));
    }
    const handled = await handleWorldCup(url, res);
    if (handled !== false) return;
  }

  if (path.startsWith("/api/hot")) {
    if (req.method !== "GET") {
      res.setHeader("allow", "GET");
      return json(res, 405, payload("error", [], "Method not allowed."));
    }
    const handled = await handleHot(url, res);
    if (handled !== false) return;
  }

  if (path === "/api/ai/hot-topic" && req.method === "POST") {
    return handleAiHotTopic(req, res);
  }

  if (path === "/api/ai/hot-topic-workflow" && req.method === "POST") {
    return handleAiHotWorkflow(req, res);
  }

  if (path === "/api/ai/match-workflow" && req.method === "POST") {
    return handleAiMatchWorkflow(req, res);
  }

  if (path === "/api/ai/platform-draft" && req.method === "POST") {
    return handleAiPlatformDraft(req, res);
  }

  if (path === "/api/ai/review-draft" && req.method === "POST") {
    return handleAiReviewDraft(req, res);
  }

  if (path.startsWith("/api/ai/") || path.startsWith("/api/settings/")) {
    return json(res, 503, {
      sourceStatus: "error",
      data: [],
      lastUpdated: nowIso(),
      message: "This AI endpoint has not yet been migrated to CloudBase direct mode."
    });
  }

  return json(res, 404, { sourceStatus: "error", message: "Unknown API route." });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    if (res.writableEnded || res.destroyed) return;
    if (res.headersSent) return res.destroy();
    const status = [400, 401, 403, 413].includes(error?.statusCode) ? error.statusCode : 500;
    const message = status === 401 || status === 403 ? error.message : status === 413 ? "Request body is too large." : status === 400 ? "Valid JSON object required." : "Request could not be completed.";
    json(res, status, payload("error", null, message));
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`WorldCup CloudBase API ${API_VERSION} listening on ${PORT}`);
});
