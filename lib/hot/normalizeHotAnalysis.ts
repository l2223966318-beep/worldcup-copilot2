import type { HotAnalysisResult, HotInsight } from "./hotTopicWorkflow";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function scalarText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

// Models sometimes return insight objects in fields requested as plain text.
function text(value: unknown): string {
  const scalar = scalarText(value);
  if (scalar) return scalar;
  const item = record(value);
  const heading = [scalarText(item.label), scalarText(item.value)].filter(Boolean).join(": ");
  return [heading, scalarText(item.note)].filter(Boolean).join("; ");
}

function list(value: unknown, fallback: string[]): string[] {
  const normalized = Array.isArray(value) ? value.map(text).filter(Boolean) : [];
  return (normalized.length ? normalized : fallback.map(text).filter(Boolean)).slice(0, 2);
}

function insights(value: unknown, fallback: HotInsight[]): HotInsight[] {
  const normalized = (Array.isArray(value) ? value : []).map(record).map(item => ({
    label: text(item.label),
    value: text(item.value),
    note: text(item.note)
  })).filter(item => item.label && item.value && item.note);
  return (normalized.length ? normalized : fallback).slice(0, 3);
}

export function normalizeHotAnalysis(value: unknown, fallback: HotAnalysisResult): HotAnalysisResult {
  const input = record(value);
  return {
    overview: insights(input.overview, fallback.overview),
    production: insights(input.production, fallback.production),
    whyCare: list(input.whyCare, fallback.whyCare),
    relation: list(input.relation, fallback.relation),
    angles: list(input.angles, fallback.angles),
    platforms: list(input.platforms, fallback.platforms),
    factsToVerify: list(input.factsToVerify, fallback.factsToVerify),
    risks: list(input.risks, fallback.risks)
  };
}
