"use client";

import { Globe, Linkedin, MapPin, Phone, Sparkles, Tag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type AutofillSection = "profile" | "communication" | "email" | "signature";

export interface AutofillExtra {
  instructions: string;
  linkedin: string;
  phone: string;
  website: string;
  location: string;
  tagline: string;
}

interface Props {
  section: AutofillSection;
  onClose: () => void;
  onGenerate: (extra: AutofillExtra) => Promise<void>;
}

const META: Record<AutofillSection, { title: string; hint: string; placeholder: string }> = {
  profile: {
    title: "Autofill Profile",
    hint: "We'll infer your name, title, company and role from your conversation history.",
    placeholder: "E.g. I recently changed roles, or I work at a 50-person startup in Berlin…",
  },
  communication: {
    title: "Autofill Communication Style",
    hint: "We'll suggest tone and formality based on how you write and work.",
    placeholder: "E.g. I prefer short direct messages, or I deal with formal enterprise clients…",
  },
  email: {
    title: "Autofill Email Examples",
    hint: "We'll generate sample emails that match your typical writing style.",
    placeholder: "E.g. I mostly write follow-up emails after meetings, I always use first names…",
  },
  signature: {
    title: "Autofill Signature",
    hint: "Add any contact details you'd like included and we'll build the rest.",
    placeholder: "E.g. keep it minimal, add a separator line, use my tagline as a quote…",
  },
};

const inp =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all";

export default function AutofillModal({ section, onClose, onGenerate }: Props) {
  const [generating, setGenerating] = useState(false);
  const [extra, setExtra] = useState<AutofillExtra>({
    instructions: "",
    linkedin: "",
    phone: "",
    website: "",
    location: "",
    tagline: "",
  });
  const backdropRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    (firstInputRef.current as HTMLElement | null)?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set =
    (field: keyof AutofillExtra) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setExtra((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleGenerate() {
    setGenerating(true);
    try {
      await onGenerate(extra);
    } finally {
      setGenerating(false);
    }
  }

  const meta = META[section];

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="w-full sm:max-w-md bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden">
        {/* Drag pill — mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-4 sm:pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{meta.title}</h2>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed max-w-xs">{meta.hint}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors mt-0.5 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

          {/* Signature-specific contact fields */}
          {section === "signature" && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                Contact details
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <IconInput icon={<Linkedin className="w-3.5 h-3.5" />} placeholder="linkedin.com/in/you" value={extra.linkedin} onChange={set("linkedin")} inputRef={firstInputRef} />
                <IconInput icon={<Phone className="w-3.5 h-3.5" />} placeholder="+1 555 000 0000" value={extra.phone} onChange={set("phone")} />
                <IconInput icon={<Globe className="w-3.5 h-3.5" />} placeholder="yoursite.com" value={extra.website} onChange={set("website")} />
                <IconInput icon={<MapPin className="w-3.5 h-3.5" />} placeholder="Ljubljana, Slovenia" value={extra.location} onChange={set("location")} />
              </div>
              <IconInput
                icon={<Tag className="w-3.5 h-3.5" />}
                placeholder='Tagline — e.g. "Building the future of work"'
                value={extra.tagline}
                onChange={set("tagline")}
                full
              />
            </div>
          )}

          {/* Instructions / extra context */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
              {section === "signature" ? "Style instructions" : "Extra context"}
              <span className="ml-1.5 font-normal normal-case tracking-normal text-gray-300">optional</span>
            </label>
            <textarea
              ref={section !== "signature" ? (firstInputRef as React.RefObject<HTMLTextAreaElement>) : undefined}
              value={extra.instructions}
              onChange={set("instructions")}
              rows={3}
              placeholder={meta.placeholder}
              className={`${inp} resize-none`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-1 flex gap-2.5">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Generate
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared icon input ─────────────────────────────────────────────────────────

function IconInput({
  icon,
  placeholder,
  value,
  onChange,
  full = false,
  inputRef,
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  full?: boolean;
  inputRef?: React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}) {
  return (
    <div className={`relative ${full ? "col-span-2" : ""}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none">
        {icon}
      </span>
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all"
      />
    </div>
  );
}
