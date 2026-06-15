export const BEIJING_TIME_ZONE = "Asia/Shanghai";

export function parseFixtureDate(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return validDate(new Date(`${trimmed}T00:00:00Z`));
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(trimmed)) {
    return validDate(new Date(`${trimmed}Z`));
  }

  return validDate(new Date(trimmed));
}

export function getBeijingDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BEIJING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
}

export function getBeijingDateKeyFromValue(value?: string) {
  const date = parseFixtureDate(value);
  return date ? getBeijingDateKey(date) : value?.slice(0, 10) ?? "";
}

export function formatBeijingDateTime(value: string, options: Intl.DateTimeFormatOptions) {
  const date = parseFixtureDate(value);
  if (!date) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_TIME_ZONE,
    hour12: false,
    ...options
  }).format(date);
}

function validDate(date: Date) {
  return Number.isNaN(date.getTime()) ? undefined : date;
}
