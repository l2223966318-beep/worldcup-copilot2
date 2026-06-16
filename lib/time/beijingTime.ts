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

export function convertLocalDateTimeInZoneToUtcIso(
  value: string | undefined,
  timeZone: string | undefined
) {
  if (!value || !timeZone) return value ?? "";

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return value;

  const [, year, month, day, hour, minute, second = "00"] = match;
  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  const guessDate = new Date(utcGuess);
  const offset = getTimeZoneOffsetMs(guessDate, timeZone);
  const corrected = new Date(utcGuess - offset);

  return corrected.toISOString();
}

function validDate(date: Date) {
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const second = Number(parts.find((part) => part.type === "second")?.value ?? "0");

  return Date.UTC(year, month - 1, day, hour, minute, second) - date.getTime();
}
