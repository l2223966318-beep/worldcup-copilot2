"use client";

import type { Paragraph, TextRun } from "docx";

import { downloadBlob } from "@/lib/download";

const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type ReportBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet"; text: string }
  | { type: "number"; text: string }
  | { type: "table"; rows: string[][] };

export async function downloadWordReport(filename: string, markdown: string) {
  const blob = await createWordReportBlob(markdown);
  downloadBlob(ensureDocxExtension(filename), blob);
}

export async function createWordReportBlob(markdown: string) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    HeadingLevel,
    LevelFormat,
    Packer,
    PageNumber,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType
  } = await import("docx");

  const blocks = parseMarkdown(markdown);
  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];
  let isFirstHeading = true;

  const createRuns = (text: string): TextRun[] => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
    return parts.map((part) => {
      const bold = part.startsWith("**") && part.endsWith("**");
      const code = part.startsWith("`") && part.endsWith("`");
      const content = bold ? part.slice(2, -2) : code ? part.slice(1, -1) : part;
      return new TextRun({
        text: content,
        bold,
        font: code ? "Consolas" : "Microsoft YaHei",
        color: code ? "047857" : "334155",
        shading: code ? { type: ShadingType.CLEAR, fill: "ECFDF5" } : undefined
      });
    });
  };

  for (const block of blocks) {
    if (block.type === "heading") {
      const style = isFirstHeading && block.level === 1
        ? "ReportTitle"
        : block.level <= 2
          ? HeadingLevel.HEADING_1
          : HeadingLevel.HEADING_2;
      children.push(new Paragraph({
        children: createRuns(block.text),
        heading: typeof style === "string" && style !== "ReportTitle" ? style : undefined,
        style: style === "ReportTitle" ? style : undefined,
        keepNext: true
      }));
      isFirstHeading = false;
      continue;
    }

    if (block.type === "bullet") {
      children.push(new Paragraph({
        children: createRuns(block.text),
        bullet: { level: 0 },
        spacing: { after: 120, line: 280 }
      }));
      continue;
    }

    if (block.type === "number") {
      children.push(new Paragraph({
        children: createRuns(block.text),
        numbering: { reference: "report-numbering", level: 0 },
        spacing: { after: 120, line: 280 }
      }));
      continue;
    }

    if (block.type === "table") {
      const columnCount = Math.max(...block.rows.map((row) => row.length));
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: Array.from({ length: columnCount }, () => Math.floor(9360 / columnCount)),
        rows: block.rows.map((row, rowIndex) => new TableRow({
          tableHeader: rowIndex === 0,
          children: Array.from({ length: columnCount }, (_, columnIndex) => new TableCell({
            width: { size: Math.floor(9360 / columnCount), type: WidthType.DXA },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            shading: rowIndex === 0 ? { type: ShadingType.CLEAR, fill: "F2F4F7" } : undefined,
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: row[columnIndex] ?? "",
                    bold: rowIndex === 0,
                    font: "Microsoft YaHei",
                    color: rowIndex === 0 ? "0F172A" : "334155",
                    size: 20
                  })
                ],
                spacing: { before: 0, after: 0, line: 260 },
                alignment: rowIndex === 0 ? AlignmentType.CENTER : AlignmentType.LEFT
              })
            ]
          }))
        })),
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: "D8E0E8" },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: "D8E0E8" },
          left: { style: BorderStyle.SINGLE, size: 4, color: "D8E0E8" },
          right: { style: BorderStyle.SINGLE, size: 4, color: "D8E0E8" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
          insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" }
        }
      }));
      children.push(new Paragraph({ spacing: { after: 80 } }));
      continue;
    }

    children.push(new Paragraph({
      children: createRuns(block.text),
      spacing: { after: 120, line: 280 }
    }));
  }

  const document = new Document({
    creator: "WorldCup Copilot",
    title: blocks.find((block) => block.type === "heading")?.text ?? "WorldCup Copilot 内容报告",
    description: "WorldCup Copilot 生成的赛事内容运营报告",
    styles: {
      default: {
        document: {
          run: { font: "Microsoft YaHei", size: 22, color: "334155" },
          paragraph: { spacing: { after: 120, line: 264 } }
        }
      },
      paragraphStyles: [
        {
          id: "ReportTitle",
          name: "Report Title",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Microsoft YaHei", size: 38, bold: true, color: "0F172A" },
          paragraph: { spacing: { before: 0, after: 280 }, keepNext: true }
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Microsoft YaHei", size: 30, bold: true, color: "047857" },
          paragraph: { spacing: { before: 320, after: 160 }, keepNext: true }
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Microsoft YaHei", size: 25, bold: true, color: "065F46" },
          paragraph: { spacing: { before: 240, after: 120 }, keepNext: true }
        }
      ]
    },
    numbering: {
      config: [
        {
          reference: "report-numbering",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 }
                }
              }
            }
          ]
        }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 }
          }
        },
        children,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: "WorldCup Copilot  ·  ", color: "64748B", size: 18, font: "Microsoft YaHei" }),
                  new TextRun({ children: [PageNumber.CURRENT], color: "64748B", size: 18, font: "Microsoft YaHei" })
                ]
              })
            ]
          })
        }
      }
    ]
  });

  const blob = await Packer.toBlob(document);
  return new Blob([blob], { type: WORD_MIME });
}

function parseMarkdown(markdown: string): ReportBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReportBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }

    if (line.startsWith("|") && lines[index + 1]?.trim().match(/^\|?[\s:-]+\|/)) {
      const rows: string[][] = [splitTableRow(line)];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "table", rows });
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      blocks.push({ type: "bullet", text: bullet[1].trim() });
      continue;
    }

    const number = line.match(/^\d+[.)]\s+(.+)$/);
    if (number) {
      blocks.push({ type: "number", text: number[1].trim() });
      continue;
    }

    blocks.push({ type: "paragraph", text: line });
  }

  return blocks;
}

function splitTableRow(line: string) {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function ensureDocxExtension(filename: string) {
  return filename.toLowerCase().endsWith(".docx") ? filename : `${filename}.docx`;
}
