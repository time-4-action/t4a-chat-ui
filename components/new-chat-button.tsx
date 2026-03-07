"use client";

import { useRouter } from "next/navigation";
import { SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";

export default function NewChatButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();

  function handleClick() {
    router.push("/chat/new");
  }

  return (
    <button
      onClick={handleClick}
      title="New Chat"
      className={cn(
        "flex items-center gap-2 rounded-lg py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors w-full border border-white/20",
        collapsed ? "justify-center px-2" : "px-3"
      )}
    >
      <SquarePen className="h-4 w-4 shrink-0" />
      {!collapsed && <span>New Chat</span>}
    </button>
  );
}
