"use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const DISMISSED_KEY = "pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;
    function handler(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      setDeferredPrompt(null);
      setVisible(false);
    });
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  if (!visible || !deferredPrompt) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-600 text-white text-sm shrink-0">
      <Download className="h-4 w-4 shrink-0" />
      <span className="flex-1">Install the app for a better experience.</span>
      <button
        type="button"
        onClick={handleInstall}
        className="px-3 py-1 rounded-lg bg-white text-blue-600 text-xs font-semibold hover:bg-blue-50 transition-colors"
      >
        Install
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        className="p-1 rounded hover:bg-blue-700 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
