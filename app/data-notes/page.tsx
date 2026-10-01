import { Badge } from "@/components/ui/badge";

const notes = [
  { title: "赛事来源", body: "配置 Sportradar 接口后优先读取其赛程、比分、统计和事件；免费备用源为 WorldCup26 与 TheStatsAPI。页面标注实际返回的来源，不把备用数据写成 Sportradar 数据。" },
  { title: "热点来源", body: "热点通过已配置的搜索、榜单接口或手动输入获取。来源链接用于回查；热度和关键词关联不等于事实已确认，也不代表可直接转载原始内容。" },
  { title: "时间与状态", body: "赛程按北京时间展示。更新时间是系统获取数据的时间，不是赛事发生时间；历史赛事、缓存结果和实时返回分别标注，比赛池不等同于当天赛程。" },
  { title: "示例与输入", body: "经典案例用于演示完整流程，不作为当日新闻。用户手动输入的比赛或热点尚需核验，来源真实性不能仅靠 AI 确认。" },
  { title: "数据缺失", body: "缺少技术统计时显示未知，不补写成零。免费源不一定包含完整事件和深度统计；不能据此推断伤病、争议、球员言论或其他未提供的事实。" },
  { title: "凭据与隐私", body: "设置页填写的个人 API Key 保存在当前浏览器 localStorage，并按请求发送给本站服务端调用对应接口。共享 AI 访问口令仅存于当前标签页的会话存储；不要在公共电脑上保留个人 Key。" },
  { title: "AI 与人工审核", body: "AI 用于分析、选题和创作辅助。本地核验只是规则检查，不是事实认证；模型不可用或审核信息不完整时，保留待人工确认状态。" },
  { title: "使用边界", body: "公开可访问不等于拥有转载、商用或再分发许可。正式使用仍需核实接口条款、原素材版权和个人信息处理要求；当前版本不自动发布到内容平台。" }
];

export default function DataNotesPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0d3553]/90 via-[#0b223b]/80 to-[#173516]/75 p-6 shadow-soft-xl backdrop-blur-2xl lg:p-8">
        <Badge variant="warning" className="mb-5">About</Badge>
        <h1 className="text-4xl font-semibold tracking-normal lg:text-6xl">数据说明</h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-100">
          说明当前版本的数据来源、隐私边界和 AI 生成内容的使用限制。
        </p>
      </section>

      <dl className="divide-y divide-emerald-100 border-y border-emerald-100">
        {notes.map((note) => (
          <div key={note.title} className="grid gap-3 py-5 md:grid-cols-[160px_minmax(0,1fr)]">
            <dt className="text-lg font-bold text-slate-950">{note.title}</dt>
            <dd className="max-w-4xl text-base leading-7 text-slate-600">{note.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
