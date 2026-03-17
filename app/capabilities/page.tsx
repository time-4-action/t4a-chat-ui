"use client";

import { useState, useRef } from "react";
import {
  Package, FileText, Users, Warehouse, Mail, BarChart2, Brain, Check,
} from "lucide-react";
import { CAPABILITIES } from "@/lib/capabilities";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ElementType> = {
  Package, FileText, Users, Warehouse, Mail, BarChart2, Brain,
};

type ColorKey = "blue" | "violet" | "emerald" | "amber" | "rose" | "sky" | "indigo";

const COLOR: Record<ColorKey, { iconBg: string; icon: string; checkBg: string; check: string; activeNav: string; activeNavText: string; }> = {
  blue:    { iconBg: "bg-blue-100",    icon: "text-blue-600",    checkBg: "bg-blue-50",    check: "text-blue-500",    activeNav: "bg-blue-50",    activeNavText: "text-blue-700" },
  violet:  { iconBg: "bg-violet-100",  icon: "text-violet-600",  checkBg: "bg-violet-50",  check: "text-violet-500",  activeNav: "bg-violet-50",  activeNavText: "text-violet-700" },
  emerald: { iconBg: "bg-emerald-100", icon: "text-emerald-600", checkBg: "bg-emerald-50", check: "text-emerald-500", activeNav: "bg-emerald-50", activeNavText: "text-emerald-700" },
  amber:   { iconBg: "bg-amber-100",   icon: "text-amber-600",   checkBg: "bg-amber-50",   check: "text-amber-500",   activeNav: "bg-amber-50",   activeNavText: "text-amber-700" },
  rose:    { iconBg: "bg-rose-100",    icon: "text-rose-600",    checkBg: "bg-rose-50",    check: "text-rose-500",    activeNav: "bg-rose-50",    activeNavText: "text-rose-700" },
  sky:     { iconBg: "bg-sky-100",     icon: "text-sky-600",     checkBg: "bg-sky-50",     check: "text-sky-500",     activeNav: "bg-sky-50",     activeNavText: "text-sky-700" },
  indigo:  { iconBg: "bg-indigo-100",  icon: "text-indigo-600",  checkBg: "bg-indigo-50",  check: "text-indigo-500",  activeNav: "bg-indigo-50",  activeNavText: "text-indigo-700" },
};

export default function CapabilitiesPage() {
  const [activeId, setActiveId] = useState(CAPABILITIES[0].id);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollTo(id: string) {
    setActiveId(id);
    setTimeout(() => {
      document.getElementById(`cap-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-[#f7f8fa] overflow-hidden">

      {/* Header */}
      <header className="shrink-0 h-14 bg-white border-b border-gray-100 flex items-center px-4 sm:px-6 gap-3 z-10">
        <a
          href="/chat"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">Chat</span>
        </a>
        <span className="text-gray-200 hidden sm:inline">/</span>
        <span className="text-sm font-semibold text-gray-800">Capabilities</span>
      </header>

      {/* Mobile tab bar */}
      <div className="lg:hidden shrink-0 bg-white border-b border-gray-100 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-1 px-4 py-2.5 whitespace-nowrap">
          {CAPABILITIES.map((cap) => (
            <button
              key={cap.id}
              onClick={() => scrollTo(cap.id)}
              className={`flex-none px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeId === cap.id
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-500 active:bg-gray-200"
              }`}
            >
              {cap.navLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-white border-r border-gray-100 overflow-y-auto">
          <div className="px-4 pt-8 pb-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-2">
              Capabilities
            </p>
            <nav className="space-y-0.5">
              {CAPABILITIES.map((cap) => {
                const Icon = ICONS[cap.icon] ?? Package;
                const c = COLOR[cap.color as ColorKey] ?? COLOR.blue;
                const isActive = activeId === cap.id;
                return (
                  <button
                    key={cap.id}
                    onClick={() => scrollTo(cap.id)}
                    className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                      isActive
                        ? cn(c.activeNav, c.activeNavText)
                        : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                    }`}
                  >
                    <div className={cn(
                      "h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors",
                      isActive ? c.iconBg : "bg-gray-100"
                    )}>
                      <Icon className={cn("h-3.5 w-3.5", isActive ? c.icon : "text-gray-400")} />
                    </div>
                    {cap.navLabel}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-16 space-y-4">

            {CAPABILITIES.map((cap) => {
              const Icon = ICONS[cap.icon] ?? Package;
              const c = COLOR[cap.color as ColorKey] ?? COLOR.blue;

              return (
                <section
                  id={`cap-${cap.id}`}
                  key={cap.id}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
                >
                  {/* Card header */}
                  <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", c.iconBg)}>
                        <Icon className={cn("h-4 w-4", c.icon)} />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold text-gray-900">{cap.label}</h2>
                        <p className="text-xs text-gray-400 mt-0.5">{cap.description}</p>
                      </div>
                    </div>
                    <span className={cn("shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full", c.iconBg, c.icon)}>
                      {cap.prompts.length}
                    </span>
                  </div>

                  {/* Feature rows */}
                  <div className="divide-y divide-gray-50">
                    {cap.prompts.map((prompt) => {
                      const dashIdx = prompt.indexOf(" — ");
                      const title = dashIdx !== -1 ? prompt.slice(0, dashIdx) : prompt;
                      const subtitle = dashIdx !== -1 ? prompt.slice(dashIdx + 3) : null;
                      return (
                        <div key={prompt} className="flex items-start gap-3 px-4 sm:px-6 py-3.5">
                          <div className={cn("h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5", c.checkBg)}>
                            <Check className={cn("h-3 w-3", c.check)} strokeWidth={2.5} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 leading-snug">{title}</p>
                            {subtitle && (
                              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{subtitle}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <p className="text-center text-[11px] text-gray-400 pt-2">
              Tools activate automatically — no commands required
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
