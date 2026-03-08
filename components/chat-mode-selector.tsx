"use client";

import { Mail, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChatMode = "email" | "quick-info" | null;

const MODES = [
  {
    id: "email" as const,
    label: "Email",
    icon: Mail,
    activeClass: "bg-blue-600 text-white border-blue-600 shadow-blue-200 shadow-md",
    inactiveClass:
      "bg-white text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-400",
  },
  {
    id: "quick-info" as const,
    label: "Quick Info",
    icon: Zap,
    activeClass: "bg-amber-500 text-white border-amber-500 shadow-amber-200 shadow-md",
    inactiveClass:
      "bg-white text-amber-600 border-amber-200 hover:bg-amber-50 hover:border-amber-400",
  },
];

interface Props {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
  toneSlot?: React.ReactNode;
}

export default function ChatModeSelector({ mode, onChange, disabled, toneSlot }: Props) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 flex-wrap flex-1">
      {MODES.map((m) => {
        const Icon = m.icon;
        const isActive = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => !disabled && onChange(isActive ? null : m.id)}
            disabled={disabled}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 select-none",
              disabled ? "opacity-50 cursor-not-allowed" : "",
              isActive ? m.activeClass : m.inactiveClass
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {m.label}
            {isActive && (
              <span className="h-1.5 w-1.5 rounded-full bg-white/70 ml-0.5" />
            )}
          </button>
        );
      })}
      </div>
      {toneSlot}
    </div>
  );
}
