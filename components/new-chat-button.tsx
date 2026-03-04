"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";

export default function NewChatButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations", { method: "POST" });
      const conversation = await res.json();
      router.push(`/chat/${conversation._id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title="New Chat"
      className={cn(
        "flex items-center gap-2 rounded-lg py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors w-full border border-white/20 disabled:opacity-50",
        collapsed ? "justify-center px-2" : "px-3"
      )}
    >
      <SquarePen className="h-4 w-4 shrink-0" />
      {!collapsed && <span>New Chat</span>}
    </button>
  );
}
