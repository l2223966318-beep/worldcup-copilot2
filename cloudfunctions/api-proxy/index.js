const http = require("node:http");

const PORT = Number(process.env.PORT || 9000);
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 7000);
const WORLDCUP26 = "https://worldcup26.ir";
const STATS_FIXTURES = "https://www.thestatsapi.com/world-cup/data/fixtures.json";

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

function nowIso() { return new Date().toISOString(); }
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
function normalizeLocalDate(value) {
  if (!value) return "";
  const m = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) return String(value);
  const [, month, day, year, hour, minute] = m;
  return `${year}-${month}-${day}T${hour}:${minute}:00-04:00`;
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
      ...([stadium.city_en, stadium.country_en].filter(Boolean).length ? { city: [stadium.city_en, stadium.country_en].filter(Boolean).join(", ") } : {})
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
async function loadFixtures() {
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
async function handleWorldCup(pathname, res) {
  if (pathname === "/api/worldcup/fixtures") return json(res, 200, await loadFixtures());
  if (pathname === "/api/worldcup/fixtures/today") {
    const p = await loadFixtures();
    const key = beijingDateKey();
    return json(res, 200, { ...p, data: p.data.filter(m => dateKeyFromString(m.kickoffTime) === key) });
  }
  if (pathname === "/api/worldcup/live") {
    const p = await loadFixtures();
    return json(res, 200, { ...p, data: p.data.filter(m => m.status === "live") });
  }
  if (pathname.startsWith("/api/worldcup/matches/")) {
    const id = decodeURIComponent(pathname.slice("/api/worldcup/matches/".length));
    if (id === "argentina-france-2022-final") return json(res, 200, payload("fallback", classicFallback[0], "Historical demo sample."));
    const p = await loadFixtures();
    const match = p.data.find(m => m.id === id);
    return match ? json(res, 200, { ...p, data: match }) : json(res, 404, payload("error", null, `Fixture ${id} not found.`));
  }
  if (pathname === "/api/worldcup/standings") {
    try {
      const groups = await fetchJson(`${WORLDCUP26}/get/groups`);
      return json(res, 200, payload("live", groups.groups || []));
    } catch (e) {
      return json(res, 200, payload("fallback", [], e && e.message ? e.message : String(e)));
    }
  }
  return false;
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const path = url.pathname;
  if (path === "/api/health" || path === "/healthz") {
    return json(res, 200, { ok: true, service: "worldcup-cloudbase-api", version: "direct-v2", time: nowIso() });
  }
  if (path.startsWith("/api/worldcup/")) {
    const handled = await handleWorldCup(path, res);
    if (handled !== false) return;
  }
  if (path.startsWith("/api/hot") || path.startsWith("/api/ai/") || path.startsWith("/api/settings/")) {
    return json(res, 503, { sourceStatus: "error", data: [], lastUpdated: nowIso(), message: "This endpoint is being migrated to CloudBase direct mode." });
  }
  return json(res, 404, { sourceStatus: "error", message: "Unknown API route." });
});
server.listen(PORT, "0.0.0.0", () => {
  console.log(`WorldCup CloudBase API direct-v2 listening on ${PORT}`);
});
