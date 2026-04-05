import { UIMessage } from "ai";
import { Check, Copy, Download, Mail, MoreHorizontal, FileText } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import SyntaxHighlighter from "react-syntax-highlighter";
import { githubGist } from "react-syntax-highlighter/dist/esm/styles/hljs";
import remarkGfm from "remark-gfm";
import EmailCard, { parseEmailFromText } from "./email-card";
import DocumentCard, { parseDocumentFromText, isDocumentInProgress } from "./document-card";
import type { PreviewFile } from "./file-preview-panel";

// hljs languages supported by react-syntax-highlighter
const HLJS_LANGUAGES = new Set([
  "javascript","js","typescript","ts","jsx","tsx","python","py","bash","sh","shell",
  "json","yaml","yml","html","xml","css","scss","sql","java","c","cpp","csharp","cs",
  "go","rust","ruby","rb","php","swift","kotlin","r","markdown","md","plaintext","text",
]);

function parseDsvLine(line: string, sep: string): string[] {
  if (sep === "\t") return line.split("\t").map((c) => c.trim());
  // Handle quoted CSV fields
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function DsvTable({ content, sep }: { content: string; sep: "," | "\t" }) {
  const rows = content.split("\n").filter((l) => l.trim());
  if (rows.length < 2) return <CodeBlock language={sep === "," ? "csv" : "tsv"}>{content}</CodeBlock>;
  const [header, ...body] = rows.map((r) => parseDsvLine(r, sep));
  return (
    <div className="overflow-x-auto my-3 rounded-lg border border-slate-200">
      <table className="text-xs border-collapse w-full">
        <thead className="bg-slate-50">
          <tr>
            {header.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-slate-600 border-b border-slate-100">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [children]);

  return (
    <div className="relative group my-3 rounded-xl overflow-hidden shadow-inner">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-slate-100 border-b border-slate-200 px-4 py-1.5">
        <span className="text-[11px] font-mono text-slate-400">{language || "code"}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-700 transition-colors"
        >
          {copied ? (
            <><Check className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-500">Copied</span></>
          ) : (
            <><Copy className="h-3.5 w-3.5" /><span>Copy</span></>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={HLJS_LANGUAGES.has(language) ? language : "plaintext"}
        style={githubGist}
        customStyle={{ margin: 0, borderRadius: 0, fontSize: "0.75rem", padding: "1rem", background: "#f8fafc" }}
        wrapLongLines={false}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

/**
 * Detect runs of lines that look like CSV or TSV (outside existing code fences)
 * and wrap them in ```csv / ```tsv fences.
 *
 * Rules to avoid false positives:
 *  - Skip markdown table rows (start/end with |)
 *  - Skip markdown table separator rows (---|---)
 *  - Skip list items (-, *, +, 1.)
 *  - Skip headings (#)
 *  - Skip blockquotes (>)
 *  - TSV: ≥1 tab per line
 *  - CSV: ≥1 comma per line (2+ columns), uniform comma count across all lines
 *  - Require ≥2 lines to form a block
 *  - TSV takes priority over CSV when both match
 */
function autoFenceDsv(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let insideFence = false;
  let i = 0;

  const sepCount = (l: string, sep: string) => l.split(sep).length - 1;

  const isStructural = (trimmed: string) => {
    if (!trimmed) return true;
    if (/^[|#>]/.test(trimmed)) return true;
    if (/^[-*+]\s/.test(trimmed)) return true;
    if (/^\d+[.)]\s/.test(trimmed)) return true;
    if (/^[-|: ]+$/.test(trimmed)) return true;
    return false;
  };

  const isTsvLike = (l: string) => {
    const trimmed = l.trim();
    if (isStructural(trimmed)) return false;
    return sepCount(trimmed, "\t") >= 1;
  };

  const isCsvLike = (l: string) => {
    const trimmed = l.trim();
    if (isStructural(trimmed)) return false;
    if (sepCount(trimmed, "\t") >= 1) return false; // prefer TSV
    return sepCount(trimmed, ",") >= 1;
  };

  const tryCollectBlock = (startLine: number, isLike: (l: string) => boolean, sep: string): string[] | null => {
    const block: string[] = [];
    let j = startLine;
    while (j < lines.length && !lines[j].trim().startsWith("```") && isLike(lines[j])) {
      block.push(lines[j]);
      j++;
    }
    if (block.length < 2) return null;
    const firstCount = sepCount(block[0].trim(), sep);
    const isUniform = block.every((l) => sepCount(l.trim(), sep) === firstCount);
    return isUniform ? block : null;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      insideFence = !insideFence;
      result.push(line);
      i++;
      continue;
    }

    if (!insideFence) {
      if (isTsvLike(line)) {
        const block = tryCollectBlock(i, isTsvLike, "\t");
        if (block) {
          result.push("```tsv", ...block, "```");
          i += block.length;
          continue;
        }
      } else if (isCsvLike(line)) {
        const block = tryCollectBlock(i, isCsvLike, ",");
        if (block) {
          result.push("```csv", ...block, "```");
          i += block.length;
          continue;
        }
      }
    }

    result.push(line);
    i++;
  }

  return result.join("\n");
}

const isEmailInProgress = (text: string) =>
  text.includes('"type"') && text.includes('"email"') && !parseEmailFromText(text);

type FilePart = { type: "file"; mediaType: string; filename?: string; url: string };

interface GmailAttachmentResult {
  filename: string;
  mimeType: string;
  size: number;
  downloadUrl: string;
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function GmailAttachment({
  attachment,
  onFilePreview,
}: {
  attachment: GmailAttachmentResult;
  onFilePreview?: (file: PreviewFile) => void;
}) {
  const isImage = attachment.mimeType.startsWith("image/");
  const isPdf = attachment.mimeType === "application/pdf" || attachment.filename.endsWith(".pdf");
  const canPreview = isImage || isPdf;
  const ext = attachment.filename.split(".").pop()?.toUpperCase() ?? "FILE";
  const shortName = attachment.filename.length > 20
    ? attachment.filename.slice(0, 17) + "…"
    : attachment.filename;

  const chipContent = (
    <>
      <div className="h-7 w-7 rounded-md bg-blue-100 flex items-center justify-center shrink-0">
        <span className="text-[8px] font-bold text-blue-700">{ext.slice(0, 4)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-slate-800 truncate leading-tight">{shortName}</p>
        <p className="text-[10px] text-slate-400">{formatAttachmentSize(attachment.size)}</p>
      </div>
      <Download className="h-3 w-3 text-slate-300 group-hover:text-blue-500 transition-colors shrink-0" />
    </>
  );

  const chipClass = "inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-50 hover:border-slate-300 transition-colors group w-40 text-left";

  if (canPreview && onFilePreview) {
    return (
      <button type="button" onClick={() => onFilePreview({ filename: attachment.filename, mediaType: attachment.mimeType, url: attachment.downloadUrl })} className={chipClass}>
        {chipContent}
      </button>
    );
  }

  return (
    <a href={attachment.downloadUrl} download={attachment.filename} className={chipClass}>
      {chipContent}
    </a>
  );
}

function GmailAttachmentGroup({
  attachments,
  onFilePreview,
}: {
  attachments: GmailAttachmentResult[];
  onFilePreview?: (file: PreviewFile) => void;
}) {
  const [open, setOpen] = useState(attachments.length <= 2);

  // Single image — show inline preview
  if (attachments.length === 1 && attachments[0].mimeType.startsWith("image/")) {
    const att = attachments[0];
    return (
      <div className="mb-2 max-w-sm">
        <button
          type="button"
          onClick={() => onFilePreview?.({ filename: att.filename, mediaType: att.mimeType, url: att.downloadUrl })}
          className="focus:outline-none block"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={att.downloadUrl} alt={att.filename} className="rounded-xl border border-slate-200 shadow-sm max-h-72 object-contain hover:opacity-90 transition-opacity cursor-zoom-in" />
        </button>
        <p className="text-[11px] text-slate-400 mt-1 pl-0.5">{att.filename} · {formatAttachmentSize(att.size)}</p>
      </div>
    );
  }

  return (
    <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 transition-colors"
      >
        <Download className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="text-xs font-medium text-slate-600 flex-1">
          {attachments.length} attachment{attachments.length !== 1 ? "s" : ""}
        </span>
        <span className="text-[10px] text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 flex flex-wrap gap-1.5">
          {attachments.map((att, i) => (
            <GmailAttachment key={i} attachment={att} onFilePreview={onFilePreview} />
          ))}
        </div>
      )}
    </div>
  );
}

const EXT_CONFIG: Record<string, { label: string; bg: string }> = {
  pdf:  { label: "PDF", bg: "bg-red-500/20" },
  docx: { label: "DOC", bg: "bg-blue-500/20" },
  xlsx: { label: "XLS", bg: "bg-green-500/20" },
  xls:  { label: "XLS", bg: "bg-green-500/20" },
  ods:  { label: "ODS", bg: "bg-green-500/20" },
  csv:  { label: "CSV", bg: "bg-emerald-500/20" },
  txt:  { label: "TXT", bg: "bg-white/10" },
  md:   { label: "MD",  bg: "bg-sky-500/20" },
};

function docChipConfig(fp: FilePart): { label: string; bg: string } {
  const ext = (fp.filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  return EXT_CONFIG[ext] ?? { label: ext.slice(0, 3).toUpperCase() || "FILE", bg: "bg-white/10" };
}

function extChipConfig(filename: string): { label: string; bg: string } {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_CONFIG[ext] ?? { label: ext.slice(0, 3).toUpperCase() || "FILE", bg: "bg-white/10" };
}

interface FileBlock {
  filename: string;
  content: string;
}

function parseFileBlocks(text: string): { cleanText: string; blocks: FileBlock[] } {
  const blocks: FileBlock[] = [];
  // Match \n\n[File: name]\ncontent — content runs until next \n\n[File: or end
  const pattern = /\n\n\[File: ([^\]]+)\]\n([\s\S]*?)(?=\n\n\[File: |$)/g;
  const cleanText = text.replace(pattern, (_, filename, content) => {
    blocks.push({ filename, content: content.trimEnd() });
    return "";
  });
  return { cleanText: cleanText.trimEnd(), blocks };
}

function extractGmailAttachments(message: UIMessage): GmailAttachmentResult[] {
  if (message.role !== "assistant") return [];

  const results: GmailAttachmentResult[] = [];

  for (const p of message.parts as any[]) {
    const toolName = getToolName(p);
    const result = getToolResult(p);
    if (!result || !toolName) continue;

    if (toolName === "gmail_read_message" && Array.isArray(result.attachments)) {
      for (const a of result.attachments) {
        if (a?.downloadUrl && a?.filename) {
          results.push(a as GmailAttachmentResult);
        }
      }
    } else if (toolName === "gmail_download_attachment" && result?.downloadUrl && result?.filename) {
      results.push(result as GmailAttachmentResult);
    }
  }

  return results;
}

function getToolResult(p: any): any {
  // AI SDK v6: parts have type "tool-{toolName}" with output as raw object
  if (typeof p.type === "string" && p.type.startsWith("tool-") && p.output != null) {
    const out = p.output;
    // Wrapped: { type: "json", value: ... }
    if (out && typeof out === "object" && out.type === "json") return out.value;
    if (out && typeof out === "object" && out.type === "text") {
      try { return JSON.parse(out.value); } catch { return out.value; }
    }
    // Direct object (actual SDK behaviour observed)
    return out;
  }
  // Fallback for older shapes
  return p.result ?? p.toolInvocation?.result ??
    (p.toolInvocation?.state === "result" ? p.toolInvocation.result : undefined);
}

function getToolName(p: any): string | undefined {
  // AI SDK v6: tool name is embedded in type as "tool-{toolName}"
  if (typeof p.type === "string" && p.type.startsWith("tool-")) {
    return p.type.slice("tool-".length);
  }
  return p.toolName ?? p.toolInvocation?.toolName;
}


export default function MessageBubble({
  message,
  signatureHtml = "",
  onFilePreview,
}: {
  message: UIMessage;
  signatureHtml?: string;
  onFilePreview?: (file: PreviewFile) => void;
}) {
  const isUser = message.role === "user";

  const textContent = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");

  const fileParts = message.parts.filter((p) => p.type === "file") as FilePart[];

  if (isUser) {
    const imageParts = fileParts.filter((fp) => fp.mediaType.startsWith("image/"));
    const docParts = fileParts.filter((fp) => !fp.mediaType.startsWith("image/"));

    // Parse [File: name]\ncontent blocks embedded in text (DOCX/XLSX/text uploads)
    const { cleanText, blocks } = parseFileBlocks(textContent);

    const hasContent = cleanText.trim() || imageParts.length > 0 || docParts.length > 0 || blocks.length > 0;
    if (!hasContent) return null;

    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] sm:max-w-[70%] space-y-1.5">
          {/* Image thumbnails — above the text bubble */}
          {imageParts.length > 0 && (
            <div className={`flex gap-1.5 justify-end flex-wrap`}>
              {imageParts.map((fp, i) => (
                <button
                  key={i}
                  type="button"
                  title={fp.filename ?? "image"}
                  onClick={() =>
                    onFilePreview
                      ? onFilePreview({ filename: fp.filename ?? "image", mediaType: fp.mediaType, url: fp.url })
                      : window.open(fp.url, "_blank")
                  }
                  className="focus:outline-none"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fp.url}
                    alt={fp.filename ?? "image"}
                    className="h-28 w-28 rounded-2xl rounded-tr-sm object-cover shadow-md border border-white/10 hover:opacity-90 transition-opacity cursor-zoom-in"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Document chips for file parts (PDFs) */}
          {docParts.length > 0 && (
            <div className="flex gap-1.5 justify-end flex-wrap">
              {docParts.map((fp, i) => {
                const cfg = docChipConfig(fp);
                const shortName = (fp.filename ?? "document").length > 24
                  ? (fp.filename ?? "document").slice(0, 21) + "…"
                  : (fp.filename ?? "document");
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      onFilePreview?.({ filename: fp.filename ?? "document", mediaType: fp.mediaType, url: fp.url || undefined })
                    }
                    className="flex items-center gap-2 bg-[#0f172a] border border-white/10 rounded-2xl rounded-tr-sm px-3 py-2 shadow-md hover:border-white/30 hover:bg-slate-800 transition-colors"
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                      <span className="text-[10px] font-bold text-white">{cfg.label}</span>
                    </div>
                    <span className="text-xs text-white/80 font-medium">{shortName}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Parsed file block chips (DOCX/XLSX/text extracted text) */}
          {blocks.length > 0 && (
            <div className="flex gap-1.5 justify-end flex-wrap">
              {blocks.map((block, i) => {
                const cfg = extChipConfig(block.filename);
                const shortName = block.filename.length > 24
                  ? block.filename.slice(0, 21) + "…"
                  : block.filename;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      onFilePreview?.({ filename: block.filename, mediaType: "text/plain", text: block.content })
                    }
                    className="flex items-center gap-2 bg-[#0f172a] border border-white/10 rounded-2xl rounded-tr-sm px-3 py-2 shadow-md hover:border-white/30 hover:bg-slate-800 transition-colors"
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                      <span className="text-[10px] font-bold text-white">{cfg.label}</span>
                    </div>
                    <span className="text-xs text-white/80 font-medium">{shortName}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Text bubble — stripped of embedded file blocks */}
          {cleanText.trim() && (
            <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words bg-[#0f172a] text-white shadow-md">
              {cleanText}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fully parsed document/presentation → show card
  const documentData = parseDocumentFromText(textContent);
  if (documentData) {
    return (
      <div className="flex gap-3 items-start">
        <img
          src="/favicon.ico"
          alt="logo"
          className="hidden sm:block w-7 h-7 object-contain rounded-md shrink-0 mt-0.5"
        />
        <DocumentCard data={documentData} />
      </div>
    );
  }

  // Document still streaming → show animated placeholder
  if (isDocumentInProgress(textContent)) {
    return (
      <div className="flex gap-3 items-start">
        <img
          src="/favicon.ico"
          alt="logo"
          className="hidden sm:block w-7 h-7 object-contain rounded-md shrink-0 mt-0.5"
        />
        <div className="rounded-2xl rounded-tl-sm bg-white shadow-sm border border-slate-200 overflow-hidden w-72">
          <div className="h-9 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 bg-[length:200%_100%] animate-[shimmer_1.4s_ease-in-out_infinite]" />
          <div className="px-4 py-3 space-y-2.5">
            <div className="h-3 w-40 rounded bg-slate-100 animate-pulse" />
            <div className="h-2.5 w-full rounded bg-slate-100 animate-pulse" />
            <div className="h-2.5 w-5/6 rounded bg-slate-100 animate-pulse" />
            <div className="h-2.5 w-4/6 rounded bg-slate-100 animate-pulse" />
          </div>
          <div className="px-4 pb-3 flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-slate-400 animate-pulse shrink-0" />
            <span className="text-xs text-slate-400">Generating document</span>
            <span className="flex gap-0.5 ml-0.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1 w-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Fully parsed email → show card
  const emailData = parseEmailFromText(textContent);
  if (emailData) {
    return (
      <div className="flex gap-3 items-start">
        <img
          src="/favicon.ico"
          alt="logo"
          className="hidden sm:block w-7 h-7 object-contain rounded-md shrink-0 mt-0.5"
        />
        <EmailCard email={emailData} signatureHtml={signatureHtml} />
      </div>
    );
  }

  // Email still streaming → show animated placeholder
  if (isEmailInProgress(textContent)) {
    return (
      <div className="flex gap-3 items-start">
        <img
          src="/favicon.ico"
          alt="logo"
          className="hidden sm:block w-7 h-7 object-contain rounded-md shrink-0 mt-0.5"
        />
        <div className="rounded-2xl rounded-tl-sm bg-white shadow-sm border border-blue-100 overflow-hidden w-72">
          {/* shimmer header */}
          <div className="h-9 bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500 bg-[length:200%_100%] animate-[shimmer_1.4s_ease-in-out_infinite]" />
          <div className="px-4 py-3 space-y-2.5">
            {/* To row */}
            <div className="flex items-center gap-3">
              <div className="h-3 w-6 rounded bg-slate-100" />
              <div className="h-3 w-32 rounded bg-slate-100 animate-pulse" />
            </div>
            {/* Subject row */}
            <div className="flex items-center gap-3">
              <div className="h-3 w-10 rounded bg-slate-100" />
              <div className="h-3 w-44 rounded bg-slate-100 animate-pulse" />
            </div>
            {/* Body lines */}
            <div className="pt-1 space-y-2 border-t border-slate-50">
              <div className="h-2.5 w-full rounded bg-slate-100 animate-pulse" />
              <div className="h-2.5 w-5/6 rounded bg-slate-100 animate-pulse" />
              <div className="h-2.5 w-4/6 rounded bg-slate-100 animate-pulse" />
            </div>
          </div>
          {/* status row */}
          <div className="px-4 pb-3 flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-blue-400 animate-pulse shrink-0" />
            <span className="text-xs text-slate-400">Composing email</span>
            <span className="flex gap-0.5 ml-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1 w-1 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Attachment chips for gmail_download_attachment results
  const gmailAttachments = extractGmailAttachments(message);

  return (
    <AssistantBubble textContent={textContent} gmailAttachments={gmailAttachments} onFilePreview={onFilePreview} />
  );
}

function AssistantBubble({
  textContent,
  gmailAttachments,
  onFilePreview,
}: {
  textContent: string;
  gmailAttachments: GmailAttachmentResult[];
  onFilePreview?: (file: PreviewFile) => void;
}) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  async function exportMessage(format: "pdf" | "docx" | "markdown") {
    if (exportingFormat) return;
    setExportingFormat(format);
    setExportMenuOpen(false);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "message", format, content: textContent, title: "Message" }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const ext = format === "markdown" ? "md" : format;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `message.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e) {
      console.error("[export message]", e);
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <div className="flex gap-3 items-start group/msg relative">
      {/* AI avatar */}
      <img
        src="/favicon.ico"
        alt="logo"
        className="hidden sm:block w-7 h-7 object-contain rounded-md shrink-0 mt-0.5"
      />

      {/* Bubble */}
      <div className="max-w-[85%] sm:max-w-[78%] min-w-0 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed break-words bg-white shadow-sm border border-slate-200 text-slate-800">
        {gmailAttachments.length > 0 && (
          <GmailAttachmentGroup attachments={gmailAttachments} onFilePreview={onFilePreview} />
        )}
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-5 mb-2.5 space-y-1">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-5 mb-2.5 space-y-1">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="leading-relaxed">{children}</li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-slate-900">{children}</strong>
            ),
            em: ({ children }) => <em className="italic">{children}</em>,
            code: ({ children, className }) => {
              const isBlock = !!className;
              if (isBlock) {
                const lang = (className ?? "").replace("language-", "");
                const content = String(children).replace(/\n$/, "");
                return <CodeBlock language={lang}>{content}</CodeBlock>;
              }
              return (
                <code className="bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 text-xs font-mono">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => <>{children}</>,
            h1: ({ children }) => (
              <h1 className="text-base font-bold text-slate-900 mb-2 mt-1">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-sm font-bold text-slate-900 mb-2 mt-1">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-sm font-semibold text-slate-900 mb-1 mt-1">
                {children}
              </h3>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline underline-offset-2 break-all"
              >
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-3 border-slate-300 pl-3 text-slate-500 italic my-2">
                {children}
              </blockquote>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-3 rounded-lg border border-slate-200">
                <table className="text-xs border-collapse w-full">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-slate-50">{children}</thead>
            ),
            th: ({ children }) => (
              <th className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 text-slate-600 border-b border-slate-100 last:border-b-0">
                {children}
              </td>
            ),
          }}
        >
          {autoFenceDsv(textContent)}
        </ReactMarkdown>
      </div>

      {/* Per-message export button — appears on hover */}
      <div className="relative self-start mt-1" ref={menuRef}>
        <button
          type="button"
          onClick={() => setExportMenuOpen((o) => !o)}
          className="opacity-0 group-hover/msg:opacity-100 transition-opacity p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          aria-label="Export message"
          title="Export message"
        >
          {exportingFormat
            ? <Download className="h-3.5 w-3.5 animate-bounce" />
            : <MoreHorizontal className="h-3.5 w-3.5" />
          }
        </button>

        {exportMenuOpen && (
          <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[130px]">
            <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Export as</p>
            {(["pdf", "docx", "markdown"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => exportMessage(fmt)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Download className="h-3 w-3 text-slate-400" />
                {fmt === "markdown" ? "Markdown" : fmt.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
