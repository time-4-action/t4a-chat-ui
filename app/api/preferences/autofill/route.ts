import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserMemory } from "@/models/user-memory";
import { UserPreference } from "@/models/user-preference";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

const haiku = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })("claude-haiku-4-5-20251001");

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  interface Extra { instructions?: string; linkedin?: string; phone?: string; website?: string; location?: string; tagline?: string; }
  const { section, extra = {} } = await req.json() as { section: "profile" | "communication" | "email" | "signature"; extra?: Extra };

  await connectDB();
  const [memory, prefs] = await Promise.all([
    UserMemory.findOne({ userId: session.user.sub }),
    UserPreference.findOne({ userId: session.user.sub }),
  ]);

  const memoryContext = [
    memory?.workContext && `Work context: ${memory.workContext}`,
    memory?.personalContext && `Personal context: ${memory.personalContext}`,
    memory?.topOfMind && `Top of mind: ${memory.topOfMind}`,
    memory?.recentActivity && `Recent activity: ${memory.recentActivity}`,
  ].filter(Boolean).join("\n\n") || "No memory available yet.";

  let prompt = "";

  if (section === "profile") {
    prompt = `Based on the user's memory below, infer their profile information for an internal AI assistant.

Memory:
${memoryContext}

Return ONLY valid JSON with these exact keys (use empty string if unknown):
{"name":"...","jobTitle":"...","company":"...","roleDescription":"..."}

Guidelines:
- name: their real name if known
- jobTitle: their role/position
- company: the company they work at
- roleDescription: one short sentence describing what they do day-to-day`;

  } else if (section === "communication") {
    prompt = `Based on the user's memory below, suggest the most fitting communication style settings.

Memory:
${memoryContext}

Return ONLY valid JSON — pick exactly one value for each:
{"tone":"formal|casual|friendly|professional","formality":"high|medium|low"}

If unclear, default to "professional" tone and "medium" formality.`;

  } else if (section === "email") {
    prompt = `Based on the user's memory below, write 2 short realistic example emails that match their likely writing style and work context.

Memory:
${memoryContext}

Format each email as:
Subject: [subject line]

Hi [Name],

[2-3 sentence body]

---

Write both examples as plain text. No explanation before or after. Do not include any sign-off or signature — those are auto-appended.`;
  }

  // Append user-supplied extra context to any non-signature prompt
  if (prompt && extra.instructions?.trim()) {
    prompt += `\n\nAdditional context from the user: ${extra.instructions.trim()}`;
  }

  // Signature: extract info then build HTML server-side
  if (section === "signature") {
    const infoPrompt = `Extract the following details about this person from their memory. Return ONLY valid JSON.

Memory:
${memoryContext}

Also consider their saved profile:
Name: ${prefs?.personalInfo?.name || "unknown"}
Title: ${prefs?.personalInfo?.jobTitle || "unknown"}
Company: ${prefs?.personalInfo?.company || "unknown"}

Return JSON with these keys (empty string if unknown):
{"name":"...","title":"...","company":"...","website":"...","email":"...","phone":"..."}

- website: company or personal website URL if mentioned (without https://)
- email: their email address if mentioned
- phone: their phone number if mentioned`;

    const { text: infoText } = await generateText({ model: haiku, prompt: infoPrompt });

    let info = { name: "", title: "", company: "", website: "", email: "", phone: "" };
    try {
      const match = infoText.match(/\{[\s\S]*\}/);
      if (match) info = { ...info, ...JSON.parse(match[0]) };
    } catch { /* use defaults */ }

    // Merge with saved prefs (prefs win over memory extraction)
    if (prefs?.personalInfo?.name)      info.name    = prefs.personalInfo.name;
    if (prefs?.personalInfo?.jobTitle)  info.title   = prefs.personalInfo.jobTitle;
    if (prefs?.personalInfo?.company)   info.company = prefs.personalInfo.company;

    // Merge user-supplied extra contact details (explicit input wins over everything)
    if (extra.phone?.trim())    info.phone   = extra.phone.trim();
    if (extra.website?.trim())  info.website = extra.website.trim();

    const tone = prefs?.communicationStyle?.tone || "";
    const formality = prefs?.communicationStyle?.formality || "";
    return NextResponse.json({
      signatureStyle: buildSignatureHtml(info, tone, formality, {
        linkedin: extra.linkedin?.trim() || "",
        location: extra.location?.trim() || "",
        tagline:  extra.tagline?.trim()  || "",
        instructions: extra.instructions?.trim() || "",
      }),
    });
  }

  if (!prompt) return NextResponse.json({ error: "Invalid section" }, { status: 400 });

  const { text } = await generateText({ model: haiku, prompt });

  if (section === "profile" || section === "communication") {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error();
      return NextResponse.json(JSON.parse(match[0]));
    } catch {
      return NextResponse.json({ error: "Parse failed" }, { status: 500 });
    }
  }

  // email section — return raw text
  return NextResponse.json({ emailTemplates: text.trim() });
}

// ── Signature HTML builder ────────────────────────────────────────────────────

interface SigInfo {
  name: string; title: string; company: string;
  website: string; email: string; phone: string;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pickSignoff(tone: string, formality: string, instructions = ""): string {
  const lower = instructions.toLowerCase();
  // Honour explicit instruction hints
  if (lower.includes("kind regards")) return "Kind regards,";
  if (lower.includes("warm regards")) return "Warm regards,";
  if (lower.includes("best regards")) return "Best regards,";
  if (lower.includes("cheers"))       return "Cheers,";
  if (lower.includes("thanks"))       return "Thanks,";
  if (lower.includes("sincerely"))    return "Sincerely,";
  // Fall back to tone/formality
  if (formality === "high" || tone === "formal") return "Kind regards,";
  if (tone === "casual") return "Cheers,";
  if (tone === "friendly") return "Warm regards,";
  return "Best regards,";
}

interface SigExtras {
  linkedin: string;
  location: string;
  tagline: string;
  instructions: string;
}

function buildSignatureHtml(info: SigInfo, tone = "", formality = "", extras: SigExtras = { linkedin: "", location: "", tagline: "", instructions: "" }): string {
  const accent = process.env.NEXT_PUBLIC_COMPANY_COLOR || "#3b82f6";
  const signoff = pickSignoff(tone, formality, extras.instructions);
  const sep = ` <span style="color:#cbd5e1;font-family:Arial,sans-serif;">·</span> `;
  const rows: string[] = [];

  // ── Sign-off ──
  rows.push(
    `<p style="margin:0 0 14px 0;font-family:Arial,sans-serif;font-size:13px;color:#374151;">${esc(signoff)}</p>`
  );

  // ── Name ──
  if (info.name) {
    rows.push(
      `<p style="margin:0 0 2px 0;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#0f172a;line-height:1.3;">${esc(info.name)}</p>`
    );
  }

  // ── Title · Company ──
  const subtitle = [info.title, info.company].filter(Boolean).map(esc).join(sep);
  if (subtitle) {
    rows.push(
      `<p style="margin:0 0 2px 0;font-family:Arial,sans-serif;font-size:12px;color:#64748b;line-height:1.4;">${subtitle}</p>`
    );
  }

  // ── Tagline (italic, under title) ──
  if (extras.tagline) {
    rows.push(
      `<p style="margin:0 0 2px 0;font-family:Arial,sans-serif;font-size:11px;color:#94a3b8;font-style:italic;line-height:1.4;">${esc(extras.tagline)}</p>`
    );
  }

  // ── Location ──
  if (extras.location) {
    rows.push(
      `<p style="margin:0 0 10px 0;font-family:Arial,sans-serif;font-size:11px;color:#94a3b8;line-height:1.4;">${esc(extras.location)}</p>`
    );
  } else {
    // Ensure spacing before divider even without location
    rows[rows.length - 1] = rows[rows.length - 1].replace("margin:0 0 2px 0", "margin:0 0 10px 0");
  }

  // ── Divider ──
  rows.push(`<p style="margin:0 0 10px 0;border:none;border-top:1px solid #e2e8f0;padding:0;line-height:0;font-size:0;"> </p>`);

  // ── Contact links ──
  const contacts: string[] = [];
  if (info.email) {
    contacts.push(
      `<a href="mailto:${esc(info.email)}" style="color:${accent};text-decoration:none;font-family:Arial,sans-serif;">${esc(info.email)}</a>`
    );
  }
  if (info.phone) {
    const tel = info.phone.replace(/\s/g, "");
    contacts.push(
      `<a href="tel:${esc(tel)}" style="color:#64748b;text-decoration:none;font-family:Arial,sans-serif;">${esc(info.phone)}</a>`
    );
  }
  if (info.website) {
    const href = info.website.startsWith("http") ? info.website : `https://${info.website}`;
    const label = info.website.replace(/^https?:\/\//, "");
    contacts.push(
      `<a href="${esc(href)}" style="color:${accent};text-decoration:none;font-family:Arial,sans-serif;">${esc(label)}</a>`
    );
  }
  if (extras.linkedin) {
    const href = extras.linkedin.startsWith("http") ? extras.linkedin : `https://${extras.linkedin}`;
    const label = extras.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "").replace(/\/$/, "");
    contacts.push(
      `<a href="${esc(href)}" style="color:${accent};text-decoration:none;font-family:Arial,sans-serif;">LinkedIn${label ? ` / ${esc(label)}` : ""}</a>`
    );
  }
  if (contacts.length > 0) {
    rows.push(
      `<p style="margin:0;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;">${contacts.join(sep)}</p>`
    );
  }

  return rows.join("\n");
}
