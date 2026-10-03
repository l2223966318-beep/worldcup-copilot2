import type { PlatformDraft } from "@/types/workflow";

const labels: Record<string, string> = {
  title: "标题", heading: "标题", approach: "怎么做", reason: "说明",
  body: "正文", content: "正文", direct: "可直接发布版", reference: "编辑参考版",
  risk: "风险提示版", source: "来源", note: "说明", summary: "摘要"
};
const titleKeys = ["角度标题", "标题", "主标题", "title", "heading"];
const wrapperKeys = new Set(["draft", "选题", "topics", "angles", "sections", "段落", "内容"]);
const knownKeys = new Set([...Object.keys(labels), ...titleKeys, ...wrapperKeys, "怎么做", "说明", "正文", "风险提醒"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDraftShape(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0 && value.every(isDraftShape);
  return isRecord(value) && Object.keys(value).some((key) => knownKeys.has(key));
}

// Only unwrap complete, recognized AI documents; ordinary prose and unrelated JSON stay intact.
export function formatGeneratedDraft(value: unknown, depth = 0): string {
  if (depth > 8) return typeof value === "string" ? value : JSON.stringify(value) ?? "";
  if (typeof value === "string") {
    const text = value.trim();
    const unfenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)?.[1] ?? text;
    const candidate = unfenced.replace(/^\p{Extended_Pictographic}\uFE0F?\s*(?=[{\[])/u, "");
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isDraftShape(parsed)) return formatValue(parsed, depth + 1);
    } catch {
      // Generated prose is normally not JSON.
    }
    return text;
  }
  if (isDraftShape(value)) return formatValue(value, depth + 1);
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function formatValue(value: unknown, depth: number): string {
  if (depth > 8) return typeof value === "string" ? value : JSON.stringify(value) ?? "";
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (isRecord(item)) return formatRecord(item, depth + 1, index + 1);
      const text = formatGeneratedDraft(item, depth + 1);
      return text ? `${index + 1}. ${text}` : "";
    }).filter(Boolean).join("\n\n");
  }
  if (isRecord(value)) return formatRecord(value, depth);
  return formatGeneratedDraft(value, depth);
}

function formatRecord(value: Record<string, unknown>, depth: number, number?: number): string {
  const titleKey = titleKeys.find((key) => typeof value[key] === "string" && String(value[key]).trim());
  const title = titleKey ? String(value[titleKey]).trim() : "";
  const parts = title ? [number ? `${number}. ${title}` : `【${title}】`] : [];
  for (const [key, item] of Object.entries(value)) {
    if (key === titleKey || item === null || item === undefined) continue;
    const text = formatValue(item, depth + 1);
    if (!text) continue;
    if (wrapperKeys.has(key) || (title && (key === "content" || key === "body" || key === "正文"))) {
      parts.push(text);
    } else {
      const label = labels[key] ?? key;
      parts.push(text.includes("\n") ? `【${label}】\n${text}` : `${label}：${text}`);
    }
  }
  return parts.join("\n\n");
}

export function normalizePlatformDraft(draft: PlatformDraft): PlatformDraft {
  const sections = Array.isArray(draft.sections) ? draft.sections.map((section) => ({
    title: formatGeneratedDraft(section.title),
    content: formatGeneratedDraft(section.content)
  })) : [];
  return {
    ...draft,
    title: formatGeneratedDraft(draft.title),
    sections,
    body: formatGeneratedDraft(draft.body) || sections.map((section) => `【${section.title}】\n${section.content}`).join("\n\n")
  };
}

export type DraftBlock =
  | { kind: "heading"; text: string; number?: string }
  | { kind: "field"; label: string; text: string }
  | { kind: "paragraph"; text: string };

export function splitDraftBlocks(text: string): DraftBlock[] {
  const blocks: DraftBlock[] = [];
  let paragraph: string[] = [];
  function flush() {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  }
  for (const raw of formatGeneratedDraft(text).replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const bracket = line.match(/^(?:【([^】]+)】|\[([^\]]+)\])$/);
    const markdown = line.match(/^#{1,6}\s+(.+)$/);
    const numbered = line.match(/^(\d+)[.、]\s+(.{2,100})$/);
    const heading = bracket?.[1] ?? bracket?.[2] ?? markdown?.[1];
    if (heading || numbered) {
      flush();
      blocks.push({ kind: "heading", text: heading ?? numbered![2], number: numbered?.[1] });
      continue;
    }
    const field = line.match(/^(?:\p{Extended_Pictographic}\uFE0F?\s*)?(角度标题|标题|主标题|封面标题|视频标题|怎么做|说明|正文|摘要|素材|依据|来源|风险提醒|风险提示|开场|前三秒|第一段|第二段|第三段|结尾互动|封面|第\d+页)[：:]\s*(.*)$/u);
    if (field) {
      flush();
      blocks.push({ kind: "field", label: field[1], text: field[2] });
    } else paragraph.push(raw);
  }
  flush();
  return blocks;
}
