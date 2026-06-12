"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Home, Search } from "lucide-react";

import { getCurrentProject } from "@/lib/project-api";
import { cn } from "@/lib/utils";

const mobileNav = [
  { href: "/", label: "首页" },
  { href: "/history", label: "历史" },
  { href: "/settings", label: "设置" }
];

export function Header() {
  const pathname = usePathname();
  const project = getCurrentProject();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white lg:hidden">
            <Home className="h-5 w-5" />
          </Link>
          <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-900">
            <span className="text-slate-500">当前项目：</span>
            <span>{project.name}</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="hidden w-full max-w-[420px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 md:flex">
          <Search className="h-4 w-4" />
          <span>搜索比赛、球队、球员</span>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
        {mobileNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-xl px-3 py-1.5 text-sm font-medium text-slate-500",
              pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                ? "bg-blue-50 text-blue-700"
                : "hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
