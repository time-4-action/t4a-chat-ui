import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import type { DocumentData, ContentBlock } from "./types";

/**
 * Strip characters that WinAnsi-encoded fonts (Helvetica, Courier, etc.) cannot
 * render. Keeps printable ASCII (0x20–0x7E) plus the Latin-1 Supplement block
 * (0xA0–0xFF). Everything outside those ranges is either replaced with a close
 * ASCII equivalent or dropped.
 */
function sanitize(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")   // curly single quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')   // curly double quotes
    .replace(/[\u2013\u2014]/g, "-")                // en/em dash
    .replace(/\u2026/g, "...")                      // ellipsis
    .replace(/\u2022/g, "-")                        // bullet → plain hyphen (WinAnsi safe)
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");        // drop everything else
}

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 60;
const CW = PAGE_W - MARGIN * 2; // 475 pt

interface Ctx {
  doc: PDFDocument;
  pages: PDFPage[];
  bold: PDFFont;
  regular: PDFFont;
  mono: PDFFont;
  y: number;
}

function pg(ctx: Ctx): PDFPage {
  return ctx.pages[ctx.pages.length - 1];
}

function newPage(ctx: Ctx) {
  const p = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pages.push(p);
  ctx.y = PAGE_H - MARGIN;
}

function reserve(ctx: Ctx, h: number) {
  if (ctx.y - h < MARGIN) newPage(ctx);
}

/**
 * Truncate `str` so it fits within `maxW` pts.
 * Never calls pdf-lib drawText with maxWidth — we handle it ourselves.
 */
function fit(str: string, font: PDFFont, size: number, maxW: number): string {
  str = sanitize(str);
  if (font.widthOfTextAtSize(str, size) <= maxW) return str;
  let s = str;
  while (s.length > 1) {
    s = s.slice(0, -1);
    if (font.widthOfTextAtSize(s + "…", size) <= maxW) return s + "…";
  }
  return "…";
}

/**
 * Word-wrap `str` into lines that fit within `maxW` pts.
 */
function wrapLines(str: string, font: PDFFont, size: number, maxW: number): string[] {
  str = sanitize(str);
  if (!str.trim()) return [""];
  const words = str.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxW) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      // If a single word exceeds maxW, truncate it
      cur = fit(w, font, size, maxW);
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/**
 * Draw word-wrapped text, advancing ctx.y downward.
 * Does NOT pass maxWidth to pdf-lib — we wrap ourselves.
 */
function drawText(
  ctx: Ctx,
  str: string,
  font: PDFFont,
  size: number,
  x = MARGIN,
  maxW = CW,
  afterGap = 3,
) {
  const effectiveMaxW = maxW - Math.max(0, x - MARGIN);
  const lh = Math.ceil(size * 1.35);
  const lines = wrapLines(str, font, size, effectiveMaxW);
  for (const line of lines) {
    reserve(ctx, lh + afterGap);
    ctx.y -= lh;
    pg(ctx).drawText(line, { x, y: ctx.y, size, font, color: rgb(0.08, 0.08, 0.08) });
    ctx.y -= afterGap;
  }
}

function drawRule(ctx: Ctx) {
  reserve(ctx, 12);
  ctx.y -= 5;
  pg(ctx).drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + CW, y: ctx.y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  ctx.y -= 7;
}

/**
 * Draw a table.
 *
 * Critical invariant: ctx.y is only modified ONCE per row (after drawing all
 * columns), never inside the column loop. Every cell in a row uses the same
 * textY value computed before the column loop begins.
 */
function drawTable(ctx: Ctx, headers: string[], rows: string[][]) {
  const cols = headers.length;
  if (cols === 0) return;

  const colW = Math.floor(CW / cols);
  const PAD = 5;
  const cellW = colW - PAD * 2;
  const ROW_H = 18;    // total height of each row
  const TEXT_LIFT = 5; // how far above the row bottom the baseline sits

  // ── Header row ─────────────────────────────────────────────────────────────
  reserve(ctx, ROW_H + 4);

  // Grey background — drawn from (MARGIN, ctx.y - ROW_H) upward by ROW_H
  pg(ctx).drawRectangle({
    x: MARGIN,
    y: ctx.y - ROW_H,
    width: CW,
    height: ROW_H,
    color: rgb(0.88, 0.88, 0.88),
  });

  // Baseline Y for all header cells — fixed, computed before the loop
  const headerTextY = ctx.y - ROW_H + TEXT_LIFT;

  for (let i = 0; i < cols; i++) {
    const label = fit(headers[i] ?? "", ctx.bold, 9, cellW);
    pg(ctx).drawText(label, {
      x: MARGIN + i * colW + PAD,
      y: headerTextY,   // same for every column
      size: 9,
      font: ctx.bold,
      color: rgb(0.1, 0.1, 0.1),
    });
  }

  ctx.y -= ROW_H + 2; // advance cursor once, after all columns are drawn

  // ── Data rows ──────────────────────────────────────────────────────────────
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    reserve(ctx, ROW_H + 2);

    // Alternating zebra stripe
    if (ri % 2 === 1) {
      pg(ctx).drawRectangle({
        x: MARGIN,
        y: ctx.y - ROW_H,
        width: CW,
        height: ROW_H,
        color: rgb(0.96, 0.96, 0.96),
      });
    }

    // Baseline Y for all cells in this row — fixed, computed once
    const cellTextY = ctx.y - ROW_H + TEXT_LIFT;

    for (let ci = 0; ci < cols; ci++) {
      const cell = fit(String(row[ci] ?? ""), ctx.regular, 9, cellW);
      pg(ctx).drawText(cell, {
        x: MARGIN + ci * colW + PAD,
        y: cellTextY,   // NEVER changes inside this loop
        size: 9,
        font: ctx.regular,
        color: rgb(0.15, 0.15, 0.15),
      });
    }

    ctx.y -= ROW_H + 2; // advance cursor once, after all columns
  }

  // Bottom border
  pg(ctx).drawLine({
    start: { x: MARGIN, y: ctx.y + 2 },
    end: { x: MARGIN + CW, y: ctx.y + 2 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  ctx.y -= 8;
}

function drawBlocks(ctx: Ctx, content: ContentBlock[]) {
  for (const b of content) {
    switch (b.type) {
      case "paragraph":
        drawText(ctx, b.text, ctx.regular, 11, MARGIN, CW, 3);
        ctx.y -= 3;
        break;
      case "bullet_list":
        for (const item of b.items) {
          drawText(ctx, "\u2022  " + item, ctx.regular, 11, MARGIN + 14, CW - 14, 2);
        }
        ctx.y -= 4;
        break;
      case "numbered_list":
        b.items.forEach((item, i) => {
          drawText(ctx, `${i + 1}.  ${item}`, ctx.regular, 11, MARGIN + 14, CW - 14, 2);
        });
        ctx.y -= 4;
        break;
      case "code":
        for (const line of b.text.split("\n")) {
          drawText(ctx, line, ctx.mono, 9, MARGIN, CW, 1);
        }
        ctx.y -= 4;
        break;
      case "table":
        drawTable(ctx, b.headers, b.rows);
        break;
    }
  }
}

async function mkCtx(): Promise<Ctx> {
  const doc = await PDFDocument.create();
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const mono    = await doc.embedFont(StandardFonts.Courier);
  const firstPage = doc.addPage([PAGE_W, PAGE_H]);
  return { doc, pages: [firstPage], bold, regular, mono, y: PAGE_H - MARGIN };
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function generatePdfFromDocument(data: DocumentData): Promise<Buffer> {
  const ctx = await mkCtx();

  drawText(ctx, data.title, ctx.bold, 22, MARGIN, CW, 4);
  if (data.subtitle) drawText(ctx, data.subtitle, ctx.regular, 14, MARGIN, CW, 4);
  if (data.author)   drawText(ctx, "Author: " + data.author, ctx.regular, 10, MARGIN, CW, 3);
  drawRule(ctx);

  for (const s of data.sections) {
    const sz = s.level === 1 ? 15 : s.level === 2 ? 13 : 11;
    reserve(ctx, sz * 3);
    ctx.y -= s.level === 1 ? 8 : 4;
    drawText(ctx, s.heading, ctx.bold, sz, MARGIN, CW, 4);
    drawBlocks(ctx, s.content);
    ctx.y -= s.level === 1 ? 6 : 2;
  }

  return Buffer.from(await ctx.doc.save());
}

export async function generatePdfFromMarkdown(markdown: string, title: string): Promise<Buffer> {
  const ctx = await mkCtx();

  drawText(ctx, title, ctx.bold, 22, MARGIN, CW, 4);
  drawRule(ctx);

  for (const line of markdown.split("\n")) {
    if (line.startsWith("# ")) {
      ctx.y -= 6;
      drawText(ctx, line.slice(2), ctx.bold, 18, MARGIN, CW, 4);
    } else if (line.startsWith("## ")) {
      ctx.y -= 3;
      drawText(ctx, line.slice(3), ctx.bold, 14, MARGIN, CW, 3);
    } else if (line.startsWith("### ")) {
      drawText(ctx, line.slice(4), ctx.bold, 12, MARGIN, CW, 3);
    } else if (/^[-*]\s/.test(line)) {
      drawText(ctx, "\u2022  " + line.slice(2), ctx.regular, 11, MARGIN + 14, CW - 14, 2);
    } else if (line.trim()) {
      const cleaned = line.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
      drawText(ctx, cleaned, ctx.regular, 11, MARGIN, CW, 3);
    } else {
      ctx.y -= 6;
    }
  }

  return Buffer.from(await ctx.doc.save());
}
