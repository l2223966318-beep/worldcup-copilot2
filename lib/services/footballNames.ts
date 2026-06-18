const teamNames: Record<string, string> = {
  japan: "日本",
  "united states": "美国",
  usa: "美国",
  usmnt: "美国",
  canada: "加拿大",
  mexico: "墨西哥",
  germany: "德国",
  france: "法国",
  argentina: "阿根廷",
  brazil: "巴西",
  england: "英格兰",
  spain: "西班牙",
  portugal: "葡萄牙",
  "congo dr": "刚果（金）",
  "dr congo": "刚果（金）",
  "democratic republic of the congo": "刚果（金）",
  "south africa": "南非",
  "bosnia and herzegovina": "波黑",
  "bosnia & herzegovina": "波黑",
  panama: "巴拿马",
  uzbekistan: "乌兹别克斯坦",
  algeria: "阿尔及利亚",
  jordan: "约旦",
  iraq: "伊拉克",
  curacao: "库拉索",
  "curaçao": "库拉索",
  "ivory coast": "科特迪瓦",
  "cote d'ivoire": "科特迪瓦",
  "côte d’ivoire": "科特迪瓦",
  "cape verde": "佛得角",
  haiti: "海地",
  "costa rica": "哥斯达黎加",
  italy: "意大利",
  netherlands: "荷兰",
  belgium: "比利时",
  uruguay: "乌拉圭",
  paraguay: "巴拉圭",
  colombia: "哥伦比亚",
  ecuador: "厄瓜多尔",
  australia: "澳大利亚",
  "korea republic": "韩国",
  "south korea": "韩国",
  korea: "韩国",
  iran: "伊朗",
  "saudi arabia": "沙特阿拉伯",
  qatar: "卡塔尔",
  morocco: "摩洛哥",
  tunisia: "突尼斯",
  egypt: "埃及",
  senegal: "塞内加尔",
  nigeria: "尼日利亚",
  ghana: "加纳",
  croatia: "克罗地亚",
  serbia: "塞尔维亚",
  switzerland: "瑞士",
  denmark: "丹麦",
  norway: "挪威",
  czechia: "捷克",
  "czech republic": "捷克",
  austria: "奥地利",
  poland: "波兰",
  sweden: "瑞典",
  wales: "威尔士",
  scotland: "苏格兰",
  ukraine: "乌克兰",
  turkey: "土耳其",
  chile: "智利",
  peru: "秘鲁",
  bolivia: "玻利维亚",
  venezuela: "委内瑞拉",
  "new zealand": "新西兰"
};

const statusNames: Record<string, string> = {
  scheduled: "未开始",
  "not started": "未开始",
  "time to be defined": "时间待定",
  "match finished": "已结束",
  finished: "已结束",
  ended: "已结束",
  closed: "已结束",
  live: "进行中",
  "in progress": "进行中",
  "1st half": "上半场",
  "first half": "上半场",
  "2nd half": "下半场",
  "second half": "下半场",
  halftime: "中场休息",
  postponed: "延期",
  cancelled: "取消"
};

const venueNames: Record<string, string> = {
  "houston, tx, usa": "休斯敦，美国",
  "houston stadium": "休斯敦体育场",
  "mexico city stadium": "墨西哥城体育场",
  "mexico city, mexico": "墨西哥城，墨西哥",
  "estadio guadalajara": "瓜达拉哈拉体育场",
  "guadalajara, mexico": "瓜达拉哈拉，墨西哥",
  "toronto stadium": "多伦多体育场",
  "toronto, on, canada": "多伦多，加拿大",
  "dallas stadium": "达拉斯体育场",
  "arlington, tx, usa": "阿灵顿，美国",
  "los angeles stadium": "洛杉矶体育场",
  "inglewood, ca, usa": "英格尔伍德，美国",
  "san francisco bay area stadium": "旧金山湾区体育场",
  "santa clara, ca, usa": "圣克拉拉，美国",
  "new york new jersey stadium": "纽约/新泽西体育场",
  "new york/new jersey (east rutherford)": "纽约/新泽西",
  "east rutherford, nj, usa": "东卢瑟福，美国",
  "boston stadium": "波士顿体育场",
  "foxborough, ma, usa": "福克斯伯勒，美国",
  "bc place vancouver": "温哥华 BC Place",
  "vancouver, canada": "温哥华，加拿大",
  "philadelphia stadium": "费城体育场",
  "philadelphia, pa, usa": "费城，美国",
  "estadio monterrey": "蒙特雷体育场",
  "guadalupe, mexico": "瓜达卢佩，墨西哥",
  "atlanta stadium": "亚特兰大体育场",
  "atlanta, ga, usa": "亚特兰大，美国",
  "seattle field": "西雅图球场",
  "seattle, wa, usa": "西雅图，美国",
  "miami stadium": "迈阿密体育场",
  "miami, fl, usa": "迈阿密，美国",
  "miami (miami gardens)": "迈阿密",
  "kansas city stadium": "堪萨斯城体育场",
  "kansas city, mo, usa": "堪萨斯城，美国"
};

export function localizeTeamName(name: string) {
  return teamNames[normalize(name)] ?? name;
}

export function localizeCompetitionName(name: string) {
  const normalized = normalize(name);
  if (normalized.includes("fifa world cup 2026")) return "2026 世界杯";
  if (normalized.includes("fifa world cup")) return "世界杯";
  return name;
}

export function localizeRoundName(name: string) {
  const normalized = normalize(name);
  if (normalized.includes("group stage")) return "小组赛";
  if (normalized.includes("regular season") || normalized.includes("league")) {
    const round = normalized.match(/round\s+(\d+)/);
    return round?.[1] ? `小组赛第 ${round[1]} 轮` : "小组赛";
  }
  if (normalized.startsWith("round ")) {
    const round = normalized.match(/round\s+(\d+)/);
    return round?.[1] ? `第 ${round[1]} 轮` : "轮次待定";
  }
  if (normalized.includes("round of 16")) return "1/8 决赛";
  if (normalized.includes("quarter")) return "1/4 决赛";
  if (normalized.includes("semi")) return "半决赛";
  if (normalized.includes("final")) return "决赛";
  return name;
}

export function localizeMatchStatus(status: string) {
  return statusNames[normalize(status)] ?? status;
}

export function localizeVenueText(value?: string) {
  if (!value) return "场馆待确认";
  const normalized = normalize(value);
  return venueNames[normalized] ?? value.replace(/\bUSA\b/g, "美国").replace(/\bUnited States\b/g, "美国");
}

function normalize(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}
