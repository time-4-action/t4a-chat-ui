"use client";

import { useRef, useState } from "react";

export interface ToneDoc {
  _id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string;
  customPrompt: string;
  characteristics: string;
  generatedPrompt: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  onClose: () => void;
  onCreated: (tone: ToneDoc) => void;
  editTone?: ToneDoc; // when provided, modal is in edit mode
}

type Step = 1 | 2;
type ModalState = "form" | "loading" | "done" | "error";

const PRESET_TAGS = [
  "Formal", "Casual", "Technical", "Direct", "Elaborate",
  "Persuasive", "Empathetic", "Concise", "Conversational", "Executive",
];

const GUIDE = [
  {
    title: "What are writing examples?",
    body: "Paste 1–5 real text samples written in the tone you want to capture — emails, reports, messages, or any writing that reflects this style. The AI learns from these samples to mimic the exact voice and rhythm.",
  },
  {
    title: "Tips for the best results",
    body: "• 3+ examples work much better than 1 — the more, the better\n• Use consistent samples from the same voice or context\n• Real writing outperforms generic descriptions\n• Each sample should be at least 50 words for accurate analysis",
  },
  {
    title: "Good use cases",
    body: "• Executive: formal emails from senior leadership, board updates\n• Technical: documentation, code review comments, technical specs\n• Sales: outreach emails, proposal summaries, pitch decks\n• Support: customer service responses, FAQ answers\n• Personal: your own emails for a personalised writing style",
  },
  {
    title: "When to use Custom Prompt",
    body: "Use Custom Prompt for specific rules the AI should always follow regardless of examples — e.g. \"Never use passive voice\", \"Always end with a clear call to action\", \"Keep sentences under 20 words\".",
  },
];

const inp =
  "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all";

export default function CreateToneModal({ onClose, onCreated, editTone }: Props) {
  const isEditing = !!editTone;

  const [step, setStep] = useState<Step>(1);
  const [modalState, setModalState] = useState<ModalState>("form");

  // Step 1
  const [name, setName] = useState(editTone?.name ?? "");
  const [description, setDescription] = useState(editTone?.description ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(editTone?.tags ?? []);

  // Step 2
  const [examples, setExamples] = useState(editTone?.examples ?? "");
  const [customPrompt, setCustomPrompt] = useState(editTone?.customPrompt ?? "");
  const [showAdvanced, setShowAdvanced] = useState(!!(editTone?.customPrompt));
  const [showGuide, setShowGuide] = useState(false);
  const [openGuideIdx, setOpenGuideIdx] = useState<number | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // Done
  const [result, setResult] = useState<ToneDoc | null>(null);
  const [promptExpanded, setPromptExpanded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingFile(true);
    const textParts: string[] = [];
    const names: string[] = [];

    for (const file of Array.from(files)) {
      const lower = file.name.toLowerCase();
      names.push(file.name);
      if (lower.endsWith(".txt")) {
        const text = await file.text();
        textParts.push(`--- ${file.name} ---\n${text.trim()}`);
      } else if (lower.endsWith(".docx")) {
        const fd = new FormData();
        fd.append("file", file);
        try {
          const res = await fetch("/api/parse-file", { method: "POST", body: fd });
          if (res.ok) {
            const { text } = await res.json();
            textParts.push(`--- ${file.name} ---\n${text.trim()}`);
          }
        } catch { /* skip failed file */ }
      }
    }

    if (textParts.length) {
      setExamples((prev) =>
        (prev.trim() ? prev.trim() + "\n\n" : "") + textParts.join("\n\n")
      );
      setUploadedFiles((prev) => [...prev, ...names]);
    }
    setUploadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setModalState("loading");
    try {
      const url = isEditing ? `/api/tones/${editTone!._id}` : "/api/tones";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          tags: selectedTags,
          examples: examples.trim(),
          customPrompt: customPrompt.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      const tone = await res.json();
      setResult(tone);
      setModalState("done");
    } catch {
      setModalState("error");
      setTimeout(() => setModalState("form"), 2500);
    }
  }

  const stepLabel = step === 1 ? "Name & description" : "Writing examples";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-2xl bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[88dvh]">

        {/* ── Dark header ── */}
        <div className="shrink-0 bg-gray-900 px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">{isEditing ? "Edit tone" : "Create new tone"}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {modalState === "loading" && (isEditing ? "Re-analysing your writing style…" : "Analysing your writing style…")}
              {modalState === "done" && (isEditing ? "Tone updated successfully" : "Tone created successfully")}
              {modalState === "error" && "Something went wrong — retrying…"}
              {modalState === "form" && stepLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-gray-500 hover:text-white transition-colors cursor-pointer -mt-0.5"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Step indicator ── */}
        {modalState === "form" && (
          <div className="shrink-0 px-6 py-3.5 border-b border-gray-100 flex items-center gap-2">
            {([1, 2] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && (
                  <div className={`w-10 h-px mx-1 ${step > 1 ? "bg-emerald-300" : "bg-gray-200"}`} />
                )}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                    step === s
                      ? "bg-gray-900 text-white"
                      : step > s
                      ? "bg-emerald-500 text-white"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {step > s ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : s}
                </div>
                <span className={`text-xs font-medium ${step === s ? "text-gray-900" : "text-gray-400"}`}>
                  {s === 1 ? "Identity" : "Examples"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Loading */}
          {modalState === "loading" && (
            <div className="flex flex-col items-center justify-center gap-6 py-20 px-8">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-[3px] border-gray-100" />
                <div className="absolute inset-0 rounded-full border-[3px] border-gray-900 border-t-transparent animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900">Analysing your writing style</p>
                <p className="text-xs text-gray-400 mt-1">Extracting stylistic patterns from your examples…</p>
              </div>
            </div>
          )}

          {/* Error */}
          {modalState === "error" && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 px-8">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-gray-600 font-medium">Failed to create tone. Retrying…</p>
            </div>
          )}

          {/* Done */}
          {modalState === "done" && result && (
            <div className="px-6 py-6 space-y-4">
              {/* Success badge */}
              <div className="flex items-start gap-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{result.name}</p>
                  {result.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{result.description}</p>
                  )}
                  {result.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {result.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-[11px] font-medium text-emerald-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Detected characteristics */}
              {result.characteristics && (
                <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                    Detected style
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed">{result.characteristics}</p>
                </div>
              )}

              {/* Generated prompt (expandable) */}
              {result.generatedPrompt && (
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => setPromptExpanded((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-gray-600">AI tone instructions</span>
                    <svg
                      className={`w-3.5 h-3.5 text-gray-400 transition-transform ${promptExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {promptExpanded && (
                    <div className="px-4 py-3 border-t border-gray-100 bg-white">
                      <p className="text-xs text-gray-500 font-mono leading-relaxed whitespace-pre-wrap">
                        {result.generatedPrompt}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-gray-400">
                Activate this tone in the Tones section of Settings.
              </p>
            </div>
          )}

          {/* Step 1: Identity */}
          {modalState === "form" && step === 1 && (
            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Tone name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) setStep(2); }}
                  placeholder="e.g. Executive Brief, Support Friendly, Technical Docs…"
                  className={inp}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  When to use{" "}
                  <span className="text-gray-300 font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="e.g. Use for external client emails and formal board reports…"
                  className={`${inp} resize-none`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  Style tags{" "}
                  <span className="text-gray-300 font-normal">(optional)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer select-none ${
                        selectedTags.includes(tag)
                          ? "bg-gray-900 text-white shadow-sm"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800 active:bg-gray-200"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Examples */}
          {modalState === "form" && step === 2 && (
            <div className="px-6 py-5 space-y-4">
              <div>
                {/* Label + upload button */}
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-500">
                    Writing examples{" "}
                    <span className="text-gray-300 font-normal">(optional, but recommended)</span>
                  </label>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {uploadingFile ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    )}
                    {uploadingFile ? "Parsing…" : "Upload file"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.docx"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files)}
                  />
                </div>

                {/* Textarea with drag-drop */}
                <div
                  className={`relative rounded-xl border-2 transition-colors ${
                    dragOver ? "border-blue-400 bg-blue-50/40" : "border-transparent"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFileUpload(e.dataTransfer.files);
                  }}
                >
                  {dragOver && (
                    <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-blue-50/90 z-10 pointer-events-none">
                      <div className="flex items-center gap-2 text-blue-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span className="text-sm font-semibold">Drop to extract text</span>
                      </div>
                    </div>
                  )}
                  <textarea
                    value={examples}
                    onChange={(e) => setExamples(e.target.value)}
                    rows={8}
                    placeholder={"Paste emails, reports, messages, or any writing that captures this tone…\n\nYou can also drag & drop .txt or .docx files here."}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all resize-none font-mono text-xs leading-relaxed"
                  />
                </div>

                {/* Uploaded file pills */}
                {uploadedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {uploadedFiles.map((fn, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 border border-blue-100 text-[11px] font-medium text-blue-700"
                      >
                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {fn}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Guide accordion */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setShowGuide((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 active:bg-gray-100 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs font-semibold text-gray-600">Guide: creating effective tones</span>
                  </div>
                  <svg
                    className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${showGuide ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showGuide && (
                  <div className="divide-y divide-gray-100 border-t border-gray-200">
                    {GUIDE.map((section, i) => (
                      <div key={i} className="bg-white">
                        <button
                          onClick={() => setOpenGuideIdx(openGuideIdx === i ? null : i)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left cursor-pointer"
                        >
                          <span className="text-xs font-medium text-gray-700">{section.title}</span>
                          <svg
                            className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${openGuideIdx === i ? "rotate-180" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {openGuideIdx === i && (
                          <div className="px-4 pb-3 border-t border-gray-50">
                            <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap mt-2">
                              {section.body}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Advanced: custom prompt */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left cursor-pointer"
                >
                  <span className="text-xs font-semibold text-gray-600">Advanced: custom prompt</span>
                  <svg
                    className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showAdvanced && (
                  <div className="border-t border-gray-200 bg-white p-4 space-y-2">
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Specific rules the AI should always follow when using this tone — added on top of the auto-analysis.
                      E.g. &quot;Never use passive voice&quot;, &quot;Always end with a call to action&quot;.
                    </p>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      rows={4}
                      placeholder="e.g. Always open with a strong statement. Keep sentences under 20 words. Never use filler phrases."
                      className={`${inp} resize-none`}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t border-gray-100 px-6 py-4 flex items-center justify-between gap-3">
          {modalState === "done" ? (
            <>
              <span className="text-xs text-gray-400">Activate it under Settings → Tones.</span>
              <button
                onClick={() => { onCreated(result!); onClose(); }}
                className="px-5 py-2.5 sm:py-2 rounded-xl bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white text-sm sm:text-xs font-semibold transition-colors cursor-pointer"
              >
                Done
              </button>
            </>
          ) : modalState === "loading" ? (
            <p className="w-full text-center text-xs text-gray-400">Creating your tone profile…</p>
          ) : modalState === "error" ? (
            <p className="w-full text-center text-xs text-gray-400">Returning to form…</p>
          ) : (
            <>
              <button
                onClick={() => (step === 1 ? onClose() : setStep(1))}
                className="px-5 py-2.5 sm:py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 text-sm sm:text-xs font-medium transition-colors cursor-pointer"
              >
                {step === 1 ? "Cancel" : "Back"}
              </button>

              {step === 1 ? (
                <button
                  onClick={() => setStep(2)}
                  disabled={!name.trim()}
                  className="px-5 py-2.5 sm:py-2 rounded-xl bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white text-sm sm:text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next: Add examples
                </button>
              ) : (
                <button
                  onClick={handleCreate}
                  disabled={uploadingFile}
                  className="px-5 py-2.5 sm:py-2 rounded-xl bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white text-sm sm:text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isEditing ? "Save changes" : "Create Tone"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
