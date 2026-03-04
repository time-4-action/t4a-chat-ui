import { UIMessage } from "ai";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles } from "lucide-react";

export default function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  const textContent = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] sm:max-w-[70%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap bg-[#0f172a] text-white shadow-md">
          {textContent}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-start">
      {/* AI avatar */}
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-700 to-[#0f172a] flex items-center justify-center shrink-0 shadow-md mt-0.5 ring-1 ring-slate-200">
        <Sparkles className="h-3.5 w-3.5 text-white/90" />
      </div>

      {/* Bubble */}
      <div className="max-w-[85%] sm:max-w-[78%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed bg-white shadow-sm border border-slate-200 text-slate-800">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
            ul: ({ children }) => <ul className="list-disc pl-5 mb-2.5 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-5 mb-2.5 space-y-1">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
            em: ({ children }) => <em className="italic">{children}</em>,
            code: ({ children, className }) => {
              const isBlock = !!className;
              return isBlock ? (
                <code className="block bg-slate-900 text-slate-100 rounded-lg px-3 py-2 text-xs font-mono overflow-x-auto my-2">
                  {children}
                </code>
              ) : (
                <code className="bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 text-xs font-mono">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="bg-slate-900 text-slate-100 rounded-xl px-4 py-3 text-xs font-mono overflow-x-auto my-3 shadow-inner">
                {children}
              </pre>
            ),
            h1: ({ children }) => <h1 className="text-base font-bold text-slate-900 mb-2 mt-1">{children}</h1>,
            h2: ({ children }) => <h2 className="text-sm font-bold text-slate-900 mb-2 mt-1">{children}</h2>,
            h3: ({ children }) => <h3 className="text-sm font-semibold text-slate-900 mb-1 mt-1">{children}</h3>,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 underline underline-offset-2">
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-3 border-slate-300 pl-3 text-slate-500 italic my-2">
                {children}
              </blockquote>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-3 rounded-lg border border-slate-200">
                <table className="text-xs border-collapse w-full">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
            th: ({ children }) => (
              <th className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 text-slate-600 border-b border-slate-100 last:border-b-0">
                {children}
              </td>
            ),
          }}
        >
          {textContent}
        </ReactMarkdown>
      </div>
    </div>
  );
}
