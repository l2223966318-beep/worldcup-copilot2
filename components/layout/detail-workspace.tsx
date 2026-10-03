import type { ReactNode } from "react";
import { Check, Circle, Loader2, ShieldCheck } from "lucide-react";

export function WorkspaceHeading({ title, icon, trailing }: { title: string; icon: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
      <h2 className="flex min-w-0 items-center gap-3 text-xl font-semibold leading-7 text-slate-950">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">{icon}</span>
        {title}
      </h2>
      {trailing}
    </div>
  );
}

export type WorkspaceStep = {
  label: string;
  detail: string;
  state: "waiting" | "active" | "complete" | "warning";
};

export function WorkspaceStatus({ steps }: { steps: WorkspaceStep[] }) {
  return (
    <ol aria-label="内容处理进度" className="grid gap-4 sm:grid-cols-3">
      {steps.map((step, index) => (
        <li key={step.label} className="flex min-w-0 items-center gap-3">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${step.state === "complete" ? "bg-teal-600 text-white" : step.state === "active" ? "bg-sky-100 text-sky-700" : step.state === "warning" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
            {step.state === "complete" ? <Check aria-hidden="true" className="h-4 w-4" /> : step.state === "active" ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">{step.label}</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500" aria-live="polite">{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AuditPlaceholder({ loading = false }: { loading?: boolean }) {
  return (
    <div className="mt-5">
      <div className="flex min-h-44 flex-col items-center justify-center gap-3 bg-slate-50 px-5 py-7 text-center" role="status">
        {loading ? <Loader2 aria-hidden="true" className="h-10 w-10 animate-spin text-teal-600 motion-reduce:animate-none" /> : <ShieldCheck aria-hidden="true" className="h-10 w-10 text-teal-600" strokeWidth={1.5} />}
        <p className="text-base font-semibold text-slate-800">{loading ? "正在审核稿件" : "待审核"}</p>
      </div>
      <ul className="mt-3 divide-y divide-slate-100">
        {["真实性", "表达风险", "传播伦理", "平台适配"].map((label) => (
          <li key={label} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="font-medium text-slate-700">{label}</span>
            <Circle aria-label={loading ? "处理中" : "待审核"} className="h-3.5 w-3.5 text-slate-300" />
          </li>
        ))}
      </ul>
    </div>
  );
}
