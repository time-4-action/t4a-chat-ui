"use client";
import { useEffect, useState } from "react";
import { WifiOff, X } from "lucide-react";

export default function NetworkStatus() {
  const [offline, setOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    function handleOffline() { setOffline(true); setDismissed(false); }
    function handleOnline() { setOffline(false); }
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!offline || dismissed) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-slate-800 text-white text-sm shrink-0">
      <WifiOff className="h-4 w-4 shrink-0 text-slate-300" />
      <span className="flex-1">You&apos;re offline — messages may not send.</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="p-1 rounded hover:bg-slate-700 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
