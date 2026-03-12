"use client";

import { getCategoryForTool } from "@/lib/capabilities";
import { useEffect, useState } from "react";

const THINKING_PHRASES = [
  "Thinking…",
  "Analyzing your question…",
  "Exploring the best approach…",
  "Considering the context…",
  "Formulating a response…",
  "Working through this…",
  "Connecting the dots…",
];

const STREAMING_PHRASES = [
  "Generating response…",
  "Composing the answer…",
];

const TOOL_PHRASE_MAP: Record<string, string[]> = {
  Products:              ["Searching the catalogue…", "Looking up product data…", "Scanning products…"],
  "Orders & Documents":  ["Retrieving documents…",    "Searching order records…", "Fetching documents…"],
  Partners:              ["Looking up partners…",     "Searching partner database…"],
  Warehouse:             ["Checking stock levels…",   "Scanning warehouse data…"],
  Delivery:              ["Tracking shipment…",       "Fetching delivery info…"],
};

const DEFAULT_TOOL_PHRASES = [
  "Accessing company data…",
  "Running a lookup…",
  "Querying the system…",
  "Discovering results…",
];

interface Props {
  toolName?: string;
  status: "submitted" | "streaming";
}

export default function ToolCallIndicator({ toolName, status }: Props) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  const category = toolName ? getCategoryForTool(toolName) : undefined;
  const phrases = category
    ? (TOOL_PHRASE_MAP[category.label] ?? DEFAULT_TOOL_PHRASES)
    : toolName
    ? DEFAULT_TOOL_PHRASES
    : status === "submitted"
    ? THINKING_PHRASES
    : STREAMING_PHRASES;

  // Reset when context changes
  useEffect(() => {
    setPhraseIdx(0);
    setVisible(true);
  }, [toolName, status]);

  // Cycle phrases with fade-out → swap → fade-in
  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPhraseIdx((i) => (i + 1) % phrases.length);
        setVisible(true);
      }, 300);
    }, 2500);
    return () => clearInterval(id);
  }, [phrases.length]);

  const isThinking = status === "submitted" && !toolName;

  return (
    <div className="flex gap-3 items-start">
      {/* Avatar — with subtle ping ring while in pure-thinking state */}
      <div className="relative hidden sm:block shrink-0 mt-0.5">
        <img
          src="/favicon.ico"
          alt="logo"
          className="w-7 h-7 object-contain rounded-md"
        />
        {isThinking && (
          <span className="absolute inset-0 rounded-md animate-ping bg-slate-300/50" />
        )}
      </div>

      {/* Card */}
      <div className="rounded-2xl rounded-tl-sm bg-white shadow-sm border border-slate-100 overflow-hidden min-w-[210px]">
        {/* Shimmer top bar */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-slate-300 to-transparent bg-[length:200%_100%] animate-[shimmer_2s_ease-in-out_infinite]" />

        <div className="px-4 py-3 flex items-center gap-2.5">
          {/* Bouncing dots */}
          <span className="flex gap-1 shrink-0">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>

          {/* Fading cycling text */}
          <span
            className="text-xs text-slate-500 transition-opacity duration-300 leading-snug"
            style={{ opacity: visible ? 1 : 0 }}
          >
            {phrases[phraseIdx]}
          </span>
        </div>
      </div>
    </div>
  );
}
