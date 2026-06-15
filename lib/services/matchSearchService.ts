type SearchableMatch = {
  id: string;
  competition?: string;
  round?: string;
  kickoffTime?: string;
  status?: string;
  statusText?: string;
  homeTeam?: { name?: string };
  awayTeam?: { name?: string };
  venue?: { name?: string; city?: string };
  score?: { display?: string };
};

const aliases: Record<string, string[]> = {
  日本: ["japan", "jpn", "日本"],
  美国: ["united states", "usa", "usmnt", "america", "美国"],
  中国: ["china", "chn", "中国"],
  韩国: ["korea", "south korea", "kor", "韩国"],
  德国: ["germany", "ger", "德国"],
  法国: ["france", "fra", "法国"],
  阿根廷: ["argentina", "arg", "阿根廷"],
  巴西: ["brazil", "bra", "巴西"],
  英格兰: ["england", "eng", "英格兰"],
  西班牙: ["spain", "esp", "西班牙"],
  葡萄牙: ["portugal", "por", "葡萄牙"],
  墨西哥: ["mexico", "mex", "墨西哥"]
};

export function filterMatchesByQuery<T extends SearchableMatch>(matches: T[], query: string): T[] {
  const terms = expandQueryTerms(query);
  if (!terms.length) return matches;

  return matches.filter((match) => {
    const haystack = normalize(
      [
        match.id,
        match.competition,
        match.round,
        match.kickoffTime,
        match.status,
        match.statusText,
        match.homeTeam?.name,
        match.awayTeam?.name,
        match.venue?.name,
        match.venue?.city,
        match.score?.display
      ].filter(Boolean).join(" ")
    );

    return terms.some((term) => haystack.includes(term));
  });
}

export function queryLooksLikeMatchSearch(query: string) {
  const normalized = normalize(query);
  if (!normalized) return false;
  if (Object.keys(aliases).some((key) => normalized.includes(normalize(key)))) return true;
  return /(比赛|球队|赛程|vs|小组|决赛|japan|usa|china|korea|germany|france|argentina|brazil)/i.test(normalized);
}

function expandQueryTerms(query: string) {
  const normalized = normalize(query);
  const parts = normalized.split(/\s+/).filter(Boolean);
  const expanded = new Set(parts);

  for (const [cn, values] of Object.entries(aliases)) {
    if (normalized.includes(normalize(cn)) || values.some((value) => normalized.includes(normalize(value)))) {
      values.forEach((value) => expanded.add(normalize(value)));
      expanded.add(normalize(cn));
    }
  }

  return Array.from(expanded).filter((term) => !["比赛", "球队", "赛程"].includes(term));
}

function normalize(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}
