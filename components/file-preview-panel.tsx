"use client";

import { X, FileText, Image as ImageIcon, FileCode } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface PreviewFile {
  filename: string;
  mediaType: string; // "application/pdf" | "image/*" | "docx" | "xlsx" | ...
  url?: string;      // base64 data URL (PDFs/images, current session only)
  text?: string;     // extracted text (DOCX/XLSX/text files)
}

const EXT_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  pdf:  { label: "PDF",  bg: "bg-red-100",     text: "text-red-700" },
  docx: { label: "DOC",  bg: "bg-blue-100",    text: "text-blue-700" },
  xlsx: { label: "XLS",  bg: "bg-green-100",   text: "text-green-700" },
  xls:  { label: "XLS",  bg: "bg-green-100",   text: "text-green-700" },
  ods:  { label: "ODS",  bg: "bg-green-100",   text: "text-green-700" },
  csv:  { label: "CSV",  bg: "bg-emerald-100", text: "text-emerald-700" },
  txt:  { label: "TXT",  bg: "bg-slate-100",   text: "text-slate-600" },
  md:   { label: "MD",   bg: "bg-sky-100",     text: "text-sky-700" },
};

const MIN_WIDTH = 280;
const MAX_WIDTH = 780;
const DEFAULT_WIDTH = 420;

function badgeFor(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_BADGE[ext] ?? { label: ext.slice(0, 4).toUpperCase() || "FILE", bg: "bg-slate-100", text: "text-slate-600" };
}

export default function FilePreviewPanel({
  file,
  onClose,
}: {
  file: PreviewFile;
  onClose: () => void;
}) {
  const badge = badgeFor(file.filename);
  const isPdf = file.mediaType === "application/pdf" || file.filename.endsWith(".pdf");
  const isImage = file.mediaType.startsWith("image/");
  const hasUrl = !!file.url;
  const hasText = !!file.text;

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    const delta = dragState.current.startX - e.clientX;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragState.current.startWidth + delta));
    setWidth(next);
  }, []);

  const onMouseUp = useCallback(() => {
    dragState.current = null;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [onMouseMove]);

  const onDragHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragState.current = { startX: e.clientX, startWidth: width };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width, onMouseMove, onMouseUp]
  );

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div
      className="hidden lg:flex shrink-0 flex-col h-full border-l border-slate-200 bg-white overflow-hidden relative"
      style={{ width }}
    >
      {/* Drag-to-resize handle */}
      <div
        onMouseDown={onDragHandleMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400/40 active:bg-blue-500/50 transition-colors z-10"
        title="Drag to resize"
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 shrink-0 pl-3">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${badge.bg}`}>
          {isImage ? (
            <ImageIcon className={`h-4 w-4 ${badge.text}`} />
          ) : hasText ? (
            <FileCode className={`h-4 w-4 ${badge.text}`} />
          ) : (
            <FileText className={`h-4 w-4 ${badge.text}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate leading-snug">
            {file.filename}
          </p>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          aria-label="Close preview"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isPdf && hasUrl ? (
          <iframe
            src={file.url}
            className="w-full h-full border-0"
            title={file.filename}
          />
        ) : isImage && hasUrl ? (
          <div className="w-full h-full flex items-center justify-center p-4 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={file.url}
              alt={file.filename}
              className="max-w-full max-h-full object-contain rounded-lg shadow-md"
            />
          </div>
        ) : hasText ? (
          <pre className="text-xs leading-relaxed overflow-auto p-4 h-full text-slate-700 whitespace-pre-wrap break-words">
            {file.text}
          </pre>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
              <FileText className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">Preview unavailable</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              This file was uploaded in a previous session. Re-upload it to preview its contents.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
