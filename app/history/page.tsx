import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

import { getCurrentProject, getTodayMatches } from "@/lib/project-api";

export default function HistoryPage() {
  const project = getCurrentProject();
  const generated = getTodayMatches(project.id).filter((item) => item.status === "已生成" || item.generatedPlatforms.length);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">历史记录</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">查看之前生成过的比赛内容，支持按项目、时间、球队继续扩展搜索。</p>
        <div className="mt-5 flex max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          <Search className="h-4 w-4" />
          <span>搜索比赛、球队、生成平台</span>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[1.4fr_0.7fr_0.8fr_1fr_0.6fr] gap-4 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
            <div>比赛名称</div>
            <div>比分</div>
            <div>生成时间</div>
            <div>已生成平台</div>
            <div>操作</div>
          </div>
          {generated.map((item) => (
            <div key={item.match.id} className="grid grid-cols-[1.4fr_0.7fr_0.8fr_1fr_0.6fr] gap-4 border-t border-slate-200 px-4 py-4 text-sm">
              <div>
                <div className="font-semibold text-slate-950">{item.match.name}</div>
                <div className="mt-1 text-xs text-slate-500">{item.match.stage}</div>
              </div>
              <div className="font-semibold text-slate-900">{item.match.score}</div>
              <div className="text-slate-500">今天 18:30</div>
              <div className="text-slate-600">{item.generatedPlatforms.join(" / ") || "示例报告"}</div>
              <Link href={`/matches/${item.match.id}`} className="inline-flex items-center gap-1 font-semibold text-blue-700">
                查看报告
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
