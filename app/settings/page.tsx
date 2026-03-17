"use client";

import { useEffect, useRef, useState } from "react";
import AutofillModal, { type AutofillExtra, type AutofillSection } from "@/components/autofill-modal";
import CreateToneModal, { type ToneDoc } from "@/components/create-tone-modal";
import QuillEditor from "@/components/quill-editor";
import { MODEL_CONFIGS, formatCost } from "@/lib/models";
import type { ModelId } from "@/lib/models";

interface UsageData {
  totalCostUsd: number;
  conversationCount: number;
  byModel: { modelId: string; conversationCount: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; totalCostUsd: number }[];
  limit: { limitUsd: number; period: string; currentSpendUsd: number; periodStart: string } | null;
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
  promptCaching: boolean;
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
  promptCaching: true,
};

const NAV = [
  { id: "profile",        label: "Profile" },
  { id: "communication",  label: "Communication" },
  { id: "email",          label: "Email style" },
  { id: "instructions",   label: "Instructions" },
  { id: "tones",          label: "Tones" },
  { id: "memory",         label: "Memory" },
  { id: "integrations",   label: "Integrations" },
  { id: "usage",          label: "Usage" },
  { id: "advanced",       label: "Advanced" },
];

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const savedPrefs = useRef<Preferences>(defaultPrefs);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [memory, setMemory] = useState<Memory>({
    workContext: "", personalContext: "", topOfMind: "", recentActivity: "", updatedAt: null,
  });
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [autofilling, setAutofilling] = useState<Record<string, boolean>>({});
  const [modalSection, setModalSection] = useState<AutofillSection | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importState, setImportState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [promptGuideOpen, setPromptGuideOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [activeSection, setActiveSection] = useState("profile");
  const [tones, setTones] = useState<ToneDoc[]>([]);
  const [createToneOpen, setCreateToneOpen] = useState(false);
  const [editingTone, setEditingTone] = useState<ToneDoc | null>(null);
  const [togglingTone, setTogglingTone] = useState<string | null>(null);
  const [deletingTone, setDeletingTone] = useState<string | null>(null);
  const [cachingWarnPending, setCachingWarnPending] = useState(false);
  const [openToneMenuId, setOpenToneMenuId] = useState<string | null>(null);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email?: string; connectedAt?: string } | null>(null);
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [gmailDisconnecting, setGmailDisconnecting] = useState(false);
  const [gmailMsg, setGmailMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [mcpStatus, setMcpStatus] = useState<{ connected: boolean } | null>(null);

  function navigate(id: string) {
    setActiveSection(id);
    if (id !== "memory") {
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  }

  useEffect(() => {
    fetch("/api/preferences").then((r) => r.json()).then((data) => {
      if (data && !data.error) {
        const loaded: Preferences = {
          personalInfo: { ...defaultPrefs.personalInfo, ...data.personalInfo },
          communicationStyle: { ...defaultPrefs.communicationStyle, ...data.communicationStyle },
          emailTemplates: data.emailTemplates ?? "",
          customInstructions: data.customInstructions ?? "",
          promptCaching: data.promptCaching !== false,
        };
        setPrefs(loaded);
        savedPrefs.current = loaded;
      }
    }).catch(console.error);

    fetch("/api/memory").then((r) => r.json()).then(setMemory).catch(console.error);

    fetch("/api/tones").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setTones(data);
    }).catch(console.error);

    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => { setUsage(d); setUsageLoading(false); })
      .catch(() => setUsageLoading(false));

    fetch("/api/gmail/status").then((r) => r.json()).then((data) => {
      setGmailStatus(data);
    }).catch(console.error);

    fetch("/api/mcp/status").then((r) => r.json()).then((data) => {
      setMcpStatus(data);
    }).catch(console.error);

    // Handle redirect back from Google OAuth or direct section links
    const params = new URLSearchParams(window.location.search);
    if (params.get("section")) {
      setActiveSection(params.get("section")!);
      window.history.replaceState({}, "", "/settings");
    }
    if (params.get("gmailConnected") === "true") {
      setActiveSection("integrations");
      setGmailMsg({ type: "success", text: "Gmail connected successfully." });
      window.history.replaceState({}, "", "/settings");
    } else if (params.get("gmailError")) {
      const errMap: Record<string, string> = {
        access_denied: "Gmail connection was cancelled.",
        invalid_state: "OAuth state mismatch — please try again.",
        token_exchange_failed: "Failed to exchange authorization code. Please try again.",
        no_refresh_token: "No refresh token received. Revoke app access in your Google account and try again.",
        not_configured: "Gmail integration is not configured on this server.",
      };
      setActiveSection("integrations");
      setGmailMsg({ type: "error", text: errMap[params.get("gmailError")!] ?? "Gmail connection failed." });
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  async function handleAutofill(section: AutofillSection, extra?: AutofillExtra) {
    setAutofilling((s) => ({ ...s, [section]: true }));
    setModalSection(null);
    try {
      const res = await fetch("/api/preferences/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, extra }),
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
      if (res.ok) savedPrefs.current = prefs;
      setSaveState(res.ok ? "saved" : "error");
    } catch { setSaveState("error"); }
    setTimeout(() => setSaveState("idle"), 3000);
  }

  async function handleToneToggle(id: string, activate: boolean) {
    setTogglingTone(id);
    try {
      const res = await fetch(`/api/tones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: activate }),
      });
      if (res.ok) {
        setTones((prev) =>
          prev.map((t) => ({ ...t, isActive: activate ? t._id === id : t._id === id ? false : t.isActive }))
        );
      }
    } catch { /* silently fail */ }
    setTogglingTone(null);
  }

  async function handleToneDelete(id: string) {
    setDeletingTone(id);
    try {
      await fetch(`/api/tones/${id}`, { method: "DELETE" });
      setTones((prev) => prev.filter((t) => t._id !== id));
    } catch { /* silently fail */ }
    setDeletingTone(null);
  }

  function handleToneCreated(tone: ToneDoc) {
    if (editingTone) {
      setTones((prev) => prev.map((t) => (t._id === tone._id ? tone : t)));
      setEditingTone(null);
    } else {
      setTones((prev) => [tone, ...prev]);
    }
  }

  async function handleGmailDisconnect() {
    setGmailDisconnecting(true);
    setGmailMsg(null);
    try {
      const res = await fetch("/api/gmail/disconnect", { method: "DELETE" });
      if (res.ok) {
        setGmailStatus({ connected: false });
        setGmailMsg({ type: "success", text: "Gmail disconnected." });
      } else {
        setGmailMsg({ type: "error", text: "Failed to disconnect Gmail. Please try again." });
      }
    } catch {
      setGmailMsg({ type: "error", text: "Failed to disconnect Gmail. Please try again." });
    }
    setGmailDisconnecting(false);
    setTimeout(() => setGmailMsg(null), 4000);
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
        <span className="text-sm font-semibold text-gray-800">
          {activeSection === "memory" ? "Memory" : activeSection === "advanced" ? "Advanced" : activeSection === "integrations" ? "Integrations" : "Settings"}
        </span>

        <div className="ml-auto flex items-center gap-3">
          {activeSection !== "memory" && activeSection !== "advanced" && activeSection !== "integrations" && (
            <>
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
                disabled={saveState === "saving" || JSON.stringify(prefs) === JSON.stringify(savedPrefs.current)}
                className="px-4 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {saveState === "saving" ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Mobile tab bar (hidden on lg) ── */}
      <div className="lg:hidden shrink-0 bg-white border-b border-gray-100 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-1 px-4 py-2.5 whitespace-nowrap">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
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

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-white border-r border-gray-100 overflow-y-auto">
          <div className="px-4 pt-8 pb-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-2">
              Settings
            </p>
            <nav className="space-y-0.5">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
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

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-16 space-y-4">

            {/* Profile */}
            {activeSection !== "memory" && activeSection !== "advanced" && activeSection !== "integrations" && (
              <Card id="profile" title="Profile" description="Your identity used to personalise AI responses."
                action={<AutofillButton loading={!!autofilling.profile} onClick={() => setModalSection("profile")} />}
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
            )}

            {/* Communication */}
            {activeSection !== "memory" && activeSection !== "advanced" && activeSection !== "integrations" && (
            <Card id="communication" title="Communication" description="How the AI should speak and write on your behalf."
              action={<AutofillButton loading={!!autofilling.communication} onClick={() => setModalSection("communication")} />}
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
                      onClick={() => setModalSection("signature")}
                    />
                  </div>
                  <QuillEditor
                    value={prefs.communicationStyle.signatureStyle}
                    onChange={(val) => setStyle("signatureStyle", val)}
                  />
                </div>
              </div>
            </Card>
            )}

            {/* Email style */}
            {activeSection !== "memory" && activeSection !== "advanced" && activeSection !== "integrations" && (
            <Card id="email" title="Email style examples" description="Paste 1–3 of your typical emails so the AI can mirror your writing style."
              action={<AutofillButton loading={!!autofilling.email} onClick={() => setModalSection("email")} />}
            >
              <textarea
                value={prefs.emailTemplates}
                onChange={(e) => setPrefs((p) => ({ ...p, emailTemplates: e.target.value }))}
                rows={6}
                placeholder={"Subject: Follow-up on your order\n\nHi [Name],\n\nJust wanted to check in on your recent order..."}
                className={`${inp} resize-none font-mono text-xs leading-relaxed`}
              />
            </Card>
            )}

            {/* Custom instructions */}
            {activeSection !== "memory" && activeSection !== "advanced" && activeSection !== "integrations" && (
            <Card id="instructions" title="Custom instructions" description="Specific rules the AI should always follow, regardless of context.">
              <textarea
                value={prefs.customInstructions}
                onChange={(e) => setPrefs((p) => ({ ...p, customInstructions: e.target.value }))}
                rows={4}
                placeholder="E.g. Always reply in Slovenian, never use bullet points, keep emails short..."
                className={`${inp} resize-none`}
              />
            </Card>
            )}

            {/* Integrations — standalone view */}
            {activeSection === "integrations" && (
            <section id="integrations" className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Integrations</h2>
                <p className="text-xs text-gray-400 mt-0.5">Connect external services so the AI can act on your behalf.</p>
              </div>

              <div className="px-4 sm:px-6 py-5 space-y-4">

                {/* Gmail card */}
                <div className={`flex rounded-xl border bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden transition-all ${gmailStatus?.connected ? "border-emerald-100" : "border-gray-100"}`}>
                  {/* Left accent bar */}
                  <div className={`w-1 shrink-0 rounded-l-xl ${gmailStatus?.connected ? "bg-emerald-500" : "bg-gray-100"}`} />

                  <div className="flex-1 px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        {/* Gmail 2020 icon */}
                        <div className="mt-0.5 shrink-0 w-9 h-9 rounded-lg bg-white border border-gray-100 shadow-sm flex items-center justify-center">
                          <svg viewBox="52 42 88 66" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6"/>
                            <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15"/>
                            <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"/>
                            <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92"/>
                            <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2C60.47 39.35 52 43.58 52 51"/>
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-800">Gmail</p>
                            {gmailStatus?.connected && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] font-semibold text-emerald-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                Connected
                              </span>
                            )}
                          </div>
                          {gmailStatus?.connected ? (
                            <div className="mt-1.5 flex flex-col gap-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-[11px] font-mono text-gray-600 w-fit">
                                {gmailStatus.email}
                              </span>
                              {gmailStatus.connectedAt && (
                                <p className="text-[10px] text-gray-400">
                                  Connected {new Date(gmailStatus.connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Allow the AI to read and draft emails on your behalf.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {gmailStatus === null ? (
                          <div className="h-8 w-20 rounded-lg bg-gray-200 animate-pulse" />
                        ) : gmailStatus.connected ? (
                          <button
                            onClick={handleGmailDisconnect}
                            disabled={gmailDisconnecting}
                            className="px-3.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                          >
                            {gmailDisconnecting ? "Disconnecting…" : "Disconnect"}
                          </button>
                        ) : (
                          <a
                            href="/api/gmail/connect"
                            onClick={() => setGmailConnecting(true)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold transition-colors ${gmailConnecting ? "opacity-60 pointer-events-none" : ""}`}
                          >
                            {gmailConnecting ? "Connecting…" : "Connect"}
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Success/error message */}
                    {gmailMsg && (
                      <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                        gmailMsg.type === "success"
                          ? "bg-emerald-50 border border-emerald-100 text-emerald-700"
                          : "bg-red-50 border border-red-100 text-red-600"
                      }`}>
                        {gmailMsg.type === "success" ? (
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                          </svg>
                        )}
                        {gmailMsg.text}
                      </div>
                    )}

                    {/* Permissions chips */}
                    {gmailStatus?.connected && (
                      <div className="mt-3 pt-3 border-t border-gray-50">
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {["Read emails", "Search", "Threads", "Create drafts"].map((perm) => (
                            <span key={perm} className="px-2 py-0.5 rounded-md bg-gray-100 text-[10px] font-medium text-gray-500">
                              {perm}
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] text-gray-400">
                          To revoke access manually, visit{" "}
                          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
                            Google account permissions
                          </a>.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* MCP / Internal Tools card */}
                <div className={`flex rounded-xl border bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden transition-all ${mcpStatus?.connected ? "border-blue-100" : "border-gray-100"}`}>
                  {/* Left accent bar */}
                  <div className={`w-1 shrink-0 rounded-l-xl ${mcpStatus?.connected ? "bg-blue-500" : "bg-gray-100"}`} />

                  <div className="flex-1 px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        {/* Tools icon */}
                        <div className="mt-0.5 shrink-0 w-9 h-9 rounded-lg border border-gray-100 shadow-sm flex items-center justify-center"
                          style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #e8eeff 100%)" }}>
                          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke={process.env.NEXT_PUBLIC_COMPANY_COLOR || "#3B82F6"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-800">Internal Tools</p>
                            {mcpStatus === null ? (
                              <div className="h-4 w-16 rounded-full bg-gray-200 animate-pulse" />
                            ) : mcpStatus.connected ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-[10px] font-semibold text-blue-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                                Available
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-[10px] font-medium text-gray-400">
                                Not configured
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {mcpStatus?.connected
                              ? "Company knowledge base and internal tools are active."
                              : "Access to company data, workflows, and internal systems."}
                          </p>
                        </div>
                      </div>
                    </div>

                    {!mcpStatus?.connected && mcpStatus !== null && (
                      <div className="mt-3 pt-3 border-t border-gray-50">
                        <p className="text-[10px] text-gray-400">
                          Internal tools are configured by your server administrator via the <code className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">MCP_SERVER_URL</code> environment variable.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </section>
            )}

            {/* Advanced — standalone view, same pattern as Memory */}
            {activeSection === "advanced" && (
            <section id="advanced" className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Advanced</h2>
                <p className="text-xs text-gray-400 mt-0.5">Performance and cost optimisation settings.</p>
              </div>

              <div className="px-4 sm:px-6 py-5 space-y-6">

                {/* Prompt caching */}
                <div>
                  <div className="flex items-start justify-between gap-6 mb-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">Prompt caching</p>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Stores your system prompt and conversation history on Anthropic&apos;s servers between messages.
                        Cached tokens cost 10% of the normal price — saving up to 90% on repeated context.
                        Only applies to Anthropic models (Claude Sonnet, Haiku, Opus).
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={prefs.promptCaching}
                      onClick={() => {
                        if (prefs.promptCaching) {
                          setCachingWarnPending(true);
                        } else {
                          setPrefs((p) => ({ ...p, promptCaching: true }));
                          fetch("/api/preferences", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ promptCaching: true }),
                          });
                        }
                      }}
                      className={`mt-0.5 shrink-0 relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                        prefs.promptCaching ? "bg-gray-900" : "bg-gray-200 hover:bg-gray-300"
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                        prefs.promptCaching ? "translate-x-4" : "translate-x-0"
                      }`} />
                    </button>
                  </div>

                  {/* Disable warning */}
                  {cachingWarnPending && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
                      <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-800">This will increase your costs</p>
                        <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                          Without caching, every message re-sends your full system prompt and conversation history at full price.
                          Multi-turn conversations can cost up to 5× more. Only disable if you are seeing stale or incorrect responses.
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={async () => {
                              setCachingWarnPending(false);
                              setPrefs((p) => ({ ...p, promptCaching: false }));
                              await fetch("/api/preferences", {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ promptCaching: false }),
                              });
                            }}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Disable anyway
                          </button>
                          <button
                            onClick={() => setCachingWarnPending(false)}
                            className="px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-100 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Keep enabled
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Savings table */}
                  <div className="rounded-xl border border-gray-100 overflow-hidden text-xs">
                    <div className="grid grid-cols-4 bg-gray-50 px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                      <span>Conversation</span>
                      <span className="text-right">Without cache</span>
                      <span className="text-right">With cache</span>
                      <span className="text-right text-emerald-600">Saved</span>
                    </div>
                    {[
                      { label: "2 turns",   without: "$0.011", with: "$0.008", saved: "~29%" },
                      { label: "5 turns",   without: "$0.033", with: "$0.012", saved: "~64%" },
                      { label: "10 turns",  without: "$0.083", with: "$0.020", saved: "~76%" },
                      { label: "20 turns",  without: "$0.233", with: "$0.042", saved: "~82%" },
                    ].map((row) => (
                      <div key={row.label} className="grid grid-cols-4 px-4 py-2.5 border-t border-gray-50 text-gray-600">
                        <span className="font-medium text-gray-800">{row.label}</span>
                        <span className="text-right text-gray-400">{row.without}</span>
                        <span className="text-right">{row.with}</span>
                        <span className="text-right font-semibold text-emerald-600">{row.saved}</span>
                      </div>
                    ))}
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
                      <p className="text-[10px] text-gray-400">Estimates based on Claude Sonnet at $3/1M input tokens, ~1500-token system prompt, ~200 tokens per turn.</p>
                    </div>
                  </div>
                </div>

              </div>
            </section>
            )}

            {/* Tones */}
            {activeSection !== "memory" && activeSection !== "advanced" && activeSection !== "integrations" && (
            <section id="tones" className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Tones</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Custom writing styles the AI applies when active. Only one tone can be active at a time.
                  </p>
                </div>
                <button
                  onClick={() => setCreateToneOpen(true)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 hover:bg-gray-800 active:bg-gray-950 text-white transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  New tone
                </button>
              </div>

              <div className="px-4 sm:px-6 py-5">
                {tones.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">No tones yet</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Create a tone by pasting writing examples — the AI learns your style automatically.
                      </p>
                    </div>
                    <button
                      onClick={() => setCreateToneOpen(true)}
                      className="mt-1 px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
                    >
                      Create your first tone
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {tones.map((tone) => (
                      <div
                        key={tone._id}
                        className={`rounded-xl border transition-colors ${
                          tone.isActive
                            ? "border-gray-900 bg-gray-50"
                            : "border-gray-100 bg-white hover:border-gray-200"
                        }`}
                      >
                        <div className="px-4 py-3.5 flex items-start gap-3">
                          {/* Active dot */}
                          <div className={`mt-1 w-2 h-2 rounded-full shrink-0 transition-colors ${tone.isActive ? "bg-emerald-500" : "bg-gray-200"}`} />

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900">{tone.name}</span>
                              {tone.isActive && (
                                <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-100 text-[10px] font-bold text-emerald-600 uppercase tracking-wide">
                                  Active
                                </span>
                              )}
                            </div>
                            {tone.description && (
                              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{tone.description}</p>
                            )}
                            {tone.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {tone.tags.map((tag) => (
                                  <span key={tag} className="px-1.5 py-0.5 rounded-md bg-gray-100 text-[10px] font-medium text-gray-500">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            {tone.characteristics && (
                              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed line-clamp-2 italic">
                                {tone.characteristics}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="shrink-0 flex items-center gap-2.5 ml-2">
                            {/* Toggle */}
                            <button
                              onClick={() => handleToneToggle(tone._id, !tone.isActive)}
                              disabled={togglingTone === tone._id}
                              title={tone.isActive ? "Deactivate" : "Activate"}
                              className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                                tone.isActive ? "bg-gray-900" : "bg-gray-200 hover:bg-gray-300"
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                  tone.isActive ? "translate-x-4" : "translate-x-0"
                                }`}
                              />
                            </button>

                            {/* ⋯ menu */}
                            <div className="relative">
                              <button
                                onClick={() => setOpenToneMenuId(openToneMenuId === tone._id ? null : tone._id)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors cursor-pointer"
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
                                </svg>
                              </button>

                              {openToneMenuId === tone._id && (
                                <ToneMenu
                                  onEdit={() => { setEditingTone(tone); setOpenToneMenuId(null); }}
                                  onDelete={() => { handleToneDelete(tone._id); setOpenToneMenuId(null); }}
                                  deleting={deletingTone === tone._id}
                                  onClose={() => setOpenToneMenuId(null)}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
            )}

            {/* Memory */}
            {activeSection === "memory" && (
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
            )}

            {/* Usage */}
            {activeSection !== "memory" && activeSection !== "advanced" && activeSection !== "integrations" && (
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
                  {/* Spending limit */}
                  {(() => {
                    if (!usage.limit) {
                      return (
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center justify-between">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Spending limit</p>
                          <span className="text-xs font-medium text-gray-400">Unlimited</span>
                        </div>
                      );
                    }
                    const { limitUsd, period, currentSpendUsd, periodStart } = usage.limit;
                    const remaining = Math.max(limitUsd - currentSpendUsd, 0);
                    const pct = limitUsd > 0 ? Math.min((currentSpendUsd / limitUsd) * 100, 100) : 0;
                    const barColor = pct >= 100 ? "bg-red-500" : pct >= 90 ? "bg-red-400" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500";
                    const periodLabels: Record<string, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", total: "Total" };
                    const nextReset: Date | null = (() => {
                      const d = new Date(periodStart);
                      if (period === "daily")   { d.setDate(d.getDate() + 1); return d; }
                      if (period === "weekly")  { d.setDate(d.getDate() + 7); return d; }
                      if (period === "monthly") { d.setMonth(d.getMonth() + 1); return d; }
                      return null;
                    })();
                    return (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                            {periodLabels[period] ?? period} spending limit
                          </p>
                          <span className="text-xs font-semibold text-gray-700">
                            {formatCost(currentSpendUsd)} <span className="font-normal text-gray-400">/ {formatCost(limitUsd)}</span>
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-gray-400">
                            {pct >= 100
                              ? "Limit reached — messaging is paused until the period resets."
                              : nextReset
                              ? `Resets ${nextReset.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                              : "This limit does not reset."}
                          </p>
                          {pct < 100 && (
                            <p className="text-[11px] text-gray-500 font-medium">{formatCost(remaining)} remaining</p>
                          )}
                        </div>
                      </div>
                    );
                  })()}

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
            )}

          </div>
        </main>
      </div>

      {modalSection && (
        <AutofillModal
          section={modalSection}
          onClose={() => setModalSection(null)}
          onGenerate={(extra) => handleAutofill(modalSection, extra)}
        />
      )}

      {createToneOpen && (
        <CreateToneModal
          onClose={() => setCreateToneOpen(false)}
          onCreated={handleToneCreated}
        />
      )}

      {editingTone && (
        <CreateToneModal
          onClose={() => setEditingTone(null)}
          onCreated={handleToneCreated}
          editTone={editingTone}
        />
      )}
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
      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

function ToneMenu({ onEdit, onDelete, deleting, onClose }: {
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1.5 w-36 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-20 py-1"
    >
      <button
        onClick={onEdit}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer text-left"
      >
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Edit
      </button>
      <div className="mx-3 border-t border-gray-50" />
      <button
        onClick={onDelete}
        disabled={deleting}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors cursor-pointer text-left disabled:opacity-50"
      >
        {deleting ? (
          <svg className="w-3.5 h-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        )}
        {deleting ? "Deleting…" : "Delete"}
      </button>
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
  if (id === "tones")         return <svg className={cls} {...s}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>;
  if (id === "memory")        return <svg className={cls} {...s}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>;
  if (id === "usage")         return <svg className={cls} {...s}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>;
  if (id === "integrations")  return <svg className={cls} {...s}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;
  if (id === "advanced")      return <svg className={cls} {...s}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
  return null;
}
