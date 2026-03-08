"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage, FileUIPart } from "ai";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import MessageBubble from "./message-bubble";
import ToolCallIndicator from "./tool-call-indicator";
import VoiceMode from "./voice-mode";
import ChatModeSelector, { ChatMode } from "./chat-mode-selector";
import ModelSelector from "./model-selector";
import ToneSelector from "./tone-selector";
import type { ToneDoc } from "./create-tone-modal";
import { ArrowUp, DollarSign, Paperclip, Square, X, AlertCircle } from "lucide-react";
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

function ImageChip({ attached, onRemove }: { attached: AttachedFile; onRemove: () => void }) {
  const shortName = attached.file.name.length > 20
    ? attached.file.name.slice(0, 17) + "…"
    : attached.file.name;
  return (
    <div className="relative group shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attached.previewUrl}
        alt={attached.file.name}
        className="h-[72px] w-[72px] rounded-xl object-cover border border-slate-200 shadow-sm block"
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

function DocumentChip({ attached, onRemove }: { attached: AttachedFile; onRemove: () => void }) {
  const ext = getFileExt(attached.file);
  const cfg = FILE_TYPE_CONFIG[ext] ?? { label: ext.slice(0, 3).toUpperCase(), iconBg: "bg-slate-100", iconText: "text-slate-600" };
  const shortName = attached.file.name.length > 26
    ? attached.file.name.slice(0, 23) + "…"
    : attached.file.name;
  return (
    <div className="group relative flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl pl-2.5 pr-2 py-2 shadow-sm shrink-0 w-[190px] hover:border-slate-300 hover:shadow-md transition-all">
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
        onClick={onRemove}
        className="shrink-0 h-5 w-5 rounded-full bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
        aria-label={`Remove ${attached.file.name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function FileChip({ attached, onRemove }: { attached: AttachedFile; onRemove: () => void }) {
  return attached.previewUrl
    ? <ImageChip attached={attached} onRemove={onRemove} />
    : <DocumentChip attached={attached} onRemove={onRemove} />;
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

  const { messages, sendMessage, status, stop } = useChat({
    transport,
    messages: initialMessages,
  });

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

  const hasFiles = attachedFiles.length > 0;
  const canSend = (input.trim() || hasFiles) && !isLoading;

  const topBar = (
    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white/80 backdrop-blur-sm shrink-0">
      <ModelSelector value={model} onChange={setModel} disabled={isLoading} locked={messages.length > 0} />
      {(costUsd > 0 || isLoading) && messages.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <DollarSign className="w-3 h-3" />
          <span>{costUsd > 0 ? formatCost(costUsd) : "…"}</span>
          <span className="text-slate-300">this chat</span>
        </div>
      )}
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
      <ChatModeSelector
        mode={mode}
        onChange={setMode}
        disabled={isLoading}
        toneSlot={
          <ToneSelector
            tones={tones}
            activeToneId={activeToneId}
            onChange={setActiveToneId}
            disabled={isLoading}
          />
        }
      />

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
                <FileChip key={i} attached={af} onRemove={() => handleRemoveFile(i)} />
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
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === "email"
                ? "Describe the email you need…"
                : mode === "quick-info"
                ? "Ask for a quick answer…"
                : hasFiles
                ? "Ask about the attached files…"
                : "Message time-4-action AI…"
            }
            className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none resize-none leading-relaxed max-h-40 py-0.5"
            disabled={isLoading}
          />
          <div className="flex items-center gap-1 shrink-0">
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
            <img src="/favicon.ico" alt="logo" className="w-14 h-14 object-contain mx-auto mb-4" />
            <h2 className="text-slate-800 font-semibold text-2xl">How can I help you?</h2>
            <p className="text-slate-400 text-sm mt-1.5">Ask about products, orders, or customer data.</p>
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
            <MessageBubble key={m.id} message={m} signatureHtml={signatureHtml} />
          ))}
          {isLoading && <ToolCallIndicator />}
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
      className="relative flex flex-col h-full bg-gray-100"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {pageContent}

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
