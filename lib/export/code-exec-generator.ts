import Anthropic from "@anthropic-ai/sdk";
import type { DocumentData, PresentationData } from "./types";

const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SENTINEL = "__B64FILE__";

function buildPrompt(
  data: DocumentData | PresentationData | string,
  format: "pdf" | "docx" | "pptx",
): string {
  const isMarkdown = typeof data === "string";
  const dataStr = isMarkdown ? (data as string) : JSON.stringify(data, null, 2);
  const outPath = `/tmp/output.${format}`;

  // Explicit Python snippet Claude must run last — single print, no line breaks in b64
  const outputSnippet = `
Finally, run this exact code to output the file:
\`\`\`python
import base64, pathlib
_b64 = base64.b64encode(pathlib.Path("${outPath}").read_bytes()).decode("ascii")
print("${SENTINEL}" + _b64 + "${SENTINEL}")
\`\`\``;

  if (format === "pptx") {
    return `Generate a professional PowerPoint presentation using python-pptx from the data below. Save it to ${outPath}.
Use a dark title slide, white content slides with a colored title bar, proper fonts and spacing.
${outputSnippet}

Data:
${dataStr}`;
  }

  if (format === "docx") {
    return `Generate a professional Word document using python-docx from the data below. Save it to ${outPath}.
Use proper Heading 1/2/3 styles, body text, bullet lists, and tables where needed.
${outputSnippet}

Data:
${dataStr}`;
  }

  return `Generate a professional PDF from the data below using reportlab. Save it to ${outPath}.
If reportlab is not installed run: import subprocess; subprocess.run(["pip", "install", "reportlab", "-q"])
Use proper headings, body text, bullet points, and clean typography.
${outputSnippet}

Data:
${dataStr}`;
}

/** Collect all text content from a response block recursively */
function extractText(block: unknown): string {
  if (typeof block === "string") return block;
  if (typeof block !== "object" || block === null) return "";
  const b = block as Record<string, unknown>;

  // Plain text block
  if (b.type === "text" && typeof b.text === "string") return b.text;

  // bash_code_execution_tool_result — content may be object or array
  if (b.type === "bash_code_execution_tool_result") {
    const c = b.content;
    if (typeof c === "string") return c;
    if (typeof c === "object" && c !== null) {
      const co = c as Record<string, unknown>;
      // { type: "bash_code_execution_result", output: "...", ... }
      if (typeof co.output === "string") return co.output;
      if (typeof co.stdout === "string") return co.stdout;
      // content may be an array of sub-blocks
      if (Array.isArray(co.content)) {
        return co.content.map(extractText).join("");
      }
      return JSON.stringify(co);
    }
  }

  // Recurse into any array fields
  return Object.values(b)
    .filter(Array.isArray)
    .flatMap((arr) => (arr as unknown[]).map(extractText))
    .join("");
}

function findBase64(content: unknown[]): Buffer | null {
  for (const block of content) {
    const text = extractText(block);
    const start = text.indexOf(SENTINEL);
    const end = text.lastIndexOf(SENTINEL);
    if (start !== -1 && end !== start) {
      const b64 = text.slice(start + SENTINEL.length, end).trim().replace(/\s+/g, "");
      if (b64.length > 0) return Buffer.from(b64, "base64");
    }
  }
  return null;
}

export async function generateWithCodeExecution(
  data: DocumentData | PresentationData | string,
  format: "pdf" | "docx" | "pptx",
): Promise<Buffer> {
  const client = getClient();

  let messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildPrompt(data, format) },
  ];

  for (let i = 0; i <= 5; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (client.messages.create as any)({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16000,
      tools: [{ type: "code_execution_20260120", name: "code_execution" }],
      messages,
    });

    console.log("[code-exec] stop_reason:", response.stop_reason,
      "blocks:", response.content?.map((b: any) => b.type));

    const buf = findBase64(response.content ?? []);
    if (buf) return buf;

    if (response.stop_reason === "pause_turn") {
      messages = [messages[0], { role: "assistant", content: response.content }];
      continue;
    }
    break;
  }

  throw new Error(`Code execution did not produce a ${format} file`);
}
