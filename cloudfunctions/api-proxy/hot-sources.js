const { createHash } = require("node:crypto");

const LABELS = { weibo: "微博", bilibili: "B站", douyin: "抖音", baidu: "百度", zhihu: "知乎", toutiao: "头条", hupu: "虎扑" };
const DEFAULTS = { tavily: "https://api.tavily.com", tophubdata: "https://api.tophubdata.com", dailyhot: "https://nicee-wine.vercel.app" };
const SOURCES = { tavily: "全网搜索", tophubdata: "榜眼数据", dailyhot: "今日热榜", redfox: "RedFox 小红书每日爆款笔记" };

function createSources({ env = process.env, fetchImpl = fetch, now = Date.now, timeoutMs = 8000 } = {}) {
  const cache = new Map();
  const pending = new Map();
  const latest = new Map();
  const budgets = new Map();
  const configuredBudget = Number(env.HOT_SEARCH_REQUESTS_PER_MINUTE || 20);
  const searchBudget = Number.isFinite(configuredBudget) ? Math.max(1, Math.min(60, Math.floor(configuredBudget))) : 20;
  const keys = { tavily: env.TAVILY_API_KEY?.trim(), tophubdata: env.TOPHUBDATA_API_KEY?.trim(), redfox: env.REDFOX_API_KEY?.trim() };

  function health() {
    return Object.keys(SOURCES).map(provider => ({
      provider,
      configured: provider === "dailyhot" || Boolean(keys[provider]),
      status: provider !== "dailyhot" && !keys[provider] ? "not-configured" : "ready",
      recent: [...latest.values()].filter(item => item.provider === provider),
    }));
  }

  function base(provider) {
    const overrides = { tavily: env.TAVILY_BASE_URL, tophubdata: env.TOPHUBDATA_BASE_URL, dailyhot: env.DAILY_HOT_API_BASE };
    const url = new URL(overrides[provider] || DEFAULTS[provider]);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("invalid-config");
    return url.href.replace(/\/$/, "");
  }

  async function run(provider, key, build, platform) {
    if (provider !== "dailyhot" && !keys[provider]) return { provider, platform, status: "not-configured", items: [], cached: false };
    const identity = `${provider}:${key}`;
    const cached = cache.get(identity);
    if (cached && cached.expiresAt > now()) return { ...cached.result, cached: true };
    if (pending.has(identity)) return pending.get(identity);
    if (["tavily", "tophubdata"].includes(provider)) {
      const budget = budgets.get(provider);
      const window = budget && now() - budget.start < 60000 ? budget : { start: now(), count: 0 };
      if (window.count >= searchBudget) return { provider, platform, status: "local-rate-limited", items: [], cached: false };
      window.count++;
      budgets.set(provider, window);
    }
    // Bound both cached query results and concurrent unique searches.
    if (pending.size >= 16) return { provider, platform, status: "busy", items: [], cached: false };
    const task = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let result;
      try {
        const { url, init = {} } = build();
        const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: "error" });
        if (!response.ok) {
          const status = response.status === 429 ? "rate-limited" : [401, 403].includes(response.status) ? "unauthorized" : "http-error";
          result = { provider, platform, status, httpStatus: response.status, items: [] };
        } else {
          const raw = await response.json();
          if (raw?.success === false || (typeof raw?.code === "number" && ![0, 200, 2000].includes(raw.code))) throw new Error("provider-error");
          const rows = provider === "tavily" ? raw?.results : rowsFrom(raw);
          if (!Array.isArray(rows)) throw new Error("invalid-response");
          const fetchedAt = new Date(now()).toISOString();
          const items = rows.slice(0, 100).map((row, index) => normalize(row, provider, platform, index, fetchedAt)).filter(Boolean);
          result = { provider, platform, status: items.length ? "success" : "empty", items };
        }
      } catch (error) {
        result = { provider, platform, status: controller.signal.aborted ? "timeout" : ["invalid-response", "provider-error", "invalid-config"].includes(error?.message) ? error.message : "failed", items: [] };
      } finally {
        clearTimeout(timer);
      }
      result = { ...result, checkedAt: new Date(now()).toISOString(), cached: false };
      latest.set(`${provider}:${platform || "search"}`, { provider, platform, status: result.status, count: result.items.length, checkedAt: result.checkedAt });
      if (cache.size >= 64) cache.delete(cache.keys().next().value);
      cache.set(identity, { result, expiresAt: now() + (["success", "empty"].includes(result.status) ? 60000 : 10000) });
      return result;
    })();
    pending.set(identity, task);
    try { return await task; } finally { pending.delete(identity); }
  }

  function search(provider, query) {
    if (!["tavily", "tophubdata"].includes(provider)) throw new Error("Unsupported search provider");
    const text = String(query || "").trim().replace(/\s+/g, " ").slice(0, 300);
    if (!text) return Promise.resolve({ provider, status: "empty-query", items: [], cached: false });
    return run(provider, text, () => {
      if (provider === "tavily") return {
        url: `${base(provider)}/search`,
        init: { method: "POST", headers: { Authorization: `Bearer ${keys[provider]}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: text, search_depth: "basic", max_results: 8, include_answer: false }) },
      };
      const url = new URL(`${base(provider)}/search`);
      url.searchParams.set("q", text);
      url.searchParams.set("p", "1");
      const hashid = env.TOPHUBDATA_NODE_HASHID || env.TOPHUBDATA_NODE_HASHIDS?.split(",")[0]?.trim();
      if (hashid) url.searchParams.set("hashid", hashid);
      return { url: url.href, init: { headers: { Authorization: keys[provider] } } };
    });
  }

  function daily(platform) {
    if (!Object.hasOwn(LABELS, platform)) return Promise.resolve({ provider: "dailyhot", platform, status: "unsupported", items: [], cached: false });
    return run("dailyhot", platform, () => ({ url: `${base("dailyhot")}/${platform}`, init: { headers: { Accept: "application/json" } } }), platform);
  }

  function redfox() {
    const rankDate = env.REDFOX_XHS_RANK_DATE || new Date(now() + 8 * 3600000 - 86400000).toISOString().slice(0, 10);
    const category = env.REDFOX_XHS_CATEGORY || "体育锻炼";
    return run("redfox", `${rankDate}:${category}`, () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rankDate)) throw new Error("invalid-config");
      const url = new URL("https://redfox.hk/story/api/cozeSkill/getXhsCozeSkillDataOne");
      url.searchParams.set("rankDate", rankDate);
      url.searchParams.set("source", "小红书单日数据爆款文章-GitHub");
      url.searchParams.set("category", category);
      return { url: url.href, init: { headers: { Accept: "application/json", "X-API-KEY": keys.redfox } } };
    }, "xiaohongshu");
  }

  return { health, search, daily, redfox };
}

function rowsFrom(raw, depth = 0) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object" || depth > 4) return null;
  for (const key of ["data", "list", "items", "results", "result"]) {
    const found = rowsFrom(raw[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function normalize(row, provider, platform, index, fetchedAt) {
  if (!row || typeof row !== "object") return null;
  const value = row.item && typeof row.item === "object" ? { ...row, ...row.item } : row;
  const title = String(value.title || value.noteTitle || value.name || value.word || "").trim().slice(0, 500);
  let url;
  try {
    url = new URL(value.url || value.link || value.mobileUrl || value.photoJumpUrl || value.noteUrl || value.href);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
  } catch { return null; }
  if (!title) return null;
  const summary = String(value.content || value.summary || value.desc || value.description || title).slice(0, 2000);
  const rank = Number.isFinite(Number(value.rank)) && Number(value.rank) > 0 ? Number(value.rank) : index + 1;
  const platformLabel = provider === "redfox" ? "小红书" : LABELS[platform] || String(value.platform || value.sourceName || SOURCES[provider]).slice(0, 60);
  const publishedAt = typeof value.publishedAt === "string" ? value.publishedAt : typeof value.published_date === "string" ? value.published_date : undefined;
  const heat = value.hot || value.heat || value.anaAdd?.interactiveCount;
  return {
    id: `${provider}-${createHash("sha256").update(url.href).digest("hex").slice(0, 16)}`,
    title, summary, url: url.href, provider, source: SOURCES[provider], platform: platformLabel, rank,
    fetchedAt, ...(publishedAt ? { publishedAt, time: publishedAt } : {}),
    ...(typeof heat === "string" || typeof heat === "number" ? { heat, hot: heat } : {}),
    relevance: 60, valueScore: Math.max(40, 90 - index * 3), valueLevel: "medium", rankingMethod: "heuristic",
    tags: [platformLabel],
  };
}

module.exports = { createSources };
