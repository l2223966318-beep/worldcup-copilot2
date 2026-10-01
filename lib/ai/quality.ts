type QualityNode =
  | string
  | number
  | boolean
  | null
  | undefined
  | QualityNode[]
  | { [key: string]: QualityNode };

export type PlatformTone = "bilibili" | "weibo" | "xiaohongshu" | "douyin" | "article" | "generic";

type QualityIssue = {
  type: "title_length" | "punctuation" | "placeholder" | "risky_claim" | "unsourced_claim" | "template";
  message: string;
};

const titleLimits: Record<PlatformTone, { min: number; max: number }> = {
  bilibili: { min: 16, max: 28 },
  weibo: { min: 12, max: 22 },
  xiaohongshu: { min: 12, max: 20 },
  douyin: { min: 8, max: 18 },
  article: { min: 14, max: 30 },
  generic: { min: 8, max: 28 }
};

const bannedFragments = [
  "变量",
  "undefined",
  "null",
  "${"
];

const riskyClaims = ["全网都在骂", "彻底废了", "黑幕", "保送", "内定", "假球", "确认伤退", "内部矛盾", "被做掉"];

const templatePatterns = [
  /为什么.*会成为.*爆点/,
  /这场.*真正该怎么看/,
  /(.+)[：:]\s*为什么/,
  /(.+)[：:]\s*(.+)[：:]/,
  /120\+?\d+'.*为什么/
];

const platformLead: Record<string, string> = {
  bilibili: "B站版",
  xiaohongshu: "小红书版",
  weibo: "微博版",
  shortVideo: "短视频版",
  article: "公众号版"
};

export function cleanText(input: string) {
  let text = String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[：:]{2,}/g, "：")
    .replace(/([。！？!?])\1+/g, "$1")
    .replace(/([，、；;])\1+/g, "$1")
    .replace(/([。！？!?])([。！？!?])+/g, "$1")
    .replace(/\s+([。！？!?，、；：])/g, "$1")
    .replace(/([（(])\s+/g, "$1")
    .replace(/\s+([）)])/g, "$1")
    .trim();

  for (const fragment of bannedFragments) {
    text = text.replaceAll(fragment, "");
  }

  text = text
    .replace(/([。！？!?])\s*\1+/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return splitLongSentences(text);
}

export function cleanTitle(input: string, platform: PlatformTone = "generic") {
  let title = cleanText(input)
    .split("\n")[0]
    .replace(/^【.+?】/, "")
    .replace(/^#/, "")
    .replace(/[。！？!?]+$/g, "")
    .replace(/^[\d一二三四五六七八九十]+[.、]\s*/, "")
    .trim();

  title = removeTitleStacking(title);

  if (isBadTitle(title, platform)) {
    title = rewriteTitle(title, platform);
  }

  const limit = titleLimits[platform];
  if (countCjk(title) > limit.max) {
    title = trimTitle(title, limit.max);
  }

  return title || "赛事内容待编辑";
}

export function cleanList(items: string[], platform: PlatformTone = "generic", options: { title?: boolean; max?: number } = {}) {
  const seen = new Set<string>();

  return items
    .map((item) => options.title ? cleanTitle(item, platform) : cleanText(item))
    .filter((item) => {
      const key = normalizeForCompare(item);
      if (!key || seen.has(key)) return false;
      if (bannedFragments.some((fragment) => item.includes(fragment))) return false;
      seen.add(key);
      return true;
    })
    .slice(0, options.max ?? items.length);
}

export function validateGeneratedText(input: string, platform: PlatformTone = "generic", options: { title?: boolean; sourceBacked?: boolean } = {}) {
  const text = String(input ?? "");
  const issues: QualityIssue[] = [];

  if (options.title) {
    const length = countCjk(text);
    const limit = titleLimits[platform];
    if (length > limit.max || length < limit.min) {
      issues.push({ type: "title_length", message: `标题长度应为 ${limit.min}-${limit.max} 字` });
    }
  }

  if (/[：:]{2,}|[。！？!?]{2,}/.test(text)) {
    issues.push({ type: "punctuation", message: "存在重复标点" });
  }

  if (bannedFragments.some((fragment) => text.includes(fragment))) {
    issues.push({ type: "placeholder", message: "存在占位文本" });
  }

  if (riskyClaims.some((claim) => text.includes(claim))) {
    issues.push({ type: "risky_claim", message: "存在高风险表达" });
  }

  if (!options.sourceBacked && /(伤退|内讧|冲突|裁判黑|官方确认|更衣室|赛后采访)/.test(text)) {
    issues.push({ type: "unsourced_claim", message: "存在无来源事实断言" });
  }

  if (looksTemplateLike(text)) {
    issues.push({ type: "template", message: "表达像模板拼接" });
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

export function ensurePublishable(input: string, platform: PlatformTone = "generic", options: { title?: boolean; sourceBacked?: boolean } = {}) {
  const cleaned = options.title ? cleanTitle(input, platform) : cleanText(input);
  const result = validateGeneratedText(cleaned, platform, options);
  if (result.ok) return cleaned;
  return options.title ? rewriteTitle(cleaned, platform) : rewriteText(cleaned);
}

export function qualityControl<T>(value: T): T {
  return walkQuality(value) as T;
}

export function diversifyPlatformText<T extends Record<string, unknown>>(content: T): T {
  const used = new Set<string>();

  function walk(node: unknown, platform = ""): unknown {
    if (typeof node === "string") {
      const normalized = normalizeForCompare(node);
      if (normalized.length > 18 && used.has(normalized)) {
        return cleanText(`${platformLead[platform] ?? ""}${node}`);
      }
      used.add(normalized);
      return cleanText(node);
    }

    if (Array.isArray(node)) {
      return node.map((item) => walk(item, platform));
    }

    if (node && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([key, value]) => [
          key,
          walk(value, platform || key)
        ])
      );
    }

    return node;
  }

  return walk(content) as T;
}

function walkQuality(node: unknown): unknown {
  if (typeof node === "string") return cleanText(node);
  if (Array.isArray(node)) return node.map(walkQuality);

  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, value]) => [
        key,
        walkQuality(value)
      ])
    );
  }

  return node as QualityNode;
}

function removeTitleStacking(title: string) {
  return title
    .replace(/为什么会成为.+?爆点[？?]?[:：]?/g, "")
    .replace(/这场比赛真正该怎么看[？?]?/g, "")
    .replace(/这场.+真正该怎么看[？?]?/g, "")
    .replace(/[：:]\s*[：:]+/g, "：")
    .replace(/^[:：]/, "")
    .trim();
}

function isBadTitle(title: string, platform: PlatformTone) {
  const limit = titleLimits[platform];
  const length = countCjk(title);
  return (
    !title ||
    length > limit.max ||
    templatePatterns.some((pattern) => pattern.test(title)) ||
    title.split(/[：:]/).length > 2 ||
    /为什么.*为什么/.test(title)
  );
}

function rewriteTitle(title: string, platform: PlatformTone) {
  const compact = removeTitleStacking(title)
    .replace(/为什么/g, "")
    .replace(/会成为/g, "")
    .replace(/传播爆点/g, "值得看")
    .replace(/[？?]/g, "")
    .trim();

  if (compact && countCjk(compact) <= titleLimits[platform].max && !looksTemplateLike(compact)) {
    return compact;
  }

  return compact ? trimTitle(compact, titleLimits[platform].max) : "赛事内容待编辑";
}

function rewriteText(text: string) {
  return cleanText(text)
    .replace(/全网都在骂/g, "引发不少讨论")
    .replace(/彻底废了/g, "状态需要继续观察")
    .replace(/黑幕|保送|内定|假球/g, "争议点")
    .replace(/确认伤退/g, "伤情需核验")
    .replace(/内部矛盾/g, "内部情况需核验");
}

function looksTemplateLike(text: string) {
  return templatePatterns.some((pattern) => pattern.test(text)) || /(.{3,})\1{1,}/.test(normalizeForCompare(text));
}

function trimTitle(title: string, max: number) {
  const chars = Array.from(title);
  if (chars.length <= max) return title;
  return chars.slice(0, max).join("").replace(/[，、：:；;]$/g, "");
}

function countCjk(text: string) {
  return Array.from(text.replace(/\s/g, "")).length;
}

function normalizeForCompare(text: string) {
  return text.replace(/[，。！？、\s:：；;“”"'《》【】（）()]/g, "").toLowerCase();
}

function splitLongSentences(text: string) {
  return text
    .split(/(?<=[。！？\n])/)
    .map((sentence) => {
      if (sentence.length <= 96) return sentence;

      let passedFirstCut = false;
      return sentence.replace(/，/g, (match, offset) => {
        if (!passedFirstCut && offset > 42) {
          passedFirstCut = true;
          return "。";
        }
        return match;
      });
    })
    .join("")
    .replace(/([。！？])\1+/g, "$1")
    .replace(/\n{3,}/g, "\n\n");
}
