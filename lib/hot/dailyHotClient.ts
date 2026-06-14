const DEFAULT_BASE_URL = "https://api-hot.imsyy.top";
const DEFAULT_PLATFORMS = ["weibo", "douyin", "bilibili", "baidu", "zhihu", "hupu"];

export async function fetchDailyHotFeeds() {
  const baseUrl = (process.env.DAILY_HOT_API_BASE || DEFAULT_BASE_URL).replace(/\/$/, "");
  const platforms = (process.env.DAILY_HOT_PLATFORMS || DEFAULT_PLATFORMS.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  const results = await Promise.allSettled(
    platforms.map(async (platform) => {
      const response = await fetchWithTimeout(`${baseUrl}/${platform}`, { headers: { Accept: "application/json" } }, 5000);
      if (!response.ok) throw new Error(`DailyHot ${platform} request failed: ${response.status}`);
      return { platform, payload: await response.json() };
    })
  );

  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}
