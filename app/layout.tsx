import type { Metadata } from "next";
import type { ReactNode } from "react";

import { FloatingKnowledgeAssistant } from "@/components/layout/floating-knowledge-assistant";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorldCup Copilot | 赛事热点拆解与分发工作台",
  description: "面向体育内容运营人员的赛后数据解读、内容生成、风险审稿和导出工作台。"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body>
        <div className="min-h-screen bg-[#f6f7fb] text-slate-950">
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Header />
              <main className="flex-1 px-4 py-5 lg:px-8">{children}</main>
            </div>
          </div>
          <FloatingKnowledgeAssistant />
        </div>
      </body>
    </html>
  );
}
