"use client";

import { Package, FileText, Users, Warehouse, Truck } from "lucide-react";
import { CAPABILITIES } from "@/lib/capabilities";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ElementType> = { Package, FileText, Users, Warehouse, Truck };

const COLOR_CLASSES: Record<string, { badge: string; icon: string; dot: string }> = {
  blue:    { badge: "bg-blue-100",    icon: "text-blue-600",    dot: "bg-blue-400" },
  violet:  { badge: "bg-violet-100",  icon: "text-violet-600",  dot: "bg-violet-400" },
  emerald: { badge: "bg-emerald-100", icon: "text-emerald-600", dot: "bg-emerald-400" },
  amber:   { badge: "bg-amber-100",   icon: "text-amber-600",   dot: "bg-amber-400" },
  rose:    { badge: "bg-rose-100",    icon: "text-rose-600",    dot: "bg-rose-400" },
};

export default function CapabilitiesPage() {
  return (
    <div className="min-h-screen bg-gray-100">

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-10 h-14 bg-white border-b border-gray-100 flex items-center px-4 sm:px-6 gap-3">
        <a
          href="/chat"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">Chat</span>
        </a>
        <span className="text-gray-200 hidden sm:inline">/</span>
        <span className="text-sm font-semibold text-gray-800">Capabilities</span>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-24 pb-10">

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-800">Capabilities</h1>
          <p className="text-sm text-slate-500 mt-1">
            Everything you can ask the AI assistant about your company data.
          </p>
        </div>

        <div className="space-y-4">
          {CAPABILITIES.map((cap) => {
            const Icon = ICONS[cap.icon] ?? Package;
            const colors = COLOR_CLASSES[cap.color] ?? COLOR_CLASSES.blue;

            return (
              <div key={cap.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", colors.badge)}>
                    <Icon className={cn("h-4 w-4", colors.icon)} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800">{cap.label}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{cap.description}</p>
                  </div>
                </div>

                {/* Example prompts */}
                <div className="pl-12 space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Example questions</p>
                  {cap.prompts.map((prompt) => (
                    <div key={prompt} className="flex items-start gap-2">
                      <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", colors.dot)} />
                      <p className="text-xs text-slate-600 leading-relaxed">{prompt}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-8">
          More capabilities coming soon. Request via the feedback button in the sidebar.
        </p>
      </div>
    </div>
  );
}
