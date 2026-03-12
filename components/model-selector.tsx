"use client";

import { MODEL_CONFIGS, MODEL_ORDER, ModelId } from "@/lib/models";
import { ChevronDown, Check, Brain, Sparkles, Zap, Lock, Bot, Cpu, Star, Atom } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: ModelId;
  onChange: (model: ModelId) => void;
  disabled?: boolean;
  locked?: boolean; // chat in progress — show lock icon, no opacity change
}

const ICONS: Record<ModelId, React.ElementType> = {
  "claude-opus-4-6": Brain,
  "claude-sonnet-4-6": Sparkles,
  "claude-haiku-4-5-20251001": Zap,
  "gpt-4o": Bot,
  "gpt-4o-mini": Cpu,
  "gpt-5-mini": Star,
  "gpt-5-nano": Atom,
};

export default function ModelSelector({ value, onChange, disabled, locked }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODEL_CONFIGS[value];
  const CurrentIcon = ICONS[value];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative group">
      {/* Trigger button */}
      <button
        onClick={() => !disabled && !locked && setOpen(!open)}
        disabled={disabled}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 transition-all border border-transparent",
          locked
            ? "cursor-default"
            : disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-white hover:shadow-sm hover:border-slate-200"
        )}
      >
        <CurrentIcon className={cn("w-3.5 h-3.5", current.text)} />
        {current.tierName}
        {locked ? (
          <Lock className="w-3 h-3 text-slate-300" />
        ) : (
          <ChevronDown
            className={cn(
              "w-3 h-3 text-slate-400 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      {/* Locked tooltip */}
      {locked && (
        <div className="pointer-events-none absolute left-0 top-full mt-2 z-50 w-56 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <div className="bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl leading-relaxed">
            Model can&apos;t be changed mid-chat.
            <a
              href="/chat"
              className="pointer-events-auto block mt-1 text-slate-300 hover:text-white underline underline-offset-2 transition-colors"
            >
              Open a new chat to switch →
            </a>
          </div>
          {/* Arrow */}
          <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-800 rotate-45" />
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-2 w-[300px] bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Choose AI Model
            </p>
          </div>

          {/* Model cards */}
          <div className="p-2 space-y-1">
            {MODEL_ORDER.map((id, idx) => {
              const config = MODEL_CONFIGS[id];
              const isSelected = id === value;
              const Icon = ICONS[id];
              const prevConfig = idx > 0 ? MODEL_CONFIGS[MODEL_ORDER[idx - 1]] : null;
              const showProviderDivider = prevConfig && prevConfig.provider !== config.provider;

              return (
                <div key={id}>
                  {showProviderDivider && (
                    <div className="flex items-center gap-2 px-1 py-2">
                      <div className="flex-1 h-px bg-slate-100" />
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">OpenAI</span>
                      <div className="flex-1 h-px bg-slate-100" />
                    </div>
                  )}
                <button
                  onClick={() => { onChange(id); setOpen(false); }}
                  className={cn(
                    "w-full text-left rounded-xl px-3.5 py-3 transition-all duration-150 border",
                    isSelected
                      ? cn(config.bg, config.border)
                      : "border-transparent hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Tier name + recommended badge */}
                      <div className="flex items-center gap-2 mb-0.5">
                        <Icon className={cn("w-4 h-4 shrink-0", config.text)} />
                        <span className="font-bold text-sm text-slate-800">
                          {config.tierName}
                        </span>
                        {config.recommended && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">
                            Recommended
                          </span>
                        )}
                        {"badge" in config && config.badge && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                            {config.badge}
                          </span>
                        )}
                      </div>

                      {/* Purpose description */}
                      <p className="text-xs text-slate-500 ml-6 leading-relaxed mb-2">
                        {config.tierDescription}
                      </p>

                      {/* Model name + cost indicator */}
                      <div className="ml-6 flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-medium">
                          {config.modelName}
                        </span>
                        <span className="text-slate-200">·</span>
                        <span className="text-xs font-bold tracking-tight">
                          <span className={config.text}>{config.costSymbol}</span>
                          <span className="text-slate-200">{"$$$".slice(config.costSymbol.length)}</span>
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <Check className={cn("w-4 h-4 shrink-0 mt-0.5", config.text)} />
                    )}
                  </div>
                </button>
                </div>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="px-4 py-2.5 border-t border-slate-50">
            <p className="text-[10px] text-slate-400">
              $ affordable · $$ moderate · $$$ most capable
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
