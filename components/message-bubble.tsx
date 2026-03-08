import { UIMessage } from "ai";
import { Check, Copy, Mail } from "lucide-react";
import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import SyntaxHighlighter from "react-syntax-highlighter";
import { githubGist } from "react-syntax-highlighter/dist/esm/styles/hljs";
import remarkGfm from "remark-gfm";
import EmailCard, { parseEmailFromText } from "./email-card";

// hljs languages supported by react-syntax-highlighter
const HLJS_LANGUAGES = new Set([
  "javascript","js","typescript","ts","jsx","tsx","python","py","bash","sh","shell",
  "json","yaml","yml","html","xml","css","scss","sql","java","c","cpp","csharp","cs",
  "go","rust","ruby","rb","php","swift","kotlin","r","markdown","md","plaintext","text",
]);

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
 * Detect runs of lines that look like CSV (outside existing code fences)
 * and wrap them in ```csv fences.
 *
 * Rules to avoid false positives:
 *  - Skip markdown table rows (start/end with |)
 *  - Skip markdown table separator rows (---|---)
 *  - Skip list items (-, *, +, 1.)
 *  - Skip headings (#)
 *  - Skip blockquotes (>)
 *  - Require ≥2 commas per line (3+ columns)
 *  - All lines in a block must have the SAME comma count (consistent columns)
 *  - Require ≥2 lines to form a block
 */
function autoFenceCsv(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let insideFence = false;
  let i = 0;

  const commaCount = (l: string) => (l.match(/,/g) ?? []).length;

  const isCsvLike = (l: string) => {
    const trimmed = l.trim();
    if (!trimmed) return false;
    // Exclude markdown structural lines
    if (/^[|#>]/.test(trimmed)) return false;              // table rows, headings, blockquotes
    if (/^[-*+]\s/.test(trimmed)) return false;            // unordered list items
    if (/^\d+[.)]\s/.test(trimmed)) return false;          // ordered list items
    if (/^[-|: ]+$/.test(trimmed)) return false;           // table separator rows
    return commaCount(trimmed) >= 2;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Track fence boundaries
    if (line.trim().startsWith("```")) {
      insideFence = !insideFence;
      result.push(line);
      i++;
      continue;
    }

    if (!insideFence && isCsvLike(line)) {
      const block: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```") && isCsvLike(lines[i])) {
        block.push(lines[i]);
        i++;
      }

      // All lines must share the same comma count (uniform columns = real CSV)
      const firstCount = commaCount(block[0]);
      const isUniform = block.every((l) => commaCount(l) === firstCount);

      if (block.length >= 2 && isUniform) {
        result.push("```csv", ...block, "```");
      } else {
        result.push(...block);
      }
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join("\n");
}

const isEmailInProgress = (text: string) =>
  text.includes('"type"') && text.includes('"email"') && !parseEmailFromText(text);

type FilePart = { type: "file"; mediaType: string; filename?: string; url: string };

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

export default function MessageBubble({ message, signatureHtml = "" }: { message: UIMessage; signatureHtml?: string }) {
  const isUser = message.role === "user";

  const textContent = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");

  const fileParts = message.parts.filter((p) => p.type === "file") as FilePart[];

  if (isUser) {
    const imageParts = fileParts.filter((fp) => fp.mediaType.startsWith("image/"));
    const docParts = fileParts.filter((fp) => !fp.mediaType.startsWith("image/"));
    const hasContent = textContent.trim() || imageParts.length > 0 || docParts.length > 0;
    if (!hasContent) return null;

    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] sm:max-w-[70%] space-y-1.5">
          {/* Image thumbnails — above the text bubble */}
          {imageParts.length > 0 && (
            <div className={`flex gap-1.5 justify-end flex-wrap`}>
              {imageParts.map((fp, i) => (
                <a key={i} href={fp.url} target="_blank" rel="noopener noreferrer" title={fp.filename}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fp.url}
                    alt={fp.filename ?? "image"}
                    className="h-28 w-28 rounded-2xl rounded-tr-sm object-cover shadow-md border border-white/10 hover:opacity-90 transition-opacity cursor-zoom-in"
                  />
                </a>
              ))}
            </div>
          )}

          {/* Document chips — above the text bubble */}
          {docParts.length > 0 && (
            <div className="flex gap-1.5 justify-end flex-wrap">
              {docParts.map((fp, i) => {
                const cfg = docChipConfig(fp);
                const shortName = (fp.filename ?? "document").length > 24
                  ? (fp.filename ?? "document").slice(0, 21) + "…"
                  : (fp.filename ?? "document");
                return (
                  <div key={i} className="flex items-center gap-2 bg-[#0f172a] border border-white/10 rounded-2xl rounded-tr-sm px-3 py-2 shadow-md">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                      <span className="text-[10px] font-bold text-white">{cfg.label}</span>
                    </div>
                    <span className="text-xs text-white/80 font-medium">{shortName}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Text bubble */}
          {textContent.trim() && (
            <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap bg-[#0f172a] text-white shadow-md">
              {textContent}
            </div>
          )}
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

  return (
    <div className="flex gap-3 items-start">
      {/* AI avatar */}
      <img
        src="/favicon.ico"
        alt="logo"
        className="hidden sm:block w-7 h-7 object-contain rounded-md shrink-0 mt-0.5"
      />

      {/* Bubble */}
      <div className="max-w-[85%] sm:max-w-[78%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed bg-white shadow-sm border border-slate-200 text-slate-800">
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
                return (
                  <CodeBlock language={lang}>{String(children).replace(/\n$/, "")}</CodeBlock>
                );
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
                className="text-blue-600 hover:text-blue-700 underline underline-offset-2"
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
          {autoFenceCsv(textContent)}
        </ReactMarkdown>
      </div>
    </div>
  );
}
