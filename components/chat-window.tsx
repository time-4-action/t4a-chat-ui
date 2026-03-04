"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { useState, useEffect, useRef, useCallback } from "react";
import MessageBubble from "./message-bubble";
import ToolCallIndicator from "./tool-call-indicator";
import VoiceMode from "./voice-mode";
import { ArrowUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  conversationId: string;
  initialMessages?: UIMessage[];
}

export default function ChatWindow({ conversationId, initialMessages = [] }: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { conversationId },
    }),
    messages: initialMessages,
  });

  const isLoading = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0 && !isLoading;

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
    await sendMessage({ text });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput("");
    sendMessage({ text });
  }, [sendMessage]);

  const handleVoiceInterim = useCallback((text: string) => {
    setInput(text);
  }, []);

  const inputBox = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border-2 bg-white px-4 py-3.5 shadow-lg transition-all",
        "border-slate-300 focus-within:border-slate-500 focus-within:shadow-xl"
      )}
    >
      <textarea
        ref={inputRef}
        rows={1}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message time-4-action AI…"
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
            ? "bg-[#0f172a] text-white shadow-sm hover:bg-slate-700"
            : "bg-slate-200 text-slate-400"
        )}
        aria-label="Send"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </div>
  );

  if (isEmpty) {
    return (
      <div className="flex flex-col h-full bg-gray-100">
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-3xl">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-700 to-[#0f172a] flex items-center justify-center shadow-lg mx-auto mb-4">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-slate-800 font-semibold text-2xl">How can I help you?</h2>
              <p className="text-slate-400 text-sm mt-1.5">Ask about products, orders, or customer data.</p>
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
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
