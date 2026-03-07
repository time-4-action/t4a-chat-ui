"use client";

import { useState } from "react";
import { Copy, Check, Mail, ClipboardPaste } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface EmailData {
  type: "email";
  to: string;
  subject: string;
  body: string;
}

export function parseEmailFromText(text: string): EmailData | null {
  const match = text.match(
    /```(?:json)?\s*(\{[\s\S]*?"type"\s*:\s*"email"[\s\S]*?\})\s*```/
  );
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed.type === "email" && parsed.subject && parsed.body) {
      return parsed as EmailData;
    }
    return null;
  } catch {
    return null;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Convert markdown (as the AI generates it) to HTML for rich clipboard paste */
function markdownToHtml(md: string): string {
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n\n+/)
    .map((block) => {
      const inline = block
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 8px 0">${inline}</p>`;
    })
    .join("");
}

function GmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48">
      <path fill="#4caf50" d="M45 16.2l-5 2.75-5 4.75L35 40h7c1.657 0 3-1.343 3-3V16.2z" />
      <path fill="#1e88e5" d="M3 16.2l3.614 1.71L13 23.7V40H6c-1.657 0-3-1.343-3-3V16.2z" />
      <polygon fill="#e53935" points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17" />
      <path fill="#c62828" d="M3 12.298V16.2l10 7.5V11.2L9.876 8.859C9.132 8.203 8.084 8 7.1 8 4.785 8 3 9.88 3 12.298z" />
      <path fill="#fbc02d" d="M45 12.298V16.2l-10 7.5V11.2l3.124-2.341C38.868 8.203 39.916 8 40.9 8 43.215 8 45 9.88 45 12.298z" />
    </svg>
  );
}

function OutlookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none">
      <rect x="4" y="6" width="26" height="36" rx="2" fill="#0078D4" />
      <rect x="18" y="14" width="26" height="22" rx="2" fill="#28A8E8" />
      <rect x="18" y="14" width="26" height="22" rx="2" fill="url(#og)" />
      <path d="M18 14l13 10 13-10" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="17" cy="24" rx="7" ry="8" fill="white" />
      <ellipse cx="17" cy="24" rx="4.5" ry="5.5" fill="#0078D4" />
      <defs>
        <linearGradient id="og" x1="18" y1="14" x2="44" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#28A8E8" />
          <stop offset="1" stopColor="#0078D4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function EmailCard({
  email,
  signatureHtml = "",
}: {
  email: EmailData;
  signatureHtml?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [openedProvider, setOpenedProvider] = useState<string | null>(null);

  const signaturePlain = signatureHtml ? htmlToText(signatureHtml) : "";

  /** Build the full email as HTML for rich clipboard paste into Gmail/Outlook.
   *  Gmail's paste sanitiser blocks data: URIs, so we strip them from images
   *  (they still appear in the preview card — just not in the pasted version). */
  function buildRichHtml() {
    const bodyHtml = markdownToHtml(email.body);
    const sig = signatureHtml
      ? signatureHtml.replace(/src="data:[^"]*"/gi, 'src=""')
      : "";
    return `<div style="font-family:sans-serif;font-size:14px;color:#1e293b;line-height:1.6">${bodyHtml}${sig ? `<div style="margin-top:16px">${sig}</div>` : ""}</div>`;
  }

  async function copyRichToClipboard() {
    const html = buildRichHtml();
    const plain = [email.body, ...(signaturePlain ? ["", signaturePlain] : [])].join("\n");
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(plain);
    }
  }

  async function copyPlainToClipboard() {
    const parts = [
      email.to ? `To: ${email.to}` : "",
      `Subject: ${email.subject}`,
      "",
      email.body,
      ...(signaturePlain ? ["", signaturePlain] : []),
    ].filter((l, i) => i !== 0 || l);
    await navigator.clipboard.writeText(parts.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function openInProvider(provider: "gmail" | "outlook" | "default") {
    const subject = encodeURIComponent(email.subject);
    const to = encodeURIComponent(email.to ?? "");

    if (provider === "default") {
      // mailto only supports plain text — include full content
      const plain = [email.body, ...(signaturePlain ? ["", signaturePlain] : [])].join("\n");
      window.location.href = `mailto:${to}?subject=${subject}&body=${encodeURIComponent(plain)}`;
      return;
    }

    // For Gmail/Outlook: copy rich HTML to clipboard, open compose with just subject+to
    await copyRichToClipboard();
    setOpenedProvider(provider);
    setTimeout(() => setOpenedProvider(null), 3000);

    const url =
      provider === "gmail"
        ? `https://mail.google.com/mail/?view=cm&to=${to}&su=${subject}`
        : `https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subject}`;
    window.open(url, "_blank");
  }

  const SEND_BUTTONS = [
    {
      provider: "gmail" as const,
      label: "Gmail",
      hover: "hover:bg-red-50 hover:border-red-200 hover:text-red-600",
      icon: <GmailIcon className="h-3.5 w-3.5" />,
    },
    {
      provider: "outlook" as const,
      label: "Outlook",
      hover: "hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600",
      icon: <OutlookIcon className="h-3.5 w-3.5" />,
    },
    {
      provider: "default" as const,
      label: "Mail App",
      hover: "hover:bg-slate-100 hover:border-slate-300 hover:text-slate-800",
      icon: <Mail className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <div className="rounded-2xl border border-blue-100 bg-white shadow-md w-full max-w-[85%] sm:max-w-[78%] overflow-x-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500">
        <div className="flex items-center gap-2 text-white">
          <Mail className="h-4 w-4" />
          <span className="text-sm font-semibold tracking-wide">Email Draft</span>
        </div>
        <button
          onClick={copyPlainToClipboard}
          className="flex items-center gap-1.5 text-xs text-blue-100 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/20 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* To / Subject */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-100 space-y-2">
        <div className="flex items-baseline gap-3 text-sm">
          <span className="text-slate-400 font-medium w-14 shrink-0">To</span>
          <span className="text-slate-700 break-all">
            {email.to || <span className="text-slate-400 italic">Not specified</span>}
          </span>
        </div>
        <div className="flex items-baseline gap-3 text-sm">
          <span className="text-slate-400 font-medium w-14 shrink-0">Subject</span>
          <span className="text-slate-900 font-semibold">{email.subject}</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 pt-3 text-sm text-slate-700 leading-relaxed prose prose-sm max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline underline-offset-2 font-medium"
              >
                {children}
              </a>
            ),
          }}
        >
          {email.body}
        </ReactMarkdown>
      </div>

      {/* Signature — completely outside prose to avoid Typography style bleed */}
      {signatureHtml && (
        <div className="px-4 pt-3 pb-1">
          <div
            style={{ font: "inherit", fontSize: 14, color: "#334155", lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: signatureHtml }}
          />
          {/* Clearfix so floated images don't collapse the container */}
          <div style={{ clear: "both" }} />
        </div>
      )}

      {!signatureHtml && <div className="pb-3" />}

      {/* Send actions */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-slate-400 font-medium mr-1">Open in:</span>
          {SEND_BUTTONS.map(({ provider, label, hover, icon }) => (
            <button
              key={provider}
              onClick={() => openInProvider(provider)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 transition-colors cursor-pointer ${hover}`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
        {openedProvider && (
          <div className="flex items-center gap-1.5 text-[11px] text-blue-600">
            <ClipboardPaste className="h-3 w-3 shrink-0" />
            <span>Rich email copied — paste it into the compose window (<kbd className="font-mono bg-blue-50 px-1 rounded">Ctrl+V</kbd>)</span>
          </div>
        )}
      </div>
    </div>
  );
}
