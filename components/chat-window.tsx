"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage, FileUIPart } from "ai";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import MessageBubble from "./message-bubble";
import ToolCallIndicator from "./tool-call-indicator";
import FilePreviewPanel, { type PreviewFile } from "./file-preview-panel";
import { CAPABILITIES } from "@/lib/capabilities";
import VoiceMode from "./voice-mode";
import ChatModeSelector, { ChatMode } from "./chat-mode-selector";
import ModelSelector from "./model-selector";
import ToneSelector from "./tone-selector";
import type { ToneDoc } from "./create-tone-modal";
import { ArrowUp, DollarSign, Download, Paperclip, Square, X, AlertCircle, Clock, Wifi, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_MODEL, ModelId, formatCost } from "@/lib/models";

interface Props {
  conversationId: string;
  initialMessages?: UIMessage[];
  initialModel?: ModelId;
  initialCost?: number;
}

interface AttachedFile {
  file: File;
  previewUrl: string; // object URL for images, empty string otherwise
}

const MAX_FILES = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ACCEPTED_TEXT_TYPES = ["text/plain", "text/csv", "text/markdown"];

const FILE_TYPE_CONFIG: Record<string, { label: string; iconBg: string; iconText: string }> = {
  pdf:  { label: "PDF", iconBg: "bg-red-100",     iconText: "text-red-600" },
  docx: { label: "DOC", iconBg: "bg-blue-100",    iconText: "text-blue-600" },
  xlsx: { label: "XLS", iconBg: "bg-green-100",   iconText: "text-green-700" },
  xls:  { label: "XLS", iconBg: "bg-green-100",   iconText: "text-green-700" },
  ods:  { label: "ODS", iconBg: "bg-green-100",   iconText: "text-green-700" },
  csv:  { label: "CSV", iconBg: "bg-emerald-100", iconText: "text-emerald-700" },
  txt:  { label: "TXT", iconBg: "bg-slate-100",   iconText: "text-slate-600" },
  md:   { label: "MD",  iconBg: "bg-sky-100",  iconText: "text-sky-600" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function getFileExt(file: File): string {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function isImageFile(file: File) {
  return ACCEPTED_IMAGE_TYPES.includes(file.type);
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || getFileExt(file) === "pdf";
}

function isTextFile(file: File) {
  const ext = getFileExt(file);
  return ACCEPTED_TEXT_TYPES.includes(file.type) || ext === "md" || ext === "txt";
}

function isServerParsedFile(file: File) {
  return ["docx", "xlsx", "xls", "ods"].includes(getFileExt(file));
}

function isAcceptedFile(file: File) {
  return isImageFile(file) || isPdfFile(file) || isTextFile(file) || isServerParsedFile(file);
}

// ─── File chip components ──────────────────────────────────────────────────

function ImageChip({ attached, onRemove, onPreview }: { attached: AttachedFile; onRemove: () => void; onPreview?: () => void }) {
  const shortName = attached.file.name.length > 20
    ? attached.file.name.slice(0, 17) + "…"
    : attached.file.name;
  return (
    <div className="relative group shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attached.previewUrl}
        alt={attached.file.name}
        onClick={onPreview}
        className="h-[72px] w-[72px] rounded-xl object-cover border border-slate-200 shadow-sm block cursor-zoom-in"
      />
      {/* Filename overlay on hover */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent rounded-b-xl px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <p className="text-[9px] text-white truncate leading-tight">{shortName}</p>
      </div>
      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-800 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
        aria-label={`Remove ${attached.file.name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function DocumentChip({ attached, onRemove, onPreview }: { attached: AttachedFile; onRemove: () => void; onPreview?: () => void }) {
  const ext = getFileExt(attached.file);
  const cfg = FILE_TYPE_CONFIG[ext] ?? { label: ext.slice(0, 3).toUpperCase(), iconBg: "bg-slate-100", iconText: "text-slate-600" };
  const shortName = attached.file.name.length > 26
    ? attached.file.name.slice(0, 23) + "…"
    : attached.file.name;
  return (
    <div
      onClick={onPreview}
      className={cn(
        "group relative flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl pl-2.5 pr-2 py-2 shadow-sm shrink-0 w-[190px] transition-all",
        onPreview ? "cursor-pointer hover:border-blue-300 hover:shadow-md hover:bg-blue-50/30" : "hover:border-slate-300 hover:shadow-md"
      )}
    >
      {/* Type badge */}
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", cfg.iconBg)}>
        <span className={cn("text-[11px] font-bold tracking-wide", cfg.iconText)}>{cfg.label}</span>
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-800 truncate leading-snug">{shortName}</p>
        <p className="text-[10px] text-slate-400 mt-0.5 leading-none">{formatBytes(attached.file.size)}</p>
      </div>
      {/* Remove */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="shrink-0 h-5 w-5 rounded-full bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
        aria-label={`Remove ${attached.file.name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function FileChip({ attached, onRemove, onPreview }: { attached: AttachedFile; onRemove: () => void; onPreview?: () => void }) {
  return attached.previewUrl
    ? <ImageChip attached={attached} onRemove={onRemove} onPreview={onPreview} />
    : <DocumentChip attached={attached} onRemove={onRemove} onPreview={onPreview} />;
}

// ─── Chat error banner ─────────────────────────────────────────────────────

interface ChatErrorInfo {
  type: "rate_limit" | "limit_exceeded" | "api_error" | "network";
  message: string;
  retryAfter?: number;
}

function ChatErrorBanner({ error, onDismiss, onRetry }: { error: ChatErrorInfo; onDismiss: () => void; onRetry?: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    error.retryAfter != null ? error.retryAfter : null
  );

  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => (s !== null && s > 1 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const isRateLimit = error.type === "rate_limit";
  const isLimitExceeded = error.type === "limit_exceeded";
  const isAmber = isRateLimit || isLimitExceeded;

  function formatSeconds(s: number): string {
    if (s <= 0) return "0s";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  // Derive a user-friendly short message
  const friendlyTitle = isRateLimit
    ? "Rate limit reached"
    : isLimitExceeded
    ? "Spending limit reached"
    : error.type === "network"
    ? "Connection error"
    : "Request failed";

  const friendlyBody = isRateLimit
    ? "You've used your token quota for this minute."
    : error.message.length > 160
    ? error.message.slice(0, 157) + "…"
    : error.message;

  const canRetry = !isAmber || (secondsLeft !== null && secondsLeft <= 0 && !isLimitExceeded);

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-md",
        isAmber
          ? "bg-amber-50 border-amber-200"
          : error.type === "network"
          ? "bg-slate-50 border-slate-200"
          : "bg-red-50 border-red-200"
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "mt-0.5 shrink-0 h-8 w-8 rounded-xl flex items-center justify-center",
          isAmber ? "bg-amber-100" : error.type === "network" ? "bg-slate-100" : "bg-red-100"
        )}
      >
        {isAmber ? (
          <Clock className="h-4 w-4 text-amber-600" />
        ) : error.type === "network" ? (
          <Wifi className="h-4 w-4 text-slate-500" />
        ) : (
          <AlertCircle className="h-4 w-4 text-red-500" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold leading-snug",
          isAmber ? "text-amber-800" : error.type === "network" ? "text-slate-700" : "text-red-700"
        )}>
          {friendlyTitle}
        </p>
        <p className={cn("text-xs mt-0.5 leading-relaxed",
          isAmber ? "text-amber-700" : error.type === "network" ? "text-slate-500" : "text-red-500"
        )}>
          {friendlyBody}
        </p>

        {/* Countdown or retry */}
        <div className="mt-2 flex items-center gap-2">
          {isRateLimit && secondsLeft !== null && secondsLeft > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
              <Clock className="h-3 w-3" />
              Try again in {formatSeconds(secondsLeft)}
            </span>
          )}
          {onRetry && canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors",
                isAmber
                  ? "bg-amber-600 text-white border-amber-600 hover:bg-amber-700"
                  : error.type === "network"
                  ? "bg-slate-700 text-white border-slate-700 hover:bg-slate-800"
                  : "bg-red-600 text-white border-red-600 hover:bg-red-700"
              )}
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
      </div>

      {/* Dismiss */}
      <button
        type="button"
        onClick={onDismiss}
        className={cn(
          "shrink-0 h-6 w-6 rounded-lg flex items-center justify-center transition-colors",
          isAmber
            ? "text-amber-400 hover:text-amber-600 hover:bg-amber-100"
            : error.type === "network"
            ? "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            : "text-red-300 hover:text-red-500 hover:bg-red-100"
        )}
        aria-label="Dismiss error"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function ChatWindow({
  conversationId,
  initialMessages = [],
  initialModel,
  initialCost = 0,
}: Props) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>(null);
  const [signatureHtml, setSignatureHtml] = useState("");
  const [model, setModel] = useState<ModelId>(initialModel ?? DEFAULT_MODEL);
  const [tones, setTones] = useState<ToneDoc[]>([]);
  const [activeToneId, setActiveToneId] = useState<string | null>(null);
  const [costUsd, setCostUsd] = useState(initialCost);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [fileWarning, setFileWarning] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [chatError, setChatError] = useState<{ type: "rate_limit" | "limit_exceeded" | "api_error" | "network"; message: string; retryAfter?: number } | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [mcpConnected, setMcpConnected] = useState(false);
  const [exportConvMenuOpen, setExportConvMenuOpen] = useState(false);
  const [exportingConvFormat, setExportingConvFormat] = useState<string | null>(null);

  function handlePreviewAttached(af: AttachedFile) {
    if (af.previewUrl) {
      // Image — already have an object URL
      setPreviewFile({ filename: af.file.name, mediaType: af.file.type, url: af.previewUrl });
    } else if (isPdfFile(af.file)) {
      const reader = new FileReader();
      reader.onload = () => setPreviewFile({ filename: af.file.name, mediaType: "application/pdf", url: reader.result as string });
      reader.readAsDataURL(af.file);
    } else if (isServerParsedFile(af.file)) {
      const form = new FormData();
      form.append("file", af.file);
      fetch("/api/parse-file", { method: "POST", body: form })
        .then((r) => r.json())
        .then((data) => setPreviewFile({ filename: af.file.name, mediaType: "text/plain", text: data.text ?? "Could not extract text." }))
        .catch(() => setPreviewFile({ filename: af.file.name, mediaType: "text/plain", text: "Failed to parse file." }));
    } else {
      // text / csv / md
      const reader = new FileReader();
      reader.onload = () => setPreviewFile({ filename: af.file.name, mediaType: af.file.type, text: reader.result as string });
      reader.readAsText(af.file);
    }
  }

  // Pick up prompt pre-filled from sidebar capability panel
  useEffect(() => {
    const pending = sessionStorage.getItem("pendingPrompt");
    if (pending) {
      sessionStorage.removeItem("pendingPrompt");
      setInput(pending);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, []);

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((p) => setSignatureHtml(p?.communicationStyle?.signatureStyle ?? ""))
      .catch(() => {});
    fetch("/api/tones")
      .then((r) => r.json())
      .then((data: ToneDoc[]) => {
        if (!Array.isArray(data)) return;
        setTones(data);
        const dbActive = data.find((t) => t.isActive);
        if (dbActive) setActiveToneId(dbActive._id);
      })
      .catch(() => {});
    fetch("/api/gmail/status").then((r) => r.json()).then((d) => setGmailConnected(!!d.connected)).catch(() => {});
    fetch("/api/mcp/status").then((r) => r.json()).then((d) => setMcpConnected(!!d.connected)).catch(() => {});
  }, []);

  const modeRef = useRef<ChatMode>(null);
  const modelRef = useRef<ModelId>(model);
  const toneIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  modeRef.current = mode;
  modelRef.current = model;
  toneIdRef.current = activeToneId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: {},
        fetch: async (url, init) => {
          if (init?.body && typeof init.body === "string") {
            const parsed = JSON.parse(init.body);
            parsed.conversationId = conversationIdRef.current;
            parsed.model = modelRef.current;
            if (modeRef.current) parsed.mode = modeRef.current;
            if (toneIdRef.current) parsed.toneId = toneIdRef.current;
            return fetch(url, { ...init, body: JSON.stringify(parsed) });
          }
          return fetch(url, init);
        },
      }),
    []
  );

  const ensureConversation = useCallback(async () => {
    if (conversationIdRef.current !== "new") return;
    const res = await fetch("/api/conversations", { method: "POST" });
    const conv = await res.json();
    conversationIdRef.current = conv._id;
    window.history.replaceState(null, "", `/chat/${conv._id}`);
  }, []);

  const { messages, sendMessage, status, stop, error: chatErrorRaw } = useChat({
    transport,
    messages: initialMessages,
  });

  // Parse structured error from server response
  useEffect(() => {
    if (!chatErrorRaw) { setChatError(null); return; }
    try {
      const parsed = JSON.parse(chatErrorRaw.message);
      if (parsed?.error === "limit_exceeded") {
        const resetAt = parsed.resetAt ? new Date(parsed.resetAt) : null;
        const resetStr = resetAt
          ? resetAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "never";
        setChatError({
          type: "limit_exceeded",
          message: `Spending limit of $${(parsed.limitUsd as number).toFixed(2)} reached for this ${parsed.period} period. Resets ${resetStr}.`,
        });
        return;
      }
      if (parsed?.error) {
        setChatError({ type: parsed.error, message: parsed.message, retryAfter: parsed.retryAfter });
        return;
      }
    } catch { /* not JSON */ }
    // Generic network / unknown error
    setChatError({ type: "network", message: chatErrorRaw.message ?? "Something went wrong." });
  }, [chatErrorRaw]);

  const isLoading = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0 && !isLoading;

  useEffect(() => {
    if (status !== "ready" || conversationIdRef.current === "new") return;
    let cancelled = false;
    let attempt = 0;
    async function tryFetch() {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/conversations/${conversationIdRef.current}`);
        const conv = await r.json();
        const cost = conv.totalCostUsd ?? 0;
        if (cost > 0) {
          setCostUsd(cost);
        } else if (attempt < 5) {
          attempt++;
          setTimeout(tryFetch, 600);
        }
      } catch (e) {
        console.error("[cost] fetch error:", e);
      }
    }
    const timer = setTimeout(tryFetch, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      attachedFiles.forEach((af) => { if (af.previewUrl) URL.revokeObjectURL(af.previewUrl); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Virtual keyboard: scroll input into view when viewport shrinks (keyboard appears)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function handleResize() {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    vv.addEventListener("resize", handleResize);
    return () => vv.removeEventListener("resize", handleResize);
  }, []);

  // ── File handling ──────────────────────────────────────────────────────

  function addFiles(files: File[]) {
    const warnings: string[] = [];
    const valid: AttachedFile[] = [];
    for (const file of files) {
      if (attachedFiles.length + valid.length >= MAX_FILES) {
        warnings.push(`Max ${MAX_FILES} files allowed.`);
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        warnings.push(`"${file.name}" exceeds 20 MB.`);
        continue;
      }
      if (!isAcceptedFile(file)) {
        warnings.push(`"${file.name}" is not a supported type.`);
        continue;
      }
      const previewUrl = isImageFile(file) ? URL.createObjectURL(file) : "";
      valid.push({ file, previewUrl });
    }
    setAttachedFiles((prev) => [...prev, ...valid]);
    if (warnings.length > 0) {
      setFileWarning(warnings[0]);
      setTimeout(() => setFileWarning(null), 4000);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  function handleRemoveFile(index: number) {
    setAttachedFiles((prev) => {
      const copy = [...prev];
      if (copy[index].previewUrl) URL.revokeObjectURL(copy[index].previewUrl);
      copy.splice(index, 1);
      return copy;
    });
  }

  // Drag-and-drop
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  // ── Submit ─────────────────────────────────────────────────────────────

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if ((!text && attachedFiles.length === 0) || isLoading) return;
    navigator.vibrate?.(10);

    let fullText = text;
    const fileParts: FileUIPart[] = [];

    await Promise.all(
      attachedFiles.map((af) =>
        new Promise<void>((resolve) => {
          const reader = new FileReader();
          if (isImageFile(af.file)) {
            reader.onload = () => {
              fileParts.push({ type: "file", mediaType: af.file.type, filename: af.file.name, url: reader.result as string });
              resolve();
            };
            reader.readAsDataURL(af.file);
          } else if (isPdfFile(af.file)) {
            reader.onload = () => {
              fileParts.push({ type: "file", mediaType: "application/pdf", filename: af.file.name, url: reader.result as string });
              resolve();
            };
            reader.readAsDataURL(af.file);
          } else if (isServerParsedFile(af.file)) {
            const form = new FormData();
            form.append("file", af.file);
            fetch("/api/parse-file", { method: "POST", body: form })
              .then((r) => r.json())
              .then((data) => { if (data.text) fullText += `\n\n[File: ${af.file.name}]\n${data.text}`; })
              .catch(() => {})
              .finally(resolve);
          } else {
            reader.onload = () => {
              fullText += `\n\n[File: ${af.file.name}]\n${reader.result as string}`;
              resolve();
            };
            reader.readAsText(af.file);
          }
        })
      )
    );

    setInput("");
    setAttachedFiles([]);
    if (inputRef.current) inputRef.current.style.height = "auto";
    await ensureConversation();
    await sendMessage({ text: fullText, ...(fileParts.length > 0 && { files: fileParts }) });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const handleVoiceTranscript = useCallback(async (text: string) => {
    setInput("");
    await ensureConversation();
    sendMessage({ text });
  }, [sendMessage, ensureConversation]);

  const handleVoiceInterim = useCallback((text: string) => { setInput(text); }, []);

  // ── UI ─────────────────────────────────────────────────────────────────

  function handlePromptSelect(prompt: string) {
    setInput(prompt);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const activeToolName = useMemo(() => {
    if (!isLoading) return undefined;
    const lastMsg = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastMsg) return undefined;
    const toolPart = (lastMsg.parts as Array<{ type: string; toolName?: string }>)
      .find((p) => p.type === "tool-call");
    return toolPart?.toolName;
  }, [messages, isLoading]);

  const hasFiles = attachedFiles.length > 0;
  const canSend = (input.trim() || hasFiles) && !isLoading;

  async function handleExportConversation(format: string) {
    if (exportingConvFormat || conversationIdRef.current === "new") return;
    setExportingConvFormat(format);
    setExportConvMenuOpen(false);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "conversation", format, conversationId: conversationIdRef.current }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const ext = format === "markdown" ? "md" : format;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `conversation.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e) {
      console.error("[export conversation]", e);
    } finally {
      setExportingConvFormat(null);
    }
  }

  const topBar = (
    <div className="hidden lg:flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white/80 backdrop-blur-sm shrink-0">
      <div data-tour="model-selector" className="inline-flex">
        <ModelSelector value={model} onChange={setModel} disabled={isLoading} locked={messages.length > 0} />
      </div>

      {/* Connection pills */}
      {(gmailConnected || mcpConnected) && (
        <div className="flex items-center gap-1.5">
          {gmailConnected && (
            <a
              href="/settings?section=integrations"
              title="Gmail connected"
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <svg viewBox="52 42 88 66" className="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
                <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6"/>
                <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15"/>
                <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"/>
                <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92"/>
                <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2C60.47 39.35 52 43.58 52 51"/>
              </svg>
              Gmail
            </a>
          )}
          {mcpConnected && (
            <a
              href="/settings?section=integrations"
              title="Internal tools connected"
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Tools
            </a>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Conversation export */}
        {messages.length > 0 && conversationIdRef.current !== "new" && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportConvMenuOpen((o) => !o)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              {exportingConvFormat
                ? <Download className="h-3.5 w-3.5 animate-bounce" />
                : <Download className="h-3.5 w-3.5" />
              }
              Export
            </button>
            {exportConvMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[150px]">
                <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Export chat as</p>
                {(["pdf", "docx", "markdown"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => handleExportConversation(fmt)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Download className="h-3 w-3 text-slate-400" />
                    {fmt === "markdown" ? "Markdown (.md)" : `${fmt.toUpperCase()}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {(costUsd > 0 || isLoading) && messages.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <DollarSign className="w-3 h-3" />
            <span>{costUsd > 0 ? formatCost(costUsd) : "…"}</span>
            <span className="text-slate-300">this chat</span>
          </div>
        )}
      </div>
    </div>
  );

  const sendOrStopButton = isLoading ? (
    <button
      type="button"
      onClick={() => stop()}
      className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-red-500 text-white shadow-sm hover:bg-red-600 transition-all"
      aria-label="Stop generating"
    >
      <Square className="h-3.5 w-3.5 fill-current" />
    </button>
  ) : (
    <button
      onClick={() => handleSubmit()}
      disabled={!canSend}
      className={cn(
        "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all",
        canSend
          ? mode === "email"
            ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
            : mode === "quick-info"
            ? "bg-amber-500 text-white shadow-sm hover:bg-amber-600"
            : "bg-[#0f172a] text-white shadow-sm hover:bg-slate-700"
          : "bg-slate-200 text-slate-400"
      )}
      aria-label="Send"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );

  const inputBox = (
    <div className="space-y-2">
      <div data-tour="mode-selector">
        <ChatModeSelector
          mode={mode}
          onChange={setMode}
          disabled={isLoading}
          toneSlot={
            <div data-tour="tone-selector">
              <ToneSelector
                tones={tones}
                activeToneId={activeToneId}
                onChange={setActiveToneId}
                disabled={isLoading}
              />
            </div>
          }
        />
      </div>

      {/* Input card */}
      <div
        className={cn(
          "rounded-2xl border-2 bg-white shadow-lg transition-all duration-200",
          isDragging
            ? "border-blue-400 bg-blue-50 shadow-blue-100"
            : mode === "email"
            ? "border-blue-400 focus-within:border-blue-600"
            : mode === "quick-info"
            ? "border-amber-400 focus-within:border-amber-500"
            : hasFiles
            ? "border-blue-300 focus-within:border-blue-500"
            : "border-slate-300 focus-within:border-slate-500 focus-within:shadow-xl"
        )}
      >
        {/* File attachments area */}
        {hasFiles && (
          <div className="px-3 pt-3 pb-0">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {attachedFiles.map((af, i) => (
                <FileChip key={i} attached={af} onRemove={() => handleRemoveFile(i)} onPreview={() => handlePreviewAttached(af)} />
              ))}
            </div>
            <div className="border-t border-slate-100 mx-1" />
          </div>
        )}

        {/* Warning banner */}
        {fileWarning && (
          <div className="mx-3 mt-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
            <p className="text-xs text-red-600">{fileWarning}</p>
          </div>
        )}

        {/* Input row */}
        <div className="flex items-center gap-2 px-3 py-3">
          {/* Paperclip */}
          <button
            type="button"
            data-tour="attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || attachedFiles.length >= MAX_FILES}
            className={cn(
              "shrink-0 h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
              isLoading || attachedFiles.length >= MAX_FILES
                ? "text-slate-300 cursor-not-allowed"
                : "text-slate-400 hover:text-blue-600 hover:bg-blue-50"
            )}
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,text/plain,text/csv,text/markdown,.md,.csv,.docx,.xlsx,.xls,.ods"
            className="hidden"
            onChange={handleFileSelect}
          />

          <textarea
            ref={inputRef}
            data-tour="message-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 300)}
            placeholder={
              mode === "email"
                ? "Describe the email you need…"
                : mode === "quick-info"
                ? "Ask for a quick answer…"
                : hasFiles
                ? "Ask about the attached files…"
                : "Message time-4-action AI…"
            }
            className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none resize-none leading-relaxed max-h-40 py-0 align-middle"
            disabled={isLoading}
          />
          <div className="flex items-center gap-1 shrink-0" data-tour="send-btn">
            <VoiceMode
              messages={messages}
              status={status}
              onTranscript={handleVoiceTranscript}
              onInterim={handleVoiceInterim}
            />
            {sendOrStopButton}
          </div>
        </div>
      </div>
    </div>
  );

  const pageContent = isEmpty ? (
    <>
      {topBar}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="logo" className="w-14 h-14 object-contain mx-auto mb-4" />
            <h2 className="text-slate-800 font-semibold text-2xl">How can I help you?</h2>
            <p className="text-slate-400 text-sm mt-1.5">Ask about products, orders, partners, warehouse or delivery.</p>
          </div>

          {/* Suggestion chips */}
          <div data-tour="suggestion-chips" className="hidden lg:flex flex-wrap justify-center gap-2 mb-6">
            {CAPABILITIES.flatMap((cap) => cap.examples.slice(0, 1)).map((prompt) => (
              <button
                key={prompt}
                onClick={() => handlePromptSelect(prompt)}
                className="text-xs text-slate-600 border border-slate-200 rounded-full px-3.5 py-1.5 hover:bg-slate-100 hover:border-slate-300 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>

          {inputBox}
          <p className="text-center text-[11px] text-slate-400 mt-2">
            Shift+Enter for new line · Enter to send · Drag & drop files
          </p>
        </div>
      </div>
    </>
  ) : (
    <>
      {topBar}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} signatureHtml={signatureHtml} onFilePreview={setPreviewFile} />
          ))}
          {isLoading && (
            <ToolCallIndicator
              toolName={activeToolName}
              status={status === "submitted" ? "submitted" : "streaming"}
            />
          )}
          {chatError && !isLoading && (
            <ChatErrorBanner
              error={chatError}
              onDismiss={() => setChatError(null)}
            />
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="shrink-0 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] bg-gray-100 border-t border-gray-200">
        <div className="max-w-3xl mx-auto px-4">
          {inputBox}
          <p className="text-center text-[11px] text-slate-400 mt-2">
            Shift+Enter for new line · Enter to send · Drag & drop files
          </p>
        </div>
      </div>
    </>
  );

  return (
    <div
      className="relative flex h-full bg-gray-100"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex-1 flex flex-col min-w-0">
        {pageContent}
      </div>

      {previewFile && (
        <FilePreviewPanel file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {/* Full-page drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-blue-50/90 backdrop-blur-sm border-4 border-dashed border-blue-400 pointer-events-none">
          <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-blue-100">
            <Paperclip className="h-7 w-7 text-blue-500" />
          </div>
          <p className="text-base font-semibold text-blue-700">Drop files to attach</p>
          <p className="text-sm text-blue-400">Images, PDFs, and documents up to 20 MB</p>
        </div>
      )}
    </div>
  );
}
