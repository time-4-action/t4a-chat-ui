import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
} from "docx";
import type { DocumentData, ContentBlock } from "./types";

function contentBlocksToParagraphs(blocks: ContentBlock[]): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      result.push(new Paragraph({ text: block.text, spacing: { after: 120 } }));
    } else if (block.type === "bullet_list") {
      for (const item of block.items) {
        result.push(new Paragraph({ text: item, bullet: { level: 0 }, spacing: { after: 60 } }));
      }
    } else if (block.type === "numbered_list") {
      block.items.forEach((item, i) => {
        result.push(new Paragraph({
          children: [new TextRun(`${i + 1}. ${item}`)],
          spacing: { after: 60 },
        }));
      });
    } else if (block.type === "table") {
      const tableRows = [
        new TableRow({
          children: block.headers.map((h) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
              width: { size: Math.floor(9000 / block.headers.length), type: WidthType.DXA },
            })
          ),
        }),
        ...block.rows.map((row) =>
          new TableRow({
            children: row.map((cell) =>
              new TableCell({
                children: [new Paragraph({ text: cell })],
                width: { size: Math.floor(9000 / row.length), type: WidthType.DXA },
              })
            ),
          })
        ),
      ];
      result.push(new Table({ rows: tableRows }));
      result.push(new Paragraph({ text: "", spacing: { after: 120 } }));
    } else if (block.type === "code") {
      result.push(new Paragraph({
        children: [new TextRun({ text: block.text, font: "Courier New", size: 18 })],
        spacing: { after: 120 },
      }));
    }
  }
  return result;
}

const HEADING_LEVELS: Record<1 | 2 | 3, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
};

export async function generateDocxFromDocument(data: DocumentData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: data.title, heading: HeadingLevel.TITLE, spacing: { after: 200 } }),
    ...(data.subtitle ? [new Paragraph({ text: data.subtitle, alignment: AlignmentType.CENTER, spacing: { after: 100 } })] : []),
    ...(data.author ? [new Paragraph({ children: [new TextRun({ text: `Author: ${data.author}`, italics: true })], spacing: { after: 300 } })] : []),
  ];

  for (const section of data.sections) {
    children.push(new Paragraph({
      text: section.heading,
      heading: HEADING_LEVELS[section.level],
      spacing: { before: 300, after: 120 },
    }));
    children.push(...contentBlocksToParagraphs(section.content));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function generateDocxFromMarkdown(markdown: string, title: string): Promise<Buffer> {
  const lines = markdown.split("\n");
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 200 } }),
  ];

  for (const line of lines) {
    if (line.startsWith("# ")) {
      children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }));
    } else if (line.startsWith("## ")) {
      children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 } }));
    } else if (line.startsWith("### ")) {
      children.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 60 } }));
    } else if (/^[-*]\s/.test(line)) {
      children.push(new Paragraph({ text: line.slice(2), bullet: { level: 0 }, spacing: { after: 60 } }));
    } else if (line.trim()) {
      // Strip basic markdown bold/italic
      const cleaned = line.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
      children.push(new Paragraph({ text: cleaned, spacing: { after: 80 } }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
