"use client";

import { useState, useRef, useCallback } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import ConversationSidebar from "@/components/conversation-sidebar";
import { TourProvider } from "@/lib/tour-context";
import GuidedTour from "@/components/guided-tour";
import NetworkStatus from "@/components/network-status";
import MaintenanceBanner from "@/components/maintenance-banner";
import InstallPrompt from "@/components/install-prompt";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (delta > 50) setMobileOpen(true);
    else if (delta < -50) setMobileOpen(false);
  }, []);

  return (
    <TourProvider>
    <div className="flex h-[100dvh] overflow-hidden bg-slate-50">

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col bg-white border-r border-slate-200 shrink-0 transition-all duration-300 ease-in-out overflow-hidden",
          open ? "w-72" : "w-16"
        )}
      >
        <ConversationSidebar open={open} onToggle={() => setOpen((v) => !v)} />
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex flex-col bg-white border-r border-slate-200 w-72 transition-transform duration-300 ease-in-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <ConversationSidebar open={true} onToggle={() => setMobileOpen(false)} mobileClose={() => setMobileOpen(false)} />
      </aside>

      {/* Main */}
      <main
        className="flex-1 flex flex-col overflow-hidden min-w-0"
        style={{ touchAction: "pan-y" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <MaintenanceBanner />
        <NetworkStatus />
        <InstallPrompt />
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center h-14 px-4 border-b border-slate-200 bg-white shrink-0 gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="time-4-action" className="h-7 w-auto object-contain" />
        </div>

        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
    <GuidedTour />
    </TourProvider>
  );
}
