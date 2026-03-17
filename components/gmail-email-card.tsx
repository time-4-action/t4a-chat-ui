"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, Mail, Paperclip } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PreviewFile } from "./file-preview-panel";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GmailReadMessageResult {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet?: string;
  body: string;
  isHtml?: boolean;
  labels?: string[];
  attachments?: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }>;
}

export interface GmailReadThreadResult {
  threadId: string;
  subject: string;
  messageCount: number;
  messages: Array<{ id: string; from: string; to: string; date: string; body: string }>;
}

export interface GmailDownloadResult {
  filename: string;
  mimeType: string;
  size: number;
  downloadUrl: string;
}

export interface ProcessedGmailEmail {
  message: GmailReadMessageResult;
  resolvedAttachments: GmailDownloadResult[];
  thread?: GmailReadThreadResult;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFrom(raw: string): { name: string; email: string } {
  const m = raw.match(/^(.+?)\s*<(.+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: raw, email: raw };
}

const PALETTES = [
  { grad: "from-sky-400 to-blue-600",     hex: "#0ea5e9", light: "bg-sky-50 text-sky-600" },
  { grad: "from-violet-400 to-purple-600", hex: "#8b5cf6", light: "bg-violet-50 text-violet-600" },
  { grad: "from-emerald-400 to-teal-600",  hex: "#10b981", light: "bg-emerald-50 text-emerald-700" },
  { grad: "from-orange-400 to-amber-500",  hex: "#f97316", light: "bg-orange-50 text-orange-600" },
  { grad: "from-pink-400 to-rose-600",     hex: "#f43f5e", light: "bg-pink-50 text-pink-600" },
  { grad: "from-indigo-400 to-indigo-700", hex: "#6366f1", light: "bg-indigo-50 text-indigo-600" },
  { grad: "from-cyan-400 to-sky-600",      hex: "#06b6d4", light: "bg-cyan-50 text-cyan-700" },
  { grad: "from-fuchsia-400 to-pink-600",  hex: "#d946ef", light: "bg-fuchsia-50 text-fuchsia-600" },
];

function palette(email: string) {
  let h = 0;
  for (const c of email) h = (h << 5) - h + c.charCodeAt(0);
  return PALETTES[Math.abs(h) % PALETTES.length];
}

function ini(name: string) {
  return name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function fmtDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday)
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (d.getFullYear() === now.getFullYear())
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return dateStr; }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

const EXT_STYLE: Record<string, { bg: string; text: string }> = {
  PDF:  { bg: "bg-red-50",     text: "text-red-600" },
  DOC:  { bg: "bg-blue-50",    text: "text-blue-600" },
  DOCX: { bg: "bg-blue-50",    text: "text-blue-600" },
  XLS:  { bg: "bg-green-50",   text: "text-green-700" },
  XLSX: { bg: "bg-green-50",   text: "text-green-700" },
  CSV:  { bg: "bg-emerald-50", text: "text-emerald-700" },
  ZIP:  { bg: "bg-amber-50",   text: "text-amber-700" },
  PNG:  { bg: "bg-violet-50",  text: "text-violet-600" },
  JPG:  { bg: "bg-violet-50",  text: "text-violet-600" },
  JPEG: { bg: "bg-violet-50",  text: "text-violet-600" },
  STL:  { bg: "bg-slate-100",  text: "text-slate-500" },
};

// ─── Gmail icon ───────────────────────────────────────────────────────────────

function GmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="52 42 88 66">
      <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6"/>
      <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15"/>
      <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"/>
      <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92"/>
      <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2C60.47 39.35 52 43.58 52 51"/>
    </svg>
  );
}

// ─── Attachment chip ───────────────────────────────────────────────────────────

function AttachmentChip({ att, onFilePreview }: {
  att: GmailDownloadResult;
  onFilePreview?: (file: PreviewFile) => void;
}) {
  const ext = (att.filename.split(".").pop() ?? "").toUpperCase();
  const style = EXT_STYLE[ext.slice(0, 4)] ?? { bg: "bg-slate-100", text: "text-slate-500" };
  const isImage = att.mimeType.startsWith("image/");
  const isPdf = att.mimeType === "application/pdf" || att.filename.toLowerCase().endsWith(".pdf");
  const canPreview = isImage || isPdf;
  const shortName = att.filename.length > 22 ? att.filename.slice(0, 19) + "…" : att.filename;

  const inner = (
    <div className="flex items-center gap-2.5 py-2 px-3">
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>
        <span className={`text-[9px] font-bold tracking-wide ${style.text}`}>
          {ext.slice(0, 4) || "FILE"}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-700 truncate leading-tight">{shortName}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{fmtBytes(att.size)}</p>
      </div>
    </div>
  );

  const base = "bg-white border border-slate-200 rounded-xl transition-all duration-150 overflow-hidden";

  if (canPreview && onFilePreview) {
    return (
      <button
        type="button"
        onClick={() => onFilePreview({ filename: att.filename, mediaType: att.mimeType, url: att.downloadUrl })}
        className={`${base} hover:border-blue-300 hover:shadow-[0_1px_8px_rgba(59,130,246,0.15)]`}
      >
        {inner}
      </button>
    );
  }
  return (
    <a href={att.downloadUrl} download={att.filename} className={`${base} hover:border-slate-300 hover:shadow-sm block`}>
      {inner}
    </a>
  );
}

// ─── Thread message ────────────────────────────────────────────────────────────

function ThreadMessage({ msg }: {
  msg: { id: string; from: string; to: string; date: string; body: string };
}) {
  const [open, setOpen] = useState(false);
  const { name, email } = parseFrom(msg.from);
  const { grad } = palette(email);
  const dateStr = fmtDate(msg.date);

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors text-left"
      >
        <div className={`h-7 w-7 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center shrink-0 text-white text-[9px] font-bold ring-[1.5px] ring-white shadow-sm`}>
          {ini(name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] font-semibold text-slate-800 truncate">{name}</span>
            <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">{dateStr}</span>
          </div>
          {!open && (
            <p className="text-[11px] text-slate-400 truncate mt-0.5 leading-snug">
              {msg.body.replace(/\s+/g, " ").slice(0, 100)}
            </p>
          )}
        </div>
        {open
          ? <ChevronUp className="h-3 w-3 text-slate-400 shrink-0" />
          : <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 text-[12px] text-slate-600 leading-relaxed border-t border-slate-100 whitespace-pre-wrap break-words">
          {msg.body}
        </div>
      )}
    </div>
  );
}

// ─── HTML body iframe ──────────────────────────────────────────────────────────

function HtmlEmailBody({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(300);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const resize = () => {
      try {
        const h = iframe.contentDocument?.documentElement?.scrollHeight;
        if (h && h > 0) setHeight(h);
      } catch { /* cross-origin */ }
    };
    iframe.addEventListener("load", resize);
    return () => iframe.removeEventListener("load", resize);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      sandbox="allow-same-origin allow-popups"
      style={{ height, border: "none", width: "100%", display: "block" }}
      title="email-body"
    />
  );
}

// ─── Main card ─────────────────────────────────────────────────────────────────

const IGNORED_LABELS = new Set([
  "INBOX", "UNREAD", "SENT", "IMPORTANT",
  "CATEGORY_PERSONAL", "CATEGORY_UPDATES", "CATEGORY_PROMOTIONS",
]);

export default function GmailEmailCard({ email, onFilePreview }: {
  email: ProcessedGmailEmail;
  onFilePreview?: (file: PreviewFile) => void;
}) {
  const [threadOpen, setThreadOpen] = useState(false);
  const { message, resolvedAttachments, thread } = email;

  const { name: senderName, email: senderEmail } = parseFrom(message.from);
  const { grad, hex, light } = palette(senderEmail);
  const senderInitials = ini(senderName);
  const dateStr = fmtDate(message.date);

  const otherMsgs = (thread?.messages ?? []).filter((m) => m.id !== message.id);
  const hasThread = otherMsgs.length > 0;
  const visibleLabels = (message.labels ?? []).filter((l) => !IGNORED_LABELS.has(l));

  return (
    <div className="w-full rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.09),0_0_0_1px_rgba(0,0,0,0.06)]">

      {/* ── Window header bar ─────────────────────────────────── */}
      <div className="bg-[#0f172a] px-5 py-3.5 flex items-center gap-3">
        <GmailIcon className="h-4 w-4 shrink-0" />
        <h3 className="flex-1 min-w-0 text-[13px] font-semibold text-white truncate tracking-[-0.01em]">
          {message.subject}
        </h3>
        {visibleLabels.slice(0, 2).map((l) => (
          <span key={l} className="text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/10 text-white/60 shrink-0">
            {l.replace(/_/g, " ")}
          </span>
        ))}
        <time className="text-[11px] text-white/40 shrink-0 tabular-nums">{dateStr}</time>
        <a
          href={`https://mail.google.com/mail/u/0/#all/${message.threadId || message.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Gmail"
          className="flex items-center gap-1 text-[11px] opacity-50 hover:opacity-100 transition-opacity shrink-0 ml-1"
        >
          <GmailIcon className="h-4 w-4" />
        </a>
      </div>

      {/* ── Sender / metadata ─────────────────────────────────── */}
      <div className="bg-white px-5 py-4 flex items-start gap-3.5 border-b border-slate-100">
        {/* Avatar */}
        <div
          className={`h-11 w-11 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center shrink-0 text-white text-[14px] font-bold shadow-md ring-2 ring-white`}
          style={{ boxShadow: `0 4px 12px ${hex}44` }}
        >
          {senderInitials}
        </div>

        {/* From / To */}
        <div className="flex-1 min-w-0 pt-0.5 space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-slate-900">{senderName}</span>
            {senderEmail !== senderName && (
              <span className="text-[11px] text-slate-400 truncate">&lt;{senderEmail}&gt;</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">to</span>
            <span className="text-[11px] text-slate-500 truncate">{message.to}</span>
          </div>
        </div>

        {/* Sender color pill */}
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-1 ${light}`}>
          {senderInitials}
        </span>
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      {message.isHtml ? (
        <div className="bg-white overflow-hidden">
          <HtmlEmailBody html={message.body} />
        </div>
      ) : (
        <div className="bg-white px-6 py-5 text-[13.5px] text-slate-700 leading-[1.75]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 underline underline-offset-2 transition-colors">
                  {children}
                </a>
              ),
              strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
              ul: ({ children }) => <ul className="list-disc pl-4 my-2 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 my-2 space-y-1">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              pre: ({ children }) => <>{children}</>,
              code: ({ children }) => (
                <code className="bg-slate-100 text-slate-600 rounded px-1 py-0.5 text-[11px] font-mono">{children}</code>
              ),
            }}
          >
            {message.body}
          </ReactMarkdown>
        </div>
      )}

      {/* ── Attachments ───────────────────────────────────────── */}
      {resolvedAttachments.length > 0 && (
        <div className="bg-slate-50/70 border-t border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-1.5 mb-3">
            <Paperclip className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              {resolvedAttachments.length} Attachment{resolvedAttachments.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {resolvedAttachments.map((att, i) => (
              <AttachmentChip key={i} att={att} onFilePreview={onFilePreview} />
            ))}
          </div>
        </div>
      )}

      {/* ── Thread ────────────────────────────────────────────── */}
      {hasThread && (
        <div className="bg-slate-50/70 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setThreadOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-100/60 transition-colors group"
          >
            {/* Stacked avatars */}
            <div className="flex -space-x-1.5">
              {otherMsgs.slice(0, 4).map((m, i) => {
                const { name: n, email: e } = parseFrom(m.from);
                const { grad: g } = palette(e);
                return (
                  <div key={i}
                    className={`h-5 w-5 rounded-full bg-gradient-to-br ${g} text-white text-[7px] font-bold flex items-center justify-center ring-[1.5px] ring-white shrink-0`}
                  >
                    {ini(n)}
                  </div>
                );
              })}
            </div>
            <span className="flex-1 text-[11px] font-medium text-slate-500 group-hover:text-slate-700 transition-colors">
              {otherMsgs.length} more message{otherMsgs.length !== 1 ? "s" : ""} in thread
            </span>
            <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            {threadOpen
              ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              : <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
          </button>
          {threadOpen && (
            <div className="px-5 pb-4 space-y-2">
              {otherMsgs.map((msg, i) => (
                <ThreadMessage key={i} msg={msg} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
