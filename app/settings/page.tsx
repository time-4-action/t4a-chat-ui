"use client";

import { useEffect, useRef, useState } from "react";
import QuillEditor from "@/components/quill-editor";
import { MODEL_CONFIGS, formatCost } from "@/lib/models";
import type { ModelId } from "@/lib/models";

interface UsageData {
  totalCostUsd: number;
  conversationCount: number;
  byModel: { modelId: string; conversationCount: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; totalCostUsd: number }[];
}

interface Memory {
  workContext: string;
  personalContext: string;
  topOfMind: string;
  recentActivity: string;
  updatedAt: string | null;
}

interface Preferences {
  personalInfo: {
    name: string;
    jobTitle: string;
    company: string;
    roleDescription: string;
  };
  communicationStyle: {
    tone: string;
    formality: string;
    signatureStyle: string;
  };
  emailTemplates: string;
  customInstructions: string;
}

const EXPORT_PROMPT = `Export all of my stored memories and any context you've learned about me from past conversations. Preserve my words verbatim where possible, especially for instructions and preferences.

## Categories (output in this order):

1. **Instructions**: Rules I've explicitly asked you to follow going forward — tone, format, style, "always do X", "never do Y", and corrections to your behavior. Only include rules from stored memories, not from conversations.

2. **Identity**: Name, age, location, education, family, relationships, languages, and personal interests.

3. **Career**: Current and past roles, companies, and general skill areas.

4. **Projects**: Projects I meaningfully built or committed to. Ideally ONE entry per project. Include what it does, current status, and any key decisions. Use the project name or a short descriptor as the first words of the entry.

5. **Preferences**: Opinions, tastes, and working-style preferences that apply broadly.

## Format:

Use section headers for each category. Within each category, list one entry per line, sorted by oldest date first. Format each line as:

[YYYY-MM-DD] - Entry content here.

If no date is known, use [unknown] instead.

## Output:
- Wrap the entire export in a single code block for easy copying.
- After the code block, state whether this is the complete set or if more remain.`;

const defaultPrefs: Preferences = {
  personalInfo: { name: "", jobTitle: "", company: "", roleDescription: "" },
  communicationStyle: { tone: "", formality: "", signatureStyle: "" },
  emailTemplates: "",
  customInstructions: "",
};

const NAV = [
  { id: "profile",       label: "Profile" },
  { id: "communication", label: "Communication" },
  { id: "email",         label: "Email style" },
  { id: "instructions",  label: "Instructions" },
  { id: "memory",        label: "Memory" },
  { id: "usage",         label: "Usage" },
];

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [memory, setMemory] = useState<Memory>({
    workContext: "", personalContext: "", topOfMind: "", recentActivity: "", updatedAt: null,
  });
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [autofilling, setAutofilling] = useState<Record<string, boolean>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importState, setImportState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [promptGuideOpen, setPromptGuideOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [activeSection, setActiveSection] = useState("profile");

  const mainRef = useRef<HTMLElement>(null);

  // Scroll-spy
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActiveSection(e.target.id); });
      },
      { root: main, rootMargin: "-10% 0px -80% 0px", threshold: 0 }
    );
    NAV.forEach(({ id }) => {
      const el = main.querySelector(`#${id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fetch("/api/preferences").then((r) => r.json()).then((data) => {
      if (data && !data.error) {
        setPrefs({
          personalInfo: { ...defaultPrefs.personalInfo, ...data.personalInfo },
          communicationStyle: { ...defaultPrefs.communicationStyle, ...data.communicationStyle },
          emailTemplates: data.emailTemplates ?? "",
          customInstructions: data.customInstructions ?? "",
        });
      }
    }).catch(console.error);

    fetch("/api/memory").then((r) => r.json()).then(setMemory).catch(console.error);

    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => { setUsage(d); setUsageLoading(false); })
      .catch(() => setUsageLoading(false));
  }, []);

  async function handleAutofill(section: "profile" | "communication" | "email" | "signature") {
    setAutofilling((s) => ({ ...s, [section]: true }));
    try {
      const res = await fetch("/api/preferences/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (section === "profile") {
        setPrefs((p) => ({ ...p, personalInfo: { ...p.personalInfo, ...data } }));
      } else if (section === "communication") {
        setPrefs((p) => ({ ...p, communicationStyle: { ...p.communicationStyle, ...data } }));
      } else if (section === "email") {
        setPrefs((p) => ({ ...p, emailTemplates: data.emailTemplates }));
      } else if (section === "signature") {
        setPrefs((p) => ({ ...p, communicationStyle: { ...p.communicationStyle, signatureStyle: data.signatureStyle } }));
      }
    } catch { /* silently fail */ }
    setAutofilling((s) => ({ ...s, [section]: false }));
  }

  function setPersonalInfo(field: keyof Preferences["personalInfo"], value: string) {
    setPrefs((p) => ({ ...p, personalInfo: { ...p.personalInfo, [field]: value } }));
  }
  function setStyle(field: keyof Preferences["communicationStyle"], value: string) {
    setPrefs((p) => ({ ...p, communicationStyle: { ...p.communicationStyle, [field]: value } }));
  }

  async function handleSave() {
    setSaveState("saving");
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch { setSaveState("error"); }
    setTimeout(() => setSaveState("idle"), 3000);
  }

  async function clearMemorySection(section: keyof Omit<Memory, "updatedAt">) {
    setMemory((prev) => ({ ...prev, [section]: "" }));
    await fetch("/api/memory", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section }),
    });
  }

  async function clearAllMemory() {
    setMemory({ workContext: "", personalContext: "", topOfMind: "", recentActivity: "", updatedAt: null });
    await fetch("/api/memory", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
  }

  async function handleImport() {
    if (!importText.trim()) return;
    setImportState("loading");
    try {
      const res = await fetch("/api/memory", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: importText }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setMemory((prev) => ({ ...prev, ...updated }));
      setImportText(""); setImportOpen(false);
      setImportState("done");
      setTimeout(() => setImportState("idle"), 3000);
    } catch {
      setImportState("error");
      setTimeout(() => setImportState("idle"), 3000);
    }
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(EXPORT_PROMPT);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  function scrollTo(id: string) {
    const el = mainRef.current?.querySelector(`#${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const hasMemory = memory.workContext || memory.personalContext || memory.topOfMind || memory.recentActivity;

  return (
    // 100dvh: accounts for iOS Safari's dynamic toolbar (unlike h-screen which uses 100vh)
    <div className="h-[100dvh] flex flex-col bg-[#f7f8fa] overflow-hidden">

      {/* ── Header ── */}
      <header className="shrink-0 h-14 bg-white border-b border-gray-100 flex items-center px-4 sm:px-6 gap-3 z-10">
        <a
          href="/chat"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">Chat</span>
        </a>
        <span className="text-gray-200 hidden sm:inline">/</span>
        <span className="text-sm font-semibold text-gray-800">Settings</span>

        <div className="ml-auto flex items-center gap-3">
          {saveState === "saved" && (
            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="hidden sm:inline">Saved</span>
            </span>
          )}
          {saveState === "error" && (
            <span className="text-xs text-red-500 font-medium hidden sm:inline">Failed to save.</span>
          )}
          <button
            onClick={handleSave}
            disabled={saveState === "saving"}
            className="px-4 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {saveState === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {/* ── Mobile tab bar (hidden on lg) ── */}
      {!importOpen && (
        <div className="lg:hidden shrink-0 bg-white border-b border-gray-100 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-1 px-4 py-2.5 whitespace-nowrap">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className={`flex-none px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeSection === item.id
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-500 active:bg-gray-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Desktop sidebar (hidden on mobile + when import open) */}
        <aside className={`flex-col w-56 shrink-0 bg-white border-r border-gray-100 overflow-y-auto ${
          importOpen ? "hidden" : "hidden lg:flex"
        }`}>
          <div className="px-4 pt-8 pb-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-2">
              Settings
            </p>
            <nav className="space-y-0.5">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    activeSection === item.id
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                  }`}
                >
                  <NavIcon id={item.id} active={activeSection === item.id} />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* ── Main scroll column ── */}
        <main ref={mainRef} className="flex-1 overflow-y-auto scroll-smooth">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-16 space-y-4">

            {/* Page title — desktop only (mobile has header + tab bar) */}
            <div className="hidden sm:block mb-6">
              <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
              <p className="text-sm text-gray-400 mt-1">Personalise how the AI communicates with you and on your behalf.</p>
            </div>

            {/* Profile */}
            <Card id="profile" title="Profile" description="Your identity used to personalise AI responses."
              action={<AutofillButton loading={!!autofilling.profile} onClick={() => handleAutofill("profile")} />}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <Field label="Full name">
                  <input type="text" value={prefs.personalInfo.name}
                    onChange={(e) => setPersonalInfo("name", e.target.value)}
                    placeholder="Grega Repič" className={inp} />
                </Field>
                <Field label="Job title">
                  <input type="text" value={prefs.personalInfo.jobTitle}
                    onChange={(e) => setPersonalInfo("jobTitle", e.target.value)}
                    placeholder="CEO" className={inp} />
                </Field>
                <Field label="Company">
                  <input type="text" value={prefs.personalInfo.company}
                    onChange={(e) => setPersonalInfo("company", e.target.value)}
                    placeholder="Time 4 Action" className={inp} />
                </Field>
                <Field label="Role description">
                  <input type="text" value={prefs.personalInfo.roleDescription}
                    onChange={(e) => setPersonalInfo("roleDescription", e.target.value)}
                    placeholder="I manage operations and client relations" className={inp} />
                </Field>
              </div>
            </Card>

            {/* Communication */}
            <Card id="communication" title="Communication" description="How the AI should speak and write on your behalf."
              action={<AutofillButton loading={!!autofilling.communication} onClick={() => handleAutofill("communication")} />}
            >
              <div className="space-y-5">
                <Field label="Tone">
                  <PillGroup
                    options={["formal", "casual", "friendly", "professional"]}
                    value={prefs.communicationStyle.tone}
                    onChange={(v) => setStyle("tone", v)}
                  />
                </Field>
                <Field label="Formality">
                  <PillGroup
                    options={["high", "medium", "low"]}
                    value={prefs.communicationStyle.formality}
                    onChange={(v) => setStyle("formality", v)}
                  />
                </Field>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-500">Email signature</label>
                    <AutofillButton
                      loading={!!autofilling.signature}
                      onClick={() => handleAutofill("signature")}
                    />
                  </div>
                  <QuillEditor
                    value={prefs.communicationStyle.signatureStyle}
                    onChange={(val) => setStyle("signatureStyle", val)}
                  />
                </div>
              </div>
            </Card>

            {/* Email style */}
            <Card id="email" title="Email style examples" description="Paste 1–3 of your typical emails so the AI can mirror your writing style."
              action={<AutofillButton loading={!!autofilling.email} onClick={() => handleAutofill("email")} />}
            >
              <textarea
                value={prefs.emailTemplates}
                onChange={(e) => setPrefs((p) => ({ ...p, emailTemplates: e.target.value }))}
                rows={6}
                placeholder={"Subject: Follow-up on your order\n\nHi [Name],\n\nJust wanted to check in on your recent order..."}
                className={`${inp} resize-none font-mono text-xs leading-relaxed`}
              />
            </Card>

            {/* Custom instructions */}
            <Card id="instructions" title="Custom instructions" description="Specific rules the AI should always follow, regardless of context.">
              <textarea
                value={prefs.customInstructions}
                onChange={(e) => setPrefs((p) => ({ ...p, customInstructions: e.target.value }))}
                rows={4}
                placeholder="E.g. Always reply in Slovenian, never use bullet points, keep emails short..."
                className={`${inp} resize-none`}
              />
            </Card>

            {/* Memory */}
            <section id="memory" className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Memory</h2>
                  <p className="text-xs text-gray-400 mt-0.5">What the AI has learned about you from past conversations.</p>
                </div>
                {hasMemory && (
                  <button
                    onClick={clearAllMemory}
                    className="shrink-0 text-xs text-gray-400 hover:text-red-500 transition-colors font-medium pt-0.5 cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="px-4 sm:px-6 py-5">
                {!hasMemory ? (
                  <p className="text-sm text-gray-400 italic">
                    No memories yet — they&apos;ll appear after your conversations.
                  </p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {memory.workContext && (
                      <MemoryBlock title="Work context" text={memory.workContext}
                        onClear={() => clearMemorySection("workContext")} />
                    )}
                    {memory.personalContext && (
                      <MemoryBlock title="Personal context" text={memory.personalContext}
                        onClear={() => clearMemorySection("personalContext")} />
                    )}
                    {memory.topOfMind && (
                      <MemoryBlock title="Top of mind" text={memory.topOfMind}
                        onClear={() => clearMemorySection("topOfMind")} />
                    )}
                    {memory.recentActivity && (
                      <MemoryBlock title="Recent activity" text={memory.recentActivity}
                        onClear={() => clearMemorySection("recentActivity")} />
                    )}
                  </div>
                )}
              </div>

              {/* Import strip */}
              <div className="border-t border-gray-100">
                {!importOpen ? (
                  <div className="px-4 sm:px-6 py-3.5 flex items-center justify-between">
                    <button
                      onClick={() => setImportOpen(true)}
                      className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Import from another AI
                    </button>
                    {importState === "done" && <span className="text-xs text-emerald-600 font-medium">Memory imported.</span>}
                    {importState === "error" && <span className="text-xs text-red-500 font-medium">Import failed.</span>}
                  </div>
                ) : (
                  <div className="px-4 sm:px-6 py-5 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Import from Claude, ChatGPT, or any AI</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Run the export prompt in your other AI, copy its output, paste below.
                      </p>
                    </div>

                    {/* Prompt guide accordion */}
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => setPromptGuideOpen((o) => !o)}
                        className="w-full flex items-center justify-between px-4 py-3.5 bg-gray-50 active:bg-gray-100 hover:bg-gray-100 transition-colors text-left cursor-pointer"
                      >
                        <span className="text-xs font-semibold text-gray-600">Export prompt guide</span>
                        <svg
                          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${promptGuideOpen ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {promptGuideOpen && (
                        <div className="border-t border-gray-200 bg-white">
                          <pre className="px-4 py-3 text-[11px] text-gray-500 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                            {EXPORT_PROMPT}
                          </pre>
                          <div className="px-4 pb-3 pt-2 flex justify-end border-t border-gray-100">
                            <button
                              onClick={copyPrompt}
                              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
                            >
                              {promptCopied ? (
                                <>
                                  <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                  Copy prompt
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      rows={6}
                      placeholder="Paste the exported memory here…"
                      className={`${inp} resize-none font-mono text-xs leading-relaxed`}
                    />

                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={handleImport}
                        disabled={!importText.trim() || importState === "loading"}
                        className="w-full sm:w-auto px-5 py-2.5 sm:py-2 rounded-xl bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white text-sm sm:text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {importState === "loading" ? "Importing…" : "Import memory"}
                      </button>
                      <button
                        onClick={() => { setImportOpen(false); setImportText(""); setPromptGuideOpen(false); }}
                        className="w-full sm:w-auto px-5 py-2.5 sm:py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 text-sm sm:text-xs font-medium transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Usage */}
            <Card id="usage" title="Usage" description="Your API usage and cost overview.">
              {usageLoading ? (
                <div className="flex gap-3">
                  <div className="h-16 flex-1 rounded-xl bg-gray-100 animate-pulse" />
                  <div className="h-16 flex-1 rounded-xl bg-gray-100 animate-pulse" />
                </div>
              ) : !usage ? (
                <p className="text-sm text-gray-400 italic">Failed to load usage data.</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-1 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Total cost</p>
                      <p className="text-lg font-semibold text-gray-900">{formatCost(usage.totalCostUsd)}</p>
                    </div>
                    <div className="flex-1 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Conversations</p>
                      <p className="text-lg font-semibold text-gray-900">{usage.conversationCount}</p>
                    </div>
                  </div>

                  {usage.byModel.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No usage yet — start chatting to see your stats here.</p>
                  ) : (
                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50">
                            <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Model</th>
                            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Chats</th>
                            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest hidden sm:table-cell">Input tok</th>
                            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest hidden sm:table-cell">Output tok</th>
                            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest hidden lg:table-cell">Cache reads</th>
                            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest hidden lg:table-cell">Cache writes</th>
                            <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {usage.byModel.map((row) => {
                            const cfg = MODEL_CONFIGS[row.modelId as ModelId];
                            return (
                              <tr key={row.modelId}>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    {cfg && <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />}
                                    <span className="text-gray-800 font-medium text-xs">{cfg?.modelName ?? row.modelId}</span>
                                    {cfg && <span className={`text-[10px] font-medium ${cfg.text}`}>{cfg.tierName}</span>}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right text-xs text-gray-500">{row.conversationCount}</td>
                                <td className="px-4 py-3 text-right text-xs text-gray-500 hidden sm:table-cell">{row.inputTokens.toLocaleString()}</td>
                                <td className="px-4 py-3 text-right text-xs text-gray-500 hidden sm:table-cell">{row.outputTokens.toLocaleString()}</td>
                                <td className="px-4 py-3 text-right text-xs text-emerald-600 hidden lg:table-cell">{row.cacheReadTokens.toLocaleString()}</td>
                                <td className="px-4 py-3 text-right text-xs text-gray-500 hidden lg:table-cell">{row.cacheCreationTokens.toLocaleString()}</td>
                                <td className="px-4 py-3 text-right text-xs text-gray-700 font-medium">{formatCost(row.totalCostUsd)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </Card>

          </div>
        </main>
      </div>

    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// py-3 = 12px top+bottom = 44px total height on mobile (Apple HIG minimum touch target)
const inp =
  "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all";

function Card({ id, title, description, action, children }: {
  id: string; title: string; description: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section id={id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        </div>
        {action}
      </div>
      <div className="px-4 sm:px-6 py-5">{children}</div>
    </section>
  );
}

function AutofillButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title="Autofill with AI"
      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 active:bg-violet-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? (
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      )}
      {loading ? "Filling…" : "Autofill"}
    </button>
  );
}

function Field({ label, children, className }: {
  label: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function PillGroup({ options, value, onChange }: {
  options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? "" : opt)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer select-none ${
            value === opt
              ? "bg-gray-900 text-white shadow-sm"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800 active:bg-gray-200"
          }`}
        >
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </button>
      ))}
    </div>
  );
}

function MemoryBlock({ title, text, onClear }: {
  title: string; text: string; onClear: () => void;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pt-0.5">{title}</span>
        {/* Always visible on mobile (no hover), subtle on desktop */}
        <button
          onClick={onClear}
          className="shrink-0 text-gray-300 hover:text-red-400 active:text-red-500 transition-colors text-xs cursor-pointer sm:opacity-50 sm:hover:opacity-100"
          title={`Clear ${title}`}
        >
          ✕
        </button>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
    </div>
  );
}

function NavIcon({ id, active }: { id: string; active: boolean }) {
  const cls = `w-4 h-4 shrink-0 ${active ? "text-gray-700" : "text-gray-400"}`;
  const s = { fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.75 } as const;
  if (id === "profile")       return <svg className={cls} {...s}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
  if (id === "communication") return <svg className={cls} {...s}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>;
  if (id === "email")         return <svg className={cls} {...s}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
  if (id === "instructions")  return <svg className={cls} {...s}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;
  if (id === "memory")        return <svg className={cls} {...s}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>;
  if (id === "usage")         return <svg className={cls} {...s}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>;
  return null;
}
