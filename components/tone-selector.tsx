"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ToneDoc } from "./create-tone-modal";

interface Props {
  tones: ToneDoc[];
  activeToneId: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}

export default function ToneSelector({ tones, activeToneId, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = tones.find((t) => t._id === activeToneId) ?? null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (tones.length === 0) return null;

  return (
    <div ref={ref} className="relative ml-auto">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 select-none",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          active
            ? "bg-slate-800 text-white border-slate-800 shadow-sm"
            : "bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600"
        )}
      >
        {active ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="max-w-[120px] truncate">{active.name}</span>
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            Tone
          </>
        )}
        <svg
          className={cn("w-3 h-3 shrink-0 transition-transform duration-150", open ? "rotate-180" : "")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown — opens upward */}
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
          {/* Header */}
          <div className="px-3 pt-3 pb-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Tone</p>
          </div>

          {/* Options */}
          <div className="max-h-60 overflow-y-auto pb-1">
            {/* No tone option */}
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                !activeToneId
                  ? "bg-slate-50"
                  : "hover:bg-slate-50 active:bg-slate-100"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                !activeToneId ? "border-slate-800 bg-slate-800" : "border-slate-300"
              )}>
                {!activeToneId && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">No tone</p>
                <p className="text-[11px] text-slate-400 leading-tight">Use default style</p>
              </div>
            </button>

            {/* Tone options */}
            {tones.map((tone) => {
              const isSelected = activeToneId === tone._id;
              return (
                <button
                  key={tone._id}
                  type="button"
                  onClick={() => { onChange(isSelected ? null : tone._id); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                    isSelected ? "bg-slate-50" : "hover:bg-slate-50 active:bg-slate-100"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                    isSelected ? "border-slate-800 bg-slate-800" : "border-slate-300"
                  )}>
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{tone.name}</p>
                    {(tone.description || tone.tags.length > 0) && (
                      <p className="text-[11px] text-slate-400 leading-tight truncate mt-0.5">
                        {tone.description || tone.tags.slice(0, 3).join(", ")}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-3 py-2.5">
            <a
              href="/settings#tones"
              className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-700 transition-colors"
              onClick={() => setOpen(false)}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Manage tones
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
