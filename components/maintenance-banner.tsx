"use client";
import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

// The maintenance notices every t4a app shows, set from Slack with /maintenance
// or at maintenance.time-4-action.com/admin (time-4-action/t4a-maintenance).
// One strip per maintenance, most urgent first, at most three: amber while
// planned, red while it runs; nothing when none is on or banner.json can't be read.
const BANNER_URL = "https://maintenance.time-4-action.com/banner.json?app=chat";
const POLL_MS = 60_000;
const MAX_ITEMS = 3;

type Item = { id: number | string; level: "planned" | "now" | "down"; text: string };

export default function MaintenanceBanner() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(BANNER_URL)
        .then((r) => (r.ok ? (r.json() as Promise<{ items?: Item[] }>) : null))
        .then((b) => alive && setItems(Array.isArray(b?.items) ? b.items.filter((i) => i?.text).slice(0, MAX_ITEMS) : []))
        .catch(() => alive && setItems([]));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!items.length) return null;

  return (
    <div role="status" className="shrink-0">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "flex items-center gap-3 px-4 py-2 text-sm border-b",
            item.level === "planned"
              ? "bg-amber-100 border-amber-300 text-amber-900"
              : "bg-red-100 border-red-300 text-red-900",
          )}
        >
          <Wrench className="h-4 w-4 shrink-0" />
          <span className="flex-1">{item.text}</span>
        </div>
      ))}
    </div>
  );
}
