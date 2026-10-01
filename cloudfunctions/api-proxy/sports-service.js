function createSportsService({ client = require("./sportradar"), env = process.env, now = Date.now } = {}) {
  const cache = new Map(), pending = new Map(), failures = new Map();
  const ttl = 5 * 60 * 1000, maxStale = 30 * 60 * 1000, cooldown = 30 * 1000;
  const configured = Boolean(env.SPORTRADAR_API_KEY?.trim());
  const seasonConfigured = Boolean(env.SPORTRADAR_WORLD_CUP_SEASON_ID?.trim());
  let recent = { status: "not-checked" };
  const diagnosis = error => ({
    provider: "sportradar", status: error?.upstreamStatus === 401 || error?.upstreamStatus === 403 ? "unauthorized"
      : error?.upstreamStatus === 429 ? "rate-limited" : error?.name === "AbortError" ? "timeout" : "failed",
    checkedAt: new Date(now()).toISOString(),
  });
  const unavailable = (status, data = null) => ({
    sourceStatus: "error", data, lastUpdated: new Date(now()).toISOString(),
    message: "Sportradar data is unavailable. Check the sports health endpoint.",
    diagnostics: { provider: "sportradar", status },
  });
  const onFailure = (entry, diagnostics) => entry && now() - entry.fetchedAt <= maxStale
    ? { ...entry.result, sourceStatus: "cache", stale: true, diagnostics }
    : { ...unavailable(diagnostics.status), diagnostics };
  async function cached(key, loader) {
    const entry = cache.get(key);
    const lifetime = Array.isArray(entry?.result.data) && entry.result.data.some(m => m.status === "live") ? 60000 : ttl;
    if (entry && now() - entry.fetchedAt < lifetime) return { ...entry.result, sourceStatus: "cache" };
    if (pending.has(key)) return pending.get(key);
    const failure = failures.get(key);
    if (failure && now() - failure.at < cooldown) return onFailure(entry, failure.diagnostics);
    if (pending.size >= 16) return unavailable("busy");
    const work = (async () => {
      try {
        const result = await loader();
        if (!result || result.data === null || result.data === undefined) throw new Error("Invalid sports payload");
        recent = { provider: "sportradar", status: Array.isArray(result.data) && !result.data.length ? "empty" : "success", checkedAt: new Date(now()).toISOString() };
        const value = { ...result, diagnostics: recent };
        if (!cache.has(key) && cache.size >= 64) cache.delete(cache.keys().next().value);
        cache.set(key, { result: value, fetchedAt: now() });
        failures.delete(key);
        return value;
      } catch (error) {
        recent = diagnosis(error);
        if (!failures.has(key) && failures.size >= 64) failures.delete(failures.keys().next().value);
        failures.set(key, { at: now(), diagnostics: recent });
        return onFailure(entry, recent);
      } finally { pending.delete(key); }
    })();
    pending.set(key, work);
    return work;
  }
  async function load(kind, argument) {
    if (!configured) return unavailable("not-configured");
    if (["fixtures", "standings"].includes(kind) && !seasonConfigured) return unavailable("missing-season");
    if (["today", "live"].includes(kind) && seasonConfigured) {
      const result = await load("fixtures");
      if (!Array.isArray(result.data)) return result;
      const { getBeijingDateKeyFromValue } = require("./beijing-time");
      return { ...result, data: result.data.filter(match => kind === "live" ? match.status === "live" : getBeijingDateKeyFromValue(match.kickoffTime) === argument) };
    }
    const loaders = {
      fixtures: () => client.getSportradarWorldCupFixtures(),
      today: () => client.getSportradarWorldCupToday(argument),
      live: () => client.getSportradarWorldCupLive(),
      match: () => client.getSportradarWorldCupMatch(argument),
      standings: () => client.getSportradarWorldCupStandings(),
    };
    if (!loaders[kind]) return unavailable("invalid-request");
    return cached(`${kind}:${argument || ""}`, loaders[kind]);
  }
  return { load, health: () => ({
    configured, seasonConfigured, competitionConfigured: Boolean(env.SPORTRADAR_WORLD_CUP_COMPETITION_ID?.trim()),
    provider: "sportradar", cacheTtlSeconds: ttl / 1000, liveCacheTtlSeconds: 60,
    maxStaleSeconds: maxStale / 1000, failureCooldownSeconds: cooldown / 1000, recent,
  }) };
}
module.exports = { createSportsService };
