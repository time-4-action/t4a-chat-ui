"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import MessageBubble from "./message-bubble";
import ToolCallIndicator from "./tool-call-indicator";
import VoiceMode from "./voice-mode";
import ChatModeSelector, { ChatMode } from "./chat-mode-selector";
import ModelSelector from "./model-selector";
import { ArrowUp, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_MODEL, ModelId, formatCost } from "@/lib/models";

interface Props {
  conversationId: string;
  initialMessages?: UIMessage[];
  initialModel?: ModelId;
  initialCost?: number;
}

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
  const [costUsd, setCostUsd] = useState(initialCost);

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((p) => setSignatureHtml(p?.communicationStyle?.signatureStyle ?? ""))
      .catch(() => {});
  }, []);

  const modeRef = useRef<ChatMode>(null);
  const modelRef = useRef<ModelId>(model);
  const conversationIdRef = useRef(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep refs in sync so transport fetch closure always sees current values
  modeRef.current = mode;
  modelRef.current = model;

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

  const { messages, sendMessage, status } = useChat({
    transport,
    messages: initialMessages,
  });

  const isLoading = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0 && !isLoading;

  // Fetch updated cost after each AI response completes.
  // Retries up to 5x / 500ms apart to handle the async onFinish DB write.
  useEffect(() => {
    if (status !== "ready" || conversationIdRef.current === "new") return;

    let cancelled = false;
    let attempt = 0;

    async function tryFetch() {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/conversations/${conversationIdRef.current}`);
        const conv = await r.json();
        console.log(`[cost] attempt ${attempt + 1}:`, conv.totalCostUsd, "model:", conv.model);
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

    // Initial delay to let onFinish DB write start
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

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    await ensureConversation();
    await sendMessage({ text });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const handleVoiceTranscript = useCallback(
    async (text: string) => {
      setInput("");
      await ensureConversation();
      sendMessage({ text });
    },
    [sendMessage, ensureConversation]
  );

  const handleVoiceInterim = useCallback((text: string) => {
    setInput(text);
  }, []);

  const topBar = (
    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white/80 backdrop-blur-sm shrink-0">
      <ModelSelector value={model} onChange={setModel} />
      {(costUsd > 0 || isLoading) && messages.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <DollarSign className="w-3 h-3" />
          <span>{costUsd > 0 ? formatCost(costUsd) : "…"}</span>
          <span className="text-slate-300">this chat</span>
        </div>
      )}
    </div>
  );

  const modeSelector = (
    <ChatModeSelector mode={mode} onChange={setMode} />
  );

  const inputBox = (
    <div className="space-y-2">
      {modeSelector}
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border-2 bg-white px-4 py-3.5 shadow-lg transition-all",
          mode === "email"
            ? "border-blue-400 focus-within:border-blue-600"
            : mode === "quick-info"
            ? "border-amber-400 focus-within:border-amber-500"
            : "border-slate-300 focus-within:border-slate-500 focus-within:shadow-xl"
        )}
      >
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
              : "Message time-4-action AI…"
          }
          className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-500 outline-none resize-none leading-relaxed max-h-40"
          disabled={isLoading}
        />
        <VoiceMode
          messages={messages}
          status={status}
          onTranscript={handleVoiceTranscript}
          onInterim={handleVoiceInterim}
        />
        <button
          onClick={() => handleSubmit()}
          disabled={isLoading || !input.trim()}
          className={cn(
            "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all",
            input.trim() && !isLoading
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
      </div>
    </div>
  );

  if (isEmpty) {
    return (
      <div className="flex flex-col h-full bg-gray-100">
        {topBar}
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-3xl">
            <div className="text-center mb-8">
              <img
                src="/favicon.ico"
                alt="logo"
                className="w-14 h-14 object-contain mx-auto mb-4"
              />
              <h2 className="text-slate-800 font-semibold text-2xl">
                How can I help you?
              </h2>
              <p className="text-slate-400 text-sm mt-1.5">
                Ask about products, orders, or customer data.
              </p>
            </div>
            {inputBox}
            <p className="text-center text-[11px] text-slate-400 mt-2">
              Shift+Enter for new line · Enter to send
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {topBar}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} signatureHtml={signatureHtml} />
          ))}
          {isLoading && <ToolCallIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] bg-gray-100 border-t border-gray-200">
        <div className="max-w-3xl mx-auto px-4">
          {inputBox}
          <p className="text-center text-[11px] text-slate-400 mt-2">
            Shift+Enter for new line · Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}
