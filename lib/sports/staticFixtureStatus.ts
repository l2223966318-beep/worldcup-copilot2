import type { WorldCupMatch } from "@/lib/sports/types";
import { parseFixtureDate } from "@/lib/time/beijingTime";

const LIVE_WINDOW_BEFORE_MS = 15 * 60 * 1000;
const LIVE_WINDOW_AFTER_MS = 150 * 60 * 1000;

export function inferStaticFixtureStatus(
  kickoffTime?: string,
  now = new Date()
): WorldCupMatch["status"] {
  if (!kickoffTime) return "scheduled";

  const kickoffDate = parseFixtureDate(kickoffTime);
  if (!kickoffDate) return "scheduled";

  const current = now.getTime();
  const kickoff = kickoffDate.getTime();
  if (current < kickoff - LIVE_WINDOW_BEFORE_MS) return "scheduled";
  if (current <= kickoff + LIVE_WINDOW_AFTER_MS) return "live";
  return "finished";
}
