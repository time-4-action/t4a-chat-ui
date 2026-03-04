export default function ToolCallIndicator() {
  return (
    <div className="flex gap-3 items-start">
      <img src="/favicon.ico" alt="logo" className="hidden sm:block w-7 h-7 object-contain rounded-md shrink-0 mt-0.5" />
      <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-white shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
          <span>Accessing company data…</span>
        </div>
      </div>
    </div>
  );
}
