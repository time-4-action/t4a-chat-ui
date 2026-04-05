"use client";

import { useState, useRef, useEffect } from "react";
import { FileText, Download, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import type { DocumentData, PresentationData, ContentBlock, DocumentSection, SlideData } from "@/lib/export/types";

export type { DocumentData, PresentationData };

export function parseDocumentFromText(text: string): DocumentData | PresentationData | null {
  const match = text.match(
    /```(?:json)?\s*(\{[\s\S]*?"type"\s*:\s*"(?:document|presentation)"[\s\S]*?\})\s*```/
  );
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (
      (parsed.type === "document" && parsed.title && Array.isArray(parsed.sections)) ||
      (parsed.type === "presentation" && parsed.title && Array.isArray(parsed.slides))
    ) {
      return parsed as DocumentData | PresentationData;
    }
    return null;
  } catch {
    return null;
  }
}

export function isDocumentInProgress(text: string): boolean {
  return (
    text.includes('"type"') &&
    (text.includes('"document"') || text.includes('"presentation"')) &&
    !parseDocumentFromText(text)
  );
}

async function fetchExportBlob(documentJson: DocumentData | PresentationData, format: string): Promise<Blob> {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "document", format, documentJson }),
  });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
}

function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function PresentationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function PreviewBlock({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "paragraph":
      return <p className="text-xs text-slate-600 leading-relaxed mb-1.5">{block.text}</p>;
    case "bullet_list":
      return (
        <ul className="mb-1.5 space-y-0.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-1.5 text-xs text-slate-600 leading-relaxed">
              <span className="text-slate-400 shrink-0 mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "numbered_list":
      return (
        <ol className="mb-1.5 space-y-0.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-1.5 text-xs text-slate-600 leading-relaxed">
              <span className="text-slate-400 shrink-0 tabular-nums">{i + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="overflow-x-auto mb-1.5 rounded border border-slate-100">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-slate-50">
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} className="px-2 py-1 text-left font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1 text-slate-600 border-b border-slate-50">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return (
        <pre className="mb-1.5 bg-slate-50 border border-slate-100 rounded px-2.5 py-2 text-[11px] font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap">
          {block.text}
        </pre>
      );
    default:
      return null;
  }
}

function DocPreview({ data }: { data: DocumentData }) {
  return (
    <div className="space-y-3">
      {data.subtitle && (
        <p className="text-xs text-slate-500 italic -mt-1">{data.subtitle}</p>
      )}
      {data.sections.map((sec, i) => (
        <div key={i}>
          <p className={`font-semibold text-slate-800 mb-1 ${sec.level === 1 ? "text-sm" : sec.level === 2 ? "text-xs" : "text-[11px]"}`}>
            {sec.heading}
          </p>
          {sec.content.map((block, j) => (
            <PreviewBlock key={j} block={block} />
          ))}
        </div>
      ))}
    </div>
  );
}

function PresPreview({ data }: { data: PresentationData }) {
  return (
    <div className="space-y-3">
      {data.slides.map((slide, i) => (
        <div key={i} className="rounded-lg border border-slate-100 overflow-hidden">
          <div className="px-3 py-1.5 bg-slate-700 flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-mono tabular-nums">{i + 1}</span>
            <p className="text-xs font-semibold text-white leading-snug">{slide.title}</p>
          </div>
          {slide.content.length > 0 && (
            <div className="px-3 py-2">
              {slide.content.map((block, j) => (
                <PreviewBlock key={j} block={block} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

type PreGenState = "pending" | "generating" | "ready" | "error";

export default function DocumentCard({ data }: { data: DocumentData | PresentationData }) {
  const [exportError, setExportError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);

  // Pre-generated blobs — keyed by format
  const blobs = useRef<Record<string, Blob>>({});
  const [preGenState, setPreGenState] = useState<Record<string, PreGenState>>({});

  const isDoc = data.type === "document";
  const isPres = data.type === "presentation";

  const sectionCount = isDoc ? (data as DocumentData).sections.length : undefined;
  const slideCount = isPres ? (data as PresentationData).slides.length : undefined;

  const docFormats = ["pdf", "docx", "markdown"] as const;
  const presFormats = ["pptx", "pdf", "markdown"] as const;
  const formats = isDoc ? docFormats : presFormats;
  const safeTitle = (data.title ?? "document").replace(/[^a-z0-9_\- ]/gi, "_").slice(0, 40);

  function startGeneration(fmt: string) {
    if (preGenState[fmt]) return; // already started
    setPreGenState((s) => ({ ...s, [fmt]: "generating" }));
    fetchExportBlob(data, fmt)
      .then((blob) => {
        blobs.current[fmt] = blob;
        setPreGenState((s) => ({ ...s, [fmt]: "ready" }));
      })
      .catch(() => setPreGenState((s) => ({ ...s, [fmt]: "error" })));
  }

  // Start generating all non-markdown formats immediately on mount
  useEffect(() => {
    formats.filter((f) => f !== "markdown").forEach(startGeneration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const FORMAT_LABELS: Record<string, string> = {
    pdf: "PDF",
    docx: "DOCX",
    pptx: "PPTX",
    markdown: "MD",
  };

  function handleDownload(format: string) {
    setExportError(null);
    const ext = format === "markdown" ? "md" : format;
    const filename = `${safeTitle}.${ext}`;

    if (format === "markdown") {
      fetchExportBlob(data, "markdown")
        .then((blob) => saveBlob(blob, filename))
        .catch(() => setExportError("Failed to export Markdown."));
      return;
    }

    const state = preGenState[format];
    const blob = blobs.current[format];

    if (state === "ready" && blob) {
      saveBlob(blob, filename);
    } else if (state === "generating") {
      setExportError(`${FORMAT_LABELS[format]} is still being generated — try again in a moment.`);
    } else if (state === "error") {
      // Retry on click after error
      startGeneration(format);
    } else {
      // Not started yet — start now and inform user
      startGeneration(format);
      setExportError(`Generating ${FORMAT_LABELS[format]}… click again when ready.`);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-md w-full max-w-[92%] sm:max-w-[85%] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-slate-800 to-slate-700">
        <div className="flex items-center gap-2 text-white">
          {isDoc
            ? <FileText className="h-4 w-4" />
            : <PresentationIcon className="h-4 w-4" />
          }
          <span className="text-sm font-semibold tracking-wide">
            {isDoc ? "Document Draft" : "Presentation Draft"}
          </span>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-slate-300 uppercase tracking-wider">
          {data.type}
        </span>
      </div>

      {/* Meta */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-900 leading-snug">{data.title}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {isDoc
            ? `${sectionCount} section${sectionCount !== 1 ? "s" : ""}`
            : `${slideCount} slide${slideCount !== 1 ? "s" : ""}`
          }
          {data.author ? ` · ${data.author}` : ""}
        </p>
      </div>

      {/* Preview toggle */}
      <button
        type="button"
        onClick={() => setPreviewOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-left border-b border-slate-100 hover:bg-slate-50 transition-colors"
      >
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Preview</span>
        {previewOpen
          ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
          : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        }
      </button>

      {/* Preview content */}
      {previewOpen && (
        <div className="px-4 py-3 max-h-96 overflow-y-auto border-b border-slate-100">
          {isDoc
            ? <DocPreview data={data as DocumentData} />
            : <PresPreview data={data as PresentationData} />
          }
        </div>
      )}

      {/* Download buttons */}
      <div className="px-4 py-2.5 bg-slate-50 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-slate-400 font-medium mr-1">Download as:</span>
        {formats.map((fmt) => {
          const state: PreGenState = fmt === "markdown" ? "ready" : (preGenState[fmt] ?? "generating");
          const isGenerating = state === "generating" || state === "pending";
          const isReady = state === "ready";
          const isError = state === "error";
          return (
            <button
              key={fmt}
              onClick={() => handleDownload(fmt)}
              disabled={isGenerating}
              title={isGenerating ? "Generating…" : isError ? "Generation failed — click to retry" : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                ${isGenerating ? "bg-white border-slate-200 text-slate-400 cursor-wait" : ""}
                ${isReady ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 cursor-pointer" : ""}
                ${isError ? "bg-white border-red-200 text-red-500 hover:bg-red-50 cursor-pointer" : ""}
              `}
            >
              {isGenerating && <Loader2 className="h-3 w-3 animate-spin" />}
              {isReady && <Download className="h-3 w-3" />}
              {isError && <AlertCircle className="h-3 w-3" />}
              {FORMAT_LABELS[fmt]}
            </button>
          );
        })}
      </div>

      {/* Error */}
      {exportError && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100">
          <p className="text-xs text-red-600">{exportError}</p>
        </div>
      )}
    </div>
  );
}
