const STORAGE_KEY = "worldcup.ai-access-token";

export function readAiAccessToken() {
  if (typeof window === "undefined") return "";
  try { return window.sessionStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
}

export function saveAiAccessToken(value: string) {
  try {
    if (value.trim()) window.sessionStorage.setItem(STORAGE_KEY, value.trim());
    else window.sessionStorage.removeItem(STORAGE_KEY);
    return true;
  } catch { return false; }
}

export function getAiRequestHeaders(): Record<string, string> {
  const token = readAiAccessToken();
  return { "Content-Type": "application/json", ...(token ? { "X-AI-Access-Token": token } : {}) };
}
