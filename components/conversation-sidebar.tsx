"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Pencil,
  Check,
  X,
  LogOut,
  SquarePen,
  Trash2,
  Lightbulb,
  Settings,
  Zap,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@auth0/nextjs-auth0/client";
import { useTour } from "@/lib/tour-context";

interface Conversation {
  _id: string;
  title: string;
  updatedAt: string;
}

interface Props {
  open: boolean;
  onToggle: () => void;
  mobileClose?: () => void;
}

function groupConversations(conversations: Conversation[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const last7Start = new Date(todayStart);
  last7Start.setDate(last7Start.getDate() - 7);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const c of conversations) {
    const d = new Date(c.updatedAt);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (dayStart >= todayStart) groups[0].items.push(c);
    else if (dayStart >= yesterdayStart) groups[1].items.push(c);
    else if (dayStart >= last7Start) groups[2].items.push(c);
    else groups[3].items.push(c);
  }

  return groups.filter((g) => g.items.length > 0);
}

export default function ConversationSidebar({ open, onToggle, mobileClose }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const { user } = useUser();
  const { startTour } = useTour();

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then(setConversations)
      .catch(console.error);
  }, [pathname]);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  function handleNewChat() {
    mobileClose?.();
    window.location.href = "/chat/new";
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c._id !== id));
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (pathname === `/chat/${id}`) {
      window.location.href = "/chat";
    }
  }

  async function saveRename(id: string) {
    const trimmed = editTitle.trim();
    if (!trimmed) { cancelRename(); return; }
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    setConversations((prev) =>
      prev.map((c) => (c._id === id ? { ...c, title: trimmed } : c))
    );
    setEditingId(null);
  }

  function startRename(c: Conversation, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(c._id);
    setEditTitle(c.title);
  }

  function cancelRename() {
    setEditingId(null);
    setEditTitle("");
  }

  const initials = (user?.name ?? user?.email ?? "U")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const groups = groupConversations(conversations);

  return (
    <div className="flex flex-col h-full bg-white">

      {/* Brand header */}
      <div className="flex items-center justify-between h-16 shrink-0 px-4 border-b border-slate-100">
        {open && (
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="logo" className="h-7 w-7 object-contain rounded-md" />
            <span className="text-sm font-semibold text-slate-800">Time 4 Action</span>
          </div>
        )}
        <button
          onClick={mobileClose ?? onToggle}
          className={cn(
            "p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0",
            !open && "mx-auto"
          )}
        >
          {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {/* New chat */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={handleNewChat}
          title="New Chat"
          data-tour="new-chat-btn"
          className={cn(
            "flex items-center gap-2.5 w-full rounded-xl py-2.5 text-sm font-medium transition-all",
            "bg-[#0f172a] hover:bg-slate-700 text-white shadow-sm",
            open ? "px-4" : "justify-center px-2"
          )}
        >
          <SquarePen className="h-4 w-4 shrink-0" />
          {open && <span>New Chat</span>}
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {open && conversations.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-8">No conversations yet</p>
        )}

        {groups.map((group) => (
          <div key={group.label}>
            {open && (
              <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((c) => {
                const isActive = pathname === `/chat/${c._id}`;
                const isEditing = editingId === c._id;

                return (
                  <div
                    key={c._id}
                    className={cn(
                      "group relative flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-all cursor-pointer",
                      isActive
                        ? "bg-slate-100 text-slate-900 font-medium"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-slate-700 rounded-full" />
                    )}

                    <MessageSquare className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-slate-700" : "text-slate-400")} />

                    {open && (
                      isEditing ? (
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <input
                            ref={editRef}
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRename(c._id);
                              if (e.key === "Escape") cancelRename();
                            }}
                            onBlur={() => saveRename(c._id)}
                            className="flex-1 min-w-0 bg-white text-slate-900 text-xs rounded-lg px-2 py-1 outline-none border border-slate-300 focus:border-slate-500"
                          />
                          <button onMouseDown={(e) => { e.preventDefault(); saveRename(c._id); }} className="p-1 text-slate-400 hover:text-emerald-600 shrink-0 transition-colors">
                            <Check className="h-3 w-3" />
                          </button>
                          <button onMouseDown={(e) => { e.preventDefault(); cancelRename(); }} className="p-1 text-slate-400 hover:text-red-500 shrink-0 transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Link
                            href={`/chat/${c._id}`}
                            className="flex-1 truncate text-[13px]"
                            onClick={() => mobileClose?.()}
                          >
                            {c.title}
                          </Link>
                          <div className="flex items-center gap-0.5 shrink-0 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                            <button
                              onClick={(e) => startRename(c, e)}
                              className="p-1.5 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                              title="Rename"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => handleDelete(c._id, e)}
                              className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Feedback modal — centered on desktop, bottom sheet on mobile */}
      {showFeedback && (
        <div className="fixed inset-0 z-50 flex bg-black/40 backdrop-blur-sm items-end lg:items-center justify-center" onClick={() => setShowFeedback(false)}>
          <div className="bg-white lg:rounded-2xl rounded-t-2xl shadow-xl p-6 w-full max-w-sm lg:mx-4 animate-slide-up lg:[animation:none]" onClick={(e) => e.stopPropagation()}>
            {/* Drag handle (mobile only) */}
            <div className="lg:hidden flex justify-center mb-4">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">Request Improvement</h3>
              <button onClick={() => setShowFeedback(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Have an idea or found something that could be better? Send us an email and we&apos;ll look into it.
            </p>
            <a
              href="mailto:grega@time-4-action.com"
              className="mt-4 flex items-center justify-center gap-2 w-full rounded-xl py-2.5 px-4 bg-[#0f172a] hover:bg-slate-700 text-white text-sm font-medium transition-colors"
            >
              grega@time-4-action.com
            </a>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="mx-3 h-px bg-slate-100" />

      {/* Settings */}
      <div className="px-3 py-1 shrink-0">
        <a
          href="/settings"
          title="Settings"
          data-tour="settings-link"
          className={cn(
            "flex items-center gap-2.5 w-full rounded-xl py-2 text-sm transition-all",
            pathname === "/settings"
              ? "bg-slate-100 text-slate-900 font-medium"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
            open ? "px-3" : "justify-center px-2"
          )}
        >
          <Settings className={cn("h-4 w-4 shrink-0", pathname === "/settings" ? "text-slate-700" : "")} />
          {open && <span>Settings</span>}
        </a>
      </div>

      {/* Capabilities */}
      <div className="px-3 py-1 shrink-0">
        <a
          href="/capabilities"
          title="Capabilities"
          data-tour="capabilities-link"
          className={cn(
            "flex items-center gap-2.5 w-full rounded-xl py-2 text-sm transition-all",
            pathname === "/capabilities"
              ? "bg-slate-100 text-slate-900 font-medium"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
            open ? "px-3" : "justify-center px-2"
          )}
        >
          <Zap className={cn("h-4 w-4 shrink-0", pathname === "/capabilities" ? "text-slate-700" : "")} />
          {open && <span>Capabilities</span>}
        </a>
      </div>

      {/* Help Tour */}
      <div className="px-3 py-1 shrink-0">
        <button
          onClick={startTour}
          title="How to use"
          className={cn(
            "flex items-center gap-2.5 w-full rounded-xl py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer",
            open ? "px-3" : "justify-center px-2"
          )}
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          {open && <span>How to use</span>}
        </button>
      </div>

      {/* Request Improvement */}
      <div className="px-3 py-1 shrink-0">
        <button
          onClick={() => setShowFeedback(true)}
          title="Request Improvement"
          className={cn(
            "flex items-center gap-2.5 w-full rounded-xl py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer",
            open ? "px-3" : "justify-center px-2"
          )}
        >
          <Lightbulb className="h-4 w-4 shrink-0" />
          {open && <span>Request Improvement</span>}
        </button>
      </div>

      {/* User section */}
      <div className="p-3 shrink-0">
        {open ? (
          <div className="flex items-center gap-3 px-1">
            <div className="h-8 w-8 rounded-full overflow-hidden ring-2 ring-slate-200 shrink-0">
              {user?.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.picture} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-xs font-bold text-white">
                  {initials}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-slate-800 truncate leading-tight">
                {user?.name ?? user?.email ?? "User"}
              </p>
              {user?.name && (
                <p className="text-[11px] text-slate-400 truncate leading-tight">{user.email}</p>
              )}
            </div>
            <a
              href="/auth/logout"
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </a>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 rounded-full overflow-hidden ring-2 ring-slate-200">
              {user?.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.picture} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-xs font-bold text-white">
                  {initials}
                </div>
              )}
            </div>
            <a
              href="/auth/logout"
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
