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

  const { section } = await req.json() as { section: "profile" | "communication" | "email" | "signature" };

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

    const lines = [
      info.name,
      [info.title, info.company].filter(Boolean).join(" · "),
      [info.email, info.phone, info.website].filter(Boolean).join(" · "),
    ].filter(Boolean);

    return NextResponse.json({ signatureStyle: lines.join("\n") });
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
