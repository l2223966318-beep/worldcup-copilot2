"use client";

import { useMemo, useState } from "react";
import { HelpCircle, Search, X } from "lucide-react";

import { searchKnowledgeBase, suggestKnowledgeTerms } from "@/lib/project-api";

export function FloatingKnowledgeAssistant() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("什么是 xG？");
  const terms = useMemo(() => suggestKnowledgeTerms(), []);
  const answer = useMemo(() => searchKnowledgeBase(query, "worldcup-2026-ops"), [query]);

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <div className="w-[min(360px,calc(100vw-32px))] rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold">知识助手</div>
              <div className="text-xs text-slate-500">术语、规则、表达风险随时查询</div>
            </div>
            <button className="rounded-full p-2 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <label className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent outline-none"
              placeholder="搜索足球术语、数据指标、表达风险"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            {terms.map((term) => (
              <button
                key={term}
                className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                onClick={() => setQuery(term)}
              >
                {term}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3 text-sm leading-6">
            <div>
              <div className="font-semibold text-slate-900">简明解释</div>
              <p className="mt-1 text-slate-600">{answer}</p>
            </div>
            <div>
              <div className="font-semibold text-slate-900">运营理解</div>
              <p className="mt-1 text-slate-600">把概念转成普通用户能理解的比赛观察，不替代事实核查。</p>
            </div>
            <div>
              <div className="font-semibold text-slate-900">表达风险</div>
              <p className="mt-1 text-slate-600">涉及伤病、判罚和阴谋论定性时，建议补充来源并人工确认。</p>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700"
          aria-label="打开知识助手"
        >
          <HelpCircle className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
