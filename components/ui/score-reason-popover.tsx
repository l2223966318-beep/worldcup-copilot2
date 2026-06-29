"use client";

import { CircleHelp } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ScoreReasonPopoverProps = {
  title?: string;
  summary?: string;
  children: ReactNode;
  align?: "left" | "right";
  placement?: "top" | "bottom";
  className?: string;
};

const PANEL_WIDTH = 260;
const VIEWPORT_GAP = 12;

export function ScoreReasonPopover({
  title = "评分依据",
  summary = "查看这张卡片的分数解释。",
  children,
  align = "left",
  placement = "bottom",
  className = ""
}: ScoreReasonPopoverProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
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

  useEffect(() => {
    if (!open || !buttonRef.current) return;

    function updatePosition() {
      const buttonRect = buttonRef.current?.getBoundingClientRect();
      const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 160;
      if (!buttonRect) return;

      let left = align === "right" ? buttonRect.right - PANEL_WIDTH : buttonRect.left;
      left = Math.min(Math.max(left, VIEWPORT_GAP), window.innerWidth - PANEL_WIDTH - VIEWPORT_GAP);

      const preferredTop = placement === "top";
      const topSpace = buttonRect.top - VIEWPORT_GAP;
      const bottomSpace = window.innerHeight - buttonRect.bottom - VIEWPORT_GAP;
      const canOpenTop = topSpace >= panelHeight + 8;
      const canOpenBottom = bottomSpace >= panelHeight + 8;

      const openOnTop = preferredTop ? canOpenTop || !canOpenBottom : !canOpenBottom && canOpenTop;
      const top = openOnTop ? buttonRect.top - panelHeight - 8 : buttonRect.bottom + 8;

      setPanelStyle({
        left,
        top: Math.max(VIEWPORT_GAP, top),
        width: PANEL_WIDTH
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, open, placement]);

  const panel = mounted
    ? createPortal(
        <div
          ref={panelRef}
          id={panelId}
          className={`pointer-events-none fixed z-[120] rounded-2xl border border-slate-200 bg-white/96 p-3 text-left shadow-[0_20px_42px_rgba(15,23,42,0.12)] backdrop-blur transition duration-200 ease-out ${
            open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
          }`}
          style={panelStyle}
        >
          <div className="text-[11px] font-black tracking-[0.16em] text-slate-400">{title}</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-slate-700">{summary}</div>
          <div className="mt-2 border-t border-slate-100 pt-2 text-xs leading-5 text-slate-600">{children}</div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div
        ref={containerRef}
        className={`relative inline-flex ${className}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={buttonRef}
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
      </div>
      {panel}
    </>
  );
}
