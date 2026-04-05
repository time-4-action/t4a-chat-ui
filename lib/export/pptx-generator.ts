import pptxgen from "pptxgenjs";
import type { PresentationData, ContentBlock } from "./types";

function blocksToText(blocks: ContentBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === "paragraph") return block.text;
      if (block.type === "bullet_list") return block.items.map((i) => `• ${i}`).join("\n");
      if (block.type === "numbered_list") return block.items.map((item, i) => `${i + 1}. ${item}`).join("\n");
      if (block.type === "code") return block.text;
      if (block.type === "table") {
        return [block.headers.join(" | "), ...block.rows.map((r) => r.join(" | "))].join("\n");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export async function generatePptx(data: PresentationData): Promise<Buffer> {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";

  // Title slide
  const titleSlide = pres.addSlide();
  titleSlide.background = { color: "0F172A" };
  titleSlide.addText(data.title, {
    x: 0.5, y: 2.5, w: "90%", h: 1.5,
    fontSize: 36, bold: true, color: "FFFFFF",
    align: "center", valign: "middle",
  });
  if (data.author) {
    titleSlide.addText(data.author, {
      x: 0.5, y: 4.2, w: "90%", h: 0.5,
      fontSize: 16, color: "94A3B8",
      align: "center",
    });
  }

  for (const slide of data.slides) {
    const s = pres.addSlide();
    s.background = { color: "FFFFFF" };

    // Title bar
    s.addShape(pres.ShapeType.rect, {
      x: 0, y: 0, w: "100%", h: 1.1,
      fill: { color: "0F172A" },
      line: { color: "0F172A" },
    });

    s.addText(slide.title, {
      x: 0.4, y: 0.1, w: "92%", h: 0.9,
      fontSize: 22, bold: true, color: "FFFFFF",
      valign: "middle",
    });

    if (slide.layout !== "title-only" && slide.content.length > 0) {
      const contentText = blocksToText(slide.content);
      s.addText(contentText, {
        x: 0.5, y: 1.35, w: "92%", h: 4.5,
        fontSize: 14, color: "1E293B",
        valign: "top", breakLine: true,
      });
    }
  }

  const buffer = await pres.write({ outputType: "nodebuffer" });
  return buffer as Buffer;
}
