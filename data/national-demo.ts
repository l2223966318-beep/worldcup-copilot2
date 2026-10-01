import { exampleMatches } from "@/data/matches";
import type { AnalysisResult, EvidenceItem, MatchContext, WorkflowTopic } from "@/types/workflow";

export const DEMO_CASE_ID = "qatar-final-2022-v1";
export const DEMO_COLLECTED_AT = "2026-09-28";
export const demoSources = [
  { title: "FIFA：2022 世界杯决赛回顾", url: "https://www.fifa.com/en/tournaments/mens/worldcup/articles/argentina-france-2022-final-greatest-games" },
  { title: "FIFA：梅西表示将继续为阿根廷效力", url: "https://www.fifa.com/en/articles/world-cup-2022-qatar-argentina-france-messi-keep-playing" }
] as const;

export const demoMatch = {
  ...exampleMatches[0],
  keyPlayers: [],
  keyEvents: [
    { minute: "上半场", team: "阿根廷", type: "进球" as const, description: "阿根廷建立两球领先优势。" },
    { minute: "下半场", team: "法国", type: "进球" as const, description: "法国将比分追至 2-2，比赛进入加时。" },
    { minute: "加时赛", team: "法国", type: "进球" as const, description: "双方再次进球，加时赛结束时为 3-3。" },
    { minute: "点球大战", team: "阿根廷", type: "终场" as const, description: "阿根廷在点球大战中以 4-2 取胜。" }
  ],
  summary: "2022 世界杯决赛历史回放：阿根廷与法国加时后 3-3，阿根廷点球大战 4-2 取胜。技术统计为本地示例值，未经本案例核验，不得用于事实断言；内容仅使用附带来源支持的比分、比赛进程和赛后发言。"
};

export const demoEvidence: EvidenceItem[] = [
  { id: "E01", type: "match_event", text: "2022 世界杯决赛，阿根廷与法国加时后 3-3，阿根廷点球大战 4-2 取胜。", source: demoSources[0].title, sourceUrl: demoSources[0].url, occurredAt: "2022-12-18", relevance: 100 },
  { id: "E02", type: "hot_topic", text: "梅西在夺冠后表示将继续为阿根廷国家队效力。", source: demoSources[1].title, sourceUrl: demoSources[1].url, occurredAt: "2022-12-18", relevance: 100 }
];

export const demoContext: MatchContext = {
  id: demoMatch.id,
  matchInfo: { id: demoMatch.id, name: demoMatch.name, teamA: demoMatch.teamA, teamB: demoMatch.teamB, score: "3-3（点球 4-2）", stage: "历史赛事回放 · 决赛", time: demoMatch.time, sourceStatus: "historical-demo" },
  keyEvents: demoMatch.keyEvents,
  keyPlayers: [],
  stats: demoMatch.stats,
  verifiedStats: false,
  hotSignals: [],
  evidence: demoEvidence,
  summary: demoMatch.summary
};

export const demoTopics: WorkflowTopic[] = [
  { id: "timeline", title: "一场决赛，怎样讲清两次追平", category: "场内复盘", coreAngle: "用领先、追平、再领先、再追平和点球大战组织内容，让比分变化成为叙事主线。", reason: "同一份比赛资料可转为 B站复盘、微博讨论和图文时间线。", riskLevel: "低", recommendedFormat: "时间线视频 / 图文复盘" },
  { id: "after-final", title: "夺冠之后，梅西的国家队故事还在继续", category: "场外话题", coreAngle: "从 FIFA 报道的赛后发言切入，讨论夺冠之后的职业选择。", reason: "与本场决赛直接相关，有原始报道可核对；这是历史话题，不代表当前热榜。", riskLevel: "中", recommendedFormat: "人物短评 / 赛后话题" }
];

export const demoAnalysis: AnalysisResult = {
  matchId: demoMatch.id,
  summary: "本场有两条可展示的内容路径：比赛进程复盘，以及从赛后公开发言延伸的人物故事。",
  winLossReason: "将加时比分与点球大战结果分开表述。比分变化可支持叙事复盘，但不足以单独证明具体战术因果。",
  keyPlayers: ["梅西", "姆巴佩"],
  turningPoints: demoMatch.keyEvents.map((event) => event.description),
  dataInsights: ["加时后 3-3；点球大战 4-2。", "本案例不采用未核验的技术统计。"],
  communicationAngles: demoTopics.map((topic) => topic.coreAngle),
  sourceStatus: "fallback",
  message: "预置编辑分析示例，非实时 AI 生成。"
};

export const demoPlatforms = [
  { id: "bilibili", label: "B站", format: "videoScript" },
  { id: "weibo", label: "微博", format: "shortCopy" },
  { id: "xiaohongshu", label: "小红书", format: "cardStructure" }
] as const;
export type DemoPlatform = typeof demoPlatforms[number]["id"];

export const demoDrafts: Record<string, Record<DemoPlatform, string>> = {
  timeline: {
    bilibili: "【标题】\n一场决赛，怎样讲清两次追平\n\n【开场】\n如果只看最后的比分，你会错过这场决赛的转折。把领先、追平和点球大战放回时间线，故事才完整。\n\n【主体】\n第一段，交代阿根廷建立领先优势。第二段，把镜头转向法国追平比分的阶段。第三段，呈现加时双方再次进球、比分来到 3-3，再接入点球大战。每段只讲一个比分变化，配对应片段和字幕。\n\n【结尾】\n阿根廷点球大战 4-2 取胜。你会把哪个转折放在视频开头？\n\n【编辑提示】\n历史回放示例。剪辑前核对画面、时间与授权，不用比分代替战术分析。",
    weibo: "【标题】\n这场决赛，你记住的是哪个转折？\n\n【正文】\n回看 2022 世界杯决赛，从阿根廷领先到法国追平，再到加时赛和点球大战，比分一次次改变了比赛走向。加时后 3-3，阿根廷点球大战 4-2 取胜。\n如果用一段画面讲这场比赛，你会选择哪一段？\n\n【编辑提示】\n历史赛事讨论；比分来源见 FIFA 决赛回顾。",
    xiaohongshu: "【标题】\n用一条时间线看懂世界杯决赛\n\n【第1页：先看结果】\n2022 年阿根廷对法国：加时后 3-3，点球大战 4-2。\n\n【第2页：比赛怎么走到这里】\n阿根廷建立领先，法国追平；加时赛双方再次进球。用四个节点串起过程。\n\n【第3页：两个比分别混淆】\n3-3 是加时结束时的比分，4-2 是点球大战结果。\n\n【第4页：留下讨论】\n哪个转折最值得做成一张图？\n\n【编辑提示】\n历史回放，配图和事件顺序需人工核对。"
  },
  "after-final": {
    bilibili: "【标题】\n夺冠之后，梅西的故事还在继续\n\n【开场】\n拿到冠军，是否意味着故事就此结束？回到 2022 年决赛之后，FIFA 报道了梅西继续为阿根廷效力的表态。\n\n【主体】\n先交代决赛背景，再展示报道标题和出处。把赛后表态与比赛回顾连接起来，讨论一个人物在重大目标实现后的选择。\n\n【结尾】\n冠军可以是一个节点，未必是叙事的终点。你更想看夺冠过程，还是之后的故事？\n\n【编辑提示】\n只转述当时公开发言，不推测退役时间、心理活动或家庭决定。",
    weibo: "【标题】\n冠军之后，故事仍有下一章\n\n【正文】\n回看 2022 世界杯决赛后的报道，梅西表示将继续为阿根廷国家队效力。比起把夺冠写成终点，这个赛后表态也提供了一个人物故事的起点。\n你认为体育人物故事最动人的，是抵达目标，还是抵达之后的选择？\n\n【编辑提示】\n历史话题回顾；来源为 FIFA 当时报道，不代表最新动态。",
    xiaohongshu: "【标题】\n冠军之后，还能怎样讲人物故事\n\n【第1页：一个公开表态】\n2022 年世界杯夺冠后，梅西表示将继续为阿根廷国家队效力。\n\n【第2页：一个内容角度】\n把重大目标实现后的选择，作为人物故事切入口。\n\n【第3页：事实与观点分开】\n继续效力是当时公开表态；如何理解职业选择属于内容观点。\n\n【编辑提示】\n历史材料回顾。保留 FIFA 来源，不推测未来退役计划。"
  }
};
