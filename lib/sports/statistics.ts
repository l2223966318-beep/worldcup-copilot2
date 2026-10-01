import type { TeamStats } from "@/data/matches";

export function hasVerifiedStatistics(stats: { teamA: TeamStats; teamB: TeamStats }) {
  return [...Object.values(stats.teamA), ...Object.values(stats.teamB)]
    .every(value => typeof value === "number" && Number.isFinite(value));
}

export function formatStatistic(value: number | null, suffix = "") {
  return value === null || !Number.isFinite(value) ? "暂无数据" : `${value}${suffix}`;
}

export function statisticDifference(left: number | null, right: number | null) {
  return left === null || right === null ? null : left - right;
}

export function statisticTotal(...values: Array<number | null>) {
  return values.some(value => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function shotAccuracy(onTarget: number | null, shots: number | null) {
  return onTarget === null || shots === null || shots === 0 ? null : Math.round(onTarget / shots * 100);
}
