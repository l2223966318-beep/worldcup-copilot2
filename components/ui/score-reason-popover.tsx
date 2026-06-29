"use client";

import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

type ScoreReasonPopoverProps = {
  title?: string;
  summary?: string;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
};

export function ScoreReasonPopover({
  title = "评分依据",
  summary = "查看这张卡片的分数解释。",
  children,
  align = "left",
  className = ""
}: ScoreReasonPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-slate-200 bg-white/88 px-2.5 text-[11px] font-semibold text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur transition duration-200 ease-out hover:border-emerald-200 hover:bg-white hover:text-slate-800"
      >
        <CircleHelp className="h-3.5 w-3.5" />
        <span>{title}</span>
      </button>

      <div
        id={panelId}
        className={`pointer-events-none absolute top-full z-30 mt-2 w-[260px] rounded-2xl border border-slate-200 bg-white/96 p-3 text-left shadow-[0_20px_42px_rgba(15,23,42,0.12)] backdrop-blur transition duration-200 ease-out ${
          align === "right" ? "right-0" : "left-0"
        } ${
          open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
        }`}
      >
        <div className="text-[11px] font-black tracking-[0.16em] text-slate-400">{title}</div>
        <div className="mt-1 text-xs font-semibold leading-5 text-slate-700">{summary}</div>
        <div className="mt-2 border-t border-slate-100 pt-2 text-xs leading-5 text-slate-600">{children}</div>
      </div>
    </div>
  );
}
