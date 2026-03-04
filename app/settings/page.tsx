"use client";

import { useEffect, useState } from "react";

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

const defaultPrefs: Preferences = {
  personalInfo: { name: "", jobTitle: "", company: "", roleDescription: "" },
  communicationStyle: { tone: "", formality: "", signatureStyle: "" },
  emailTemplates: "",
  customInstructions: "",
};

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setPrefs({
            personalInfo: { ...defaultPrefs.personalInfo, ...data.personalInfo },
            communicationStyle: { ...defaultPrefs.communicationStyle, ...data.communicationStyle },
            emailTemplates: data.emailTemplates ?? "",
            customInstructions: data.customInstructions ?? "",
          });
        }
      })
      .catch(console.error);
  }, []);

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
    } catch {
      setSaveState("error");
    }
    setTimeout(() => setSaveState("idle"), 3000);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Personalise how the AI communicates with you and on your behalf.
          </p>
        </div>

        <div className="space-y-6">

          {/* Personal Info */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Personal Info</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name">
                <input
                  type="text"
                  value={prefs.personalInfo.name}
                  onChange={(e) => setPersonalInfo("name", e.target.value)}
                  placeholder="Grega Repič"
                  className={inputClass}
                />
              </Field>
              <Field label="Job Title">
                <input
                  type="text"
                  value={prefs.personalInfo.jobTitle}
                  onChange={(e) => setPersonalInfo("jobTitle", e.target.value)}
                  placeholder="CEO"
                  className={inputClass}
                />
              </Field>
              <Field label="Company">
                <input
                  type="text"
                  value={prefs.personalInfo.company}
                  onChange={(e) => setPersonalInfo("company", e.target.value)}
                  placeholder="Time 4 Action"
                  className={inputClass}
                />
              </Field>
              <Field label="Role Description">
                <input
                  type="text"
                  value={prefs.personalInfo.roleDescription}
                  onChange={(e) => setPersonalInfo("roleDescription", e.target.value)}
                  placeholder="I manage operations and client relations"
                  className={inputClass}
                />
              </Field>
            </div>
          </section>

          {/* Communication Style */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Communication Style</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Tone">
                <select
                  value={prefs.communicationStyle.tone}
                  onChange={(e) => setStyle("tone", e.target.value)}
                  className={inputClass}
                >
                  <option value="">— select —</option>
                  <option value="formal">Formal</option>
                  <option value="casual">Casual</option>
                  <option value="friendly">Friendly</option>
                  <option value="professional">Professional</option>
                </select>
              </Field>
              <Field label="Formality">
                <select
                  value={prefs.communicationStyle.formality}
                  onChange={(e) => setStyle("formality", e.target.value)}
                  className={inputClass}
                >
                  <option value="">— select —</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </Field>
              <Field label="Email Signature" className="sm:col-span-2">
                <input
                  type="text"
                  value={prefs.communicationStyle.signatureStyle}
                  onChange={(e) => setStyle("signatureStyle", e.target.value)}
                  placeholder="Best regards, Grega"
                  className={inputClass}
                />
              </Field>
            </div>
          </section>

          {/* Email Templates */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-1">Email Style Examples</h2>
            <p className="text-xs text-slate-400 mb-4">
              Paste 1–3 of your typical emails so the AI can learn your style.
            </p>
            <textarea
              value={prefs.emailTemplates}
              onChange={(e) => setPrefs((p) => ({ ...p, emailTemplates: e.target.value }))}
              rows={8}
              placeholder={"Subject: Follow-up on your order\n\nHi [Name],\n\nJust wanted to check in on your recent order..."}
              className={`${inputClass} resize-none font-mono text-xs`}
            />
          </section>

          {/* Custom Instructions */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-1">Custom Instructions</h2>
            <p className="text-xs text-slate-400 mb-4">
              Anything specific the AI should always keep in mind.
            </p>
            <textarea
              value={prefs.customInstructions}
              onChange={(e) => setPrefs((p) => ({ ...p, customInstructions: e.target.value }))}
              rows={4}
              placeholder="E.g. Always reply in Slovenian, never use bullet points, keep emails short..."
              className={`${inputClass} resize-none`}
            />
          </section>

          {/* Save */}
          <div className="flex items-center justify-end gap-3 pb-8">
            {saveState === "saved" && (
              <span className="text-sm text-emerald-600 font-medium">Preferences saved.</span>
            )}
            {saveState === "error" && (
              <span className="text-sm text-red-500 font-medium">Failed to save. Try again.</span>
            )}
            <button
              onClick={handleSave}
              disabled={saveState === "saving"}
              className="px-6 py-2.5 rounded-xl bg-[#0f172a] hover:bg-slate-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saveState === "saving" ? "Saving…" : "Save preferences"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
