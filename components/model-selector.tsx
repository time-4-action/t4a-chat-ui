"use client";

import { MODEL_CONFIGS, MODEL_ORDER, ModelId } from "@/lib/models";
import { ChevronDown, Check, Brain, Sparkles, Zap } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: ModelId;
  onChange: (model: ModelId) => void;
}

const ICONS: Record<ModelId, React.ElementType> = {
  "claude-opus-4-6": Brain,
  "claude-sonnet-4-6": Sparkles,
  "claude-haiku-4-5-20251001": Zap,
};

export default function ModelSelector({ value, onChange }: Props) {
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
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200"
      >
        <CurrentIcon className={cn("w-3.5 h-3.5", current.text)} />
        {current.tierName}
        <ChevronDown
          className={cn(
            "w-3 h-3 text-slate-400 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

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
            {MODEL_ORDER.map((id) => {
              const config = MODEL_CONFIGS[id];
              const isSelected = id === value;
              const Icon = ICONS[id];

              return (
                <button
                  key={id}
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
                        <span className={cn("text-xs font-bold tracking-tight", config.text)}>
                          {config.costSymbol}
                        </span>
                        <span className="text-xs font-bold tracking-tight text-slate-200">
                          {"$$$".slice(config.costSymbol.length)}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <Check className={cn("w-4 h-4 shrink-0 mt-0.5", config.text)} />
                    )}
                  </div>
                </button>
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
