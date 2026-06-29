"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/download";
import { buildContentReportFilename } from "@/lib/services/exportService";
import { downloadWordReport } from "@/lib/word-export";

export function ReportActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  async function copyReport() {
    await copyToClipboard(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function downloadReport() {
    const title = content.match(/^#\s+(.+)$/m)?.[1] ?? "赛事内容报告";
    await downloadWordReport(buildContentReportFilename({
      matchName: title,
      platform: "综合",
      topicTitle: "赛事内容报告"
    }), content);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" className="gap-2" onClick={copyReport}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "已复制" : "复制报告"}
      </Button>
      <Button variant="secondary" className="gap-2" onClick={() => void downloadReport()}>
        <Download className="h-4 w-4" />
        下载 Word
      </Button>
    </div>
  );
}
