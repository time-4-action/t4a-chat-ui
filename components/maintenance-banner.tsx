"use client";
import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

// The maintenance notice every t4a app shows, set from Slack with /maintenance
// (time-4-action/t4a-infra, servers/t4a/README.md). Amber while planned, red
// while it runs; nothing when none is on or banner.json can't be read.
const BANNER_URL = "https://maintenance.time-4-action.com/banner.json";
const POLL_MS = 60_000;

type Banner = { active: boolean; level?: "planned" | "now" | "down"; text?: string };

export default function MaintenanceBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(BANNER_URL)
        .then((r) => (r.ok ? (r.json() as Promise<Banner>) : null))
        .then((b) => alive && setBanner(b?.active && b.text ? b : null))
        .catch(() => alive && setBanner(null));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!banner) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-3 px-4 py-2 text-sm shrink-0 border-b",
        banner.level === "planned"
          ? "bg-amber-100 border-amber-300 text-amber-900"
          : "bg-red-100 border-red-300 text-red-900",
      )}
    >
      <Wrench className="h-4 w-4 shrink-0" />
      <span className="flex-1">{banner.text}</span>
    </div>
  );
}
