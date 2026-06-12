import type { ReactNode } from "react";

import { getCurrentProject, getProjectDataSource, getProjectOutputPlatforms } from "@/lib/project-api";

export default function SettingsPage() {
  const project = getCurrentProject();
  const dataSource = getProjectDataSource(project.id);
  const platforms = getProjectOutputPlatforms(project.id);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">项目设置</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">后台能力集中在这里配置，不污染首页和单场比赛分析流程。</p>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <SettingsSection title="项目基础信息">
          <KeyValue label="项目名称" value={project.name} />
          <KeyValue label="赛事类型" value={project.eventType} />
          <KeyValue label="项目描述" value={project.description} />
        </SettingsSection>

        <SettingsSection title="数据源设置">
          <KeyValue label="当前数据源" value={dataSource.name} />
          <KeyValue label="连接状态" value={dataSource.status} />
          <KeyValue label="更新频率" value={dataSource.updateFrequency} />
          <KeyValue label="字段结构" value={dataSource.fields.join(" / ")} />
          <button className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">测试连接</button>
        </SettingsSection>

        <SettingsSection title="输出平台设置">
          <KeyValue label="启用平台" value={platforms.join(" / ")} />
          <KeyValue label="平台模板" value="赛后复盘、热点短评、数据解读、争议讨论、球员故事" />
          <KeyValue label="默认格式" value="平台卡片 + Markdown 导出" />
        </SettingsSection>

        <SettingsSection title="风险审稿规则">
          <div className="flex flex-wrap gap-2">
            {["引战表达", "阴谋论表达", "未证实伤病", "争议判罚", "过度夸大", "攻击球员或裁判"].map((rule) => (
              <span key={rule} className="rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700">
                {rule}
              </span>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection title="知识库管理">
          <div className="flex flex-wrap gap-2">
            {["足球基础术语", "数据指标解释", "战术概念", "赛事规则", "内容表达风险"].map((item) => (
              <span key={item} className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                {item}
              </span>
            ))}
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-sm leading-6 text-slate-800">{value}</div>
    </div>
  );
}
