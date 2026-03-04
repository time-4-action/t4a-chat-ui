import { Sparkles } from "lucide-react";

export default function ToolCallIndicator() {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-700 to-[#0f172a] flex items-center justify-center shrink-0 shadow-md mt-0.5 ring-1 ring-slate-200">
        <Sparkles className="h-3.5 w-3.5 text-white/90 animate-pulse" />
      </div>
      <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-white shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
          <span>Accessing company data…</span>
        </div>
      </div>
    </div>
  );
}
