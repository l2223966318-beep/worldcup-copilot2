 "use client";

import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getCurrentProject, getTodayMatches } from "@/lib/project-api";
import { formatBeijingDateTime } from "@/lib/time/beijingTime";
import { type HistoryRecord, readHistoryRecords } from "@/lib/services/workflowStore";

export default function HistoryPage() {
  const project = getCurrentProject();
  const generated = getTodayMatches(project.id).filter((item) => item.status === "已生成" || item.generatedPlatforms.length);
  const [records, setRecords] = useState<HistoryRecord[]>([]);

  useEffect(() => {
    setRecords(readHistoryRecords());
  }, []);

  const hasRecords = records.length > 0;
  const staticExamples = useMemo(
    () =>
      generated.map((item) => ({
        matchId: item.match.id,
        title: item.match.name,
        score: item.match.score,
        stage: item.match.stage,
        savedAt: new Date().toISOString(),
        platforms: item.generatedPlatforms.length ? item.generatedPlatforms : ["示例报告"],
        route: `/matches/${item.match.id}`
      })),
    [generated]
  );

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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">最近保存的生成结果</h2>
            <p className="mt-1 text-sm text-slate-500">
              {hasRecords ? "这些记录来自你在单场分析页或报告页执行过的真实生成/导出动作。" : "还没有保存记录。先去单场页生成一次文案或导出一次内容包，这里就会出现历史记录。"}
            </p>
          </div>
          {!hasRecords ? (
            <Link href="/matches/argentina-france-2022-final" className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5">
              进入经典样例完整演示
            </Link>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[1.4fr_0.7fr_0.8fr_1fr_0.6fr] gap-4 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
            <div>比赛名称</div>
            <div>比分</div>
            <div>生成时间</div>
            <div>已生成平台</div>
            <div>操作</div>
          </div>
          {hasRecords
            ? records.map((item) => (
            <div key={item.id} className="grid grid-cols-[1.4fr_0.7fr_0.8fr_1fr_0.6fr] gap-4 border-t border-slate-200 px-4 py-4 text-sm">
              <div>
                <div className="font-semibold text-slate-950">{item.title}</div>
                <div className="mt-1 text-xs text-slate-500">{item.stage}</div>
              </div>
              <div className="font-semibold text-slate-900">{item.score}</div>
              <div className="text-slate-500">{formatBeijingDateTime(item.savedAt, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
              <div className="text-slate-600">{item.platforms.join(" / ")}</div>
              <Link href={item.route} className="inline-flex items-center gap-1 font-semibold text-blue-700">
                返回查看
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))
            : staticExamples.map((item) => (
            <div key={`${item.matchId}-example`} className="grid grid-cols-[1.4fr_0.7fr_0.8fr_1fr_0.6fr] gap-4 border-t border-slate-200 px-4 py-4 text-sm">
              <div>
                <div className="font-semibold text-slate-950">{item.title}</div>
                <div className="mt-1 text-xs text-slate-500">{item.stage}</div>
              </div>
              <div className="font-semibold text-slate-900">{item.score}</div>
              <div className="text-slate-500">示例入口</div>
              <div className="text-slate-600">{item.platforms.join(" / ")}</div>
              <Link href={item.route} className="inline-flex items-center gap-1 font-semibold text-blue-700">
                查看样例
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
