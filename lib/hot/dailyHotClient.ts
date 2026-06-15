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
      if (!response.ok) throw new Error(`今日热榜公共源请求失败：${platformLabel(platform)}，状态码 ${response.status}`);
      return { platform, payload: await response.json() };
    })
  );

  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    weibo: "微博",
    douyin: "抖音",
    bilibili: "B站",
    baidu: "百度",
    zhihu: "知乎",
    hupu: "虎扑"
  };
  return labels[platform] ?? platform;
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
