"use client";

import { useState } from "react";
import { Copy, Check, Mail } from "lucide-react";
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

function buildMailtoUrl(
  provider: "gmail" | "outlook" | "default",
  email: EmailData
) {
  const subject = encodeURIComponent(email.subject);
  const body = encodeURIComponent(email.body);
  const to = encodeURIComponent(email.to ?? "");
  if (provider === "gmail") {
    return `https://mail.google.com/mail/?view=cm&to=${to}&su=${subject}&body=${body}`;
  }
  if (provider === "outlook") {
    return `https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subject}&body=${body}`;
  }
  return `mailto:${to}?subject=${subject}&body=${body}`;
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

export default function EmailCard({ email }: { email: EmailData }) {
  const [copied, setCopied] = useState(false);

  async function copyToClipboard() {
    const text = [
      email.to ? `To: ${email.to}` : "",
      `Subject: ${email.subject}`,
      "",
      email.body,
    ]
      .filter((l, i) => i !== 0 || l)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-white shadow-md overflow-hidden w-full max-w-[85%] sm:max-w-[78%]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500">
        <div className="flex items-center gap-2 text-white">
          <Mail className="h-4 w-4" />
          <span className="text-sm font-semibold tracking-wide">Email Draft</span>
        </div>
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-1.5 text-xs text-blue-100 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/20 transition-colors"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* To / Subject */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-100 space-y-2">
        <div className="flex items-baseline gap-3 text-sm">
          <span className="text-slate-400 font-medium w-14 shrink-0">To</span>
          <span className="text-slate-700 break-all">
            {email.to || (
              <span className="text-slate-400 italic">Not specified</span>
            )}
          </span>
        </div>
        <div className="flex items-baseline gap-3 text-sm">
          <span className="text-slate-400 font-medium w-14 shrink-0">Subject</span>
          <span className="text-slate-900 font-semibold">{email.subject}</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 text-sm text-slate-700 leading-relaxed prose prose-sm max-w-none">
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

      {/* Send actions */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-slate-400 font-medium mr-1">
          Open in:
        </span>
        {SEND_BUTTONS.map(({ provider, label, hover, icon }) => (
          <a
            key={provider}
            href={buildMailtoUrl(provider, email)}
            target={provider !== "default" ? "_blank" : undefined}
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 transition-colors ${hover}`}
          >
            {icon}
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
