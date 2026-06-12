import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, CircleDot, Clock3 } from "lucide-react";

import { getCurrentProject, getTodayMatches, type MatchTask } from "@/lib/project-api";

export default function DashboardPage() {
  const project = getCurrentProject();
  const matches = getTodayMatches(project.id);
  const pending = matches.filter((item) => item.status === "待处理");
  const generated = matches.filter((item) => item.status === "已生成");
  const live = matches.filter((item) => item.status === "进行中");
  const upcoming = matches.filter((item) => item.status === "未开始");

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-blue-700">当前项目</div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-normal text-slate-950 lg:text-[32px]">{project.name}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{project.description}</p>
            </div>
            <div className="rounded-2xl bg-slate-950 px-5 py-4 text-white">
              <div className="text-xs text-slate-300">今日待处理</div>
              <div className="mt-1 text-4xl font-semibold">{pending.length}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <OverviewStat label="今日比赛" value={matches.length} icon={CalendarClock} />
          <OverviewStat label="已结束" value={pending.length + generated.length} icon={CheckCircle2} />
          <OverviewStat label="已生成" value={generated.length} icon={CircleDot} />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">今日待处理比赛</h2>
            <p className="mt-1 text-sm text-slate-500">优先处理已经结束、内容价值最高的比赛。</p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">赛后任务收件箱</span>
        </div>

        <div className="mt-5 grid gap-4">
          {pending.map((item) => (
            <MatchInboxCard key={item.match.id} task={item} primary />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <MatchList title="已生成比赛" description="可直接查看已产出的报告。" matches={generated} actionLabel="查看报告" />
        <MatchList title="进行中比赛" description="先关注赛况，结束后再进入分析。" matches={live} actionLabel="关注赛况" />
        <MatchList title="未开始比赛" description="只做赛程提醒，不提前堆功能。" matches={upcoming} actionLabel="查看赛程" empty="暂无未开始比赛" />
      </div>
    </div>
  );
}

function OverviewStat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof CalendarClock }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <Icon className="h-5 w-5 text-blue-600" />
      <div className="mt-6 text-3xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );
}

function MatchInboxCard({ task, primary = false }: { task: MatchTask; primary?: boolean }) {
  return (
    <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[88px_1fr_auto] lg:items-center">
      <div className="flex items-center gap-3 lg:block">
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-semibold ${priorityClass(task.priority)}`}>
          {task.priority}
        </div>
        <div className="text-sm text-slate-500 lg:mt-2">内容优先级</div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-2xl font-semibold text-slate-950">
            {task.match.teamA} <span className="text-blue-600">{task.match.score}</span> {task.match.teamB}
          </h3>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{task.status}</span>
          {task.endedAgo ? <span className="text-sm text-slate-500">{task.endedAgo}</span> : null}
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">数据亮点：{task.highlight}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {task.recommendedDirections.map((direction) => (
            <span key={direction} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
              {direction}
            </span>
          ))}
        </div>
      </div>

      {primary ? (
        <Link
          href={`/matches/${task.match.id}`}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
        >
          开始分析
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <Link href={`/matches/${task.match.id}`} className="text-sm font-semibold text-blue-700 hover:text-blue-800">
          查看详情
        </Link>
      )}
    </div>
  );
}

function MatchList({
  title,
  description,
  matches,
  actionLabel,
  empty = "暂无数据"
}: {
  title: string;
  description: string;
  matches: MatchTask[];
  actionLabel: string;
  empty?: string;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-5 space-y-3">
        {matches.length ? (
          matches.map((item) => (
            <div key={item.match.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="font-semibold text-slate-950">{item.match.teamA} {item.match.score} {item.match.teamB}</div>
              <div className="mt-1 text-sm text-slate-500">{item.match.name}</div>
              {item.generatedPlatforms.length ? (
                <div className="mt-3 text-xs text-slate-500">已生成：{item.generatedPlatforms.join(" / ")}</div>
              ) : null}
              <Link href={`/matches/${item.match.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700">
                {actionLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">{empty}</div>
        )}
      </div>
    </section>
  );
}

function priorityClass(priority: MatchTask["priority"]) {
  if (priority === "S") return "bg-rose-50 text-rose-700 ring-1 ring-rose-100";
  if (priority === "A") return "bg-amber-50 text-amber-700 ring-1 ring-amber-100";
  return "bg-blue-50 text-blue-700 ring-1 ring-blue-100";
}
