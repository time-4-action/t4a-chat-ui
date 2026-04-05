import type { DocumentData, PresentationData, ContentBlock } from "./types";

/**
 * Replace AI-generated JSON blocks (document/presentation/email) with readable
 * one-line summaries so they don't dump raw JSON into the exported PDF/DOCX.
 */
function cleanAssistantText(text: string): string {
  // Document / presentation JSON blocks
  let out = text.replace(
    /```(?:json)?\s*(\{[\s\S]*?"type"\s*:\s*"(?:document|presentation)"[\s\S]*?\})\s*```/g,
    (_match, jsonStr) => {
      try {
        const parsed = JSON.parse(jsonStr);
        const kind = parsed.type === "presentation" ? "Presentation" : "Document";
        const title = parsed.title ?? "Untitled";
        const count =
          parsed.type === "document"
            ? `${parsed.sections?.length ?? 0} sections`
            : `${parsed.slides?.length ?? 0} slides`;
        return `*[${kind} generated: "${title}" — ${count}]*`;
      } catch {
        return "*[Document generated]*";
      }
    }
  );

  // Email JSON blocks
  out = out.replace(
    /```(?:json)?\s*(\{[\s\S]*?"type"\s*:\s*"email"[\s\S]*?\})\s*```/g,
    (_match, jsonStr) => {
      try {
        const parsed = JSON.parse(jsonStr);
        return `*[Email draft: "${parsed.subject ?? "No subject"}" → ${parsed.to ?? "unspecified"}]*`;
      } catch {
        return "*[Email draft generated]*";
      }
    }
  );

  return out.trim();
}

export function conversationToMarkdown(messages: Array<{ role: string; content: string | any[] }>): string {
  const lines: string[] = [];
  for (const msg of messages) {
    const role = msg.role === "user" ? "User" : "Assistant";
    lines.push(`## ${role}\n`);
    const raw = typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
        : "";
    const text = msg.role === "assistant" ? cleanAssistantText(raw) : raw.trim();
    lines.push(text);
    lines.push("");
  }
  return lines.join("\n");
}

function blocksToMarkdown(blocks: ContentBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      lines.push(block.text, "");
    } else if (block.type === "bullet_list") {
      for (const item of block.items) lines.push(`- ${item}`);
      lines.push("");
    } else if (block.type === "numbered_list") {
      block.items.forEach((item, i) => lines.push(`${i + 1}. ${item}`));
      lines.push("");
    } else if (block.type === "table") {
      lines.push(`| ${block.headers.join(" | ")} |`);
      lines.push(`| ${block.headers.map(() => "---").join(" | ")} |`);
      for (const row of block.rows) lines.push(`| ${row.join(" | ")} |`);
      lines.push("");
    } else if (block.type === "code") {
      lines.push(`\`\`\`${block.language ?? ""}`, block.text, "```", "");
    }
  }
  return lines.join("\n");
}

export function documentToMarkdown(data: DocumentData | PresentationData): string {
  const lines: string[] = [`# ${data.title}`, ""];
  if (data.type === "document") {
    if (data.subtitle) lines.push(`*${data.subtitle}*`, "");
    if (data.author) lines.push(`**Author:** ${data.author}`, "");
    lines.push("");
    for (const section of data.sections) {
      const hashes = "#".repeat(section.level + 1);
      lines.push(`${hashes} ${section.heading}`, "");
      lines.push(blocksToMarkdown(section.content));
    }
  } else {
    if (data.author) lines.push(`**Author:** ${data.author}`, "");
    lines.push("");
    data.slides.forEach((slide, i) => {
      lines.push(`## Slide ${i + 1}: ${slide.title}`, "");
      lines.push(blocksToMarkdown(slide.content));
    });
  }
  return lines.join("\n");
}
